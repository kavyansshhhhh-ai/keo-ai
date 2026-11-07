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
    <header className="glass relative z-20 flex h-16 shrink-0 items-center justify-between gap-3 border-x-0 border-t-0 px-4 pt-[env(safe-area-inset-top)] sm:px-6">
      <button
        type="button"
        onClick={onHome}
        className="flex items-center gap-3 rounded-xl transition hover:opacity-90 active:scale-98"
        aria-label="KEO AI home"
      >
        <span className="grid h-9 w-9 place-items-center rounded-2xl border border-cyan-400/30 bg-cyan-400/10 text-cyan-400 shadow-lg shadow-cyan-500/10">
          <Sparkles size={18} />
        </span>
        <span className="flex flex-col items-start leading-none">
          <span className="font-display text-lg font-bold tracking-tight text-slate-100">KEO AI</span>
          <span className="mt-1 inline-flex items-center gap-1.5 text-[11px] text-slate-400">
            <span className={`h-1.5 w-1.5 rounded-full ${online ? "bg-emerald-400" : "bg-amber-400"}`} />
            {online ? "Assistant ready" : "Offline mode"}
          </span>
        </span>
      </button>

      <nav className="flex items-center gap-1.5" aria-label="Header actions">
        <button
          type="button"
          onClick={onOpenHistory}
          aria-label="Chat history"
          title="Chat history"
          className="icon-btn"
        >
          <History size={19} />
        </button>
        <button
          type="button"
          onClick={onOpenProfile}
          aria-label="Profile"
          title="Profile"
          className="icon-btn"
        >
          <CircleUser size={19} />
        </button>
        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="Settings"
          title="Settings"
          className="icon-btn"
        >
          <Settings size={19} />
        </button>
      </nav>
    </header>
  );
}
