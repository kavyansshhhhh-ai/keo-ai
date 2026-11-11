export interface GeminiModelInfo {
  name: string;
  displayName: string;
  description: string;
  supportedGenerationMethods: string[];
}

export const SELECTED_MODEL_STORAGE = "keo_user_selected_model";
export const DISCOVERED_MODELS_STORAGE = "keo_discovered_models";

/**
 * Cache structure stored in localStorage to tie discovered models strictly to an API key hash.
 */
export interface DiscoveredCachePayload {
  apiKeyHash: string;
  models: string[];
  timestamp: number;
}

/**
 * Computes a secure one-way hash (SHA-256) of the complete API key.
 * Never stores, prints, or logs the raw API key.
 */
export async function computeApiKeyHash(apiKey: string): Promise<string> {
  const clean = apiKey.trim();
  if (!clean) return "";

  if (typeof crypto !== "undefined" && crypto.subtle && typeof crypto.subtle.digest === "function") {
    try {
      const msgUint8 = new TextEncoder().encode(clean);
      const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    } catch {
      // Fallback to pure JS 64-bit FNV-1a if subtle digest fails
    }
  }

  // Pure JS 64-bit FNV-1a non-reversible hash fallback
  let h1 = 0x811c9dc5;
  let h2 = 0x811c9dc5;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 0x01000193);
    h2 = Math.imul(h2 ^ (ch << 1), 0x01000193);
  }
  return `fnv_${(h1 >>> 0).toString(16)}_${(h2 >>> 0).toString(16)}`;
}

/**
 * Known deprecated or decommissioned models that should never be selected or used.
 */
export const DEPRECATED_MODELS = new Set<string>([
  "gemini-1.5-flash",
  "gemini-1.5-flash-8b",
  "gemini-1.5-flash-latest",
  "gemini-1.5-flash-001",
  "gemini-1.5-flash-002",
  "gemini-1.0-pro",
  "gemini-pro",
]);

/**
 * Session-level set of models that returned HTTP 404 (unavailable).
 * Cleared on page refresh or when API key is modified.
 */
const sessionUnavailableModels = new Set<string>();

export function markModelUnavailable(model: string): void {
  const clean = model.trim();
  if (!clean) return;
  sessionUnavailableModels.add(clean);
  console.warn(`[KEO Model Discovery] Marked model '${clean}' as unavailable for this session.`);

  // If the user's stored model is the one that just failed, purge it immediately
  const stored = getStoredSelectedModel();
  if (stored === clean) {
    clearStoredSelectedModel();
  }

  // Also remove it from the cached discovered models list in localStorage
  try {
    const cached = getCachedDiscoveredModels();
    const updated = cached.filter((m) => m !== clean);
    if (updated.length !== cached.length) {
      const raw = localStorage.getItem(DISCOVERED_MODELS_STORAGE);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && "apiKeyHash" in parsed) {
          cacheDiscoveredModels(parsed.apiKeyHash, updated);
        }
      }
    }
  } catch {
    // Ignore storage errors
  }
}

export function isModelUnavailable(model: string): boolean {
  const clean = model.trim();
  return sessionUnavailableModels.has(clean) || DEPRECATED_MODELS.has(clean);
}

export function resetUnavailableModels(): void {
  sessionUnavailableModels.clear();
  console.log("[KEO Model Discovery] Reset session unavailable models list.");
}

export function getStoredSelectedModel(): string | null {
  try {
    const val = localStorage.getItem(SELECTED_MODEL_STORAGE);
    if (!val || !val.trim()) return null;
    const clean = val.trim();
    if (isModelUnavailable(clean)) {
      clearStoredSelectedModel();
      return null;
    }
    return clean;
  } catch {
    return null;
  }
}

export function clearStoredSelectedModel(): void {
  try {
    localStorage.removeItem(SELECTED_MODEL_STORAGE);
    console.log("[KEO Model Discovery] Cleared stale/unavailable selected model from storage.");
  } catch (err) {
    console.warn("[KEO] Failed to clear selected model from storage:", err);
  }
}

export function setStoredSelectedModel(model: string): void {
  try {
    const clean = model.trim();
    if (!clean || isModelUnavailable(clean)) {
      clearStoredSelectedModel();
      return;
    }
    localStorage.setItem(SELECTED_MODEL_STORAGE, clean);
  } catch (err) {
    console.warn("[KEO] Failed to save selected model:", err);
  }
}

/**
 * Returns discovered models strictly matching the given API key hash.
 * If no key hash is provided or if the stored cache belongs to a different key,
 * returns an empty array. Never returns unverified fallback assumptions.
 */
