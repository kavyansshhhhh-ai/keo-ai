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
 * Does NOT use any developer-owned fallback or shared key.
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
 * Uses ONLY the user's own saved key in accordance with BYOK requirements.
 */
export function getEffectiveApiKey(): string | null {
  return getLocalApiKey();
}

/**
 * Validates the Gemini API key directly against Google's Gemini models endpoint.
 */
export async function verifyGeminiKey(apiKey: string): Promise<boolean> {
  const cleanKey = apiKey.trim();
  if (!cleanKey) {
    throw new Error("Please enter a Gemini API key.");
  }
  if (cleanKey.length < 15) {
    throw new Error("The API key entered is too short to be a valid Gemini key.");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash?key=${encodeURIComponent(cleanKey)}`;
  let res: Response;
  try {
    res = await fetch(url, { method: "GET" });
  } catch {
    throw new Error("Could not reach Google's servers. Please check your internet connection.");
  }

  if (res.status === 400 || res.status === 401 || res.status === 403) {
    const data = await res.json().catch(() => null);
    const msg = data?.error?.message || "Invalid or deactivated Gemini API key.";
    throw new Error(`Google rejected the key: ${msg}`);
  }

  if (!res.ok) {
    throw new Error(`Google Gemini returned status HTTP ${res.status}.`);
  }

  return true;
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

  // Validate the key with Google Gemini API first
  await verifyGeminiKey(cleaned);

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
  } catch (err) {
    console.warn("[KEO] Failed to remove key from local device storage:", err);
  }
}
