-- Migration 0033: Add status column to diary_entries for draft support
--
-- Issue #1426: Diary photos lost on upload failure
-- ADR-022: Diary Drafts via Status Column on diary_entries
--
-- Adds a `status` column to distinguish in-progress drafts ('draft') from
-- finalized entries ('saved'). The create flow now auto-creates a draft on
-- first interaction so that photos can be uploaded immediately against a
-- real entry id, eliminating the silent-photo-loss bug class.
--
-- Default value is 'saved' so all existing rows remain in their current
-- (validated) state with zero data migration. The CHECK constraint enforces
-- the two-value enum at the DB level.
--
-- The partial index on (status, updated_at) WHERE status = 'draft' supports
-- the orphan cleanup job (`WHERE status = 'draft' AND updated_at < ?`)
-- without indexing the much larger saved-entry set.
--
-- ROLLBACK:
--   DROP INDEX IF EXISTS idx_diary_entries_status_updated;
--   -- SQLite cannot drop columns without table rebuild; if rollback is required,
--   -- recreate diary_entries without the status column following the standard
--   -- "create new table + copy + drop + rename" pattern.

ALTER TABLE diary_entries ADD COLUMN status TEXT NOT NULL DEFAULT 'saved'
  CHECK(status IN ('draft', 'saved'));

-- Partial index to make the orphan cleanup query fast (and small).
CREATE INDEX idx_diary_entries_status_updated
  ON diary_entries (status, updated_at)
  WHERE status = 'draft';
