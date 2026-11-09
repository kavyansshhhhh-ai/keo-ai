import { FUNCTIONS_URL, SUPABASE_ANON_KEY } from "@/lib/supabase";
import { getEffectiveApiKey } from "@/services/providerKeyService";
import { getEffectiveModel, getCachedDiscoveredModels } from "@/services/modelDiscovery";
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
  auto: "Reply in the same language the user writes in. Hindi, English and Hinglish (Hindi written in Roman script) are all fully supported.",
  en: "Reply in clear, natural English.",
  hi: "Reply in Hindi (Devanagari script) unless the user explicitly asks for another language.",
  hinglish: "Reply in natural Hinglish (Hindi written in Roman English script).",
};

const BASE_PERSONA =
  "You are KEO, a premium, intelligent personal AI assistant and agent inside the KEO AI app. " +
  "Be concise, warm, knowledgeable, and precise. Use Markdown when helpful: short bullet points, tables, and fenced code blocks with language tags. " +
  "Maintain context from earlier turns to handle follow-up questions accurately.";

const AGENT_RULES =
  " You are in AGENT mode. The app has device capabilities such as opening Android apps, searching YouTube/Google, adjusting settings, and controlling the flashlight. " +
  "When the user requests an action, explain clearly what will be done. Never claim an action succeeded if it could not be performed.";

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
  const timer = setTimeout(() => controller.abort(new Error("Request timed out")), timeoutMs);

  const abortHandler = () => controller.abort(externalSignal?.reason);
  if (externalSignal) {
    if (externalSignal.aborted) {
      clearTimeout(timer);
      throw new Error("Generation cancelled by user.");
    }
    externalSignal.addEventListener("abort", abortHandler, { once: true });
  }

  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
    if (externalSignal) {
      externalSignal.removeEventListener("abort", abortHandler);
    }
  }
}

async function streamFromGeminiDirect(
  apiKey: string,
  options: StreamOptions
): Promise<string> {
  const systemPrompt = buildSystemPrompt(options.mode, options.language);

  // Dynamically determine the best effective model discovered for this user's key
  // Fast path: use cached discovered models first so chat never hangs waiting for models.list
  const cachedModels = getCachedDiscoveredModels();
  const primaryModel = await getEffectiveModel(apiKey);
  const modelsToTry = Array.from(
    new Set([
      primaryModel,
      ...cachedModels,
      "gemini-2.5-flash",
      "gemini-2.0-flash",
      "gemini-1.5-flash",
      "gemini-1.5-pro",
    ])
  );

  // Normalize turns: Google Gemini STRICTLY requires alternating user -> model -> user turns.
  // Merge consecutive same-role turns to avoid HTTP 400 "Please ensure that multiturn talk alternates between user and model".
  const normalizedContents: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> = [];
  for (const m of options.messages) {
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

  const buildBody = (includeSystemInstruction: boolean) => {
    const body: Record<string, unknown> = {
      contents: normalizedContents,
      generationConfig: { maxOutputTokens: 4096 }, // Do not include temperature to prevent 400 on newer models
    };
    if (includeSystemInstruction) {
      body.systemInstruction = { parts: [{ text: systemPrompt }] };
    }
    return body;
  };

  let lastError: Error | null = null;

  for (const model of modelsToTry) {
    if (options.signal.aborted) {
      throw new Error("Generation cancelled by user.");
    }

    // Try with system instruction first, then without if 400 is returned
    for (const withSystem of [true, false]) {
      const requestBody = buildBody(withSystem);

      try {
        const streamEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(
          apiKey
        )}`;

        let response: Response;
        try {
          response = await fetchWithTimeout(
            streamEndpoint,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify(requestBody),
            },
            12000, // 12s connection timeout
            options.signal
          );
        } catch (fetchErr) {
          if (options.signal.aborted) throw new Error("Generation cancelled by user.");
          // If streaming connection fails or times out, immediately attempt direct generateContent
          const direct = await fetchGeminiNonStreaming(apiKey, model, requestBody, options);
          if (direct.trim()) return direct;
          throw fetchErr;
        }

        if (response.status === 404) {
          lastError = new Error(`Model ${model} is not available for your Gemini key.`);
          break; // Try next model
        }

        if (response.status === 400 && withSystem) {
          const errData = await response.json().catch(() => null);
          const msg = errData?.error?.message || "";
          if (msg.toLowerCase().includes("system") || msg.toLowerCase().includes("instruction")) {
            // Model doesn't support systemInstruction field, retry with prepended system prompt
            continue;
          }
        }

        if (!response.ok) {
          const errorData = await response.json().catch(() => null);
          const errorMsg =
            errorData?.error?.message || `Google Gemini returned HTTP ${response.status}.`;
          if (response.status === 401 || response.status === 403) {
            throw new Error(
              `Gemini API key is invalid or unauthorized: ${errorMsg}. Please open Settings -> Gemini API Key to verify your key.`
            );
          }
          if (response.status === 429) {
            throw new Error(
              "Gemini quota or rate limit exceeded. Please wait a few moments and try again."
            );
          }
          if (response.status >= 500) {
            lastError = new Error(`Google Gemini server error (HTTP ${response.status}). Retrying...`);
            break;
          }
          throw new Error(errorMsg);
        }

        if (!response.body) {
          return await fetchGeminiNonStreaming(apiKey, model, requestBody, options);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let fullText = "";
        let buffer = "";

        const readWithTimeout = (timeoutMs: number) => {
          return Promise.race([
            reader.read(),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error("Stream read timeout")), timeoutMs)
            ),
          ]);
        };

        try {
          for (;;) {
            if (options.signal.aborted) throw new Error("Generation cancelled by user.");
            const { value, done } = await readWithTimeout(12000);
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
        } catch {
          // If stream read timed out or failed mid-stream, fallback to non-streaming if no text arrived
          if (!fullText.trim()) {
            return await fetchGeminiNonStreaming(apiKey, model, requestBody, options);
          }
        } finally {
          reader.releaseLock();
        }

        if (fullText.trim().length > 0) {
          return fullText;
        }

        // If stream finished with empty text, attempt non-streaming fallback
        const nonStream = await fetchGeminiNonStreaming(apiKey, model, requestBody, options);
        if (nonStream.trim()) return nonStream;
      } catch (err) {
        if (options.signal.aborted) throw err;
        if (err instanceof Error && err.name === "AbortError") throw err;
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }
  }

  throw (
    lastError ??
    new Error("Unable to get reply from Google Gemini. Please check your API key in Settings -> Gemini API Key and try again.")
  );
}

async function fetchGeminiNonStreaming(
  apiKey: string,
  model: string,
  requestBody: unknown,
  options: StreamOptions
): Promise<string> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
    apiKey
  )}`;

  const response = await fetchWithTimeout(
    endpoint,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    },
    20000, // 20s timeout
    options.signal
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    const msg = errorData?.error?.message || `Gemini API returned HTTP ${response.status}`;
    if (response.status === 400 || response.status === 401 || response.status === 403) {
      if (msg.includes("API_KEY_INVALID") || msg.toLowerCase().includes("not valid")) {
        throw new Error("Gemini API key is invalid. Please verify your key in Settings -> Gemini API Key.");
      }
    }
    throw new Error(msg);
  }

  const data = await response.json();
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  let text = "";
  for (const part of parts) {
    if (typeof part.text === "string" && !part.thought) text += part.text;
  }
  if (text) {
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
      const model = await getEffectiveModel(apiKey);
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
