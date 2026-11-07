import { useLayoutEffect, useRef, type KeyboardEvent } from "react";
import { Mic, MicOff, Send, Square } from "lucide-react";
import { ModeToggle } from "@/components/chat/ModeToggle";
import type { MicGate } from "@/hooks/useVoiceInput";
import type { ChatMode } from "@/types/chat";

export interface VoiceControls {
  supported: boolean;
  listening: boolean;
  interim: string;
  error: string | null;
  toggle: () => void;
  micGate: MicGate;
  allowMicrophone: () => void;
  openMicSettings: () => void;
  dismissMicGate: () => void;
}

interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  streaming: boolean;
  busy: boolean;
  mode: ChatMode;
  onChangeMode: (mode: ChatMode) => void;
  voice: VoiceControls;
}

export function Composer(props: ComposerProps) {
  const { value, onChange, onSubmit, onStop, streaming, busy, mode, onChangeMode, voice } = props;
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [value]);

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (!streaming && !busy && value.trim()) onSubmit();
    }
  };

  const placeholder = mode === "agent"
    ? "Tell KEO what to do, e.g. \"Open YouTube\" or \"Set alarm for 7:30 am\""
    : "Ask KEO anything in English, Hindi or Hinglish";

  return (
    <div className="mx-auto w-full max-w-3xl px-3 pb-4 pt-2 sm:px-6 sm:pb-6">
      {(voice.listening || voice.error) && (
        <div className="mb-2 flex items-center gap-2 px-2 text-xs" role="status">
          {voice.listening ? (
            <>
              <span className="relative inline-flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-accent opacity-70 animate-ring-pulse" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent" />
              </span>
              <span className="text-muted">{voice.interim || "Listening... speak now"}</span>
            </>
          ) : (
            <span className="text-error-300">{voice.error}</span>
          )}
        </div>
      )}
      {voice.micGate === "explain" && (
        <div className="glass mb-2 rounded-2xl p-4 text-sm" role="dialog" aria-label="Microphone access">
          <p className="font-medium">Let KEO hear you</p>
          <p className="mt-1 leading-relaxed text-muted">
            KEO uses the microphone only while you hold the mic button, so it can turn your speech into text. Nothing is recorded in the background.
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={voice.dismissMicGate} className="btn-ghost !px-3 !py-2">Not now</button>
            <button type="button" onClick={voice.allowMicrophone} className="btn-primary !px-3 !py-2">Continue</button>
          </div>
        </div>
      )}
      {voice.micGate === "blocked" && (
        <div className="glass mb-2 rounded-2xl p-4 text-sm" role="alert">
          <p className="font-medium text-error-300">Microphone access is turned off</p>
          <p className="mt-1 leading-relaxed text-muted">
            Turn on the microphone for KEO AI in your phone's app permissions, then tap the mic again.
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={voice.dismissMicGate} className="btn-ghost !px-3 !py-2">Close</button>
            <button type="button" onClick={voice.openMicSettings} className="btn-primary !px-3 !py-2">Open Settings</button>
          </div>
        </div>
      )}
      <div className="glass-strong rounded-3xl p-2 shadow-2xl shadow-black/30 transition focus-within:border-accent/40">
        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          aria-label="Message KEO"
          className="block max-h-[180px] w-full resize-none bg-transparent px-3 py-2.5 text-[15px] leading-relaxed placeholder:text-muted/70 focus:outline-none"
        />
        <div className="flex items-center justify-between gap-2 px-1 pt-1">
          <ModeToggle mode={mode} onChange={onChangeMode} />
          <div className="flex items-center gap-2">
            {voice.supported && (
              <button
                type="button"
                onClick={voice.toggle}
                aria-label={voice.listening ? "Stop listening" : "Speak to KEO"}
                aria-pressed={voice.listening}
                className={`relative grid h-10 w-10 place-items-center rounded-full transition active:scale-95 ${
                  voice.listening ? "bg-accent text-on-accent" : "text-muted hover:bg-panel/10 hover:text-fg"
                }`}
              >
                {voice.listening && (
                  <span className="absolute inset-0 rounded-full bg-accent/50 animate-ring-pulse" />
                )}
                {voice.listening ? <MicOff size={18} className="relative" /> : <Mic size={18} />}
              </button>
            )}
            {streaming ? (
              <button type="button" onClick={onStop} aria-label="Stop generating" className="grid h-10 w-10 place-items-center rounded-full bg-fg text-bg transition active:scale-95">
                <Square size={14} fill="currentColor" />
              </button>
            ) : (
              <button
                type="button"
                onClick={onSubmit}
                disabled={busy || !value.trim()}
                aria-label="Send message"
                className="grid h-10 w-10 place-items-center rounded-full bg-accent text-on-accent transition hover:brightness-110 active:scale-95 disabled:opacity-40"
              >
                <Send size={17} />
              </button>
            )}
          </div>
        </div>
      </div>
      <p className="mt-2 hidden px-4 text-center text-[11px] text-muted sm:block">
        KEO can make mistakes. Agent actions that send messages or emails always ask for your confirmation first.
      </p>
    </div>
  );
}
