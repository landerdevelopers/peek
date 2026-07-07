const { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage, session, globalShortcut, desktopCapturer, Notification, dialog, clipboard, systemPreferences } = require("electron");
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");
const backend = require("./backend.cjs");
const voiceTranscribe = require("./voiceTranscribe.cjs");
const store = require("./store.cjs");
const platform = require("./platform/index.cjs");
const micAccess = require("./platform/micAccess.cjs");
const { createScreenCoords } = require("./screenCoords.cjs");
const ocr = require("./ocr.cjs");
const textExport = require("./export.cjs");
const { uIOhook, UiohookKey } = require("uiohook-napi");

const isDev = process.env.PEEK_DEV === "1";
const DEV_URL = process.env.PEEK_DEV_URL || "http://localhost:5176";
// Dev-only CDP endpoint — lets a sandboxed/remote session verify rendering
// via Page.captureScreenshot over a raw WebSocket when OS-level screenshots
// can't be trusted to reflect the real window content (see BUILD_LOG.md).
if (isDev) app.commandLine.appendSwitch("remote-debugging-port", "9222");
const DASHBOARD_W = 1120;
const DASHBOARD_H = 760;
// Long edge of the captured screenshot, in physical px. Higher than Buddy's
// ambient 1280 cap — here the model is often reading dense text/UI, not just
// glancing, so fidelity matters more than shaving a few hundred ms.
const CAPTURE_MAX = Number(process.env.PEEK_CAPTURE_MAX || 2200);
// No single default combo is safe to assume free — anything can already be
// claimed by another app. These are just a first-run starting point; the
// bound key is always persisted and always user-changeable (tray → Change hotkey…).
const DEFAULT_HOTKEY_CANDIDATES = platform.defaultHotkeyCandidates();
const screenCoords = createScreenCoords(screen, () => overlayWin);

const CONFIG_DIR = path.join(os.homedir(), ".peek");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")); } catch { return {}; }
}
function saveConfig(patch) {
  try {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify({ ...loadConfig(), ...patch }));
  } catch {}
}

// A window's initial navigation can fail on a transient hiccup (dev server
// not quite up yet, a momentary network blip) and Electron never retries on
// its own — left alone, that's a permanently blank, invisible window with no
// way for the user to recover it (this is the likely real cause behind the
// overlay's bubble sometimes not appearing at all). Retries a few times with
// backoff before giving up.
function loadWithRetry(win, load, retriesLeft = 5) {
  const onFail = (_e, errorCode) => {
    if (errorCode === -3) return; // ERR_ABORTED — a deliberate navigation, not a real failure
    if (win.isDestroyed() || retriesLeft <= 0) return;
    setTimeout(() => { if (!win.isDestroyed()) loadWithRetry(win, load, retriesLeft - 1); }, 500);
  };
  win.webContents.once("did-fail-load", onFail);
  load();
}

let overlayWin = null;
let dashboardWin = null;
let tray = null;
let hotkeyAccel = null;
let isQuitting = false;
let lastCapture = null; // { image: NativeImage, width, height } — the full, uncropped shot
let capturedPath = null; // temp PNG for the CURRENT panel session
let panelSessionId = null; // groups per-crop PNGs until peek:end-session
let panelSessionCrops = []; // all crop files for the active panel chat
// True for the duration of peek:capture-now's own hide()/show() dance — see
// the "blur" listener below for why this needs to exist.
let suppressOverlayBlurReport = false;

// macOS system permission sheets sit *under* always-on-top overlays. Hide the
// overlay (and focus the dashboard) while the user interacts with them.
let overlaySuspendDepth = 0;
let overlaySuspendSnapshot = null;

function focusDashboard() {
  if (!dashboardWin || dashboardWin.isDestroyed()) return;
  dashboardWin.show();
  dashboardWin.focus();
  dashboardWin.moveTop();
}

function suspendOverlayForSystemUI({ focusDashboard: focusDash = true } = {}) {
  if (!overlayWin || overlayWin.isDestroyed()) return () => {};
  overlaySuspendDepth++;
  if (overlaySuspendDepth === 1) {
    overlaySuspendSnapshot = {
      wasVisible: overlayWin.isVisible(),
      modeArmed,
    };
    overlayWin.setAlwaysOnTop(false);
    overlayWin.hide();
    if (focusDash) focusDashboard();
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    overlaySuspendDepth = Math.max(0, overlaySuspendDepth - 1);
    if (overlaySuspendDepth !== 0 || !overlaySuspendSnapshot) return;
    const snap = overlaySuspendSnapshot;
    overlaySuspendSnapshot = null;
    if (!snap.wasVisible || !snap.modeArmed) return;
    overlayWin.show();
    overlayWin.setAlwaysOnTop(true, "screen-saver");
    overlayWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    overlayWin.moveTop();
    overlayWin.setIgnoreMouseEvents(true, { forward: true });
  };
}

