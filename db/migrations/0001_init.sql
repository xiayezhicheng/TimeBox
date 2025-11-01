-- Cloudflare D1 initial schema for TimeBox sync storage
CREATE TABLE IF NOT EXISTS sync_accounts (
  id TEXT PRIMARY KEY,
  label TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS storage_records (
  account_id TEXT NOT NULL,
  data_key TEXT NOT NULL,
  data_value TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, data_key),
  FOREIGN KEY (account_id) REFERENCES sync_accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_storage_records_account_updated
  ON storage_records (account_id, updated_at DESC);
