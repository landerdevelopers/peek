# Peek — Product Requirements Document

Positioning + feature roadmap, written against the two products you're
benchmarking against (Merlin AI, Monica AI) and Peek's actual code as it
stands today (`electron/main.cjs`, `electron/backend.cjs`).

## 1. Positioning

**One-liner:** Peek is the screen-reading assistant for people who already
pay for Claude — and because it's built on Claude Code instead of a bare
model API, it can act, not just answer.

For developers and power users who already have a Claude Code (or Codex CLI) subscription, who want instant AI context on whatever's on their screen without alt-tabbing to a chat window — Peek is a local, hotkey-triggered screen assistant that answers through the CLI you already pay for. Unlike Merlin AI or Monica AI, which resell model access as a separate subscription and are sandboxed to a single browser tab, Peek costs nothing beyond what you already pay Anthropic/OpenAI, works in any desktop app, and — because the backend is the real Claude Code CLI — can eventually act on your screen, not just describe it.

**Why this holds up (not just marketing):** Merlin (20M+ users) and Monica
(10M+ users) are both Chrome/Edge extensions reselling GPT/Claude/Gemini
access under a flat monthly fee. That's their ceiling too — a content
script only ever has DOM access to one browser tab. It can never run a
command, edit a file, or touch anything outside the page. Peek's backend
is a real coding-agent CLI (`electron/backend.cjs`), so the ceiling is
structurally higher — Peek just isn't using the extra headroom yet (see §6).

## 2. Target user

Someone who:
- Already has a `claude` or `codex` CLI login (this is a prerequisite, not
  a nice-to-have — Peek has no fallback billing of its own).
- Spends their day across an IDE, terminal, browser, and docs — not just a
  browser tab.
- Wants an answer grounded in what's actually on screen, without breaking
  flow to open a separate app.
- Would rather the assistant fix the thing than describe how to fix it,
  once that's trustworthy enough to allow.

## 3. Non-goals

- Not a model-access reseller / aggregator business — Peek has no
  interest in supporting every model under the sun the way Merlin does;
  it supports whatever CLI you're already authenticated with.
- Not a general consumer "AI for everyone" product — no onboarding funnel,
  no free tier to protect margin on, no growth-loop mechanics.
- Not a cloud service — no Peek-run servers, no Peek account system.
- Mobile apps, cross-device sync, image/video generation, and per-site DOM
  hooks (Gmail compose box, etc.) are deliberately out of scope — see §7.

## 4. Current feature set (shipped — this is what positioning is built on)

| Feature | What it does | Where |
|---|---|---|
| Hotkey overlay (image mode) | Press hotkey → drag-select region or full screen → ask, grounded in the screenshot | `main.cjs` `captureAndShow`/`captureScreen` |
| Text mode | Floating composer, no screenshot, quick Q&A anywhere | `main.cjs` `showOverlayNoCapture` |
| Voice input | Ask by voice instead of typing | `src/useVoiceInput.js` |
| Universal selection capture | Select text in **any** desktop app (not just a browser tab), hit Refine, get an AI-edited version, Replace-in-place pastes it back at the original cursor | `main.cjs` `noteSelectionPending`/`peek:replace-selection` |
| Multi-backend | Pick Claude Code or Codex CLI per question | `backend.cjs` `ask()` |
| Persistent sessions | Every Q&A saved locally, resumable from the dashboard or the panel dropdown | `electron/store.cjs`, `~/.peek/sessions/` |
| Dashboard app | Taskbar-visible window, browsable history, its own composer | `src/Dashboard.jsx` |
| Rebindable hotkey, tray icon, start-with-Windows | Runtime-configurable, persisted to `~/.peek/config.json` | `main.cjs` |
| Zero cloud | No Peek servers, no Peek account, no Peek billing — every question is a one-shot spawn of your own CLI | `backend.cjs` |

The "universal selection capture" row is worth calling out explicitly in
any pitch — it's already a strictly bigger version of Monica's "smart
toolbar" (which only works inside a browser tab), and it's shipped today.

## 5. Competitive snapshot

| | Merlin AI | Monica AI | Peek |
|---|---|---|---|
| Cost model | $19/mo resold subscription | Free tier + paid tiers, resold | $0 — uses your existing Claude/Codex subscription |
| Where it works | Browser tab only (Chrome/Edge extension) | Browser tab only | Any desktop app |
| Can it act on your machine? | No — DOM access only | No — DOM access only | Not yet, but architecturally yes (see §6) |
| Backend | Proxied model API calls | Proxied model API calls | Real Claude Code / Codex CLI |
| Query limits | Rationed (credits/day) to protect margin | Rationed (credits/day) to protect margin | None — whatever your own subscription allows |

