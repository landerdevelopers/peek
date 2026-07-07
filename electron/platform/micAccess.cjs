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

module.exports = { ensureMicrophoneAccess, openMicrophoneSettings };
