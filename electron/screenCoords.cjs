"use strict";

/**
 * Convert global screen coordinates into CSS px inside the overlay window.
 *
 * uiohook on macOS reports Cocoa points (DIP) via CGEventGetLocation.
 * uiohook on Windows reports virtual-screen physical pixels.
 * Electron screen APIs and overlay BrowserWindow bounds use DIP.
 */
function createScreenCoords(screen, getOverlayWin) {
  function overlayBounds() {
    const win = getOverlayWin();
    if (!win || win.isDestroyed()) return { x: 0, y: 0, width: 0, height: 0 };
    return win.getBounds();
  }

  function physicalToDip(x, y) {
    try {
      if (typeof screen.screenToDipPoint === "function") {
        return screen.screenToDipPoint({ x: Math.round(x), y: Math.round(y) });
      }
    } catch {}
    const display = screen.getDisplayNearestPoint({ x, y });
    const scale = display?.scaleFactor || 1;
    return { x: x / scale, y: y / scale };
  }

  function uiohookToOverlay(x, y) {
    const bounds = overlayBounds();
    if (process.platform === "darwin") {
      return { x: x - bounds.x, y: y - bounds.y };
    }
    const dip = physicalToDip(x, y);
    return { x: dip.x - bounds.x, y: dip.y - bounds.y };
  }

  function dipToOverlay(x, y) {
    const bounds = overlayBounds();
    return { x: x - bounds.x, y: y - bounds.y };
  }

  function cursorToOverlay() {
    const cursor = screen.getCursorScreenPoint();
    return dipToOverlay(cursor.x, cursor.y);
  }

  return { uiohookToOverlay, dipToOverlay, cursorToOverlay };
}

module.exports = { createScreenCoords };
