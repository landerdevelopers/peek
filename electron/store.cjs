/**
 * Persistent chat/session history for the dashboard, shared with the hotkey
 * overlay panel — both write through this same store so every conversation
 * shows up in one place. One JSON file per session under ~/.peek/sessions/,
 * atomic tmp-write-then-rename (same pattern buddy's bridge uses for its
 * ~/.buddy/*.json stores) so a crash mid-write can't corrupt a session.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const SESS_DIR = path.join(os.homedir(), ".peek", "sessions");

function ensureDir() {
  fs.mkdirSync(SESS_DIR, { recursive: true });
}

function sessionPath(id) {
  return path.join(SESS_DIR, `${id}.json`);
}

function genId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function writeSession(s) {
  ensureDir();
  const target = sessionPath(s.id);
  const tmp = `${target}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(s));
  fs.renameSync(tmp, target);
}

function getSession(id) {
  try {
    return JSON.parse(fs.readFileSync(sessionPath(id), "utf8"));
  } catch {
    return null;
  }
}

function createSession({ backend, imagePath, thumbDataUrl } = {}) {
  ensureDir();
  const id = genId();
  const now = Date.now();

  let permImagePath = null;
  if (imagePath) {
    try {
      const dir = path.join(SESS_DIR, id);
      fs.mkdirSync(dir, { recursive: true });
      permImagePath = path.join(dir, "shot.png");
      fs.copyFileSync(imagePath, permImagePath);
    } catch {
      permImagePath = null;
    }
  }

  const session = {
    id,
    title: null,
    backend: backend || "claude",
    createdAt: now,
    updatedAt: now,
    imagePath: permImagePath,
    thumbDataUrl: thumbDataUrl || null,
    thread: [],
  };
  writeSession(session);
  return session;
}

function appendTurn(id, { q, a }) {
  const s = getSession(id);
  if (!s) return null;
  s.thread.push({ q, a, ts: Date.now() });
  if (!s.title) s.title = String(q).trim().slice(0, 80);
  s.updatedAt = Date.now();
  writeSession(s);
  return s;
}

function listSessions() {
  ensureDir();
  let files = [];
  try {
    files = fs.readdirSync(SESS_DIR).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
  const items = files
    .map((f) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(SESS_DIR, f), "utf8"));
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  items.sort((a, b) => b.updatedAt - a.updatedAt);
  return items.map(({ id, title, backend, createdAt, updatedAt, thumbDataUrl }) => ({
    id,
    title,
    backend,
    createdAt,
    updatedAt,
    thumbDataUrl,
  }));
}

function renameSession(id, title) {
  const s = getSession(id);
  if (!s) return null;
  s.title = String(title).trim().slice(0, 80) || null;
  s.updatedAt = Date.now();
  writeSession(s);
  return s;
}

function deleteSession(id) {
  try {
    fs.unlinkSync(sessionPath(id));
  } catch {}
  try {
    fs.rmSync(path.join(SESS_DIR, id), { recursive: true, force: true });
  } catch {}
}

module.exports = { createSession, appendTurn, getSession, listSessions, renameSession, deleteSession };
