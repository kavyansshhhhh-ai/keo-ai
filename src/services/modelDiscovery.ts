export interface GeminiModelInfo {
  name: string;
  displayName: string;
  description: string;
  supportedGenerationMethods: string[];
}

const SELECTED_MODEL_STORAGE = "keo_user_selected_model";
const DISCOVERED_MODELS_STORAGE = "keo_discovered_models";

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
      cacheDiscoveredModels(updated);
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

export function getCachedDiscoveredModels(): string[] {
  try {
    const raw = localStorage.getItem(DISCOVERED_MODELS_STORAGE);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Filter out any deprecated or session-unavailable models
        const filtered = parsed
          .map((m: unknown) => (typeof m === "string" ? m.trim() : ""))
          .filter((m: string) => m && !isModelUnavailable(m));
        if (filtered.length > 0) {
          return filtered;
        }
      }
    }
  } catch {
    // Ignore parse error
  }
  // Safe default fallback list with modern models only (no gemini-1.5-flash)
  return ["gemini-2.5-flash", "gemini-2.0-flash"];
}

export function cacheDiscoveredModels(models: string[]): void {
  try {
    const cleanList = models
      .map((m) => m.trim())
      .filter((m) => m && !isModelUnavailable(m));
    localStorage.setItem(DISCOVERED_MODELS_STORAGE, JSON.stringify(cleanList));
  } catch (err) {
    console.warn("[KEO] Failed to cache discovered models:", err);
  }
}

// In-memory discovery cache to prevent spamming Google's models.list on every message
let lastDiscoveryTime = 0;
let inFlightDiscovery: Promise<string[]> | null = null;
const DISCOVERY_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Calls official Gemini API models.list endpoint using the user's API key.
 * Discovers models actually available to that specific key supporting generateContent.
 */
export async function discoverGeminiModels(apiKey: string, forceRefresh = false): Promise<string[]> {
  const cleanKey = apiKey.trim();
  if (!cleanKey) return ["gemini-2.5-flash", "gemini-2.0-flash"];

  const now = Date.now();
  if (!forceRefresh && lastDiscoveryTime > 0 && now - lastDiscoveryTime < DISCOVERY_CACHE_TTL_MS) {
    const cached = getCachedDiscoveredModels();
    if (cached.length > 0) return cached;
  }

  if (inFlightDiscovery && !forceRefresh) {
    return inFlightDiscovery;
  }

  inFlightDiscovery = (async () => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(cleanKey)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);

    let res: Response;
    try {
      console.log("[KEO Model Discovery] Querying official Google Gemini models.list endpoint...");
      res = await fetch(url, { method: "GET", signal: controller.signal });
    } catch (fetchErr) {
      if (controller.signal.aborted) {
        throw new Error("Connection to Google Gemini timed out (12s). Check your internet connection.");
      }
      throw new Error(
        `Could not connect to Google Gemini (${fetchErr instanceof Error ? fetchErr.message : "Network error"}). Check your internet connection.`
      );
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      const msg = data?.error?.message || `HTTP ${res.status}`;
      if (res.status === 400 || res.status === 401 || res.status === 403) {
        if (msg.includes("API_KEY_INVALID") || msg.toLowerCase().includes("not valid") || msg.toLowerCase().includes("invalid api key")) {
          throw new Error("Invalid Gemini API key. Google reported API_KEY_INVALID. Please get a free key at https://aistudio.google.com/app/apikey.");
        }
        throw new Error(`Google rejected the API key: ${msg}`);
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
      throw new Error("No compatible Gemini text generation models were found for this API key.");
    }

    // Sort/Prioritize: prefer latest flash models (3.x, 2.5, 2.0), then general flash, then pro
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

    lastDiscoveryTime = Date.now();
    cacheDiscoveredModels(compatibleModels);
    console.log(`[KEO Model Discovery] Discovered ${compatibleModels.length} compatible models: ${compatibleModels.join(", ")}`);

    // If stored selected model is not in compatible models, clear it
    const stored = getStoredSelectedModel();
    if (stored && !compatibleModels.includes(stored)) {
      clearStoredSelectedModel();
    }

    return compatibleModels;
  })()
    .finally(() => {
      inFlightDiscovery = null;
    });

  return inFlightDiscovery;
}

/**
 * Selects the best supported stable Flash model automatically from discovered list.
 * Never selects deprecated models or models marked unavailable.
 */
export function selectBestFlashModel(models: string[]): string {
  const validModels = (models || []).filter((m) => m && !isModelUnavailable(m));
  if (validModels.length === 0) return "gemini-2.5-flash";

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
 * Gets the current effective model, validating stored preference against available models.
 */
export async function getEffectiveModel(apiKey: string | null, forceRefresh = false): Promise<string> {
  const cached = getCachedDiscoveredModels();

  const selected = getStoredSelectedModel();
  if (selected && !isModelUnavailable(selected)) {
    // If we have cached models, confirm that the stored model is part of it
    if (cached.length === 0 || cached.includes(selected)) {
      return selected;
    }
    // Stored model is not in cached discovered list; clear stale selection
    clearStoredSelectedModel();
  }

  // 1. Fast path: Use cached discovered models immediately if valid
  if (cached && cached.length > 0 && !forceRefresh) {
    if (apiKey) {
      // Refresh cache in background if stale without blocking current turn
      void discoverGeminiModels(apiKey).catch(() => {});
    }
    const chosen = selectBestFlashModel(cached);
    console.log(`[KEO Model Selection] Using cached effective model: ${chosen}`);
    return chosen;
  }

  // 2. Query Gemini models.list if no cache or forced refresh
  if (apiKey) {
    try {
      const discovered = await discoverGeminiModels(apiKey, forceRefresh);
      const chosen = selectBestFlashModel(discovered);
      console.log(`[KEO Model Selection] Using freshly discovered effective model: ${chosen}`);
      return chosen;
    } catch (err) {
      console.warn("[KEO Model Selection] Discovery failed, falling back to cache:", err);
    }
  }

  const fallback = selectBestFlashModel(cached);
  console.log(`[KEO Model Selection] Fallback model: ${fallback}`);
  return fallback;
}

/**
 * Returns an ordered priority list of available models to attempt for a request.
 * Excludes any model that has returned 404 in the current session.
 */
export async function getAvailableModelsToTry(apiKey: string, forceRefresh = false): Promise<string[]> {
  let list: string[] = [];

  try {
    list = await discoverGeminiModels(apiKey, forceRefresh);
  } catch {
    list = getCachedDiscoveredModels();
  }

  // Filter out any models marked unavailable
  const filtered = list.filter((m) => !isModelUnavailable(m));

  const stored = getStoredSelectedModel();
  const modelsToTry: string[] = [];

  // Put user's selected model first if valid
  if (stored && filtered.includes(stored)) {
    modelsToTry.push(stored);
  }

  // Add the best flash model
  const bestFlash = selectBestFlashModel(filtered);
  if (!modelsToTry.includes(bestFlash)) {
    modelsToTry.push(bestFlash);
  }

  // Add all other discovered valid models as fallbacks
  for (const m of filtered) {
    if (!modelsToTry.includes(m)) {
      modelsToTry.push(m);
    }
  }

  // Emergency safety default if all were filtered out
  if (modelsToTry.length === 0) {
    modelsToTry.push("gemini-2.5-flash");
  }

  console.log(`[KEO Model Selection] Models to try in order: ${modelsToTry.join(", ")}`);
  return modelsToTry;
}
