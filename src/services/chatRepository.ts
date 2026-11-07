import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import type { AgentAction, ChatMessage, ChatMode, Conversation } from "@/types/chat";

const CONV_STORAGE_KEY = "keo_local_conversations";
const MSG_STORAGE_PREFIX = "keo_local_messages_";

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `id_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// Local storage helpers
function getLocalConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(CONV_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalConversations(list: Conversation[]): void {
  try {
    localStorage.setItem(CONV_STORAGE_KEY, JSON.stringify(list));
  } catch (err) {
    console.warn("[KEO] Failed to save conversations locally:", err);
  }
}

function getLocalMessages(convId: string): ChatMessage[] {
  try {
    const raw = localStorage.getItem(`${MSG_STORAGE_PREFIX}${convId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalMessages(convId: string, messages: ChatMessage[]): void {
  try {
    localStorage.setItem(`${MSG_STORAGE_PREFIX}${convId}`, JSON.stringify(messages));
  } catch (err) {
    console.warn("[KEO] Failed to save messages locally:", err);
  }
}

export async function listConversations(): Promise<Conversation[]> {
  const localList = getLocalConversations();

  if (!isSupabaseConfigured || !supabase || !navigator.onLine) {
    return localList;
  }

  try {
    const { data, error } = await supabase
      .from("conversations")
      .select("id, title, mode, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(200);

    if (!error && data && data.length > 0) {
      // Merge remote with local conversations
      const mergedMap = new Map<string, Conversation>();
      for (const item of localList) mergedMap.set(item.id, item);
      for (const item of data as Conversation[]) mergedMap.set(item.id, item);
      const combined = Array.from(mergedMap.values()).sort(
        (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );
      saveLocalConversations(combined);
      return combined;
    }
  } catch (err) {
    console.warn("[KEO] Remote conversations fetch failed, using local:", err);
  }

  return localList;
}

export async function createConversation(mode: ChatMode, title: string): Promise<Conversation> {
  const now = new Date().toISOString();
  const newConv: Conversation = {
    id: generateId(),
    mode,
    title,
    created_at: now,
    updated_at: now,
  };

  const list = getLocalConversations();
  saveLocalConversations([newConv, ...list]);

  if (isSupabaseConfigured && supabase && navigator.onLine) {
    try {
      await supabase
        .from("conversations")
        .insert({ id: newConv.id, mode, title, created_at: now, updated_at: now });
    } catch (err) {
      console.warn("[KEO] Remote conversation insert failed, created locally:", err);
    }
  }

  return newConv;
}

export async function updateConversation(
  id: string,
  patch: Partial<Pick<Conversation, "title" | "mode">>,
): Promise<void> {
  const list = getLocalConversations();
  const now = new Date().toISOString();
  const updated = list.map((c) => (c.id === id ? { ...c, ...patch, updated_at: now } : c));
  saveLocalConversations(updated);

  if (isSupabaseConfigured && supabase && navigator.onLine) {
    try {
      await supabase
        .from("conversations")
        .update({ ...patch, updated_at: now })
        .eq("id", id);
    } catch (err) {
      console.warn("[KEO] Remote conversation update failed:", err);
    }
  }
}

export async function deleteConversation(id: string): Promise<void> {
  const list = getLocalConversations();
  saveLocalConversations(list.filter((c) => c.id !== id));
  try {
    localStorage.removeItem(`${MSG_STORAGE_PREFIX}${id}`);
  } catch {
    // Ignore cleanup error
  }

  if (isSupabaseConfigured && supabase && navigator.onLine) {
    try {
      await supabase.from("conversations").delete().eq("id", id);
    } catch (err) {
      console.warn("[KEO] Remote conversation delete failed:", err);
    }
  }
}

export async function deleteAllConversations(): Promise<void> {
  const list = getLocalConversations();
  for (const c of list) {
    try {
      localStorage.removeItem(`${MSG_STORAGE_PREFIX}${c.id}`);
    } catch {
      // Ignore cleanup error
    }
  }
  saveLocalConversations([]);

  if (isSupabaseConfigured && supabase && navigator.onLine) {
    try {
      await supabase.from("conversations").delete().not("id", "is", null);
    } catch (err) {
      console.warn("[KEO] Remote clear failed:", err);
    }
  }
}

export async function touchConversation(id: string): Promise<void> {
  const list = getLocalConversations();
  const now = new Date().toISOString();
  const updated = list.map((c) => (c.id === id ? { ...c, updated_at: now } : c));
  saveLocalConversations(updated);

  if (isSupabaseConfigured && supabase && navigator.onLine) {
    try {
      await supabase
        .from("conversations")
        .update({ updated_at: now })
        .eq("id", id);
    } catch {
      // Ignore background update failure
    }
  }
}

export async function listMessages(conversationId: string): Promise<ChatMessage[]> {
  const localMessages = getLocalMessages(conversationId);

  if (!isSupabaseConfigured || !supabase || !navigator.onLine) {
    return localMessages;
  }

  try {
    const { data, error } = await supabase
      .from("messages")
      .select("id, conversation_id, role, content, action, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (!error && data && data.length > 0) {
      saveLocalMessages(conversationId, data as ChatMessage[]);
      return data as ChatMessage[];
    }
  } catch (err) {
    console.warn("[KEO] Remote messages fetch failed, using local:", err);
  }

  return localMessages;
}

export async function insertMessage(input: {
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  action?: AgentAction | null;
}): Promise<ChatMessage> {
  const now = new Date().toISOString();
  const message: ChatMessage = {
    id: generateId(),
    conversation_id: input.conversation_id,
    role: input.role,
    content: input.content,
    action: input.action ?? null,
    created_at: now,
  };

  const existing = getLocalMessages(input.conversation_id);
  saveLocalMessages(input.conversation_id, [...existing, message]);

  if (isSupabaseConfigured && supabase && navigator.onLine) {
    try {
      await supabase.from("messages").insert({
        id: message.id,
        conversation_id: input.conversation_id,
        role: input.role,
        content: input.content,
        action: input.action ?? null,
        created_at: now,
      });
    } catch (err) {
      console.warn("[KEO] Remote message insert failed, saved locally:", err);
    }
  }

  return message;
}

export async function updateMessageContent(id: string, content: string): Promise<void> {
  const convList = getLocalConversations();
  for (const conv of convList) {
    const messages = getLocalMessages(conv.id);
    const target = messages.find((m) => m.id === id);
    if (target) {
      saveLocalMessages(
        conv.id,
        messages.map((m) => (m.id === id ? { ...m, content } : m))
      );
      break;
    }
  }

  if (isSupabaseConfigured && supabase && navigator.onLine) {
    try {
      await supabase.from("messages").update({ content }).eq("id", id);
    } catch (err) {
      console.warn("[KEO] Remote message edit failed:", err);
    }
  }
}

export async function updateMessageAction(id: string, action: AgentAction): Promise<void> {
  const convList = getLocalConversations();
  for (const conv of convList) {
    const messages = getLocalMessages(conv.id);
    const target = messages.find((m) => m.id === id);
    if (target) {
      saveLocalMessages(
        conv.id,
        messages.map((m) => (m.id === id ? { ...m, action } : m))
      );
      break;
    }
  }

  if (isSupabaseConfigured && supabase && navigator.onLine) {
    try {
      await supabase.from("messages").update({ action }).eq("id", id);
    } catch (err) {
      console.warn("[KEO] Remote action update failed:", err);
    }
  }
}

export async function deleteMessages(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const idSet = new Set(ids);
  const convList = getLocalConversations();
  for (const conv of convList) {
    const messages = getLocalMessages(conv.id);
    const remaining = messages.filter((m) => !idSet.has(m.id));
    if (remaining.length !== messages.length) {
      saveLocalMessages(conv.id, remaining);
    }
  }

  if (isSupabaseConfigured && supabase && navigator.onLine) {
    try {
      await supabase.from("messages").delete().in("id", ids);
    } catch (err) {
      console.warn("[KEO] Remote messages delete failed:", err);
    }
  }
}
