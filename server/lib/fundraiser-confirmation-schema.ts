export const fundraiserConfirmationSql = `
CREATE TABLE IF NOT EXISTS fundraiser_confirmation_deliveries (
  order_id uuid PRIMARY KEY REFERENCES fundraiser_orders(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  recipient text NOT NULL,
  subject text NOT NULL,
  html text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamp NOT NULL DEFAULT now(),
  started_at timestamp,
  sent_at timestamp,
  message_id text,
  last_error text,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fundraiser_confirmation_due_idx
  ON fundraiser_confirmation_deliveries(next_attempt_at) WHERE status IN ('pending', 'failed');
`;
