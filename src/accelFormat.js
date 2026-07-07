let platformInfo = null;

export async function loadPlatformInfo() {
  if (platformInfo) return platformInfo;
  try {
    platformInfo = await window.peekDesktop.getPlatformInfo();
  } catch {
    platformInfo = { isMac: false, loginItemLabel: "Start with Windows" };
  }
  return platformInfo;
}

export function fmtAccel(acc) {
  if (!acc) return null;
  if (platformInfo?.isMac) {
    return acc
      .replace(/Super/g, "⌘")
      .replace(/Command/g, "⌘")
      .replace(/Control/g, "⌃")
      .replace(/Alt/g, "⌥")
      .replace(/Shift/g, "⇧");
  }
  return acc.replace(/Control/g, "Ctrl").replace(/Super/g, "Win");
}

export function modifierChips() {
  if (platformInfo?.isMac) {
    return [
      { key: "meta", label: "⌘" },
      { key: "alt", label: "⌥" },
      { key: "shift", label: "⇧" },
      { key: "ctrl", label: "⌃" },
    ];
  }
  return [
    { key: "ctrl", label: "Ctrl" },
    { key: "alt", label: "Alt" },
    { key: "shift", label: "Shift" },
    { key: "meta", label: "Win" },
  ];
}

export function hotkeyRecordHint() {
  if (platformInfo?.isMac) return "Needs ⌘, ⌥, or ⌃ held down · Esc to cancel";
  return "Needs Ctrl, Alt, or Win held down · Esc to cancel";
}
