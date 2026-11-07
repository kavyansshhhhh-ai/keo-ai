import { useEffect, useRef } from "react";
import { AlertTriangle, RotateCcw, Sparkles, X } from "lucide-react";
import { MarkdownContent } from "@/components/chat/MarkdownContent";
import { MessageBubble } from "@/components/chat/MessageBubble";
import type { ChatThreadState } from "@/hooks/useChatThread";

function TypingDots() {
  return (
    <div className="flex gap-3 animate-fade-in" aria-label="KEO is typing">
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-accent/30 bg-accent/10 text-accent">
        <Sparkles size={16} />
      </div>
      <div className="glass flex items-center gap-1.5 rounded-2xl rounded-tl-md px-4 py-4">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-2 w-2 rounded-full bg-accent animate-dot-bounce"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  );
}

function ErrorNotice({ thread }: { thread: ChatThreadState }) {
  const error = thread.error;
  if (!error) return null;
  return (
    <div role="alert" className="glass flex flex-col gap-3 rounded-2xl border-error-500/30 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <AlertTriangle size={18} className="mt-0.5 shrink-0 text-error-300" />
        <p className="text-sm leading-relaxed text-error-300">{error.message}</p>
      </div>
      <div className="flex shrink-0 gap-2">
        <button type="button" onClick={thread.dismissError} className="btn-ghost !px-3 !py-2" aria-label="Dismiss error">
          <X size={16} />
        </button>
        {error.retry && (
          <button type="button" onClick={error.retry} className="btn-primary !px-3 !py-2">
            <RotateCcw size={16} /> Retry
          </button>
        )}
      </div>
    </div>
  );
}

export function MessageList({ thread, disabled }: { thread: ChatThreadState; disabled: boolean }) {
  const endRef = useRef<HTMLDivElement>(null);
  const { messages, streamingText, error } = thread;
  const lastAssistantId = [...messages].reverse().find((m) => m.role === "assistant")?.id;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, streamingText, error]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6">
      {messages.map((message) => (
        <MessageBubble
          key={message.id}
          message={message}
          canRegenerate={message.id === lastAssistantId}
          disabled={disabled}
          onRegenerate={thread.regenerate}
          onEdit={(text) => thread.editAndResend(message, text)}
          onConfirmAction={() => thread.confirmActionCard(message)}
          onCancelAction={() => thread.cancelActionCard(message)}
        />
      ))}
      {streamingText !== null &&
        (streamingText === "" ? (
          <TypingDots />
        ) : (
          <div className="flex gap-3 animate-fade-in">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-accent/30 bg-accent/10 text-accent">
              <Sparkles size={16} />
            </div>
            <div className="glass min-w-0 max-w-[92%] flex-1 rounded-2xl rounded-tl-md px-4 py-3 sm:max-w-[85%]">
              <MarkdownContent text={streamingText} />
              <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 bg-accent animate-caret" />
            </div>
          </div>
        ))}
      <ErrorNotice thread={thread} />
      <div ref={endRef} />
    </div>
  );
}
