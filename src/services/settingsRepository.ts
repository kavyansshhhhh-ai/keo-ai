import { supabase } from "@/lib/supabase";
import { DEFAULT_SETTINGS } from "@/lib/defaults";
import type { AppSettings } from "@/types/chat";

const SETTINGS_COLUMNS = "display_name, theme, language, speak_replies, context_messages";

export async function fetchSettings(): Promise<AppSettings> {
  const { data, error } = await supabase
    .from("app_settings")
    .select(SETTINGS_COLUMNS)
    .eq("id", "default")
    .maybeSingle();
  if (error) throw new Error(`Could not load settings. ${error.message}`);
  return data ? { ...DEFAULT_SETTINGS, ...(data as AppSettings) } : DEFAULT_SETTINGS;
}

export async function saveSettings(patch: Partial<AppSettings>): Promise<void> {
  const { error } = await supabase
    .from("app_settings")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", "default");
  if (error) throw new Error(`Could not save settings. ${error.message}`);
}
