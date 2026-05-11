-- Migration: VIP Monthly Donor Club
-- Adds tier definitions table and VIP-related fields on subscriptions

CREATE TABLE IF NOT EXISTS monthly_giving_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  tier_name text NOT NULL,
  amount integer NOT NULL,
  tangible_impact text NOT NULL,
  icon_name text NOT NULL DEFAULT 'heart',
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_monthly_giving_tiers_tenant
  ON monthly_giving_tiers(tenant_id);

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS vip_tier_id_snapshot uuid;

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS vip_tier_name_snapshot text;

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS display_on_wall_of_heroes boolean NOT NULL DEFAULT false;

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS first_name_display text;

CREATE INDEX IF NOT EXISTS idx_subscriptions_vip_tier_snapshot
  ON subscriptions(vip_tier_id_snapshot)
  WHERE vip_tier_id_snapshot IS NOT NULL;
