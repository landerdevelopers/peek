import { useState } from "react";
import { LIGHT, USER_BUBBLE } from "./theme.js";
import { RichText } from "./Markdown.jsx";
import { IconPeek } from "./Icons.jsx";

export function isErrorAnswer(text) {
  return /^Couldn't (get an answer|extract text)/.test(text || "");
}

const actionBtn = {
  background: LIGHT.borderSoft, color: LIGHT.muted, border: `1px solid ${LIGHT.border}`,
  borderRadius: 8, padding: "4px 10px", fontSize: 11.5, fontWeight: 600, cursor: "pointer",
};

export default function ChatTurn({ question, answer, isLast, busy, onRegenerate }) {
  const [copied, setCopied] = useState(null);
  const isError = isErrorAnswer(answer);
  const answerTheme = { ...LIGHT, text: isError ? "#991B1B" : LIGHT.text };

  const copyText = async (text, which) => {
    await window.peekDesktop.copyToClipboard(text);
    setCopied(which);
    setTimeout(() => setCopied(null), 1600);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
        <div className="peek-selectable" style={{
          maxWidth: 520, color: LIGHT.text, ...USER_BUBBLE,
          borderRadius: "18px 18px 4px 18px", padding: "10px 16px", fontSize: 14, fontWeight: 500, lineHeight: 1.45,
        }}>{question}</div>
        <div style={{ display: "flex", gap: 6, userSelect: "none" }}>
          <button type="button" onClick={() => copyText(question, "q")} style={actionBtn}>
            {copied === "q" ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
        <div className="peek-selectable" style={{
          maxWidth: "100%",
          background: isError ? "#FEF2F2" : "#fff",
          border: isError ? "1px solid #FECACA" : `1px solid ${LIGHT.border}`,
          borderRadius: "18px 18px 18px 4px", padding: "14px 18px", fontSize: 14.5,
          boxShadow: isError ? "none" : "0 1px 3px rgba(0,0,0,0.06)",
          color: answerTheme.text, lineHeight: 1.5,
        }}>
          <RichText text={answer} theme={answerTheme} />
        </div>
        <div style={{ display: "flex", gap: 6, userSelect: "none", flexWrap: "wrap" }}>
          <button type="button" onClick={() => copyText(answer, "a")} style={actionBtn}>
            {copied === "a" ? "Copied!" : "Copy"}
          </button>
          {isLast && onRegenerate && (
            <button type="button" onClick={onRegenerate} disabled={busy} style={{ ...actionBtn, opacity: busy ? 0.6 : 1 }}>
              {busy ? "Regenerating…" : "Regenerate"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function ThinkingBubble() {
  return (
    <div style={{
      alignSelf: "flex-start", width: "fit-content", background: "#fff",
      border: `1px solid ${LIGHT.border}`, borderRadius: "18px 18px 18px 4px",
      padding: "10px 16px", fontSize: 13.5, color: LIGHT.muted,
      boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
      display: "flex", alignItems: "center", gap: 10,
    }}>
      <IconPeek width={26} loading style={{ color: "#000", flexShrink: 0 }} />
      Thinking…
    </div>
  );
}