/** macOS: accessibility prompt must not appear under the overlay. */
function ensureMacAccessibilityForOverlay() {
  if (!platform.isMac) return true;
  if (systemPreferences.isTrustedAccessibilityClient(false)) return true;

  const resume = suspendOverlayForSystemUI();
  systemPreferences.isTrustedAccessibilityClient(true);
  const trusted = systemPreferences.isTrustedAccessibilityClient(false);
  if (trusted) {
    resume();
    return true;
  }

  new Notification({
    title: "Peek needs Accessibility",
    body: "Enable Peek in System Settings → Privacy & Security → Accessibility, then press the hotkey again.",
  }).show();
  // Leave overlay hidden so System Settings stays clickable.
  return false;
}

function cleanupCapture() {
  if (capturedPath) { try { fs.unlinkSync(capturedPath); } catch {} capturedPath = null; }
}

function cleanupPanelSessionCrops() {
  for (const p of panelSessionCrops) {
    try { fs.unlinkSync(p); } catch {}
  }
  panelSessionCrops = [];
  panelSessionId = null;
  capturedPath = null;
}

function createWindow() {
  const { workArea } = screen.getPrimaryDisplay();

  overlayWin = new BrowserWindow({
    x: workArea.x,
    y: workArea.y,
    width: workArea.width,
    height: workArea.height,
    transparent: true,
    backgroundColor: "#00000000",
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    ...(process.platform === "darwin" ? { type: "panel", hiddenInMissionControl: true } : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  overlayWin.setAlwaysOnTop(true, "screen-saver");
  overlayWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWin.setIgnoreMouseEvents(true, { forward: true });

  loadWithRetry(overlayWin, () => {
    if (isDev) overlayWin.loadURL(DEV_URL);
    else overlayWin.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  });

  // Overlay stays created but hidden until activatePeek — showing it at launch
  // blocks macOS permission sheets (Accessibility, Screen Recording, Mic)
  // because the window is always-on-top at screen-saver level.
  overlayWin.once("ready-to-show", () => {});

  // Native, main-process-level focus tracking — used to auto-minimize the
  // composer the instant the OS shifts focus away from this window (clicking
  // through to whatever's underneath, alt-tabbing away). More reliable than
  // the renderer's own `window` blur event for this always-on-top,
  // click-through window, so the source of truth lives here.
  //
  // suppressOverlayBlurReport (below) guards against a self-inflicted blur:
  // peek:capture-now's own overlayWin.hide() (needed so Peek's own UI never
  // composites into the shot) fires a real native blur — now that every
  // mode's panel listens for this (not just image/voice, see Panel.jsx),
  // an already-open panel switching into Image mode (switchMode("image"))
  // would otherwise spuriously auto-minimize itself mid-switch from its own
  // capture, not a genuine "user clicked away."
  overlayWin.on("blur", () => { if (!suppressOverlayBlurReport) overlayWin?.webContents.send("peek:overlay-blur"); });
  // Counterpart to the blur event above — lets the renderer know OS focus
  // came back (e.g. clicking the composer again after clicking into another
  // app), which is what a pinned panel uses to re-arm full mouse capture.
  overlayWin.on("focus", () => { overlayWin?.webContents.send("peek:overlay-focus"); });

  overlayWin.on("closed", () => { overlayWin = null; });
}

// The real, taskbar-visible app window — sidebar of past sessions, greeting +
// composer for a fresh chat. Separate BrowserWindow from the hotkey overlay
// because `transparent`/always-on-top/skipTaskbar are creation-time-only and
// need opposite values here (normal resizable window, not a click-through
// full-screen layer). `transparent: true` + `frame: false` is kept so we can
// draw our own titlebar and rounded corners, matching the overlay's existing
// frameless-window technique — the *behavior* (not-always-on-top, taskbar
// entry, resizable) is what actually differs from overlayWin.
function createDashboardWindow() {
  if (dashboardWin && !dashboardWin.isDestroyed()) {
    dashboardWin.show();
    dashboardWin.focus();
    return;
  }

  dashboardWin = new BrowserWindow({
    width: DASHBOARD_W,
    height: DASHBOARD_H,
    minWidth: 760,
    minHeight: 480,
    center: true,
    transparent: true,
    backgroundColor: "#00000000",
    frame: false,
    hasShadow: true,
    resizable: true,
    movable: true,
    minimizable: true,
    maximizable: true,
    skipTaskbar: false,
    alwaysOnTop: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  loadWithRetry(dashboardWin, () => {
    if (isDev) dashboardWin.loadURL(`${DEV_URL}#/dashboard`);
    else dashboardWin.loadFile(path.join(__dirname, "..", "dist", "index.html"), { hash: "/dashboard" });
  });

  dashboardWin.once("ready-to-show", () => dashboardWin.show());
  // Closing (the custom × button) hides rather than quits — Peek keeps
  // running in the tray so the hotkey still works. Real quit only happens
  // via the tray's "Quit Peek", which flips isQuitting first.
  dashboardWin.on("close", (e) => {
    if (isQuitting) return;
    e.preventDefault();
    dashboardWin.hide();
  });
  dashboardWin.on("closed", () => { dashboardWin = null; });
}

// Main-process-side cleanup shared by deactivatePeek (hotkey/tray off) —
// stops the global selection hook and forces click-through back on. Doesn't
// touch the renderer's own state; callers that want the bubble/UI to
// actually reset need to also send peek:deactivate (see deactivatePeek).
function closeAll() {
  cleanupCapture();
  cleanupPanelSessionCrops();
  lastCapture = null;
  stopSelectionHook();
  if (overlayWin && !overlayWin.isDestroyed()) {
    overlayWin.setIgnoreMouseEvents(true, { forward: true });
  }
}

// Core screenshot grab behind peek:capture-now — every entry into image mode
// (the bubble menu's Image/Chat-with-screen/Summarize choices, or switching
// into image mode from an already-open text/voice panel) goes through this.
// Populates lastCapture (needed by peek:select for cropping) and returns the
// picker-ready payload, or null.
async function captureScreen() {
  cleanupCapture();
  lastCapture = null;
  try {
    const display = screen.getPrimaryDisplay();
    const scaleFactor = display.scaleFactor || 1;
    const physW = Math.round(display.size.width * scaleFactor);
    const physH = Math.round(display.size.height * scaleFactor);
    const shrink = Math.min(1, CAPTURE_MAX / Math.max(physW, physH));
    const tw = Math.max(1, Math.round(physW * shrink));
    const th = Math.max(1, Math.round(physH * shrink));
    const sources = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width: tw, height: th } });
    const src = sources.find((s) => String(s.display_id) === String(display.id)) || sources[0];
    if (src && !src.thumbnail.isEmpty()) lastCapture = { image: src.thumbnail, width: tw, height: th };
  } catch {
    lastCapture = null;
  }
  if (!lastCapture) return null;
  return { dataUrl: lastCapture.image.toDataURL(), width: lastCapture.width, height: lastCapture.height };
}


// Win32 foreground-window capture/restore for "replace in place" — via koffi
// (electron/win32.cjs) so selection grabs don't pay a PowerShell spawn per
// gesture (~0.5–1s each on Windows). Windows' anti-focus-stealing protection
// can still block SetForegroundWindow; peek:replace-selection reports that
// failure explicitly rather than pasting into the wrong window.

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function simulateCopy() {
  platform.simulateCopy(uIOhook);
}

// Global (system-wide, not just within Peek's own window) mouse+key hook —
// the only way to notice "the user just selected some text in some other
// app" without that app ever sending Peek an event, regardless of *how* the
// selection was made (drag, double/triple-click, Ctrl+A, Shift+navigation).
// Scoped tightly: only listens for mouse buttons and a small set of
// selection-relevant keys (never general typing), and only while text mode's
// overlay is actually open — started/stopped alongside it, never left running.
let selectionGrabGen = 0;
let selectionGrabPromise = null;
let selectionHookActive = false;
let selectionMouseDown = null; // {x, y} while a potential mouse gesture (click or drag) is in progress
let selectionSourceHandle = null; // foreground window at grab time — where "replace in place" pastes back into
let pendingSelection = null; // { text, handle } — grabbed eagerly, revealed lazily on a "Refine" click

// Grabs the selection the instant a real gesture is noticed (drag past a
// threshold, double/triple-click, Ctrl+A, Shift+navigation — see the callers
// below), while the source app still naturally holds OS focus. This *has* to
// happen now, not later: a background process asking Windows to hand focus
// back to some other window (which is what clicking a later "Refine" button
// inside Peek's own window would require) runs straight into Windows'
// anti-focus-stealing protection and reliably fails — confirmed empirically,
// not theoretical. Grabbing eagerly means clicking "Refine" just reveals the
// already-grabbed text, no further OS trickery required, so it always works.
async function noteSelectionPending(cssX, cssY) {
  if (BrowserWindow.getFocusedWindow() === overlayWin) return;

  const gen = ++selectionGrabGen;
  overlayWin?.webContents.send("peek:selection-pending", { x: cssX, y: cssY });

  selectionGrabPromise = (async () => {
    await sleep(20);
    if (gen !== selectionGrabGen) return false;

    const fg = platform.getForegroundWindowInfo();
    if (!fg.handle || platform.isTerminalWindow(fg)) return false;

    const beforeMarker = platform.getClipboardMarker(fg, () => clipboard.readText());
    simulateCopy();
    let changed = await platform.waitForClipboardChange(beforeMarker, {
      timeoutMs: 120, intervalMs: 2, readClipboard: () => clipboard.readText(),
    });
    if (!changed) {
      await sleep(25);
      simulateCopy();
      changed = await platform.waitForClipboardChange(beforeMarker, {
        timeoutMs: 320, intervalMs: 2, readClipboard: () => clipboard.readText(),
      });
    }
    if (!changed) return false;

    const text = clipboard.readText();
    if (!text?.trim()) return false;

    pendingSelection = {
      text,
      handle: fg.handle,
      context: {
        processName: fg.processName || "",
        windowClass: fg.windowClass || "",
        windowTitle: fg.windowTitle || "",
      },
    };
    return true;
  })();

  const ok = await selectionGrabPromise;
  selectionGrabPromise = null;
  if (gen !== selectionGrabGen) return;
  if (!ok) overlayWin?.webContents.send("peek:selection-cleared");
}

function onSelectionMouseDown(e) {
  selectionMouseDown = { x: e.x, y: e.y };
}

// Below this, a mouseup is just an ordinary click (positioning a cursor,
// pressing a button) — not a drag-selection. Without this check, *every*
// click anywhere (including clicking into Peek's own composer) looked like a
// selection attempt and popped the "Refine" pill up for nothing.
const SELECTION_DRAG_THRESHOLD = 4;

function onSelectionMouseUp(e) {
  const start = selectionMouseDown;
  selectionMouseDown = null;
  if (!start) return;
  const dx = e.x - start.x, dy = e.y - start.y;
  const dragged = Math.sqrt(dx * dx + dy * dy) > SELECTION_DRAG_THRESHOLD;
  // Double/triple-click selects a word/paragraph with no drag at all — uiohook
  // reports this via `clicks`, so it still counts as a real selection attempt.
  const isMultiClick = (e.clicks || 1) >= 2;
  if (!dragged && !isMultiClick) {
    // A plain click elsewhere almost always deselects whatever was
    // previously selected in that app — there's no cross-app "selection
    // changed" event to hook, so this is the pragmatic app-agnostic signal
    // that a still-showing "Refine" pill (from an earlier selection) is now
    // stale and should disappear. Skip entirely for clicks landing inside
    // Peek's own window (clicking the pill/popup itself, or the composer) —
    // same focus check noteSelectionPending already relies on below.
    if (BrowserWindow.getFocusedWindow() !== overlayWin) {
      selectionGrabGen++;
      overlayWin?.webContents.send("peek:selection-cleared");
    }
    return;
  }
  // uiohook: macOS reports Cocoa points; Windows reports physical screen px.
  // Convert into overlay-window CSS px via screenCoords (see screenCoords.cjs).
  const { x, y } = screenCoords.uiohookToOverlay(e.x, e.y);
  noteSelectionPending(x, y);
}

// Keyboard-driven selection has no drag point to anchor the pill at, so it
// uses the current cursor position instead. screen.getCursorScreenPoint()
// (unlike uiohook's mouse coords) is already in logical/DIP units, matching
// display.workArea directly — no scaleFactor division needed here.
const SELECTION_NAV_KEYS = new Set([
  UiohookKey.Home, UiohookKey.End, UiohookKey.PageUp, UiohookKey.PageDown,
  UiohookKey.ArrowLeft, UiohookKey.ArrowUp, UiohookKey.ArrowRight, UiohookKey.ArrowDown,
]);

function onSelectionKeyUp(e) {
  const isSelectAll = platform.isSelectAllKeyEvent(e);
  const isShiftExtend = e.shiftKey && SELECTION_NAV_KEYS.has(e.keycode);
  if (!isSelectAll && !isShiftExtend) return;
  const { x, y } = screenCoords.cursorToOverlay();
  noteSelectionPending(x, y);
}

function startSelectionHook() {
  if (selectionHookActive) return;
  selectionHookActive = true;
  selectionMouseDown = null;
  uIOhook.on("mousedown", onSelectionMouseDown);
  uIOhook.on("mouseup", onSelectionMouseUp);
  uIOhook.on("keyup", onSelectionKeyUp);
  try {
    uIOhook.start();
  } catch (err) {
    if (platform.isMac) {
      console.warn("[peek] Selection hook failed — grant Accessibility permission in System Settings → Privacy & Security → Accessibility.");
    }
    console.warn("[peek] uIOhook.start failed:", err?.message || err);
  }
}

function stopSelectionHook() {
  if (!selectionHookActive) return;
  selectionHookActive = false;
  uIOhook.removeListener("mousedown", onSelectionMouseDown);
  uIOhook.removeListener("mouseup", onSelectionMouseUp);
  uIOhook.removeListener("keyup", onSelectionKeyUp);
  try { uIOhook.stop(); } catch {}
  selectionMouseDown = null;
  selectionSourceHandle = null;
  pendingSelection = null;
}

// Peek is either fully off (bubble hidden, nothing running) or "active" —
// bubble showing, everything else (menu / capture / a panel) reachable from
// there. Arming no longer auto-picks a mode the way the old hotkey flow did
// — it just shows the bubble; the renderer's new bubble menu is what
// actually starts an image/text/voice session. The global selection hook
// starts here too and stays up for the WHOLE active session regardless of
// what else Peek is showing (menu, mid-capture, a panel) — a text selection
// in some other app can be Refined any time the bubble is on screen, not
// just while a particular sub-mode happens to be open.
function activatePeek() {
  if (!overlayWin) return;
  if (!ensureMacAccessibilityForOverlay()) return;
  cleanupCapture();
  lastCapture = null;
  overlayWin.show();
  overlayWin.setAlwaysOnTop(true, "screen-saver");
  overlayWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWin.moveTop();
  overlayWin.setIgnoreMouseEvents(true, { forward: true }); // hit-test mode; renderer refines per-pixel from here
  startSelectionHook();
  overlayWin.webContents.send("peek:activate");
}

function deactivatePeek() {
  closeAll();
  overlayWin?.webContents.send("peek:deactivate");
  if (overlayWin && !overlayWin.isDestroyed()) overlayWin.hide();
}

// Whether Peek is active at all right now (bubble visible, in any of its
// sub-states) — kept in sync by the renderer over peek:panel-expanded every
// time it changes. This is what makes the hotkey (and the tray's "Ask about
// screen" item) a hard on/off switch for the bubble itself, matching "bubble
// on screen" = "Peek active" directly, rather than toggling an open panel's
// minimized state the way it used to.
let modeArmed = false;

function onHotkeyPressed() {
  if (modeArmed) deactivatePeek();
  else activatePeek();
}

// Same full-capture, no-hit-testing window state as the picker — just a
// different renderer view (the hotkey recorder instead of the screenshot).
// Reachable from the tray regardless of whether Peek is currently active, so
// this stops the selection hook proactively — the renderer always lands back
// on fully idle when recording finishes (see App.jsx's closeRecord), and
// without this the hook would otherwise keep running invisibly with nothing
// left to tell it to stop.
function startRecording() {
  if (!overlayWin) return;
  cleanupCapture();
  lastCapture = null;
  stopSelectionHook();
  overlayWin.show();
  overlayWin.setAlwaysOnTop(true, "screen-saver");
  overlayWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWin.setIgnoreMouseEvents(false);
  overlayWin.webContents.send("peek:record");
}

ipcMain.handle("peek:select", (_e, sel) => {
  if (!lastCapture || !overlayWin) return { error: "no capture" };
  let img = lastCapture.image;
  if (sel?.mode === "region" && sel.rect) {
    const { x, y, width, height } = sel.rect;
    const cx = Math.max(0, Math.min(lastCapture.width - 1, Math.round(x)));
    const cy = Math.max(0, Math.min(lastCapture.height - 1, Math.round(y)));
    const cw = Math.max(1, Math.min(lastCapture.width - cx, Math.round(width)));
    const ch = Math.max(1, Math.min(lastCapture.height - cy, Math.round(height)));
    if (cw < 4 || ch < 4) return { error: "selection too small" };
    img = img.crop({ x: cx, y: cy, width: cw, height: ch });
  }
  if (!panelSessionId) panelSessionId = String(Date.now());
  const cropDir = path.join(os.tmpdir(), `peek-crops-${panelSessionId}`);
  fs.mkdirSync(cropDir, { recursive: true });
  const out = path.join(cropDir, `crop-${Date.now()}.png`);
  fs.writeFileSync(out, img.toPNG());
  capturedPath = out;
  panelSessionCrops.push(out);
  const size = img.getSize();
  const thumb = size.width > 320 ? img.resize({ width: 320 }) : img;
  const previewMax = Number(process.env.PEEK_PREVIEW_MAX || 1600);
  const preview = size.width > previewMax ? img.resize({ width: previewMax }) : img;
  // Selection stays on the same full-mouse-capture screen (no click-through
  // hand-off to a separate hit-tested panel mode) — the composer and the
  // drag-to-reselect crosshair now live on one screen, so the window keeps
  // full capture the whole time the overlay is up.
  return {
    imagePath: out,
    thumbDataUrl: thumb.toDataURL(),
    previewDataUrl: preview.toDataURL(),
    width: size.width,
    height: size.height,
    cropIndex: panelSessionCrops.length - 1,
  };
});

// On-demand capture — used by the bubble menu's Image/Chat-with-screen/
// Summarize choices and by switching into image mode from an already-open
// text/voice panel. Hides Peek's own (transparent) overlay for the instant
// of the actual shot so its own UI never composites into the capture, then
// restores it. The selection hook is deliberately left running through this
// — it's tied to activatePeek/deactivatePeek now, not to which sub-mode
// happens to be showing (see activatePeek's comment).
//
// suppressOverlayBlurReport wraps the whole hide-to-show window: this
// hide() is our own doing, not the user clicking away, so it must not be
// reported as a real blur — otherwise an already-open panel (its blur
// listener now live for every mode, not just image/voice) would
// auto-minimize itself the instant you switch its own mode tab into Image.
ipcMain.handle("peek:capture-now", async () => {
  if (!overlayWin) return null;
  const wasVisible = overlayWin.isVisible();
  if (wasVisible) suppressOverlayBlurReport = true;
  try {
    if (wasVisible) {
      overlayWin.hide();
      await new Promise((r) => setTimeout(r, 160));
    }
    const shot = await captureScreen();
    if (wasVisible) {
      overlayWin.show();
      overlayWin.setAlwaysOnTop(true, "screen-saver");
      overlayWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      overlayWin.moveTop();
      overlayWin.setIgnoreMouseEvents(false);
    }
    return shot;
  } finally {
    suppressOverlayBlurReport = false;
  }
});


async function ensureScreenshotSaveDir(win) {
  const cfg = loadConfig();
  const existing = cfg.screenshotSaveDir;
  if (existing) {
    try {
      if (fs.statSync(existing).isDirectory()) return existing;
    } catch {}
  }
  const res = await dialog.showOpenDialog(win, {
    title: "Choose folder for saved screenshots",
    message: "Peek will save cropped screenshots here.",
    properties: ["openDirectory", "createDirectory"],
  });
  if (res.canceled || !res.filePaths[0]) return null;
  const dir = res.filePaths[0];
  saveConfig({ screenshotSaveDir: dir });
  return dir;
}

// Saves the current cropped screenshot PNG to the user's chosen folder.
// On first save, prompts for a folder and persists it to ~/.peek/config.json.
ipcMain.handle("peek:save-screenshot", async (e, { imagePath } = {}) => {
  if (!imagePath) return { error: "No screenshot to save" };
  try {
    if (!fs.existsSync(imagePath)) return { error: "Screenshot file is missing" };
  } catch {
    return { error: "Screenshot file is missing" };
  }
  const win = BrowserWindow.fromWebContents(e.sender);
  const dir = await ensureScreenshotSaveDir(win);
  if (!dir) return { canceled: true };
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const dest = path.join(dir, `peek-${stamp}.png`);
  try {
    fs.copyFileSync(imagePath, dest);
    return { savedPath: dest, saveDir: dir };
  } catch (err) {
    return { error: String(err.message || err) };
  }
});

// Save refined text as Word, Markdown, or plain text — native save dialog per format.
ipcMain.handle("peek:export-text", async (e, { text, format = "txt", defaultName } = {}) => {
  const fmt = textExport.FORMATS[format] || textExport.FORMATS.txt;
  const win = BrowserWindow.fromWebContents(e.sender);
  const cfg = loadConfig();
  const baseName = defaultName || textExport.defaultExportName();
  const startDir = cfg.exportSaveDir && fs.existsSync(cfg.exportSaveDir) ? cfg.exportSaveDir : os.homedir();
  const res = await dialog.showSaveDialog(win, {
    title: `Save as ${fmt.label}`,
    defaultPath: path.join(startDir, `${baseName}.${fmt.ext}`),
    filters: fmt.filters,
  });
  if (res.canceled || !res.filePath) return { canceled: true };
  try {
    await textExport.writeExport(format, res.filePath, text);
    saveConfig({ exportSaveDir: path.dirname(res.filePath) });
    return { savedPath: res.filePath, format };
  } catch (err) {
    return { error: String(err.message || err) };
  }
});

// Dashboard's composer "attach" button — user-picked image instead of a
// screen capture, same {imagePath, thumbDataUrl} shape peek:select returns
// so the renderer/backend don't need to care which path an image came from.
ipcMain.handle("peek:pick-image", async (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const res = await dialog.showOpenDialog(win, {
    title: "Attach an image",
    properties: ["openFile"],
    filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp"] }],
  });
  if (res.canceled || !res.filePaths[0]) return null;
  const filePath = res.filePaths[0];
  try {
    const img = nativeImage.createFromPath(filePath);
    if (img.isEmpty()) return { error: "Couldn't read that image" };
    const size = img.getSize();
    const thumb = size.width > 320 ? img.resize({ width: 320 }) : img;
    return { imagePath: filePath, thumbDataUrl: thumb.toDataURL() };
  } catch (e) {
    return { error: String(e.message || e) };
  }
});

// Shared by both the dashboard's text chat and the hotkey overlay panel — the
// only difference is whether imagePath/sessionId are present. Every answered
// question is persisted: a fresh sessionId is minted on the first turn and
// returned so the caller can keep threading subsequent turns onto it.
ipcMain.handle("peek:ask", async (_e, payload = {}) => {
  const {
    imagePath, question, history = [], backend: which = "claude",
    sessionId, thumbDataUrl, mode, refineInstruction, selectedText,
  } = payload;
  if (!String(question || refineInstruction || "").trim()) return { error: "missing question" };
  try {
    const text = await backend.ask({
      backend: which, imagePath,
      question: String(question || "").trim(),
      history, mode, refineInstruction, selectedText,
    });
    let sid = sessionId;
    if (!sid) sid = store.createSession({ backend: which, imagePath, thumbDataUrl }).id;
    store.appendTurn(sid, { q: question.trim(), a: text });
    return { text, sessionId: sid };
  } catch (e) {
    return { error: String(e.message || e) };
  }
});

ipcMain.handle("peek:submit-hotkey", (_e, accel) => rebindHotkey(String(accel || "")));
ipcMain.handle("peek:hotkey:get", () => hotkeyAccel);
// Prefer the real name from the Claude Code CLI's own login (~/.claude.json,
// written by `claude login`) over the bare OS account name — a shared/local
// Windows profile name like "11ara" isn't who's actually asking. Codex CLI's
// auth.json (~/.codex/auth.json) only stores an API key in this setup, no
// display name, so there's nothing to read there; falls through to the OS
// username if the CLI config is missing or logged out.
function getCliDisplayName() {
  try {
    const raw = fs.readFileSync(path.join(os.homedir(), ".claude.json"), "utf8");
    const name = JSON.parse(raw)?.oauthAccount?.displayName;
    if (name && typeof name === "string") return name.trim();
  } catch {}
  return null;
}

ipcMain.handle("peek:whoami", () => {
  try { return getCliDisplayName() || os.userInfo().username; } catch { return ""; }
});

ipcMain.handle("peek:sessions:list", () => { try { return store.listSessions(); } catch { return []; } });
ipcMain.handle("peek:sessions:get", (_e, id) => { try { return store.getSession(id); } catch { return null; } });
ipcMain.handle("peek:sessions:delete", (_e, id) => {
  try { store.deleteSession(id); return { ok: true }; } catch (e) { return { error: String(e.message || e) }; }
});
ipcMain.handle("peek:sessions:rename", (_e, id, title) => {
  try { return store.renameSession(id, title); } catch (e) { return { error: String(e.message || e) }; }
});

ipcMain.handle("peek:clipboard-write", (_e, text) => { clipboard.writeText(String(text || "")); return { ok: true }; });

ipcMain.handle("peek:ensure-mic-access", async () => {
  const resume = suspendOverlayForSystemUI();
  try {
    return await micAccess.ensureMicrophoneAccess();
  } finally {
    resume();
  }
});
ipcMain.handle("peek:open-mic-settings", () => {
  const resume = suspendOverlayForSystemUI();
  try {
    micAccess.openMicrophoneSettings();
    return { ok: true };
  } finally {
    setTimeout(resume, 400);
  }
});

ipcMain.handle("peek:transcribe-audio", async (_e, meta, buffer) => {
  try {
    const len = meta?.length || 0;
    if (!len || !buffer) return "";
    const samples = new Float32Array(buffer, 0, len);
    const res = await voiceTranscribe.transcribeAudio(samples, meta.sampleRate || 16000);
    if (typeof res === "string") return res;
    return "";
  } catch (err) {
    console.warn("[peek] transcribe-audio:", err.message);
    return { error: err.message || "Transcription failed" };
  }
});

ipcMain.handle("peek:ocr-layout", async (_e, imagePath) => {
  if (!imagePath) return { error: "no image" };
  try {
    const layout = await ocr.recognizeLayout(imagePath);
    const img = nativeImage.createFromPath(imagePath);
    const { width, height } = img.getSize();
    return {
      ...layout,
      width,
      height,
      displayDataUrl: img.toDataURL(),
    };
  } catch (e) {
    return { error: String(e.message || e) };
  }
});

// Reveals whatever noteSelectionPending already grabbed when the user clicks
// the "Refine" pill — no clipboard access or focus juggling here, it's
// already done and waiting. Kept as a round-trip (rather than sending the
// text down alongside the pill's position) so the renderer never holds the
// actual grabbed text until the user has explicitly asked to see it.
ipcMain.handle("peek:grab-selection", async () => {
  if (selectionGrabPromise) await selectionGrabPromise;
  if (!pendingSelection) return { error: "Nothing to grab — try selecting again." };
  const { text, handle, context } = pendingSelection;
  selectionSourceHandle = handle; // for the eventual Replace-in-place flow
  pendingSelection = null;
  return { text, context: context || null };
});

// SelectionPopup's "Replace" (and "Undo", which just calls this again with
// the original text) — writes the given text to the clipboard, restores OS
// focus to whatever app the selection came from, then simulates Ctrl+V. No
// extra sleep needed here anymore: restoreForegroundWindow now polls until
// it can confirm the target genuinely holds foreground before returning, so
// there's nothing left to wait out afterward. See the caveat above
// restoreForegroundWindow: Windows can still refuse the foreground-focus
// restore outright, in which case this reports failure rather than silently
// pasting into the wrong window.
ipcMain.handle("peek:replace-selection", async (_e, text) => {
  if (!selectionSourceHandle) return { error: "No source window to paste into — try Copy instead." };
  clipboard.writeText(String(text || ""));
  const restored = await platform.restoreForegroundWindow(selectionSourceHandle);
  if (!restored) return { error: platform.replaceFocusErrorMessage() };
  try {
    platform.simulatePaste(uIOhook);
  } catch (e) {
    return { error: String(e?.message || e) };
  }
  return { ok: true };
});

ipcMain.handle("peek:platform-info", () => ({
  platform: process.platform,
  isMac: platform.isMac,
  loginItemLabel: platform.loginItemLabel(),
  modifierHints: platform.modifierHintLabels(),
}));

ipcMain.handle("peek:login-item:get", () => app.getLoginItemSettings().openAtLogin);
ipcMain.handle("peek:login-item:set", (_e, on) => {
  setLoginItem(!!on);
  return { ok: true };
});

ipcMain.on("peek:window:minimize", (e) => BrowserWindow.fromWebContents(e.sender)?.minimize());
ipcMain.on("peek:window:maximize", (e) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (!w) return;
  if (w.isMaximized()) w.unmaximize(); else w.maximize();
});
ipcMain.on("peek:window:close", (e) => BrowserWindow.fromWebContents(e.sender)?.close());

// Ending the current panel/session (Panel's Close button) — lighter than a
// full deactivatePeek(): cleans up the temp capture file but leaves the
// selection hook and click-through state alone, since Peek stays active
// (back to just the bubble) rather than fully hiding. Only the hotkey
// (deactivatePeek) stops the hook and hides the bubble.
ipcMain.on("peek:end-session", () => { cleanupCapture(); cleanupPanelSessionCrops(); lastCapture = null; });
// The bubble's own small close (×) badge — same full deactivation as
// pressing the hotkey while active, just reachable without it.
ipcMain.on("peek:deactivate-request", () => deactivatePeek());
ipcMain.on("peek:open-dashboard", () => showDashboard());
ipcMain.on("peek:set-clickthrough", (_e, on) => { overlayWin?.setIgnoreMouseEvents(!!on, { forward: true }); });
ipcMain.on("peek:quit", () => app.quit());
ipcMain.on("peek:panel-expanded", (_e, armed) => { modeArmed = !!armed; });
ipcMain.on("peek:notify", (_e, { title, body } = {}) => {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title: title || "Peek", body: body || "" });
  n.on("click", () => {
    if (!overlayWin || overlayWin.isDestroyed()) return;
    overlayWin.show();
    overlayWin.setAlwaysOnTop(true, "screen-saver");
    overlayWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    overlayWin.moveTop();
    overlayWin.setIgnoreMouseEvents(false);
    overlayWin.webContents.send("peek:restore-panel");
  });
  n.show();
});

