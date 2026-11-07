import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { DEFAULT_SETTINGS } from "@/lib/defaults";
import type { AppSettings } from "@/types/chat";

const SETTINGS_COLUMNS = "display_name, theme, language, speak_replies, context_messages";
const LOCAL_STORAGE_KEY = "keo_app_settings";

function readLocalSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    }
  } catch (err) {
    console.warn("[KEO] Failed to read local settings:", err);
  }
  return DEFAULT_SETTINGS;
}

function writeLocalSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(settings));
  } catch (err) {
    console.warn("[KEO] Failed to write local settings:", err);
  }
}

export async function fetchSettings(): Promise<AppSettings> {
  const local = readLocalSettings();
  if (!isSupabaseConfigured || !supabase || !navigator.onLine) {
    return local;
  }

  try {
    const { data, error } = await supabase
      .from("app_settings")
      .select(SETTINGS_COLUMNS)
      .eq("id", "default")
      .maybeSingle();

    if (!error && data) {
      const merged = { ...DEFAULT_SETTINGS, ...(data as AppSettings) };
      writeLocalSettings(merged);
      return merged;
    }
  } catch (err) {
    console.warn("[KEO] Remote settings fetch failed, using local storage:", err);
  }
  return local;
}

export async function saveSettings(patch: Partial<AppSettings>): Promise<void> {
  const current = readLocalSettings();
  const next = { ...current, ...patch };
  writeLocalSettings(next);

  if (isSupabaseConfigured && supabase && navigator.onLine) {
    try {
      await supabase
        .from("app_settings")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", "default");
    } catch (err) {
      console.warn("[KEO] Remote settings update failed, saved locally:", err);
    }
  }
}
