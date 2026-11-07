import { useCallback, useRef, useState } from "react";
import { KeoNative, isNativeApp } from "@/services/native/keoNative";
import { createVoiceSession, isSpeechInputSupported, type VoiceSession } from "@/services/voice";
import type { Language } from "@/types/chat";

export type MicGate = "explain" | "blocked" | null;

export function useVoiceInput(language: Language, onFinal: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [micGate, setMicGate] = useState<MicGate>(null);
  const sessionRef = useRef<VoiceSession | null>(null);
  const supported = isSpeechInputSupported();

  const stop = useCallback(() => {
    sessionRef.current?.stop();
    sessionRef.current = null;
    setListening(false);
    setInterim("");
  }, []);

  const startSession = useCallback(() => {
    const session = createVoiceSession(language, {
      onInterim: setInterim,
      onFinal: (text) => {
        setInterim("");
        onFinal(text);
      },
      onError: (message) => {
        setError(message);
        setListening(false);
        setInterim("");
      },
      onEnd: () => {
        setListening(false);
        setInterim("");
        sessionRef.current = null;
      },
    });
    if (!session) {
      setError("Voice input is not supported in this browser.");
      return;
    }
    sessionRef.current = session;
    try {
      session.start();
      setListening(true);
    } catch {
      setError("Could not start the microphone. Please try again.");
    }
  }, [language, onFinal]);

  const start = useCallback(() => {
    setError(null);
    if (!isNativeApp()) {
      startSession();
      return;
    }
    void KeoNative.checkPermission({ permission: "microphone" })
      .then(({ state }) => {
        if (state === "granted") startSession();
        else if (state === "denied") setMicGate("blocked");
        else setMicGate("explain");
      })
      .catch(() => setError("Could not check microphone access. Please try again."));
  }, [startSession]);

  const allowMicrophone = useCallback(() => {
    setMicGate(null);
    void KeoNative.requestPermission({ permission: "microphone" })
      .then(({ state }) => {
        if (state === "granted") startSession();
        else setMicGate("blocked");
      })
      .catch(() => setError("Could not ask for microphone access. Please try again."));
  }, [startSession]);

  const openMicSettings = useCallback(() => {
    KeoNative.openScreen({ screen: "appDetails" }).catch(() =>
      setError("Could not open Settings. Open KEO AI's permissions from your phone's app list."),
    );
  }, []);

  const dismissMicGate = useCallback(() => setMicGate(null), []);

  const toggle = useCallback(() => {
    if (listening) stop();
    else start();
  }, [listening, start, stop]);

  return {
    supported,
    listening,
    interim,
    error,
    toggle,
    stop,
    micGate,
    allowMicrophone,
    openMicSettings,
    dismissMicGate,
  };
}
