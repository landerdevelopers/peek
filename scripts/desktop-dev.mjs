import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const electronPath = require("electron");

const DEV_URL = "http://localhost:5176";

function killTree(child) {
  if (!child || child.killed) return;
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    child.kill();
  }
}

async function waitForServer(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fetch(url, { method: "HEAD" });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  throw new Error(`Vite dev server did not come up at ${url}`);
}

const vite = spawn("npm", ["run", "dev"], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

try {
  await waitForServer(DEV_URL);
} catch (err) {
  console.error(err.message);
  killTree(vite);
  process.exit(1);
}

const electron = spawn(electronPath, ["."], {
  stdio: "inherit",
  env: { ...process.env, PEEK_DEV: "1", PEEK_DEV_URL: DEV_URL },
});

electron.on("exit", () => {
  killTree(vite);
  process.exit(0);
});

process.on("SIGINT", () => {
  killTree(electron);
  killTree(vite);
  process.exit(0);
});
