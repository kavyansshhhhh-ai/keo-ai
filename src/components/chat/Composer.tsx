import { useLayoutEffect, useRef, type KeyboardEvent } from "react";
import { AppWindow, Mic, MicOff, Send, Square } from "lucide-react";
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
  onOpenApps?: () => void;
}

export function Composer(props: ComposerProps) {
  const { value, onChange, onSubmit, onStop, streaming, busy, mode, onChangeMode, voice, onOpenApps } = props;
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value]);

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (!streaming && !busy && value.trim()) onSubmit();
    }
  };

  const placeholder = mode === "agent"
    ? "Tell KEO what to do, e.g. \"Open YouTube\" or \"Turn on flashlight\""
    : "Ask KEO anything in English, Hindi or Hinglish...";

  return (
    <div className="mx-auto w-full max-w-3xl px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 sm:px-6 sm:pb-5">
      {(voice.listening || voice.error) && (
        <div className="mb-2 flex items-center gap-2 px-2 text-xs" role="status">
          {voice.listening ? (
            <>
              <span className="relative inline-flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-70 animate-ping" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-cyan-400" />
              </span>
              <span className="text-slate-300 font-medium">{voice.interim || "Listening... speak now"}</span>
            </>
          ) : (
            <span className="text-rose-400 font-medium">{voice.error}</span>
          )}
        </div>
      )}
      {voice.micGate === "explain" && (
        <div className="glass mb-2 rounded-2xl p-4 text-sm" role="dialog" aria-label="Microphone access">
          <p className="font-medium text-slate-100">Let KEO hear you</p>
          <p className="mt-1 leading-relaxed text-slate-400">
            KEO uses the microphone only while you tap the mic button to turn your speech into text. Nothing is recorded in the background.
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={voice.dismissMicGate} className="btn-ghost !px-3 !py-1.5 text-xs">Not now</button>
            <button type="button" onClick={voice.allowMicrophone} className="btn-primary !px-3 !py-1.5 text-xs">Continue</button>
          </div>
        </div>
      )}
      {voice.micGate === "blocked" && (
        <div className="glass mb-2 rounded-2xl p-4 text-sm" role="alert">
          <p className="font-medium text-rose-300">Microphone access is turned off</p>
          <p className="mt-1 leading-relaxed text-slate-400">
            Enable microphone permission for KEO AI in Android settings to use voice input.
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={voice.dismissMicGate} className="btn-ghost !px-3 !py-1.5 text-xs">Close</button>
            <button type="button" onClick={voice.openMicSettings} className="btn-primary !px-3 !py-1.5 text-xs">Open Settings</button>
          </div>
        </div>
      )}
      <div className="glass-strong rounded-3xl p-2.5 shadow-2xl shadow-black/60 transition focus-within:border-cyan-400/50 focus-within:ring-1 focus-within:ring-cyan-400/20">
        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          aria-label="Message KEO"
          autoComplete="on"
          autoCorrect="on"
          autoCapitalize="sentences"
          spellCheck={true}
          enterKeyHint="send"
          className="block max-h-[160px] w-full resize-none bg-transparent px-3 py-2 text-[15px] leading-relaxed text-slate-100 placeholder:text-slate-500 focus:outline-none"
        />
        <div className="flex items-center justify-between gap-2 px-1 pt-1.5">
          <div className="flex items-center gap-1.5">
            <ModeToggle mode={mode} onChange={onChangeMode} />
            {onOpenApps && (
              <button
                type="button"
                onClick={onOpenApps}
                aria-label="Open Installed Apps"
                title="Browse Installed Android Apps"
                className="grid h-8 w-8 place-items-center rounded-xl text-slate-400 transition hover:bg-white/10 hover:text-cyan-400 active:scale-95"
              >
                <AppWindow size={16} />
              </button>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {voice.supported && (
              <button
                type="button"
                onClick={voice.toggle}
                aria-label={voice.listening ? "Stop listening" : "Speak to KEO"}
                aria-pressed={voice.listening}
                className={`relative grid h-9 w-9 place-items-center rounded-full transition active:scale-95 ${
                  voice.listening ? "bg-cyan-400 text-slate-950 shadow-lg shadow-cyan-400/30" : "text-slate-400 hover:bg-white/10 hover:text-slate-100"
                }`}
              >
                {voice.listening && (
                  <span className="absolute inset-0 rounded-full bg-cyan-400/50 animate-ping" />
                )}
                {voice.listening ? <MicOff size={17} className="relative" /> : <Mic size={17} />}
              </button>
            )}
            {streaming || busy ? (
              <button
                type="button"
                onClick={onStop}
                aria-label="Stop generating"
                title="Stop generating reply"
                className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-slate-950 shadow-md transition hover:bg-white active:scale-95"
              >
                <Square size={13} fill="currentColor" />
              </button>
            ) : (
              <button
                type="button"
                onClick={onSubmit}
                disabled={busy || !value.trim()}
                aria-label="Send message"
                className="grid h-9 w-9 place-items-center rounded-full bg-cyan-400 text-slate-950 shadow-lg shadow-cyan-400/20 transition hover:brightness-110 active:scale-95 disabled:opacity-30 disabled:shadow-none"
              >
                <Send size={16} />
              </button>
            )}
          </div>
        </div>
      </div>
      <p className="mt-2 hidden px-4 text-center text-[11px] text-slate-500 sm:block">
        KEO can make mistakes. Agent actions that send messages or emails always ask for your confirmation first.
      </p>
    </div>
  );
}
