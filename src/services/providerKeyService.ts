import { discoverGeminiModels, selectBestFlashModel, setStoredSelectedModel, resetUnavailableModels } from "@/services/modelDiscovery";

export interface ProviderKeyStatus {
  configured: boolean;
  masked: string | null;
}

const LOCAL_KEY_STORAGE = "keo_user_gemini_api_key";

function maskKey(key: string): string {
  if (key.length <= 6) return "••••••";
  return `••••••••${key.slice(-4)}`;
}

/**
 * Returns the user's saved Gemini API key stored locally in device private storage.
 */
export function getLocalApiKey(): string | null {
  try {
    const val = localStorage.getItem(LOCAL_KEY_STORAGE);
    return val && val.trim() ? val.trim() : null;
  } catch {
    return null;
  }
}

/**
 * Returns the effective API key for chat requests.
 */
export function getEffectiveApiKey(): string | null {
  return getLocalApiKey();
}

/**
 * Validates the Gemini API key directly against Google's Gemini models and discovery endpoints.
 */
export async function verifyGeminiKey(apiKey: string): Promise<string[]> {
  const cleanKey = apiKey.trim();
  if (!cleanKey) {
    throw new Error("Please enter a Gemini API key.");
  }
  if (cleanKey.length < 15) {
    throw new Error("The API key entered is too short to be a valid Gemini key.");
  }

  // Discover and filter compatible models supporting generateContent for this specific key
  const availableModels = await discoverGeminiModels(cleanKey, true);
  if (!availableModels || availableModels.length === 0) {
    throw new Error("No compatible Gemini models were found for this API key.");
  }

  return availableModels;
}

export async function fetchProviderKeyStatus(): Promise<ProviderKeyStatus> {
  const localKey = getLocalApiKey();
  if (localKey) {
    return {
      configured: true,
      masked: maskKey(localKey),
    };
  }

  return {
    configured: false,
    masked: null,
  };
}

export async function saveProviderKey(apiKey: string): Promise<ProviderKeyStatus> {
  const cleaned = apiKey.trim();

  // Reset any previous 404 blocklist for the new key
  resetUnavailableModels();

  // 1. Validate the key and discover available models specific to this key
  const discoveredModels = await verifyGeminiKey(cleaned);

  // 2. Automatically select and set the best supported stable Flash model
  const bestModel = selectBestFlashModel(discoveredModels);
  setStoredSelectedModel(bestModel);

  try {
    localStorage.setItem(LOCAL_KEY_STORAGE, cleaned);
  } catch (err) {
    console.warn("[KEO] Failed to save key in local device storage:", err);
    throw new Error("Failed to write to device local storage.");
  }

  return {
    configured: true,
    masked: maskKey(cleaned),
  };
}

export async function removeProviderKey(): Promise<void> {
  try {
    localStorage.removeItem(LOCAL_KEY_STORAGE);
    localStorage.removeItem("keo_user_selected_model");
    localStorage.removeItem("keo_discovered_models");
  } catch (err) {
    console.warn("[KEO] Failed to remove key from local device storage:", err);
  }
}
