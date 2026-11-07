import { FUNCTIONS_URL, SUPABASE_ANON_KEY } from "@/lib/supabase";

export interface ProviderKeyStatus {
  configured: boolean;
  source: "saved" | "environment" | null;
  masked: string | null;
}

const ENDPOINT = `${FUNCTIONS_URL}/provider-key`;

async function request(method: "GET" | "PUT" | "DELETE", body?: unknown): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method,
      headers: {
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        apikey: SUPABASE_ANON_KEY,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error("Could not reach KEO's server. Check your connection and try again.");
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = (payload as { error?: unknown } | null)?.error;
    throw new Error(typeof message === "string" && message ? message : `Request failed (${response.status}).`);
  }
  return payload;
}

function isProviderKeyStatus(value: unknown): value is ProviderKeyStatus {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.configured === "boolean" && (candidate.masked === null || typeof candidate.masked === "string");
}

async function requestStatus(method: "GET" | "PUT", body?: unknown): Promise<ProviderKeyStatus> {
  const payload = await request(method, body);
  if (!isProviderKeyStatus(payload)) throw new Error("KEO's server sent an unexpected response.");
  return payload;
}

export function fetchProviderKeyStatus(): Promise<ProviderKeyStatus> {
  return requestStatus("GET");
}

export function saveProviderKey(apiKey: string): Promise<ProviderKeyStatus> {
  return requestStatus("PUT", { api_key: apiKey });
}

export async function removeProviderKey(): Promise<void> {
  await request("DELETE");
}
