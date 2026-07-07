"use strict";

const koffi = require("koffi");

const user32 = koffi.load("user32.dll");
const kernel32 = koffi.load("kernel32.dll");

const GetForegroundWindow = user32.func("uintptr __stdcall GetForegroundWindow()");
const GetWindowThreadProcessId = user32.func(
  "uint32 __stdcall GetWindowThreadProcessId(uintptr hWnd, _Out_ uint32 *lpdwProcessId)",
);
const GetClassNameW = user32.func(
  "int __stdcall GetClassNameW(uintptr hWnd, _Out_ uint16 *lpClassName, int nMaxCount)",
);
const GetWindowTextW = user32.func(
  "int __stdcall GetWindowTextW(uintptr hWnd, _Out_ uint16 *lpString, int nMaxCount)",
);
const SetForegroundWindow = user32.func("int __stdcall SetForegroundWindow(uintptr hWnd)");
const AttachThreadInput = user32.func(
  "int __stdcall AttachThreadInput(uint32 idAttach, uint32 idAttachTo, int fAttach)",
);
const GetClipboardSequenceNumber = user32.func("uint32 __stdcall GetClipboardSequenceNumber()");
const GetCurrentThreadId = kernel32.func("uint32 __stdcall GetCurrentThreadId()");
const OpenProcess = kernel32.func(
  "uintptr __stdcall OpenProcess(uint32 dwDesiredAccess, int bInheritHandle, uint32 dwProcessId)",
);
const CloseHandle = kernel32.func("int __stdcall CloseHandle(uintptr hObject)");
const QueryFullProcessImageNameW = kernel32.func(
  "int __stdcall QueryFullProcessImageNameW(uintptr hProcess, uint32 dwFlags, _Inout_ uint16 *lpExeName, _Inout_ uint32 *lpdwSize)",
);

const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;

const TERMINAL_WINDOW_CLASSES = new Set([
  "consolewindowclass",
  "cascadia_hosting_window_class",
  "virtualconsoleclass",
  "mintty",
  "terminus",
  "alacritty",
  "wezterm",
]);

const TERMINAL_PROCESS_NAMES = new Set([
  "windowsterminal", "cmd", "powershell", "pwsh", "conhost",
  "hyper", "alacritty", "wezterm", "mintty", "tabby", "bash",
]);

function readWindowClass(hwnd) {
  const buf = koffi.alloc("uint16", 256);
  const len = GetClassNameW(hwnd, buf, 256);
  if (!len) return "";
  return koffi.decode(buf, "char16", -1).toLowerCase();
}

function readWindowTitle(hwnd) {
  const buf = koffi.alloc("uint16", 512);
  const len = GetWindowTextW(hwnd, buf, 512);
  if (!len) return "";
  return koffi.decode(buf, "char16", -1).trim();
}

function readProcessName(pid) {
  if (!pid) return "";
  const proc = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
  if (!proc) return "";
  try {
    const buf = koffi.alloc("uint16", 520);
    const size = [260];
    if (!QueryFullProcessImageNameW(proc, 0, buf, size)) return "";
    const full = koffi.decode(buf, "char16", -1);
    const base = full.split(/[/\\]/).pop() || "";
    return base.replace(/\.exe$/i, "").toLowerCase();
  } finally {
    CloseHandle(proc);
  }
}

function getForegroundWindowInfo() {
  const hwnd = GetForegroundWindow();
  if (!hwnd) {
    return { handle: null, processName: "", windowClass: "", windowTitle: "", clipSeq: GetClipboardSequenceNumber() };
  }
  const pidOut = [0];
  GetWindowThreadProcessId(hwnd, pidOut);
  const windowClass = readWindowClass(hwnd);
  const windowTitle = readWindowTitle(hwnd);
  return {
    handle: String(hwnd),
    processName: readProcessName(pidOut[0]),
    windowClass,
    windowTitle,
    clipSeq: GetClipboardSequenceNumber(),
  };
}

function isTerminalWindow({ processName, windowClass }) {
  if (TERMINAL_WINDOW_CLASSES.has(windowClass)) return true;
  return TERMINAL_PROCESS_NAMES.has(processName);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForClipboardSeqChange(beforeSeq, { timeoutMs = 450, intervalMs = 2 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (GetClipboardSequenceNumber() !== beforeSeq) return true;
    await sleep(intervalMs);
  }
  return GetClipboardSequenceNumber() !== beforeSeq;
}

async function restoreForegroundWindow(handle) {
  if (!handle) return false;
  const target = BigInt(handle);
  const fg = GetForegroundWindow();
  const targetThread = [0];
  const fgThread = [0];
  GetWindowThreadProcessId(target, targetThread);
  GetWindowThreadProcessId(fg, fgThread);
  const curThread = GetCurrentThreadId();
  let attached = false;
  if (fgThread[0] && fgThread[0] !== targetThread[0]) {
    attached = !!AttachThreadInput(curThread, fgThread[0], 1);
  }
  SetForegroundWindow(target);
  let confirmed = false;
  for (let i = 0; i < 12; i++) {
    if (BigInt(GetForegroundWindow()) === target) { confirmed = true; break; }
    await sleep(20);
  }
  if (attached) AttachThreadInput(curThread, fgThread[0], 0);
  return confirmed;
}

module.exports = {
  getForegroundWindowInfo,
  isTerminalWindow,
  waitForClipboardSeqChange,
  restoreForegroundWindow,
};
