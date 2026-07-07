import { useEffect, useMemo, useRef, useState } from "react";
import { LIGHT } from "./theme.js";
import { RichText } from "./Markdown.jsx";
import { ThinkingBubble } from "./ChatTurn.jsx";
import { getRefineActions } from "./refineContext.js";
import { anchorRefinePopup } from "./refinePosition.js";
import SaveAsMenu from "./SaveAsMenu.jsx";
import {
  IconClose, IconPeek, IconSettings, IconArrowUp,
} from "./Icons.jsx";

import { BACKEND_KEY, resolveBackend, INSTALL_CLI_MESSAGE } from "./backends.js";
import { useInstalledBackends } from "./useInstalledBackends.js";

const POPUP_WIDTH = 420;

function stripRefineOutput(text) {
  let t = String(text || "").trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```[^\n]*\n?/, "").replace(/\n?```$/, "").trim();
  }
  return t;
}

const shimmerLine = {
  height: 10,
  borderRadius: 5,
  marginBottom: 10,
  background: "linear-gradient(90deg, #EDE9E3 0%, #F7F4EF 45%, #EDE9E3 90%)",
  backgroundSize: "200% 100%",
  animation: "peek-refine-shimmer 1.4s ease-in-out infinite",
};

const smallBtnStyle = {
  background: LIGHT.surface, color: LIGHT.text, border: `1px solid ${LIGHT.border}`,
  borderRadius: 7, padding: "6px 12px", fontSize: 12.5, fontWeight: 600, cursor: "pointer",
};

const closeBtnStyle = {
  position: "absolute", top: 10, right: 10, width: 26, height: 26, borderRadius: "50%",
  display: "flex", alignItems: "center", justifyContent: "center",
  border: "none", background: "transparent", color: LIGHT.muted, cursor: "pointer", flexShrink: 0,
};

/**
 * The "select text anywhere → Refine" quick-action popup, anchored at
 * wherever the selection was made. Independent of whatever else Peek is
 * currently showing (bubble / menu / picking / a panel) — selecting text
 * works any time Peek is active, not just while a panel happens to be open,
 * so this is a sibling of Panel in App.jsx, not nested inside it.
 *
 * Three views: "palette" (search + quick actions), "answer" (one-shot
 * result — editable, Copy/Replace/Regenerate/Chat ahead), "chat" (Chat
 * ahead's continued back-and-forth, its own bubble thread + composer, still
 * anchored at the same spot rather than opening the separate Panel).
 * Regenerate deliberately does NOT re-run anything itself — it just goes
 * back to "palette" against the same selectedText so you can pick a
 * different action (or the same one again).
 */
