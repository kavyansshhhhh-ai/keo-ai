import { useEffect, useRef, useState } from "react";
import { errorMessage } from "@/lib/errors";
import { cancelAction, confirmAction, planAgentTurn } from "@/services/agent/agentExecutor";
import {
  createConversation,
  deleteMessages,
  insertMessage,
  listMessages,
  touchConversation,
  updateConversation,
  updateMessageAction,
  updateMessageContent,
} from "@/services/chatRepository";
import { streamChatReply } from "@/services/chatStream";
import { speakReply } from "@/services/voice";
import type { AgentAction, ChatMessage, ChatMode, Conversation, Language } from "@/types/chat";

export interface ThreadError {
  message: string;
  retry: (() => void) | null;
}

interface ThreadOptions {
  conversationId: string | null;
  mode: ChatMode;
  language: Language;
  contextMessages: number;
  speakReplies: boolean;
  onActivate: (conversation: Conversation) => void;
  onChanged: () => void;
}

const DEFAULT_TITLE = "New conversation";

function deriveTitle(text: string): string {
  const single = text.replace(/\s+/g, " ").trim();
  return single.length > 48 ? `${single.slice(0, 45)}...` : single;
}

function lastAssistantIndex(list: ChatMessage[]): number {
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i].role === "assistant") return i;
  }
  return -1;
}

