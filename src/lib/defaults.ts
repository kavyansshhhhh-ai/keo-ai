import type { AppSettings } from "@/types/chat";

export const DEFAULT_SETTINGS: AppSettings = {
  display_name: "",
  theme: "dark",
  language: "auto",
  speak_replies: false,
  context_messages: 20,
};

export const APP_VERSION = "1.0.0";
