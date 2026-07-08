"use strict";

const { UiohookKey } = require("uiohook-napi");

const isMac = process.platform === "darwin";

function primaryModifier() {
  return isMac ? UiohookKey.Meta : UiohookKey.Ctrl;
}

// The main "open Peek" gesture: a quick double-tap of the primary modifier —
// Ctrl on Windows/Linux, ⌘ (Cmd) on macOS. Both the left and right physical
// keys count so it works regardless of which one the user taps.
function hotkeyModifierKeycodes() {
  return isMac
    ? new Set([UiohookKey.Meta, UiohookKey.MetaRight])
    : new Set([UiohookKey.Ctrl, UiohookKey.CtrlRight]);
}

function hotkeyLabel() {
  return isMac ? "Double-tap ⌘" : "Double-tap Ctrl";
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

function defaultImageHotkeyCandidates() {
  if (isMac) {
    return ["Super+Alt+I", "Super+Shift+I", "Control+Alt+I"];
  }
  return ["Control+Alt+I", "Control+Shift+I"];
}

function defaultTextHotkeyCandidates() {
  if (isMac) {
    return ["Super+Alt+T", "Super+Shift+T", "Control+Alt+T"];
  }
  return ["Control+Alt+T", "Control+Shift+T"];
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
  hotkeyModifierKeycodes,
  hotkeyLabel,
  simulateCopy,
  simulatePaste,
  isSelectAllKeyEvent,
  defaultHotkeyCandidates,
  defaultImageHotkeyCandidates,
  defaultTextHotkeyCandidates,
  formatAccelerator,
  loginItemLabel,
  replaceFocusErrorMessage,
  modifierHintLabels,
};
