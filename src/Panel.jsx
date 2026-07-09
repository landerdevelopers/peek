import { useEffect, useRef, useState } from "react";
import { LIGHT } from "./theme.js";
import ChatTurn, { ThinkingBubble, UserBubble } from "./ChatTurn.jsx";
import PillDropdown from "./PillDropdown.jsx";
import { useVoiceInput } from "./useVoiceInput.js";
import BackendPicker from "./BackendPicker.jsx";
import ModelPicker from "./ModelPicker.jsx";
import { BACKEND_KEY, resolveBackend, modelKey } from "./backends.js";
import { useInstalledBackends } from "./useInstalledBackends.js";
import { IconClose, IconArrowUp, IconAttachment, IconMic, IconScanText, IconPin, IconMinimize, IconDownload, IconImage, IconChatTab } from "./Icons.jsx";
import { OCR_PROMPT } from "./prompts.js";
import { loadPlatformInfo } from "./accelFormat.js";

const DRAG_EDGE_MARGIN = 80;
const COMPACT_W = 380;
const EXPANDED_W = 520;
const CROP_ACTIONS_EXTRA = 44; // gap + floating pill below the composer

// Places the image-mode composer in the largest clear slot around the crop —
// below, above, left, or right — so it never sits on top of the selection.
function clampH(left, width, vw, margin) {
  return Math.max(margin, Math.min(left, vw - width - margin));
}
function clampV(top, height, vh, margin) {
  return Math.max(margin, Math.min(top, vh - height - margin));
}

function computeImagePanelLayout(rect, { width = COMPACT_W, heightEstimate = 52 } = {}) {
  const M = 12;
  const G = 22;
  const W = Math.min(width, window.innerWidth - M * 2);
  const H = heightEstimate;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  if (!rect) {
    return { pos: { left: "50%", bottom: 32, transform: "translateX(-50%)" }, maxHeight: "74vh" };
  }

  const candidates = [];

  const below = vh - (rect.y + rect.height) - M;
  if (below >= H + G) {
    const top = rect.y + rect.height + G;
    candidates.push({
      score: below * 1.1,
      pos: { left: clampH(rect.x + rect.width / 2 - W / 2, W, vw, M), top, width: W },
      maxHeight: Math.min(vh * 0.68, below - 6),
    });
  }

  const above = rect.y - M;
  if (above >= H + G) {
    const maxH = Math.min(vh * 0.68, above - G);
    const top = Math.max(M, rect.y - G - Math.min(H, maxH));
    candidates.push({
      score: above,
      pos: { left: clampH(rect.x + rect.width / 2 - W / 2, W, vw, M), top, width: W },
      maxHeight: Math.min(maxH, rect.y - G - top),
    });
  }

  const right = vw - (rect.x + rect.width) - M;
  if (right >= W + G) {
    const top = clampV(rect.y + rect.height / 2 - H / 2, H, vh, M);
    candidates.push({
      score: right + rect.height * 0.3,
      pos: { left: rect.x + rect.width + G, top, width: W },
      maxHeight: Math.min(vh * 0.68, vh - top - M),
    });
  }

  const leftSpace = rect.x - M;
  if (leftSpace >= W + G) {
    const top = clampV(rect.y + rect.height / 2 - H / 2, H, vh, M);
    candidates.push({
      score: leftSpace + rect.height * 0.3,
      pos: { left: rect.x - W - G, top, width: W },
      maxHeight: Math.min(vh * 0.68, vh - top - M),
    });
  }

  if (candidates.length) {
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0];
  }

  // Tight crop — park in the corner with the most room, still off the selection.
  const corners = [
    { score: (vh - rect.y - rect.height) * (vw - rect.x - rect.width), pos: { left: clampH(rect.x + rect.width + G, W, vw, M), top: clampV(rect.y + rect.height + G, H, vh, M), width: W } },
    { score: (rect.y) * (vw - rect.x - rect.width), pos: { left: clampH(rect.x + rect.width + G, W, vw, M), top: clampV(rect.y - G - H, H, vh, M), width: W } },
    { score: (vh - rect.y - rect.height) * (rect.x), pos: { left: clampH(rect.x - W - G, W, vw, M), top: clampV(rect.y + rect.height + G, H, vh, M), width: W } },
    { score: rect.y * rect.x, pos: { left: clampH(rect.x - W - G, W, vw, M), top: clampV(rect.y - G - H, H, vh, M), width: W } },
  ];
  corners.sort((a, b) => b.score - a.score);
  const pick = corners[0];
  return { pos: pick.pos, maxHeight: Math.min(vh * 0.55, vh - pick.pos.top - M) };
}

