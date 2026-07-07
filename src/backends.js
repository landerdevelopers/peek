export const BACKEND_KEY = "peek-backend";

export const BACKEND_LABELS = {
  claude: "Claude Code",
  codex: "Codex",
};

export const INSTALL_CLI_MESSAGE =
  "Install Claude Code or Codex CLI to ask questions.";

export const INSTALL_CLI_HINT =
  "npm install -g @anthropic-ai/claude-code  ·  or install Codex CLI";

export function backendOptionsFrom(available = []) {
  return available.map((value) => ({
    value,
    label: BACKEND_LABELS[value] || value,
  }));
}

export function resolveBackend(stored, available = []) {
  if (stored && available.includes(stored)) return stored;
  return available[0] || null;
}