## 6. Planned features, prioritized

### P0 — Agentic "Act" mode (the actual unlock)

**Problem:** `backend.cjs`'s `askClaude()` currently hard-codes
`--allowedTools Read` — Peek can only look, never touch, regardless of
what the underlying CLI is capable of. This is the whole gap between
"as good as Merlin/Monica" and "structurally better than them."

**Proposal:**
- Add an **Ask / Act** toggle to the composer. Ask (default) keeps
  today's read-only behavior exactly as-is. Act opts into `Edit`,
  `Write`, and a scoped `Bash` for that question.
- Act mode shows a visible running action log (what file/command it's
  touching) — never a silent side effect.
- Confirm-before-destructive: any command that isn't obviously safe
  (deletes, git push, installs) pauses for a one-click confirm.
- Scope the working directory sanely — `homedir()` is fine for read-only
  Q&A (current behavior, intentional per `backend.cjs` comment) but Act
  mode should let the user pin a project directory instead of defaulting
  to home.
- A visible cancel/kill button for anything mid-run.

**Why this is P0:** it's the one thing Merlin/Monica cannot ever ship,
because they don't have a real CLI underneath — they have a chat
completion endpoint. This is the entire "expand to real tasks" thesis.

### P1 — Context pinning (Merlin "Projects" analog)

Let a session pin a folder/file (or a CLAUDE.md) as durable context, reusing
Claude Code's own project-memory conventions instead of building a vector
DB. Cheap relative to value: it's mostly plumbing a path into the existing
prompt-building in `backend.cjs`.

### P1 — Recipe presets (Monica "playbooks" analog)

A handful of named quick actions in the dashboard/panel — "Explain this
error," "Draft a reply," "Summarize this doc," "Turn this into a
diagram." Each is just a prompt template + flag preset routed through the
existing `ask()` call. Gives the same "instant value" feel Merlin/Monica
lead with, at very low build cost, without waiting on Act mode.

### P2 — Scratch-file / live-edit loop (Merlin "Crafts" analog)

An "Open in scratch file" action on any answer containing code: writes it
to a temp file, opens the user's default editor, and — once Act mode
exists — lets Claude Code keep iterating on that exact file via `Edit`.
Natural fit since Claude Code already has real file tools; Merlin has to
fake this with a sandboxed web preview.

### P2 — Multi-CLI detection

Auto-detect other authenticated coding-agent CLIs on the machine (e.g.
`gemini-cli`, `opencode`) beyond `claude`/`codex`, so "use your existing
subscription" extends to whatever the user already has — without Peek
ever reselling access itself.

## 7. Explicitly out of scope

| Idea | Why not |
|---|---|
| Mobile apps | No CLI to shell out to on a phone — would mean becoming a different, cloud-backed product. |
| Cross-device sync | Either stand up a server (kills the "no cloud" pitch) or just point Syncthing/Dropbox at `~/.peek` yourself. |
| Image/video generation | Claude Code doesn't do this natively; bolting on a separate paid API contradicts "use your existing subscription." |
| Per-site DOM hooks (Gmail compose, etc.) | The existing universal selection/replace flow (§4) already covers this more generally, across every app, not just one site. |

## 8. Risks & mitigations

- **Act mode = LLM Bash access from a global hotkey.** Mitigation:
  opt-in per question, visible action log, confirm-before-destructive,
  directory scoping, one-click cancel.
- **Windows anti-focus-stealing quirks** already documented against
  Replace-in-place (`main.cjs`, `restoreForegroundWindow`) may show up
  again for Act mode's window-focus needs — known texture, not a blocker.
- **Backend latency asymmetry** — Codex measured ~30s vs Claude's ~10s
  per question (`BUILD_LOG.md`). Recipe presets and Act mode should
  default to whichever backend is faster unless the user picked
  otherwise.

## 9. Success signals

Solo/personal-scale project, so lightweight signals over vanity metrics:
- Do you reach for Peek instead of alt-tabbing to a terminal Claude Code
  session for most screen questions?
- For Act mode: how often it actually saves a manual step, vs. just being
  answered and then redone by hand anyway.
- If/when this goes beyond personal use: install → first successful
  answer time, hotkey-conflict rate, whether the tray icon survives past
  day one.

## 10. Sequencing

1. Act mode (P0) — the actual differentiator, ship behind an explicit toggle.
2. Recipe presets (P1) — cheap, immediate positioning payoff.
3. Context pinning (P1).
4. Scratch-file / live-edit loop (P2) — depends on Act mode existing.
5. Multi-CLI detection (P2).
