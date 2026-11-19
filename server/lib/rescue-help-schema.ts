export const rescueHelpSchemaSql = `
CREATE TABLE IF NOT EXISTS rescue_help_settings (
 tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
 phone text UNIQUE, enabled boolean NOT NULL DEFAULT false, data jsonb NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS rescue_help_threads (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 phone text NOT NULL, status text NOT NULL DEFAULT 'waiting', topic text, foster_welcome boolean NOT NULL DEFAULT false,
 assignee_id uuid REFERENCES users(id) ON DELETE SET NULL,
 updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,phone)
);
CREATE TABLE IF NOT EXISTS rescue_help_messages (
 id uuid PRIMARY KEY, thread_id uuid NOT NULL REFERENCES rescue_help_threads(id) ON DELETE CASCADE,
 kind text NOT NULL, body text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'received',
 provider_sid text UNIQUE, request_id uuid UNIQUE, recording_sid text UNIQUE, media_count integer NOT NULL DEFAULT 0,
 author_id uuid REFERENCES users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS help_messages_thread ON rescue_help_messages(thread_id,created_at);
CREATE TABLE IF NOT EXISTS rescue_help_alerts (
 thread_id uuid NOT NULL REFERENCES rescue_help_threads(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 event_at timestamptz NOT NULL DEFAULT now(), due_at timestamptz NOT NULL DEFAULT now(),
 attempted_at timestamptz, status text NOT NULL DEFAULT 'pending',
 PRIMARY KEY(thread_id,user_id)
);
ALTER TABLE rescue_help_alerts ADD COLUMN IF NOT EXISTS reason text;
CREATE INDEX IF NOT EXISTS help_alerts_due ON rescue_help_alerts(due_at) WHERE status='pending';
CREATE TABLE IF NOT EXISTS rescue_help_events (
 sid text PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now()
);
`;
