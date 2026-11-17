export const communityResaleSchemaSql = `
CREATE TABLE IF NOT EXISTS community_resale_partners (
 tenant_id uuid PRIMARY KEY REFERENCES tenants(id),
 approved boolean NOT NULL DEFAULT false, opted_in boolean NOT NULL DEFAULT false,
 data jsonb NOT NULL DEFAULT '{}', updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS community_resale_audit (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id), actor_id text NOT NULL,
 action text NOT NULL, data jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS community_resale_auth (
 id uuid PRIMARY KEY, email text NOT NULL, code_hash text NOT NULL, attempts int NOT NULL DEFAULT 0,
 token_hash text UNIQUE, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS community_auth_email ON community_resale_auth(email,created_at);
CREATE TABLE IF NOT EXISTS community_resale_items (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id),
 seller_email text NOT NULL, data jsonb NOT NULL, version int NOT NULL DEFAULT 1,
 status text NOT NULL DEFAULT 'pending_review', review_note text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS community_items_tenant ON community_resale_items(tenant_id,status);
CREATE TABLE IF NOT EXISTS community_resale_images (
 url text PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id), seller_email text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS community_resale_orders (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id),
 item_id uuid NOT NULL REFERENCES community_resale_items(id),
 buyer_email text NOT NULL, token_hash text NOT NULL UNIQUE, data jsonb NOT NULL,
 status text NOT NULL DEFAULT 'checkout', session_id text UNIQUE, payment_intent_id text,
 stripe_fee_cents int, platform_fee_cents int, rescue_proceeds_cents int,
 refunded_cents int NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(),
 reconciled_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS community_one_sale ON community_resale_orders(item_id)
 WHERE status IN ('checkout','paid','completed','refunded','partially_refunded');
CREATE TABLE IF NOT EXISTS community_resale_splits (
 order_id uuid PRIMARY KEY REFERENCES community_resale_orders(id),
 tenant_id uuid NOT NULL REFERENCES tenants(id), status text NOT NULL DEFAULT 'awaiting_pickup',
 data jsonb NOT NULL DEFAULT '{}', updated_at timestamptz NOT NULL DEFAULT now()
);
`;
