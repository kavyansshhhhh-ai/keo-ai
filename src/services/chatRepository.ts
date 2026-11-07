import { supabase } from "@/lib/supabase";
import type { AgentAction, ChatMessage, ChatMode, Conversation } from "@/types/chat";

const CONVERSATION_COLUMNS = "id, title, mode, created_at, updated_at";
const MESSAGE_COLUMNS = "id, conversation_id, role, content, action, created_at";

function fail(message: string, error: { message: string } | null): void {
  if (error) throw new Error(`${message} ${error.message}`);
}

export async function listConversations(): Promise<Conversation[]> {
  const { data, error } = await supabase
    .from("conversations")
    .select(CONVERSATION_COLUMNS)
    .order("updated_at", { ascending: false })
    .limit(200);
  fail("Could not load conversations.", error);
  return (data ?? []) as Conversation[];
}

export async function createConversation(mode: ChatMode, title: string): Promise<Conversation> {
  const { data, error } = await supabase
    .from("conversations")
    .insert({ mode, title })
    .select(CONVERSATION_COLUMNS)
    .single();
  fail("Could not start a new conversation.", error);
  return data as Conversation;
}

export async function updateConversation(
  id: string,
  patch: Partial<Pick<Conversation, "title" | "mode">>,
): Promise<void> {
  const { error } = await supabase
    .from("conversations")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  fail("Could not update the conversation.", error);
}

export async function deleteConversation(id: string): Promise<void> {
  const { error } = await supabase.from("conversations").delete().eq("id", id);
  fail("Could not delete the conversation.", error);
}

export async function deleteAllConversations(): Promise<void> {
  const { error } = await supabase.from("conversations").delete().not("id", "is", null);
  fail("Could not clear chat history.", error);
}

export async function touchConversation(id: string): Promise<void> {
  const { error } = await supabase
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", id);
  fail("Could not update the conversation.", error);
}

export async function listMessages(conversationId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from("messages")
    .select(MESSAGE_COLUMNS)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  fail("Could not load messages.", error);
  return (data ?? []) as ChatMessage[];
}

export async function insertMessage(input: {
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  action?: AgentAction | null;
}): Promise<ChatMessage> {
  const { data, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: input.conversation_id,
      role: input.role,
      content: input.content,
      action: input.action ?? null,
    })
    .select(MESSAGE_COLUMNS)
    .single();
  fail("Could not save the message.", error);
  return data as ChatMessage;
}

export async function updateMessageContent(id: string, content: string): Promise<void> {
  const { error } = await supabase.from("messages").update({ content }).eq("id", id);
  fail("Could not save your edit.", error);
}

export async function updateMessageAction(id: string, action: AgentAction): Promise<void> {
  const { error } = await supabase.from("messages").update({ action }).eq("id", id);
  fail("Could not update the action.", error);
}

export async function deleteMessages(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase.from("messages").delete().in("id", ids);
  fail("Could not remove messages.", error);
}
