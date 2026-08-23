ALTER TABLE adoption_checkout_sessions
  ADD COLUMN IF NOT EXISTS signature_claimed_at timestamp;

ALTER TABLE adoption_contracts
  ADD COLUMN IF NOT EXISTS drivers_license_image_url text;

ALTER TABLE adoption_contracts
  ADD COLUMN IF NOT EXISTS drivers_license_number text;

CREATE TABLE IF NOT EXISTS adoption_contract_pdf_regeneration_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contract_id integer NOT NULL REFERENCES adoption_contracts(id) ON DELETE CASCADE,
  status text NOT NULL,
  reason text NOT NULL,
  old_pdf_url text,
  new_pdf_url text,
  signature_image_url text,
  drivers_license_image_url text,
  error text,
  created_at timestamp NOT NULL DEFAULT now(),
  completed_at timestamp
);

CREATE INDEX IF NOT EXISTS adoption_contract_pdf_regen_tenant_run_idx
  ON adoption_contract_pdf_regeneration_audits (tenant_id, run_id);

CREATE INDEX IF NOT EXISTS adoption_contract_pdf_regen_contract_status_idx
  ON adoption_contract_pdf_regeneration_audits (contract_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS adoption_contract_pdf_regen_active_unique
  ON adoption_contract_pdf_regeneration_audits (contract_id, reason)
  WHERE status IN ('started', 'succeeded');