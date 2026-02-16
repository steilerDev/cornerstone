-- EPIC-01: Authentication & User Management
-- Creates the users and sessions tables for authentication.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('admin', 'member')),
  auth_provider TEXT NOT NULL CHECK(auth_provider IN ('local', 'oidc')),
  password_hash TEXT,
  oidc_subject TEXT,
  deactivated_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX idx_users_oidc_lookup
  ON users (auth_provider, oidc_subject)
  WHERE oidc_subject IS NOT NULL;

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_sessions_user_id ON sessions (user_id);
CREATE INDEX idx_sessions_expires_at ON sessions (expires_at);

-- Rollback:
-- DROP INDEX IF EXISTS idx_sessions_expires_at;
-- DROP INDEX IF EXISTS idx_sessions_user_id;
-- DROP TABLE IF EXISTS sessions;
-- DROP INDEX IF EXISTS idx_users_oidc_lookup;
-- DROP TABLE IF EXISTS users;