function bindShortcut(accelerators, handler) {
  for (const acc of accelerators) {
    try {
      if (globalShortcut.register(acc, handler) && globalShortcut.isRegistered(acc)) return acc;
      globalShortcut.unregister(acc);
    } catch {}
  }
  return null;
}

function registerShortcut() {
  const cfg = loadConfig();
  const candidates = cfg.hotkey ? [cfg.hotkey, ...DEFAULT_HOTKEY_CANDIDATES] : DEFAULT_HOTKEY_CANDIDATES;
  hotkeyAccel = bindShortcut(candidates, onHotkeyPressed);
  // Sticky: remember whichever combo actually worked, so next launch tries it first.
  if (hotkeyAccel) saveConfig({ hotkey: hotkeyAccel });
  if (!hotkeyAccel && Notification.isSupported()) {
    new Notification({
      title: "Peek — no hotkey available",
      body: "Every combo tried was already taken by something else. Use the tray icon, or set your own via \"Change hotkey…\".",
    }).show();
  }
}

/** Swap the bound hotkey at runtime; rolls back if the new combo is taken. */
function rebindHotkey(newAccel) {
  if (!newAccel) return { error: "no combo captured" };
  const prev = hotkeyAccel;
  if (prev) { try { globalShortcut.unregister(prev); } catch {} }
  let ok = false;
  try { ok = globalShortcut.register(newAccel, onHotkeyPressed) && globalShortcut.isRegistered(newAccel); } catch { ok = false; }
  if (ok) {
    hotkeyAccel = newAccel;
    saveConfig({ hotkey: newAccel });
    refreshTray();
    return { ok: true, accel: newAccel };
  }
  if (prev) { try { globalShortcut.register(prev, onHotkeyPressed); } catch {} } // roll back — never leave the user with nothing bound
  return { error: `${newAccel} is already in use by another app` };
}