export function getCachedDiscoveredModels(expectedApiKeyHash?: string): string[] {
  try {
    const raw = localStorage.getItem(DISCOVERED_MODELS_STORAGE);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && Array.isArray(parsed.models)) {
      const payload = parsed as DiscoveredCachePayload;
      if (expectedApiKeyHash && payload.apiKeyHash !== expectedApiKeyHash) {
        // Cache belongs to a different API key: do not use it
        return [];
      }
      if (payload.timestamp && Date.now() - payload.timestamp > DISCOVERY_CACHE_TTL_MS) {
        // Cache is expired: do not use it
        return [];
      }
      return payload.models
        .map((m: unknown) => (typeof m === "string" ? m.trim() : ""))
        .filter((m: string) => m && !isModelUnavailable(m));
    }

    // Legacy format migration (raw string[])
    if (Array.isArray(parsed)) {
      if (expectedApiKeyHash) {
        // Cannot verify this legacy cache belongs to this key
        return [];
      }
      return parsed
        .map((m: unknown) => (typeof m === "string" ? m.trim() : ""))
        .filter((m: string) => m && !isModelUnavailable(m));
    }
  } catch {
    // Ignore parse error
  }
  return [];
}

export function cacheDiscoveredModels(apiKeyHash: string, models: string[]): void {
  try {
    const cleanList = models
      .map((m) => m.trim())
      .filter((m) => m && !isModelUnavailable(m));
    const payload: DiscoveredCachePayload = {
      apiKeyHash,
      models: cleanList,
      timestamp: Date.now(),
    };
    localStorage.setItem(DISCOVERED_MODELS_STORAGE, JSON.stringify(payload));
    memoryCache = payload;
  } catch (err) {
    console.warn("[KEO] Failed to cache discovered models:", err);
  }
}

// In-memory discovery cache to prevent disk reads and duplicate requests
let memoryCache: DiscoveredCachePayload | null = null;
const inFlightDiscoveries = new Map<string, Promise<string[]>>();
export const DISCOVERY_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Invalidates old cached models and pending discoveries.
 * If a new API key is provided, clears cache only if the existing cache belonged to a different key.
 */
export async function invalidateDiscoveryCache(newApiKey?: string): Promise<void> {
  inFlightDiscoveries.clear();
  memoryCache = null;

  if (newApiKey) {
    const newHash = await computeApiKeyHash(newApiKey);
    const existing = localStorage.getItem(DISCOVERED_MODELS_STORAGE);
    if (existing) {
      try {
        const parsed = JSON.parse(existing) as DiscoveredCachePayload;
        if (parsed.apiKeyHash && parsed.apiKeyHash !== newHash) {
          localStorage.removeItem(DISCOVERED_MODELS_STORAGE);
          localStorage.removeItem(SELECTED_MODEL_STORAGE);
        }
      } catch {
        localStorage.removeItem(DISCOVERED_MODELS_STORAGE);
      }
    }
  } else {
    try {
      localStorage.removeItem(DISCOVERED_MODELS_STORAGE);
      localStorage.removeItem(SELECTED_MODEL_STORAGE);
    } catch {
      // Ignore
    }
  }

  resetUnavailableModels();
}

/**
 * Calls official Gemini API models.list endpoint using the user's API key.
 * Discovers models actually available to that specific key supporting generateContent.
 * Cache is strictly isolated by full API key SHA-256 hash.
 */
