const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("peekDesktop", {
  setClickThrough: (on) => ipcRenderer.send("peek:set-clickthrough", on),
  select: (sel) => ipcRenderer.invoke("peek:select", sel),
  ask: (payload) => ipcRenderer.invoke("peek:ask", payload),
  pickImage: () => ipcRenderer.invoke("peek:pick-image"),
  saveScreenshot: (imagePath) => ipcRenderer.invoke("peek:save-screenshot", { imagePath }),
  exportText: (payload) => ipcRenderer.invoke("peek:export-text", payload),
  captureNow: () => ipcRenderer.invoke("peek:capture-now"),
  grabSelection: () => ipcRenderer.invoke("peek:grab-selection"),
  copyToClipboard: (text) => ipcRenderer.invoke("peek:clipboard-write", text),
  ocrLayout: (imagePath) => ipcRenderer.invoke("peek:ocr-layout", imagePath),
  replaceSelection: (text) => ipcRenderer.invoke("peek:replace-selection", text),
  notifyPanelExpanded: (armed) => ipcRenderer.send("peek:panel-expanded", armed),
  endSession: () => ipcRenderer.send("peek:end-session"),
  deactivate: () => ipcRenderer.send("peek:deactivate-request"),
  openDashboard: () => ipcRenderer.send("peek:open-dashboard"),
  notify: (opts) => ipcRenderer.send("peek:notify", opts),
  quit: () => ipcRenderer.send("peek:quit"),
  submitHotkey: (accel) => ipcRenderer.invoke("peek:submit-hotkey", accel),
  getHotkey: () => ipcRenderer.invoke("peek:hotkey:get"),
  getPlatformInfo: () => ipcRenderer.invoke("peek:platform-info"),
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
});
