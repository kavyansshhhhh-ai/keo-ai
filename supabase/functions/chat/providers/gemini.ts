import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { AIProvider, ProviderError, StreamRequest } from "./types.ts";

const DEPRECATED_MODELS = new Set([
  "gemini-1.5-flash",
  "gemini-1.5-flash-8b",
  "gemini-1.5-flash-latest",
  "gemini-1.5-flash-001",
  "gemini-1.5-flash-002",
  "gemini-1.0-pro",
  "gemini-pro",
]);

const DEFAULT_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash"] as const;
const ATTEMPT_TIMEOUT_MS = 30_000;
const CACHE_TTL_MS = 10 * 60 * 1000;

const sessionUnavailableModels = new Set<string>();
let cachedModels: { list: string[]; timestamp: number; keyHash: string } | null = null;

async function computeKeyHash(key: string): Promise<string> {
  const clean = key.trim();
  if (!clean) return "";
  try {
    const msgUint8 = new TextEncoder().encode(clean);
    const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    let h = 0x811c9dc5;
    for (let i = 0; i < clean.length; i++) {
      h = Math.imul(h ^ clean.charCodeAt(i), 0x01000193);
    }
    return `h_${(h >>> 0).toString(16)}`;
  }
}

async function getDiscoveredModels(apiKey: string, forceRefresh = false): Promise<string[]> {
  const now = Date.now();
  const keyHash = await computeKeyHash(apiKey);
  if (!forceRefresh && cachedModels && cachedModels.keyHash === keyHash && now - cachedModels.timestamp < CACHE_TTL_MS) {
    return cachedModels.list.filter((m) => !sessionUnavailableModels.has(m));
  }

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`, {
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(6000),
    });
    if (res.ok) {
      const data = (await res.json()) as { models?: Array<{ name?: string; supportedGenerationMethods?: string[] }> };
      const valid = (data.models || [])
        .filter((m) => {
          const id = (m.name || "").replace(/^models\//, "");
          const methods = m.supportedGenerationMethods || [];
          return (
            methods.includes("generateContent") &&
            !DEPRECATED_MODELS.has(id) &&
            !id.includes("1.5-flash") &&
            !sessionUnavailableModels.has(id)
          );
        })
        .map((m) => (m.name || "").replace(/^models\//, ""));

      // Prioritize modern Flash models
      const sorted = valid.sort((a, b) => {
        const aFlash = a.includes("flash") ? 1 : 0;
        const bFlash = b.includes("flash") ? 1 : 0;
        if (aFlash !== bFlash) return bFlash - aFlash;
        if (a.includes("2.5") && !b.includes("2.5")) return -1;
        if (!a.includes("2.5") && b.includes("2.5")) return 1;
        return a.localeCompare(b);
      });

      if (sorted.length > 0) {
        cachedModels = { list: sorted, timestamp: now, keyHash };
        return sorted;
      }
    }
  } catch (err) {
    console.warn("[KEO Supabase Gemini] Model discovery failed:", err);
  }

  if (cachedModels && cachedModels.keyHash === keyHash) {
    return cachedModels.list.filter((m) => !sessionUnavailableModels.has(m));
  }

  return DEFAULT_MODELS.filter((m) => !sessionUnavailableModels.has(m));
}

const endpointFor = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`;

let cachedServiceClient: ReturnType<typeof createClient> | null = null;
function serviceClient() {
  cachedServiceClient ??= createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  return cachedServiceClient;
}

function toGeminiBody(request: StreamRequest) {
  return {
    systemInstruction: { parts: [{ text: request.systemPrompt }] },
    contents: request.messages.map((turn) => ({
      role: turn.role === "assistant" ? "model" : "user",
      parts: [{ text: turn.content }],
    })),
    generationConfig: { temperature: 0.7, maxOutputTokens: 4096, thinkingConfig: { thinkingLevel: "low" } },
  };
}

function geminiErrorMessage(body: string): string | null {
  try {
    const message = (JSON.parse(body) as { error?: { message?: unknown } }).error?.message;
    return typeof message === "string" && message ? message : null;
  } catch {
    return null;
  }
}

function classifyFailure(model: string, status: number, body: string): ProviderError {
  const reason = geminiErrorMessage(body) ?? `HTTP ${status} with no details`;
  if (status === 401 || status === 403 || (status === 400 && /api key/i.test(reason))) {
    return new ProviderError(`Gemini rejected the API key: ${reason}`, 401, false);
  }
  if (status === 404) {
    return new ProviderError(`Gemini could not find model ${model}: ${reason}`, 404, true);
  }
  if (status === 429) {
    return new ProviderError(`Gemini rate limit reached: ${reason}`, 429, true);
  }
  if (status >= 500) {
    return new ProviderError(`Gemini is temporarily unavailable: ${reason}`, 503, true);
  }
  return new ProviderError(`Gemini returned an error: ${reason}`, 502, false);
}

async function openModelStream(model: string, body: string, apiKey: string, signal: AbortSignal): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(endpointFor(model), {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body,
      signal: AbortSignal.any([signal, AbortSignal.timeout(ATTEMPT_TIMEOUT_MS)]),
    });
  } catch (err) {
    if (signal.aborted) throw err;
    throw new ProviderError(`Gemini did not respond in time (${model}).`, 503, true);
  }
  if (response.ok && response.body) return response;
  const detail = await response.text().catch(() => "");
  throw classifyFailure(model, response.status, detail);
}

