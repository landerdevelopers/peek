# Peek

A floating, hotkey-triggered screen Q&A overlay. Press the hotkey, drag to select
part of your screen (or ask about the whole thing), and a small chat panel opens
right where you are — answered locally through your own **Claude Code** or
**Codex** CLI. No redirect to another app, no cloud account.

Sibling project to [`buddy`](../buddy) — reuses its proven overlay/click-through
technique, but skips Buddy's HTTP bridge entirely since this app has no browser/PWA
mode to serve; Electron's main process spawns `claude`/`codex` directly.

## Run it

```bash
npm install
npm run desktop        # build + launch
# or, for hot reload while developing:
npm run desktop:dev
```

Requires the `claude` CLI (and/or `codex` CLI) installed and logged in.

## Use it

- Press the hotkey (default `Ctrl+Alt+A`, falls back automatically to another
  combo if that's taken — check the tray icon for the one that actually bound).
- Drag to select part of the screen, or press **Enter** / click **Full screen**.
- Ask questions in the panel that opens. Switch between Claude Code and Codex
  per-question via the dropdown in the panel header.
- `Esc` cancels/closes at any point.
- Tray → **Change hotkey…** to rebind at runtime (persisted to `~/.peek/config.json`).

## Architecture

```
electron/main.cjs      overlay window, hotkey, screen capture, IPC
electron/backend.cjs   spawns claude -p / codex exec, builds prompts
electron/preload.cjs   contextBridge → window.peekDesktop
src/                   React UI: Picker (capture), Panel (chat), RecordHotkey
```

No server, no warm session — each question is a one-shot CLI call. Follow-up
questions in the same panel resend the conversation history as text alongside
the same screenshot path.

## Known rough edges (v1)

- Single monitor only (matches Buddy's current scope).
- Re-triggering the hotkey while a panel is open discards that thread and starts fresh.
- Codex responses are noticeably slower than Claude's in testing (~30s vs ~10s).
