import { Bot, MessageSquare } from "lucide-react";
import type { ChatMode } from "@/types/chat";

const MODES: { value: ChatMode; label: string; icon: typeof Bot }[] = [
  { value: "chat", label: "Chat", icon: MessageSquare },
  { value: "agent", label: "Agent", icon: Bot },
];

export function ModeToggle({ mode, onChange }: { mode: ChatMode; onChange: (mode: ChatMode) => void }) {
  return (
    <div role="radiogroup" aria-label="Assistant mode" className="inline-flex rounded-full border border-line/10 bg-panel/5 p-1">
      {MODES.map(({ value, label, icon: Icon }) => {
        const active = mode === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(value)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
              active ? "bg-accent text-on-accent shadow-sm" : "text-muted hover:text-fg"
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        );
      })}
    </div>
  );
}
