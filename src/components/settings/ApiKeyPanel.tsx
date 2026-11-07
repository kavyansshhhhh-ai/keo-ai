import { useCallback, useEffect, useState, type FormEvent } from "react";
import { KeyRound } from "lucide-react";
import { errorMessage } from "@/lib/errors";
import {
  fetchProviderKeyStatus,
  removeProviderKey,
  saveProviderKey,
  type ProviderKeyStatus,
} from "@/services/providerKeyService";

type PendingAction = "saving" | "removing" | null;

function describeSource(status: ProviderKeyStatus | null): string {
  if (!status) return "Checking...";
  if (status.source === "saved") return "Saved in KEO";
  if (status.source === "environment") return "Set on the server";
  return "Not set";
}

export function ApiKeyPanel() {
  const [status, setStatus] = useState<ProviderKeyStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<PendingAction>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

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
    setJustSaved(false);
    try {
      setStatus(await saveProviderKey(apiKey));
      setDraft("");
      setJustSaved(true);
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
    setJustSaved(false);
    try {
      await removeProviderKey();
      await loadStatus();
    } catch (err) {
      setActionError(errorMessage(err, "Could not remove the key."));
    } finally {
      setPending(null);
    }
  };

  if (loadError) {
    return (
      <div role="alert" className="flex flex-col gap-3 rounded-xl border border-error-300/30 bg-error-500/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-error-300">{loadError}</p>
        <button type="button" onClick={() => void loadStatus()} className="btn-ghost shrink-0">
          Try again
        </button>
      </div>
    );
  }

  const configured = status?.configured ?? false;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 rounded-xl border border-line/10 bg-panel/5 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <KeyRound size={18} className={configured ? "shrink-0 text-success-300" : "shrink-0 text-warning"} aria-hidden />
          <div className="min-w-0">
            <p className="text-sm font-medium">{describeSource(status)}</p>
            {status?.masked && <p className="font-mono text-xs text-muted">{status.masked}</p>}
          </div>
        </div>
        {status?.source === "saved" && (
          <button type="button" onClick={() => void handleRemove()} disabled={pending !== null} className="btn-danger shrink-0">
            {pending === "removing" ? "Removing..." : "Remove"}
          </button>
        )}
      </div>

      <form onSubmit={(event) => void handleSave(event)} className="flex flex-col gap-3 sm:flex-row">
        <label htmlFor="gemini-api-key" className="sr-only">
          Gemini API key
        </label>
        <input
          id="gemini-api-key"
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={configured ? "Paste a new key to replace it" : "Paste your Gemini API key"}
          className="field min-w-0 flex-1 font-mono text-sm"
        />
        <button type="submit" disabled={!draft.trim() || pending !== null} className="btn-primary shrink-0">
          {pending === "saving" ? "Verifying..." : "Save key"}
        </button>
      </form>

      {actionError && (
        <p role="alert" className="text-sm text-error-300">
          {actionError}
        </p>
      )}
      {justSaved && (
        <p role="status" className="text-sm text-success-300">
          Key verified and saved. KEO is ready to chat.
        </p>
      )}
      <p className="text-xs leading-relaxed text-muted">
        The key is stored on KEO's server, is never sent back to this browser, and is only shown as its last four characters.
      </p>
    </div>
  );
}
