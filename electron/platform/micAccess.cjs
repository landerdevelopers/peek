"use strict";

const { systemPreferences, shell } = require("electron");

/** macOS: TCC prompt before capture. Windows/Linux: Chromium prompts on getUserMedia. */
async function ensureMicrophoneAccess() {
  if (process.platform === "darwin") {
    const status = systemPreferences.getMediaAccessStatus("microphone");
    if (status === "granted") return true;
    if (status === "denied" || status === "restricted") return false;
    return systemPreferences.askForMediaAccess("microphone");
  }
  return true;
}

// "granted" | "denied" | "restricted" | "not-determined" on macOS; always
// "granted" elsewhere. Lets callers tell whether a request will actually show a
// system permission sheet (only when "not-determined") vs. resolve silently.
function getMicrophoneAccessStatus() {
  if (process.platform === "darwin") {
    return systemPreferences.getMediaAccessStatus("microphone");
  }
  return "granted";
}

function openMicrophoneSettings() {
  if (process.platform === "darwin") {
    shell.openExternal(
      "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
    );
    return;
  }
  if (process.platform === "win32") {
    shell.openExternal("ms-settings:privacy-microphone");
  }
}

module.exports = { ensureMicrophoneAccess, getMicrophoneAccessStatus, openMicrophoneSettings };
