"use strict";

const { UiohookKey } = require("uiohook-napi");

const isMac = process.platform === "darwin";

function primaryModifier() {
  return isMac ? UiohookKey.Meta : UiohookKey.Ctrl;
}

function simulateCopy(uIOhook) {
  const mod = primaryModifier();
  try {
    uIOhook.keyToggle(mod, "down");
    uIOhook.keyTap(UiohookKey.C);
    uIOhook.keyToggle(mod, "up");
  } catch {
    uIOhook.keyTap(UiohookKey.C, [mod]);
  }
}

function simulatePaste(uIOhook) {
  const mod = primaryModifier();
  try {
    uIOhook.keyTap(UiohookKey.V, [mod]);
  } catch {}
}

function isSelectAllKeyEvent(e) {
  const modDown = isMac ? e.metaKey : e.ctrlKey;
  return modDown && e.keycode === UiohookKey.A;
}

function defaultHotkeyCandidates() {
  if (isMac) {
    return ["Super+Alt+A", "Super+Alt+Space", "Super+Shift+A", "Control+Alt+Space"];
  }
  return ["Control+Alt+A", "Control+Alt+Q", "Control+Shift+A", "Control+Alt+Space"];
}

function formatAccelerator(acc) {
  if (!acc) return "unavailable — set one below";
  if (isMac) {
    return acc
      .replace(/Super/g, "⌘")
      .replace(/Command/g, "⌘")
      .replace(/Control/g, "⌃")
      .replace(/Alt/g, "⌥")
      .replace(/Shift/g, "⇧");
  }
  return acc.replace(/Control/g, "Ctrl").replace(/Super/g, "Win");
}

function loginItemLabel() {
  return isMac ? "Open at Login" : "Start with Windows";
}

function replaceFocusErrorMessage() {
  return isMac
    ? "macOS blocked refocusing the original app — use Copy instead."
    : "Windows blocked refocusing the original window — use Copy instead.";
}

function modifierHintLabels() {
  return isMac
    ? { primary: "⌘", primaryName: "Cmd", secondary: "⌥", secondaryName: "Option" }
    : { primary: "Ctrl", primaryName: "Ctrl", secondary: "Alt", secondaryName: "Alt", win: "Win" };
}

module.exports = {
  isMac,
  primaryModifier,
  simulateCopy,
  simulatePaste,
  isSelectAllKeyEvent,
  defaultHotkeyCandidates,
  formatAccelerator,
  loginItemLabel,
  replaceFocusErrorMessage,
  modifierHintLabels,
};
