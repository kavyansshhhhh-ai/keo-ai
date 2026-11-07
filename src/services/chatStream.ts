import { FUNCTIONS_URL, SUPABASE_ANON_KEY } from "@/lib/supabase";
import { getEffectiveApiKey } from "@/services/providerKeyService";
import type { ChatMode, Language } from "@/types/chat";

const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-1.5-flash"] as const;

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

async function streamFromGeminiDirect(
  apiKey: string,
  options: StreamOptions
): Promise<string> {
  const systemPrompt = buildSystemPrompt(options.mode, options.language);

  // Convert messages to Gemini format: user -> user, assistant -> model
  const contents = options.messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const requestBody = {
    systemInstruction: {
      parts: [{ text: systemPrompt }],
    },
    contents,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 4096,
    },
  };

  let lastError: Error | null = null;

  for (const model of GEMINI_MODELS) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify(requestBody),
        signal: options.signal,
      });

      if (response.status === 404) {
        // Try fallback model
        lastError = new Error(`Model ${model} not available on this key.`);
        continue;
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        const errorMsg =
          errorData?.error?.message ||
          `Gemini API returned HTTP ${response.status}.`;
        if (response.status === 401 || response.status === 403) {
          throw new Error(`Gemini API key is invalid or lacks permissions: ${errorMsg}`);
        }
        if (response.status === 429) {
          throw new Error("Gemini quota or rate limit reached. Please wait a moment.");
        }
        throw new Error(errorMsg);
      }

      if (!response.body) {
        throw new Error("Gemini returned an empty response stream.");
      }

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

          try {
            const parsed = JSON.parse(payload);
            if (parsed.error) {
              throw new Error(parsed.error.message || "Gemini streaming error.");
            }
            const parts = parsed?.candidates?.[0]?.content?.parts ?? [];
            for (const part of parts) {
              if (typeof part.text === "string" && part.text) {
                fullText += part.text;
                options.onText(fullText);
              }
            }
          } catch (jsonErr) {
            // Non-JSON SSE event or syntax issue
            if (jsonErr instanceof Error && jsonErr.message.includes("Gemini")) {
              throw jsonErr;
            }
          }
        }
      }

      return fullText;
    } catch (err) {
      if (options.signal.aborted) throw err;
      if (err instanceof Error && err.name === "AbortError") throw err;
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError ?? new Error("Failed to contact Gemini service.");
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

  // 1. Check if user has an effective Gemini API key configured
  const apiKey = getEffectiveApiKey();

  // If local/env Gemini key is present, call Gemini directly for lowest latency and reliable APK execution
  if (apiKey) {
    return streamFromGeminiDirect(apiKey, options);
  }

  // 2. Fall back to Supabase Edge Function if available
  if (FUNCTIONS_URL && SUPABASE_ANON_KEY) {
    try {
      return await streamFromSupabaseBackend(FUNCTIONS_URL, SUPABASE_ANON_KEY, options);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") throw err;
      throw new Error(
        `AI service unavailable: ${err instanceof Error ? err.message : String(err)}. You can also provide your own Gemini API key directly in Settings.`
      );
    }
  }

  // 3. User key not configured
  throw new Error(
    "Please add your Gemini API key in Settings to start chatting."
  );
}

export async function checkAIProvider(): Promise<{ ok: boolean; message: string }> {
  const apiKey = getEffectiveApiKey();
  if (apiKey) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash?key=${encodeURIComponent(apiKey)}`
      );
      if (res.ok) {
        return { ok: true, message: "Connected to Google Gemini (gemini-2.5-flash)" };
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
