import { geminiProvider } from "./providers/gemini.ts";
import { AIProvider, ChatTurn, ProviderError } from "./providers/types.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const provider: AIProvider = geminiProvider;

const MAX_MESSAGES = 80;
const MAX_CONTENT_LENGTH = 20000;
const LANGUAGE_RULES: Record<string, string> = {
  auto: "Reply in the same language the user writes in. Hindi, English and Hinglish (Hindi written in Roman script) are all supported.",
  en: "Reply in clear English.",
  hi: "Reply in Hindi (Devanagari script) unless the user explicitly asks for another language.",
  hinglish: "Reply in Hinglish (Hindi written in Roman script mixed with English).",
};

const BASE_PERSONA =
  "You are KEO, a premium, intelligent personal AI assistant inside the KEO AI app. " +
  "Be warm, precise and concise. Use Markdown when it helps: short lists, tables, and fenced code blocks with a language tag. " +
  "Use the earlier conversation to understand follow-up questions. If you are unsure, say so instead of guessing.";

const AGENT_RULES =
  " You are in AGENT mode. The app can open apps, search Google or YouTube, set alarms and open settings on Android. " +
  "If the user asks you to perform a device action, explain briefly what you would do and what you need from them. " +
  "Never claim that you performed an action yourself.";

function buildSystemPrompt(mode: string, language: string): string {
  const languageRule = LANGUAGE_RULES[language] ?? LANGUAGE_RULES.auto;
  return `${BASE_PERSONA}${mode === "agent" ? AGENT_RULES : ""} ${languageRule}`;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function parseMessages(value: unknown): ChatTurn[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_MESSAGES) return null;
  const turns: ChatTurn[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const { role, content } = item as Record<string, unknown>;
    if (role !== "user" && role !== "assistant") return null;
    if (typeof content !== "string" || content.trim().length === 0) continue;
    turns.push({ role, content: content.slice(0, MAX_CONTENT_LENGTH) });
  }
  if (turns.length === 0 || turns[turns.length - 1].role !== "user") return null;
  return turns;
}

function sseEvent(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

function streamReply(textStream: ReadableStream<string>): Response {
  const encoder = new TextEncoder();
  const reader = textStream.getReader();
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await reader.read();
        if (done) {
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
          return;
        }
        controller.enqueue(encoder.encode(sseEvent({ text: value })));
      } catch (err) {
        const message = err instanceof Error ? err.message : "The AI stream was interrupted.";
        controller.enqueue(encoder.encode(sseEvent({ error: message })));
        controller.close();
      }
    },
    cancel() {
      reader.cancel().catch(() => undefined);
    },
  });
  return new Response(body, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (req.method === "GET") {
      if (!(await provider.resolveApiKey())) {
        return jsonResponse({ ok: false, provider: provider.name, error: "The AI key is not set yet. Add it in Settings." }, 503);
      }
      return jsonResponse({ ok: true, provider: provider.name, model: provider.model });
    }

    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed." }, 405);
    }

    const apiKey = await provider.resolveApiKey();
    if (!apiKey) {
      return jsonResponse({ error: "The AI key is not set yet. Add it in Settings." }, 503);
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Request body must be valid JSON." }, 400);
    }

    const turns = parseMessages(body.messages);
    if (!turns) {
      return jsonResponse({ error: "Invalid conversation. The last message must be from the user." }, 400);
    }
    const mode = body.mode === "agent" ? "agent" : "chat";
    const language = typeof body.language === "string" ? body.language : "auto";

    const textStream = await provider.streamChat(
      { apiKey, systemPrompt: buildSystemPrompt(mode, language), messages: turns },
      req.signal,
    );
    return streamReply(textStream);
  } catch (err) {
    if (err instanceof ProviderError) {
      return jsonResponse({ error: err.message }, err.status);
    }
    const message = err instanceof Error ? err.message : "Unexpected server error.";
    return jsonResponse({ error: message }, 500);
  }
});
