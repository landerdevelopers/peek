import { useState } from "react";
import { IconChevronDown } from "./Icons.jsx";

// Native <select> popups can't be restyled (padding, radius, shadows) in a
// way that matches the rest of the app, so the backend/session pickers use
// this custom pill + floating menu instead — same visual language as the
// Recents row's three-dot menu.
//
// options entries may be selectable ({ value, label }) or non-selectable
// section headers ({ header: true, label }) so the backend picker can group
// CLI / API / Local. An optional onManage renders a footer action (e.g.
// "Manage backends & keys…") pinned below the options.
export default function PillDropdown({
  value, options, onChange, minWidth = 130, placement = "up", align = "left",
  onManage, manageLabel = "Manage backends & keys…",
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => !o.header && o.value === value);

  return (
    <div style={{ position: "relative" }}>
      <button className="peek-interactive" onClick={() => setOpen((v) => !v)} style={{
        display: "flex", alignItems: "center", gap: 6, height: 34, padding: "0 12px",
        borderRadius: 999, background: "linear-gradient(180deg, #fff 7%, rgba(255,255,255,0) 66%), #F2F2F2",
        boxShadow: "0 6px 10px -4px rgba(0,0,0,0.12), 0 0 0 1px #EEE",
        color: "#3A3833", border: "none", fontSize: 12.5, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap",
      }}>
        {current?.label || value}
        <IconChevronDown style={{ color: "#96938D", flexShrink: 0 }} />
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 60 }} />
          <div className="peek-pop-in" style={{
            position: "absolute", zIndex: 61,
            ...(placement === "up" ? { bottom: "calc(100% + 6px)" } : { top: "calc(100% + 6px)" }),
            ...(align === "right" ? { right: 0 } : { left: 0 }),
            background: "#fff", border: "1px solid #E7E7E7", borderRadius: 10,
            boxShadow: "0 8px 24px rgba(0,0,0,0.14)", padding: 4, minWidth,
            display: "flex", flexDirection: "column", maxHeight: 320, overflowY: "auto",
          }}>
            {options.map((o, i) => {
              if (o.header) {
                return (
                  <div key={`h-${i}`} style={{
                    padding: "7px 10px 3px", fontSize: 10.5, fontWeight: 700, color: "#96938D",
                    textTransform: "uppercase", letterSpacing: "0.05em",
                  }}>{o.label}</div>
                );
              }
              const active = o.value === value;
              return (
                <button
                  key={o.value ?? `o-${i}`}
                  className="peek-interactive"
                  onClick={() => { onChange(o.value); setOpen(false); }}
                  style={{
                    display: "flex", alignItems: "center", background: active ? "#F3E8FF" : "transparent",
                    border: "none", borderRadius: 6, color: "#3A3833", padding: "7px 10px",
                    fontSize: 12.5, fontWeight: active ? 600 : 500, cursor: "pointer", textAlign: "left",
                  }}
                  onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "#F3F3F3"; }}
                  onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
                >{o.label}</button>
              );
            })}
            {onManage && (
              <button
                className="peek-interactive"
                onClick={() => { setOpen(false); onManage(); }}
                style={{
                  marginTop: 4, borderTop: "1px solid #F0F0F0", paddingTop: 8,
                  display: "flex", alignItems: "center", background: "transparent",
                  border: "none", borderRadius: 6, color: "#7C3AED", padding: "8px 10px",
                  fontSize: 12, fontWeight: 600, cursor: "pointer", textAlign: "left",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "#F7F2FF"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >{manageLabel}</button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