export default function SelectionPopup({
  selectedText, selectionPos, onClear,
}) {
  const { available: installedBackends } = useInstalledBackends();
  const [view, setView] = useState("palette"); // "palette" | "answer" | "chat"
  const [paletteQuery, setPaletteQuery] = useState("");
  const [paletteHighlight, setPaletteHighlight] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [actionLabel, setActionLabel] = useState(""); // whichever action produced `answer` — the first bubble's "question" once in Chat ahead
  const [answer, setAnswer] = useState(null); // raw answer from the CLI
  const [edited, setEdited] = useState(""); // editable copy shown/copied/replaced from
  const [replaceBusy, setReplaceBusy] = useState(false);
  const [replaceError, setReplaceError] = useState(null);
  const [chatThread, setChatThread] = useState([]); // [{q, a}] — Chat ahead's continued conversation
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);

  const chatScrollRef = useRef(null);

  const quickActions = useMemo(() => getRefineActions().actions, []);

  useEffect(() => {
    setPaletteQuery("");
    setPaletteHighlight(0);
  }, [selectedText]);

  useEffect(() => {
    chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: "smooth" });
  }, [chatThread, chatBusy]);

  useEffect(() => {
    setPaletteHighlight(0);
    setPaletteQuery("");
  }, [selectedText]);

  // Escape is handled centrally in App.jsx

  const runPrompt = async (instruction, label) => {
    if (busy) return;
    const backend = resolveBackend(localStorage.getItem(BACKEND_KEY), installedBackends);
    if (!backend) {
      setError(INSTALL_CLI_MESSAGE);
      return;
    }
    setBusy(true);
    setError(null);
    setActionLabel(label);
    setView("loading");
    const res = await window.peekDesktop.ask({
      mode: "refine",
      refineInstruction: instruction,
      selectedText,
      question: instruction,
      history: [],
      backend,
    });
    setBusy(false);
    if (res?.error || !res?.text) {
      setError(res?.error || "No answer.");
      setView("palette");
      return;
    }
    const text = stripRefineOutput(res.text);
    setAnswer(text);
    setEdited(text);
    setView("answer");
  };

  const filteredActions = paletteQuery.trim()
    ? quickActions.filter((a) => a.label.toLowerCase().includes(paletteQuery.trim().toLowerCase()))
    : quickActions;

  const onPaletteQueryChange = (e) => {
    setPaletteQuery(e.target.value);
    setPaletteHighlight(0);
  };

  const runHighlightedOrCustom = () => {
    const chosen = filteredActions[paletteHighlight];
    if (chosen) { runPrompt(chosen.instruction, chosen.label); return; }
    const p = paletteQuery.trim();
    if (p) runPrompt(p, p.length > 60 ? `${p.slice(0, 60)}…` : p);
  };

  const onPaletteKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setPaletteHighlight((i) => Math.min(i + 1, Math.max(filteredActions.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setPaletteHighlight((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      runHighlightedOrCustom();
    }
  };

  const copyAnswer = () => window.peekDesktop.copyToClipboard(edited);
  // Replaces immediately on click — main.cjs's restoreForegroundWindow now
  // confirms the source app genuinely holds OS focus before the paste
  // fires, instead of firing on a fixed delay and hoping (that race was the
  // actual bug — Replace used to only seem to "take" once you clicked into
  // the source app yourself). The edit-then-commit order is deliberate: fix
  // it up in the textarea first, *then* Replace — not replace-then-fix,
  // which is what an undo/re-edit-after-the-fact button would encourage.
  const replaceAnswer = async () => {
    setReplaceBusy(true);
    setReplaceError(null);
    const res = await window.peekDesktop.replaceSelection(edited);
    setReplaceBusy(false);
    if (res?.error) { setReplaceError(res.error); return; }
    onClear?.();
  };

  // "Regenerate" — back to the palette against the same selectedText, to
  // pick a different action (or retype the same one) rather than
  // auto-re-running anything itself.
  const backToPalette = () => {
    setAnswer(null);
    setEdited("");
    setError(null);
    setReplaceError(null);
    setPaletteQuery("");
    setPaletteHighlight(0);
    setView("palette");
  };

  // Chat ahead — seeds the mini thread with the action+answer that was just
  // showing, then switches to a real back-and-forth, still anchored right
  // here instead of opening the separate (bottom-of-screen) Panel.
  const startChat = () => {
    setChatThread([{ q: actionLabel || "Refine", a: answer }]);
    setChatInput("");
    setView("chat");
  };

  const sendChat = async () => {
    const question = chatInput.trim();
    if (!question || chatBusy) return;
    const backend = resolveBackend(localStorage.getItem(BACKEND_KEY), installedBackends);
    if (!backend) {
      setError(INSTALL_CLI_MESSAGE);
      return;
    }
    setChatInput("");
    setChatBusy(true);
    const history = chatThread.map((t) => ({ q: t.q, a: t.a }));
    const res = await window.peekDesktop.ask({
      mode: "refine",
      refineInstruction: question,
      selectedText,
      question,
      history,
      backend,
    });
    const reply = res?.error
      ? `Couldn't get an answer: ${res.error}`
      : (stripRefineOutput(res?.text) || "(no answer)");
    setChatThread((t) => [...t, { q: question, a: reply }]);
    setChatBusy(false);
  };

  const onChatInputKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); }
  };

  // Clamped against an estimated height per view (answers/chat can be much
  // taller than the palette) so the popup is never partially off-screen
  // regardless of where on the display the selection was made. The actual
  // rendered cap (below, per view) is relative to the viewport so it scales
  // with screen size instead of hitting a cramped fixed pixel ceiling.
  const viewKey = view === "loading" ? "loading" : view;
  const { left, top } = anchorRefinePopup(selectionPos, viewKey);
  const tallViewMaxHeight = Math.min(window.innerHeight * 0.72, window.innerHeight - top - 24);

  const chatExportText = chatThread.length
    ? chatThread.map((t) => `## ${t.q}\n\n${t.a}`).join("\n\n---\n\n")
    : edited;

  const chromeBtn = (dark) => ({
    display: "flex", alignItems: "center", justifyContent: "center",
    width: 26, height: 26, borderRadius: "50%", border: "none", cursor: "pointer", flexShrink: 0,
    background: dark ? "rgba(255,255,255,0.08)" : "transparent",
    color: dark ? "rgba(255,255,255,0.7)" : LIGHT.muted,
  });

  const popupChrome = (dark) => (
    <div style={{
      position: "absolute", top: 8, right: 8, zIndex: 2,
      display: "flex", alignItems: "center", gap: 4,
    }}>
      <button
        type="button"
        className="peek-interactive"
        onClick={onClear}
        title="Close"
        style={chromeBtn(dark)}
        onMouseEnter={(e) => { e.currentTarget.style.background = "#D64545"; e.currentTarget.style.color = "#fff"; }}
        onMouseLeave={(e) => { Object.assign(e.currentTarget.style, chromeBtn(dark)); }}
      ><IconClose /></button>
    </div>
  );

  return (
    <div
      data-peek-ui="true"
      onMouseDown={(e) => e.stopPropagation()}
      className="peek-panel-shell"
      style={{ position: "fixed", left, top, zIndex: 100, width: POPUP_WIDTH }}
    >
      {view === "palette" && (
        <div className="peek-pop-in" style={{
          position: "relative",
          background: "#1E1E1E", borderRadius: 14, padding: 6, display: "flex", flexDirection: "column", gap: 2,
          boxShadow: "0 10px 32px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.06)",
        }}>
          {popupChrome(true)}
          <div style={{
            display: "flex", alignItems: "center", gap: 8, padding: "9px 34px 9px 10px", marginBottom: 4,
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}>
            <input
              autoFocus
              value={paletteQuery}
              onChange={onPaletteQueryChange}
              onKeyDown={onPaletteKeyDown}
              placeholder="Search or type a custom prompt…"
              disabled={busy}
              style={{
                flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent",
                fontSize: 13, color: "#EDEDED", fontFamily: "inherit",
              }}
            />
            <IconSettings style={{ color: "rgba(255,255,255,0.35)", flexShrink: 0 }} />
          </div>
          <div className="peek-scroll" style={{ display: "flex", flexDirection: "column", maxHeight: 320, overflowY: "auto" }}>
            {filteredActions.map((a, i) => {
              const Icon = a.icon;
              const active = i === paletteHighlight;
              return (
                <button
                  key={a.key}
                  className="peek-interactive"
                  onClick={() => runPrompt(a.instruction, a.label)}
                  onMouseEnter={() => setPaletteHighlight(i)}
                  disabled={busy}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderRadius: 8,
                    background: active ? "rgba(255,255,255,0.09)" : "transparent",
                    border: "none", color: "#EDEDED", fontSize: 13, fontWeight: 500, textAlign: "left",
                    cursor: busy ? "default" : "pointer", opacity: busy ? 0.5 : 1,
                  }}
                >
                  <Icon style={{ color: "rgba(255,255,255,0.55)", flexShrink: 0 }} />
                  {a.label}
                </button>
              );
            })}
            {filteredActions.length === 0 && paletteQuery.trim() && (
              <div style={{ padding: "9px 10px", fontSize: 12.5, color: "rgba(255,255,255,0.4)" }}>
                Press Enter to ask “{paletteQuery.trim()}”
              </div>
            )}
          </div>
          {error && <div style={{ fontSize: 12, color: "#F87171", padding: "4px 10px" }}>{error}</div>}
        </div>
      )}

      {view === "loading" && (
        <div className="peek-pop-in" style={{
          position: "relative", background: "#fff", borderRadius: 16, padding: "18px 16px 16px",
          display: "flex", flexDirection: "column", minHeight: 200,
          boxShadow: "0 14px 36px rgba(0,0,0,0.22), 0 0 0 1px rgba(0,0,0,0.05)",
        }}>
          {popupChrome(false)}
          <div style={{
            display: "inline-flex", alignSelf: "flex-start", alignItems: "center", gap: 8,
            fontSize: 11.5, fontWeight: 600, color: LIGHT.muted, marginBottom: 14,
            padding: "4px 10px", borderRadius: 999, background: LIGHT.borderSoft,
          }}>
            <IconPeek width={18} loading style={{ color: "#000", flexShrink: 0 }} />
            {actionLabel || "Refining"}
          </div>
          <div style={{ flex: 1, paddingRight: 8 }}>
            <div style={{ ...shimmerLine, width: "92%" }} />
            <div style={{ ...shimmerLine, width: "78%" }} />
            <div style={{ ...shimmerLine, width: "85%" }} />
            <div style={{ ...shimmerLine, width: "60%", marginBottom: 0 }} />
          </div>
          <div style={{ marginTop: 16 }}>
            <ThinkingBubble />
          </div>
        </div>
      )}

      {view === "answer" && (
        <div style={{
          position: "relative", background: "#fff", borderRadius: 16, padding: 16, display: "flex", flexDirection: "column",
          maxHeight: tallViewMaxHeight,
          boxShadow: "0 14px 36px rgba(0,0,0,0.22), 0 0 0 1px rgba(0,0,0,0.05)",
        }}>
          {popupChrome(false)}
          <textarea
            className="peek-scroll"
            value={edited}
            onChange={(e) => setEdited(e.target.value)}
            style={{
              flex: 1, minHeight: 120, resize: "none", border: "none", outline: "none", background: "transparent",
              fontSize: 13.5, fontFamily: "inherit", color: "#3A3833", lineHeight: 1.5, marginBottom: 10, paddingRight: 56, paddingTop: 4,
            }}
          />
          {replaceError && <div style={{ fontSize: 11.5, color: "#C4522F", marginBottom: 8 }}>{replaceError}</div>}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <button onClick={copyAnswer} style={smallBtnStyle}>Copy</button>
            <SaveAsMenu text={edited} buttonStyle={smallBtnStyle} defaultName="peek-refine" />
            <button onClick={replaceAnswer} disabled={replaceBusy} style={{ ...smallBtnStyle, opacity: replaceBusy ? 0.6 : 1 }}>
              {replaceBusy ? "Replacing…" : "Replace"}
            </button>
            <button onClick={backToPalette} title="Choose a different action" style={smallBtnStyle}>Regenerate</button>
            <button onClick={startChat} style={smallBtnStyle}>Chat ahead</button>
          </div>
        </div>
      )}

      {view === "chat" && (
        <div style={{
          position: "relative", background: "#fff", borderRadius: 20, overflow: "hidden",
          display: "flex", flexDirection: "column",
          maxHeight: tallViewMaxHeight,
          boxShadow: "0 20px 50px rgba(0,0,0,0.25), 0 0 0 1px rgba(0,0,0,0.05)",
        }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexShrink: 0,
            padding: "10px 14px", borderBottom: `1px solid ${LIGHT.border}`,
          }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: LIGHT.text }}>Chat</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <SaveAsMenu
                text={chatExportText}
                defaultName="peek-refine-chat"
                buttonStyle={{
                  background: LIGHT.surface, color: LIGHT.text, border: `1px solid ${LIGHT.border}`,
                  borderRadius: 7, padding: "5px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer",
                }}
              />
              <button type="button" className="peek-interactive" onClick={onClear} title="Close" style={{ ...closeBtnStyle, position: "static" }}>
                <IconClose />
              </button>
            </div>
          </div>

          <div ref={chatScrollRef} className="peek-scroll" style={{
            flex: 1, minHeight: 0, overflowY: "auto", padding: 14,
            display: "flex", flexDirection: "column", gap: 10,
          }}>
            {chatThread.map((turn, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <ChatBubble role="user" text={turn.q} />
                <ChatBubble role="ai" text={turn.a} />
              </div>
            ))}
            {chatBusy && <ThinkingBubble />}
          </div>

          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, padding: 10, borderTop: `1px solid ${LIGHT.border}`, flexShrink: 0 }}>
            <textarea
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={onChatInputKey}
              placeholder="Ask a follow-up…"
              rows={1}
              style={{
                flex: 1, minWidth: 0, resize: "none", border: `1px solid ${LIGHT.border}`, borderRadius: 12,
                outline: "none", background: LIGHT.bg, color: "#3A3833", fontSize: 13.5, fontFamily: "inherit",
                padding: "8px 10px", maxHeight: 100,
              }}
            />
            <button onClick={sendChat} disabled={chatBusy || !chatInput.trim()} style={{
              width: 32, height: 32, borderRadius: "50%", background: "#000", border: "none",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              cursor: chatBusy ? "default" : "pointer", opacity: chatBusy || !chatInput.trim() ? 0.4 : 1,
            }}><IconArrowUp style={{ color: "#fff", width: 15, height: 15 }} /></button>
          </div>
        </div>
      )}
    </div>
  );
}

function ChatBubble({ role, text, pending }) {
  const isUser = role === "user";
  return (
    <div style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start" }}>
      <div style={{
        maxWidth: "84%", padding: "8px 12px", borderRadius: 16,
        borderBottomRightRadius: isUser ? 4 : 16, borderBottomLeftRadius: isUser ? 16 : 4,
        background: isUser ? "#000" : LIGHT.borderSoft, color: isUser ? "#fff" : LIGHT.text,
        display: "flex", flexDirection: "column", gap: 4,
      }}>
        <div style={{ fontSize: 13.5, lineHeight: 1.5, userSelect: "text" }}>
          {isUser || pending ? text : <RichText text={text} theme={LIGHT} />}
        </div>
        {!pending && (
          <button
            onClick={() => window.peekDesktop.copyToClipboard(text)}
            style={{
              alignSelf: isUser ? "flex-end" : "flex-start", userSelect: "none",
              background: "transparent", border: "none", cursor: "pointer", padding: 0,
              color: isUser ? "rgba(255,255,255,0.6)" : LIGHT.muted, fontSize: 10.5, fontWeight: 600,
            }}
          >Copy</button>
        )}
      </div>
    </div>
  );
}
