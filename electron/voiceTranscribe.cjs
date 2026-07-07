/**
 * Local speech-to-text via Whisper (transformers.js). webkitSpeechRecognition
 * does not work in Electron — Chromium lacks Chrome's proprietary speech backend.
 *
 * @xenova/transformers is loaded lazily so Peek still launches if voice deps
 * are missing (e.g. git pull without `npm install` on Mac).
 */
const path = require("node:path");
const { app } = require("electron");

const MODEL = "Xenova/whisper-tiny.en";

let pipePromise = null;
let transformersEnv = null;

function loadTransformers() {
  try {
    return require("@xenova/transformers");
  } catch (err) {
    const missing = err?.code === "MODULE_NOT_FOUND"
      || /cannot find module '@xenova\/transformers'/i.test(String(err?.message || ""));
    const hint = missing
      ? "Run `npm install` in the peek folder (required after every `git pull`)."
      : (err?.message || String(err));
    throw new Error(`Voice transcription is unavailable. ${hint}`);
  }
}

function getEnv() {
  if (!transformersEnv) {
    const { env } = loadTransformers();
    env.cacheDir = path.join(app.getPath("userData"), "whisper-models");
    env.allowRemoteModels = true;
    transformersEnv = env;
  }
  return transformersEnv;
}

function resample(samples, fromRate, toRate) {
  if (fromRate === toRate) return samples;
  const ratio = fromRate / toRate;
  const out = new Float32Array(Math.floor(samples.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const idx = i * ratio;
    const i0 = Math.floor(idx);
    const i1 = Math.min(i0 + 1, samples.length - 1);
    const f = idx - i0;
    out[i] = samples[i0] * (1 - f) + samples[i1] * f;
  }
  return out;
}

function getPipe() {
  if (!pipePromise) {
    getEnv();
    const { pipeline } = loadTransformers();
    pipePromise = pipeline("automatic-speech-recognition", MODEL);
  }
  return pipePromise;
}

function warmup() {
  getPipe().catch((err) => {
    console.warn("[peek] Whisper model preload failed:", err.message);
    pipePromise = null;
  });
}

async function transcribeAudio(samples, sampleRate = 16000) {
  if (!samples?.length) return "";
  let audio = samples instanceof Float32Array ? samples : new Float32Array(samples);
  if (sampleRate !== 16000) audio = resample(audio, sampleRate, 16000);

  const pipe = await getPipe();
  const out = await pipe(audio, {
    chunk_length_s: 30,
    stride_length_s: 5,
    language: "english",
    task: "transcribe",
  });
  return (out?.text || "").trim();
}

module.exports = { transcribeAudio, warmup };
