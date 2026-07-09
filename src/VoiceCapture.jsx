import { useEffect, useRef, useState } from "react";
import { LIGHT } from "./theme.js";
import { useVoiceInput } from "./useVoiceInput.js";
import { useInstalledBackends } from "./useInstalledBackends.js";
import { BACKEND_KEY, resolveBackend, INSTALL_CLI_MESSAGE } from "./backends.js";
import { IconMic, IconImage, IconChatTab, IconArrowUp } from "./Icons.jsx";
import { loadPlatformInfo } from "./accelFormat.js";

export const VOICE_COMPACT_W = 186;

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

const MODE_ITEMS = [
  { key: "text", Icon: IconChatTab, title: "Text" },
  { key: "image", Icon: IconImage, title: "Screenshot" },
  { key: "voice", Icon: IconMic, title: "Voice" },
];

const BAR_PAD = "8px 10px";
const BTN = 32;

function ModeSwitch({ onSwitch }) {
  const pillW = 26;
  const pillH = 24;
  const gap = 2;
  const pad = 2;
  const activeIdx = MODE_ITEMS.findIndex((i) => i.key === "voice");
  return (
    <div
      title="Switch input"
      style={{
        position: "relative", display: "flex", gap, padding: pad, borderRadius: 999, flexShrink: 0,
        background: "#ECECEC",
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute", top: pad, left: pad + activeIdx * (pillW + gap),
          width: pillW, height: pillH, borderRadius: 999, background: "#000",
          transition: `left 0.22s ${EASE}`,
          pointerEvents: "none",
        }}
      />
      {MODE_ITEMS.map(({ key, Icon, title }) => {
        const active = key === "voice";
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
              color: active ? "#fff" : "#6B6B6B",
              transition: "color 0.18s ease",
            }}
          ><Icon style={{ width: 14, height: 14 }} /></button>
        );
      })}
    </div>
  );
}

/**
 * Compact voice row + tooltip — meant to live inside Panel's shell so the
 * outer width can ease between text (380px) and voice (186px) on mode switch.
 */
