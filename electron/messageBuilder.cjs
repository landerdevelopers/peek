/**
 * The neutral middle layer between Peek's ask() payload and each backend kind.
 *
 * CLIs want ONE flat prompt string (buildCliPrompt) — this is the original
 * backend.cjs buildPrompt, moved here and generalized so the codex-only image
 * special-case is driven by descriptor.imageMode instead of a hardcoded id.
 *
 * API + Ollama backends want STRUCTURED messages, so buildParts() returns a
 * vendor-neutral { system, turns, question, imagePath, mode } that apiBackends
 * reshapes per vendor. readImageBase64() centralizes turning Peek's screenshot
 * file into the base64 + media_type every HTTP vendor needs.
 */
const { readFileSync } = require("node:fs");
const { extname } = require("node:path");

const SYS_BASE = "You are Peek, a screen-reading assistant living in a small floating panel or " +
  "a chat dashboard. You're sometimes given a screenshot and a question about it, sometimes just " +
  "a question. Answer directly and concisely, grounded only in what's actually visible when a " +
  "screenshot is present — quote exact text/numbers/labels when it matters. If the answer truly " +
  "isn't visible or determinable from the image, say so plainly instead of guessing. Markdown is " +
  "fine (bold, short lists, inline code) but keep it tight; this is a small panel, not a document.";

// Used when a screenshot is attached as *ambient* context (text mode silently
// snapshots the screen on every send) rather than a crop the user deliberately
// pointed at. The model must use it only when relevant and otherwise ignore it.
const SYS_SCREEN_CONTEXT =
  "You are Peek, a screen-reading assistant in a small floating chat bar. A screenshot of the user's " +
  "current screen is attached as OPTIONAL background context — the user did NOT explicitly point at it. " +
  "If the question is about what's on screen (or clearly benefits from seeing it), use the screenshot and " +
  "ground your answer in exactly what's visible, quoting exact text/numbers/labels when it matters. If the " +
  "question is general, self-contained, or unrelated to the screen, just answer it normally and IGNORE the " +
  "screenshot: don't mention it, don't force the screen into the answer, and never say something 'isn't " +
  "visible on screen' for a question that was never about the screen. Answer directly and concisely; markdown " +
  "is fine (bold, short lists, inline code) but keep it tight — this is a small panel, not a document.";

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

const MEDIA_TYPES = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

// Reads a screenshot file and returns { media_type, data } where data is raw
// base64 (no `data:` prefix, no newlines). Returns null if the file can't be read.
function readImageBase64(imagePath) {
  if (!imagePath) return null;
  try {
    const media_type = MEDIA_TYPES[extname(imagePath).toLowerCase()] || "image/png";
    const data = readFileSync(imagePath).toString("base64");
    return { media_type, data };
  } catch {
    return null;
  }
}

// The "editing" prompt body (without the REFINE_SYS system prefix) — shared by
// the CLI flat-string form and the structured form.
function refineBody({ refineInstruction, selectedText, history = [] }) {
  const histBlock = history.length
    ? `\n\nEarlier edits this session (context only — apply the new instruction to the latest result below):\n${
      history.map((h) => `Instruction: ${h.q}\nResult:\n${h.a}`).join("\n\n")
    }\n`
    : "";
  const textBlock = history.length
    ? `Text to edit (latest result):\n"""\n${history[history.length - 1].a}\n"""`
    : `Original selected text:\n"""\n${selectedText}\n"""`;
  return `${histBlock}\n\nEdit instruction: ${refineInstruction}\n\n${textBlock}\n\nReplacement text only:`;
}

// CLI flat-string prompt. `descriptor` is the backendRegistry entry (for the
// image mode); the codex-specific image line is now `imageMode === 'arg'`.
function buildCliPrompt(descriptor, { imagePath, question, history = [], mode, refineInstruction, selectedText, screenContext }) {
  if (mode === "refine") {
    return `${REFINE_SYS}${refineBody({ refineInstruction: refineInstruction || question, selectedText: selectedText || "", history })}`;
  }
  // Only claim an attached screenshot when this CLI actually receives one —
  // claude (path) and codex (arg) do; agy/gemini (imageMode 'none') don't, so
  // they fall back to the plain prompt and just answer without screen context.
  const ambient = screenContext && imagePath && descriptor.imageMode !== "none";
  const sys = ambient ? SYS_SCREEN_CONTEXT : SYS_BASE;
  const histBlock = history.length
    ? `\n\nEarlier questions in this conversation:\n${history.map((h) => `Q: ${h.q}\nA: ${h.a}`).join("\n\n")}\n`
    : "";
  // Claude reads the image via the Read tool from a path referenced in the
  // prompt; 'arg'-mode CLIs (codex) take it as a direct attachment, so no path
  // line needed. No image, or an 'arg'/'none' CLI — skip the line entirely.
  // For ambient context the read is only-if-relevant (the question may be
  // unrelated to the screen); for a deliberate crop it's a must-read.
  const imgLine = (!imagePath || descriptor.imageMode !== "path")
    ? ""
    : ambient
    ? `\nScreenshot of the current screen (optional context): ${imagePath}\n(Read it with the Read tool only if it's relevant to the question.)\n`
    : `\nScreenshot path: ${imagePath}\n(It's an image file — actually read it with the Read tool before answering.)\n`;
  return `${sys}${imgLine}${histBlock}\nQuestion: ${question}`;
}

// Vendor-neutral structured form for api/ollama backends.
//   system   — the system prompt text
//   turns    — prior conversation as [{ role:'user'|'assistant', text }]
//   question — the current user message text
//   imagePath — screenshot to attach (only meaningful for non-refine, vision backends)
function buildParts({ imagePath, question, history = [], mode, refineInstruction, selectedText, screenContext }) {
  if (mode === "refine") {
    // Refine edits text, never a screenshot; fold the edit body into one user turn.
    return {
      system: REFINE_SYS,
      turns: [],
      question: refineBody({ refineInstruction: refineInstruction || question, selectedText: selectedText || "", history }),
      imagePath: null,
      mode,
    };
  }
  const turns = [];
  for (const h of history) {
    turns.push({ role: "user", text: h.q });
    turns.push({ role: "assistant", text: h.a });
  }
  // Ambient screen context (text mode auto-snapshot) uses the "use it only if
  // relevant" prompt; a deliberate crop uses the grounded prompt.
  const system = screenContext && imagePath ? SYS_SCREEN_CONTEXT : SYS_BASE;
  return { system, turns, question, imagePath, mode };
}

module.exports = { SYS_BASE, REFINE_SYS, readImageBase64, buildCliPrompt, buildParts };
