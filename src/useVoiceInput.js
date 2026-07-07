import { useEffect, useRef, useState } from "react";

// Wraps Chromium's built-in speech recognition (webkitSpeechRecognition) — no
// bundled STT engine, rides whatever the Electron build's Chromium ships.
// Shared by Dashboard's Composer and Panel's voice mode.
export function useVoiceInput(input, setInput) {
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState(null);
  const recognitionRef = useRef(null);
  const voiceBaseRef = useRef(""); // input text at the moment dictation started, so it appends rather than replaces

  useEffect(() => () => recognitionRef.current?.stop(), []);
  useEffect(() => {
    if (!voiceError) return;
    const t = setTimeout(() => setVoiceError(null), 4000);
    return () => clearTimeout(t);
  }, [voiceError]);

  const toggleVoice = () => {
    if (listening) { recognitionRef.current?.stop(); return; }
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
      let finalText = "", interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t;
        else interim += t;
      }
      const base = voiceBaseRef.current;
      setInput([base, finalText, interim].filter(Boolean).join(" ").trim());
      if (finalText) voiceBaseRef.current = [base, finalText].filter(Boolean).join(" ").trim();
    };
    rec.onerror = (e) => {
      setListening(false);
      if (e.error !== "aborted" && e.error !== "no-speech") {
        setVoiceError(e.error === "not-allowed" ? "Microphone permission was denied." : "Voice input isn't available right now.");
      }
    };
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    try { rec.start(); setListening(true); } catch { setListening(false); setVoiceError("Couldn't start voice input."); }
  };

  return { listening, voiceError, toggleVoice };
}
