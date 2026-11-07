import { ArrowRight, ExternalLink, KeyRound, MessageSquare, Settings } from "lucide-react";
import { formatRelativeTime } from "@/lib/format";
import type { ChatMode, Conversation } from "@/types/chat";

const CHAT_PROMPTS = [
  "Explain how the internet works in simple terms",
  "Hinglish mein ek healthy breakfast ka plan do",
  "Write a Python function that checks for a palindrome",
  "Help me write a polite leave application for work",
];

const AGENT_PROMPTS = [
  "Open YouTube",
  "Search Google for best budget laptops",
  "Set alarm for 6:30 am",
  "Navigate to India Gate",
];

interface WelcomeProps {
  mode: ChatMode;
  displayName: string;
  hasApiKey: boolean;
  recent: Conversation[];
  onPrompt: (prompt: string) => void;
  onOpenConversation: (conversation: Conversation) => void;
  onOpenSettings?: () => void;
}

export function Welcome({
  mode,
  displayName,
  hasApiKey,
  recent,
  onPrompt,
  onOpenConversation,
  onOpenSettings,
}: WelcomeProps) {
  const prompts = mode === "agent" ? AGENT_PROMPTS : CHAT_PROMPTS;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12">
      <div className="animate-fade-in">
        {displayName && <p className="mb-2 text-sm text-cyan-400">Welcome back, {displayName}</p>}
        <h1 className="text-4xl font-bold tracking-tight text-slate-100 sm:text-5xl">Hello, I'm KEO.</h1>
        <p className="mt-2 text-base text-slate-400">Your personal AI assistant and device agent.</p>
      </div>

      {!hasApiKey && (
        <div
          role="region"
          aria-label="API Key Setup"
          className="glass flex flex-col gap-4 rounded-3xl border-cyan-400/30 bg-cyan-400/5 p-5 shadow-xl shadow-cyan-500/5 animate-fade-in sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-3.5">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-cyan-400/40 bg-cyan-400/15 text-cyan-400">
              <KeyRound size={20} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-100">
                Please add your Gemini API key in Settings to start chatting.
              </p>
              <p className="mt-0.5 text-xs text-slate-400">
                KEO uses your personal key directly and stores it privately on your device.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:self-center">
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-ghost !px-3.5 !py-2 text-xs"
            >
              <span>Get Free Key</span>
              <ExternalLink size={12} />
            </a>
            {onOpenSettings && (
              <button
                type="button"
                onClick={onOpenSettings}
                className="btn-primary !px-4 !py-2 text-xs"
              >
                <Settings size={14} />
                <span>Open Settings</span>
              </button>
            )}
          </div>
        </div>
      )}

      <section aria-label="Suggested prompts" className="grid gap-3 sm:grid-cols-2">
        {prompts.map((prompt, index) => (
          <button
            key={prompt}
            type="button"
            onClick={() => onPrompt(prompt)}
            style={{ animationDelay: `${index * 60}ms` }}
            className="glass group flex items-center justify-between gap-3 rounded-2xl p-4 text-left text-sm leading-relaxed animate-fade-in transition hover:-translate-y-0.5 hover:border-cyan-400/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
          >
            <span className="text-slate-200">{prompt}</span>
            <ArrowRight size={16} className="shrink-0 text-slate-500 transition group-hover:translate-x-0.5 group-hover:text-cyan-400" />
          </button>
        ))}
      </section>

      {recent.length > 0 && (
        <section aria-label="Recent conversations" className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Recent conversations</h2>
          <div className="flex flex-col gap-2">
            {recent.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                onClick={() => onOpenConversation(conversation)}
                className="glass flex items-center gap-3 rounded-2xl px-4 py-3 text-left transition hover:border-cyan-400/40"
              >
                <MessageSquare size={16} className="shrink-0 text-cyan-400" />
                <span className="min-w-0 flex-1 truncate text-sm text-slate-200">{conversation.title}</span>
                <span className="shrink-0 text-xs text-slate-400">{formatRelativeTime(conversation.updated_at)}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
