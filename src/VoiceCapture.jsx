import { useEffect, useRef, useState } from "react";
import { LIGHT, PAL } from "./theme.js";
import { useVoiceInput } from "./useVoiceInput.js";
import { useInstalledBackends } from "./useInstalledBackends.js";
import { BACKEND_KEY, resolveBackend, INSTALL_CLI_MESSAGE } from "./backends.js";
import { IconMic, IconClose, IconImage, IconChatTab } from "./Icons.jsx";

const MODE_ITEMS = [
  { key: "text", Icon: IconChatTab, title: "Text" },
  { key: "image", Icon: IconImage, title: "Screenshot" },
  { key: "voice", Icon: IconMic, title: "Voice" },
];

/**
 * Voice mode's whole UI — deliberately NOT the chat panel. A single floating
 * card: hold Ctrl (or press-and-hold the mic) to talk, release to send. Live
 * transcription streams in while you speak; on release the captured text is
 * sent as a one-shot query and the answer is shown below. No thread, no
 * composer — push-to-talk in, answer out.
 */
export default function VoiceCapture({ onClose, onSwitchMode }) {
  const [transcript, setTranscript] = useState("");
  const [answer, setAnswer] = useState(null);
  const [asking, setAsking] = useState(false);
  const [backend, setBackend] = useState(() => localStorage.getItem(BACKEND_KEY) || "");
  const { available: installedBackends, loading: backendsLoading } = useInstalledBackends();
  const { listening, voiceError, voiceLoading, toggleVoice, flushAndStop, stopVoice } = useVoiceInput(transcript, setTranscript);

  const boxRef = useRef(null);
  const ctrlDownRef = useRef(false);
  const capturingRef = useRef(false);

  useEffect(() => {
    if (backendsLoading) return;
    const next = resolveBackend(backend, installedBackends);
    if (next && next !== backend) setBackend(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendsLoading, installedBackends]);

  // Voice owns Ctrl for push-to-talk, so pause the global double-tap toggle
  // for as long as this card is open (restored on unmount).
  useEffect(() => {
    window.peekDesktop.suppressHotkey?.(true);
    boxRef.current?.focus();
    return () => window.peekDesktop.suppressHotkey?.(false);
  }, []);

  const submit = async (text) => {
    const q = (text || "").trim();
    if (!q) return;
    const be = resolveBackend(localStorage.getItem(BACKEND_KEY), installedBackends);
    if (!be) {
      window.peekDesktop.notify?.({ title: "Peek — no CLI installed", body: INSTALL_CLI_MESSAGE });
      return;
    }
    setAsking(true);
    setAnswer(null);
    const res = await window.peekDesktop.ask({ question: q, history: [], backend: be });
    setAsking(false);
    setAnswer(res?.error ? `Couldn't get an answer: ${res.error}` : (res?.text || "(no answer)"));
  };

  const startTalk = async () => {
    if (capturingRef.current || asking) return;
    capturingRef.current = true;
    setAnswer(null);
    setTranscript("");
    await toggleVoice();
    // Mic startup is async (getUserMedia). If the user already stopped while it
    // was still starting, the capture would otherwise begin *after* the stop and
    // get stuck listening — so tear it down now that startup is done.
    if (!capturingRef.current) stopVoice();
  };

  const stopTalk = async () => {
    if (!capturingRef.current) return;
    capturingRef.current = false;
    const text = await flushAndStop();
    if (text) submit(text);
  };

  // The mic button is click-to-toggle (Ctrl stays hold-to-talk): first click
  // starts listening, next click stops and sends. Robust to the async-start race
  // above, so a quick click can't leave it stuck listening.
  const toggleMic = () => {
    if (asking) return;
    if (capturingRef.current) stopTalk();
    else startTalk();
  };

  // Push-to-talk: hold Ctrl to record, release to send. keydown auto-repeats
  // while held, so the ref guards against restarting on every repeat.
  useEffect(() => {
    const onDown = (e) => {
      if (e.key !== "Control" || ctrlDownRef.current) return;
      ctrlDownRef.current = true;
      startTalk();
    };
    const onUp = (e) => {
      if (e.key !== "Control") return;
      ctrlDownRef.current = false;
      stopTalk();
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listening, asking]);

  const status = voiceLoading ? "Starting…"
    : listening ? "Listening… click to stop"
    : asking ? "Thinking…"
    : "Click the mic or hold Ctrl to talk";

  return (
    <div
      data-peek-ui="true"
      ref={boxRef}
      tabIndex={-1}
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        position: "fixed", left: "50%", bottom: 40, transform: "translateX(-50%)",
        width: 340, maxWidth: "92vw", zIndex: 52, outline: "none",
        background: LIGHT.surface,
        borderRadius: 20, border: `1px solid ${LIGHT.border}`,
        boxShadow: "0 24px 64px rgba(0,0,0,0.28), 0 0 0 1px rgba(255,255,255,0.6)",
        padding: 14, display: "flex", flexDirection: "column", gap: 14,
      }}
      className="peek-fade-in"
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: 2, padding: 3, borderRadius: 999, background: LIGHT.borderSoft }}>
          {MODE_ITEMS.map(({ key, Icon, title }) => {
            const active = key === "voice";
            return (
              <button
                key={key}
                type="button"
                title={title}
                onClick={() => { if (!active) onSwitchMode?.(key); }}
                style={{
                  width: 30, height: 26, borderRadius: 999, border: "none",
                  cursor: active ? "default" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: active ? PAL.coral : "transparent",
                  color: active ? "#fff" : LIGHT.icon,
                  transition: "background 0.15s ease, color 0.15s ease",
                }}
              ><Icon style={{ width: 15, height: 15 }} /></button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={onClose}
          title="Close"
          style={{
            width: 28, height: 28, borderRadius: "50%", border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            background: LIGHT.borderSoft, color: LIGHT.icon,
          }}
        ><IconClose /></button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, paddingTop: 4 }}>
        <button
          type="button"
          title={listening ? "Click to stop and send" : "Click to talk"}
          className={listening ? "peek-mic-pulse" : undefined}
          onMouseDown={(e) => e.preventDefault()}
          onClick={toggleMic}
          style={{
            width: 64, height: 64, borderRadius: "50%", border: "none", flexShrink: 0,
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            background: listening ? PAL.coral : "#fff",
            color: listening ? "#fff" : PAL.coral,
            boxShadow: listening ? "none" : `0 0 0 1px ${LIGHT.border}, 0 6px 18px rgba(0,0,0,0.12)`,
            transition: "background 0.18s ease, color 0.18s ease",
          }}
        ><IconMic style={{ width: 26, height: 26 }} /></button>
        <div style={{ fontSize: 13, fontWeight: 600, color: listening ? PAL.coral : LIGHT.muted }}>{status}</div>
      </div>

      <div style={{
        minHeight: 44, maxHeight: 110, overflowY: "auto", borderRadius: 12,
        background: LIGHT.bg, border: `1px solid ${LIGHT.borderSoft}`, padding: "9px 12px",
        fontSize: 13.5, lineHeight: 1.45, color: transcript ? LIGHT.text : LIGHT.muted,
        textAlign: transcript ? "left" : "center",
      }} className="peek-scroll peek-selectable">
        {transcript || (listening ? "Listening…" : "Your words appear here")}
      </div>

      {voiceError && (
        <div style={{ fontSize: 12, color: "#fff", background: "#C4522F", padding: "6px 11px", borderRadius: 10, textAlign: "center" }}>
          {voiceError}
        </div>
      )}

      {(asking || answer) && (
        <div style={{
          maxHeight: 200, overflowY: "auto", borderRadius: 12, padding: "11px 13px",
          background: "#fff", border: `1px solid ${LIGHT.border}`,
          color: LIGHT.text, fontSize: 13.5, lineHeight: 1.5, whiteSpace: "pre-wrap",
        }} className="peek-scroll peek-selectable">
          {asking ? "Thinking…" : answer}
        </div>
      )}
    </div>
  );
}