const fmtAccel = (acc) => platform.formatAccelerator(acc);

// Shared by the tray checkbox and the dashboard Settings toggle — both just
// flip the same OS login-item registration.
function setLoginItem(openAtLogin) {
  app.setLoginItemSettings({
    openAtLogin,
    path: process.execPath,
    args: app.isPackaged ? [] : [path.join(__dirname, "..")],
  });
  refreshTray();
}

// createDashboardWindow() already shows+focuses an existing window instead
// of recreating it, so this is just a friendlier name for tray/second-instance callers.
function showDashboard() { createDashboardWindow(); }

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    { label: "Open Peek", click: () => showDashboard() },
    { type: "separator" },
    { label: `Ask about screen  (${fmtAccel(hotkeyAccel)})`, click: () => onHotkeyPressed() },
    { label: "Change hotkey…", click: () => startRecording() },
    { label: "Close panel", click: () => deactivatePeek() },
    { type: "separator" },
    {
      label: platform.loginItemLabel(),
      type: "checkbox",
      checked: app.getLoginItemSettings().openAtLogin,
      click: (item) => setLoginItem(item.checked),
    },
    { type: "separator" },
    { label: "Reload", click: () => { overlayWin?.reload(); dashboardWin?.reload(); } },
    { label: "Quit Peek", click: () => app.quit() },
  ]);
}

