"use strict";

const { systemPreferences, shell } = require("electron");

/**
 * macOS gates all screen capture behind the Screen Recording TCC permission.
 * Before it's granted, desktopCapturer returns a frame containing only the
 * desktop wallpaper + the app's own windows (never other apps) — so an image /
 * OCR feature silently produces a useless shot with no error. Windows/Linux
 * have no such gate; desktopCapturer just works.
 *
 * NOTE: macOS only starts delivering real frames AFTER the app is restarted
 * following the grant, so callers should tell the user to relaunch.
 */
function getScreenAccessStatus() {
  if (process.platform === "darwin") {
    // "granted" | "denied" | "restricted" | "not-determined"
    return systemPreferences.getMediaAccessStatus("screen");
  }
  return "granted";
}

function hasScreenAccess() {
  return getScreenAccessStatus() === "granted";
}

function openScreenSettings() {
  if (process.platform === "darwin") {
    shell.openExternal(
      "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
    );
  }
}

module.exports = { getScreenAccessStatus, hasScreenAccess, openScreenSettings };
