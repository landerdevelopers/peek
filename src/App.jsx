import { useEffect, useRef, useState } from "react";
import Panel from "./Panel.jsx";
import BubbleStrip from "./BubbleStrip.jsx";
import SelectionPopup from "./SelectionPopup.jsx";
import ImageOcrPanel from "./ImageOcrPanel.jsx";
import RecordHotkey from "./RecordHotkey.jsx";
import { OCR_PROMPT } from "./prompts.js";
import { anchorRefineUi, REFINE_UI_SIZES } from "./refinePosition.js";
import { IconClose, IconPeek, IconSparkle } from "./Icons.jsx";

import { BACKEND_KEY, resolveBackend, getModel, INSTALL_CLI_MESSAGE } from "./backends.js";
import BackendsModal from "./BackendsModal.jsx";
import { loadPlatformInfo } from "./accelFormat.js";

const MIN_DRAG = 6; // px — below this a click is treated as a miss-click, not a selection
const BUBBLE_SIZE = 52;
const BUBBLE_PULL = 11; // px the docked tab slides outward on hover — "pulled stripe" feel
const BUBBLE_DRAG_THRESHOLD = 3; // px — below this a bubble mousedown+up is a click, not a drag
const BUBBLE_POS_KEY = "peek-bubble-pos"; // persists across restarts so the bubble stays where you left it
const BUBBLE_EDGE_MARGIN = 16; // px kept between the bubble and the top/bottom while sliding along an edge

// Stacking order inside the overlay — crop/dim layers stay well below the
// chat bar so the full-screen dim never paints over the composer in image mode.
const Z = {
  PICK_DIM: 18,
  CROP_DIM: 22,
  DRAG_DIM: 26,
  // While a chat bar is open the bubble tucks below it, so an overlapping
  // bubble never paints over the composer; it returns to BUBBLE (topmost)
  // when the panel is minimized or closed.
  BUBBLE_TUCKED: 45,
  IMAGE_CLOSE: 50,
  PANEL: 52,
  REFINE: 54,
  BUBBLE: 60,
};

// The bubble is never freely positioned — it always rests flush against the
// left or right edge (whichever the drag ended closer to), docked like a tab
// tucked into the corner rather than a free-floating circle, sliding along
// that edge vertically. Takes a raw {x,y} (e.g. wherever a drag happened to
// end, or a stale/out-of-bounds value loaded from a previous window size) and
// returns the nearest valid snapped position, flush to the chosen edge.
function snapToSide(x, y) {
  const onLeft = x + BUBBLE_SIZE / 2 < window.innerWidth / 2;
  const snappedX = onLeft ? 0 : window.innerWidth - BUBBLE_SIZE;
  const clampedY = Math.min(Math.max(y, BUBBLE_EDGE_MARGIN), window.innerHeight - BUBBLE_SIZE - BUBBLE_EDGE_MARGIN);
  return { x: snappedX, y: clampedY };
}

function loadBubblePos() {
  try {
    const raw = localStorage.getItem(BUBBLE_POS_KEY);
    if (raw) {
      const pos = JSON.parse(raw);
      return snapToSide(pos.x, pos.y);
    }
  } catch {}
  return snapToSide(window.innerWidth - BUBBLE_SIZE - 24, window.innerHeight - BUBBLE_SIZE - 88);
}

// `animate` is off by default: this mask tracks a live drag, so easing its
// position/size makes the selection box visibly chase the cursor with a lag.
// Only enable the transition when the rect changes on its own (not per frame).
function SpotlightMask({ rect, zIndex = 35, dim = 0.78, animate = false }) {
  if (!rect || rect.width < 1 || rect.height < 1) return null;
  const maskTransition = animate
    ? "left 0.22s cubic-bezier(0.22, 1, 0.36, 1), top 0.22s cubic-bezier(0.22, 1, 0.36, 1), width 0.22s cubic-bezier(0.22, 1, 0.36, 1), height 0.22s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.22s ease"
    : "none";
  return (
    <>
      <div style={{
        position: "fixed", left: rect.x, top: rect.y, width: rect.width, height: rect.height,
        boxShadow: `0 0 0 9999px rgba(0,0,0,${dim})`, pointerEvents: "none", zIndex,
        transition: maskTransition,
      }} />
      <div style={{
        position: "fixed", left: rect.x, top: rect.y, width: rect.width, height: rect.height,
        border: "2px solid #D8B4FE", borderRadius: 0,
        boxShadow: "0 0 0 1px rgba(216,180,254,0.35), inset 0 0 0 1px rgba(255,255,255,0.15)",
        pointerEvents: "none", zIndex: zIndex + 1,
        transition: maskTransition,
      }} />
    </>
  );
}

// Shows the frozen crop PNG at the selection rect — not a live desktop hole.
// Stays accurate after the user alt-tabs away or minimizes and comes back.
function FrozenCropOverlay({ crop, zIndex = 34, dim = 0.78 }) {
  if (!crop?.previewDataUrl) return null;
  const rect = crop.rect;
  const frameTransition = "left 0.22s cubic-bezier(0.22, 1, 0.36, 1), top 0.22s cubic-bezier(0.22, 1, 0.36, 1), width 0.22s cubic-bezier(0.22, 1, 0.36, 1), height 0.22s cubic-bezier(0.22, 1, 0.36, 1)";
  const borderStyle = {
    position: "fixed", pointerEvents: "none", zIndex: zIndex + 2,
    border: "2px solid #D8B4FE", borderRadius: 0,
    boxShadow: "0 0 0 1px rgba(216,180,254,0.35), inset 0 0 0 1px rgba(255,255,255,0.15)",
    transition: frameTransition,
  };

  if (!rect || rect.width < 1 || rect.height < 1) {
    return (
      <>
        <img
          src={crop.previewDataUrl}
          alt=""
          style={{
            position: "fixed", inset: 0, width: "100%", height: "100%",
            objectFit: "cover", pointerEvents: "none", zIndex,
          }}
        />
        <div style={{ position: "fixed", inset: 0, background: `rgba(0,0,0,${dim * 0.45})`, pointerEvents: "none", zIndex: zIndex + 1 }} />
        <div style={{ ...borderStyle, inset: 0 }} />
      </>
    );
  }

  return (
    <>
      <div style={{ position: "fixed", inset: 0, background: `rgba(0,0,0,${dim})`, pointerEvents: "none", zIndex }} />
      <img
        src={crop.previewDataUrl}
        alt=""
        style={{
          position: "fixed", left: rect.x, top: rect.y, width: rect.width, height: rect.height,
          objectFit: "fill", pointerEvents: "none", zIndex: zIndex + 1,
          transition: frameTransition,
        }}
      />
      <div style={{ ...borderStyle, left: rect.x, top: rect.y, width: rect.width, height: rect.height }} />
    </>
  );
}

/**
 * Peek's overlay state machine. `mode` is one of:
 *   idle    — fully off. Nothing rendered, bubble hidden. Only the hotkey
 *             (or tray "Ask about screen") gets out of this state.
 *   bubble  — Peek's tab is on screen. When armed, hovering slides out the
 *             mode strip and selection/refine/capture work. When dormant
 *             (grayscale), the tab stays visible but features are off — click
 *             it to arm again. Clicking while armed dismisses to dormant.
 *   picking — chose "Image": a modal dim/crosshair capture screen. Drag a
 *             region or press Enter for full screen; Esc cancels back to bubble.
 *   panel   — Panel is open (image/text/voice sub-mode is `overlayMode`).
 *   record  — the tray's "Change hotkey…" flow (RecordHotkey).
 *
 * The hotkey toggles armed vs dormant when the bubble is visible, or shows it
 * armed on first press (see main.cjs activatePeek / standDownPeek).
 */
