export const rescueResaleSchemaSql = `
CREATE TABLE IF NOT EXISTS rescue_resale_settings (
 tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
 data jsonb NOT NULL DEFAULT '{"pickupOptions":[]}'
);
CREATE TABLE IF NOT EXISTS rescue_resale_auth (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 phone text NOT NULL, code_hash text NOT NULL, attempts integer NOT NULL DEFAULT 0,
 token_hash text UNIQUE, expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS resale_auth_phone ON rescue_resale_auth(tenant_id,phone,created_at);
CREATE TABLE IF NOT EXISTS rescue_resale_items (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 phone text NOT NULL, data jsonb NOT NULL, status text NOT NULL DEFAULT 'pending_review',
 review_note text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS resale_items_tenant ON rescue_resale_items(tenant_id,status);
CREATE TABLE IF NOT EXISTS rescue_resale_images (
 url text PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 phone text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS rescue_resale_conversations (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 item_id uuid NOT NULL REFERENCES rescue_resale_items(id) ON DELETE CASCADE,
 buyer_phone text NOT NULL, code text NOT NULL,
 offer_cents integer, offer_status text NOT NULL DEFAULT 'none', expires_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,code), UNIQUE(item_id,buyer_phone)
);
CREATE TABLE IF NOT EXISTS rescue_resale_messages (
 id uuid PRIMARY KEY, conversation_id uuid NOT NULL REFERENCES rescue_resale_conversations(id) ON DELETE CASCADE,
 sender text NOT NULL, body text NOT NULL, status text NOT NULL DEFAULT 'pending',
 provider_sid text UNIQUE, inbound_sid text UNIQUE, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS rescue_resale_orders (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 item_id uuid NOT NULL REFERENCES rescue_resale_items(id),
 buyer_phone text NOT NULL, data jsonb NOT NULL,
 status text NOT NULL DEFAULT 'checkout', session_id text UNIQUE,
 payment_intent_id text, stripe_fee_cents integer, platform_fee_cents integer,
 rescue_proceeds_cents integer, refunded_cents integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS resale_one_sale ON rescue_resale_orders(item_id)
 WHERE status IN ('checkout','paid','completed','refunded','partially_refunded');
ALTER TABLE rescue_resale_orders ADD COLUMN IF NOT EXISTS reconciled_at timestamptz;
`;
