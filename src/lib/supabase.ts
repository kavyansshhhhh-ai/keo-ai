import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const rawUrl = (import.meta.env.VITE_SUPABASE_URL || "").trim();
const rawKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();

/**
 * Indicates whether real, valid Supabase credentials were provided via environment variables.
 * Supabase is completely optional: when not configured, KEO AI operates seamlessly using
 * private local device storage (localStorage) and direct Google Gemini API communication.
 */
export const isSupabaseConfigured: boolean = Boolean(
  rawUrl &&
  rawKey &&
  /^https?:\/\//i.test(rawUrl)
);

export const supabaseUrl: string | null = isSupabaseConfigured ? rawUrl : null;
export const supabaseAnonKey: string | null = isSupabaseConfigured ? rawKey : null;

// Only create a real Supabase client if legitimate credentials were provided.
// Never create clients with placeholder or invented credentials.
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(rawUrl, rawKey, {
      auth: { persistSession: false },
    })
  : null;

export const FUNCTIONS_URL: string | null = isSupabaseConfigured && rawUrl
  ? `${rawUrl}/functions/v1`
  : null;

export const SUPABASE_ANON_KEY: string | null = isSupabaseConfigured ? rawKey : null;
