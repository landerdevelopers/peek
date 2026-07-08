/**
 * HTTP backends — the non-CLI half of backend.cjs's dispatch. All calls use
 * Node's global fetch (Electron main is Node 18+); request/response shapes are
 * verified against each vendor's official docs.
 *
 *   askApi(descriptor, payload, {model})  — anthropic | openai | gemini adapters.
 *   askOllama(descriptor, payload, {model}) — local Ollama /api/chat.
 *   probeOllama()                          — GET /api/tags for availability + models.
 *
 * API keys are read from secrets.cjs INLINE at call time (getKey), so a plaintext
 * key exists only for the life of one fetch() and never leaves the main process.
 * Every adapter normalizes failures into a thrown Error, so backend.ask's
 * try/catch turns them into the existing { error } IPC shape.
 */
const secrets = require("./secrets.cjs");
const registry = require("./backendRegistry.cjs");
const { buildParts, readImageBase64 } = require("./messageBuilder.cjs");

const REQUEST_TIMEOUT = 90_000; // match the CLI backends' 90s ceiling

async function fetchWithTimeout(url, opts, timeoutMs = REQUEST_TIMEOUT) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

// --- Anthropic Messages API -----------------------------------------------
async function askAnthropic(d, key, model, parts, img) {
  const messages = parts.turns.map((t) => ({ role: t.role, content: t.text }));
  const userContent = [];
  if (img) userContent.push({ type: "image", source: { type: "base64", media_type: img.media_type, data: img.data } });
  userContent.push({ type: "text", text: parts.question });
  messages.push({ role: "user", content: userContent });

  const body = { model, max_tokens: 4096, messages };
  if (parts.system) body.system = parts.system;

  const res = await fetchWithTimeout(d.endpoint, {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error?.message || `Anthropic API error ${res.status}`);
  if (data?.stop_reason === "refusal") throw new Error("The model declined to answer this request.");
  // Not content[0].text — that's a thinking block when thinking is on.
  const text = (data?.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
  return text || "(no answer)";
}

// --- OpenAI (+ OpenAI-compatible) Chat Completions -------------------------
async function askOpenAI(d, key, model, parts, img) {
  const messages = [];
  if (parts.system) messages.push({ role: "system", content: parts.system });
  for (const t of parts.turns) messages.push({ role: t.role, content: t.text });
  if (img) {
    messages.push({ role: "user", content: [
      { type: "text", text: parts.question },
      { type: "image_url", image_url: { url: `data:${img.media_type};base64,${img.data}` } },
    ] });
  } else {
    messages.push({ role: "user", content: parts.question });
  }

  const res = await fetchWithTimeout(d.endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    // Newer models require max_completion_tokens; legacy max_tokens is rejected.
    body: JSON.stringify({ model, messages, max_completion_tokens: 1024 }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error?.message || `OpenAI API error ${res.status}`);
  const text = data?.choices?.[0]?.message?.content;
  return (typeof text === "string" ? text.trim() : "") || "(no answer)";
}

// --- Google Gemini generateContent ----------------------------------------
async function askGemini(d, key, model, parts, img) {
  const contents = parts.turns.map((t) => ({
    role: t.role === "assistant" ? "model" : "user",
    parts: [{ text: t.text }],
  }));
  const userParts = [{ text: parts.question }];
  if (img) userParts.push({ inline_data: { mime_type: img.media_type, data: img.data } });
  contents.push({ role: "user", parts: userParts });

  const body = { contents, generationConfig: { maxOutputTokens: 2048 } };
  if (parts.system) body.systemInstruction = { parts: [{ text: parts.system }] };

  const res = await fetchWithTimeout(`${d.endpoint}/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error?.message || `Gemini API error ${res.status}`);
  const cand = data?.candidates?.[0];
  // Drop thought-summary parts; concat the rest.
  const text = (cand?.content?.parts || [])
    .filter((p) => typeof p.text === "string" && !p.thought)
    .map((p) => p.text).join("").trim();
  if (!text && cand?.finishReason && cand.finishReason !== "STOP") {
    throw new Error(`Gemini stopped (${cand.finishReason}).`);
  }
  return text || "(no answer)";
}

async function askApi(descriptor, payload, { model } = {}) {
  const key = secrets.getKey(descriptor.keyVendor);
  if (!key) throw new Error(`No API key saved for ${descriptor.label}. Add one in Settings → Providers.`);
  const parts = buildParts(payload);
  const useModel = model || descriptor.defaultModel;
  const img = descriptor.supportsImage && parts.imagePath ? readImageBase64(parts.imagePath) : null;
  if (descriptor.apiStyle === "anthropic") return askAnthropic(descriptor, key, useModel, parts, img);
  if (descriptor.apiStyle === "openai") return askOpenAI(descriptor, key, useModel, parts, img);
  if (descriptor.apiStyle === "gemini") return askGemini(descriptor, key, useModel, parts, img);
  throw new Error(`Unknown API style: ${descriptor.apiStyle}`);
}

// --- Ollama (local) --------------------------------------------------------
function ollamaBase(descriptor) {
  let base = String(process.env.OLLAMA_HOST || descriptor?.endpoint || "http://127.0.0.1:11434").trim();
  if (!/^https?:\/\//i.test(base)) base = `http://${base}`;
  return base.replace(/\/+$/, "");
}

const VISION_HEURISTIC = /llava|vision|-vl\b|minicpm-v|moondream|bakllava|qwen2\.5vl/i;

// Prefer the model's /api/show capabilities; fall back to a name heuristic for
// older Ollama servers that don't report `capabilities`.
async function ollamaSupportsVision(base, model) {
  try {
    const res = await fetchWithTimeout(`${base}/api/show`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model }),
    }, 2500);
    if (res.ok) {
      const data = await res.json().catch(() => null);
      if (Array.isArray(data?.capabilities)) return data.capabilities.includes("vision");
    }
  } catch {}
  return VISION_HEURISTIC.test(model);
}

async function askOllama(descriptor, payload, { model } = {}) {
  const useModel = model;
  if (!useModel) throw new Error("Pick an Ollama model first (none selected).");
  const base = ollamaBase(descriptor);
  const parts = buildParts(payload);

  const messages = [];
  if (parts.system) messages.push({ role: "system", content: parts.system });
  for (const t of parts.turns) messages.push({ role: t.role, content: t.text });
  const userMsg = { role: "user", content: parts.question };
  if (parts.imagePath) {
    const img = readImageBase64(parts.imagePath);
    if (img && await ollamaSupportsVision(base, useModel)) userMsg.images = [img.data]; // raw base64, no data: prefix
  }
  messages.push(userMsg);

  const res = await fetchWithTimeout(`${base}/api/chat`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: useModel, messages, stream: false }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `Ollama error ${res.status}`);
  const text = data?.message?.content;
  return (typeof text === "string" ? text.trim() : "") || "(no answer)";
}

// GET /api/tags — the single probe that confirms the server is up AND lists
// installed models. Short timeout so a filtered port doesn't hang detection.
async function probeOllama(descriptor = registry.REGISTRY.ollama) {
  const base = ollamaBase(descriptor);
  try {
    const res = await fetchWithTimeout(`${base}/api/tags`, { method: "GET" }, 1500);
    if (!res.ok) return { reachable: false, models: [] };
    const data = await res.json().catch(() => null);
    const models = (data?.models || []).map((m) => m.model || m.name).filter(Boolean);
    return { reachable: true, models };
  } catch {
    return { reachable: false, models: [] };
  }
}

module.exports = { askApi, askOllama, probeOllama };
