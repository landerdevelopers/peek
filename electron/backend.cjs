/**
 * Runs a question (with an optional screenshot) through the user's own
 * claude or codex CLI. Both are one-shot, stateless calls — Peek has no
 * server to keep a session warm (unlike Buddy's bridge), so follow-up
 * questions just re-send the conversation history as text each time.
 */
const { spawn } = require("node:child_process");
const { readFileSync, unlinkSync } = require("node:fs");
const { homedir, tmpdir } = require("node:os");
const { join } = require("node:path");

const SYS_BASE = "You are Peek, a screen-reading assistant living in a small floating panel or " +
  "a chat dashboard. You're sometimes given a screenshot and a question about it, sometimes just " +
  "a question. Answer directly and concisely, grounded only in what's actually visible when a " +
  "screenshot is present — quote exact text/numbers/labels when it matters. If the answer truly " +
  "isn't visible or determinable from the image, say so plainly instead of guessing. Markdown is " +
  "fine (bold, short lists, inline code) but keep it tight; this is a small panel, not a document.";

const REFINE_SYS =
  "You are Peek's in-place text editor. The user selected text in another application. " +
  "Your ENTIRE response will be pasted directly back into their document, replacing the selection.\n\n" +
  "STRICT OUTPUT RULES — breaking these makes the edit unusable:\n" +
  "- Output ONLY the revised text. Nothing before it, nothing after it.\n" +
  "- Never explain what you changed, list techniques, or describe your approach.\n" +
  "- Never offer follow-ups (\"Want it warmer?\", \"I can dial it either way\", \"Let me know if…\").\n" +
  "- Never use assistant preamble (\"Here's…\", \"Sure!\", \"A few small moves…\", \"Absolutely\").\n" +
  "- No markdown code fences, no surrounding quotes, no horizontal rules, no sign-offs.\n" +
  "- Write as the author of the piece — not as an AI commenting on someone else's draft.\n" +
  "- Match the original language, register, and formatting unless the instruction says otherwise.\n" +
  "- If the instruction is vague, make a reasonable edit and output only the result — never ask questions.";

function buildRefinePrompt({ refineInstruction, selectedText, history = [] }) {
  const histBlock = history.length
    ? `\n\nEarlier edits this session (context only — apply the new instruction to the latest result below):\n${
      history.map((h) => `Instruction: ${h.q}\nResult:\n${h.a}`).join("\n\n")
    }\n`
    : "";
  const textBlock = history.length
    ? `Text to edit (latest result):\n"""\n${history[history.length - 1].a}\n"""`
    : `Original selected text:\n"""\n${selectedText}\n"""`;
  return `${REFINE_SYS}${histBlock}\n\nEdit instruction: ${refineInstruction}\n\n${textBlock}\n\nReplacement text only:`;
}

function buildPrompt({ backend, imagePath, question, history = [], mode, refineInstruction, selectedText }) {
  if (mode === "refine") {
    return buildRefinePrompt({
      refineInstruction: refineInstruction || question,
      selectedText: selectedText || "",
      history,
    });
  }
  const histBlock = history.length
    ? `\n\nEarlier questions in this conversation:\n${history.map((h) => `Q: ${h.q}\nA: ${h.a}`).join("\n\n")}\n`
    : "";
  // Claude reads the image via the Read tool from a path referenced in the
  // prompt; codex takes it as a direct CLI attachment (-i), so no path line needed.
  // No image at all (text-only dashboard chat) — skip the line entirely either way.
  const imgLine = (!imagePath || backend === "codex")
    ? ""
    : `\nScreenshot path: ${imagePath}\n(It's an image file — actually read it with the Read tool before answering.)\n`;
  return `${SYS_BASE}${imgLine}${histBlock}\nQuestion: ${question}`;
}

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

async function ask({ backend, imagePath, question, history, mode, refineInstruction, selectedText }) {
  const prompt = buildPrompt({ backend, imagePath, question, history, mode, refineInstruction, selectedText });
  if (backend === "codex") return askCodex(prompt, imagePath, { model: process.env.PEEK_CODEX_MODEL });
  return askClaude(prompt, { model: process.env.PEEK_CLAUDE_MODEL });
}

module.exports = { ask };
