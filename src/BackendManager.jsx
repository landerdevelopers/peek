import { useCallback, useEffect, useState } from "react";
import { LIGHT } from "./theme.js";
import { KEY_VENDORS } from "./backends.js";
import { notifyBackendsChanged } from "./useInstalledBackends.js";

// Shared provider-management UI: BYO API keys (one row per vendor), the OS
// encryption banner, and Ollama status. Rendered both inside the dashboard's
// Settings ("Providers" section) and in the standalone BackendsModal opened from
// the composer. Never sees a plaintext key back from main — it only sends keys
// (peek:keys:set) and reads presence/last-4 via peek:keys:status.

const inputStyle = {
  flex: 1, minWidth: 0, height: 34, padding: "0 10px", borderRadius: 8,
  border: `1px solid ${LIGHT.border}`, background: LIGHT.surface, color: LIGHT.text,
  fontSize: 13, fontFamily: "inherit", outline: "none",
};

const btn = (variant) => ({
  height: 34, padding: "0 12px", borderRadius: 8, fontSize: 12.5, fontWeight: 600,
  cursor: "pointer", flexShrink: 0, border: `1px solid ${LIGHT.border}`,
  background: variant === "primary" ? "#000" : LIGHT.surface,
  color: variant === "primary" ? "#fff" : LIGHT.text,
});

export default function BackendManager() {
  const [status, setStatus] = useState(null); // { encryptionAvailable, vendors:{v:{present,hint}} }
  const [drafts, setDrafts] = useState({}); // vendor -> input value (cleared after save)
  const [busy, setBusy] = useState(null); // vendor currently saving/clearing
  const [errs, setErrs] = useState({}); // vendor -> error string
  const [ollama, setOllama] = useState(null); // { reachable, models }

  const refreshStatus = useCallback(() => {
    window.peekDesktop?.keys?.status?.()
      .then((s) => setStatus(s?.error ? { encryptionAvailable: false, vendors: {} } : s))
      .catch(() => setStatus({ encryptionAvailable: false, vendors: {} }));
  }, []);
  const refreshOllama = useCallback(() => {
    window.peekDesktop?.ollama?.models?.()
      .then((r) => setOllama(r || { reachable: false, models: [] }))
      .catch(() => setOllama({ reachable: false, models: [] }));
  }, []);

  useEffect(() => { refreshStatus(); refreshOllama(); }, [refreshStatus, refreshOllama]);

  const save = async (vendor) => {
    const value = (drafts[vendor] || "").trim();
    if (!value || busy) return;
    setBusy(vendor); setErrs((e) => ({ ...e, [vendor]: null }));
    const res = await window.peekDesktop.keys.set(vendor, value);
    setBusy(null);
    if (res?.error) { setErrs((e) => ({ ...e, [vendor]: res.error })); return; }
    setDrafts((d) => ({ ...d, [vendor]: "" })); // drop the plaintext from renderer state
    refreshStatus();
    notifyBackendsChanged();
  };

  const clear = async (vendor) => {
    if (busy) return;
    setBusy(vendor);
    await window.peekDesktop.keys.clear(vendor);
    setBusy(null);
    refreshStatus();
    notifyBackendsChanged();
  };

  const encUnavailable = status && status.encryptionAvailable === false;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {encUnavailable && (
        <div style={{
          fontSize: 12, color: "#C4522F", background: "rgba(196,82,47,0.08)",
          border: "1px solid rgba(196,82,47,0.25)", borderRadius: 8, padding: "8px 10px", marginBottom: 8,
        }}>
          Your OS can't securely store secrets right now, so API keys won't be saved. Keys are only
          persisted when the system keychain (Windows Credential Manager / macOS Keychain) is available.
        </div>
      )}

      <div style={{ fontSize: 12.5, fontWeight: 700, color: LIGHT.text, padding: "4px 0 2px" }}>API keys</div>
      <div style={{ fontSize: 12, color: LIGHT.muted, marginBottom: 8 }}>
        Bring your own key — stored encrypted on this device via the OS keychain, never uploaded.
      </div>

      {KEY_VENDORS.map((v) => {
        const st = status?.vendors?.[v.id];
        const present = !!st?.present;
        return (
          <div key={v.id} style={{ padding: "10px 0", borderBottom: `1px solid ${LIGHT.borderSoft}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{
                width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                background: present ? "#22C55E" : LIGHT.border,
              }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: LIGHT.text }}>{v.label}</span>
              {present && <span style={{ fontSize: 11.5, color: LIGHT.muted }}>saved {st.hint}</span>}
              <a href={v.url} target="_blank" rel="noreferrer" style={{
                marginLeft: "auto", fontSize: 11.5, color: "#7C3AED", textDecoration: "none",
              }}>Get a key ↗</a>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="password"
                value={drafts[v.id] || ""}
                onChange={(e) => setDrafts((d) => ({ ...d, [v.id]: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") save(v.id); }}
                placeholder={present ? "Replace key…" : v.placeholder}
                disabled={encUnavailable}
                style={inputStyle}
              />
              <button
                onClick={() => save(v.id)}
                disabled={busy === v.id || !(drafts[v.id] || "").trim() || encUnavailable}
                style={{ ...btn("primary"), opacity: (busy === v.id || !(drafts[v.id] || "").trim() || encUnavailable) ? 0.5 : 1 }}
              >{busy === v.id ? "Saving…" : "Save"}</button>
              {present && (
                <button onClick={() => clear(v.id)} disabled={busy === v.id} style={btn()}>Clear</button>
              )}
            </div>
            {errs[v.id] && <div style={{ fontSize: 11.5, color: "#C4522F", marginTop: 6 }}>{errs[v.id]}</div>}
          </div>
        );
      })}

      <div style={{ fontSize: 12.5, fontWeight: 700, color: LIGHT.text, padding: "14px 0 2px" }}>Local (Ollama)</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}>
        <span style={{
          width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
          background: ollama?.reachable ? "#22C55E" : LIGHT.border,
        }} />
        <span style={{ fontSize: 13, color: LIGHT.text }}>
          {ollama == null ? "Checking…"
            : ollama.reachable
              ? (ollama.models.length ? `Running — ${ollama.models.length} model${ollama.models.length > 1 ? "s" : ""}` : "Running — no models pulled yet")
              : "Not running"}
        </span>
        <button onClick={refreshOllama} style={{ ...btn(), marginLeft: "auto", height: 30, padding: "0 10px" }}>Re-check</button>
      </div>
      {ollama?.reachable && ollama.models.length > 0 && (
        <div style={{ fontSize: 11.5, color: LIGHT.muted, paddingLeft: 16 }}>{ollama.models.join(" · ")}</div>
      )}
      {ollama && !ollama.reachable && (
        <div style={{ fontSize: 11.5, color: LIGHT.muted, paddingLeft: 16 }}>
          Install Ollama and run a model (e.g. <code>ollama pull llama3.2</code>) to use it locally.
        </div>
      )}
    </div>
  );
}
