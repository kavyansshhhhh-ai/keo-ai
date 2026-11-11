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
} from "@/services/modelDiscovery";

describe("modelDiscovery service", () => {
  beforeEach(() => {
    localStorage.clear();
    resetUnavailableModels();
    vi.restoreAllMocks();
  });

  it("default cached models do not contain gemini-1.5-flash", () => {
    const models = getCachedDiscoveredModels();
    expect(models).not.toContain("gemini-1.5-flash");
    expect(models).not.toContain("gemini-1.5-flash-8b");
    expect(models.length).toBeGreaterThan(0);
    expect(models).toContain("gemini-2.5-flash");
  });

  it("selectBestFlashModel selects modern flash model and rejects 1.5", () => {
    expect(selectBestFlashModel(["gemini-1.5-flash", "gemini-2.5-flash"])).toBe("gemini-2.5-flash");
    expect(selectBestFlashModel(["gemini-2.0-flash", "gemini-2.5-flash"])).toBe("gemini-2.5-flash");
    expect(selectBestFlashModel(["gemini-2.0-flash"])).toBe("gemini-2.0-flash");
    expect(selectBestFlashModel([])).toBe("gemini-2.5-flash");
  });

  it("markModelUnavailable tracks 404 models and excludes them from getAvailableModelsToTry", async () => {
    expect(isModelUnavailable("gemini-2.5-flash")).toBe(false);

    markModelUnavailable("gemini-2.5-flash");
    expect(isModelUnavailable("gemini-2.5-flash")).toBe(true);

    const available = await getAvailableModelsToTry("fake-key");
    expect(available).not.toContain("gemini-2.5-flash");
    expect(available).not.toContain("gemini-1.5-flash");
  });

  it("stored model validation clears unavailable models", () => {
    localStorage.setItem("keo_selected_gemini_model", "gemini-1.5-flash");
    // Since gemini-1.5-flash is deprecated, getStoredSelectedModel should ignore it
    expect(getStoredSelectedModel()).toBeNull();

    setStoredSelectedModel("gemini-2.5-flash");
    expect(getStoredSelectedModel()).toBe("gemini-2.5-flash");

    markModelUnavailable("gemini-2.5-flash");
    expect(getStoredSelectedModel()).toBeNull();
  });

  it("discoverGeminiModels filters out deprecated models and non-generateContent models", async () => {
    const mockApiResponse = {
      models: [
        {
          name: "models/gemini-1.5-flash",
          supportedGenerationMethods: ["generateContent", "countTokens"],
        },
        {
          name: "models/gemini-2.5-flash",
          supportedGenerationMethods: ["generateContent", "countTokens"],
        },
        {
          name: "models/text-embedding-004",
          supportedGenerationMethods: ["embedContent"],
        },
        {
          name: "models/gemini-2.0-flash",
          supportedGenerationMethods: ["generateContent"],
        },
      ],
    };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => mockApiResponse,
    } as Response);

    const discovered = await discoverGeminiModels("valid-test-key", true);

    expect(fetchSpy).toHaveBeenCalled();
    expect(discovered).not.toContain("gemini-1.5-flash");
    expect(discovered).not.toContain("text-embedding-004");
    expect(discovered).toContain("gemini-2.5-flash");
    expect(discovered).toContain("gemini-2.0-flash");
    // 2.5-flash should be prioritized first
    expect(discovered[0]).toBe("gemini-2.5-flash");
  });
});
