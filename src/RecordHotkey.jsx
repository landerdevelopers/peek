import { useEffect, useState } from "react";
import { PAL } from "./theme.js";
import { buildAccelerator } from "./hotkeyUtils.js";
import { fmtAccel, loadPlatformInfo, modifierChips, hotkeyRecordHint } from "./accelFormat.js";

export default function RecordHotkey({ onDone, onCancel }) {
  const [held, setHeld] = useState({ ctrl: false, alt: false, shift: false, meta: false });
  const [status, setStatus] = useState(null); // {kind:'ok'|'error', text}
  const [busy, setBusy] = useState(false);

  useEffect(() => { loadPlatformInfo(); }, []);

  useEffect(() => {
    const readMods = (e) => ({ ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey });

    const onKeyDown = async (e) => {
      if (e.key === "Escape") { onCancel(); return; }
      setHeld(readMods(e));
      if (busy) return;
      const accel = buildAccelerator(e);
      if (!accel) return;
      setBusy(true);
      const res = await window.peekDesktop.submitHotkey(accel);
      if (res?.ok) {
        setStatus({ kind: "ok", text: `Bound to ${fmtAccel(accel)}` });
        setTimeout(onDone, 700);
      } else {
        setStatus({ kind: "error", text: res?.error || `${accel} didn't bind — try another` });
        setBusy(false);
      }
    };
    const onKeyUp = (e) => setHeld(readMods(e));
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [busy, onDone, onCancel]);

  const chip = (label, active) => (
    <span style={{
      padding: "3px 9px", borderRadius: 6, fontSize: 12, fontWeight: 600,
      background: active ? PAL.coral : PAL.surface, color: active ? "#fff" : PAL.muted,
      border: `1px solid ${active ? PAL.coral : PAL.borderSoft}`,
    }}>{label}</span>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)" }}>
      <div style={{
        position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
        background: PAL.bgElevated, border: `1px solid ${PAL.border}`, borderRadius: 14,
        padding: "22px 26px", color: PAL.text, textAlign: "center", minWidth: 320,
        boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
      }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Press your new shortcut for Peek</div>
        <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 14 }}>
          {modifierChips().map(({ key, label }) => chip(label, held[key]))}
          <span style={{ color: PAL.muted, fontSize: 12, alignSelf: "center" }}>+ a key</span>
        </div>
        {status && (
          <div style={{ fontSize: 13, color: status.kind === "ok" ? "#6BAF8A" : "#E08A6B", marginBottom: 10 }}>{status.text}</div>
        )}
        <div style={{ fontSize: 12, color: PAL.muted }}>{hotkeyRecordHint()}</div>
      </div>
    </div>
  );
}
