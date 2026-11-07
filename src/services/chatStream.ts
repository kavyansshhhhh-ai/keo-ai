import { FUNCTIONS_URL, SUPABASE_ANON_KEY } from "@/lib/supabase";
import type { ChatMode, Language } from "@/types/chat";

const REQUEST_TIMEOUT_MS = 90_000;

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

function linkSignals(outer: AbortSignal, timeoutMs: number): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const abort = () => controller.abort();
  outer.addEventListener("abort", abort);
  const timer = setTimeout(abort, timeoutMs);
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      outer.removeEventListener("abort", abort);
    },
  };
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown; message?: unknown };
    if (typeof body.error === "string" && body.error) return body.error;
    if (typeof body.message === "string" && body.message) return `${body.message} (HTTP ${response.status})`;
  } catch {
    // Body was not JSON; fall through to the status-based message.
  }
  return `The AI service returned an error (HTTP ${response.status}) with no details.`;
}

export async function streamChatReply(options: StreamOptions): Promise<string> {
  const { signal, cleanup } = linkSignals(options.signal, REQUEST_TIMEOUT_MS);
  let fullText = "";
  try {
    let response: Response;
    try {
      response = await fetch(`${FUNCTIONS_URL}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          messages: options.messages,
          mode: options.mode,
          language: options.language,
        }),
        signal,
      });
    } catch (err) {
      if (options.signal.aborted) throw err;
      throw new Error("Network connection lost. Check your internet connection and try again.");
    }

    if (!response.ok) throw new Error(await readErrorMessage(response));
    if (!response.body) throw new Error("The AI service sent an empty response.");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
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
        const parsed = JSON.parse(payload) as { text?: unknown; error?: unknown };
        if (typeof parsed.error === "string") throw new Error(parsed.error);
        if (typeof parsed.text === "string") {
          fullText += parsed.text;
          options.onText(fullText);
        }
      }
    }
    return fullText;
  } catch (err) {
    if (options.signal.aborted) return fullText;
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("The AI took too long to respond. Please try again.");
    }
    throw err instanceof Error ? err : new Error("Something went wrong while contacting the AI.");
  } finally {
    cleanup();
  }
}

export async function checkAIProvider(): Promise<{ ok: boolean; message: string }> {
  try {
    const response = await fetch(`${FUNCTIONS_URL}/chat`, {
      headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}`, apikey: SUPABASE_ANON_KEY },
    });
    if (response.ok) {
      const body = (await response.json()) as { model?: string };
      return { ok: true, message: `Connected. Model: ${body.model ?? "unknown"}` };
    }
    return { ok: false, message: await readErrorMessage(response) };
  } catch {
    return { ok: false, message: "Could not reach the AI service. Check your connection." };
  }
}
