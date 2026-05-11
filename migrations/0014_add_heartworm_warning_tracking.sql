-- Task #140: heartworm warning open/click tracking columns
ALTER TABLE adopter_compliance_warnings
  ADD COLUMN IF NOT EXISTS tracking_token text,
  ADD COLUMN IF NOT EXISTS email_opened_at timestamp,
  ADD COLUMN IF NOT EXISTS link_clicked_at timestamp;

CREATE UNIQUE INDEX IF NOT EXISTS adopter_compliance_warnings_tracking_token_key
  ON adopter_compliance_warnings (tracking_token);
