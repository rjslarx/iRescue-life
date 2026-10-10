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
  email_template text NOT NULL DEFAULT 'Hi {name}, your free squares for {event} are {squares}. Thank you for joining us!',
  sms_template text NOT NULL DEFAULT 'Hi {name}, your free squares for {event} are {squares}. Thank you for joining us!',
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS free_square_boards_tenant_idx ON free_square_boards(tenant_id);

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
