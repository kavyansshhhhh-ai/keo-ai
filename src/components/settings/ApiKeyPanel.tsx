import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Check, Clipboard, Cpu, ExternalLink, Eye, EyeOff, KeyRound, Loader2, RefreshCw, Trash2, X } from "lucide-react";
import { errorMessage } from "@/lib/errors";
import {
  discoverGeminiModels,
  getCachedDiscoveredModels,
  getStoredSelectedModel,
  setStoredSelectedModel,
} from "@/services/modelDiscovery";
import {
  fetchProviderKeyStatus,
  removeProviderKey,
  saveProviderKey,
  type ProviderKeyStatus,
} from "@/services/providerKeyService";

type PendingAction = "saving" | "verifying" | "removing" | null;

export function ApiKeyPanel() {
  const [status, setStatus] = useState<ProviderKeyStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [pending, setPending] = useState<PendingAction>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [verifiedModels, setVerifiedModels] = useState<string[]>([]);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("gemini-2.5-flash");

  const loadStatus = useCallback(async () => {
    setLoadError(null);
    try {
      const st = await fetchProviderKeyStatus();
      setStatus(st);
      if (st.configured) {
        const models = getCachedDiscoveredModels();
        setAvailableModels(models);
        const sel = getStoredSelectedModel();
        setSelectedModel(sel || models[0] || "gemini-2.5-flash");
      }
    } catch (err) {
      setLoadError(errorMessage(err, "Could not check the API key."));
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const handlePaste = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text && text.trim()) {
          setDraft(text.trim());
          setActionError(null);
          setSuccessMessage("Key pasted from clipboard. Tap 'Verify Key' or 'Save Key' to apply.");
          return;
        }
      }
      setActionError("Clipboard access empty or not available. Please paste manually into the text box.");
    } catch {
      setActionError("Could not read clipboard. Please paste your key directly into the input field.");
    }
  };

  const handleClear = () => {
    setDraft("");
    setActionError(null);
    setSuccessMessage(null);
    setVerifiedModels([]);
  };

  const handleVerify = async () => {
    const apiKey = draft.trim() || (status?.configured ? "USE_STORED" : "");
    if (!apiKey) {
      setActionError("Please paste or enter an API key to verify.");
      return;
    }
    setPending("verifying");
    setActionError(null);
    setSuccessMessage(null);
    try {
      const models = await discoverGeminiModels(draft.trim() || status?.masked || "");
      setVerifiedModels(models);
      setSuccessMessage(
        `Key verified! Discovered ${models.length} supported Gemini models (${models[0]} selected as primary).`
      );
    } catch (err) {
      setActionError(errorMessage(err, "Verification failed. Check your API key."));
    } finally {
      setPending(null);
    }
  };

  const handleSave = async (event?: FormEvent<HTMLFormElement>) => {
    if (event) event.preventDefault();
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
      const models = getCachedDiscoveredModels();
      setAvailableModels(models);
      const sel = getStoredSelectedModel();
      setSelectedModel(sel || models[0] || "gemini-2.5-flash");
      setSuccessMessage("Gemini API key verified with Google, models discovered, and saved securely on your device.");
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
      setAvailableModels([]);
      setVerifiedModels([]);
      setSuccessMessage("Gemini API key removed.");
    } catch (err) {
      setActionError(errorMessage(err, "Could not remove the key."));
    } finally {
      setPending(null);
    }
  };

  const handleModelChange = (model: string) => {
    setSelectedModel(model);
    setStoredSelectedModel(model);
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
      {/* Connection Status Card */}
      <div className="glass flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border ${
            configured ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-amber-500/30 bg-amber-500/10 text-amber-400"
          }`}>
            <KeyRound size={18} aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-100">
              {configured ? "Active Gemini API Key" : "No API Key Set"}
            </p>
            {configured && status?.masked ? (
              <p className="font-mono text-xs text-emerald-400 font-medium">{status.masked} (Connected)</p>
            ) : (
              <p className="text-xs text-slate-400">Paste your Google Gemini API key below to enable chat & agent features.</p>
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

      {/* Discovered Models Dropdown */}
      {configured && availableModels.length > 0 && (
        <div className="glass flex flex-col gap-2 rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
              <Cpu size={15} className="text-cyan-400" />
              <span>Supported Gemini Models ({availableModels.length})</span>
            </div>
            <button
              type="button"
              onClick={() => void handleVerify()}
              disabled={pending !== null}
              className="text-[11px] text-cyan-400 hover:underline flex items-center gap-1"
            >
              <RefreshCw size={11} className={pending === "verifying" ? "animate-spin" : ""} />
              <span>Re-check</span>
            </button>
          </div>
          <p className="text-xs text-slate-400">
            KEO automatically selects the best Flash model for your key. You can switch models anytime:
          </p>
          <select
            value={selectedModel}
            onChange={(e) => handleModelChange(e.target.value)}
            aria-label="Select Gemini model"
            className="field mt-1 font-mono text-xs"
          >
            {availableModels.map((m) => (
              <option key={m} value={m} className="bg-slate-900 text-slate-100">
                {m} {m.includes("flash") ? "(Flash - Preferred)" : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Form Input Header */}
      <div className="flex items-center justify-between px-1 pt-1">
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

      {/* Key Input Form & Action Bar */}
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
            placeholder={configured ? "Paste a new key to update..." : "Paste your key (AIzaSy...)"}
            className="field min-w-0 flex-1 pr-24 font-mono text-sm"
          />
          <div className="absolute right-2 flex items-center gap-1">
            {draft && (
              <button
                type="button"
                onClick={handleClear}
                aria-label="Clear text input"
                title="Clear input"
                className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 transition hover:bg-white/10 hover:text-slate-100"
              >
                <X size={15} />
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              aria-label={showKey ? "Hide API key" : "Show API key"}
              title={showKey ? "Hide key" : "Show key"}
              className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 transition hover:bg-white/10 hover:text-slate-100"
            >
              {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        {/* Action Buttons: Paste, Verify Key, Save Key */}
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <button
            type="button"
            onClick={() => void handlePaste()}
            className="btn-ghost flex items-center gap-1.5 !px-3 !py-2 text-xs text-slate-200 border border-white/10 hover:bg-white/10"
            title="Paste key from clipboard without saving yet"
          >
            <Clipboard size={14} className="text-cyan-400" />
            <span>Paste from Clipboard</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!draft.trim() || pending !== null}
              onClick={() => void handleVerify()}
              className="btn-ghost flex items-center gap-1.5 !px-3.5 !py-2 text-xs text-cyan-300 border border-cyan-400/30 hover:bg-cyan-400/10 disabled:opacity-40"
              title="Test key & discover models before saving"
            >
              {pending === "verifying" ? (
                <>
                  <Loader2 size={13} className="animate-spin" />
                  <span>Verifying...</span>
                </>
              ) : (
                <>
                  <Cpu size={13} />
                  <span>Verify Key</span>
                </>
              )}
            </button>

            <button
              type="submit"
              disabled={!draft.trim() || pending !== null}
              className="btn-primary shrink-0 !px-4 !py-2 text-xs"
            >
              {pending === "saving" ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Saving...</span>
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

      {/* Discovered Models List during Verification */}
      {verifiedModels.length > 0 && (
        <div className="rounded-xl border border-cyan-400/30 bg-cyan-400/5 p-3 text-xs">
          <p className="font-semibold text-cyan-300 mb-1">Discovered Supported Models:</p>
          <div className="flex flex-wrap gap-1.5 font-mono text-[11px]">
            {verifiedModels.map((m) => (
              <span key={m} className="rounded-md bg-slate-800/80 px-2 py-0.5 text-slate-200 border border-white/10">
                {m}
              </span>
            ))}
          </div>
        </div>
      )}

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
