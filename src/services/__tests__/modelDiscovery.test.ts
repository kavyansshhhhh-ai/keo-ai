import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, String(value)),
  removeItem: (key: string) => storage.delete(key),
  clear: () => storage.clear(),
};
Object.defineProperty(globalThis, "localStorage", {
  value: localStorageMock,
  writable: true,
  configurable: true,
});

import {
  discoverGeminiModels,
  getCachedDiscoveredModels,
  getStoredSelectedModel,
  setStoredSelectedModel,
  selectBestFlashModel,
  markModelUnavailable,
  isModelUnavailable,
  resetUnavailableModels,
  getAvailableModelsToTry,
  computeApiKeyHash,
  invalidateDiscoveryCache,
  SELECTED_MODEL_STORAGE,
  DISCOVERED_MODELS_STORAGE,
  DISCOVERY_CACHE_TTL_MS,
  getEffectiveModel,
} from "@/services/modelDiscovery";

describe("modelDiscovery service - Audit & Reliability Suite", () => {
  beforeEach(async () => {
    localStorage.clear();
    await invalidateDiscoveryCache();
    resetUnavailableModels();
    vi.restoreAllMocks();
  });

  it("ensures production selected-model localStorage key is keo_user_selected_model", () => {
    expect(SELECTED_MODEL_STORAGE).toBe("keo_user_selected_model");

    localStorage.setItem("keo_user_selected_model", "gemini-1.5-flash");
    // Deprecated model must be cleared and return null
    expect(getStoredSelectedModel()).toBeNull();
    expect(localStorage.getItem("keo_user_selected_model")).toBeNull();

    setStoredSelectedModel("gemini-2.5-flash");
    expect(localStorage.getItem("keo_user_selected_model")).toBe("gemini-2.5-flash");
    expect(getStoredSelectedModel()).toBe("gemini-2.5-flash");

    markModelUnavailable("gemini-2.5-flash");
    expect(getStoredSelectedModel()).toBeNull();
    expect(localStorage.getItem("keo_user_selected_model")).toBeNull();
  });

  it("never returns unverified fallback assumptions if no verified models exist", async () => {
    const fakeKey = "unverified-test-key-1234567890";
    const hash = await computeApiKeyHash(fakeKey);

    // Empty cache for this key must return empty array, NOT ["gemini-2.5-flash", "gemini-2.0-flash"]
    expect(getCachedDiscoveredModels(hash)).toEqual([]);

    // selectBestFlashModel on empty list must return empty string
    expect(selectBestFlashModel([])).toBe("");
  });

  it("selectBestFlashModel selects modern flash model and rejects deprecated models", () => {
    expect(selectBestFlashModel(["gemini-1.5-flash", "gemini-2.5-flash"])).toBe("gemini-2.5-flash");
    expect(selectBestFlashModel(["gemini-2.0-flash", "gemini-2.5-flash"])).toBe("gemini-2.5-flash");
    expect(selectBestFlashModel(["gemini-2.0-flash"])).toBe("gemini-2.0-flash");
    expect(selectBestFlashModel(["gemini-1.5-flash"])).toBe("");
  });

  it("API-key-specific caching: caches strictly by full SHA-256 key hash and isolates across keys", async () => {
    const keyA = "AIzaSyKeyA_11111111111111111111111111111";
    const keyB = "AIzaSyKeyB_22222222222222222222222222222";
    const hashA = await computeApiKeyHash(keyA);
    const hashB = await computeApiKeyHash(keyB);

    expect(hashA).toBeTruthy();
    expect(hashB).toBeTruthy();
    expect(hashA).not.toBe(hashB);

    const mockResponseA = {
      models: [
        { name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"] },
      ],
    };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => mockResponseA,
    } as Response);

    const discoveredA = await discoverGeminiModels(keyA, true);
    expect(discoveredA).toContain("gemini-2.5-flash");

    // Cache must be accessible for key A
    const cachedA = getCachedDiscoveredModels(hashA);
    expect(cachedA).toEqual(["gemini-2.5-flash"]);

    // Cache must NOT be accessible for key B
    const cachedB = getCachedDiscoveredModels(hashB);
    expect(cachedB).toEqual([]);

    fetchSpy.mockRestore();
  });

  it("API key change invalidates old cached models and in-flight discovery", async () => {
    const keyOld = "AIzaSyKeyOld_111111111111111111111111111";
    const keyNew = "AIzaSyKeyNew_222222222222222222222222222";
    const hashOld = await computeApiKeyHash(keyOld);
    const hashNew = await computeApiKeyHash(keyNew);

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        models: [{ name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"] }],
      }),
    } as Response);

    await discoverGeminiModels(keyOld, true);
    expect(getCachedDiscoveredModels(hashOld)).toEqual(["gemini-2.5-flash"]);

    // Invalidate when switching to keyNew
    await invalidateDiscoveryCache(keyNew);

    // Old cache must be removed from storage
    expect(localStorage.getItem(DISCOVERED_MODELS_STORAGE)).toBeNull();
    expect(getCachedDiscoveredModels(hashOld)).toEqual([]);
    expect(getCachedDiscoveredModels(hashNew)).toEqual([]);
  });

  it("concurrent discovery with different keys does not share promises", async () => {
    const key1 = "AIzaSyKey1_11111111111111111111111111111";
    const key2 = "AIzaSyKey2_22222222222222222222222222222";

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = String(url);
      if (urlStr.includes(encodeURIComponent(key1))) {
        return {
          ok: true,
          json: async () => ({
            models: [{ name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"] }],
          }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({
          models: [{ name: "models/gemini-2.0-flash", supportedGenerationMethods: ["generateContent"] }],
        }),
      } as Response;
    });

    const [res1, res2] = await Promise.all([
      discoverGeminiModels(key1, true),
      discoverGeminiModels(key2, true),
    ]);

    expect(res1).toContain("gemini-2.5-flash");
    expect(res2).toContain("gemini-2.0-flash");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("concurrent discovery with the same key shares the in-flight promise (deduplication)", async () => {
    const key = "AIzaSyKeySame_1111111111111111111111111111";

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 20));
      return {
        ok: true,
        json: async () => ({
          models: [{ name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"] }],
        }),
      } as Response;
    });

    const [res1, res2] = await Promise.all([
      discoverGeminiModels(key, false),
      discoverGeminiModels(key, false),
    ]);

    expect(res1).toEqual(res2);
    // Only 1 network request was initiated
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("stale cache invalidation: ignores cache older than DISCOVERY_CACHE_TTL_MS", async () => {
    const key = "AIzaSyKeyTTL_1111111111111111111111111111";
    const hash = await computeApiKeyHash(key);

    // Write a stale cache entry directly (15 minutes old, TTL is 10 min)
    const stalePayload = {
      apiKeyHash: hash,
      models: ["gemini-2.5-flash"],
      timestamp: Date.now() - (DISCOVERY_CACHE_TTL_MS + 5 * 60 * 1000),
    };
    localStorage.setItem(DISCOVERED_MODELS_STORAGE, JSON.stringify(stalePayload));

    // getCachedDiscoveredModels must reject expired cache
    const cached = getCachedDiscoveredModels(hash);
    expect(cached).toEqual([]);
  });

  it("discovery failure without a verified fallback throws clear actionable error", async () => {
    const invalidKey = "AIzaSyBadKey_999999999999999999999999999";

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: "API_KEY_INVALID" } }),
    } as Response);

    // discoverGeminiModels must throw
    await expect(discoverGeminiModels(invalidKey, true)).rejects.toThrow(/Invalid Gemini API key/);

    // getAvailableModelsToTry must throw actionable error instead of falling back to fake models
    await expect(getAvailableModelsToTry(invalidKey, true)).rejects.toThrow(
      /Unable to verify available Gemini models/
    );

    // getEffectiveModel must throw
    await expect(getEffectiveModel(invalidKey, true)).rejects.toThrow(
      /Could not determine an active Gemini model/
    );
  });

  it("markModelUnavailable tracks 404 models and excludes them from candidate models", async () => {
    const key = "AIzaSyKey404_1111111111111111111111111111";

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        models: [
          { name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"] },
          { name: "models/gemini-2.0-flash", supportedGenerationMethods: ["generateContent"] },
        ],
      }),
    } as Response);

    expect(isModelUnavailable("gemini-2.5-flash")).toBe(false);
    markModelUnavailable("gemini-2.5-flash");
    expect(isModelUnavailable("gemini-2.5-flash")).toBe(true);

    const available = await getAvailableModelsToTry(key);
    expect(available).not.toContain("gemini-2.5-flash");
    expect(available).toContain("gemini-2.0-flash");
  });
});
