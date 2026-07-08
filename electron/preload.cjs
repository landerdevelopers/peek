const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("peekDesktop", {
  setClickThrough: (on) => ipcRenderer.send("peek:set-clickthrough", on),
  select: (sel) => ipcRenderer.invoke("peek:select", sel),
  ask: (payload) => ipcRenderer.invoke("peek:ask", payload),
  pickImage: () => ipcRenderer.invoke("peek:pick-image"),
  saveScreenshot: (imagePath) => ipcRenderer.invoke("peek:save-screenshot", { imagePath }),
  exportText: (payload) => ipcRenderer.invoke("peek:export-text", payload),
  captureNow: () => ipcRenderer.invoke("peek:capture-now"),
  captureSilent: () => ipcRenderer.invoke("peek:capture-silent"),
  grabSelection: () => ipcRenderer.invoke("peek:grab-selection"),
  copyToClipboard: (text) => ipcRenderer.invoke("peek:clipboard-write", text),
  ensureMicAccess: () => ipcRenderer.invoke("peek:ensure-mic-access"),
  openMicSettings: () => ipcRenderer.invoke("peek:open-mic-settings"),
  transcribeAudio: (samples, sampleRate = 16000) => {
    const f32 = samples instanceof Float32Array ? samples : new Float32Array(samples);
    return ipcRenderer.invoke(
      "peek:transcribe-audio",
      { sampleRate, length: f32.length },
      f32.buffer.slice(f32.byteOffset, f32.byteOffset + f32.byteLength),
    ).then((res) => {
      if (res && typeof res === "object" && res.error) throw new Error(res.error);
      return res;
    });
  },
  ocrLayout: (imagePath) => ipcRenderer.invoke("peek:ocr-layout", imagePath),
  replaceSelection: (text) => ipcRenderer.invoke("peek:replace-selection", text),
  notifyPanelExpanded: (armed) => ipcRenderer.send("peek:set-armed", armed),
  setArmed: (armed) => ipcRenderer.send("peek:set-armed", armed),
  suppressHotkey: (on) => ipcRenderer.send("peek:hotkey-suppress", on),
  // Tells main whether a chat is currently minimized, so it can (de)register the
  // global Ctrl/⌘+↑ restore shortcut — the overlay loses keyboard focus once
  // minimized, so an in-page key listener alone can't catch the reopen.
  setChatMinimized: (on) => ipcRenderer.send("peek:chat-minimized", on),
  endSession: () => ipcRenderer.send("peek:end-session"),
  deactivate: () => ipcRenderer.send("peek:deactivate-request"),
  openDashboard: () => ipcRenderer.send("peek:open-dashboard"),
  notify: (opts) => ipcRenderer.send("peek:notify", opts),
  quit: () => ipcRenderer.send("peek:quit"),
  submitHotkey: (accel) => ipcRenderer.invoke("peek:submit-hotkey", accel),
  getHotkey: () => ipcRenderer.invoke("peek:hotkey:get"),
  getHotkeys: () => ipcRenderer.invoke("peek:hotkeys:get"),
  getPlatformInfo: () => ipcRenderer.invoke("peek:platform-info"),
  listBackends: (opts) => ipcRenderer.invoke("peek:backends:list", opts),
  // BYO API keys — status/set/clear only; the raw key never crosses back.
  keys: {
    status: () => ipcRenderer.invoke("peek:keys:status"),
    set: (vendor, key) => ipcRenderer.invoke("peek:keys:set", { vendor, key }),
    clear: (vendor) => ipcRenderer.invoke("peek:keys:clear", { vendor }),
  },
  ollama: {
    models: () => ipcRenderer.invoke("peek:ollama:models"),
  },
  whoami: () => ipcRenderer.invoke("peek:whoami"),
  sessions: {
    list: () => ipcRenderer.invoke("peek:sessions:list"),
    get: (id) => ipcRenderer.invoke("peek:sessions:get", id),
    delete: (id) => ipcRenderer.invoke("peek:sessions:delete", id),
    rename: (id, title) => ipcRenderer.invoke("peek:sessions:rename", id, title),
  },
  loginItem: {
    get: () => ipcRenderer.invoke("peek:login-item:get"),
    set: (on) => ipcRenderer.invoke("peek:login-item:set", on),
  },
  windowMinimize: () => ipcRenderer.send("peek:window:minimize"),
  windowMaximize: () => ipcRenderer.send("peek:window:maximize"),
  windowClose: () => ipcRenderer.send("peek:window:close"),
  onActivate: (cb) => {
    const fn = () => cb();
    ipcRenderer.on("peek:activate", fn);
    return () => ipcRenderer.removeListener("peek:activate", fn);
  },
  onDeactivate: (cb) => {
    const fn = () => cb();
    ipcRenderer.on("peek:deactivate", fn);
    return () => ipcRenderer.removeListener("peek:deactivate", fn);
  },
  onSelectionPending: (cb) => {
    const fn = (_e, data) => cb(data);
    ipcRenderer.on("peek:selection-pending", fn);
    return () => ipcRenderer.removeListener("peek:selection-pending", fn);
  },
  onSelectionCleared: (cb) => {
    const fn = () => cb();
    ipcRenderer.on("peek:selection-cleared", fn);
    return () => ipcRenderer.removeListener("peek:selection-cleared", fn);
  },
  onRecord: (cb) => {
    const fn = () => cb();
    ipcRenderer.on("peek:record", fn);
    return () => ipcRenderer.removeListener("peek:record", fn);
  },
  onOverlayBlur: (cb) => {
    const fn = () => cb();
    ipcRenderer.on("peek:overlay-blur", fn);
    return () => ipcRenderer.removeListener("peek:overlay-blur", fn);
  },
  onOverlayFocus: (cb) => {
    const fn = () => cb();
    ipcRenderer.on("peek:overlay-focus", fn);
    return () => ipcRenderer.removeListener("peek:overlay-focus", fn);
  },
  onRestorePanel: (cb) => {
    const fn = () => cb();
    ipcRenderer.on("peek:restore-panel", fn);
    return () => ipcRenderer.removeListener("peek:restore-panel", fn);
  },
  onOpenImage: (cb) => {
    const fn = () => cb();
    ipcRenderer.on("peek:open-image", fn);
    return () => ipcRenderer.removeListener("peek:open-image", fn);
  },
  onOpenText: (cb) => {
    const fn = () => cb();
    ipcRenderer.on("peek:open-text", fn);
    return () => ipcRenderer.removeListener("peek:open-text", fn);
  },
  onStandDown: (cb) => {
    const fn = () => cb();
    ipcRenderer.on("peek:stand-down", fn);
    return () => ipcRenderer.removeListener("peek:stand-down", fn);
  },
  onArm: (cb) => {
    const fn = () => cb();
    ipcRenderer.on("peek:arm", fn);
    return () => ipcRenderer.removeListener("peek:arm", fn);
  },
});
