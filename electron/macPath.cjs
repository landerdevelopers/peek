"use strict";

/**
 * macOS PATH remediation for CLI backends.
 *
 * A macOS GUI app launched from Finder/Dock/Login-item inherits only launchd's
 * minimal PATH (/usr/bin:/bin:/usr/sbin:/sbin) — NOT the PATH the user sets in
 * ~/.zshrc / ~/.zprofile / ~/.bash_profile. So CLIs installed via Homebrew,
 * `npm -g`, pipx, nvm, etc. (claude, codex, gemini, agy) are invisible to
 * `which`/`spawn` even though they run fine in Terminal. This makes every CLI
 * backend silently "not installed" on a packaged Mac build.
 *
 * ensureCliPath() fixes this once, in-place, by (a) importing the PATH the
 * user's login+interactive shell actually produces, and (b) appending the
 * common install locations as a fallback. It mutates process.env.PATH so both
 * detection (cliDetect) and spawning (backend) see the corrected PATH.
 *
 * No-op on Windows/Linux, where the inherited PATH is already correct.
 */

const { execFileSync } = require("node:child_process");
const os = require("node:os");
const path = require("node:path");

let applied = false;

// Common locations Mac CLIs land in — used as a fallback (and belt-and-braces
// alongside the shell import below) so detection still works if importing the
// shell PATH fails or the user installed somewhere the login shell doesn't add.
function staticMacDirs() {
  const home = os.homedir();
  return [
    "/opt/homebrew/bin", // Apple-silicon Homebrew
    "/opt/homebrew/sbin",
    "/usr/local/bin", // Intel Homebrew / manual installs
    "/usr/local/sbin",
    path.join(home, ".local", "bin"), // pipx / pip --user
    path.join(home, "bin"),
    path.join(home, ".npm-global", "bin"), // npm global prefix override
    path.join(home, ".bun", "bin"),
    path.join(home, ".deno", "bin"),
    path.join(home, ".cargo", "bin"),
  ];
}

// Best-effort: ask the user's login+interactive shell for its PATH, so nvm /
// asdf / custom exports in their rc files are honored. A marker isolates the
// value from any banner an rc file might print. Guarded by a short timeout so a
// slow or hanging rc file can't stall app startup.
function importShellPath() {
  try {
    const shell = process.env.SHELL || "/bin/zsh";
    const marker = "__PEEK_PATH__=";
    const out = execFileSync(shell, ["-ilc", `echo "${marker}$PATH"`], {
      encoding: "utf8",
      timeout: 4000,
      stdio: ["ignore", "pipe", "ignore"],
    });
    const line = String(out || "")
      .split("\n")
      .find((l) => l.startsWith(marker));
    return line ? line.slice(marker.length).trim() : "";
  } catch {
    return "";
  }
}

// De-dupe extras into the current PATH, keeping existing entries (and their
// order) first so we never shadow something the user already had resolving.
function mergePath(current, extra) {
  const sep = path.delimiter;
  const seen = new Set();
  const parts = [];
  for (const p of [...String(current || "").split(sep), ...extra]) {
    const dir = p.trim();
    if (dir && !seen.has(dir)) {
      seen.add(dir);
      parts.push(dir);
    }
  }
  return parts.join(sep);
}

function ensureCliPath() {
  if (applied || process.platform !== "darwin") return;
  applied = true;
  const shellPath = importShellPath();
  const shellDirs = shellPath ? shellPath.split(path.delimiter) : [];
  process.env.PATH = mergePath(process.env.PATH, [...shellDirs, ...staticMacDirs()]);
}

module.exports = { ensureCliPath };
