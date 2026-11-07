import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { AIProvider, ProviderError, StreamRequest } from "./types.ts";

const MODELS = ["gemini-3.8-flash", "gemini-3.6-flash"] as const;
const ATTEMPT_TIMEOUT_MS = 30_000;

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
    return new ProviderError(`Gemini could not find model ${model}: ${reason}`, 502, true);
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
  let lastError: ProviderError | null = null;
  for (const model of MODELS) {
    try {
      return await openModelStream(model, body, apiKey, signal);
    } catch (err) {
      if (!(err instanceof ProviderError) || !err.retryable) throw err;
      lastError = err;
    }
  }
  throw lastError ?? new ProviderError("The AI service did not respond.", 503, true);
}

export const geminiProvider: AIProvider = {
  name: "gemini",
  model: MODELS[0],
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
