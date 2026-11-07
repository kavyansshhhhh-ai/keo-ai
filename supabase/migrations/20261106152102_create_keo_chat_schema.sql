/*
# Create KEO AI chat schema

1. New Tables
- `conversations`: one row per chat thread.
  - `id` (uuid, primary key)
  - `title` (text, defaults to "New conversation")
  - `mode` (text, 'chat' or 'agent')
  - `created_at`, `updated_at` (timestamps)
- `messages`: individual user and assistant messages inside a conversation.
  - `id` (uuid, primary key)
  - `conversation_id` (uuid, deletes with its conversation)
  - `role` ('user' or 'assistant')
  - `content` (text)
  - `action` (jsonb, optional structured result of an agent command)
  - `created_at` (timestamp)
- `app_settings`: a single row holding user preferences.
  - `id` (text, primary key, always 'default')
  - `display_name`, `theme`, `language`, `speak_replies`, `context_messages`, `updated_at`

2. Security
- Row level security is enabled on all three tables.
- The app has no sign-in screen, so all data is intentionally shared with the anon role.
- Grants and policies are given to `anon` and `authenticated` only, with one policy per verb.

3. Notes
- Foreign key on messages.conversation_id uses ON DELETE CASCADE so deleting a conversation removes its messages.
- Indexes cover the most common lookups: conversation list ordering and message ordering per conversation.
*/

CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT 'New conversation',
  mode text NOT NULL DEFAULT 'chat' CHECK (mode IN ('chat', 'agent')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL DEFAULT '',
  action jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS conversations_updated_at_idx ON conversations (updated_at DESC);
CREATE INDEX IF NOT EXISTS messages_conversation_created_idx ON messages (conversation_id, created_at);

CREATE TABLE IF NOT EXISTS app_settings (
  id text PRIMARY KEY DEFAULT 'default' CHECK (id = 'default'),
  display_name text NOT NULL DEFAULT '',
  theme text NOT NULL DEFAULT 'dark' CHECK (theme IN ('dark', 'light')),
  language text NOT NULL DEFAULT 'auto' CHECK (language IN ('auto', 'en', 'hi', 'hinglish')),
  speak_replies boolean NOT NULL DEFAULT false,
  context_messages integer NOT NULL DEFAULT 20 CHECK (context_messages BETWEEN 4 AND 60),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON conversations TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON messages TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON app_settings TO anon, authenticated;

DROP POLICY IF EXISTS "anon_select_conversations" ON conversations;
CREATE POLICY "anon_select_conversations" ON conversations FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_conversations" ON conversations;
CREATE POLICY "anon_insert_conversations" ON conversations FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_conversations" ON conversations;
CREATE POLICY "anon_update_conversations" ON conversations FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_conversations" ON conversations;
CREATE POLICY "anon_delete_conversations" ON conversations FOR DELETE
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_select_messages" ON messages;
CREATE POLICY "anon_select_messages" ON messages FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_messages" ON messages;
CREATE POLICY "anon_insert_messages" ON messages FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_messages" ON messages;
CREATE POLICY "anon_update_messages" ON messages FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_messages" ON messages;
CREATE POLICY "anon_delete_messages" ON messages FOR DELETE
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_select_app_settings" ON app_settings;
CREATE POLICY "anon_select_app_settings" ON app_settings FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_app_settings" ON app_settings;
CREATE POLICY "anon_insert_app_settings" ON app_settings FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_app_settings" ON app_settings;
CREATE POLICY "anon_update_app_settings" ON app_settings FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_app_settings" ON app_settings;
CREATE POLICY "anon_delete_app_settings" ON app_settings FOR DELETE
  TO anon, authenticated USING (true);

INSERT INTO app_settings (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;
