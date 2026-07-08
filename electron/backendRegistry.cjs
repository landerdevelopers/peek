/**
 * Single source of truth for Peek's AI backends. A "backend" is still the flat
 * string id that's already persisted everywhere (localStorage 'peek-backend',
 * session.backend, the ask() payload) — 'claude'/'codex' keep working verbatim.
 * Each id now maps to a descriptor of kind 'cli' | 'api' | 'ollama'; backend.cjs
 * dispatches on descriptor.kind instead of an ad-hoc claude/codex if.
 *
 *   cli    — spawn a local CLI. imageMode 'path' writes the screenshot path into
 *            the prompt (claude reads it via its Read tool); 'arg' passes it as a
 *            flag (codex -i); 'none' sends no image. modelEnv is the legacy env
 *            fallback used when the payload carries no explicit model.
 *   api    — one-shot HTTPS call (apiBackends.askApi). apiStyle picks the request
 *            shape ('anthropic' | 'openai' | 'gemini'); keyVendor names the secret
 *            (secrets.cjs) to authenticate with; models is the model-picker list.
 *   ollama — local HTTP server (apiBackends.askOllama); models come live from
 *            /api/tags, so dynamicModels is true and `models` stays empty.
 *
 * The renderer keeps a trimmed labels/kinds/grouping copy in src/backends.js
 * (CJS↔ESM split); this file stays the source of truth for endpoints/flags/keys.
 */

// Vendors that hold a bring-your-own API key in secrets.cjs. Note 'anthropic'
// and 'openai' are shared with the claude/codex CLIs (which use their own OAuth
// login, not these keys) — keyVendor below is what actually reads a stored key.
const KEY_VENDORS = ["anthropic", "openai", "google"];

const REGISTRY = {
  claude: {
    id: "claude", kind: "cli", vendor: "anthropic", label: "Claude Code",
    command: "claude", imageMode: "path", modelEnv: "PEEK_CLAUDE_MODEL", supportsImage: true,
  },
  codex: {
    id: "codex", kind: "cli", vendor: "openai", label: "Codex",
    command: "codex", imageMode: "arg", imageArg: "-i", modelEnv: "PEEK_CODEX_MODEL", supportsImage: true,
  },
  // Google Antigravity CLI (`agy`) — native .exe, verified one-shot form
  // `agy -p "<prompt>" [--model X]` (see backend.cjs askAntigravity). It's
  // agentic and slower than a raw API, and image attachment over the CLI isn't
  // wired (use the Gemini API for vision).
  antigravity: {
    id: "antigravity", kind: "cli", vendor: "google", label: "Antigravity CLI",
    command: "agy", imageMode: "none", modelEnv: "PEEK_ANTIGRAVITY_MODEL", supportsImage: false,
  },
  // Google's older Gemini CLI (`gemini -p "…"`, prompt via stdin). Its free
  // Code-Assist login tier is being sunset in favor of Antigravity; it still
  // works when authed by GEMINI_API_KEY. Image over the CLI isn't wired.
  gemini: {
    id: "gemini", kind: "cli", vendor: "google", label: "Gemini CLI",
    command: "gemini", imageMode: "none", modelEnv: "PEEK_GEMINI_MODEL", supportsImage: false,
  },

  "anthropic-api": {
    id: "anthropic-api", kind: "api", vendor: "anthropic", apiStyle: "anthropic",
    keyVendor: "anthropic", label: "Anthropic API",
    endpoint: "https://api.anthropic.com/v1/messages",
    // Answers bill to the user's own key, so default to a cost-efficient model.
    models: ["claude-sonnet-5", "claude-haiku-4-5", "claude-opus-4-8", "claude-fable-5"],
    defaultModel: "claude-sonnet-5", supportsImage: true,
  },
  "openai-api": {
    id: "openai-api", kind: "api", vendor: "openai", apiStyle: "openai",
    keyVendor: "openai", label: "OpenAI API",
    endpoint: "https://api.openai.com/v1/chat/completions",
    models: ["gpt-4o-mini", "gpt-4o", "gpt-5.4-mini", "gpt-5.4"],
    defaultModel: "gpt-4o-mini", supportsImage: true,
  },
  "gemini-api": {
    id: "gemini-api", kind: "api", vendor: "google", apiStyle: "gemini",
    keyVendor: "google", label: "Gemini API",
    // endpoint is the models base; the model id + ":generateContent" is appended.
    endpoint: "https://generativelanguage.googleapis.com/v1beta/models",
    models: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.5-flash-lite"],
    defaultModel: "gemini-2.5-flash", supportsImage: true,
  },

  ollama: {
    id: "ollama", kind: "ollama", vendor: "ollama", label: "Ollama",
    endpoint: "http://127.0.0.1:11434", dynamicModels: true, models: [], supportsImage: true,
  },
};

const ORDER = ["claude", "codex", "antigravity", "gemini", "anthropic-api", "openai-api", "gemini-api", "ollama"];

function get(id) {
  return REGISTRY[id] || null;
}

// Order for menus/pickers: CLIs first, then APIs, then Ollama.
function all() {
  return ORDER.map((id) => REGISTRY[id]);
}

module.exports = { REGISTRY, KEY_VENDORS, ORDER, get, all };
