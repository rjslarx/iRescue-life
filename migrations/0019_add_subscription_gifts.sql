-- Task #197: VIP Tribute & Honor Gifting.
-- A `subscription_gifts` row is written for each "Gift this membership"
-- checkout (detected via Stripe metadata.gift='true' on the shared
-- checkout.session.completed webhook). The gifter is the donor on the
-- parent `subscriptions` row; the honoree fields live here. A daily
-- scheduled job sends the tasteful announcement email on
-- `announcement_date` (never reveals the dollar amount) and stamps
-- `announcement_sent_at` to dedupe.

CREATE TABLE IF NOT EXISTS subscription_gifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  honoree_name text NOT NULL,
  honoree_email text,
  gift_message text,
  announcement_date timestamp NOT NULL,
  announcement_sent_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT subscription_gifts_subscription_id_unique UNIQUE (subscription_id)
);

CREATE INDEX IF NOT EXISTS subscription_gifts_tenant_idx
  ON subscription_gifts(tenant_id);

-- Index used by the daily announcement scheduler. We only fetch rows that
-- haven't been sent yet AND are due, so a partial index keeps it tiny.
CREATE INDEX IF NOT EXISTS subscription_gifts_pending_announcements_idx
  ON subscription_gifts(announcement_date)
  WHERE announcement_sent_at IS NULL AND honoree_email IS NOT NULL;
