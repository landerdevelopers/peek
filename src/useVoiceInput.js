import { useEffect, useRef, useState } from "react";

const SAMPLE_RATE = 16000;
const TRANSCRIBE_MS = 2500;

function resample(input, fromRate, toRate) {
  if (fromRate === toRate) return input;
  const ratio = fromRate / toRate;
  const out = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const idx = i * ratio;
    const i0 = Math.floor(idx);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const f = idx - i0;
    out[i] = input[i0] * (1 - f) + input[i1] * f;
  }
  return out;
}

function mergeChunks(chunks) {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Float32Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

function hasElectronVoice() {
  return typeof window.peekDesktop?.transcribeAudio === "function";
}

function micDeniedMessage(platform) {
  if (platform === "darwin") {
    return "Microphone access denied. Enable Peek in System Settings → Privacy & Security → Microphone.";
  }
  if (platform === "win32") {
    return "Microphone access denied. Enable Peek in Settings → Privacy → Microphone.";
  }
  return "Microphone permission was denied.";
}

// Microphone capture + local Whisper in Electron; webkitSpeechRecognition in browser dev.
export function useVoiceInput(input, setInput) {
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState(null);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const platformRef = useRef(null);

  const recognitionRef = useRef(null);
  const voiceBaseRef = useRef("");
  const listeningRef = useRef(false);
  const transcribingRef = useRef(false);

  const streamRef = useRef(null);
  const audioCtxRef = useRef(null);
  const processorRef = useRef(null);
  const sampleChunksRef = useRef([]);
  const chunkTimerRef = useRef(null);

  useEffect(() => {
    window.peekDesktop?.getPlatformInfo?.().then((info) => {
      platformRef.current = info?.platform || null;
    }).catch(() => {});
  }, []);

  const reportMicDenied = () => {
    setVoiceError(micDeniedMessage(platformRef.current));
    window.peekDesktop.openMicSettings?.();
  };

  const stopElectronCapture = () => {
    if (chunkTimerRef.current) {
      clearInterval(chunkTimerRef.current);
      chunkTimerRef.current = null;
    }
    processorRef.current?.disconnect();
    processorRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    sampleChunksRef.current = [];
  };

  const stopAll = () => {
    listeningRef.current = false;
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    stopElectronCapture();
    setListening(false);
    setVoiceLoading(false);
  };

  useEffect(() => () => stopAll(), []);

  useEffect(() => {
    if (!voiceError) return;
    const t = setTimeout(() => setVoiceError(null), 6000);
    return () => clearTimeout(t);
  }, [voiceError]);

  const transcribeBuffered = async () => {
    if (!listeningRef.current || transcribingRef.current) return;
    const chunks = sampleChunksRef.current;
    if (!chunks.length) return;

    const samples = mergeChunks(chunks);
    if (samples.length < SAMPLE_RATE * 0.4) return;

    transcribingRef.current = true;
    try {
      const text = await window.peekDesktop.transcribeAudio(samples, SAMPLE_RATE);
      if (!listeningRef.current || !text) return;
      const base = voiceBaseRef.current;
      const merged = [base, text].filter(Boolean).join(" ").trim();
      voiceBaseRef.current = merged;
      setInput(merged);
      sampleChunksRef.current = [];
    } catch (err) {
      const msg = err?.message || "";
      setVoiceError(
        msg.includes("npm install")
          ? msg
          : "Voice transcription failed. Try again in a moment.",
      );
    } finally {
      transcribingRef.current = false;
    }
  };

  const startElectronVoice = async () => {
    setVoiceLoading(true);
    setVoiceError(null);
    voiceBaseRef.current = input.trim();
    sampleChunksRef.current = [];

    const micOk = await window.peekDesktop.ensureMicAccess?.();
    if (micOk === false) {
      setVoiceLoading(false);
      reportMicDenied();
      return;
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    streamRef.current = stream;

    const ctx = new AudioContext();
    audioCtxRef.current = ctx;
    if (ctx.state === "suspended") await ctx.resume();

    const source = ctx.createMediaStreamSource(stream);
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    processorRef.current = processor;

    processor.onaudioprocess = (e) => {
      if (!listeningRef.current) return;
      const raw = e.inputBuffer.getChannelData(0);
      const chunk = ctx.sampleRate === SAMPLE_RATE
        ? new Float32Array(raw)
        : resample(raw, ctx.sampleRate, SAMPLE_RATE);
      sampleChunksRef.current.push(chunk);
    };

    const silent = ctx.createGain();
    silent.gain.value = 0;
    source.connect(processor);
    processor.connect(silent);
    silent.connect(ctx.destination);

    listeningRef.current = true;
    setListening(true);
    setVoiceLoading(false);
    chunkTimerRef.current = setInterval(transcribeBuffered, TRANSCRIBE_MS);
  };

  const startWebSpeech = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceError("Voice input isn't supported in this build.");
      return;
    }
    setVoiceError(null);
    voiceBaseRef.current = input.trim();
    const rec = new SpeechRecognition();
    rec.lang = navigator.language || "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let finalText = "";
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t;
        else interim += t;
      }
      const base = voiceBaseRef.current;
      setInput([base, finalText, interim].filter(Boolean).join(" ").trim());
      if (finalText) {
        voiceBaseRef.current = [base, finalText].filter(Boolean).join(" ").trim();
      }
    };
    rec.onerror = (e) => {
      setListening(false);
      listeningRef.current = false;
      if (e.error !== "aborted" && e.error !== "no-speech") {
        if (e.error === "not-allowed") reportMicDenied();
        else setVoiceError("Voice input isn't available right now.");
      }
    };
    rec.onend = () => {
      setListening(false);
      listeningRef.current = false;
    };
    recognitionRef.current = rec;
    try {
      rec.start();
      listeningRef.current = true;
      setListening(true);
    } catch {
      setListening(false);
      setVoiceError("Couldn't start voice input.");
    }
  };

  // Push-to-talk stop: transcribe whatever's still buffered (the last <2.5s
  // that the interval timer hasn't flushed yet) before tearing down, then
  // return the full accumulated transcript so the caller can use it as a query.
  const flushAndStop = async () => {
    if (listeningRef.current) {
      try { await transcribeBuffered(); } catch {}
    }
    const text = (voiceBaseRef.current || "").trim();
    stopAll();
    return text;
  };

  const toggleVoice = async () => {
    if (listeningRef.current) {
      stopAll();
      return;
    }

    if (hasElectronVoice()) {
      try {
        await startElectronVoice();
      } catch (err) {
        setVoiceLoading(false);
        if (err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError") {
          reportMicDenied();
        } else {
          setVoiceError("Couldn't access the microphone.");
        }
      }
      return;
    }

    startWebSpeech();
  };

  return { listening, voiceError, voiceLoading, toggleVoice, flushAndStop, stopVoice: stopAll };
}
