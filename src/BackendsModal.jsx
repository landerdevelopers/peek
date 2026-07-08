import { LIGHT } from "./theme.js";
import { IconClose } from "./Icons.jsx";
import BackendManager from "./BackendManager.jsx";

// Standalone "manage AI backends" modal for the overlay — the same provider
// management as the dashboard's Settings › Providers section, reachable right
// from the composer's backend picker. Rendered at App root so it floats above
// the chat bar; tagged data-peek-ui so the overlay treats it as interactive.
export default function BackendsModal({ onClose }) {
  return (
    <div
      data-peek-ui="true"
      onMouseDown={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) onClose?.(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 120, display: "flex",
        alignItems: "center", justifyContent: "center", background: "rgba(20,18,16,0.42)",
      }}
    >
      <div style={{
        width: 560, maxWidth: "calc(100% - 48px)", maxHeight: "calc(100% - 80px)",
        background: LIGHT.bg, borderRadius: 16, border: `1px solid ${LIGHT.border}`,
        boxShadow: "0 24px 60px rgba(0,0,0,0.35)", display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 16px", borderBottom: `1px solid ${LIGHT.border}`, flexShrink: 0,
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: LIGHT.text }}>AI backends</div>
          <button
            className="peek-interactive"
            onClick={onClose}
            title="Close"
            style={{
              width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
              background: "transparent", border: "none", borderRadius: 6, color: LIGHT.icon, cursor: "pointer",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = LIGHT.borderSoft; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          ><IconClose /></button>
        </div>
        <div className="peek-scroll" style={{ overflowY: "auto", padding: "12px 16px 16px" }}>
          <BackendManager />
        </div>
      </div>
    </div>
  );
}