export async function discoverGeminiModels(apiKey: string, forceRefresh = false): Promise<string[]> {
  const cleanKey = apiKey.trim();
  if (!cleanKey) {
    throw new Error("No Gemini API key provided. Please configure your key in Settings.");
  }

  const keyHash = await computeApiKeyHash(cleanKey);
  const now = Date.now();

  // 1. Check in-memory cache for this exact key hash
  if (!forceRefresh && memoryCache && memoryCache.apiKeyHash === keyHash) {
    if (now - memoryCache.timestamp < DISCOVERY_CACHE_TTL_MS) {
      const valid = memoryCache.models.filter((m) => !isModelUnavailable(m));
      if (valid.length > 0) return valid;
    }
  }

  // 2. Check localStorage cache for this exact key hash
  if (!forceRefresh) {
    const cached = getCachedDiscoveredModels(keyHash);
    if (cached.length > 0) {
      memoryCache = { apiKeyHash: keyHash, models: cached, timestamp: now };
      return cached;
    }
  }

  // 3. Return existing in-flight promise for this exact key hash (prevent duplicate concurrent network calls)
  if (!forceRefresh && inFlightDiscoveries.has(keyHash)) {
    return inFlightDiscoveries.get(keyHash)!;
  }

  const discoveryPromise = (async () => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(cleanKey)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);

    let res: Response;
    try {
      console.log("[KEO Model Discovery] Querying official Google Gemini models.list endpoint...");
      res = await fetch(url, { method: "GET", signal: controller.signal });
    } catch (fetchErr) {
      clearTimeout(timer);
      const isAbort = controller.signal.aborted;
      const detail = isAbort
        ? "Connection to Google Gemini timed out (12s)."
        : fetchErr instanceof Error
        ? fetchErr.message
        : "Network error";

      // If we have cached models for this key, fall back gracefully to them on transient network drop
      const fallbackCached = getCachedDiscoveredModels(keyHash);
      if (fallbackCached.length > 0) {
        console.warn(`[KEO Model Discovery] Discovery fetch failed (${detail}). Using existing verified models for this key.`);
        return fallbackCached;
      }

      throw new Error(`Unable to verify available Gemini models for your API key (${detail}). Please check your internet connection.`);
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      const msg = data?.error?.message || `HTTP ${res.status}`;
      if (res.status === 400 || res.status === 401 || res.status === 403) {
        if (msg.includes("API_KEY_INVALID") || msg.toLowerCase().includes("not valid") || msg.toLowerCase().includes("invalid api key")) {
          throw new Error("Invalid Gemini API key. Google reported API_KEY_INVALID. Please get a valid key at https://aistudio.google.com/app/apikey.");
        }
        throw new Error(`Google rejected the API key: ${msg}`);
      }

      // Check for cached models on other non-auth errors
      const fallbackCached = getCachedDiscoveredModels(keyHash);
      if (fallbackCached.length > 0) {
        console.warn(`[KEO Model Discovery] HTTP error ${res.status}. Using existing verified models for this key.`);
        return fallbackCached;
      }

      throw new Error(`Gemini model discovery failed: ${msg}`);
    }

    const data = (await res.json()) as { models?: Array<{ name?: string; supportedGenerationMethods?: string[] }> };
    const rawModels = data?.models ?? [];

    const compatibleModels: string[] = [];
    for (const m of rawModels) {
      if (!m.name) continue;
      const methods = m.supportedGenerationMethods ?? [];
      const supportsGenerate = methods.includes("generateContent") || methods.includes("streamGenerateContent");
      if (!supportsGenerate) continue;

      // Clean name: "models/gemini-2.5-flash" -> "gemini-2.5-flash"
      const modelId = m.name.startsWith("models/") ? m.name.slice(7) : m.name;

      // Exclude embedding, imagen, aqa, or deprecated models
      const lower = modelId.toLowerCase();
      if (
        lower.includes("embed") ||
        lower.includes("imagen") ||
        lower.includes("aqa") ||
        lower.includes("vision-001") ||
        isModelUnavailable(modelId)
      ) {
        continue;
      }

      compatibleModels.push(modelId);
    }

    if (compatibleModels.length === 0) {
      throw new Error("No compatible Gemini text generation models were found for this API key. Check model access permissions in Google AI Studio.");
    }

    // Sort/Prioritize: modern flash first (2.5-flash, 2.0-flash, other flash), then pro
    compatibleModels.sort((a, b) => {
      const score = (name: string) => {
        const l = name.toLowerCase();
        if (l.includes("3.8-flash") || l.includes("3-8-flash")) return 100;
        if (l.includes("3.5-flash") || l.includes("3-5-flash") || l.includes("3-flash") || l.includes("3.0-flash")) return 95;
        if (l.includes("2.5-flash") || l.includes("2-5-flash")) return 90;
        if (l.includes("2.0-flash") || l.includes("2-0-flash")) return 85;
        if (l.includes("flash")) return 70;
        if (l.includes("pro")) return 50;
        return 10;
      };
      return score(b) - score(a);
    });

    cacheDiscoveredModels(keyHash, compatibleModels);
    console.log(`[KEO Model Discovery] Discovered ${compatibleModels.length} compatible models: ${compatibleModels.join(", ")}`);

    // If stored selected model is not in compatible models, clear it
    const stored = getStoredSelectedModel();
    if (stored && !compatibleModels.includes(stored)) {
      clearStoredSelectedModel();
    }

    return compatibleModels;
  })().finally(() => {
    inFlightDiscoveries.delete(keyHash);
  });

  inFlightDiscoveries.set(keyHash, discoveryPromise);
  return discoveryPromise;
}

/**
 * Selects the best supported stable Flash model automatically from discovered list.
 * Never selects deprecated models or models marked unavailable.
 * Returns empty string if no valid models exist in list.
 */
