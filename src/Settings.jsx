import { useEffect, useState } from "react";
import { LIGHT } from "./theme.js";
import { buildAccelerator } from "./hotkeyUtils.js";
import { fmtAccel, loadPlatformInfo, modifierChips } from "./accelFormat.js";
import { IconClose, IconSettings, IconKeyboard, IconSparkle } from "./Icons.jsx";
import BackendPicker from "./BackendPicker.jsx";
import BackendManager from "./BackendManager.jsx";
import { BACKEND_KEY, resolveBackend } from "./backends.js";
import { useInstalledBackends } from "./useInstalledBackends.js";

const fmtAccelDisplay = (acc) => fmtAccel(acc) || "unavailable";

const NAV = [
  { key: "general", label: "General", icon: IconSettings },
  { key: "providers", label: "Backends", icon: IconSparkle },
  { key: "hotkey", label: "Hotkey", icon: IconKeyboard },
];

export default function Settings({ onClose }) {
  const [section, setSection] = useState("general");
  const [hotkey, setHotkey] = useState(null);
  const [modeHotkeys, setModeHotkeys] = useState({ image: null, text: null });
  const [recording, setRecording] = useState(false);
  const [held, setHeld] = useState({ ctrl: false, alt: false, shift: false, meta: false });
  const [status, setStatus] = useState(null); // {kind:'ok'|'error', text}
  const [backend, setBackend] = useState(() => localStorage.getItem(BACKEND_KEY) || "");
  const { available: installedBackends, loading: backendsLoading } = useInstalledBackends();
  const [openAtLogin, setOpenAtLogin] = useState(false);
  const [loginItemLabel, setLoginItemLabel] = useState("Open at Login");

  useEffect(() => { loadPlatformInfo().then((info) => setLoginItemLabel(info.loginItemLabel)); }, []);
  useEffect(() => {
    window.peekDesktop.getHotkey().then(setHotkey);
    window.peekDesktop.getHotkeys?.().then((keys) => {
      if (keys) setModeHotkeys({ image: keys.image, text: keys.text });
    });
  }, []);
  useEffect(() => { window.peekDesktop.loginItem.get().then(setOpenAtLogin); }, []);
  useEffect(() => { localStorage.setItem(BACKEND_KEY, backend); }, [backend]);
  useEffect(() => {
    if (backendsLoading) return;
    const next = resolveBackend(backend, installedBackends);
    if (next && next !== backend) setBackend(next);
    else if (!next && backend) setBackend("");
  }, [backendsLoading, installedBackends]);

  useEffect(() => {
    if (!recording) return;
    const readMods = (e) => ({ ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey });
    let busy = false;

    const onKeyDown = async (e) => {
      if (e.key === "Escape") { setRecording(false); setStatus(null); return; }
      e.preventDefault();
      setHeld(readMods(e));
      if (busy) return;
      const accel = buildAccelerator(e);
      if (!accel) return;
      busy = true;
      const res = await window.peekDesktop.submitHotkey(accel);
      if (res?.ok) {
        setHotkey(res.accel);
        setStatus({ kind: "ok", text: `Bound to ${fmtAccelDisplay(res.accel)}` });
        setTimeout(() => { setRecording(false); setStatus(null); }, 900);
      } else {
        setStatus({ kind: "error", text: res?.error || `${accel} didn't bind — try another` });
        busy = false;
      }
    };
    const onKeyUp = (e) => setHeld(readMods(e));
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [recording]);

  const toggleLoginItem = async () => {
    const next = !openAtLogin;
    setOpenAtLogin(next);
    await window.peekDesktop.loginItem.set(next);
  };

  useEffect(() => {
    if (recording) return; // hotkey recording owns Escape while active
    const onKeyDown = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [recording, onClose]);

  const chip = (label, active) => (
    <span style={{
      padding: "2px 7px", borderRadius: 5, fontSize: 11, fontWeight: 600,
      background: active ? LIGHT.coral : LIGHT.surface, color: active ? "#fff" : LIGHT.muted,
      border: `1px solid ${active ? LIGHT.coral : LIGHT.border}`,
    }}>{label}</span>
  );

  return (
    <div
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      style={{
        position: "absolute", inset: 0, zIndex: 100, display: "flex",
        alignItems: "center", justifyContent: "center",
        background: "rgba(30,28,25,0.32)",
      }}
    >
      <div style={{
        width: 720, height: 480, maxWidth: "calc(100% - 48px)", maxHeight: "calc(100% - 64px)",
        background: LIGHT.bg, borderRadius: 16, border: `1px solid ${LIGHT.border}`,
        boxShadow: "0 24px 60px rgba(0,0,0,0.22)", display: "flex", position: "relative",
        overflow: "hidden",
      }}>
        <button onClick={onClose} title="Close" style={{
          position: "absolute", top: 12, right: 12, zIndex: 1,
          width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
          background: "transparent", border: "none", borderRadius: 6, color: LIGHT.icon, cursor: "pointer",
        }}
          onMouseEnter={(e) => { e.currentTarget.style.background = LIGHT.borderSoft; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        ><IconClose /></button>

        <div style={{
          width: 190, flexShrink: 0, borderRight: `1px solid ${LIGHT.border}`,
          padding: "18px 10px", display: "flex", flexDirection: "column", gap: 2,
        }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: LIGHT.text, padding: "0 8px 12px" }}>Settings</div>
          {NAV.map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setSection(key)} style={{
              display: "flex", alignItems: "center", gap: 9, background: section === key ? LIGHT.borderSoft : "transparent",
              border: "none", borderRadius: 7, color: LIGHT.text, padding: "7px 8px",
              fontSize: 13, fontWeight: section === key ? 600 : 500, cursor: "pointer", textAlign: "left",
            }}
              onMouseEnter={(e) => { if (section !== key) e.currentTarget.style.background = LIGHT.borderSoft; }}
              onMouseLeave={(e) => { if (section !== key) e.currentTarget.style.background = "transparent"; }}
            >
              <Icon style={{ color: LIGHT.icon, flexShrink: 0 }} />
              {label}
            </button>
          ))}
        </div>

        <div className="peek-scroll" style={{ flex: 1, overflowY: "auto", padding: "24px 24px 4px" }}>
          {section === "general" && (
            <>
              <SettingRow title="Default backend" desc="Which installed CLI answers new chats by default.">
                <BackendPicker value={backend} onChange={setBackend} placement="down" align="right" minWidth={150} />
              </SettingRow>

              <SettingRow title={loginItemLabel} desc="Launch Peek automatically at login." last>
                <button onClick={toggleLoginItem} style={{
                  ...btnStyle(), background: openAtLogin ? LIGHT.coral : LIGHT.surface,
                  borderColor: openAtLogin ? LIGHT.coral : LIGHT.border, color: openAtLogin ? "#fff" : LIGHT.text,
                }}>
                  {openAtLogin ? "On" : "Off"}
                </button>
              </SettingRow>
            </>
          )}

          {section === "providers" && (
            <div style={{ paddingBottom: 16 }}>
              <BackendManager />
            </div>
          )}

          {section === "hotkey" && (
            <>
              <SettingRow title="Open Peek" desc="Double-tap to open the chat bar from anywhere.">
                <span style={{
                  fontSize: 13, fontWeight: 600, color: LIGHT.text, background: LIGHT.surface,
                  border: `1px solid ${LIGHT.border}`, borderRadius: 6, padding: "6px 10px",
                }}>{fmtAccelDisplay(hotkey)}</span>
              </SettingRow>

              <SettingRow title="Image mode" desc="Jump straight into screenshot capture.">
                <span style={{
                  fontSize: 13, fontWeight: 600, color: LIGHT.text, background: LIGHT.surface,
                  border: `1px solid ${LIGHT.border}`, borderRadius: 6, padding: "6px 10px",
                }}>{fmtAccelDisplay(modeHotkeys.image)}</span>
              </SettingRow>

              <SettingRow title="Text mode" desc="Jump straight into the text composer." last>
                <span style={{
                  fontSize: 13, fontWeight: 600, color: LIGHT.text, background: LIGHT.surface,
                  border: `1px solid ${LIGHT.border}`, borderRadius: 6, padding: "6px 10px",
                }}>{fmtAccelDisplay(modeHotkeys.text)}</span>
              </SettingRow>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function btnStyle() {
  return {
    background: LIGHT.surface, color: LIGHT.text, border: `1px solid ${LIGHT.border}`,
    borderRadius: 7, padding: "6px 12px", fontSize: 12.5, fontWeight: 600, cursor: "pointer",
  };
}

function SettingRow({ title, desc, children, last }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24,
      padding: "16px 0", borderBottom: last ? "none" : `1px solid ${LIGHT.border}`,
    }}>
      <div style={{ flex: 1, minWidth: 0, paddingRight: 12 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: LIGHT.text }}>{title}</div>
        {desc && <div style={{ fontSize: 12, color: LIGHT.muted, marginTop: 2 }}>{desc}</div>}
      </div>
      <div style={{ flexShrink: 0, maxWidth: 280 }}>{children}</div>
    </div>
  );
}
