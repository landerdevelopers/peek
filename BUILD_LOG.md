# Peek — build log (session 1, 2026-07-02)

Where this project came from: you described Claude Cowork's screen-Q&A hotkey
feature, minus the part where taking a screenshot kicks you back to the Claude
desktop app and breaks your flow. Decision made: build it as a **separate,
leaner sibling app to `buddy`** (not a mode inside Buddy) — no mascot/XP
baggage, just hotkey → capture → floating answer panel, answered through your
own `claude`/`codex` CLI subscription instead of a paid Cowork plan.

## What's actually built

```
peek/
├── electron/
│   ├── main.cjs       overlay window, hotkey (+ rebind flow), screen capture, IPC
│   ├── backend.cjs     spawns `claude -p` / `codex exec`, builds the prompt
│   └── preload.cjs     contextBridge → window.peekDesktop
├── src/
│   ├── App.jsx          idle | picker | panel | record state machine
│   ├── Picker.jsx        fullscreen backdrop, drag-to-select or full-screen
│   ├── Panel.jsx          floating draggable chat panel, Claude/Codex toggle
│   ├── RecordHotkey.jsx   press-to-record custom hotkey UI
│   ├── desktop.js         click-through hit-testing (ported from buddy)
│   ├── Markdown.jsx       tiny markdown renderer (ported from buddy)
│   └── theme.js
└── scripts/generate-icons.mjs, desktop-dev.mjs
```

No HTTP bridge (unlike Buddy) — this app has no browser/PWA mode to serve, so
Electron's main process spawns the CLIs directly via `child_process`. Simpler
than Buddy's architecture on purpose.

## Verified working (real, end-to-end, not just "looks right")

- **`npm install` / `npm run build`** — clean, no errors.
- **Claude backend** (`electron/backend.cjs` → `askClaude`) — ran a real
  screenshot through `claude -p --allowedTools Read`, got a correct, grounded
  answer in ~10s.
- **Codex backend** (`askCodex`) — same test, correct answer, ~30s (notably
  slower than Claude here — worth knowing before you lean on it as default).
  Had to fix two real bugs to get this working:
  - `codex` resolves to a `.cmd` shim on Windows → `spawn()` needs `shell: true`
    to exec it at all (plain `spawn("codex", ...)` throws `ENOENT`).
  - Moved the prompt off argv onto stdin (`codex exec ... -` reads stdin) so
    free-form question text never has to survive `cmd.exe`'s quoting rules.
- **Global hotkey binding** — `Control+Alt+A`, `Control+Alt+Q`, and
  `Control+Shift+A` were ALL already claimed by something else on this test
  machine; `Control+Alt+Space` was free and bound successfully. This is why
  the hotkey is now fully configurable (see below) rather than hardcoded.
- **Capture → picker render pipeline** — confirmed via Electron's own
  `webContents.capturePage()` (bypasses the OS/screenshot layer entirely):
  the picker renders exactly right — dimmed screenshot backdrop, drag-select
  rectangle, the "Drag to select an area · Full screen (Enter) · Esc to
  cancel" instruction pill. React state, IPC payload, and image data all
  confirmed correct.

## NOT yet verified — needs you

**Real on-screen visibility of the overlay window.** In this sandboxed test
session, Electron itself reports the window as visible/on-top/opaque
(`isVisible=true`, `isAlwaysOnTop=true`, `opacity=1`), and `capturePage()`
proves it's rendering the right content — but an actual OS-level screenshot
taken via PowerShell/GDI during testing did *not* show the overlay on top of
other windows. That's a real gap I couldn't close from in here: it's either
an artifact of this particular remote/sandboxed session's screen capture (my
best guess, since `buddy` uses the identical transparent/always-on-top
technique and is a real shipped app), or a genuine z-order bug that only
shows up in some environments.

**First thing to do:** run `npm run desktop`, press the hotkey (check the
tray tooltip/menu for which one actually bound — likely `Ctrl+Alt+Space` on
this machine per `~/.peek/config.json`), and just look. If the picker
overlay doesn't appear, tell me what you *do* see and I'll dig further
(candidates: try `win.setAlwaysOnTop(true, "pop-up-menu")` or another
Electron z-order level instead of `"screen-saver"`, or check for another
always-on-top app contending for the same layer).

## Design decisions worth knowing

- **Hotkey is fully configurable, not hardcoded.** `DEFAULT_HOTKEY_CANDIDATES`
  in `main.cjs` is just a first-run starting point. Whichever one actually
  binds gets persisted to `~/.peek/config.json` and tried first next launch.
  Tray → "Change hotkey…" opens a press-to-record UI (`RecordHotkey.jsx`) at
  any time. Rebind rolls back automatically if the new combo is already taken.
- **No double-tap-modifier activation** (e.g. double-tap Ctrl, Spotlight-style).
  Electron's `globalShortcut` only does fixed key combos, not raw keystroke
  streams — true double-tap detection needs a lower-level hook library like
  `uiohook-napi`. Skipped for v1 to avoid the extra native dependency; worth
  reconsidering if the fixed-hotkey UX ever feels wrong.
- **One-shot per question, no warm session.** Follow-up questions in the same
  panel resend the conversation as text history alongside the same screenshot
  path — simpler than Buddy's warm `ClaudeSession`, since Q&A sessions here
  are short-lived by nature.
- **Capture resolution capped at 2200px** (long edge), vs Buddy's 1280px —
  set higher here since answers often depend on reading dense on-screen text,
  not just ambient description. Override via `PEEK_CAPTURE_MAX`.
- **Re-triggering the hotkey while a panel is open discards that thread** and
  starts a fresh capture. Intentional simplification for v1.
- **Model selection left to your CLI defaults** — unlike Buddy (which hardcodes
  `haiku` for parse speed), `backend.cjs` doesn't pass `--model` unless
  `PEEK_CLAUDE_MODEL` / `PEEK_CODEX_MODEL` env vars are set, so it uses
  whatever your CLI is configured to default to.

## Not built yet (fair game for next session)

- Multi-monitor support (Buddy doesn't have it either).
- Persisting/reviewing past Q&A threads across capture sessions.
- Any packaging/`electron-builder` dist run — `npm run build` only, never ran
  `npm run dist`.
