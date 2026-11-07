import { CircleUser, History, Sparkles, Settings } from "lucide-react";

interface AppHeaderProps {
  online: boolean;
  onHome: () => void;
  onOpenHistory: () => void;
  onOpenProfile: () => void;
  onOpenSettings: () => void;
}

export function AppHeader({ online, onHome, onOpenHistory, onOpenProfile, onOpenSettings }: AppHeaderProps) {
  return (
    <header className="glass relative z-20 flex h-16 shrink-0 items-center justify-between gap-3 border-x-0 border-t-0 px-4 sm:px-6">
      <button type="button" onClick={onHome} className="flex items-center gap-3 rounded-xl transition hover:opacity-90" aria-label="KEO AI home">
        <span className="grid h-9 w-9 place-items-center rounded-xl border border-accent/30 bg-accent/15 text-accent">
          <Sparkles size={18} />
        </span>
        <span className="flex flex-col items-start leading-none">
          <span className="font-display text-lg font-semibold tracking-tight">KEO AI</span>
          <span className="mt-1 inline-flex items-center gap-1.5 text-[11px] text-muted">
            <span className={`h-1.5 w-1.5 rounded-full ${online ? "bg-success-400" : "bg-warning-400"}`} />
            {online ? "Assistant ready" : "Offline"}
          </span>
        </span>
      </button>

      <nav className="flex items-center gap-1" aria-label="Header actions">
        <button type="button" onClick={onOpenHistory} aria-label="Chat history" title="Chat history" className="icon-btn lg:hidden">
          <History size={19} />
        </button>
        <button type="button" onClick={onOpenProfile} aria-label="Profile" title="Profile" className="icon-btn">
          <CircleUser size={19} />
        </button>
        <button type="button" onClick={onOpenSettings} aria-label="Settings" title="Settings" className="icon-btn">
          <Settings size={19} />
        </button>
      </nav>
    </header>
  );
}
