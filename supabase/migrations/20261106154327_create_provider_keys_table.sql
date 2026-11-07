/*
# Create secure provider key storage

1. New Tables
- `provider_keys`: stores API keys the owner enters in the app settings.
  - `provider` (text, primary key, e.g. 'gemini')
  - `api_key` (text, not null)
  - `updated_at` (timestamp)

2. Security
- Row level security is enabled and NO policies are created for `anon` or `authenticated`,
  so the browser can never read, write or list saved keys.
- Only the server-side key function (service role) is granted access.

3. Notes
- Saved keys take precedence over the server environment key when both exist.
- Keys are never returned to the browser; the app only receives a masked suffix.
*/

CREATE TABLE IF NOT EXISTS provider_keys (
  provider text PRIMARY KEY CHECK (provider IN ('gemini')),
  api_key text NOT NULL CHECK (char_length(api_key) BETWEEN 20 AND 200),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE provider_keys ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON provider_keys FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON provider_keys TO service_role;
