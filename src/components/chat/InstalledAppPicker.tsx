import { useEffect, useState } from "react";
import { AppWindow, ExternalLink, RefreshCw, Search, X } from "lucide-react";
import { getInstalledAppList, type InstalledAppInfo } from "@/services/agent/installedAppsService";
import { KeoNative, isNativeApp } from "@/services/native/keoNative";

interface InstalledAppPickerProps {
  open: boolean;
  onClose: () => void;
  onAppLaunched?: (app: InstalledAppInfo) => void;
}

export function InstalledAppPicker({ open, onClose, onAppLaunched }: InstalledAppPickerProps) {
  const [apps, setApps] = useState<InstalledAppInfo[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const load = async (force = false) => {
    setLoading(true);
    setFeedback(null);
    try {
      const list = await getInstalledAppList(force);
      setApps(list);
    } catch {
      setFeedback("Could not load installed apps.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      void load(false);
    }
  }, [open]);

  if (!open) return null;

  const filtered = apps.filter(
    (a) =>
      a.appName.toLowerCase().includes(query.toLowerCase()) ||
      a.packageName.toLowerCase().includes(query.toLowerCase())
  );

  const handleLaunch = async (app: InstalledAppInfo) => {
    if (isNativeApp()) {
      try {
        const res = await KeoNative.openApp({ packageName: app.packageName });
        if (res.status === "opened") {
          onAppLaunched?.(app);
          onClose();
          return;
        }
        setFeedback(`App ${app.appName} could not be launched directly.`);
      } catch {
        setFeedback(`Failed to launch ${app.appName}.`);
      }
    } else {
      // In web browser preview
      window.open(`https://play.google.com/store/apps/details?id=${app.packageName}`, "_blank");
      setFeedback(`Opened ${app.appName} store page in browser.`);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Installed Apps Picker"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in"
    >
      <div className="glass-strong relative flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-cyan-400/30 p-5 shadow-2xl shadow-cyan-500/10">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-xl bg-cyan-400/20 text-cyan-400">
              <AppWindow size={16} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-100">Installed Apps</h2>
              <p className="text-[11px] text-slate-400">
                {apps.length} apps discovered via Android PackageManager
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void load(true)}
              disabled={loading}
              className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-white/10 hover:text-slate-100"
              title="Rescan installed apps"
              aria-label="Rescan installed apps"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-white/10 hover:text-slate-100"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="mt-3">
          <div className="relative flex items-center">
            <Search size={15} className="absolute left-3 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search installed apps..."
              autoComplete="off"
              autoCorrect="on"
              spellCheck={false}
              className="field min-w-0 flex-1 pl-9 text-xs"
            />
          </div>
        </div>

        {feedback && (
          <div className="mt-2 rounded-xl bg-cyan-400/10 p-2 text-center text-xs text-cyan-300">
            {feedback}
          </div>
        )}

        <div className="mt-3 flex-1 overflow-y-auto pr-1">
          {loading && apps.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-400">Discovering apps on device...</p>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-400">No apps match &ldquo;{query}&rdquo;.</p>
          ) : (
            <div className="flex flex-col gap-1">
              {filtered.map((app) => (
                <button
                  key={app.packageName}
                  type="button"
                  onClick={() => void handleLaunch(app)}
                  className="flex items-center justify-between rounded-xl p-2.5 text-left transition hover:bg-white/10 active:scale-[0.99]"
                >
                  <div className="min-w-0 pr-2">
                    <p className="truncate text-xs font-medium text-slate-200">{app.appName}</p>
                    <p className="truncate font-mono text-[10px] text-slate-400">{app.packageName}</p>
                  </div>
                  <ExternalLink size={13} className="shrink-0 text-cyan-400" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
