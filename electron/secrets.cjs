/**
 * Encrypted bring-your-own API-key store. MAIN-PROCESS ONLY — raw keys never
 * cross IPC to the renderer (there is deliberately no get-plaintext handler in
 * main.cjs; only set/clear/status). apiBackends.cjs calls getKey() inline at
 * request time so a plaintext key exists only for the life of one fetch().
 *
 * Encryption: Electron safeStorage, backed by the OS keychain — Windows DPAPI,
 * macOS Keychain. isEncryptionAvailable() is queried lazily (all key ops happen
 * well after app 'ready', which satisfies the Windows/Linux ready-gate).
 * encryptString returns a Buffer, so we base64 it for JSON; decryptString throws
 * on foreign/tampered ciphertext, so a failure is treated as "key not set"
 * rather than a crash.
 *
 * Persistence: ~/.peek/keys.json (sibling of the sessions store), atomic
 * tmp-write-then-rename + mode 0600, matching store.cjs.
 *
 * SECURITY NOTES: Windows DPAPI scopes the blob to the logged-in Windows user —
 * it protects against other users but NOT other processes running as the same
 * user, so keys.json is per-user obfuscation-at-rest, not app isolation. macOS
 * Keychain is stronger, but an unsigned dev build and a signed packaged build
 * may not decrypt each other's keys. When encryption is unavailable we REFUSE to
 * persist (policy A) rather than silently write plaintext.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { safeStorage } = require("electron");

const CONFIG_DIR = path.join(os.homedir(), ".peek");
const KEYS_FILE = path.join(CONFIG_DIR, "keys.json");

function encAvailable() {
  try { return safeStorage.isEncryptionAvailable(); } catch { return false; }
}

function readStore() {
  try { return JSON.parse(fs.readFileSync(KEYS_FILE, "utf8")); }
  catch { return { version: 1, vendors: {} }; }
}

function writeStore(s) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  const tmp = `${KEYS_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(s), { mode: 0o600 });
  fs.renameSync(tmp, KEYS_FILE);
  try { fs.chmodSync(KEYS_FILE, 0o600); } catch {} // no-op on Windows, harmless
}

// Persist an encrypted key. Refuses (policy A) when the OS can't encrypt, so a
// paid API key never lands on disk as plaintext.
function set(vendor, plaintext) {
  const value = String(plaintext || "").trim();
  if (!value) return { error: "empty key" };
  if (!encAvailable()) return { error: "encryption unavailable" };
  try {
    const s = readStore();
    s.vendors[vendor] = safeStorage.encryptString(value).toString("base64");
    writeStore(s);
    return { ok: true };
  } catch (e) {
    return { error: String(e.message || e) };
  }
}

// MAIN-ONLY: returns the decrypted plaintext key, or null. Never expose over IPC.
function getKey(vendor) {
  const enc = readStore().vendors?.[vendor];
  if (!enc) return null;
  try { return safeStorage.decryptString(Buffer.from(enc, "base64")); }
  catch { return null; } // foreign/tampered blob (copied profile, changed OS user) → not set
}

function has(vendor) {
  return !!readStore().vendors?.[vendor];
}

function clear(vendor) {
  const s = readStore();
  if (s.vendors) delete s.vendors[vendor];
  writeStore(s);
  return { ok: true };
}

// Renderer-safe status: presence + a masked last-4 hint, never the key itself.
function statusFor(vendor) {
  const k = getKey(vendor);
  return k ? { present: true, hint: `…${k.slice(-4)}` } : { present: false };
}

function status(vendors) {
  const out = {};
  for (const v of vendors) out[v] = statusFor(v);
  return { encryptionAvailable: encAvailable(), vendors: out };
}

module.exports = { set, getKey, has, clear, status, isEncryptionAvailable: encAvailable };
