# Peek — Mac setup (first time)

Copy-paste friendly guide for a fresh Mac. Repo: https://github.com/landerdevelopers/peek

---

## One-time setup

Open **Terminal** (`⌘ + Space` → type `Terminal` → Enter).

### 1. Xcode Command Line Tools

```bash
xcode-select --install
```

Click **Install** if a dialog appears. Wait for it to finish.

### 2. Homebrew + Node + Git

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

After install, Homebrew may print **two commands** to run (adding brew to your PATH). Copy and run those, then open a **new** Terminal window.

```bash
brew install node git
node -v
git --version
```

### 3. Claude Code CLI

Peek answers through your local Claude CLI (not a cloud API key in the app).

```bash
npm install -g @anthropic-ai/claude-code
claude login
claude -p "say hi in one word"
```

If the last command returns text, you're good.

---

## Clone and run Peek

```bash
mkdir -p ~/Projects
cd ~/Projects
git clone https://github.com/landerdevelopers/peek.git
cd peek
npm install
npm run desktop
```

First `npm install` can take several minutes.

You should see:
- A **Peek dashboard** window
- A **menu bar icon** (top-right, near Wi‑Fi/battery)

Default hotkey on Mac: **⌘ + ⌥ + A** (Command + Option + A).
Check the menu bar icon if that combo is already taken by another app.

---

## macOS permissions (required)

Grant all three, then **quit Peek completely** and run `npm run desktop` again.

> **Tip:** Grant permissions from the **dashboard window** (not while the overlay bubble is open). Peek now hides its always-on-top overlay during permission prompts so macOS dialogs stay clickable.

### Accessibility

**System Settings → Privacy & Security → Accessibility**
Enable **Peek** (or **Electron** while running from Terminal).

Needed for: text selection in other apps, Refine, Replace (⌘C / ⌘V simulation).

### Screen Recording

**System Settings → Privacy & Security → Screen Recording**
Enable **Peek** (or **Electron**).

Needed for: screenshot capture.

### Microphone

**System Settings → Privacy & Security → Microphone**
Enable **Peek** (or **Electron** while running from Terminal).

Needed for: Voice mode (local on-device transcription).

---

## Quick test

Image mode → drag a region → ask a question → get an answer

---

## Dev mode (optional)

Hot reload while editing UI:

```bash
npm run desktop:dev
```

Or two terminals:

```bash
# Terminal 1
npm run dev

# Terminal 2
PEEK_DEV=1 electron .
```

---

## Build a Mac installer (optional)

```bash
npm run dist:mac
```

Output: `release/Peek-0.1.0.dmg`

First launch of an unsigned build: right-click the app → **Open**.

---

## Troubleshooting

| Problem | Fix |
|--------|-----|
| `command not found: brew` | Run Homebrew's PATH commands from install output; open new Terminal |
| `command not found: git` | `brew install git` |
| `npm install` fails on native modules | `xcode-select --install`, then `npm install` again |
| Hotkey does nothing | Menu bar → see bound key; **Change hotkey…** → try **⌘ + ⌥ + Space** |
| Refine never appears | Accessibility permission → quit Peek → `npm run desktop` |
| Screenshot black / capture fails | Screen Recording permission → quit → relaunch |
| Voice not working / no mic | Microphone permission → quit → relaunch; first use downloads ~40MB Whisper model |
| `claude: command not found` | `npm install -g @anthropic-ai/claude-code` and `claude login` |
| Permission dialog hidden behind Peek | Quit Peek, reopen, grant from dashboard; overlay hides during prompts now |

---

## Full copy-paste block

```bash
# One-time
xcode-select --install
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
brew install node git
npm install -g @anthropic-ai/claude-code
claude login

# Peek
mkdir -p ~/Projects && cd ~/Projects
git clone https://github.com/landerdevelopers/peek.git
cd peek
npm install
npm run desktop
```

Then: **Accessibility** + **Screen Recording** + **Microphone** in System Settings → quit Peek → `npm run desktop` again.
