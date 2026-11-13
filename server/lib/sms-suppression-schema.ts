export const smsSuppressionSchemaSql = `
CREATE TABLE IF NOT EXISTS sms_phone_suppressions (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  phone_key text NOT NULL,
  suppressed boolean NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,phone_key)
);
CREATE TABLE IF NOT EXISTS sms_opt_out_events (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  message_sid text NOT NULL,
  phone_key text NOT NULL,
  command text NOT NULL CHECK (command IN ('STOP','START')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,message_sid)
);
`;
