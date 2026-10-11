CREATE TABLE IF NOT EXISTS free_square_boards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','open','closed','archived')),
  home_team text NOT NULL DEFAULT 'Home',
  away_team text NOT NULL DEFAULT 'Away',
  home_score integer CHECK (home_score BETWEEN 0 AND 999),
  away_score integer CHECK (away_score BETWEEN 0 AND 999),
  email_subject text NOT NULL DEFAULT 'Your squares for {event}',
  email_template text NOT NULL DEFAULT 'Hi {name}, your squares for {event} are {squares}. Thank you for joining us!',
  sms_template text NOT NULL DEFAULT 'Hi {name}, your squares for {event} are {squares}. Thank you for joining us!',
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS free_square_boards_tenant_idx ON free_square_boards(tenant_id);

ALTER TABLE free_square_boards ALTER COLUMN email_template SET DEFAULT 'Hi {name}, your squares for {event} are {squares}. Thank you for joining us!';
ALTER TABLE free_square_boards ALTER COLUMN sms_template SET DEFAULT 'Hi {name}, your squares for {event} are {squares}. Thank you for joining us!';
-- Only replace our original defaults; preserve rescue-authored templates and sent-message/consent history.
UPDATE free_square_boards SET email_template='Hi {name}, your squares for {event} are {squares}. Thank you for joining us!'
WHERE email_template='Hi {name}, your free squares for {event} are {squares}. Thank you for joining us!';
UPDATE free_square_boards SET sms_template='Hi {name}, your squares for {event} are {squares}. Thank you for joining us!'
WHERE sms_template='Hi {name}, your free squares for {event} are {squares}. Thank you for joining us!';

-- Additive upgrade for boards created before score-digit assignment existed.
ALTER TABLE free_square_boards ADD COLUMN IF NOT EXISTS row_digits integer[];
ALTER TABLE free_square_boards ADD COLUMN IF NOT EXISTS column_digits integer[];
ALTER TABLE free_square_boards ADD COLUMN IF NOT EXISTS digits_assigned_at timestamptz;
ALTER TABLE free_square_boards ADD COLUMN IF NOT EXISTS digits_assigned_by uuid REFERENCES users(id) ON DELETE SET NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='free_square_boards_digits_check'
    AND conrelid='free_square_boards'::regclass) THEN
    ALTER TABLE free_square_boards ADD CONSTRAINT free_square_boards_digits_check CHECK (
      (row_digits IS NULL AND column_digits IS NULL AND digits_assigned_at IS NULL)
      OR (row_digits IS NOT NULL AND column_digits IS NOT NULL AND digits_assigned_at IS NOT NULL
        AND cardinality(row_digits)=10 AND cardinality(column_digits)=10
        AND array_ndims(row_digits)=1 AND array_ndims(column_digits)=1
        AND array_lower(row_digits,1)=1 AND array_lower(column_digits,1)=1
        AND row_digits @> ARRAY[0,1,2,3,4,5,6,7,8,9]
        AND column_digits @> ARRAY[0,1,2,3,4,5,6,7,8,9])
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS free_square_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  board_id uuid NOT NULL REFERENCES free_square_boards(id) ON DELETE CASCADE,
  request_key uuid NOT NULL,
  name text NOT NULL,
  email text,
  phone text,
  squares integer[] NOT NULL,
  sms_consent_at timestamptz,
  sms_consent_text text,
  sms_revoked_at timestamptz,
  email_revoked_at timestamptz,
  unsubscribe_token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, request_key)
);
CREATE INDEX IF NOT EXISTS free_square_reservations_board_idx ON free_square_reservations(board_id);

CREATE TABLE IF NOT EXISTS free_square_claims (
  board_id uuid NOT NULL REFERENCES free_square_boards(id) ON DELETE CASCADE,
  square integer NOT NULL CHECK (square BETWEEN 1 AND 100),
  reservation_id uuid NOT NULL REFERENCES free_square_reservations(id) ON DELETE CASCADE,
  PRIMARY KEY (board_id, square)
);

CREATE TABLE IF NOT EXISTS free_square_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  board_id uuid NOT NULL REFERENCES free_square_boards(id) ON DELETE CASCADE,
  reservation_id uuid NOT NULL REFERENCES free_square_reservations(id) ON DELETE CASCADE,
  request_key uuid NOT NULL,
  channel text NOT NULL CHECK (channel IN ('email','sms')),
  subject text,
  body text NOT NULL,
  status text NOT NULL CHECK (status IN ('sending','accepted','failed','unknown')),
  error text,
  provider_id text,
  sent_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, request_key)
);
CREATE INDEX IF NOT EXISTS free_square_messages_board_idx ON free_square_messages(board_id);
