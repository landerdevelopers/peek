/**
 * Local speech-to-text via Whisper (transformers.js). webkitSpeechRecognition
 * does not work in Electron — Chromium lacks Chrome's proprietary speech backend.
 */
const path = require("node:path");
const { app } = require("electron");
const { pipeline, env } = require("@xenova/transformers");

env.cacheDir = path.join(app.getPath("userData"), "whisper-models");
env.allowRemoteModels = true;

const MODEL = "Xenova/whisper-tiny.en";

let pipePromise = null;

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
