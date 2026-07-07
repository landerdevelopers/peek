"use strict";

const { execSync } = require("node:child_process");

const TERMINAL_PROCESS_NAMES = new Set([
  "terminal", "iterm2", "iterm", "warp", "alacritty", "wezterm", "kitty", "hyper", "tabby",
  "ghostty", "rio",
]);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function runOsascript(script) {
  try {
    return execSync(`osascript -e ${JSON.stringify(script)}`, {
      encoding: "utf8",
      timeout: 2500,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function normalizeProcessName(appName) {
  const raw = String(appName || "").toLowerCase();
  const map = {
    "google chrome": "chrome",
    "microsoft edge": "msedge",
    "mozilla firefox": "firefox",
    "visual studio code": "code",
    safari: "safari",
    arc: "arc",
    "brave browser": "brave",
    mail: "mail",
    messages: "messages",
    slack: "slack",
    discord: "discord",
    notion: "notion",
    cursor: "cursor",
  };
  return map[raw] || raw.replace(/\s+/g, "");
}

function getBrowserTabInfo(appName) {
  const name = String(appName || "");
  const scripts = {
    "Google Chrome": {
      url: `tell application "Google Chrome" to get URL of active tab of front window`,
      title: `tell application "Google Chrome" to get title of active tab of front window`,
    },
    Safari: {
      url: `tell application "Safari" to get URL of current tab of front window`,
      title: `tell application "Safari" to get name of current tab of front window`,
    },
    "Microsoft Edge": {
      url: `tell application "Microsoft Edge" to get URL of active tab of front window`,
      title: `tell application "Microsoft Edge" to get title of active tab of front window`,
    },
    Arc: {
      url: `tell application "Arc" to get URL of active tab of front window`,
      title: `tell application "Arc" to get title of active tab of front window`,
    },
    Brave: {
      url: `tell application "Brave Browser" to get URL of active tab of front window`,
      title: `tell application "Brave Browser" to get title of active tab of front window`,
    },
  };
  const spec = scripts[name];
  if (!spec) return { url: "", title: "" };
  return {
    url: runOsascript(spec.url),
    title: runOsascript(spec.title),
  };
}

function getForegroundWindowInfo() {
  const appName = runOsascript(
    'tell application "System Events" to get name of first application process whose frontmost is true',
  );
  if (!appName) {
    return { handle: null, processName: "", windowClass: "", windowTitle: "", url: "", clipSeq: "" };
  }
  let windowTitle = "";
  let url = "";
  const proc = normalizeProcessName(appName);
  const browserProcs = new Set(["chrome", "safari", "msedge", "arc", "brave", "firefox", "opera", "vivaldi"]);
  if (browserProcs.has(proc)) {
    const tab = getBrowserTabInfo(appName);
    url = tab.url || "";
    windowTitle = tab.title || "";
  }
  if (!windowTitle) {
    try {
      windowTitle = runOsascript(
        'tell application "System Events" to tell (first application process whose frontmost is true) to get name of front window',
      );
    } catch {}
  }
  return {
    handle: appName,
    processName: proc,
    windowClass: "",
    windowTitle,
    url,
    clipSeq: "",
  };
}

function isTerminalWindow({ processName, windowClass }) {
  if (windowClass) return false;
  return TERMINAL_PROCESS_NAMES.has(processName);
}

async function waitForClipboardSeqChange(beforeText, { timeoutMs = 450, intervalMs = 8, readClipboard } = {}) {
  if (!readClipboard) return false;
  const before = String(beforeText ?? "");
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const now = readClipboard();
    if (now !== before && String(now || "").trim()) return true;
    await sleep(intervalMs);
  }
  const finalText = readClipboard();
  return finalText !== before && String(finalText || "").trim();
}

async function restoreForegroundWindow(handle) {
  if (!handle) return false;
  runOsascript(`tell application ${JSON.stringify(handle)} to activate`);
  await sleep(120);
  const fg = getForegroundWindowInfo();
  return fg.handle === handle;
}

module.exports = {
  getForegroundWindowInfo,
  isTerminalWindow,
  waitForClipboardSeqChange,
  restoreForegroundWindow,
};
