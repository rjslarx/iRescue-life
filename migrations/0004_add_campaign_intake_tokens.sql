CREATE TABLE IF NOT EXISTS campaign_intake_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  partner_name TEXT NOT NULL,
  partner_email TEXT NOT NULL,
  animal_id UUID REFERENCES animals(id) ON DELETE SET NULL,
  invited_by_user_id UUID REFERENCES users(id),
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  created_campaign_id UUID REFERENCES peer_campaigns(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
