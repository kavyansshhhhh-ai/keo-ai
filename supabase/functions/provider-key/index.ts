import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const PROVIDER = "gemini";
const GEMINI_VERIFY_URL = "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function maskKey(key: string): string {
  return `••••${key.slice(-4)}`;
}

async function readSavedKey(): Promise<string | null> {
  const { data, error } = await supabase
    .from("provider_keys")
    .select("api_key")
    .eq("provider", PROVIDER)
    .maybeSingle();
  if (error) throw new Error(`Could not read the saved key: ${error.message}`);
  return (data?.api_key as string | undefined) ?? null;
}

async function verifyGeminiKey(apiKey: string): Promise<"valid" | "rejected" | "unavailable"> {
  try {
    const response = await fetch(GEMINI_VERIFY_URL, { headers: { "x-goog-api-key": apiKey } });
    if (response.ok) return "valid";
    if (response.status === 400 || response.status === 401 || response.status === 403) return "rejected";
    return "unavailable";
  } catch {
    return "unavailable";
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (req.method === "GET") {
      const saved = await readSavedKey();
      if (saved) return jsonResponse({ configured: true, source: "saved", masked: maskKey(saved) });
      const fromEnv = Deno.env.get("GEMINI_API_KEY");
      if (fromEnv) return jsonResponse({ configured: true, source: "environment", masked: maskKey(fromEnv) });
      return jsonResponse({ configured: false, source: null, masked: null });
    }

    if (req.method === "PUT") {
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return jsonResponse({ error: "Request body must be valid JSON." }, 400);
      }
      const raw = typeof body === "object" && body !== null ? (body as Record<string, unknown>).api_key : undefined;
      if (typeof raw !== "string") return jsonResponse({ error: "Enter your Gemini API key." }, 400);

      const apiKey = raw.trim();
      if (apiKey.length < 20 || apiKey.length > 200 || /\s/.test(apiKey)) {
        return jsonResponse({ error: "That does not look like a Gemini API key." }, 400);
      }

      const verdict = await verifyGeminiKey(apiKey);
      if (verdict === "rejected") {
        return jsonResponse({ error: "Google did not accept this key. Check it and try again." }, 400);
      }
      if (verdict === "unavailable") {
        return jsonResponse({ error: "Could not reach Google to verify the key. Please try again shortly." }, 503);
      }

      const { error } = await supabase
        .from("provider_keys")
        .upsert({ provider: PROVIDER, api_key: apiKey, updated_at: new Date().toISOString() });
      if (error) throw new Error(`Could not save the key: ${error.message}`);

      return jsonResponse({ configured: true, source: "saved", masked: maskKey(apiKey) });
    }

    if (req.method === "DELETE") {
      const { error } = await supabase.from("provider_keys").delete().eq("provider", PROVIDER);
      if (error) throw new Error(`Could not remove the key: ${error.message}`);
      return jsonResponse({ removed: true });
    }

    return jsonResponse({ error: "Method not allowed." }, 405);
  } catch (err) {
    console.error("provider-key failed", err);
    return jsonResponse({ error: "Something went wrong while managing the API key. Please try again." }, 500);
  }
});
