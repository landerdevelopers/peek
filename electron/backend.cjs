/**
 * Runs a question (with an optional screenshot) through whichever backend the
 * user picked. ask() is a thin dispatcher over backendRegistry: CLIs (claude /
 * codex / gemini) spawn a local process, API backends POST over HTTPS
 * (apiBackends), and Ollama hits its localhost server. All are one-shot and
 * stateless — Peek has no server keeping a session warm, so follow-up questions
 * re-send the conversation history each time (as text for CLIs, as structured
 * turns for the HTTP backends; see messageBuilder).
 */
const { spawn } = require("node:child_process");
const { readFileSync, unlinkSync } = require("node:fs");
const { homedir, tmpdir } = require("node:os");
const { join } = require("node:path");
const registry = require("./backendRegistry.cjs");
const { buildCliPrompt } = require("./messageBuilder.cjs");
const apiBackends = require("./apiBackends.cjs");
const { ensureCliPath } = require("./macPath.cjs");

function askClaude(prompt, { model, timeoutMs = 90_000 } = {}) {
  return new Promise((resolve, reject) => {
    const args = [
      "-p", "--output-format", "json",
      "--max-turns", "4",
      "--mcp-config", '{"mcpServers":{}}',
      "--strict-mcp-config",
      "--allowedTools", "Read",
      ...(model ? ["--model", model] : []),
    ];
    // Neutral cwd so Peek never absorbs a project's CLAUDE.md from wherever
    // the app happened to launch.
    const child = spawn("claude", args, { windowsHide: true, cwd: homedir() });
    let out = "", err = "";
    const timer = setTimeout(() => { child.kill(); reject(new Error("claude timed out")); }, timeoutMs);
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { err += d; });
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(err.trim() || `claude exited ${code}`));
      try {
        const data = JSON.parse(out);
        const resObj = Array.isArray(data) ? data.find((d) => d.type === "result") : data;
        resolve(String(resObj?.result ?? "").trim());
      } catch { resolve(out.trim()); }
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

function askCodex(prompt, imagePath, { model, timeoutMs = 90_000 } = {}) {
  return new Promise((resolve, reject) => {
    const outFile = join(tmpdir(), `peek-codex-${Date.now()}-${Math.floor(Math.random() * 1e6)}.txt`);
    const args = [
      "exec",
      "--skip-git-repo-check",
      "--sandbox", "read-only",
      "-C", homedir(),
      ...(imagePath ? ["-i", imagePath] : []),
      "-o", outFile,
      ...(model ? ["-m", model] : []),
      "-", // read the prompt from stdin instead of argv — avoids shell-quoting free text
    ];
    // `codex` resolves to a .cmd shim on Windows, which spawn() can't exec
    // directly without a shell. Every arg here is a programmatic path/flag
    // (never the freeform prompt, which goes over stdin instead), so we quote
    // them ourselves and pass a single command string — Node's shell:true
    // only warns about unescaped args when given an args ARRAY alongside it.
    const quote = (s) => `"${String(s).replace(/"/g, '""')}"`;
    const isWin = process.platform === "win32";
    const child = isWin
      ? spawn(["codex", ...args.map(quote)].join(" "), { windowsHide: true, cwd: homedir(), shell: true })
      : spawn("codex", args, { cwd: homedir(), stdio: ["pipe", "pipe", "pipe"] });
    let err = "";
    const timer = setTimeout(() => { child.kill(); reject(new Error("codex timed out")); }, timeoutMs);
    child.stderr.on("data", (d) => { err += d; });
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) { try { unlinkSync(outFile); } catch {} return reject(new Error(err.trim() || `codex exited ${code}`)); }
      try {
        const text = readFileSync(outFile, "utf8").trim();
        try { unlinkSync(outFile); } catch {}
        resolve(text);
      } catch (e) { reject(e); }
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

// Google Antigravity CLI (`agy`), verified against v1.1.0. agy.exe is a native
// binary, so we spawn it directly (no shell): `-p` prints a single response
// non-interactively, the prompt is an argv element (Node escapes it — safe for
// newlines/quotes, no cmd length limit), `--model` overrides the session model,
// and stdin is IGNORED so print mode doesn't block waiting for EOF. It's an
// agentic CLI (slower than a raw API), hence the longer default timeout. No
// image flag — attach screenshots via the Gemini API backend instead.
function askAntigravity(prompt, { model, timeoutMs = 120_000 } = {}) {
  return new Promise((resolve, reject) => {
    const args = ["-p", prompt, ...(model ? ["--model", model] : [])];
    const child = spawn("agy", args, { windowsHide: true, cwd: homedir(), stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    const timer = setTimeout(() => { child.kill(); reject(new Error("Antigravity timed out")); }, timeoutMs);
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { err += d; });
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
    child.on("close", (code) => {
      clearTimeout(timer);
      const answer = out.trim();
      if (code !== 0 || !answer) return reject(new Error(err.trim() || answer || `agy exited ${code}`));
      resolve(answer);
    });
  });
}

// Google's Gemini CLI, non-interactive one-shot. Verified against gemini-cli
// v0.40.1 `--help`: `-p/--prompt` runs headless and its value is *appended to
// stdin*, so we pipe the whole prompt over stdin (dodging Windows argv length
// limits on long chats) with an empty `-p ""` as the headless trigger, `-o text`
// for a clean answer, and `-m` for the model. Vision isn't wired for the CLI —
// use the Gemini API backend for images. NOTE: the CLI logs in via Google's
// Code-Assist tier; on accounts where that tier is unavailable the CLI returns
// an auth error (IneligibleTierError) — the Gemini API backend is the reliable
// Google path. Set GEMINI_API_KEY in the environment to auth the CLI by key.
function askGeminiCli(prompt, { model, timeoutMs = 90_000 } = {}) {
  return new Promise((resolve, reject) => {
    const args = ["-p", "", "-o", "text", ...(model ? ["-m", model] : [])];
    const quote = (s) => `"${String(s).replace(/"/g, '""')}"`;
    const isWin = process.platform === "win32";
    const child = isWin
      ? spawn(["gemini", ...args.map(quote)].join(" "), { windowsHide: true, cwd: homedir(), shell: true })
      : spawn("gemini", args, { cwd: homedir(), stdio: ["pipe", "pipe", "pipe"] });
    let out = "", err = "";
    const timer = setTimeout(() => { child.kill(); reject(new Error("gemini timed out")); }, timeoutMs);
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { err += d; });
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
    child.on("close", (code) => {
      clearTimeout(timer);
      const answer = out.trim();
      if (code !== 0 || !answer) return reject(new Error(err.trim() || answer || `gemini exited ${code}`));
      resolve(answer);
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

async function ask(payload = {}) {
  ensureCliPath(); // macOS: make sure spawn() sees Homebrew/npm/nvm CLIs, not just launchd's minimal PATH
  const { backend: id = "claude", imagePath, model } = payload;
  const d = registry.get(id) || registry.get("claude");
  // Explicit per-backend model wins; otherwise fall back to the legacy env var.
  const useModel = model || (d.modelEnv && process.env[d.modelEnv]) || undefined;

  if (d.kind === "api") return apiBackends.askApi(d, payload, { model: useModel });
  if (d.kind === "ollama") return apiBackends.askOllama(d, payload, { model: useModel });

  // kind === "cli"
  const prompt = buildCliPrompt(d, payload);
  if (d.command === "codex") return askCodex(prompt, imagePath, { model: useModel });
  if (d.command === "agy") return askAntigravity(prompt, { model: useModel });
  if (d.command === "gemini") return askGeminiCli(prompt, { model: useModel });
  return askClaude(prompt, { model: useModel });
}

module.exports = { ask };
