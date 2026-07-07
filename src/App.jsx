import { useEffect, useRef, useState } from "react";
import Panel from "./Panel.jsx";
import BubbleStrip from "./BubbleStrip.jsx";
import SelectionPopup from "./SelectionPopup.jsx";
import ImageOcrPanel from "./ImageOcrPanel.jsx";
import RecordHotkey from "./RecordHotkey.jsx";
import { OCR_PROMPT } from "./prompts.js";
import { anchorRefineUi, REFINE_UI_SIZES } from "./refinePosition.js";
import { IconClose, IconPeek, IconSparkle } from "./Icons.jsx";

import { BACKEND_KEY, resolveBackend, INSTALL_CLI_MESSAGE } from "./backends.js";

const MIN_DRAG = 6; // px — below this a click is treated as a miss-click, not a selection
const BUBBLE_SIZE = 52;
const BUBBLE_PULL = 11; // px the docked tab slides outward on hover — "pulled stripe" feel
const BUBBLE_DRAG_THRESHOLD = 3; // px — below this a bubble mousedown+up is a click, not a drag
const BUBBLE_POS_KEY = "peek-bubble-pos"; // persists across restarts so the bubble stays where you left it
const BUBBLE_EDGE_MARGIN = 16; // px kept between the bubble and the top/bottom while sliding along an edge

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

