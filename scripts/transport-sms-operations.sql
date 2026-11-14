CREATE TABLE IF NOT EXISTS transport_sms_operations (
  tenant_id varchar NOT NULL,
  transport_id varchar NOT NULL,
  operation_key varchar(128) NOT NULL,
  message text NOT NULL,
  results jsonb NOT NULL,
  complete boolean NOT NULL DEFAULT false,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT transport_sms_operations_scope UNIQUE (tenant_id, transport_id, operation_key)
);
