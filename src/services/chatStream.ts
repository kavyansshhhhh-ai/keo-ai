import { FUNCTIONS_URL, SUPABASE_ANON_KEY } from "@/lib/supabase";
import { getEffectiveApiKey } from "@/services/providerKeyService";
import { getStoredSelectedModel, getCachedDiscoveredModels, selectBestFlashModel } from "@/services/modelDiscovery";
import { perfTracker } from "@/services/performanceTracker";
import type { ChatMode, Language } from "@/types/chat";

export interface WireMessage {
  role: "user" | "assistant";
  content: string;
}

interface StreamOptions {
  messages: WireMessage[];
  mode: ChatMode;
  language: Language;
  signal: AbortSignal;
  onText: (fullText: string) => void;
}

const LANGUAGE_RULES: Record<string, string> = {
  auto: "Reply in the user's language (Hindi, English, Hinglish supported).",
  en: "Reply in clear English.",
  hi: "Reply in Hindi (Devanagari).",
  hinglish: "Reply in Hinglish (Roman Hindi).",
};

const BASE_PERSONA =
  "You are KEO, a fast, intelligent AI assistant. Be concise, warm, knowledgeable, and precise. Use clear Markdown when helpful.";

const AGENT_RULES =
  " AGENT MODE: You can open apps, search YouTube/Google, adjust settings, and toggle flashlight when requested.";

function buildSystemPrompt(mode: ChatMode, language: Language): string {
  const langRule = LANGUAGE_RULES[language] ?? LANGUAGE_RULES.auto;
  return `${BASE_PERSONA}${mode === "agent" ? AGENT_RULES : ""} ${langRule}`;
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
  externalSignal?: AbortSignal
): Promise<Response> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
    timer = null;
    controller.abort(new Error("Request timed out"));
  }, timeoutMs);

  const abortHandler = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    controller.abort(externalSignal?.reason ?? new Error("Generation cancelled by user."));
  };

  if (externalSignal) {
    if (externalSignal.aborted) {
      if (timer) clearTimeout(timer);
      throw new Error("Generation cancelled by user.");
    }
    externalSignal.addEventListener("abort", abortHandler, { once: true });
  }

  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } catch (err) {
    if (externalSignal?.aborted) {
      throw new Error("Generation cancelled by user.");
    }
    throw err;
  } finally {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (externalSignal) {
      externalSignal.removeEventListener("abort", abortHandler);
    }
  }
}

function readWithTimeout<T>(
  reader: ReadableStreamDefaultReader<T>,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<ReadableStreamReadResult<T>> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      timer = null;
      reject(new Error("Stream read timeout"));
    }, timeoutMs);

    const onAbort = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      reject(new Error("Generation cancelled by user."));
    };

    if (signal?.aborted) {
      onAbort();
      return;
    }

    if (signal) {
      signal.addEventListener("abort", onAbort, { once: true });
    }

    reader
      .read()
      .then((res) => {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        if (signal) {
          signal.removeEventListener("abort", onAbort);
        }
        resolve(res);
      })
      .catch((err) => {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        if (signal) {
          signal.removeEventListener("abort", onAbort);
        }
        reject(err);
      });
  });
}

