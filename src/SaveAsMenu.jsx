import { useState, useRef } from "react";
import { IconChevronDown, IconDownload } from "./Icons.jsx";
import { LIGHT } from "./theme.js";

const FORMATS = [
  { value: "docx", label: "Word (.docx)" },
  { value: "md", label: "Markdown (.md)" },
  { value: "txt", label: "Plain text (.txt)" },
];

const MENU_WIDTH = 176;
const MENU_HEIGHT = 132; // ~3 rows — enough to decide up vs. down

export default function SaveAsMenu({ text, disabled, defaultName, onSaved, buttonStyle }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // Menu is positioned fixed (from the button's viewport rect) so it escapes any
  // modal's overflow:hidden frame — e.g. the chat header sits at the top of a
  // clipped card, where an in-flow menu would be cut off. We also flip it below
  // the button when there isn't room above.
  const [menuPos, setMenuPos] = useState(null);
  const btnRef = useRef(null);

  const toggle = () => {
    if (open) { setOpen(false); return; }
    const r = btnRef.current?.getBoundingClientRect();
    if (r) {
      const dropUp = window.innerHeight - r.bottom < MENU_HEIGHT + 12;
      setMenuPos({
        left: Math.max(8, Math.min(r.left, window.innerWidth - MENU_WIDTH - 8)),
        top: dropUp ? undefined : r.bottom + 6,
        bottom: dropUp ? window.innerHeight - r.top + 6 : undefined,
      });
    }
    setOpen(true);
  };

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
        ref={btnRef}
        type="button"
        className="peek-interactive"
        disabled={disabled || busy || !text?.trim()}
        onClick={toggle}
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
      {open && menuPos && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 120 }} />
          <div
            className="peek-pop-in"
            style={{
              position: "fixed", left: menuPos.left, top: menuPos.top, bottom: menuPos.bottom, zIndex: 121,
              background: "#fff", border: `1px solid ${LIGHT.border}`, borderRadius: 10,
              boxShadow: "0 8px 24px rgba(0,0,0,0.14)", padding: 4, width: MENU_WIDTH,
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
