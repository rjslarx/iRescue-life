// Shared by the project's existing Inbox provisioning and post-merge setup.
export const rescueHelpCallsSchemaSql = `
CREATE TABLE IF NOT EXISTS rescue_help_calls (
 id uuid PRIMARY KEY,
 tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 thread_id uuid NOT NULL,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 request_id uuid NOT NULL,
 account_sid text NOT NULL, from_phone text NOT NULL, staff_phone text NOT NULL, caller_phone text NOT NULL,
 staff_sid text, caller_sid text,
 status text NOT NULL DEFAULT 'starting',
 active boolean NOT NULL DEFAULT true,
 confirmed boolean NOT NULL DEFAULT false,
 prompted boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS rescue_help_calls_request ON rescue_help_calls(tenant_id,request_id);
CREATE UNIQUE INDEX IF NOT EXISTS rescue_help_calls_active ON rescue_help_calls(thread_id) WHERE active=true;
CREATE INDEX IF NOT EXISTS rescue_help_calls_tenant_created ON rescue_help_calls(tenant_id,created_at);
`;

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
${rescueHelpCallsSchemaSql}
`;
