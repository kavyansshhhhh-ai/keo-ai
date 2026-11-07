export type ChatMode = "chat" | "agent";
export type Language = "auto" | "en" | "hi" | "hinglish";
export type Theme = "dark" | "light";

export interface Conversation {
  id: string;
  title: string;
  mode: ChatMode;
  created_at: string;
  updated_at: string;
}

export type AgentActionKind =
  | "open_app"
  | "search"
  | "navigate"
  | "set_alarm"
  | "open_camera"
  | "open_settings"
  | "open_wifi_settings"
  | "open_bluetooth_settings"
  | "draft_email"
  | "prepare_whatsapp"
  | "send_whatsapp"
  | "flashlight"
  | "battery"
  | "share"
  | "install_app";

export type AgentActionStatus = "pending" | "done" | "cancelled" | "failed";

export interface AgentAction {
  kind: AgentActionKind;
  label: string;
  url?: string;
  androidIntent?: string;
  androidPackage?: string;
  torch?: boolean;
  text?: string;
  phone?: string;
  target?: string;
  requiresConfirmation: boolean;
  status: AgentActionStatus;
  detail?: string;
}

export interface ActionOutcome {
  status: AgentActionStatus;
  detail: string;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  action: AgentAction | null;
  created_at: string;
}

export interface AppSettings {
  display_name: string;
  theme: Theme;
  language: Language;
  speak_replies: boolean;
  context_messages: number;
}
