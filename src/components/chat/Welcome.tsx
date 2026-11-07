import { ArrowRight, MessageSquare } from "lucide-react";
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
  recent: Conversation[];
  onPrompt: (prompt: string) => void;
  onOpenConversation: (conversation: Conversation) => void;
}

export function Welcome({ mode, displayName, recent, onPrompt, onOpenConversation }: WelcomeProps) {
  const prompts = mode === "agent" ? AGENT_PROMPTS : CHAT_PROMPTS;
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 py-10 sm:px-6 sm:py-16">
      <div className="animate-fade-in">
        {displayName && <p className="mb-2 text-sm text-accent">Welcome back, {displayName}</p>}
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Hello, I'm KEO.</h1>
        <p className="mt-3 text-lg text-muted">Your intelligent personal AI assistant.</p>
      </div>

      <section aria-label="Suggested prompts" className="grid gap-3 sm:grid-cols-2">
        {prompts.map((prompt, index) => (
          <button
            key={prompt}
            type="button"
            onClick={() => onPrompt(prompt)}
            style={{ animationDelay: `${index * 60}ms` }}
            className="glass group flex items-center justify-between gap-3 rounded-2xl p-4 text-left text-sm leading-relaxed animate-fade-in transition hover:-translate-y-0.5 hover:border-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            <span>{prompt}</span>
            <ArrowRight size={16} className="shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-accent" />
          </button>
        ))}
      </section>

      {recent.length > 0 && (
        <section aria-label="Recent conversations" className="flex flex-col gap-3">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted">Recent conversations</h2>
          <div className="flex flex-col gap-2">
            {recent.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                onClick={() => onOpenConversation(conversation)}
                className="glass flex items-center gap-3 rounded-xl px-4 py-3 text-left transition hover:border-accent/40"
              >
                <MessageSquare size={16} className="shrink-0 text-accent" />
                <span className="min-w-0 flex-1 truncate text-sm">{conversation.title}</span>
                <span className="shrink-0 text-xs text-muted">{formatRelativeTime(conversation.updated_at)}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