function SpotlightMask({ rect, zIndex = 35, dim = 0.78 }) {
  if (!rect || rect.width < 1 || rect.height < 1) return null;
  const maskTransition = "left 0.22s cubic-bezier(0.22, 1, 0.36, 1), top 0.22s cubic-bezier(0.22, 1, 0.36, 1), width 0.22s cubic-bezier(0.22, 1, 0.36, 1), height 0.22s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.22s ease";
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
 *   bubble  — Peek active, just the docked bubble tab on screen. Hovering it
 *             slides out the mode strip (BubbleStrip: Image/Text/Voice);
 *             clicking it restores a minimized chat (or does nothing if idle).
 *             Text
 *             selection (SelectionPopup) works here too — see main.cjs's
 *             activatePeek, which starts the global selection hook the instant
 *             Peek becomes active, independent of `mode`.
 *   picking — chose "Image": a modal dim/crosshair capture screen. Drag a
 *             region or press Enter for full screen; Esc cancels back to bubble.
 *   panel   — Panel is open (image/text/voice sub-mode is `overlayMode`).
 *   record  — the tray's "Change hotkey…" flow (RecordHotkey).
 *
 * The hotkey is a hard on/off for `idle` vs everything else (see
 * main.cjs's activatePeek/deactivatePeek) — it no longer just toggles an
 * already-open panel's minimized state the way it used to.
 */
export default function App() {
  const [mode, setMode] = useState("idle");
  const [menuView, setMenuView] = useState("root"); // "root" | "text-options"
  const [overlayMode, setOverlayMode] = useState("image"); // image | text | voice
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

  const openHover = (opts = {}) => {
    if (hoverTimerRef.current) { clearTimeout(hoverTimerRef.current); hoverTimerRef.current = null; }
    // Fresh hover from the bubble itself resets to Image/Text/Voice; moving
    // from the bubble into the already-open strip keeps the current sub-view.
    if (!opts.keepMenuView) setMenuView("root");
    setBubbleHovered(true);
  };
  const closeHoverSoon = () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => { setBubbleHovered(false); hoverTimerRef.current = null; }, 180);
  };

  useEffect(() => { modeRef.current = mode; }, [mode]);

  useEffect(() => {
    try { localStorage.setItem(BUBBLE_POS_KEY, JSON.stringify(bubblePos)); } catch {}
  }, [bubblePos]);

  // A fresh session's worth of resets — shared by onActivate (hotkey/tray
  // arms Peek) and endPanel (Panel's Close button ends the current session
  // but leaves Peek active). Deliberately does NOT touch `mode` itself —
  // callers set that to whatever's appropriate for them.
  const resetSession = () => {
    setMenuView("root");
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

  const restoreMinimizedPanel = () => {
    if (mode === "panel" && minimized) {
      setMinimized(false);
      setAnswerReady(false);
    }
    setBubbleHovered(false);
  };

  useEffect(() => {
    if (!window.peekDesktop) return;
    const offActivate = window.peekDesktop.onActivate?.(() => {
      resetSession();
      setMode("bubble");
      clickThroughRef.current = true;
      window.peekDesktop.setClickThrough(true);
    });
    const offDeactivate = window.peekDesktop.onDeactivate?.(() => {
      resetSession();
      setMode("idle");
    });
    // main.cjs's noteSelectionPending already grabs the clipboard eagerly
    // (has to — see its own comment on why waiting for a Refine click would
    // hit Windows' anti-focus-stealing protection) — grabSelection() below
    // just retrieves what was already grabbed, no fresh clipboard access.
    const offSelectionPending = window.peekDesktop.onSelectionPending?.((data) => {
      if (data?.x == null) return;
      setPendingSelectionPos({ x: data.x, y: data.y });
    });
    // A plain click elsewhere (main.cjs's onSelectionMouseUp) almost always
    // means whatever was selected before just got deselected — only
    // meaningful before a Refine click (an already-open quick-actions
    // popup/answer is left alone; see App.jsx's onMouseDown for that dismissal).
    const offSelectionCleared = window.peekDesktop.onSelectionCleared?.(() => {
      setPendingSelectionPos(null);
    });
    const offRecord = window.peekDesktop.onRecord(() => setMode("record"));
    const offOverlayBlur = window.peekDesktop.onOverlayBlur?.(() => setHasOsFocus(false));
    const offOverlayFocus = window.peekDesktop.onOverlayFocus?.(() => setHasOsFocus(true));
    const offRestorePanel = window.peekDesktop.onRestorePanel?.(() => restoreMinimizedPanel());
    return () => {
      offActivate?.(); offDeactivate?.(); offSelectionPending?.(); offSelectionCleared?.(); offRecord();
      offOverlayBlur?.(); offOverlayFocus?.(); offRestorePanel?.();
    };
  }, []);

  // Keeps main.cjs's notion of "is Peek active at all" in sync, so the
  // global hotkey and tray menu item know whether to arm a fresh session or
  // fully deactivate (see onHotkeyPressed in main.cjs).
  useEffect(() => {
    window.peekDesktop.notifyPanelExpanded?.(mode !== "idle");
  }, [mode]);

  // "Refine" pill click — the one moment Peek actually simulates Ctrl+C into
  // the source window. Clears the pill either way (success or failure) so a
  // blocked grab doesn't leave a dead button sitting on screen; a failure
  // surfaces briefly instead of just silently doing nothing.
  const grabSelection = async () => {
    const pos = pendingSelectionPos;
    setPendingSelectionPos(null);
    replaceActiveSession();
    const res = await window.peekDesktop.grabSelection?.();
    if (res?.text) {
      setSelectedText(res.text);
      setSelectionPos(pos);
      setRefineKey((k) => k + 1);
      return;
    }
    setGrabError({ pos, message: res?.error || "Couldn't grab that selection." });
    setTimeout(() => setGrabError(null), 2200);
  };

  const clearRefineSession = () => {
    setSelectedText(null);
    setSelectionPos(null);
    setRefineKey((k) => k + 1);
  };

  const refineSessionActive = !!selectedText && !!selectionPos;
  const selectionPopupVisible = refineSessionActive;
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
    const unambiguous = selectionPopupVisible || ocrPanelOpen || mode === "picking" || panelNeedsFullCapture;
    if (unambiguous) {
      if (clickThroughRef.current !== false) {
        forceInteractive();
      }
      return;
    }
    refreshClickThroughAtPoint(lastMousePosRef.current.x, lastMousePosRef.current.y);
  }, [selectionPopupVisible, ocrPanelOpen, mode, minimized, panelNeedsFullCapture, bubbleHovered]);

  // --- Bubble menu choices -------------------------------------------------

  const chooseImage = async () => {
    setBubbleHovered(false);
    replaceActiveSession();
    const shot = await window.peekDesktop.captureNow();
    if (!shot) { setMode("bubble"); return; }
    forceInteractive();
    setPickerImg(shot);
    setPanelData(null);
    setSelectionRect(null);
    setMinimized(false);
    setOverlayMode("image");
    setMode("picking");
  };

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

  // All three Text starters open the panel as plain Text mode — you chose
  // "Text" from the menu, so the Image tab shouldn't light up and the
  // OCR/Attach buttons (image-specific tools) shouldn't show. "Chat with
  // screen" and "Summarize screen" still silently attach a full-screen
  // capture as context (Panel.jsx's send() attaches it whenever `data`
  // exists, regardless of which tab is showing) — they just don't *look*
  // like Image mode while doing it. "custom" has no screenshot at all.
  const chooseTextStarter = async (key) => {
    setBubbleHovered(false);
    replaceActiveSession();
    if (key === "custom") {
      setOverlayMode("text");
      setPanelData(null);
      setPickerImg(null);
      setSelectionRect(null);
      setMinimized(false);
      setPinned(false);
      setHasOsFocus(true);
      setInitialQuestion(null);
      setMode("panel");
      return;
    }
    const shot = await window.peekDesktop.captureNow();
    if (!shot) { setMode("bubble"); return; }
    const res = await (window.__peekTestSelect || window.peekDesktop.select)({ mode: "full" });
    if (res?.error) { setMode("bubble"); return; }
    setPickerImg(shot);
    setPanelData(res);
    setSelectionRect(null);
    setOverlayMode("text");
    setMinimized(false);
    setPinned(false);
    setHasOsFocus(true);
    setInitialQuestion(key === "summarize" ? "Summarize what's on screen." : null);
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
      if (ocrPanel) { setOcrPanel(null); return; }
      if (selectionPopupVisible) { clearRefineSession(); return; }
      if (bubbleHovered && mode === "bubble") { setBubbleHovered(false); return; }
      if (mode === "picking") { cancelPicking(); return; }
      if (mode === "panel" && !minimized) { setMinimized(true); return; }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectionPopupVisible, ocrPanel, mode, minimized, bubbleHovered]);

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

  // Ends the current panel/session (Panel's Close button) — back to just the
  // bubble, Peek stays active (selection hook keeps running). Distinct from
  // deactivation (hotkey), which fully hides the bubble — see resetSession/onDeactivate.
  const endPanel = () => {
    window.peekDesktop.endSession?.();
    resetSession();
    setMode("bubble");
  };

  // RecordHotkey (tray's "Change hotkey…") isn't part of the active-session
  // flow — always lands back on fully idle regardless of what was going on before.
  const closeRecord = () => setMode("idle");

  const toNatural = (rect) => {
    if (!pickerImg) return rect;
    const scale = pickerImg.width / window.innerWidth;
    return { x: rect.x * scale, y: rect.y * scale, width: rect.width * scale, height: rect.height * scale };
  };

  const onMouseDown = (e) => {
    // Click-away-to-dismiss for the Refine flow — independent of whatever
    // else Peek is showing right now, since selecting text works any time
    // Peek is active (SelectionPopup is rendered as a sibling regardless of
    // `mode`). A mousedown reaching here (not stopped by the popup/pill's
    // own data-peek-ui wrapper) landed outside them.
    // Click outside the Refine popup closes it; only starting a new flow
    // or explicit Close clears via the same path (clearRefineSession).
    if (selectionPopupVisible) { clearRefineSession(); return; }
    if (pendingSelectionPos) { setPendingSelectionPos(null); return; }
    if (mode === "picking") {
      draggingRef.current = true;
      setDrag({ startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY, w: 0, h: 0 });
      return;
    }
    if (mode !== "panel") return;
    // Minimized: the bubble handles its own mousedown (and stops propagation
    // before it reaches here); a mousedown landing here means the backdrop,
    // which is click-through — nothing to do.
    if (minimized) return;
    // Text/voice: click outside the panel minimizes to the bubble tab (image
    // mode uses the backdrop for re-cropping instead).
    if (overlayMode === "text" || overlayMode === "voice") { setMinimized(true); return; }
    draggingRef.current = true;
    setDrag({ startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY, w: 0, h: 0 });
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
    setDrag((d) => {
      if (!d) return d;
      const x = Math.min(d.startX, e.clientX);
      const y = Math.min(d.startY, e.clientY);
      return { ...d, x, y, w: Math.abs(e.clientX - d.startX), h: Math.abs(e.clientY - d.startY) };
    });
  };
  const onMouseUp = async () => {
    if (bubbleDragRef.current) {
      const { moved } = bubbleDragRef.current;
      bubbleDragRef.current = null;
      if (!moved) {
        if (mode === "panel" && minimized) {
          restoreMinimizedPanel();
        } else {
          setBubbleHovered(false);
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
    setDrag((d) => {
      if (d && Math.max(d.w, d.h) >= MIN_DRAG) {
        const cssRect = { x: d.x, y: d.y, width: d.w, height: d.h };
        const rect = toNatural(cssRect);
        (window.__peekTestSelect || window.peekDesktop.select)({ mode: "region", rect }).then((res) => {
          if (!res?.error) {
            if (modeRef.current === "picking") {
              forceInteractive();
              addCrop(res, cssRect);
              setMinimized(false);
              setOverlayMode("image");
              setMode("panel");
              return;
            }
            forceInteractive();
            addCrop(res, cssRect);
            setMinimized(false);
            setOverlayMode("image");
            setMode("panel");
          }
        });
      }
      return null;
    });
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
  const bubblePull = bubbleHovered && bubbleDocked ? BUBBLE_PULL : 0;
  const bubbleWidth = BUBBLE_SIZE + bubblePull;
  const bubbleLeft = bubbleDockedRight ? bubblePos.x - bubblePull : bubblePos.x;
  const bubbleRadius = bubbleDockedRight
    ? "16px 0 0 16px"
    : bubbleDockedLeft
    ? "0 16px 16px 0"
    : "50%"; // free circle only while mid-drag, before it snaps back to an edge
  // The mode strip (Image/Text/Voice) slides out on bubble hover only.
  const showStrip = bubbleShown && bubbleHovered;
  const activeChat = mode === "panel" && minimized
    ? { kind: "panel", busy: panelBusy, ready: answerReady }
    : null;
  const activeCrop = cropHistory[activeCropIndex] || cropHistory[cropHistory.length - 1] || null;
  const showFrozenCrop = showFrame && !!activeCrop;
  const pickingFocusRect = mode === "picking" && isDragging && drag && drag.w >= MIN_DRAG
    ? { x: drag.x, y: drag.y, width: drag.w, height: drag.h }
    : null;
  const pendingPillPos = pendingSelectionPos
    ? anchorRefineUi(pendingSelectionPos, REFINE_UI_SIZES.pill)
    : null;

  return (
    <div
      className="peek-root peek-empty"
      style={{ position: "fixed", inset: 0, cursor: (mode === "picking" || showFrame) ? "crosshair" : "default" }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
    >
      <SpotlightMask rect={pickingFocusRect} dim={0.5} />
      {showFrozenCrop && <FrozenCropOverlay crop={activeCrop} />}
      {showFrame && !selectionRect && !showFrozenCrop && (
        <div style={{
          position: "fixed", left: 0, top: 0, width: window.innerWidth, height: window.innerHeight,
          border: "2px solid #C084FC", borderRadius: 0, pointerEvents: "none", zIndex: 36,
          boxSizing: "border-box",
        }} />
      )}
      {showFrame && (
        <button onMouseDown={(e) => e.stopPropagation()} onClick={endPanel} title="Close" style={{
          position: "fixed",
          ...(selectionRect
            ? {
                left: Math.min(window.innerWidth - 38, selectionRect.x + selectionRect.width - 14),
                top: Math.max(8, selectionRect.y - 36),
              }
            : { top: 18, left: 18 }),
          width: 30, height: 30, zIndex: 47,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(12,12,14,0.88)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "50%",
          color: "#fff", cursor: "pointer",
          boxShadow: "0 6px 18px rgba(0,0,0,0.45)",
        }}><IconClose /></button>
      )}

      {mode === "picking" && (
        <>
          {!pickingFocusRect && (
            <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 30 }} />
          )}
          <button onMouseDown={(e) => e.stopPropagation()} onClick={cancelPicking} title="Cancel" style={{
            position: "fixed", top: 18, left: 18, width: 30, height: 30, zIndex: 41,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(20,10,25,0.55)", border: "none", borderRadius: "50%",
            color: "#fff", cursor: "pointer",
          }}><IconClose /></button>
          <div data-peek-ui="true" style={{
            position: "fixed", left: "50%", bottom: 32, transform: "translateX(-50%)", zIndex: 41,
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

      {!selectedText && pendingPillPos && (
        // Appears on selection gesture; disappears if nothing was copied.
        <div data-peek-ui="true" style={{
          position: "fixed", left: pendingPillPos.left, top: pendingPillPos.top, zIndex: 50,
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
      {grabError && (() => {
        const errPos = grabError.pos
          ? anchorRefineUi(grabError.pos, { width: 220, height: 36 })
          : { left: 8, top: 8 };
        return (
          <div style={{
            position: "fixed", left: errPos.left, top: errPos.top, zIndex: 50,
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
      {refineSessionActive && (
        <SelectionPopup
          key={refineKey}
          selectedText={selectedText}
          selectionPos={selectionPos}
          onClear={clearRefineSession}
        />
      )}

      {isDragging && mode !== "picking" && (
        <div style={{
          position: "fixed", left: drag.x, top: drag.y, width: drag.w, height: drag.h,
          border: "2px solid #9333EA", borderRadius: 0, background: "rgba(147,51,234,0.08)",
          pointerEvents: "none", zIndex: 45,
        }} />
      )}

      {(activeChat || showStrip) && (
        <BubbleStrip
          bubblePos={bubblePos}
          bubbleSize={BUBBLE_SIZE}
          onLeftSide={bubbleDockedLeft}
          activeChat={activeChat}
          menuOpen={showStrip}
          view={menuView}
          onOpenChat={restoreMinimizedPanel}
          onBack={() => setMenuView("root")}
          onImage={chooseImage}
          onVoice={chooseVoice}
          onText={() => setMenuView("text-options")}
          onTextStarter={chooseTextStarter}
          onEnter={() => openHover({ keepMenuView: true })}
          onLeave={closeHoverSoon}
        />
      )}

      {mode === "panel" && !isDragging && (overlayMode === "image" ? !!panelData : true) && (
        <div
          style={{ zIndex: 48, cursor: "default", pointerEvents: minimized ? "none" : "auto" }}
          onMouseDown={(e) => { if (!minimized) e.stopPropagation(); }}
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
          style={{
            position: "fixed", left: bubbleLeft, top: bubblePos.y, width: bubbleWidth, height: BUBBLE_SIZE,
            borderRadius: bubbleRadius, background: "#fff",
            border: "1px solid rgba(0,0,0,0.08)",
            display: "flex", alignItems: "center",
            // Sparkle hugs the inner (screen-facing) side so the tab visibly
            // stretches out of the docked edge as it widens on hover, leaving
            // a filled trail back to the edge rather than a gap.
            justifyContent: bubbleDockedLeft ? "flex-end" : bubbleDockedRight ? "flex-start" : "center",
            paddingLeft: bubbleDockedRight ? (BUBBLE_SIZE - 30) / 2 : 0,
            paddingRight: bubbleDockedLeft ? (BUBBLE_SIZE - 30) / 2 : 0,
            boxSizing: "border-box",
            boxShadow: bubbleHovered
              ? "0 10px 28px rgba(0,0,0,0.14), 0 0 0 1px rgba(0,0,0,0.06)"
              : "0 6px 20px rgba(0,0,0,0.12)",
            cursor: "grab", zIndex: 60,
            transition: "width 0.24s cubic-bezier(0.34, 1.25, 0.64, 1), left 0.24s cubic-bezier(0.34, 1.25, 0.64, 1), box-shadow 0.24s ease, border-color 0.2s ease, transform 0.2s cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        >
          <IconPeek width={panelBusy ? 30 : 24} loading={panelBusy} style={{ color: "#000", flexShrink: 0 }} />
          {bubbleHovered && (
          <button
            className="peek-fade-in"
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
    </div>
  );
}
