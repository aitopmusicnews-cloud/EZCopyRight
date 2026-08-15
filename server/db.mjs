import pg from 'pg';

const { Pool } = pg;

const migration = `
CREATE TABLE IF NOT EXISTS works (
  id UUID PRIMARY KEY,
  user_id TEXT NOT NULL,
  idempotency_key UUID NOT NULL,
  title VARCHAR(200) NOT NULL,
  artist VARCHAR(200) NOT NULL,
  co_artists TEXT NOT NULL DEFAULT '',
  genre VARCHAR(80) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  lyrics TEXT NOT NULL DEFAULT '',
  date_created DATE NOT NULL,
  date_registered TIMESTAMPTZ NOT NULL,
  registration_number VARCHAR(64) NOT NULL UNIQUE,
  digital_fingerprint CHAR(64) NOT NULL,
  file_hash CHAR(64) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_size BIGINT NOT NULL CHECK (file_size > 0),
  file_type VARCHAR(120) NOT NULL,
  status VARCHAR(24) NOT NULL CHECK (status IN ('pending', 'registered')),
  upload_id UUID,
  object_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, idempotency_key)
);

ALTER TABLE works ADD COLUMN IF NOT EXISTS upload_id UUID;
ALTER TABLE works ADD COLUMN IF NOT EXISTS object_key TEXT;

CREATE TABLE IF NOT EXISTS file_uploads (
  id UUID PRIMARY KEY,
  user_id TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  file_hash CHAR(64) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_size BIGINT NOT NULL CHECK (file_size > 0),
  file_type VARCHAR(120) NOT NULL,
  checksum_sha256 VARCHAR(64) NOT NULL,
  status VARCHAR(24) NOT NULL CHECK (status IN ('pending', 'ready', 'consumed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  consumed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS file_uploads_user_created_idx
  ON file_uploads (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS works_user_registered_idx
  ON works (user_id, date_registered DESC);

CREATE TABLE IF NOT EXISTS billing_customers (
  user_id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  stripe_customer_id TEXT NOT NULL UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  stripe_price_id TEXT,
  subscription_status VARCHAR(32) NOT NULL DEFAULT 'inactive',
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stripe_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS policy_consents (
  id UUID PRIMARY KEY,
  user_id TEXT NOT NULL,
  policy_type VARCHAR(32) NOT NULL CHECK (policy_type IN ('terms', 'privacy', 'refund-policy')),
  policy_version VARCHAR(32) NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  request_id UUID NOT NULL,
  source_flow VARCHAR(32) NOT NULL,
  UNIQUE (user_id, policy_type, policy_version, source_flow)
);

CREATE INDEX IF NOT EXISTS policy_consents_user_idx
  ON policy_consents (user_id, accepted_at DESC);

CREATE TABLE IF NOT EXISTS audit_events (
  id UUID PRIMARY KEY,
  request_id UUID NOT NULL,
  user_id TEXT,
  action VARCHAR(80) NOT NULL,
  resource_type VARCHAR(40),
  resource_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_events_user_created_idx
  ON audit_events (user_id, created_at DESC);
`;

export function createDatabase({
  databaseUrl,
  databaseSsl,
  dbHost,
  dbPort,
  dbName,
  dbUser,
  dbPassword,
}) {
  const ssl = databaseSsl ? { rejectUnauthorized: false } : false;

  if (databaseUrl) {
    return new Pool({
      connectionString: databaseUrl,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      ssl,
    });
  }

  if (!dbHost || !dbName || !dbUser || !dbPassword) {
    throw new Error('DATABASE_URL or DB_HOST/DB_NAME/DB_USER/DB_PASSWORD is required to start the EZ Copyright API.');
  }

  return new Pool({
    host: dbHost,
    port: dbPort || 5432,
    database: dbName,
    user: dbUser,
    password: dbPassword,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl,
  });
}

export async function runMigrations(database) {
  await database.query(migration);
}
