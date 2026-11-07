import { useState, type ReactNode } from "react";
import { Check, Copy, Pencil, RotateCcw, Sparkles } from "lucide-react";
import { AgentActionCard } from "@/components/chat/AgentActionCard";
import { MarkdownContent } from "@/components/chat/MarkdownContent";
import type { ChatMessage } from "@/types/chat";

interface MessageBubbleProps {
  message: ChatMessage;
  canRegenerate: boolean;
  disabled: boolean;
  onRegenerate: () => void;
  onEdit: (text: string) => void;
  onConfirmAction: () => void;
  onCancelAction: () => void;
}

function useCopy(text: string) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };
  return { copied, copy };
}

function ActionButton({ label, onClick, disabled, children }: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="grid h-8 w-8 place-items-center rounded-full text-muted transition hover:bg-panel/10 hover:text-fg disabled:opacity-40"
    >
      {children}
    </button>
  );
}

export function MessageBubble(props: MessageBubbleProps) {
  const { message, canRegenerate, disabled, onRegenerate, onEdit, onConfirmAction, onCancelAction } = props;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const { copied, copy } = useCopy(message.content);
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="group flex justify-end animate-message-in">
        <div className="flex max-w-[88%] flex-col items-end gap-1 sm:max-w-[80%]">
          {editing ? (
            <div className="glass-strong w-full rounded-2xl p-3">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                rows={3}
                className="field resize-none"
                aria-label="Edit message"
              />
              <div className="mt-2 flex justify-end gap-2">
                <button type="button" className="btn-ghost !px-3 !py-2" onClick={() => setEditing(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary !px-3 !py-2"
                  disabled={disabled || !draft.trim()}
                  onClick={() => {
                    setEditing(false);
                    onEdit(draft);
                  }}
                >
                  Save and resend
                </button>
              </div>
            </div>
          ) : (
            <div className="whitespace-pre-wrap break-words rounded-2xl rounded-br-md border border-accent/25 bg-accent/15 px-4 py-3 text-[15px] leading-[1.6]">
              {message.content}
            </div>
          )}
          {!editing && (
            <div className="flex gap-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
              <ActionButton
                label="Edit message"
                disabled={disabled}
                onClick={() => {
                  setDraft(message.content);
                  setEditing(true);
                }}
              >
                <Pencil size={14} />
              </ActionButton>
              <ActionButton label={copied ? "Copied" : "Copy message"} onClick={copy}>
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </ActionButton>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="group flex gap-3 animate-message-in">
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-accent/30 bg-accent/10 text-accent">
        <Sparkles size={16} />
      </div>
      <div className="min-w-0 max-w-[92%] flex-1 sm:max-w-[85%]">
        {message.action ? (
          <AgentActionCard action={message.action} onConfirm={onConfirmAction} onCancel={onCancelAction} />
        ) : (
          <div className="glass rounded-2xl rounded-tl-md px-4 py-3">
            <MarkdownContent text={message.content} />
          </div>
        )}
        <div className="mt-1 flex gap-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
          <ActionButton label={copied ? "Copied" : "Copy response"} onClick={copy}>
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </ActionButton>
          {canRegenerate && !message.action && (
            <ActionButton label="Regenerate response" disabled={disabled} onClick={onRegenerate}>
              <RotateCcw size={14} />
            </ActionButton>
          )}
        </div>
      </div>
    </div>
  );
}
