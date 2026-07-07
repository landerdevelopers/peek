"use strict";

const keyboard = require("./keyboard.cjs");

let native;
if (process.platform === "win32") {
  native = require("./win32.cjs");
} else if (process.platform === "darwin") {
  native = require("./darwin.cjs");
} else {
  native = {
    getForegroundWindowInfo: () => ({
      handle: null, processName: "", windowClass: "", windowTitle: "", clipSeq: "",
    }),
    isTerminalWindow: () => false,
    waitForClipboardSeqChange: async () => false,
    restoreForegroundWindow: async () => false,
  };
}

function waitForClipboardChange(beforeMarker, opts = {}) {
  if (process.platform === "darwin") {
    return native.waitForClipboardSeqChange(beforeMarker, opts);
  }
  return native.waitForClipboardSeqChange(beforeMarker, opts);
}

function getClipboardMarker(fg, readClipboard) {
  if (process.platform === "darwin") {
    return readClipboard ? readClipboard() : "";
  }
  return fg?.clipSeq ?? 0;
}

module.exports = {
  ...native,
  ...keyboard,
  waitForClipboardChange,
  getClipboardMarker,
};
