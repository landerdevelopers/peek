// Shared by RecordHotkey.jsx (the overlay's full-screen rebind flow) and
// Settings.jsx (the dashboard's inline rebind) so both build accelerators
// from raw keydown events identically.

export const MODIFIER_CODES = new Set(["ControlLeft", "ControlRight", "AltLeft", "AltRight", "ShiftLeft", "ShiftRight", "MetaLeft", "MetaRight"]);

export const CODE_MAP = {
  Space: "Space", Tab: "Tab", Enter: "Return", Backspace: "Backspace", Delete: "Delete",
  ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right",
  Home: "Home", End: "End", PageUp: "PageUp", PageDown: "PageDown", Insert: "Insert",
  Minus: "-", Equal: "=", BracketLeft: "[", BracketRight: "]", Backslash: "\\",
  Semicolon: ";", Quote: "'", Comma: ",", Period: ".", Slash: "/", Backquote: "`",
};
for (let i = 0; i <= 9; i++) CODE_MAP[`Digit${i}`] = String(i);
for (const c of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") CODE_MAP[`Key${c}`] = c;
for (let i = 1; i <= 24; i++) CODE_MAP[`F${i}`] = `F${i}`;

// null while the user is still only holding modifiers, or for keys/codes we
// don't map. Requires a non-Shift modifier (Ctrl/Alt/Win on Windows, ⌘/⌥/⌃ on Mac) —
// Shift alone is too easy to fat-finger into a global binding that swallows normal typing everywhere.
export function buildAccelerator(e) {
  if (MODIFIER_CODES.has(e.code) || e.code === "Escape") return null;
  const key = CODE_MAP[e.code];
  if (!key) return null;
  const mods = [];
  if (e.ctrlKey) mods.push("Control");
  if (e.altKey) mods.push("Alt");
  if (e.metaKey) mods.push("Super");
  if (e.shiftKey) mods.push("Shift");
  if (!mods.some((m) => m !== "Shift")) return null;
  return [...mods, key].join("+");
}
