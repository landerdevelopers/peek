// Renderer-side mirror of electron/backendRegistry.cjs — labels, kinds,
// grouping, and the static model lists only. The main process stays the source
// of truth for endpoints/flags/keys; this copy never sees a secret. The backend
// id stays a flat string persisted in localStorage('peek-backend') and
// session.backend, so 'claude'/'codex' keep working exactly as before.

export const BACKEND_KEY = "peek-backend";

export const BACKENDS = {
  claude: { id: "claude", kind: "cli", vendor: "anthropic", label: "Claude Code", models: [] },
  codex: { id: "codex", kind: "cli", vendor: "openai", label: "Codex", models: [] },
  antigravity: { id: "antigravity", kind: "cli", vendor: "google", label: "Antigravity CLI", models: [] },
  gemini: { id: "gemini", kind: "cli", vendor: "google", label: "Gemini CLI", models: [] },
  "anthropic-api": {
    id: "anthropic-api", kind: "api", vendor: "anthropic", label: "Anthropic API",
    models: ["claude-sonnet-5", "claude-haiku-4-5", "claude-opus-4-8", "claude-fable-5"],
    defaultModel: "claude-sonnet-5",
  },
  "openai-api": {
    id: "openai-api", kind: "api", vendor: "openai", label: "OpenAI API",
    models: ["gpt-4o-mini", "gpt-4o", "gpt-5.4-mini", "gpt-5.4"],
    defaultModel: "gpt-4o-mini",
  },
  "gemini-api": {
    id: "gemini-api", kind: "api", vendor: "google", label: "Gemini API",
    models: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.5-flash-lite"],
    defaultModel: "gemini-2.5-flash",
  },
  ollama: { id: "ollama", kind: "ollama", vendor: "ollama", label: "Ollama", models: [], dynamicModels: true },
};

export const BACKEND_LABELS = Object.fromEntries(
  Object.values(BACKENDS).map((b) => [b.id, b.label]),
);

export const KIND_LABELS = { cli: "Command-line", api: "API key", ollama: "Local" };

// The BYO-API-key vendors surfaced in the Providers UI (matches KEY_VENDORS in
// electron/backendRegistry.cjs). `id` is what peekDesktop.keys.* takes.
export const KEY_VENDORS = [
  { id: "anthropic", label: "Anthropic (Claude)", placeholder: "sk-ant-…", url: "https://console.anthropic.com/settings/keys" },
  { id: "openai", label: "OpenAI", placeholder: "sk-…", url: "https://platform.openai.com/api-keys" },
  { id: "google", label: "Google Gemini", placeholder: "AIza…", url: "https://aistudio.google.com/apikey" },
];

export const INSTALL_CLI_MESSAGE =
  "No AI backend yet — install a CLI, add an API key, or run Ollama.";

export const INSTALL_CLI_HINT =
  "Claude Code / Codex CLI · add an API key in Providers · or start Ollama";

export function labelFor(id) {
  return BACKENDS[id]?.label || id;
}

export function backendOptionsFrom(available = []) {
  return available.map((value) => ({ value, label: labelFor(value) }));
}

export function resolveBackend(stored, available = []) {
  if (stored && available.includes(stored)) return stored;
  return available[0] || null;
}

// Grouped options for the picker: non-selectable {header:true,label} rows
// separate CLI / API / Local sections. Flat when only one kind is present.
export function groupByKind(available = []) {
  const kinds = ["cli", "api", "ollama"];
  const present = kinds.filter((k) => available.some((id) => BACKENDS[id]?.kind === k));
  const out = [];
  for (const kind of present) {
    const ids = available.filter((id) => BACKENDS[id]?.kind === kind);
    if (!ids.length) continue;
    if (present.length > 1) out.push({ header: true, label: KIND_LABELS[kind] });
    for (const id of ids) out.push({ value: id, label: labelFor(id) });
  }
  return out;
}

export const modelKey = (id) => `peek-model:${id}`;

// The per-backend model the user picked (for the ask payload). undefined lets
// the main process fall back to the backend's default / env var.
export function getModel(id) {
  try { return localStorage.getItem(modelKey(id)) || undefined; } catch { return undefined; }
}