function createTray() {
  const iconPath = path.join(__dirname, "..", "public", "icon-192.png");
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip("Peek");
  tray.setContextMenu(buildTrayMenu());
  tray.on("click", () => showDashboard());
}

function refreshTray() { if (tray) tray.setContextMenu(buildTrayMenu()); }

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => showDashboard());

  app.whenReady().then(() => {
    if (process.platform === "win32") app.setAppUserModelId("com.peek.overlay");
    const allowMedia = (permission, details) => {
      if (permission === "notifications") return true;
      if (permission === "media" || permission === "audioCapture" || permission === "videoCapture") return true;
      if (permission === "media" && details?.mediaTypes?.includes?.("audio")) return true;
      return false;
    };
    session.defaultSession.setPermissionRequestHandler((_wc, permission, cb, details) => {
      cb(allowMedia(permission, details));
    });
    session.defaultSession.setPermissionCheckHandler((_wc, permission, _origin, details) => {
      return allowMedia(permission, details);
    });
    createWindow();
    voiceTranscribe.warmup();
    registerShortcut(); // before the tray so its label shows the real bound key
    createTray();
    createDashboardWindow(); // Peek's main app window — shown on launch
    screen.on("display-metrics-changed", () => {
      if (!overlayWin) return;
      const { workArea } = screen.getPrimaryDisplay();
      overlayWin.setBounds(workArea);
    });
  });

  app.on("window-all-closed", () => app.quit());
  app.on("activate", () => showDashboard());
  app.on("before-quit", () => { isQuitting = true; });
  app.on("will-quit", () => {
    globalShortcut.unregisterAll();
    cleanupCapture();
  });
}
