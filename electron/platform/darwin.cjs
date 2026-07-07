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
    mail: "mail",
    messages: "messages",
    slack: "slack",
    discord: "discord",
    notion: "notion",
    cursor: "cursor",
  };
  return map[raw] || raw.replace(/\s+/g, "");
}

function getForegroundWindowInfo() {
  const appName = runOsascript(
    'tell application "System Events" to get name of first application process whose frontmost is true',
  );
  if (!appName) {
    return { handle: null, processName: "", windowClass: "", windowTitle: "", clipSeq: "" };
  }
  let windowTitle = "";
  try {
    windowTitle = runOsascript(
      'tell application "System Events" to tell (first application process whose frontmost is true) to get name of front window',
    );
  } catch {}
  return {
    handle: appName,
    processName: normalizeProcessName(appName),
    windowClass: "",
    windowTitle,
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
