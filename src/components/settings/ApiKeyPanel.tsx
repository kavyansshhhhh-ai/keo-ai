import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Check, ExternalLink, Eye, EyeOff, KeyRound, Loader2, Trash2 } from "lucide-react";
import { errorMessage } from "@/lib/errors";
import {
  fetchProviderKeyStatus,
  removeProviderKey,
  saveProviderKey,
  type ProviderKeyStatus,
} from "@/services/providerKeyService";

type PendingAction = "saving" | "removing" | null;

export function ApiKeyPanel() {
  const [status, setStatus] = useState<ProviderKeyStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [pending, setPending] = useState<PendingAction>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setLoadError(null);
    try {
      setStatus(await fetchProviderKeyStatus());
    } catch (err) {
      setLoadError(errorMessage(err, "Could not check the API key."));
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const apiKey = draft.trim();
    if (!apiKey || pending) return;
    setPending("saving");
    setActionError(null);
    setSuccessMessage(null);
    try {
      const nextStatus = await saveProviderKey(apiKey);
      setStatus(nextStatus);
      setDraft("");
      setShowKey(false);
      setSuccessMessage("Gemini API key verified with Google and saved securely on your device.");
    } catch (err) {
      setActionError(errorMessage(err, "Could not save the key."));
    } finally {
      setPending(null);
    }
  };

  const handleRemove = async () => {
    if (pending) return;
    setPending("removing");
    setActionError(null);
    setSuccessMessage(null);
    try {
      await removeProviderKey();
      await loadStatus();
      setDraft("");
      setSuccessMessage("Gemini API key removed. Add a key to resume chatting.");
    } catch (err) {
      setActionError(errorMessage(err, "Could not remove the key."));
    } finally {
      setPending(null);
    }
  };

  if (loadError) {
    return (
      <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-rose-300">{loadError}</p>
        <button type="button" onClick={() => void loadStatus()} className="btn-ghost shrink-0 text-xs">
          Try again
        </button>
      </div>
    );
  }

  const configured = status?.configured ?? false;

  return (
    <div className="flex flex-col gap-4">
      <div className="glass flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border ${
            configured ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-amber-500/30 bg-amber-500/10 text-amber-400"
          }`}>
            <KeyRound size={18} aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-100">
              {configured ? "Active Key Configured" : "No API Key Set"}
            </p>
            {configured && status?.masked ? (
              <p className="font-mono text-xs text-slate-400">{status.masked}</p>
            ) : (
              <p className="text-xs text-slate-400">Add your Google Gemini key below to begin chatting.</p>
            )}
          </div>
        </div>

        {configured && (
          <button
            type="button"
            onClick={() => void handleRemove()}
            disabled={pending !== null}
            className="btn-danger shrink-0 !px-3.5 !py-2 text-xs"
            aria-label="Remove Gemini API key"
          >
            <Trash2 size={14} />
            {pending === "removing" ? "Removing..." : "Remove Key"}
          </button>
        )}
      </div>

      <div className="flex items-center justify-between px-1">
        <label htmlFor="gemini-api-key" className="text-xs font-medium text-slate-300">
          {configured ? "Update Gemini API Key" : "Enter Gemini API Key"}
        </label>
        <a
          href="https://aistudio.google.com/app/apikey"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-cyan-400 transition hover:underline"
        >
          <span>Get Free Gemini API Key</span>
          <ExternalLink size={12} />
        </a>
      </div>

      <form onSubmit={(event) => void handleSave(event)} className="flex flex-col gap-3">
        <div className="relative flex items-center">
          <input
            id="gemini-api-key"
            type={showKey ? "text" : "password"}
            autoComplete="off"
            spellCheck={false}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              if (actionError) setActionError(null);
            }}
            placeholder={configured ? "Paste a new key to update..." : "Paste your Gemini API key (AIzaSy...)"}
            className="field min-w-0 flex-1 pr-11 font-mono text-sm"
          />
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            aria-label={showKey ? "Hide API key" : "Show API key"}
            className="absolute right-2.5 grid h-7 w-7 place-items-center rounded-lg text-slate-400 transition hover:bg-white/10 hover:text-slate-100"
          >
            {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-400">
            Keys are stored privately on your device. Never shared or sent to any third party other than Google.
          </p>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={!draft.trim() || pending !== null}
              className="btn-primary shrink-0 !px-4 !py-2 text-xs"
            >
              {pending === "saving" ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Validating...</span>
                </>
              ) : configured ? (
                <>
                  <Check size={14} />
                  <span>Update Key</span>
                </>
              ) : (
                <>
                  <Check size={14} />
                  <span>Save Key</span>
                </>
              )}
            </button>
          </div>
        </div>
      </form>

      {actionError && (
        <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs leading-relaxed text-rose-300">
          <span className="font-semibold">Error: </span>
          {actionError}
        </div>
      )}

      {successMessage && (
        <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs leading-relaxed text-emerald-300">
          {successMessage}
        </div>
      )}
    </div>
  );
}