async function streamFromGeminiDirect(
  apiKey: string,
  options: StreamOptions
): Promise<string> {
  const systemPrompt = buildSystemPrompt(options.mode, options.language);

  // EXTREME SPEED MODEL SELECTION:
  // Fast direct resolution: Stored preference -> Cached best flash model -> Hardcoded gemini-2.5-flash
  const cached = getCachedDiscoveredModels();
  const primaryModel = getStoredSelectedModel() || selectBestFlashModel(cached) || "gemini-2.5-flash";

  // Single fallback model if primary model fails with 404
  const modelsToTry = primaryModel === "gemini-2.5-flash"
    ? ["gemini-2.5-flash", "gemini-1.5-flash"]
    : [primaryModel, "gemini-2.5-flash", "gemini-1.5-flash"];

  // Normalize turns: Google Gemini STRICTLY requires alternating user -> model -> user turns.
  // Truncate to last 8 turns max to minimize token payload overhead
  const historySlice = options.messages.slice(-8);
  const normalizedContents: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> = [];
  for (const m of historySlice) {
    const text = m.content.trim();
    if (!text) continue;
    const role = m.role === "assistant" ? "model" : "user";
    if (normalizedContents.length === 0) {
      if (role !== "user") continue; // Never start with model turn
      normalizedContents.push({ role: "user", parts: [{ text }] });
    } else {
      const last = normalizedContents[normalizedContents.length - 1];
      if (last.role === role) {
        last.parts.push({ text });
      } else {
        normalizedContents.push({ role, parts: [{ text }] });
      }
    }
  }

  if (normalizedContents.length === 0) {
    normalizedContents.push({ role: "user", parts: [{ text: "Hello" }] });
  } else if (normalizedContents[normalizedContents.length - 1].role !== "user") {
    normalizedContents.push({ role: "user", parts: [{ text: "Please continue" }] });
  }

  const requestBody = {
    contents: normalizedContents,
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig: { maxOutputTokens: 2048 },
  };

  let lastError: Error | null = null;

  for (const model of modelsToTry) {
    if (options.signal.aborted) {
      throw new Error("Generation cancelled by user.");
    }

    perfTracker.startRequest(model);

    try {
      const streamEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(
        apiKey
      )}`;

      const response = await fetchWithTimeout(
        streamEndpoint,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        },
        8000, // 8s connection timeout for extreme responsiveness
        options.signal
      );

      if (response.status === 404) {
        lastError = new Error(`Model ${model} is unavailable.`);
        continue; // Try next fallback model
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        const errorMsg = errorData?.error?.message || `Google Gemini returned HTTP ${response.status}.`;
        if (response.status === 401 || response.status === 403) {
          throw new Error(
            `Gemini API key is invalid or unauthorized: ${errorMsg}. Check Settings -> Gemini API Key.`
          );
        }
        if (response.status === 429) {
          throw new Error("Gemini quota or rate limit exceeded. Please wait a moment.");
        }
        if (response.status === 400) {
          throw new Error(`Gemini API request error: ${errorMsg}`);
        }
        throw new Error(errorMsg);
      }

      if (!response.body) {
        if (options.signal.aborted) throw new Error("Generation cancelled by user.");
        const nonStream = await fetchGeminiNonStreaming(apiKey, model, requestBody, options);
        perfTracker.finishRequest();
        return nonStream;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let fullText = "";
      let buffer = "";

      try {
        for (;;) {
          if (options.signal.aborted) throw new Error("Generation cancelled by user.");
          const { value, done } = await readWithTimeout(reader, 10000, options.signal);
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;

            try {
              const parsed = JSON.parse(payload);
              if (parsed.error) {
                throw new Error(parsed.error.message || "Gemini streaming error.");
              }
              const candidate = parsed?.candidates?.[0];
              const parts = candidate?.content?.parts ?? [];
              for (const part of parts) {
                if (typeof part.text === "string" && part.text && !part.thought) {
                  fullText += part.text;
                  perfTracker.recordFirstToken();
                  perfTracker.recordProgress(fullText.length);
                  options.onText(fullText);
                }
              }
            } catch (jsonErr) {
              if (jsonErr instanceof Error && jsonErr.message.includes("Gemini")) {
                throw jsonErr;
              }
            }
          }
        }

        // Process final trailing buffer chunk if present
        if (buffer.trim()) {
          const rawLine = buffer.trim();
          if (rawLine.startsWith("data:")) {
            const payload = rawLine.slice(5).trim();
            if (payload && payload !== "[DONE]") {
              try {
                const parsed = JSON.parse(payload);
                const candidate = parsed?.candidates?.[0];
                const parts = candidate?.content?.parts ?? [];
                for (const part of parts) {
                  if (typeof part.text === "string" && part.text && !part.thought) {
                    fullText += part.text;
                    perfTracker.recordFirstToken();
                    perfTracker.recordProgress(fullText.length);
                    options.onText(fullText);
                  }
                }
              } catch {
                // Ignore parse errors on trailing fragment
              }
            }
          }
        }
      } catch {
        if (options.signal.aborted) {
          throw new Error("Generation cancelled by user.");
        }
        // If partial text was received before error/timeout, preserve and return it!
        if (fullText.trim()) {
          perfTracker.finishRequest();
          return fullText;
        }
        // If no text arrived and not cancelled, fallback once to non-streaming
        const nonStream = await fetchGeminiNonStreaming(apiKey, model, requestBody, options);
        perfTracker.finishRequest();
        return nonStream;
      } finally {
        try {
          reader.releaseLock();
        } catch {
          // Stream already closed
        }
      }

      if (fullText.trim().length > 0) {
        perfTracker.finishRequest();
        return fullText;
      }

      if (options.signal.aborted) throw new Error("Generation cancelled by user.");
      const nonStream = await fetchGeminiNonStreaming(apiKey, model, requestBody, options);
      perfTracker.finishRequest();
      if (nonStream.trim()) return nonStream;
    } catch (err) {
      if (options.signal.aborted) throw new Error("Generation cancelled by user.");
      if (err instanceof Error && err.name === "AbortError") throw new Error("Generation cancelled by user.");
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw (
    lastError ??
    new Error("Unable to get reply from Google Gemini. Please check your API key in Settings -> Gemini API Key.")
  );
}

async function fetchGeminiNonStreaming(
  apiKey: string,
  model: string,
  requestBody: unknown,
  options: StreamOptions
): Promise<string> {
  if (options.signal.aborted) {
    throw new Error("Generation cancelled by user.");
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
    apiKey
  )}`;

  const response = await fetchWithTimeout(
    endpoint,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    },
    15000,
    options.signal
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    const msg = errorData?.error?.message || `Gemini API returned HTTP ${response.status}`;
    throw new Error(msg);
  }

  const data = await response.json();
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  let text = "";
  for (const part of parts) {
    if (typeof part.text === "string" && !part.thought) text += part.text;
  }
  if (text) {
    perfTracker.recordFirstToken();
    perfTracker.recordProgress(text.length);
    options.onText(text);
  }
  return text;
}

