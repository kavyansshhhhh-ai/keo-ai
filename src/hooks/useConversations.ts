import { useCallback, useEffect, useState } from "react";
import { errorMessage } from "@/lib/errors";
import {
  deleteAllConversations,
  deleteConversation,
  listConversations,
  updateConversation,
} from "@/services/chatRepository";
import type { Conversation } from "@/types/chat";

export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setConversations(await listConversations());
      setError(null);
    } catch (err) {
      setError(errorMessage(err, "Could not load your conversations."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addLocal = useCallback((conversation: Conversation) => {
    setConversations((prev) => [conversation, ...prev.filter((c) => c.id !== conversation.id)]);
  }, []);

  const rename = useCallback(async (id: string, title: string) => {
    await updateConversation(id, { title });
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)));
  }, []);

  const remove = useCallback(async (id: string) => {
    await deleteConversation(id);
    setConversations((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const removeAll = useCallback(async () => {
    await deleteAllConversations();
    setConversations([]);
  }, []);

  return { conversations, loading, error, refresh, addLocal, rename, remove, removeAll };
}