export default function App() {
  const [mode, setMode] = useState("idle");
  const [armed, setArmed] = useState(false);
  const [overlayMode, setOverlayMode] = useState("image"); // image | text | voice
  const [isMac, setIsMac] = useState(false); // drives ⌘ vs Ctrl for the in-overlay arrow shortcuts + hints
  const [pickerImg, setPickerImg] = useState(null);
  const [ocrPanel, setOcrPanel] = useState(null); // null | { busy: true } | { text: string }
  const [saveShotBusy, setSaveShotBusy] = useState(false);
  const modeRef = useRef(mode);
  const [panelData, setPanelData] = useState(null);
  const [initialQuestion, setInitialQuestion] = useState(null); // preset first question for a Text starter (e.g. "Summarize")
  const [drag, setDrag] = useState(null); // {startX,startY,x,y,w,h} while actively dragging a selection
  // CSS-px rect of the last completed region selection — null means "whole
  // screen", which is what the glowing frame hugs by default. Re-dragging
  // replaces this so the frame reshapes to the new region.
  const [selectionRect, setSelectionRect] = useState(null);
  // Frozen crop snapshots for the active image chat — one entry per crop/re-crop.
  const [cropHistory, setCropHistory] = useState([]);
  const [activeCropIndex, setActiveCropIndex] = useState(0);
  // Latest text actually grabbed (via peek:grab-selection, on a "Refine"
  // click) — replaced wholesale on each new grab. Rendered by
  // SelectionPopup, a sibling of Panel — this works regardless of `mode`.
  const [selectedText, setSelectedText] = useState(null);
  // CSS-px position (already converted from physical screen coords by
  // main.cjs) of where that selection was made — anchors SelectionPopup.
  const [selectionPos, setSelectionPos] = useState(null);
  // Pill shows immediately; cleared below if the grab finds no real selection.
  const [pendingSelectionPos, setPendingSelectionPos] = useState(null);
  // Set when a Refine click fails to actually grab anything (e.g. nothing
  // was really selected, or Windows blocked refocusing the source window) —
  // shown briefly in place of the pill instead of just silently doing nothing.
  const [grabError, setGrabError] = useState(null);
  const draggingRef = useRef(false);
  // Live drag rect, kept in a ref so mouseup can read the final size
  // synchronously (distinguish a real drag-select from a plain click) without
  // racing the setDrag state update.
  const dragRef = useRef(null);
  // Click-through state: true = forwarding clicks to whatever's underneath
  // (so drag-selecting/selecting-elsewhere works), false = Peek's own UI
  // currently has the cursor and should receive clicks normally. Mirrors
  // main.cjs's overlayWin.setIgnoreMouseEvents so we only call across IPC on
  // an actual change, not every mousemove.
  const clickThroughRef = useRef(true);
  // Last known mouse position (updated on every mousemove, regardless of
  // mode) — lets the click-through effect below re-run its hit-test
  // immediately against wherever the cursor already is, instead of only
  // reacting to the *next* mousemove. Without this, toggling the bubble
  // twice in place (no mouse movement between clicks) leaves click-through
  // stuck from the first toggle, and the second click falls straight
  // through to whatever's underneath.
  const lastMousePosRef = useRef({ x: -1, y: -1 });
  // Minimized-to-bubble: instead of ending the session outright (which would
  // throw away the thread/capture and force starting over via the bubble
  // menu), clicking outside or pressing Escape collapses an open panel down
  // to just the bubble. Panel itself stays mounted the entire time — it just
  // renders nothing while minimized — so all its internal state (thread,
  // input) survives untouched until you click the bubble to expand back.
  const [minimized, setMinimized] = useState(false);
  // Pin: keeps the composer fully expanded (and click-through disabled over
  // it) even after OS focus moves to another app — see the click-through
  // effect below. Independent of `minimized`/mode; reset on every fresh
  // session so it's a deliberate per-session choice, not a sticky default.
  const [pinned, setPinned] = useState(false);
  // Mirrors main.cjs's overlayWin blur/focus events — used by Panel for
  // auto-minimize when unpinned and the user switches to another app.
  const [hasOsFocus, setHasOsFocus] = useState(true);
  // Reported by Panel (thread/input/busy) — an empty, never-used panel gets
  // ended by a bubble click instead of just toggled hidden; a real one only
  // ever gets revealed, never hidden, by the same click (see onMouseUp).
  const [panelHasContent, setPanelHasContent] = useState(false);
  const [panelBusy, setPanelBusy] = useState(false);
  const [answerReady, setAnswerReady] = useState(false);
  const [panelKey, setPanelKey] = useState(0);
  const [refineKey, setRefineKey] = useState(0);
  // Refine popup minimize (mirrors the chat panel): an outside click / the
  // minimize button tucks a real answer away to a small restorable pill instead
  // of destroying it. refineProtect is true once there's an answer/chat worth
  // protecting — the transient quick-action palette still dismisses on an
  // outside click.
  const [refineMinimized, setRefineMinimized] = useState(false);
  const [refineProtect, setRefineProtect] = useState(false);
  // Standalone "Manage AI backends & keys" modal, opened from the composer's
  // backend picker — the same provider management that lives in the dashboard's
  // Settings, surfaced right from the chat bar.
  const [showBackends, setShowBackends] = useState(false);
  const [bubblePos, setBubblePos] = useState(loadBubblePos);
  // The close (×) badge only shows while actually hovering the bubble —
  // mouseenter/mouseleave (not mouseover/mouseout) so hovering the badge
  // itself, a child of the bubble div, doesn't flicker it away.
  const [bubbleHovered, setBubbleHovered] = useState(false);
  const bubbleDragRef = useRef(null); // {startX, startY, origX, origY, moved} while dragging the bubble
  // Small grace period on hover-out so moving the cursor from the bubble
  // across the gap into the mode strip (and between the strip's own buttons)
  // doesn't flicker it shut — cancelled the instant the cursor re-enters
  // either the bubble or the strip.
  const hoverTimerRef = useRef(null);

  const forceInteractive = () => {
    clickThroughRef.current = false;
    window.peekDesktop?.setClickThrough(false);
  };

  const openHover = () => {
    if (!armed) return;
    if (hoverTimerRef.current) { clearTimeout(hoverTimerRef.current); hoverTimerRef.current = null; }
    setBubbleHovered(true);
  };
  const closeHoverSoon = () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => { setBubbleHovered(false); hoverTimerRef.current = null; }, 180);
  };

  useEffect(() => { modeRef.current = mode; }, [mode]);
  const armedRef = useRef(armed);
  useEffect(() => { armedRef.current = armed; }, [armed]);

  useEffect(() => {
    try { localStorage.setItem(BUBBLE_POS_KEY, JSON.stringify(bubblePos)); } catch {}
  }, [bubblePos]);

  // A fresh session's worth of resets — shared by onActivate (hotkey/tray
  // arms Peek) and endPanel (Panel's Close button ends the current session
  // but leaves Peek active). Deliberately does NOT touch `mode` itself —
  // callers set that to whatever's appropriate for them.
  const resetSession = () => {
    setPanelData(null);
    setPickerImg(null);
    setSelectionRect(null);
    setSelectedText(null);
    setSelectionPos(null);
    setPendingSelectionPos(null);
    setGrabError(null);
    setDrag(null);
    setOcrPanel(null);
    setMinimized(false);
    setPinned(false);
    setHasOsFocus(true);
    setInitialQuestion(null);
    setPanelHasContent(false);
    setPanelBusy(false);
    setAnswerReady(false);
    setCropHistory([]);
    setActiveCropIndex(0);
  };

  const addCrop = (res, rect) => {
    const crop = {
      rect,
      imagePath: res.imagePath,
      thumbDataUrl: res.thumbDataUrl,
      previewDataUrl: res.previewDataUrl || res.thumbDataUrl,
    };
    setCropHistory((history) => {
      const next = [...history, crop];
      setActiveCropIndex(next.length - 1);
      return next;
    });
    setPanelData({
      imagePath: res.imagePath,
      thumbDataUrl: res.thumbDataUrl,
      previewDataUrl: crop.previewDataUrl,
    });
    setSelectionRect(rect);
  };

  const selectCrop = (index) => {
    const crop = cropHistory[index];
    if (!crop) return;
    setActiveCropIndex(index);
    setPanelData({
      imagePath: crop.imagePath,
      thumbDataUrl: crop.thumbDataUrl,
      previewDataUrl: crop.previewDataUrl,
    });
    setSelectionRect(crop.rect);
  };

  // The crop's × just drops the current selection — it does NOT close Peek.
  // Clearing the crop/selection leaves image mode open with no active crop, so
  // the frozen-crop frame disappears and the composer falls back to its default
  // bottom-center slot (computeImagePanelLayout returns that when rect is null),
  // ready to drag a fresh region. A pending screenshot is dropped so the next
  // crop re-grabs the current screen.
  const clearImageCrop = () => {
    setPickerImg(null);
    setPanelData(null);
    setSelectionRect(null);
    setCropHistory([]);
    setActiveCropIndex(0);
    setOcrPanel(null);
  };

  // One overlay session at a time — starting Image/Text/Voice/Refine replaces
  // whatever panel or refine flow is open (including minimized background work).
  const replaceActiveSession = () => {
    const hasPanel = mode === "panel";
    const hasRefine = !!selectedText;
    if (!hasPanel && !hasRefine) return;
    window.peekDesktop.endSession?.();
    resetSession();
    if (mode === "panel") setMode("bubble");
    setPanelKey((k) => k + 1);
    setRefineKey((k) => k + 1);
  };

  const handleAnswerReady = ({ question, error }) => {
    setAnswerReady(true);
    const preview = question.length > 60 ? `${question.slice(0, 60)}…` : question;
    window.peekDesktop.notify?.({
      title: error ? "Peek — couldn't get an answer" : "Peek — answer ready",
      body: error ? preview : `Tap to view: "${preview}"`,
    });
  };

  const standDown = () => {
    setBubbleHovered(false);
    window.peekDesktop.endSession?.();
    resetSession();
    if (modeRef.current === "picking") setPickerImg(null);
    setMode("bubble");
    setArmed(false);
  };

  const armPeek = () => {
    setArmed(true);
    clickThroughRef.current = true;
    window.peekDesktop.setClickThrough(true);
  };

  const standDownRef = useRef(standDown);
  standDownRef.current = standDown;
  const armPeekRef = useRef(armPeek);
  armPeekRef.current = armPeek;

  const restoreMinimizedPanel = () => {
    if (mode === "panel" && minimized) {
      setMinimized(false);
      setAnswerReady(false);
    }
    setBubbleHovered(false);
  };
  // Held in a ref because the onRestorePanel IPC handler is registered once (in
  // the mount-only effect below); calling it directly would capture a stale
  // closure that always sees the first render's mode/minimized, so the global
  // Ctrl+↑ restore would silently no-op. Same pattern as standDownRef/armPeekRef.
  const restoreMinimizedPanelRef = useRef(restoreMinimizedPanel);
  restoreMinimizedPanelRef.current = restoreMinimizedPanel;

  useEffect(() => {
    if (!window.peekDesktop) return;
    const offActivate = window.peekDesktop.onActivate?.(() => {
      resetSession();
      setArmed(true);
      setMode("bubble");
      clickThroughRef.current = true;
      window.peekDesktop.setClickThrough(true);
    });
    const offDeactivate = window.peekDesktop.onDeactivate?.(() => {
      resetSession();
      setArmed(false);
      setMode("idle");
    });
    const offStandDown = window.peekDesktop.onStandDown?.(() => standDownRef.current?.());
    const offArm = window.peekDesktop.onArm?.(() => armPeekRef.current?.());
    // main.cjs's noteSelectionPending already grabs the clipboard eagerly
    // (has to — see its own comment on why waiting for a Refine click would
    // hit Windows' anti-focus-stealing protection) — grabSelection() below
    // just retrieves what was already grabbed, no fresh clipboard access.
    const offSelectionPending = window.peekDesktop.onSelectionPending?.((data) => {
      if (!armedRef.current) return;
      if (data?.x == null) return;
      setPendingSelectionPos({ x: data.x, y: data.y });
    });
    // A plain click elsewhere (main.cjs's onSelectionMouseUp) almost always
    // means whatever was selected before just got deselected — only
    // meaningful before a Refine click (an already-open quick-actions
    // popup/answer is left alone; see App.jsx's onMouseDown for that dismissal).
    const offSelectionCleared = window.peekDesktop.onSelectionCleared?.(() => {
      if (!armedRef.current) return;
      setPendingSelectionPos(null);
    });
    const offRecord = window.peekDesktop.onRecord(() => setMode("record"));
    const offOverlayBlur = window.peekDesktop.onOverlayBlur?.(() => setHasOsFocus(false));
    const offOverlayFocus = window.peekDesktop.onOverlayFocus?.(() => setHasOsFocus(true));
    const offRestorePanel = window.peekDesktop.onRestorePanel?.(() => restoreMinimizedPanelRef.current?.());
    const offOpenImage = window.peekDesktop.onOpenImage?.(() => chooseImageRef.current?.());
    const offOpenText = window.peekDesktop.onOpenText?.(() => chooseTextRef.current?.());
    return () => {
      offActivate?.(); offDeactivate?.(); offStandDown?.(); offArm?.();
      offSelectionPending?.(); offSelectionCleared?.(); offRecord();
      offOverlayBlur?.(); offOverlayFocus?.(); offRestorePanel?.();
      offOpenImage?.(); offOpenText?.();
    };
  }, []);

  useEffect(() => {
    window.peekDesktop.setArmed?.(armed);
  }, [armed]);

  // "Refine" pill click — the one moment Peek actually simulates Ctrl+C into
  // the source window. Clears the pill either way (success or failure) so a
  // blocked grab doesn't leave a dead button sitting on screen; a failure
  // surfaces briefly instead of just silently doing nothing.
  const grabSelection = async () => {
    const pos = pendingSelectionPos;
    setPendingSelectionPos(null);
    // Refine is independent of the main chat — starting one must NOT end/collapse
    // an open or minimized chat panel (they're different things and coexist).
    // Setting selectedText/selectionPos + bumping refineKey below already
    // replaces any *previous* refine popup, which is all we need to reset here.
    const res = await window.peekDesktop.grabSelection?.();
    if (res?.text) {
      setSelectedText(res.text);
      setSelectionPos(pos);
      setRefineMinimized(false);
      setRefineProtect(false);
      setRefineKey((k) => k + 1);
      return;
    }
    setGrabError({ pos, message: res?.error || "Couldn't grab that selection." });
    setTimeout(() => setGrabError(null), 2200);
  };

  const clearRefineSession = () => {
    setSelectedText(null);
    setSelectionPos(null);
    setRefineMinimized(false);
    setRefineProtect(false);
    setRefineKey((k) => k + 1);
  };

  const refineSessionActive = !!selectedText && !!selectionPos;
  // "Visible" = the full popup is up (not tucked to the pill). Drives the
  // full-interactive click-through override; a minimized refine falls back to
  // per-pixel hit-testing so only the pill captures clicks.
  const selectionPopupVisible = refineSessionActive && !refineMinimized;
  const ocrPanelOpen = !!ocrPanel;

  // Image-mode panel needs the full-screen backdrop for drag-to-reselect; every
  // other panel state (minimal bar, text/voice chat, pinned-and-blurred) uses
  // per-pixel click-through so the rest of the desktop stays usable.
  const panelNeedsFullCapture = mode === "panel" && overlayMode === "image" && !minimized;

  // Hit-tests a specific point against Peek's own UI (anything tagged
  // data-peek-ui) and updates click-through accordingly — shared by the
  // mousemove handler below and the state-driven effect that follows, so the
  // effect can re-run the *exact* same check immediately against the last
  // known cursor position instead of only reacting to the next mousemove.
  const refreshClickThroughAtPoint = (x, y) => {
    if (x < 0 && y < 0) return; // no mouse position observed yet this session
    const el = document.elementFromPoint(x, y);
    const overOwnUI = !!el?.closest('[data-peek-ui="true"]');
    const shouldBeClickThrough = !overOwnUI;
    if (shouldBeClickThrough !== clickThroughRef.current) {
      clickThroughRef.current = shouldBeClickThrough;
      window.peekDesktop.setClickThrough(shouldBeClickThrough);
    }
  };

  // Forces click-through state as a function of app state, rather than
  // relying solely on the next mousemove to notice a change.
  //
  // Cases where the answer is unambiguous, forced immediately:
  //  - the selection popup is showing: fully interactive the whole time (it
  //    owns all mouse input until dismissed), regardless of mode
  //  - the modal capture screen is up: fully interactive
  //  - image-mode panel with a live selection frame: full backdrop for re-crop
  // Everything else (bubble, minimal panel bar, text/voice chat) uses per-pixel
  // hit-testing below — only Peek's own UI elements capture clicks.
  useEffect(() => {
    if (mode === "record") return;
    const unambiguous = selectionPopupVisible || ocrPanelOpen || mode === "picking" || panelNeedsFullCapture || showBackends;
    if (unambiguous) {
      if (clickThroughRef.current !== false) {
        forceInteractive();
      }
      return;
    }
    refreshClickThroughAtPoint(lastMousePosRef.current.x, lastMousePosRef.current.y);
  }, [selectionPopupVisible, ocrPanelOpen, mode, minimized, panelNeedsFullCapture, bubbleHovered, showBackends]);

  // --- Bubble menu choices -------------------------------------------------

  // Image mode opens exactly like Text mode — a normal chat modal, no
  // full-screen dim, no crosshair, and crucially no screenshot grab up front
  // (so entering/switching never blinks). The screen is captured lazily at
  // crop time (onMouseUp), while the chatbar is already hidden by the drag.
  const chooseImage = () => {
    setBubbleHovered(false);
    replaceActiveSession();
    forceInteractive();
    setPickerImg(null);
    setPanelData(null);
    setSelectionRect(null);
    setMinimized(false);
    setPinned(false);
    setHasOsFocus(true);
    setInitialQuestion(null);
    setOverlayMode("image");
    setMode("panel");
  };

  const chooseImageRef = useRef(chooseImage);
  chooseImageRef.current = chooseImage;

  const chooseText = () => {
    setBubbleHovered(false);
    replaceActiveSession();
    setOverlayMode("text");
    setPanelData(null);
    setPickerImg(null);
    setSelectionRect(null);
    setMinimized(false);
    setPinned(false);
    setHasOsFocus(true);
    setInitialQuestion(null);
    setMode("panel");
  };

  const chooseTextRef = useRef(chooseText);
  chooseTextRef.current = chooseText;

  const extractTextFromCrop = async () => {
    if (ocrPanel?.busy || !panelData?.imagePath) return;
    const { available = [] } = await window.peekDesktop.listBackends?.() || {};
    const backend = resolveBackend(localStorage.getItem(BACKEND_KEY), available);
    if (!backend) {
      window.peekDesktop.notify?.({
        title: "Peek — no CLI installed",
        body: INSTALL_CLI_MESSAGE,
      });
      return;
    }
    setOcrPanel({ busy: true });
    const res = await window.peekDesktop.ask({
      imagePath: panelData.imagePath,
      thumbDataUrl: panelData.thumbDataUrl,
      question: OCR_PROMPT,
      history: [],
      backend,
      model: getModel(backend),
    });
    if (res?.error || !res?.text?.trim()) {
      setOcrPanel(null);
      window.peekDesktop.notify?.({
        title: "Peek — couldn't read text",
        body: res?.error || "No text found in that area.",
      });
      return;
    }
    setOcrPanel({ text: res.text.trim() });
  };

  const saveScreenshotFromCrop = async () => {
    if (saveShotBusy || !panelData?.imagePath) return;
    setSaveShotBusy(true);
    try {
      const res = await window.peekDesktop.saveScreenshot?.(panelData.imagePath);
      if (res?.canceled) return;
      if (res?.error) {
        window.peekDesktop.notify?.({ title: "Peek — couldn't save screenshot", body: res.error });
        return;
      }
      const name = res.savedPath?.split(/[/\\]/).pop() || "screenshot";
      window.peekDesktop.notify?.({ title: "Peek — screenshot saved", body: name });
    } finally {
      setSaveShotBusy(false);
    }
  };

  // In-panel quick switch — text, image, and voice all swap in place on the
  // same Panel shell; width eases between compact voice (186px) and text (380px).
  const switchMode = (m) => {
    if (mode === "panel" && m === overlayMode) return;
    if (mode === "panel") {
      setPickerImg(null);
      setPanelData(null);
      setSelectionRect(null);
      setMinimized(false);
      setOverlayMode(m);
      return;
    }
    if (m === "image") chooseImage();
    else if (m === "voice") chooseVoice();
    else chooseText();
  };

  const chooseVoice = () => {
    setBubbleHovered(false);
    replaceActiveSession();
    setOverlayMode("voice");
    setPanelData(null);
    setPickerImg(null);
    setSelectionRect(null);
    setMinimized(false);
    setPinned(false);
    setHasOsFocus(true);
    setInitialQuestion(null);
    setMode("panel");
  };

  // --- Picking (modal capture) ---------------------------------------------

  const cancelPicking = () => {
    setPickerImg(null);
    setDrag(null);
    setMode("bubble");
  };

  const confirmFullScreen = async () => {
    forceInteractive();
    const res = await (window.__peekTestSelect || window.peekDesktop.select)({ mode: "full" });
    if (!res?.error) {
      addCrop(res, null);
      setMinimized(false);
      setOverlayMode("image");
      setMode("panel");
    }
  };

  // Enter confirms full-screen while picking — Escape is handled by the
  // centralized keydown effect below, alongside every other "back out of
  // this" case, so precedence between it and SelectionPopup/Panel stays in
  // one place instead of racing multiple independent listeners.
  useEffect(() => {
    if (mode !== "picking") return;
    const onKey = (e) => { if (e.key === "Enter") confirmFullScreen(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Escape's precedence, most-specific-first: dismiss the selection popup if
  // one is open (it's the most recently-opened, most specific thing on
  // screen regardless of what else is going on); else back out of the
  // bubble menu or the modal capture screen; else minimize an expanded
  // panel. A single Escape press only ever does ONE of these — previously
  // SelectionPopup and Panel each had their own independent `window`
  // listener, so a single press with both open would fire both at once.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (showBackends) { setShowBackends(false); return; }
      if (ocrPanel) { setOcrPanel(null); return; }
      // Refine: first Escape tucks a real answer to the pill (preserved), a
      // second closes it; the quick-action palette (nothing to protect) closes.
      if (refineSessionActive) {
        if (!refineMinimized && refineProtect) { setRefineMinimized(true); return; }
        clearRefineSession(); return;
      }
      if (bubbleHovered && mode === "bubble") { setBubbleHovered(false); return; }
      if (mode === "picking") { cancelPicking(); return; }
      // Voice isn't minimizable (VoiceCapture isn't gated on `minimized`), so
      // minimizing it would leave the card visible AND flag a minimized chat on
      // the bubble — a contradiction. Match the bubble-click rule: text/image
      // minimize, voice is left alone here (close it with its × instead).
      if (mode === "panel" && !minimized && overlayMode !== "voice") { setMinimized(true); return; }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectionPopupVisible, ocrPanel, mode, minimized, bubbleHovered, showBackends, overlayMode, refineSessionActive, refineMinimized, refineProtect]);

  // Which physical modifier drives the in-overlay arrow shortcuts: ⌘ (Cmd) on
  // macOS, Ctrl elsewhere. On macOS Ctrl+←/→/↑ are reserved by the OS (Mission
  // Control / Spaces), so binding Ctrl there would silently never fire — ⌘ is
  // both free and the platform-native convention. Mirrors the global reopen
  // shortcut (main.cjs binds CommandOrControl+↑, i.e. ⌘+↑ on Mac) and
  // isSelectAllKeyEvent's `isMac ? metaKey : ctrlKey` pattern.
  useEffect(() => {
    loadPlatformInfo().then((info) => setIsMac(!!info.isMac));
  }, []);

  // Ctrl (⌘ on macOS) + arrow keys drive the open chat bar from the keyboard:
  //   ← / →  cycle the input mode (text → screenshot → voice)
  //   ↓      minimize the chat down to the bubble (text/image; voice isn't minimizable)
  //   ↑      reopen the minimized chat
  // ↓/←/→ act on an expanded chat; ↑ acts on a minimized one (it needs the
  // overlay to still hold keyboard focus — true right after Ctrl/⌘+↓; otherwise
  // click the bubble). Switching to image hands off to the capture flow like a click.
  useEffect(() => {
    if (!armed || mode !== "panel") return;
    const order = ["text", "image", "voice"];
    const onKey = (e) => {
      if (!(isMac ? e.metaKey : e.ctrlKey)) return;
      if (e.key === "ArrowUp") {
        if (!minimized) return;
        e.preventDefault();
        restoreMinimizedPanel();
        return;
      }
      if (minimized) return; // the rest only apply to an expanded chat
      if (e.key === "ArrowDown") {
        if (overlayMode === "voice") return; // voice card can't minimize
        e.preventDefault();
        setBubbleHovered(false);
        setMinimized(true);
        return;
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const cur = order.indexOf(overlayMode);
        const base = cur < 0 ? 0 : cur;
        const step = e.key === "ArrowRight" ? 1 : order.length - 1;
        const next = order[(base + step) % order.length];
        if (next !== overlayMode) switchMode(next);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armed, mode, minimized, overlayMode, isMac]);

  // Mirror the "chat is minimized" state to main so it can bind the global
  // Ctrl/⌘+↑ reopen shortcut only while it's needed. Same condition as the
  // in-page ↑ handler above — but this one survives the overlay losing focus,
  // which is exactly when the in-page listener can't fire.
  useEffect(() => {
    const minChat = armed && mode === "panel" && minimized;
    window.peekDesktop.setChatMinimized?.(minChat);
    return () => window.peekDesktop.setChatMinimized?.(false);
  }, [armed, mode, minimized]);

  // Pre-capture the screen the instant image mode opens — the "take a
  // screenshot first, then crop over it" model. The expensive full-screen
  // desktopCapturer grab happens HERE, up front, so releasing a drag only has
  // to crop an already-captured image (fast) instead of waiting on a fresh
  // grab at that moment (the old flow's lag). No UI fade is needed anymore:
  // captureSilent excludes Peek's own window from the grab at the OS level (see
  // main.cjs), so the chatbar/bubble never land in the shot and entering image
  // mode (incl. a text→image switch) no longer blinks.
  useEffect(() => {
    if (mode !== "panel" || overlayMode !== "image" || minimized) return;
    if (pickerImg || panelData) return; // already captured, or already cropped
    let cancelled = false;
    (async () => {
      const shot = await window.peekDesktop.captureSilent?.().catch(() => null);
      if (cancelled) return;
      if (shot) setPickerImg(shot);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, overlayMode, minimized, pickerImg, panelData]);

  // TEMP DEV-ONLY: ?test=panel bypasses desktopCapturer (unreliable in this
  // remote/virtualized sandbox) so the merged overlay flow can be visually
  // verified, including stubbing select() so region-reselect doesn't need a
  // real backing capture. Stubbed via window.__peekTestSelect rather than
  // reassigning window.peekDesktop.select directly — recent Electron versions
  // freeze objects exposed through contextBridge, so overwriting a property
  // on window.peekDesktop throws (TypeError: Cannot assign to read only property).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("test") !== "panel") return;
    window.__peekTestSelect = async () => ({
      imagePath: "/fake/path.png",
      thumbDataUrl: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='70'%3E%3Crect width='100' height='70' fill='%23F6B9E0'/%3E%3C/svg%3E",
    });
    // ?test=panel&mode=text / &mode=voice exercises those modes without a
    // real capture; omit `mode` (or use "image") for the default flow.
    // &sel=1 alongside mode=text simulates an already-grabbed selection
    // (skipping the real global hook + Refine click) to exercise the
    // quick-action popup directly.
    // &menu=1 previews the bubble menu instead of a panel.
    const testMode = params.get("mode");
    if (params.get("menu") === "1") {
      setBubbleHovered(true);
      return;
    }
    setMinimized(false);
    if (testMode === "text" || testMode === "voice") {
      setOverlayMode(testMode);
      setPanelData(null);
      setPickerImg(null);
      if (testMode === "text" && params.get("sel") === "1") {
        setSelectedText("This is a simulated selected paragraph used to test the quick-action popup positioning and behavior.");
        setSelectionPos({ x: 420, y: 260 });
      }
    } else {
      setOverlayMode("image");
      setPanelData({
        imagePath: "/fake/path.png",
        thumbDataUrl: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='70'%3E%3Crect width='100' height='70' fill='%23D9A6EF'/%3E%3C/svg%3E",
      });
      setPickerImg({ dataUrl: "", width: 1920, height: 1080 });
    }
    setMode("panel");
  }, []);

  // The Close (×) on any chat surface — the text/image chatbar, the voice
  // card, or the image-crop close badge — fully removes Peek: the chatbar AND
  // the bubble both disappear. Minimize (a separate control) is the only thing
  // that tucks back down to the bubble; there's no "close the panel but keep
  // the bubble armed" state anymore. Same path as the bubble's own × / the
  // hotkey: deactivatePeek() in main.cjs stops the selection hook, cleans up
  // the temp capture, sends peek:deactivate back (resetSession + mode "idle"),
  // and hides the overlay window.
  const endPanel = () => {
    window.peekDesktop.deactivate?.();
  };

  // RecordHotkey (tray's "Change hotkey…") isn't part of the active-session
  // flow — always lands back on fully idle regardless of what was going on before.
  const closeRecord = () => setMode("idle");

  const onMouseDown = (e) => {
    // Click-away-to-dismiss for the Refine flow — independent of whatever
    // else Peek is showing right now, since selecting text works any time
    // Peek is active (SelectionPopup is rendered as a sibling regardless of
    // `mode`). A mousedown reaching here (not stopped by the popup/pill's
    // own data-peek-ui wrapper) landed outside them.
    // Click outside the Refine popup: tuck a real answer/chat away to the pill
    // (preserved, restorable) rather than destroying it; only the transient
    // quick-action palette dismisses outright. While minimized the overlay is
    // click-through, so an outside click passes to the app underneath and this
    // handler doesn't fire.
    if (refineSessionActive) {
      if (refineMinimized) return;
      if (refineProtect) setRefineMinimized(true);
      else clearRefineSession();
      return;
    }
    if (pendingSelectionPos) { setPendingSelectionPos(null); return; }
    if (mode === "picking") {
      draggingRef.current = true;
      dragRef.current = { startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY, w: 0, h: 0 };
      setDrag(dragRef.current);
      return;
    }
    if (mode !== "panel") return;
    // Minimized: the bubble handles its own mousedown (and stops propagation
    // before it reaches here); a mousedown landing here means the backdrop,
    // which is click-through — nothing to do.
    if (minimized) return;
    // Text: click outside the panel minimizes to the bubble tab. Voice isn't
    // minimizable (see the Escape handler) — its card is click-through so this
    // rarely fires, but guard it so a stray backdrop click never starts a crop.
    if (overlayMode === "text") { setMinimized(true); return; }
    if (overlayMode === "voice") return;
    // Image: a mousedown starts a *potential* drag-to-crop. Whether it was a
    // real drag or just a click is decided on mouseup (small movement → treat
    // as a click-outside and minimize, like text mode).
    draggingRef.current = true;
    dragRef.current = { startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY, w: 0, h: 0 };
    setDrag(dragRef.current);
  };
  const onMouseMove = (e) => {
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };
    if (bubbleDragRef.current) {
      const d = bubbleDragRef.current;
      const dx = e.clientX - d.startX, dy = e.clientY - d.startY;
      if (!d.moved && (Math.abs(dx) > BUBBLE_DRAG_THRESHOLD || Math.abs(dy) > BUBBLE_DRAG_THRESHOLD)) d.moved = true;
      if (d.moved) setBubblePos({ x: d.origX + dx, y: d.origY + dy });
      return;
    }
    // Click-through hit-testing instead of drag-select — click-through
    // everywhere except Peek's own UI (data-peek-ui), so interacting with
    // whatever's underneath works normally. Electron still delivers
    // mousemove here via setIgnoreMouseEvents's {forward:true}, even while
    // the window is otherwise click-through.
    if (!selectionPopupVisible && !panelNeedsFullCapture
      && (mode === "idle" || mode === "bubble" || mode === "panel")) {
      refreshClickThroughAtPoint(e.clientX, e.clientY);
      return;
    }
    if (!draggingRef.current) return;
    const d = dragRef.current;
    if (!d) return;
    const x = Math.min(d.startX, e.clientX);
    const y = Math.min(d.startY, e.clientY);
    const next = { ...d, x, y, w: Math.abs(e.clientX - d.startX), h: Math.abs(e.clientY - d.startY) };
    dragRef.current = next;
    setDrag(next);
  };
  const onMouseUp = async () => {
    if (bubbleDragRef.current) {
      const { moved } = bubbleDragRef.current;
      bubbleDragRef.current = null;
      if (!moved) {
        if (!armedRef.current) {
          armPeekRef.current?.();
        } else if (modeRef.current === "panel" && minimized) {
          restoreMinimizedPanel();
        } else if (modeRef.current === "panel" && !minimized && overlayMode !== "voice") {
          // An open text/image chat: clicking the bubble tucks it away — the
          // Panel stays mounted (thread/input preserved), it just collapses to
          // the bubble — instead of pausing Peek and discarding the session.
          // Click the bubble again to bring the same chat right back.
          setBubbleHovered(false);
          setMinimized(true);
        } else {
          standDownRef.current?.();
        }
      } else {
        // A real drag ended — the bubble followed the cursor freely for
        // responsiveness (see the mousemove branch above), but it never
        // rests mid-screen: snap it to whichever side it ended up closer to.
        setBubblePos((pos) => snapToSide(pos.x, pos.y));
      }
      return;
    }
    draggingRef.current = false;
    const d = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (d && Math.max(d.w, d.h) >= MIN_DRAG) {
      // A real drag. The screen was already grabbed when image mode opened (see
      // the pre-capture effect), so cropping is instant — just slice that image
      // to the selected rect. No full-screen grab and no fade on release, which
      // is what used to make showing the selection feel slow. Only grab now as
      // a fallback if the pre-capture somehow hasn't landed yet (very fast drag
      // right after opening).
      const cssRect = { x: d.x, y: d.y, width: d.w, height: d.h };
      let shot = pickerImg;
      if (!shot) {
        // captureSilent excludes Peek's own window from the grab (main.cjs), so
        // no UI fade is needed here either.
        shot = await window.peekDesktop.captureSilent().catch(() => null);
        if (shot) setPickerImg(shot);
      }
      if (shot) {
        const scale = shot.width / window.innerWidth;
        const rect = {
          x: cssRect.x * scale, y: cssRect.y * scale,
          width: cssRect.width * scale, height: cssRect.height * scale,
        };
        const res = await (window.__peekTestSelect || window.peekDesktop.select)({ mode: "region", rect });
        if (!res?.error) {
          forceInteractive();
          addCrop(res, cssRect);
          setMinimized(false);
          setOverlayMode("image");
          setMode("panel");
        }
      }
    } else if (d && modeRef.current === "panel" && overlayMode === "image" && !minimized) {
      // Barely moved → a plain click on the backdrop. Behave like text mode
      // and tuck the modal down to the bubble tab.
      setMinimized(true);
    }
  };

  const showFrame = mode === "panel" && overlayMode === "image" && !minimized;
  const isDragging = !!drag && drag.w > 0;
  const bubbleShown = mode !== "idle" && mode !== "record" && mode !== "picking" && !isDragging;
  // Which edge the bubble is currently docked against — it snaps flush to a
  // side whenever it's at rest (see snapToSide), and only sits mid-screen
  // while being actively dragged. Drives the tab shape below: rounded on the
  // inner (screen-facing) side, squared off against the edge it's tucked into.
  const bubbleDockedLeft = bubblePos.x <= 0;
  const bubbleDockedRight = bubblePos.x >= window.innerWidth - BUBBLE_SIZE;
  const bubbleDocked = bubbleDockedLeft || bubbleDockedRight;
  // On hover the tab grows outward from the edge instead of sliding inward,
  // so it reads as a strip being pulled from the side rather than a detached
  // button. Anchored flush: left-dock grows rightward (left stays 0), right-
  // dock grows leftward (left shifts back by the same amount it widens).
  const bubblePull = armed && bubbleHovered && bubbleDocked ? BUBBLE_PULL : 0;
  const bubbleWidth = BUBBLE_SIZE + bubblePull;
  const bubbleLeft = bubbleDockedRight ? bubblePos.x - bubblePull : bubblePos.x;
  const bubbleRadius = bubbleDockedRight
    ? "16px 0 0 16px"
    : bubbleDockedLeft
    ? "0 16px 16px 0"
    : "50%"; // free circle only while mid-drag, before it snaps back to an edge
  const activeChat = armed && mode === "panel" && minimized
    ? { kind: "panel", busy: panelBusy, ready: answerReady }
    : null;
  // Side-dock geometry for a minimized Refine pill, so it tucks into the SAME
  // edge stack as the bubble + minimized-chat strip instead of landing on top
  // of them. It sits flush to the bubble's docked side, just past the bubble
  // (and past the chat strip too, when a chat is also minimized). Mirrors
  // BubbleStrip's above/below choice so the whole stack reads as one column.
  const refineDockBelow = bubblePos.y < window.innerHeight / 2;
  const refineDockOffset = 8 + (activeChat ? 44 /* strip button */ + 7 : 0);
  const refineDock = {
    onLeftSide: bubbleDockedLeft,
    style: {
      ...(bubbleDockedLeft ? { left: 0 } : { right: 0 }),
      ...(refineDockBelow
        ? { top: bubblePos.y + BUBBLE_SIZE + refineDockOffset }
        : { bottom: window.innerHeight - bubblePos.y + refineDockOffset }),
    },
  };
  const activeCrop = cropHistory[activeCropIndex] || cropHistory[cropHistory.length - 1] || null;
  const showFrozenCrop = showFrame && !!activeCrop;
  // Dim + spotlight only while a region is actively being dragged out — in
  // both legacy picking mode and the new image chat modal. Outside of a drag
  // the surface stays clear (normal modal), never a dimmed capture screen.
  const dragFocusRect = isDragging && drag && drag.w >= MIN_DRAG
    && (mode === "picking" || (mode === "panel" && overlayMode === "image" && !minimized))
    ? { x: drag.x, y: drag.y, width: drag.w, height: drag.h }
    : null;
  const pendingPillPos = pendingSelectionPos
    ? anchorRefineUi(pendingSelectionPos, REFINE_UI_SIZES.pill)
    : null;

  return (
    <div
      className="peek-root peek-empty"
      style={{
        position: "fixed", inset: 0,
        cursor: (mode === "picking" || showFrame) ? "crosshair" : "default",
      }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
    >
      <SpotlightMask rect={dragFocusRect} dim={0.5} zIndex={Z.DRAG_DIM} />
      {showFrozenCrop && <FrozenCropOverlay crop={activeCrop} zIndex={Z.CROP_DIM} />}
      {showFrozenCrop && (
        <button onMouseDown={(e) => e.stopPropagation()} onClick={clearImageCrop} title="Remove selection" style={{
          position: "fixed",
          ...(selectionRect
            ? {
                left: Math.min(window.innerWidth - 38, selectionRect.x + selectionRect.width - 14),
                top: Math.max(8, selectionRect.y - 36),
              }
            : { top: 18, left: 18 }),
          width: 30, height: 30, zIndex: Z.IMAGE_CLOSE,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(12,12,14,0.88)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "50%",
          color: "#fff", cursor: "pointer",
          boxShadow: "0 6px 18px rgba(0,0,0,0.45)",
        }}><IconClose /></button>
      )}

      {mode === "picking" && (
        <>
          {!dragFocusRect && (
            <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: Z.PICK_DIM }} />
          )}
          <button onMouseDown={(e) => e.stopPropagation()} onClick={cancelPicking} title="Cancel" style={{
            position: "fixed", top: 18, left: 18, width: 30, height: 30, zIndex: Z.PANEL,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(20,10,25,0.55)", border: "none", borderRadius: "50%",
            color: "#fff", cursor: "pointer",
          }}><IconClose /></button>
          <div data-peek-ui="true" style={{
            position: "fixed", left: "50%", bottom: 32, transform: "translateX(-50%)", zIndex: Z.PANEL,
            display: "flex", alignItems: "center", gap: 10, padding: "8px 16px", borderRadius: 999,
            background: "rgba(20,10,25,0.82)", color: "#fff", fontSize: 12.5, fontWeight: 600,
            whiteSpace: "nowrap", boxShadow: "0 6px 16px rgba(0,0,0,0.28)",
          }}>
            Drag to select an area
            <button onMouseDown={(e) => e.stopPropagation()} onClick={confirmFullScreen} style={{
              background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", borderRadius: 999,
              padding: "4px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer",
            }}>Full screen (Enter)</button>
            <span style={{ opacity: 0.6 }}>Esc to cancel</span>
          </div>
        </>
      )}

      {(!selectedText || refineMinimized) && armed && pendingPillPos && (
        // Appears on selection gesture; disappears if nothing was copied. Also
        // shows while a refine is only *minimized* — selecting fresh text then
        // offers a new Refine, and clicking it (grabSelection) replaces the
        // tucked-away one (refineKey bump remounts the popup on the new text).
        <div data-peek-ui="true" style={{
          position: "fixed", left: pendingPillPos.left, top: pendingPillPos.top, zIndex: Z.REFINE,
        }}>
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={grabSelection}
            style={{
              display: "flex", alignItems: "center", gap: 6, padding: "7px 13px", borderRadius: 999,
              background: "rgba(20,10,25,0.92)", border: "none", color: "#fff", fontSize: 12.5, fontWeight: 600,
              cursor: "pointer", whiteSpace: "nowrap", boxShadow: "0 6px 16px rgba(0,0,0,0.28)",
            }}
          >
            <IconSparkle style={{ width: 14, height: 14, flexShrink: 0 }} />
            Refine
          </button>
        </div>
      )}
      {armed && grabError && (() => {
        const errPos = grabError.pos
          ? anchorRefineUi(grabError.pos, { width: 220, height: 36 })
          : { left: 8, top: 8 };
        return (
          <div style={{
            position: "fixed", left: errPos.left, top: errPos.top, zIndex: Z.REFINE,
            display: "flex", alignItems: "center", gap: 6, padding: "7px 13px", borderRadius: 999,
            background: "rgba(120,20,20,0.92)", color: "#fff", fontSize: 12, fontWeight: 600,
            pointerEvents: "none", whiteSpace: "nowrap", boxShadow: "0 6px 16px rgba(0,0,0,0.28)",
          }}>
            {grabError.message}
          </div>
        );
      })()}
      {ocrPanelOpen && (
        <ImageOcrPanel
          busy={!!ocrPanel?.busy}
          text={ocrPanel?.text}
          anchorRect={selectionRect}
          onClose={() => setOcrPanel(null)}
        />
      )}
      {refineSessionActive && armed && (
        <SelectionPopup
          key={refineKey}
          selectedText={selectedText}
          selectionPos={selectionPos}
          onClear={clearRefineSession}
          minimized={refineMinimized}
          minimizedDock={refineDock}
          onMinimize={() => setRefineMinimized(true)}
          onRestore={() => setRefineMinimized(false)}
          onProtectChange={setRefineProtect}
        />
      )}

      {activeChat && (
        <BubbleStrip
          bubblePos={bubblePos}
          bubbleSize={BUBBLE_SIZE}
          onLeftSide={bubbleDockedLeft}
          activeChat={activeChat}
          onOpenChat={restoreMinimizedPanel}
          onEnter={() => openHover()}
          onLeave={closeHoverSoon}
        />
      )}

      {armed && mode === "panel" && !isDragging && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: Z.PANEL,
            pointerEvents: "none", cursor: "default",
          }}
        >
          <Panel
            key={panelKey}
            data={panelData} mode={overlayMode} selectionRect={overlayMode === "image" ? selectionRect : null}
            onClose={endPanel}
            minimized={minimized} onMinimize={() => setMinimized(true)}
            pinned={pinned} onTogglePin={() => setPinned((p) => !p)}
            initialQuestion={initialQuestion}
            onHasContentChange={setPanelHasContent}
            onBusyChange={setPanelBusy}
            onAnswerReady={handleAnswerReady}
            onSwitchMode={switchMode}
            onManageBackends={() => setShowBackends(true)}
            cropHistory={overlayMode === "image" ? cropHistory : []}
            activeCropIndex={activeCropIndex}
            onSelectCrop={selectCrop}
            showImageCropActions={overlayMode === "image" && showFrame && !!panelData && !ocrPanel}
            onExtractTextFromCrop={extractTextFromCrop}
            onSaveScreenshotFromCrop={saveScreenshotFromCrop}
            extractTextBusy={!!ocrPanel?.busy}
            saveScreenshotBusy={saveShotBusy}
          />
        </div>
      )}

      {bubbleShown && (
        <div
          data-peek-ui="true"
          onMouseDown={(e) => {
            e.stopPropagation();
            // Hide the strip for the duration of a potential drag so it
            // doesn't chase the bubble.
            if (hoverTimerRef.current) { clearTimeout(hoverTimerRef.current); hoverTimerRef.current = null; }
            setBubbleHovered(false);
            bubbleDragRef.current = { startX: e.clientX, startY: e.clientY, origX: bubblePos.x, origY: bubblePos.y, moved: false };
          }}
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onMouseEnter={() => openHover()}
          onMouseLeave={closeHoverSoon}
          title={!armed ? "Click to activate Peek"
            : mode === "panel" && minimized ? `Click or ${isMac ? "⌘" : "Ctrl"} ↑ to reopen chat · × to close Peek`
            : mode === "panel" && overlayMode !== "voice" ? `Click or ${isMac ? "⌘" : "Ctrl"} ↓ to minimize chat · × to close Peek`
            : "Click to pause · × to close Peek"}
          style={{
            position: "fixed", left: bubbleLeft, top: bubblePos.y, width: bubbleWidth, height: BUBBLE_SIZE,
            borderRadius: bubbleRadius, background: armed ? "#fff" : "#ECECEC",
            border: `1px solid ${armed ? "rgba(0,0,0,0.08)" : "rgba(0,0,0,0.06)"}`,
            display: "flex", alignItems: "center",
            // Sparkle hugs the inner (screen-facing) side so the tab visibly
            // stretches out of the docked edge as it widens on hover, leaving
            // a filled trail back to the edge rather than a gap.
            justifyContent: bubbleDockedLeft ? "flex-end" : bubbleDockedRight ? "flex-start" : "center",
            paddingLeft: bubbleDockedRight ? (BUBBLE_SIZE - 30) / 2 : 0,
            paddingRight: bubbleDockedLeft ? (BUBBLE_SIZE - 30) / 2 : 0,
            boxSizing: "border-box",
            boxShadow: armed && bubbleHovered
              ? "0 10px 28px rgba(0,0,0,0.14), 0 0 0 1px rgba(0,0,0,0.06)"
              : armed
              ? "0 6px 20px rgba(0,0,0,0.12)"
              : "0 4px 14px rgba(0,0,0,0.08)",
            cursor: armed ? "grab" : "pointer",
            zIndex: mode === "panel" && !minimized ? Z.BUBBLE_TUCKED : Z.BUBBLE,
            filter: armed ? "none" : "grayscale(1)",
            opacity: armed ? 1 : 0.72,
            transition: "width 0.24s cubic-bezier(0.34, 1.25, 0.64, 1), left 0.24s cubic-bezier(0.34, 1.25, 0.64, 1), box-shadow 0.24s ease, border-color 0.2s ease, filter 0.22s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.22s cubic-bezier(0.22, 1, 0.36, 1), background 0.22s ease",
          }}
        >
          <IconPeek width={panelBusy && armed ? 30 : 24} loading={panelBusy && armed} style={{ color: armed ? "#000" : "#6B6B6B", flexShrink: 0 }} />
          {armed && bubbleHovered && (
          <button
            className="peek-fade-in"
            title="Close Peek"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); window.peekDesktop.deactivate?.(); }}
            style={{
              // Anchored on the inner (screen-facing) top corner so it never
              // lands off-screen past the edge the bubble is docked flush to.
              position: "absolute", top: -4,
              ...(bubbleDockedRight ? { left: -4 } : { right: -4 }),
              width: 18, height: 18, borderRadius: "50%",
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "#fff", color: "#3A3833", border: "none", cursor: "pointer", padding: 0,
              boxShadow: "0 2px 6px rgba(0,0,0,0.35)",
              transition: "background 0.18s cubic-bezier(0.22, 1, 0.36, 1), color 0.18s cubic-bezier(0.22, 1, 0.36, 1), transform 0.18s cubic-bezier(0.22, 1, 0.36, 1)",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "#D64545"; e.currentTarget.style.color = "#fff"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.color = "#3A3833"; }}
          ><IconClose style={{ width: 9, height: 9 }} /></button>
          )}
        </div>
      )}
      {mode === "record" && <RecordHotkey onDone={closeRecord} onCancel={closeRecord} />}
      {showBackends && <BackendsModal onClose={() => setShowBackends(false)} />}
    </div>
  );
}
