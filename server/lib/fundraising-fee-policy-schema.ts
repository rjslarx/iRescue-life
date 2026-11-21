export const fundraisingFeePolicySql = `
ALTER TABLE fundraiser_events ADD COLUMN IF NOT EXISTS fee_policy text;
ALTER TABLE expense_campaigns ADD COLUMN IF NOT EXISTS fee_policy text NOT NULL DEFAULT 'optional';
ALTER TABLE event_tickets ADD COLUMN IF NOT EXISTS fee_policy text NOT NULL DEFAULT 'optional';
ALTER TABLE peer_campaigns ADD COLUMN IF NOT EXISTS fee_policy text NOT NULL DEFAULT 'optional';
ALTER TABLE fundraiser_orders ADD COLUMN IF NOT EXISTS fee_policy text;
ALTER TABLE fundraiser_orders ADD COLUMN IF NOT EXISTS fee_contribution_cents integer;
ALTER TABLE fundraiser_orders ADD COLUMN IF NOT EXISTS base_amount_cents integer;
ALTER TABLE fundraiser_orders ADD COLUMN IF NOT EXISTS total_amount_cents integer;
ALTER TABLE fundraiser_orders ADD COLUMN IF NOT EXISTS platform_fee_cents integer;
`;