async function streamFromSupabaseBackend(
  functionsUrl: string,
  anonKey: string,
  options: StreamOptions
): Promise<string> {
  const response = await fetch(`${functionsUrl}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${anonKey}`,
      apikey: anonKey,
    },
    body: JSON.stringify({
      messages: options.messages,
      mode: options.mode,
      language: options.language,
    }),
    signal: options.signal,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(errorBody?.error || `Service returned HTTP ${response.status}`);
  }

  if (!response.body) throw new Error("Empty response from AI server.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = "";
  let buffer = "";

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") return fullText;

      const parsed = JSON.parse(payload);
      if (parsed.error) throw new Error(parsed.error);
      if (parsed.text) {
        fullText += parsed.text;
        options.onText(fullText);
      }
    }
  }

  return fullText;
}

export async function streamChatReply(options: StreamOptions): Promise<string> {
  if (!navigator.onLine) {
    throw new Error("You appear to be offline. Check your internet connection and try again.");
  }

  const apiKey = getEffectiveApiKey();
  if (apiKey) {
    return streamFromGeminiDirect(apiKey, options);
  }

  if (FUNCTIONS_URL && SUPABASE_ANON_KEY) {
    try {
      return await streamFromSupabaseBackend(FUNCTIONS_URL, SUPABASE_ANON_KEY, options);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") throw err;
      throw new Error(
        `AI service unavailable: ${err instanceof Error ? err.message : String(err)}. Please add your Gemini API key in Settings -> Gemini API Key.`
      );
    }
  }

  throw new Error("Please add your Gemini API key in Settings -> Gemini API Key to start chatting.");
}

export async function checkAIProvider(): Promise<{ ok: boolean; message: string }> {
  const apiKey = getEffectiveApiKey();
  if (apiKey) {
    try {
      const model = getStoredSelectedModel() || "gemini-2.5-flash";
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}?key=${encodeURIComponent(apiKey)}`
      );
      if (res.ok) {
        return { ok: true, message: `Connected to Google Gemini (${model})` };
      }
      const data = await res.json().catch(() => null);
      return { ok: false, message: data?.error?.message || `HTTP ${res.status}` };
    } catch {
      return { ok: false, message: "Could not reach Google Gemini. Check your connection." };
    }
  }

  if (FUNCTIONS_URL && SUPABASE_ANON_KEY) {
    try {
      const res = await fetch(`${FUNCTIONS_URL}/chat`, {
        headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}`, apikey: SUPABASE_ANON_KEY },
      });
      if (res.ok) {
        const body = await res.json().catch(() => ({}));
        return { ok: true, message: `Connected to server (model: ${body.model ?? "gemini-2.5-flash"})` };
      }
      return { ok: false, message: "Backend function reachable but key not configured." };
    } catch {
      return { ok: false, message: "Backend function unreachable." };
    }
  }

  return {
    ok: false,
    message: "Please add your Gemini API key in Settings to start chatting.",
  };
}