export function VoiceBar({ onSwitchMode }) {
  const [transcript, setTranscript] = useState("");
  const [answer, setAnswer] = useState(null);
  const [asking, setAsking] = useState(false);
  const [isMac, setIsMac] = useState(false);
  const [backend, setBackend] = useState(() => localStorage.getItem(BACKEND_KEY) || "");
  const { available: installedBackends, loading: backendsLoading } = useInstalledBackends();
  const { listening, voiceError, voiceLoading, toggleVoice, flushAndStop, stopVoice } = useVoiceInput(transcript, setTranscript);

  const focusRef = useRef(null);
  const pttDownRef = useRef(false);
  const capturingRef = useRef(false);

  useEffect(() => { loadPlatformInfo().then((info) => setIsMac(!!info.isMac)); }, []);

  useEffect(() => {
    if (backendsLoading) return;
    const next = resolveBackend(backend, installedBackends);
    if (next && next !== backend) setBackend(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendsLoading, installedBackends]);

  useEffect(() => {
    window.peekDesktop.suppressHotkey?.(true);
    focusRef.current?.focus();
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
    if (!capturingRef.current) stopVoice();
  };

  const stopTalk = async () => {
    if (!capturingRef.current) return;
    capturingRef.current = false;
    const text = await flushAndStop();
    if (text) submit(text);
  };

  const toggleMic = () => {
    if (asking) return;
    if (capturingRef.current || listening) stopTalk();
    else startTalk();
  };

  const onSend = () => {
    if (asking) return;
    if (capturingRef.current || listening) stopTalk();
    else if (transcript.trim()) submit(transcript);
  };

  useEffect(() => {
    const pttKey = isMac ? "Meta" : "Control";
    const onDown = (e) => {
      if (e.key !== pttKey || pttDownRef.current) return;
      pttDownRef.current = true;
      startTalk();
    };
    const onUp = (e) => {
      if (e.key !== pttKey) return;
      pttDownRef.current = false;
      stopTalk();
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listening, asking, isMac]);

  const canSend = !asking && (listening || !!transcript.trim()) && !!resolveBackend(backend, installedBackends);
  const tooltipText = asking ? "Thinking…"
    : answer ? answer
    : voiceLoading ? "Starting…"
    : transcript || (listening ? "Listening…" : "");
  const showTooltip = !!(tooltipText || voiceError);

  return (
    <div
      ref={focusRef}
      tabIndex={-1}
      style={{ display: "flex", flexDirection: "column", outline: "none" }}
    >
      <div
        aria-hidden={!showTooltip}
        style={{
          overflow: "hidden",
          maxHeight: showTooltip ? 220 : 0,
          opacity: showTooltip ? 1 : 0,
          marginBottom: showTooltip ? 8 : 0,
          transition: `max-height 0.32s ${EASE}, opacity 0.26s ease, margin-bottom 0.32s ${EASE}`,
        }}
      >
        <div style={{
          padding: "9px 13px", borderRadius: 12,
          background: "#fff", border: `1px solid ${LIGHT.border}`,
          boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
          fontSize: 13.5, lineHeight: 1.45,
          color: voiceError ? "#C4522F" : LIGHT.text,
          whiteSpace: "pre-wrap",
        }}>
          {voiceError || tooltipText}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: BAR_PAD }}>
        <ModeSwitch onSwitch={onSwitchMode} />
        <button
          type="button"
          title={listening ? "Stop and send" : `Talk (${isMac ? "hold ⌘" : "hold Ctrl"})`}
          className={listening ? "peek-mic-pulse" : undefined}
          onMouseDown={(e) => e.preventDefault()}
          onClick={toggleMic}
          disabled={asking || voiceLoading}
          style={{
            width: BTN, height: BTN, borderRadius: "50%", border: "none", flexShrink: 0,
            cursor: asking ? "default" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            background: listening ? "#000" : "linear-gradient(180deg, #fff 7%, rgba(255,255,255,0) 66%), #F2F2F2",
            boxShadow: listening ? "0 6px 10px -4px rgba(0,0,0,0.3)" : "0 6px 10px -4px rgba(0,0,0,0.12), 0 0 0 1px #EEE",
            color: listening ? "#fff" : "#3A3833",
            opacity: asking || voiceLoading ? 0.5 : 1,
            transition: `background 0.22s ${EASE}, color 0.22s ${EASE}, box-shadow 0.22s ${EASE}`,
          }}
        ><IconMic style={{ width: 16, height: 16 }} /></button>
        <button
          type="button"
          title="Send"
          onClick={onSend}
          disabled={!canSend}
          style={{
            width: BTN, height: BTN, borderRadius: "50%",
            background: "#000", border: "none",
            boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: canSend ? "pointer" : "default",
            opacity: canSend ? 1 : 0.35, flexShrink: 0,
            transition: `opacity 0.22s ${EASE}`,
          }}
        ><IconArrowUp style={{ color: "#fff", width: 15, height: 15 }} /></button>
      </div>
    </div>
  );
}

// Standalone mount (bubble menu entry) — fixed at bottom like the text bar.
export default function VoiceCapture({ onSwitchMode }) {
  return (
    <div
      data-peek-ui="true"
      tabIndex={-1}
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        position: "fixed", left: "50%", bottom: 32, transform: "translateX(-50%)",
        width: VOICE_COMPACT_W, zIndex: 52, outline: "none",
        background: "#FFFFFF",
        borderRadius: 14,
        border: "1px solid rgba(0,0,0,0.09)",
        boxShadow: "0 14px 40px rgba(0,0,0,0.38), 0 0 0 1px rgba(255,255,255,0.6)",
        transition: `width 0.32s ${EASE}, box-shadow 0.28s ${EASE}`,
      }}
    >
      <VoiceBar onSwitchMode={onSwitchMode} />
    </div>
  );
}
