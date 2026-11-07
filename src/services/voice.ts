import type { Language } from "@/types/chat";

interface RecognitionResultLike {
  readonly isFinal: boolean;
  readonly 0: { readonly transcript: string };
}

interface RecognitionEventLike {
  readonly resultIndex: number;
  readonly results: ArrayLike<RecognitionResultLike>;
}

interface RecognitionErrorLike {
  readonly error: string;
}

interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionEventLike) => void) | null;
  onerror: ((event: RecognitionErrorLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type RecognitionConstructor = new () => RecognitionLike;

function getRecognitionConstructor(): RecognitionConstructor | null {
  const w = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isSpeechInputSupported(): boolean {
  return getRecognitionConstructor() !== null;
}

export function isSpeechOutputSupported(): boolean {
  return "speechSynthesis" in window;
}

export function recognitionLocale(language: Language): string {
  return language === "hi" ? "hi-IN" : "en-IN";
}

const MESSAGE_BY_ERROR: Record<string, string> = {
  "not-allowed": "Microphone access was blocked. Allow the microphone in your browser or phone settings.",
  "service-not-allowed": "Speech recognition is not allowed in this browser.",
  "no-speech": "I didn't hear anything. Tap the mic and try again.",
  "audio-capture": "No microphone was found on this device.",
  network: "Speech recognition needs an internet connection.",
};

export interface VoiceSession {
  start(): void;
  stop(): void;
}

interface VoiceHandlers {
  onInterim: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (message: string) => void;
  onEnd: () => void;
}

export function createVoiceSession(language: Language, handlers: VoiceHandlers): VoiceSession | null {
  const Constructor = getRecognitionConstructor();
  if (!Constructor) return null;

  const recognition = new Constructor();
  recognition.lang = recognitionLocale(language);
  recognition.continuous = false;
  recognition.interimResults = true;

  recognition.onresult = (event) => {
    let interim = "";
    let final = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal) final += result[0].transcript;
      else interim += result[0].transcript;
    }
    if (interim) handlers.onInterim(interim);
    if (final.trim()) handlers.onFinal(final.trim());
  };
  recognition.onerror = (event) => {
    if (event.error === "aborted") return;
    handlers.onError(MESSAGE_BY_ERROR[event.error] ?? "Voice input stopped unexpectedly. Please try again.");
  };
  recognition.onend = () => handlers.onEnd();

  return {
    start: () => recognition.start(),
    stop: () => recognition.abort(),
  };
}

function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " code block omitted ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/[*_#>~|]/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function speakReply(text: string, language: Language): void {
  if (!isSpeechOutputSupported()) return;
  const spoken = stripMarkdown(text);
  if (!spoken) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(spoken);
  utterance.lang = recognitionLocale(language);
  utterance.rate = 1;
  window.speechSynthesis.speak(utterance);
}

export function stopSpeaking(): void {
  if (isSpeechOutputSupported()) window.speechSynthesis.cancel();
}
