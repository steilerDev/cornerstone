-- Migration 0046: OIDC subject is the sole correlation key
-- Issues #1865: oidc_subject is the sole OIDC correlation key, independent of
-- auth_provider (a linked local account keeps auth_provider='local').
-- No backfill: legacy auth_provider='oidc' rows keep their subject unchanged.
DROP INDEX IF EXISTS idx_users_oidc_lookup;

CREATE UNIQUE INDEX idx_users_oidc_lookup
  ON users (oidc_subject)
  WHERE oidc_subject IS NOT NULL;
