"use strict";

/**
 * Auto-detects which backends are usable right now and returns both the legacy
 * shape ({ claude, codex, available:[ids] }) that older callers rely on AND a
 * richer `backends[]` for the grouped picker / provider UI.
 *
 * Availability by kind:
 *   cli    — the command is on PATH (`where`/`which`).
 *   api    — a BYO key is stored for the backend's keyVendor (secrets.has).
 *   ollama — the local server answered GET /api/tags (probeOllama), and its
 *            model list comes back live from that same probe.
 *
 * Result is cached; pass { refresh:true } to re-scan (used after a key is saved
 * or when the provider modal opens, so newly-added keys / a freshly-started
 * Ollama show up without a restart).
 */
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const registry = require("./backendRegistry.cjs");
const secrets = require("./secrets.cjs");
const apiBackends = require("./apiBackends.cjs");

const execFileAsync = promisify(execFile);

let cache = null;

function commandExists(cmd) {
  if (process.platform === "win32") {
    return execFileAsync("where", [cmd], { windowsHide: true })
      .then(({ stdout }) => Boolean(stdout?.trim()))
      .catch(() => false);
  }
  return execFileAsync("which", [cmd])
    .then(({ stdout }) => Boolean(stdout?.trim()))
    .catch(() => false);
}

async function detectBackends() {
  const cliDescriptors = registry.all().filter((d) => d.kind === "cli");
  const cliFound = {};
  await Promise.all(cliDescriptors.map(async (d) => { cliFound[d.id] = await commandExists(d.command); }));

  const ollama = await apiBackends.probeOllama();

  const backends = registry.all().map((d) => {
    let available = false;
    let models = d.models || [];
    if (d.kind === "cli") available = !!cliFound[d.id];
    else if (d.kind === "api") available = secrets.has(d.keyVendor);
    else if (d.kind === "ollama") { available = ollama.reachable; models = ollama.models; }
    return {
      id: d.id, kind: d.kind, vendor: d.vendor, label: d.label,
      available, models, defaultModel: d.defaultModel,
      supportsImage: !!d.supportsImage, dynamicModels: !!d.dynamicModels,
      unverified: !!d.unverified,
    };
  });

  const available = backends.filter((b) => b.available).map((b) => b.id);
  return {
    claude: !!cliFound.claude,
    codex: !!cliFound.codex,
    available,
    backends,
    ollamaReachable: ollama.reachable,
  };
}

async function listBackends({ refresh = false } = {}) {
  if (refresh || !cache) cache = await detectBackends();
  return cache;
}

module.exports = { listBackends };