export function useChatThread(options: ThreadOptions) {
  const { conversationId, mode, language, contextMessages, speakReplies, onActivate, onChanged } = options;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [error, setError] = useState<ThreadError | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const activeIdRef = useRef<string | null>(conversationId);
  const busyRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const skipLoadRef = useRef<string | null>(null);

  // RAF UI batching refs for smooth 30-60 FPS streaming without render lag
  const rafIdRef = useRef<number | null>(null);
  const latestTextRef = useRef<string>("");
  const isFirstTokenRef = useRef<boolean>(true);

  const cancelPendingBatch = () => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
  };

  useEffect(() => {
    activeIdRef.current = conversationId;
    cancelPendingBatch();
    latestTextRef.current = "";
    isFirstTokenRef.current = true;

    if (conversationId !== null && skipLoadRef.current === conversationId) {
      skipLoadRef.current = null;
      return;
    }
    setMessages([]);
    setError(null);
    setStreamingText(null);
    if (!conversationId) return;

    let cancelled = false;
    setLoading(true);
    listMessages(conversationId)
      .then((rows) => {
        if (!cancelled) setMessages(rows);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError({
            message: errorMessage(err, "Could not load this conversation."),
            retry: () => setReloadKey((key) => key + 1),
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      cancelPendingBatch();
      if (conversationId && activeIdRef.current && activeIdRef.current !== conversationId) {
        abortRef.current?.abort();
      }
    };
  }, [conversationId, reloadKey]);

  async function exclusive<T>(task: () => Promise<T>): Promise<T | undefined> {
    if (busyRef.current) return undefined;
    busyRef.current = true;
    setBusy(true);
    try {
      return await task();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function append(conv: string, message: ChatMessage) {
    if (activeIdRef.current === conv) setMessages((prev) => [...prev, message]);
  }

  async function generate(conv: string, history: ChatMessage[]): Promise<void> {
    const controller = new AbortController();
    abortRef.current = controller;
    const isActive = () => activeIdRef.current === conv;

    const wire = history
      .filter((m) => m.content.trim().length > 0)
      .slice(-contextMessages)
      .map((m) => ({ role: m.role, content: m.content }));
    while (wire.length > 0 && wire[0].role === "assistant") wire.shift();

    setError(null);
    setStreamingText("");
    latestTextRef.current = "";
    isFirstTokenRef.current = true;
    cancelPendingBatch();

    try {
      const reply = await streamChatReply({
        messages: wire,
        mode,
        language,
        signal: controller.signal,
        onText: (text) => {
          if (!isActive()) return;
          latestTextRef.current = text;

          // Zero-delay instant flush for the very first token to minimize TTFT
          if (isFirstTokenRef.current) {
            isFirstTokenRef.current = false;
            cancelPendingBatch();
            setStreamingText(text);
            return;
          }

          // RAF Batching for subsequent tokens (30-60 FPS UI rendering)
          if (rafIdRef.current === null) {
            rafIdRef.current = requestAnimationFrame(() => {
              rafIdRef.current = null;
              if (isActive()) {
                setStreamingText(latestTextRef.current);
              }
            });
          }
        },
      });

      cancelPendingBatch();
      const content = (reply || latestTextRef.current || "").trim();

      if (content) {
        const saved = await insertMessage({ conversation_id: conv, role: "assistant", content });
        if (isActive()) {
          setMessages((prev) => [...prev, saved]);
          setStreamingText(null);
        }
        if (speakReplies && !controller.signal.aborted) speakReply(content, language);
      } else if (!controller.signal.aborted) {
        throw new Error("The AI sent an empty response. Please check your Gemini API key in Settings and try again.");
      }
      await touchConversation(conv);
      onChanged();
    } catch (err) {
      cancelPendingBatch();
      if (isActive()) {
        const isAbort = controller.signal.aborted || (err instanceof Error && err.name === "AbortError");
        if (!isAbort) {
          setError({
            message: errorMessage(err, "The AI could not reply."),
            retry: () => void exclusive(() => generate(conv, history)),
          });
        }
      }
    } finally {
      cancelPendingBatch();
      if (abortRef.current === controller) abortRef.current = null;
      if (isActive()) setStreamingText(null);
    }
  }

  async function send(raw: string): Promise<boolean> {
    const text = raw.trim();
    if (!text || busyRef.current) return false;

    const result = await exclusive(async () => {
      const plan = mode === "agent" ? await planAgentTurn(text) : null;
      setError(null);
      let conv = conversationId;
      let history = messages;

      try {
        if (!conv) {
          const created = await createConversation(mode, DEFAULT_TITLE);
          conv = created.id;
          history = [];
          skipLoadRef.current = conv;
          activeIdRef.current = conv;
          onActivate(created);
        }

        const userMessage = await insertMessage({ conversation_id: conv, role: "user", content: text });
        if (history.length === 0) await updateConversation(conv, { title: deriveTitle(text) });
        append(conv, userMessage);

        if (plan && plan.type !== "ai") {
          if (plan.type === "multi_action") {
            for (const act of plan.actions) {
              const reply = await insertMessage({
                conversation_id: conv,
                role: "assistant",
                content: act.label,
                action: act,
              });
              append(conv, reply);
            }
          } else {
            const reply = await insertMessage({
              conversation_id: conv,
              role: "assistant",
              content: plan.type === "reply" ? plan.content : plan.action.label,
              action: plan.type === "action" ? plan.action : null,
            });
            append(conv, reply);
          }
          await touchConversation(conv);
          onChanged();
          return true;
        }

        await generate(conv, [...history, userMessage]);
        return true;
      } catch (err) {
        setError({ message: errorMessage(err, "Your message could not be sent."), retry: null });
        return false;
      }
    });

    return result ?? false;
  }

  function regenerate(): void {
    if (!conversationId || busyRef.current) return;
    const index = lastAssistantIndex(messages);
    if (index < 1 || messages[index - 1].role !== "user" || messages[index].action) return;
    const target = messages[index];
    const conv = conversationId;
    const history = messages.slice(0, index);

    void exclusive(async () => {
      try {
        await deleteMessages([target.id]);
      } catch (err) {
        setError({ message: errorMessage(err), retry: null });
        return;
      }
      if (activeIdRef.current === conv) setMessages(history);
      await generate(conv, history);
    });
  }

  function editAndResend(message: ChatMessage, nextContent: string): void {
    const text = nextContent.trim();
    const conv = conversationId;
    const index = messages.findIndex((m) => m.id === message.id);
    if (!conv || !text || index < 0 || busyRef.current) return;

    const removedIds = messages.slice(index + 1).map((m) => m.id);
    const edited: ChatMessage = { ...messages[index], content: text };
    const history = [...messages.slice(0, index), edited];

    void exclusive(async () => {
      try {
        await updateMessageContent(edited.id, text);
        await deleteMessages(removedIds);
      } catch (err) {
        setError({ message: errorMessage(err), retry: null });
        return;
      }
      if (activeIdRef.current === conv) setMessages(history);
      await generate(conv, history);
    });
  }

  async function transformAction(
    message: ChatMessage,
    transform: (action: AgentAction) => Promise<AgentAction>,
  ): Promise<void> {
    if (!message.action) return;
    const next = await transform(message.action);
    setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, action: next } : m)));
    try {
      await updateMessageAction(message.id, next);
    } catch (err) {
      setError({ message: errorMessage(err), retry: null });
    }
  }

  return {
    messages,
    loading,
    busy,
    streamingText,
    error,
    send,
    stop: () => {
      cancelPendingBatch();
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
      setStreamingText(null);
      busyRef.current = false;
      setBusy(false);
    },
    regenerate,
    editAndResend,
    confirmActionCard: (message: ChatMessage) => void exclusive(() => transformAction(message, confirmAction)),
    cancelActionCard: (message: ChatMessage) => void exclusive(() => transformAction(message, cancelAction)),
    dismissError: () => setError(null),
  };
}

export type ChatThreadState = ReturnType<typeof useChatThread>;
