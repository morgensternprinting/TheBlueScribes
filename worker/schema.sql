-- The Blue Scribes — D1 schema (accounts + token wallet + ledger).
-- Apply once:  wrangler d1 execute blue-scribes-db --file=worker/schema.sql
-- (add --remote to run against the deployed database).

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,        -- uuid
  email         TEXT NOT NULL UNIQUE,    -- stored lowercased
  pw_hash       TEXT NOT NULL,           -- PBKDF2-SHA256, base64
  pw_salt       TEXT NOT NULL,           -- base64
  token_balance INTEGER NOT NULL DEFAULT 0,
  free_questions INTEGER NOT NULL DEFAULT 3,  -- one-time free questions per email (lifetime)
  signup_ip     TEXT,                         -- IP used at sign-up (per-IP free-trial cap)
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_signup_ip ON users(signup_ip);
-- Existing database? Add the newer columns once (ignore "duplicate column" errors):
--   ALTER TABLE users ADD COLUMN free_questions INTEGER NOT NULL DEFAULT 3;
--   ALTER TABLE users ADD COLUMN signup_ip TEXT;

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,           -- opaque random token (Bearer)
  user_id    TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- Ledger: 'welcome' (sign-up credit), 'purchase' (Stripe), 'debit' (chat usage).
-- `ref` holds the Stripe session id for purchases (UNIQUE → webhook idempotency),
-- or a usage note for debits.
CREATE TABLE IF NOT EXISTS transactions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT NOT NULL,
  kind       TEXT NOT NULL,              -- welcome | purchase | debit
  amount     INTEGER NOT NULL,           -- tokens (positive)
  ref        TEXT,                       -- stripe session id / usage note
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_tx_user ON transactions(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tx_ref ON transactions(ref) WHERE ref IS NOT NULL AND kind = 'purchase';
