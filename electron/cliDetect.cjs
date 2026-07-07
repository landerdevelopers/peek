"use strict";

const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

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
  const [claude, codex] = await Promise.all([
    commandExists("claude"),
    commandExists("codex"),
  ]);
  const available = [];
  if (claude) available.push("claude");
  if (codex) available.push("codex");
  return { claude, codex, available };
}

async function listBackends({ refresh = false } = {}) {
  if (refresh || !cache) cache = await detectBackends();
  return cache;
}

module.exports = { listBackends };
