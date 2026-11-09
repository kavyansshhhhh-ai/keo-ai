export interface GeminiModelInfo {
  name: string;
  displayName: string;
  description: string;
  supportedGenerationMethods: string[];
}

const SELECTED_MODEL_STORAGE = "keo_user_selected_model";
const DISCOVERED_MODELS_STORAGE = "keo_discovered_models";

export function getStoredSelectedModel(): string | null {
  try {
    const val = localStorage.getItem(SELECTED_MODEL_STORAGE);
    return val && val.trim() ? val.trim() : null;
  } catch {
    return null;
  }
}

export function setStoredSelectedModel(model: string): void {
  try {
    localStorage.setItem(SELECTED_MODEL_STORAGE, model.trim());
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
        return parsed;
      }
    }
  } catch {
    // Ignore parse error
  }
  return ["gemini-2.5-flash", "gemini-1.5-flash"];
}

export function cacheDiscoveredModels(models: string[]): void {
  try {
    localStorage.setItem(DISCOVERED_MODELS_STORAGE, JSON.stringify(models));
  } catch (err) {
    console.warn("[KEO] Failed to cache discovered models:", err);
  }
}

/**
 * Calls official Gemini API models.list endpoint using the user's API key.
 * Discovers models actually available to that specific key supporting generateContent.
 */
export async function discoverGeminiModels(apiKey: string): Promise<string[]> {
  const cleanKey = apiKey.trim();
  if (!cleanKey) return ["gemini-2.5-flash", "gemini-1.5-flash"];

  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(cleanKey)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);

  let res: Response;
  try {
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

    // Exclude embedding, imagen, aqa, or deprecated preview models if non-stable
    const lower = modelId.toLowerCase();
    if (lower.includes("embed") || lower.includes("imagen") || lower.includes("aqa") || lower.includes("vision-001")) {
      continue;
    }

    compatibleModels.push(modelId);
  }

  if (compatibleModels.length === 0) {
    throw new Error("No Gemini models supporting text generation were found for this API key.");
  }

  // Sort/Prioritize: prefer gemini-3.8-flash, then flash models, then pro
  compatibleModels.sort((a, b) => {
    const score = (name: string) => {
      const l = name.toLowerCase();
      if (l.includes("3.8-flash") || l.includes("3-8-flash")) return 100;
      if (l.includes("2.5-flash") || l.includes("2-5-flash")) return 90;
      if (l.includes("1.5-flash")) return 80;
      if (l.includes("flash")) return 70;
      if (l.includes("pro")) return 50;
      return 10;
    };
    return score(b) - score(a);
  });

  cacheDiscoveredModels(compatibleModels);
  return compatibleModels;
}

/**
 * Selects the best supported stable Flash model automatically from discovered list,
 * preferring gemini-3.8-flash when available.
 */
export function selectBestFlashModel(models: string[]): string {
  if (!models || models.length === 0) return "gemini-2.5-flash";

  // 1. Prefer gemini-3.8-flash or similar
  const topFlash = models.find((m) => {
    const l = m.toLowerCase();
    return (l.includes("3.8-flash") || l.includes("3-8-flash") || l.includes("2.5-flash") || l.includes("1.5-flash") || l.includes("flash")) && !l.includes("exp");
  });
  if (topFlash) return topFlash;

  // 2. Any other flash
  const anyFlash = models.find((m) => m.toLowerCase().includes("flash"));
  if (anyFlash) return anyFlash;

  // 3. First available compatible model
  return models[0];
}

export async function getEffectiveModel(apiKey: string | null): Promise<string> {
  const selected = getStoredSelectedModel();
  if (selected) return selected;

  if (apiKey) {
    try {
      const discovered = await discoverGeminiModels(apiKey);
      return selectBestFlashModel(discovered);
    } catch {
      // Fallback if discovery fails offline
    }
  }

  const cached = getCachedDiscoveredModels();
  return selectBestFlashModel(cached);
}