async function openStream(body: string, apiKey: string, signal: AbortSignal): Promise<Response> {
  let models = await getDiscoveredModels(apiKey);
  if (models.length === 0) {
    models = await getDiscoveredModels(apiKey, true);
  }
  if (models.length === 0) {
    throw new ProviderError("No compatible or available Gemini models found for this API key.", 502, false);
  }

  const triedModels = new Set<string>();
  let refreshedDiscovery = false;
  let lastError: ProviderError | null = null;

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    if (triedModels.has(model)) continue;
    triedModels.add(model);

    try {
      return await openModelStream(model, body, apiKey, signal);
    } catch (err) {
      if (!(err instanceof ProviderError)) throw err;

      // Handle HTTP 404: quarantine model permanently and refresh discovery once to find new models
      if (err.status === 404) {
        sessionUnavailableModels.add(model);
        lastError = err;

        if (!refreshedDiscovery) {
          refreshedDiscovery = true;
          try {
            console.log(`[KEO Supabase Gemini] Model ${model} returned 404. Refreshing model discovery once...`);
            const fresh = await getDiscoveredModels(apiKey, true);
            for (const fm of fresh) {
              if (!sessionUnavailableModels.has(fm) && !triedModels.has(fm) && !models.includes(fm)) {
                models.push(fm);
              }
            }
          } catch {
            // Ignore refresh error
          }
        }
        continue;
      }

      // Do NOT treat 429, 401, 403, or network failures as model-not-found errors
      if (!err.retryable) {
        throw err;
      }
      lastError = err;
    }
  }

  throw lastError ?? new ProviderError("The AI service did not respond.", 503, true);
}

export const geminiProvider: AIProvider = {
  name: "gemini",
  model: DEFAULT_MODELS[0],
  async resolveApiKey() {
    const { data, error } = await serviceClient()
      .from("provider_keys")
      .select("api_key")
      .eq("provider", "gemini")
      .maybeSingle();
    if (error) throw new ProviderError("Could not read the saved AI key.", 503, true);
    return (data?.api_key as string | undefined) ?? Deno.env.get("GEMINI_API_KEY") ?? null;
  },
  async streamChat(request, signal) {
    const response = await openStream(JSON.stringify(toGeminiBody(request)), request.apiKey, signal);
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    return new ReadableStream<string>({
      async pull(controller) {
        try {
          const { value, done } = await reader.read();
          if (done) {
            controller.close();
            return;
          }
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            const payload = JSON.parse(line.slice(5).trim());
            if (payload?.error) {
              throw new ProviderError(`Gemini stopped the reply: ${payload.error.message ?? "unknown error"}`, 502, false);
            }
            const parts = payload?.candidates?.[0]?.content?.parts ?? [];
            const text = parts.map((p: { text?: string }) => p.text ?? "").join("");
            if (text) controller.enqueue(text);
          }
        } catch (err) {
          controller.error(err);
        }
      },
      cancel() {
        reader.cancel().catch(() => undefined);
      },
    });
  },
};
