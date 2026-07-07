import { useState } from "react";
import { IconChevronDown, IconDownload } from "./Icons.jsx";
import { LIGHT } from "./theme.js";

const FORMATS = [
  { value: "docx", label: "Word (.docx)" },
  { value: "md", label: "Markdown (.md)" },
  { value: "txt", label: "Plain text (.txt)" },
];

export default function SaveAsMenu({ text, disabled, defaultName, onSaved, buttonStyle }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const save = async (format) => {
    if (!text?.trim() || busy) return;
    setBusy(true);
    setOpen(false);
    try {
      const res = await window.peekDesktop.exportText?.({
        text,
        format,
        defaultName,
      });
      if (res?.canceled) return;
      if (res?.error) {
        window.peekDesktop.notify?.({ title: "Peek — couldn't save file", body: res.error });
        return;
      }
      const name = res.savedPath?.split(/[/\\]/).pop() || "file";
      window.peekDesktop.notify?.({ title: "Peek — saved", body: name });
      onSaved?.(res);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        className="peek-interactive"
        disabled={disabled || busy || !text?.trim()}
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          opacity: disabled || busy || !text?.trim() ? 0.5 : 1,
          ...buttonStyle,
        }}
      >
        <IconDownload style={{ width: 13, height: 13, flexShrink: 0 }} />
        {busy ? "Saving…" : "Save as"}
        <IconChevronDown style={{ width: 12, height: 12, opacity: 0.55, flexShrink: 0 }} />
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 120 }} />
          <div
            className="peek-pop-in"
            style={{
              position: "absolute", bottom: "calc(100% + 6px)", left: 0, zIndex: 121,
              background: "#fff", border: `1px solid ${LIGHT.border}`, borderRadius: 10,
              boxShadow: "0 8px 24px rgba(0,0,0,0.14)", padding: 4, minWidth: 168,
              display: "flex", flexDirection: "column",
            }}
          >
            {FORMATS.map((f) => (
              <button
                key={f.value}
                type="button"
                className="peek-interactive"
                onClick={() => save(f.value)}
                style={{
                  display: "flex", alignItems: "center", background: "transparent",
                  border: "none", borderRadius: 6, color: LIGHT.text, padding: "7px 10px",
                  fontSize: 12.5, fontWeight: 500, cursor: "pointer", textAlign: "left",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "#F3F3F3"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