export function selectBestFlashModel(models: string[]): string {
  const validModels = (models || []).filter((m) => m && !isModelUnavailable(m));
  if (validModels.length === 0) return "";

  // 1. Strict priority: gemini-2.5-flash (fastest stable flash)
  const flash25 = validModels.find((m) => m.toLowerCase().includes("2.5-flash") && !m.toLowerCase().includes("exp"));
  if (flash25) return flash25;

  // 2. gemini-2.0-flash
  const flash20 = validModels.find((m) => m.toLowerCase().includes("2.0-flash") && !m.toLowerCase().includes("exp"));
  if (flash20) return flash20;

  // 3. Other non-experimental flash models
  const otherFlash = validModels.find((m) => m.toLowerCase().includes("flash") && !m.toLowerCase().includes("exp"));
  if (otherFlash) return otherFlash;

  // 4. Any flash model
  const anyFlash = validModels.find((m) => m.toLowerCase().includes("flash"));
  if (anyFlash) return anyFlash;

  // 5. First available compatible model
  return validModels[0];
}

/**
 * Gets the current effective model, validating stored preference against verified models for this key.
 */
export async function getEffectiveModel(apiKey: string | null, forceRefresh = false): Promise<string> {
  if (!apiKey || !apiKey.trim()) {
    throw new Error("No Gemini API key provided. Please configure your key in Settings.");
  }

  const cleanKey = apiKey.trim();
  const keyHash = await computeApiKeyHash(cleanKey);
  const cached = getCachedDiscoveredModels(keyHash);

  const selected = getStoredSelectedModel();
  if (selected && !isModelUnavailable(selected)) {
    if (cached.length === 0 || cached.includes(selected)) {
      return selected;
    }
    clearStoredSelectedModel();
  }

  // 1. Fast path: Use cached verified models if valid and not force refresh
  if (cached.length > 0 && !forceRefresh) {
    const chosen = selectBestFlashModel(cached);
    if (chosen) {
      console.log(`[KEO Model Selection] Using cached effective model: ${chosen}`);
      return chosen;
    }
  }

  // 2. Query Gemini models.list
  try {
    const discovered = await discoverGeminiModels(cleanKey, forceRefresh);
    const chosen = selectBestFlashModel(discovered);
    if (chosen) {
      console.log(`[KEO Model Selection] Using freshly discovered effective model: ${chosen}`);
      return chosen;
    }
  } catch (err) {
    if (cached.length > 0) {
      const chosen = selectBestFlashModel(cached);
      if (chosen) return chosen;
    }
    throw new Error(
      `Could not determine an active Gemini model for your API key (${err instanceof Error ? err.message : "Discovery failed"}). Please verify your key in Settings.`
    );
  }

  throw new Error("No verified Gemini models found. Please check your API key in Settings.");
}

/**
 * Returns an ordered priority list of available models to attempt for a request.
 * Excludes any model that has returned 404 in the current session.
 * Throws a clear actionable error if discovery fails and no verified fallback exists.
 */
export async function getAvailableModelsToTry(apiKey: string, forceRefresh = false): Promise<string[]> {
  const cleanKey = apiKey.trim();
  if (!cleanKey) {
    throw new Error("Gemini API key is missing. Please add your API key in Settings.");
  }

  const keyHash = await computeApiKeyHash(cleanKey);
  let list: string[] = [];

  try {
    list = await discoverGeminiModels(cleanKey, forceRefresh);
  } catch (err) {
    list = getCachedDiscoveredModels(keyHash);
    if (list.length === 0) {
      const detail = err instanceof Error ? err.message : "Network error";
      throw new Error(
        `Unable to verify available Gemini models for your API key (${detail}). Please check your network connection or verify your API key in Settings.`
      );
    }
    console.warn("[KEO Model Selection] Fresh discovery failed, using previously verified models for this key:", err);
  }

  // Filter out any models marked unavailable
  const filtered = list.filter((m) => !isModelUnavailable(m));
  if (filtered.length === 0) {
    throw new Error(
      "All discovered models for this API key returned unavailable (404). Please verify your key and model quotas in Google AI Studio."
    );
  }

  const stored = getStoredSelectedModel();
  const modelsToTry: string[] = [];

  // Put user's selected model first if valid
  if (stored && filtered.includes(stored)) {
    modelsToTry.push(stored);
  }

  // Add the best flash model
  const bestFlash = selectBestFlashModel(filtered);
  if (bestFlash && !modelsToTry.includes(bestFlash)) {
    modelsToTry.push(bestFlash);
  }

  // Add all other discovered valid models as fallbacks
  for (const m of filtered) {
    if (!modelsToTry.includes(m)) {
      modelsToTry.push(m);
    }
  }

  console.log(`[KEO Model Selection] Models to try in order: ${modelsToTry.join(", ")}`);
  return modelsToTry;
}