/**
 * The hotkey overlay's ask-a-question UI — what a bubble-menu choice
 * (Image / Text / Voice, or one of Text's starter options) opens into. Its
 * `mode` (image/text/voice) is fixed for this panel's lifetime — chosen
 * once via the bubble menu, not switchable in-panel anymore. Draggable by
 * its header (defaults to bottom-center of the screen until the user
 * actually grabs it); the header also carries Pin and Close. Uses the
 * gradient-border composer look, a scrollback thread, and per-mode extras
 * (image thumbnail/OCR, backend + session pickers). App.jsx handles the
 * drag-to-reselect-a-region crosshair on the same screen (image mode only)
 * and hides this component for the duration of that drag.
 *
 * The "select text anywhere → Refine" flow lives entirely in
 * SelectionPopup.jsx now, as a sibling of this component in App.jsx — it
 * works whether or not a panel is even open, so it isn't this component's concern.
 */
export default function Panel({
  data, mode, selectionRect, onClose, minimized, onMinimize, pinned, onTogglePin,
  initialQuestion, onHasContentChange, onBusyChange, onAnswerReady, onSwitchMode,
  cropHistory = [], activeCropIndex = 0, onSelectCrop,
  showImageCropActions = false, onExtractTextFromCrop, onSaveScreenshotFromCrop,
  extractTextBusy = false, saveScreenshotBusy = false,
  onManageBackends,
}) {
  const [thread, setThread] = useState([]); // [{q, a}]
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  // The just-sent question, shown immediately (above the thinking bubble) while
  // its answer generates so you can see what's being worked on; cleared once the
  // answer lands in `thread`. Only set for fresh sends — regenerate already has
  // the question in the thread.
  const [pendingQuestion, setPendingQuestion] = useState(null);
  const [backend, setBackend] = useState(() => localStorage.getItem(BACKEND_KEY) || "");
  // Chosen model within `backend` (empty = use the backend's default/env). Kept
  // per backend in localStorage 'peek-model:<id>' and threaded into ask().
  const [model, setModel] = useState(() => localStorage.getItem(modelKey(backend)) || "");
  const { available: installedBackends, loading: backendsLoading, hasAny: hasBackend } = useInstalledBackends();
  // Every answered question is saved (see main.cjs's peek:ask handler); this
  // dropdown lets a fresh capture continue an earlier conversation instead of
  // always starting a new one. Defaults to "New chat" (sessionId === null).
  const [sessions, setSessions] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrDone, setOcrDone] = useState(false);
  const [focused, setFocused] = useState(false);
  const [isMac, setIsMac] = useState(false); // ⌘ vs Ctrl in the minimize hint
  useEffect(() => { loadPlatformInfo().then((info) => setIsMac(!!info.isMac)); }, []);

  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const panelRef = useRef(null);
  const openedAt = useRef(Date.now());
  const minimizedRef = useRef(minimized);
  const askGenRef = useRef(0);
  const { listening, voiceError, voiceLoading, toggleVoice } = useVoiceInput(input, setInput);

  useEffect(() => { minimizedRef.current = minimized; }, [minimized]);
  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);

  // Draggable by the header — null means "use the default bottom-center
  // anchor" (works with the card's dynamic height with no measuring needed);
  // once the user actually drags it at least once, it switches to explicit
  // top/left tracking from wherever they dropped it. Not persisted across
  // sessions — a fresh Panel (new bubble-menu choice) always starts centered again.
  const [dragPos, setDragPos] = useState(null);
  // Remembers where the bar was sitting so a text ↔ image tab click doesn't
  // recompute layout and jump the whole shell to a new anchor.
  const layoutAnchorRef = useRef(null);
  const layoutFreezeRef = useRef(null);
  const prevModeRef = useRef(mode);
  const dragStateRef = useRef(null); // {startX, startY, origX, origY} while a header drag is in progress

  const onHeaderMouseDown = (e) => {
    if (e.target.closest("button")) return; // Pin/Close clicks shouldn't start a drag
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragStateRef.current = { startX: e.clientX, startY: e.clientY, origX: rect.left, origY: rect.top };
  };

  useEffect(() => {
    const onMove = (e) => {
      const d = dragStateRef.current;
      if (!d) return;
      const w = panelRef.current?.offsetWidth ?? EXPANDED_W;
      const x = Math.min(Math.max(d.origX + (e.clientX - d.startX), DRAG_EDGE_MARGIN - w), window.innerWidth - DRAG_EDGE_MARGIN);
      const y = Math.min(Math.max(d.origY + (e.clientY - d.startY), 0), window.innerHeight - DRAG_EDGE_MARGIN);
      setDragPos({ x, y });
    };
    const onUp = () => { dragStateRef.current = null; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  useEffect(() => { inputRef.current?.focus(); }, []);
  // A fresh crop should re-anchor the panel — don't keep a manual drag
  // position from the previous region. Mode tab switches alone must not move
  // the bar (that was part of the text ↔ image blink).
  useEffect(() => {
    if (mode === "image" && selectionRect) setDragPos(null);
  }, [selectionRect, mode]);
  useEffect(() => { localStorage.setItem(BACKEND_KEY, backend); }, [backend]);
  // Model follows the selected backend: load that backend's saved choice when
  // it changes, and persist the current choice.
  useEffect(() => { setModel(localStorage.getItem(modelKey(backend)) || ""); }, [backend]);
  useEffect(() => { if (model) localStorage.setItem(modelKey(backend), model); }, [backend, model]);
  useEffect(() => {
    if (backendsLoading) return;
    const next = resolveBackend(backend, installedBackends);
    if (next && next !== backend) setBackend(next);
    else if (!next && backend) setBackend("");
  }, [backendsLoading, installedBackends]);
  useEffect(() => {
    window.peekDesktop.sessions?.list().then((list) => setSessions(list || [])).catch(() => {});
  }, []);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [thread, busy]);

  // Lets App.jsx tell an empty, never-used session apart from a real one —
  // clicking the bubble ends the former (nothing worth keeping) but only
  // ever reveals the latter, never hides it (see App.jsx's onMouseUp).
  useEffect(() => {
    onHasContentChange?.(thread.length > 0 || busy || input.trim().length > 0);
  }, [thread, busy, input, onHasContentChange]);

  // Voice mode auto-starts listening once you've actually expanded past the
  // bubble — no manual mic click needed to begin dictating, but it doesn't
  // start talking into a bubble you haven't opened yet. Guards on `listening`
  // itself (read fresh, not a dependency) so re-expanding after a minimize
  // doesn't re-toggle an already-running session back off.
  useEffect(() => {
    if (mode === "voice" && !minimized && !listening) toggleVoice();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, minimized]);

  const onPickSession = async (id) => {
    if (!id) { setSessionId(null); setThread([]); return; }
    const s = await window.peekDesktop.sessions.get(id);
    if (!s) return;
    setSessionId(s.id);
    setBackend(s.backend || resolveBackend("", installedBackends) || "");
    setThread((s.thread || []).map((t) => ({ q: t.q, a: t.a })));
  };

  // Escape is handled centrally in App.jsx (with clear precedence over
  // SelectionPopup, which should dismiss first if both are somehow up at
  // once) rather than here — see its top-level keydown effect.

  // Attaching image context is keyed off `data` existing, not `mode ===
  // "image"` — "Chat with screen"/"Summarize screen" (App.jsx's
  // chooseTextStarter) deliberately show as plain Text mode (no image-only
  // OCR/Attach buttons) while still silently carrying a screenshot as
  // context. Each Panel's mode is fixed for its whole lifetime now (no more
  // in-panel switching), so there's no risk of this leaking stale image
  // context into an unrelated conversation the way an in-panel tab switch once could.
  const send = async (overrideQuestion) => {
    const question = (overrideQuestion ?? input).trim();
    if (!question || busy || !backend) return;
    setInput("");
    setBusy(true);
    setPendingQuestion(question);
    const gen = ++askGenRef.current;
    const history = thread.map((t) => ({ q: t.q, a: t.a }));
    const res = await window.peekDesktop.ask({
      ...(data ? { imagePath: data.imagePath, thumbDataUrl: data.thumbDataUrl } : {}),
      question, history, backend, model: model || undefined, sessionId,
      // Text mode silently snapshots the screen as optional context (main-side).
      screenContext: mode === "text",
    });
    if (gen !== askGenRef.current) return;
    if (res?.sessionId && res.sessionId !== sessionId) setSessionId(res.sessionId);
    const answer = res?.error ? `Couldn't get an answer: ${res.error}` : (res?.text || "(no answer)");
    setThread((t) => [...t, { q: question, a: answer }]);
    setPendingQuestion(null);
    setBusy(false);
    if (minimizedRef.current) {
      onAnswerReady?.({ question, error: res?.error });
    }
  };

  // Regenerate — only ever the last turn (re-branching an earlier one would
  // mean discarding everything after it, a bigger feature than asked for
  // here). Replaces that turn's answer in place rather than appending a new one.
  const regenerate = async (index) => {
    const turn = thread[index];
    if (!turn || busy) return;
    setBusy(true);
    const gen = ++askGenRef.current;
    const history = thread.slice(0, index).map((t) => ({ q: t.q, a: t.a }));
    const res = await window.peekDesktop.ask({
      ...(data ? { imagePath: data.imagePath, thumbDataUrl: data.thumbDataUrl } : {}),
      question: turn.q, history, backend, model: model || undefined, sessionId,
      screenContext: mode === "text",
    });
    if (gen !== askGenRef.current) return;
    if (res?.sessionId && res.sessionId !== sessionId) setSessionId(res.sessionId);
    const answer = res?.error ? `Couldn't get an answer: ${res.error}` : (res?.text || "(no answer)");
    setThread((t) => t.map((tt, i) => (i === index ? { q: tt.q, a: answer } : tt)));
    setBusy(false);
    if (minimizedRef.current) {
      onAnswerReady?.({ question: turn.q, error: res?.error });
    }
  };

  // A bubble-menu starter (e.g. "Summarize screen") arrives with a preset
  // first question — fires once, on mount, same as a real Send.
  useEffect(() => {
    if (initialQuestion) send(initialQuestion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const extractText = async () => {
    if (ocrBusy || !data) return;
    setOcrBusy(true);
    const res = await window.peekDesktop.ask({
      imagePath: data.imagePath, question: OCR_PROMPT, history: [], backend, model: model || undefined,
      sessionId, thumbDataUrl: data.thumbDataUrl,
    });
    setOcrBusy(false);
    if (res?.error || !res?.text) {
      setThread((t) => [...t, { q: "Extract text (OCR)", a: `Couldn't extract text: ${res?.error || "no text found"}` }]);
      return;
    }
    await window.peekDesktop.copyToClipboard(res.text);
    if (res?.sessionId && res.sessionId !== sessionId) setSessionId(res.sessionId);
    setThread((t) => [...t, { q: "Extract text (OCR)", a: res.text }]);
    setOcrDone(true);
    setTimeout(() => setOcrDone(false), 1800);
  };

  const onInputKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const placeholder = mode === "image" ? "Ask about this…"
    : mode === "voice" && voiceLoading ? "Loading voice model…"
    : mode === "voice" && listening ? "Listening… speak now"
    : "Ask me anything…";

  // The composer auto-minimizes the instant it loses focus — i.e. the OS
  // shifts focus away from this window entirely (clicking through the
  // click-through backdrop into whatever app is underneath, or alt-tabbing
  // away). This rides main.cjs's native `overlayWin.on("blur")` rather than
  // the renderer's own `window` blur event — more reliable for this
  // always-on-top, click-through window — so it only fires on a real OS-level
  // focus change, never on focus moving between elements inside this window
  // (clicking Send/mode buttons/dropdowns, drag-reselecting the backdrop).
  // Grace period after opening — capture-now's hide/show and the first focus
  // shift can fire a spurious overlay blur that would instantly minimize the
  // panel before the user ever sees it.
  useEffect(() => {
    if (!minimized) openedAt.current = Date.now();
  }, [minimized, selectionRect]);

  // Only text (chat) mode auto-minimizes when focus leaves the overlay —
  // image mode keeps the modal up so you can click around the screen while
  // reading/asking about the capture; it's only ever hidden during a crop drag
  // (handled in App.jsx), never by a focus change.
  useEffect(() => {
    if (minimized || pinned || mode !== "text") return;
    return window.peekDesktop.onOverlayBlur?.(() => {
      if (Date.now() - openedAt.current < 600) return;
      onMinimize?.();
    });
  }, [minimized, onMinimize, pinned, mode]);

  const hasThread = thread.length > 0 || busy;
  // Once the text/image bar is open, keep the composer shell stable — clicking
  // a mode tab blurs the textarea, and without this that collapse would flash
  // the whole chatbar dark/light on every text ↔ image switch.
  const pinnedComposer = !minimized && (mode === "text" || mode === "image");
  const expanded = focused || input.trim().length > 0 || busy || hasThread || mode === "voice" || pinnedComposer;
  const isMinimal = !expanded;
  const panelWidth = isMinimal ? COMPACT_W : EXPANDED_W;

  useEffect(() => {
    if (expanded && !minimized) inputRef.current?.focus();
  }, [expanded, minimized]);

  const isComposerOnly = expanded && !hasThread;
  const showToolbar = input.trim().length > 0 || busy;

  const heightEstimate = (isMinimal ? 52 : hasThread ? 300 : showToolbar ? 100 : 52)
    + (showImageCropActions ? CROP_ACTIONS_EXTRA : 0);

  if (prevModeRef.current !== mode) {
    const tabSwitch = (prevModeRef.current === "text" || prevModeRef.current === "image")
      && (mode === "text" || mode === "image");
    if (tabSwitch && layoutAnchorRef.current) layoutFreezeRef.current = layoutAnchorRef.current;
    else if (!tabSwitch) layoutFreezeRef.current = null;
    prevModeRef.current = mode;
  }
  if (selectionRect) layoutFreezeRef.current = null;

  // Text mode has no crop to anchor to, so it stays in the fixed bottom-center
  // slot; only image mode is positioned off the crop (computeImagePanelLayout).
  const defaultPos = { left: "50%", bottom: 32, transform: "translateX(-50%)" };
  const imageLayout = mode === "image" && !dragPos && !layoutFreezeRef.current
    ? computeImagePanelLayout(selectionRect, { width: panelWidth, heightEstimate })
    : null;

  const panelPos = dragPos
    ? { left: dragPos.x, top: dragPos.y }
    : layoutFreezeRef.current?.pos ?? imageLayout?.pos ?? defaultPos;
  const panelMaxHeight = layoutFreezeRef.current?.maxHeight ?? imageLayout?.maxHeight ?? "74vh";
  layoutAnchorRef.current = { pos: panelPos, maxHeight: panelMaxHeight, width: panelWidth };

  const wrapperStyle = {
    position: "fixed",
    ...panelPos,
    width: panelWidth,
    maxWidth: "92vw",
    zIndex: 52,
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    gap: 8,
    cursor: "default",
    transition: "width 0.28s cubic-bezier(0.22, 1, 0.36, 1), top 0.28s cubic-bezier(0.22, 1, 0.36, 1), left 0.28s cubic-bezier(0.22, 1, 0.36, 1), transform 0.28s cubic-bezier(0.22, 1, 0.36, 1), bottom 0.28s cubic-bezier(0.22, 1, 0.36, 1)",
  };

  const shellStyle = {
    width: "100%",
    maxHeight: panelMaxHeight,
    cursor: "default",
    display: "flex",
    flexDirection: "column",
    transition: "width 0.28s cubic-bezier(0.22, 1, 0.36, 1), max-height 0.28s ease, box-shadow 0.28s ease, background 0.28s ease, border-radius 0.28s ease",
    ...(isMinimal ? {
      background: "#17171B",
      borderRadius: 14,
      overflow: "visible",
      border: "1px solid rgba(255,255,255,0.14)",
      boxShadow: "0 14px 44px rgba(0,0,0,0.62), 0 0 0 1px rgba(255,255,255,0.06)",
    } : isComposerOnly ? {
      background: "#FFFFFF",
      borderRadius: 14,
      overflow: "hidden",
      border: "1px solid rgba(0,0,0,0.09)",
      boxShadow: "0 14px 40px rgba(0,0,0,0.38), 0 0 0 1px rgba(255,255,255,0.6)",
    } : {
      background: "#fff",
      borderRadius: 18,
      overflow: "hidden",
      border: `1px solid ${LIGHT.border}`,
      boxShadow: "0 24px 64px rgba(0,0,0,0.38), 0 0 0 1px rgba(255,255,255,0.5)",
    }),
  };

  const closeBtn = (compact) => (
    <button
      className="peek-interactive"
      onClick={onClose}
      title="Close"
      style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        width: compact ? 28 : 32, height: compact ? 28 : 32,
        borderRadius: "50%",
        background: compact ? "rgba(255,255,255,0.1)" : LIGHT.borderSoft,
        color: compact ? "rgba(255,255,255,0.75)" : "#3A3833",
        border: "none", cursor: "pointer", flexShrink: 0,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "#D64545"; e.currentTarget.style.color = "#fff"; }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = compact ? "rgba(255,255,255,0.1)" : LIGHT.borderSoft;
        e.currentTarget.style.color = compact ? "rgba(255,255,255,0.75)" : "#3A3833";
      }}
    ><IconClose /></button>
  );

  const pinBtn = (light) => (
    <button
      className="peek-interactive"
      onClick={onTogglePin}
      title={pinned
        ? "Unpin — this will auto-hide again when you click away"
        : "Pin — keep this open when you click away to another app"}
      style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        width: light ? 28 : 30, height: light ? 28 : 30,
        borderRadius: "50%", background: pinned ? "#000" : light ? LIGHT.borderSoft : LIGHT.borderSoft,
        color: pinned ? "#fff" : "#3A3833", border: "none", cursor: "pointer", flexShrink: 0,
      }}
    ><IconPin /></button>
  );

  const minimizeBtn = (light) => (
    <button
      className="peek-interactive"
      onClick={onMinimize}
      title={`Minimize (${isMac ? "⌘" : "Ctrl"} ↓) — keep working, we'll notify you when the answer is ready`}
      style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        width: light ? 28 : 30, height: light ? 28 : 30,
        borderRadius: "50%",
        background: light ? "rgba(255,255,255,0.1)" : LIGHT.borderSoft,
        color: light ? "rgba(255,255,255,0.75)" : "#3A3833",
        border: "none", cursor: "pointer", flexShrink: 0,
      }}
    ><IconMinimize style={{ width: 14, height: 14 }} /></button>
  );

  const composerTextarea = (dark) => (
    <textarea
      ref={inputRef}
      className={dark ? "peek-input-dark" : undefined}
      value={input}
      onChange={(e) => setInput(e.target.value)}
      onKeyDown={onInputKey}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      placeholder={placeholder}
      rows={1}
      style={{
        flex: 1, minWidth: 0, resize: "none", background: "transparent", border: "none", outline: "none",
        color: dark ? "#F5F5F5" : "#3A3833", fontSize: 14, fontWeight: 500, fontFamily: "inherit",
        maxHeight: 120, padding: "5px 0",
      }}
    />
  );

  const sendBtn = (dark) => (
    <button onClick={() => send()} disabled={busy || !input.trim() || !backend} style={{
      width: 32, height: 32, borderRadius: "50%",
      background: dark ? "#fff" : "#000", border: "none",
      boxShadow: dark ? "none" : "0 4px 12px rgba(0,0,0,0.2)",
      display: "flex", alignItems: "center", justifyContent: "center",
      cursor: busy ? "default" : "pointer",
      opacity: busy || !input.trim() || !backend ? 0.35 : 1, flexShrink: 0,
    }}>
      <IconArrowUp style={{ color: dark ? "#111" : "#fff", width: 15, height: 15 }} />
    </button>
  );

  // Quick input-mode switch shown right in the chat bar so you can jump
  // straight from a typed question to a screenshot (or voice) without going
  // back to the bubble menu. Switching hands off to App.jsx, which starts the
  // chosen mode (image → capture + region pick) in a fresh session.
  const modeSwitchEl = (dark) => (
    <ModeSwitch mode={mode} onSwitch={onSwitchMode} dark={dark} />
  );

  const composerToolbar = (
    <div style={{
      maxHeight: showToolbar ? 44 : 0, opacity: showToolbar ? 1 : 0, overflow: "hidden",
      transition: `max-height 0.25s ease, opacity 0.2s ease ${showToolbar ? "0.04s" : "0s"}`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: isComposerOnly ? "0 2px 2px" : "6px 10px 0" }}>
        {mode === "image" && data && (
          <>
            {cropHistory.length > 1 ? (
              <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                {cropHistory.map((crop, i) => (
                  <button
                    key={`${crop.imagePath}-${i}`}
                    type="button"
                    title={`Crop ${i + 1}`}
                    onClick={() => onSelectCrop?.(i)}
                    style={{
                      width: 26, height: 18, borderRadius: 5, padding: 0, overflow: "hidden", cursor: "pointer",
                      border: i === activeCropIndex ? "2px solid #9333EA" : `1px solid ${LIGHT.border}`,
                      background: "transparent", flexShrink: 0,
                    }}
                  >
                    <img src={crop.thumbDataUrl} alt="" style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }} />
                  </button>
                ))}
              </div>
            ) : (
              <div style={{
                width: 26, height: 18, borderRadius: 5, flexShrink: 0, overflow: "hidden",
                border: `1px solid ${LIGHT.border}`,
              }}>
                <img src={data.thumbDataUrl} alt="" style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }} />
              </div>
            )}
            <PillIconBtn title="Attach (coming soon)"><IconAttachment /></PillIconBtn>
            <PillIconBtn
              title={ocrBusy ? "Extracting text…" : ocrDone ? "Copied to clipboard!" : "Extract text to clipboard"}
              onClick={extractText} active={ocrDone} disabled={ocrBusy}
            ><IconScanText /></PillIconBtn>
          </>
        )}
        <BackendPicker value={backend} onChange={setBackend} onManage={onManageBackends} />
        <ModelPicker backendId={backend} value={model} onChange={setModel} />
        {sessions.length > 0 && (
          <PillDropdown
            value={sessionId || ""}
            onChange={onPickSession}
            options={[{ value: "", label: "New chat" }, ...sessions.map((s) => ({ value: s.id, label: s.title || "Untitled chat" }))]}
            minWidth={140}
          />
        )}
      </div>
    </div>
  );

  return (
    <div
      data-peek-ui="true"
      className={`peek-panel-shell${minimized ? " peek-panel-shell--hidden" : ""}`}
      style={{ ...wrapperStyle, pointerEvents: minimized ? "none" : "auto" }}
      aria-hidden={minimized}
      onMouseDown={(e) => { if (!minimized) e.stopPropagation(); }}
    >
    <div
      ref={panelRef}
      style={shellStyle}
    >
      {isMinimal ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 10px 9px 12px" }}>
          {onSwitchMode && modeSwitchEl(true)}
          {composerTextarea(true)}
          {sendBtn(true)}
          {minimizeBtn(true)}
          {closeBtn(true)}
        </div>
      ) : isComposerOnly ? (
        <div style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: showToolbar ? 8 : 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {onSwitchMode && modeSwitchEl(false)}
            {composerTextarea(false)}
            {mode === "voice" && (
              <PillIconBtn
                title={listening ? "Stop listening" : "Start listening"}
                onClick={toggleVoice} active={listening}
              ><IconMic /></PillIconBtn>
            )}
            {sendBtn(false)}
            {minimizeBtn(true)}
            {pinBtn(true)}
            {closeBtn(false)}
          </div>
          {composerToolbar}
        </div>
      ) : (
        <>
          <div
            onMouseDown={onHeaderMouseDown}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexShrink: 0,
              padding: "10px 14px", borderBottom: `1px solid ${LIGHT.border}`, cursor: "grab",
            }}
          >
            <span style={{ fontSize: 12.5, fontWeight: 700, color: LIGHT.muted, letterSpacing: "0.02em" }}>
              {mode === "image" ? "Image chat" : mode === "voice" ? "Voice chat" : "Chat"}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {pinBtn(false)}
              {minimizeBtn(false)}
              {closeBtn(false)}
            </div>
          </div>

          <div ref={scrollRef} className="peek-scroll peek-selectable" style={{
            flex: 1, minHeight: 0, overflowY: "auto", padding: "14px 14px 8px",
            display: "flex", flexDirection: "column", gap: 16,
            background: LIGHT.bg,
          }}>
            {thread.map((turn, i) => (
              <ChatTurn
                key={i}
                question={turn.q}
                answer={turn.a}
                isLast={i === thread.length - 1}
                busy={busy}
                onRegenerate={() => regenerate(i)}
              />
            ))}
            {busy && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {pendingQuestion && <UserBubble text={pendingQuestion} />}
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <ThinkingBubble />
                  <button
                    onClick={onMinimize}
                    style={{
                      background: LIGHT.borderSoft, border: `1px solid ${LIGHT.border}`, borderRadius: 999,
                      padding: "6px 12px", fontSize: 12, fontWeight: 600, color: LIGHT.text, cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >Minimize</button>
                </div>
              </div>
            )}
          </div>

          {voiceError && (
            <div style={{
              fontSize: 12, color: "#fff", background: "rgba(196,82,47,0.92)", padding: "4px 12px",
              margin: "0 12px 8px", borderRadius: 999, flexShrink: 0, alignSelf: "flex-start",
            }}>{voiceError}</div>
          )}

          <div style={{ padding: "10px 12px 12px", flexShrink: 0, background: "#fff", borderTop: `1px solid ${LIGHT.border}` }}>
            <div style={{
              borderRadius: 14, border: `1px solid ${LIGHT.border}`, background: LIGHT.bg, overflow: "hidden",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px 7px 12px" }}>
                {onSwitchMode && modeSwitchEl(false)}
                {composerTextarea(false)}
                {mode === "voice" && (
                  <PillIconBtn
                    title={listening ? "Stop listening" : "Start listening"}
                    onClick={toggleVoice} active={listening}
                  ><IconMic /></PillIconBtn>
                )}
                {sendBtn(false)}
              </div>
              {showToolbar && (
                <div style={{ borderTop: `1px solid ${LIGHT.borderSoft}`, paddingBottom: 6 }}>
                  {composerToolbar}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>

    {showImageCropActions && (
      <div
        className="peek-pop-in peek-interactive"
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          alignSelf: "center",
          display: "flex",
          alignItems: "stretch",
          maxWidth: "100%",
          borderRadius: 999,
          overflow: "hidden",
          background: "rgba(20,10,25,0.92)",
          boxShadow: "0 8px 22px rgba(0,0,0,0.35)",
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          onClick={onExtractTextFromCrop}
          disabled={extractTextBusy}
          style={{
            display: "flex", alignItems: "center", gap: 7,
            padding: "8px 14px", border: "none",
            background: "transparent",
            color: "#fff", fontSize: 12.5, fontWeight: 600, cursor: "pointer",
            whiteSpace: "nowrap", opacity: extractTextBusy ? 0.6 : 1,
          }}
        >
          <IconScanText style={{ width: 15, height: 15, flexShrink: 0 }} />
          Copy text
        </button>
        <div style={{ width: 1, alignSelf: "stretch", background: "rgba(255,255,255,0.14)", margin: "8px 0" }} />
        <button
          type="button"
          onClick={onSaveScreenshotFromCrop}
          disabled={saveScreenshotBusy}
          title="Save cropped screenshot"
          style={{
            display: "flex", alignItems: "center", gap: 7,
            padding: "8px 14px", border: "none",
            background: "transparent",
            color: "#fff", fontSize: 12.5, fontWeight: 600, cursor: "pointer",
            whiteSpace: "nowrap", opacity: saveScreenshotBusy ? 0.6 : 1,
          }}
        >
          <IconDownload style={{ width: 15, height: 15, flexShrink: 0 }} />
          {saveScreenshotBusy ? "Saving…" : "Save screenshot"}
        </button>
      </div>
    )}
    </div>
  );
}

const MODE_SWITCH_ITEMS = [
  { key: "text", Icon: IconChatTab, title: "Text" },
  { key: "image", Icon: IconImage, title: "Screenshot" },
  { key: "voice", Icon: IconMic, title: "Voice" },
];

function ModeSwitch({ mode, onSwitch, dark }) {
  const activeIdx = MODE_SWITCH_ITEMS.findIndex((i) => i.key === mode);
  const idx = activeIdx < 0 ? 0 : activeIdx;
  const pillW = 26;
  const pillH = 24;
  const gap = 2;
  const pad = 2;
  return (
    <div
      title="Switch input"
      style={{
        position: "relative", display: "flex", gap, padding: pad, borderRadius: 999, flexShrink: 0,
        background: dark ? "rgba(255,255,255,0.09)" : "#ECECEC",
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute", top: pad, left: pad + idx * (pillW + gap),
          width: pillW, height: pillH, borderRadius: 999,
          background: dark ? "#fff" : "#000",
          transition: "left 0.22s cubic-bezier(0.22, 1, 0.36, 1), background 0.18s ease",
          pointerEvents: "none",
        }}
      />
      {MODE_SWITCH_ITEMS.map(({ key, Icon, title }) => {
        const active = mode === key;
        return (
          <button
            key={key}
            type="button"
            title={title}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { if (!active) onSwitch?.(key); }}
            style={{
              position: "relative", zIndex: 1,
              width: pillW, height: pillH, borderRadius: 999, border: "none",
              cursor: active ? "default" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "transparent",
              color: active ? (dark ? "#111" : "#fff") : (dark ? "rgba(255,255,255,0.72)" : "#6B6B6B"),
              transition: "color 0.18s ease",
            }}
          >
            <Icon style={{ width: 14, height: 14 }} />
          </button>
        );
      })}
    </div>
  );
}

function PillIconBtn({ children, title, onClick, active, disabled }) {
  return (
    <button type="button" onClick={onClick} title={title} disabled={disabled} style={{
      display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 28,
      borderRadius: 999,
      background: active ? "#000" : "linear-gradient(180deg, #fff 7%, rgba(255,255,255,0) 66%), #F2F2F2",
      boxShadow: active ? "0 6px 10px -4px rgba(0,0,0,0.3)" : "0 6px 10px -4px rgba(0,0,0,0.12), 0 0 0 1px #EEE",
      border: "none", color: active ? "#fff" : "#3A3833", cursor: onClick ? "pointer" : "default",
      opacity: disabled ? 0.5 : 1, flexShrink: 0,
    }}>
      {children}
    </button>
  );
}
