import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Check, Clipboard, Cpu, ExternalLink, Eye, EyeOff, KeyRound, Loader2, RefreshCw, Trash2, X } from "lucide-react";
import { errorMessage } from "@/lib/errors";
import { isNativeApp, KeoNative } from "@/services/native/keoNative";
import {
  getCachedDiscoveredModels,
  getStoredSelectedModel,
  setStoredSelectedModel,
  discoverGeminiModels,
  selectBestFlashModel,
  computeApiKeyHash,
} from "@/services/modelDiscovery";
import {
  fetchProviderKeyStatus,
  getLocalApiKey,
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
      const activeKey = getLocalApiKey();

      if (st.configured && activeKey) {
        const keyHash = await computeApiKeyHash(activeKey);
        // Load verified cached models for this specific API key
        const cached = getCachedDiscoveredModels(keyHash);
        if (cached.length > 0) {
          setAvailableModels(cached);
          const sel = getStoredSelectedModel();
          const best = selectBestFlashModel(cached);
          const validSelected = sel && cached.includes(sel) ? sel : (best || cached[0]);
          if (validSelected) {
            setSelectedModel(validSelected);
            if (sel !== validSelected) {
              setStoredSelectedModel(validSelected);
            }
          }
        } else {
          // Do not show unverified fallback models as confirmed supported models
          setAvailableModels([]);
        }

        // On opening the panel, refresh model discovery when needed (if no cache or background check)
        try {
          const fresh = await discoverGeminiModels(activeKey, false);
          if (fresh.length > 0) {
            setAvailableModels(fresh);
            const sel = getStoredSelectedModel();
            const best = selectBestFlashModel(fresh);
            const validSelected = sel && fresh.includes(sel) ? sel : (best || fresh[0]);
            if (validSelected) {
              setSelectedModel(validSelected);
              if (sel !== validSelected) {
                setStoredSelectedModel(validSelected);
              }
            }
          }
        } catch (discErr) {
          console.warn("[KEO] Discovery on settings panel open:", discErr);
        }
      } else {
        setAvailableModels([]);
      }
    } catch (err) {
      setLoadError(errorMessage(err, "Could not check the API key."));
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const autoVerifyAndSave = useCallback(
    async (rawKey: string) => {
      const apiKey = rawKey.trim();
      if (!apiKey) return;
      if (apiKey.length < 15) {
        setActionError("The entered key is too short to be a valid Gemini API key (expected ~39 characters).");
        return;
      }

      setPending("saving");
      setActionError(null);
      setSuccessMessage(null);

      if (!navigator.onLine) {
        setPending(null);
        setActionError("Network unavailable. Please check your internet connection and tap Retry.");
        return;
      }

      try {
        const nextStatus = await saveProviderKey(apiKey);
        setStatus(nextStatus);
        setDraft("");
        setShowKey(false);
        const keyHash = await computeApiKeyHash(apiKey);
        const models = getCachedDiscoveredModels(keyHash);
        setAvailableModels(models);
        const sel = getStoredSelectedModel();
        const best = selectBestFlashModel(models);
        const effectiveModel = sel || best || models[0] || "";
        if (effectiveModel) {
          setSelectedModel(effectiveModel);
        }
        setSuccessMessage(`✓ Gemini API Key verified and saved successfully! Connected to Google Gemini (${effectiveModel || "Active"}).`);
      } catch (err) {
        // Keep draft preserved so user can inspect and fix
        setDraft(apiKey);
        setActionError(errorMessage(err, "Could not verify this API key with Google."));
      } finally {
        setPending(null);
      }
    },
    []
  );

  const handlePaste = async () => {
    setPending("verifying");
    setActionError(null);
    setSuccessMessage(null);

    let pastedText = "";

    // 1. First attempt native Android ClipboardManager (always allowed without WebView prompt)
    if (isNativeApp()) {
      try {
        const res = await KeoNative.getClipboardText();
        if (res && res.text) {
          pastedText = res.text.trim();
        }
      } catch (nativeErr) {
        console.warn("[KEO] Native clipboard read error:", nativeErr);
      }
    }

    // 2. Fallback to web navigator.clipboard API
    if (!pastedText && typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.readText) {
      try {
        const webText = await navigator.clipboard.readText();
        if (webText) {
          pastedText = webText.trim();
        }
      } catch {
        // Browser clipboard permission denied or not supported
      }
    }

    if (pastedText) {
      setDraft(pastedText);
      void autoVerifyAndSave(pastedText);
      return;
    }

    setPending(null);
    setActionError("Clipboard is empty or access was denied. Please copy your key from Google AI Studio, then tap Paste.");
  };

  const handleInputPaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData("text");
    if (text) {
      const trimmed = text.trim();
      setDraft(trimmed);
      void autoVerifyAndSave(trimmed);
    }
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const val = event.target.value;
    setDraft(val);
    if (actionError) setActionError(null);

    // Auto-detect if user pasted via Gboard suggestion or long-press without firing standard paste
    const trimmed = val.trim();
    if (trimmed.length >= 35 && (trimmed.startsWith("AIza") || trimmed.includes("_"))) {
      void autoVerifyAndSave(trimmed);
    }
  };

  const handleClear = () => {
    setDraft("");
    setActionError(null);
    setSuccessMessage(null);
    setVerifiedModels([]);
  };

  const handleVerify = async () => {
    const apiKey = draft.trim();
    if (!apiKey) {
      setActionError("Please paste or enter an API key to verify.");
      return;
    }
    void autoVerifyAndSave(apiKey);
  };

  const handleSave = async (event?: FormEvent<HTMLFormElement>) => {
    if (event) event.preventDefault();
    const apiKey = draft.trim();
    if (!apiKey || pending) return;
    void autoVerifyAndSave(apiKey);
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

  const handleRecheckModels = async () => {
    if (pending) return;
    setPending("verifying");
    setActionError(null);
    setSuccessMessage(null);
    try {
      const apiKey = getLocalApiKey() || draft.trim();
      if (!apiKey) {
        setActionError("No active API key found to check models. Please enter your Gemini API key.");
        return;
      }
      const models = await discoverGeminiModels(apiKey, true);
      setAvailableModels(models);
      const sel = getStoredSelectedModel();
      const best = selectBestFlashModel(models);
      const validSelected = sel && models.includes(sel) ? sel : (best || models[0] || "");
      if (validSelected) {
        setSelectedModel(validSelected);
        if (sel !== validSelected) {
          setStoredSelectedModel(validSelected);
        }
      }
      setSuccessMessage(`✓ Discovered ${models.length} active Gemini models. Active model: ${validSelected}`);
    } catch (err) {
      setActionError(errorMessage(err, "Failed to refresh Gemini models list."));
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
              onClick={() => void handleRecheckModels()}
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
            onPaste={handleInputPaste}
            onChange={handleInputChange}
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
            disabled={pending !== null}
            className="btn-primary flex items-center gap-1.5 !px-3.5 !py-2 text-xs font-semibold shadow-md shadow-cyan-400/20"
            title="Paste key from clipboard and auto-verify and save"
          >
            <Clipboard size={14} />
            <span>Paste & Auto-Save</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!draft.trim() || pending !== null}
              onClick={() => void handleVerify()}
              className="btn-ghost flex items-center gap-1.5 !px-3.5 !py-2 text-xs text-cyan-300 border border-cyan-400/30 hover:bg-cyan-400/10 disabled:opacity-40"
              title="Verify and save entered key"
            >
              {pending === "saving" ? (
                <>
                  <Loader2 size={13} className="animate-spin" />
                  <span>Verifying & Saving...</span>
                </>
              ) : (
                <>
                  <Check size={13} />
                  <span>Verify & Save</span>
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
        <div role="alert" className="flex flex-col gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs leading-relaxed text-rose-300">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold">Verification Notice:</span>
            {draft.trim() && (
              <button
                type="button"
                onClick={() => void autoVerifyAndSave(draft.trim())}
                className="btn-primary !px-2.5 !py-1 text-[11px]"
              >
                Retry
              </button>
            )}
          </div>
          <p>{actionError}</p>
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
