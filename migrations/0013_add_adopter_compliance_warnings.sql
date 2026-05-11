-- Adopter Heartworm Compliance Warning System (Task #137)
--
-- Two new tables:
--   adopter_compliance_warning_templates  (1 row per tenant; per-tenant override
--                                          for the contract-enforcement warning
--                                          email/SMS body and subject. NULL =
--                                          fall back to the system default.)
--   adopter_compliance_warnings           (audit log of every warning sent,
--                                          used for the 30-day dedup window
--                                          and for "Last warned" badges.)

CREATE TABLE IF NOT EXISTS adopter_compliance_warning_templates (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  email_subject text,
  email_body  text,
  sms_body    text,
  updated_at  timestamp   NOT NULL DEFAULT now(),
  updated_by  uuid        REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS adopter_compliance_warnings (
  id              uuid     PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid     NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id         uuid     REFERENCES users(id) ON DELETE SET NULL,
  animal_id       uuid     NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
  item_id         text     NOT NULL,
  item_key        text     NOT NULL,
  care_name       text     NOT NULL,
  due_date        text     NOT NULL,
  deadline_date   text     NOT NULL,
  channels_used   text[]   NOT NULL DEFAULT ARRAY[]::text[],
  trigger         text     NOT NULL DEFAULT 'automatic',
  triggered_by    uuid     REFERENCES users(id) ON DELETE SET NULL,
  adopter_email   text,
  recipient_email text,
  recipient_phone text,
  email_subject   text,
  email_body      text,
  sms_body        text,
  sent_at         timestamp NOT NULL DEFAULT now()
);

-- Indexes that match how the application queries this table:
--   1. Adopter-keyed dedup: lookup the most recent warning for a given
--      (tenant, lower(adopter_email), item_id) within the past 30 days.
--   2. Animal-keyed display: list recent warnings for the Heartworm Watch tab.
CREATE INDEX IF NOT EXISTS adopter_compliance_warnings_adopter_dedup_idx
  ON adopter_compliance_warnings (tenant_id, lower(adopter_email), item_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS adopter_compliance_warnings_animal_idx
  ON adopter_compliance_warnings (tenant_id, animal_id, sent_at DESC);
