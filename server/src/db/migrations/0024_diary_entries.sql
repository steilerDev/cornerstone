-- Migration 0024: Create diary_entries table for construction diary (Bautagebuch)
--
-- EPIC-13: Construction Diary
--
-- Creates a table for construction diary entries — both manual entries
-- (daily_log, site_visit, delivery, issue, general_note) and automatic
-- system events (work_item_status, invoice_status, milestone_delay,
-- budget_breach, auto_reschedule, subsidy_status).
--
-- Type-specific metadata is stored in a JSON TEXT column, validated at
-- the application layer. See ADR-020 for design rationale.
--
-- ROLLBACK:
--   DROP INDEX IF EXISTS idx_diary_entries_source_entity;
--   DROP INDEX IF EXISTS idx_diary_entries_is_automatic;
--   DROP INDEX IF EXISTS idx_diary_entries_entry_type;
--   DROP INDEX IF EXISTS idx_diary_entries_entry_date;
--   DROP TABLE IF EXISTS diary_entries;

CREATE TABLE diary_entries (
  id TEXT PRIMARY KEY,
  entry_type TEXT NOT NULL CHECK(entry_type IN (
    'daily_log', 'site_visit', 'delivery', 'issue', 'general_note',
    'work_item_status', 'invoice_status', 'milestone_delay',
    'budget_breach', 'auto_reschedule', 'subsidy_status'
  )),
  entry_date TEXT NOT NULL,
  title TEXT,
  body TEXT NOT NULL,
  metadata TEXT,
  is_automatic INTEGER NOT NULL DEFAULT 0,
  source_entity_type TEXT,
  source_entity_id TEXT,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Primary query: timeline view sorted by date
CREATE INDEX idx_diary_entries_entry_date
  ON diary_entries (entry_date DESC, created_at DESC);

-- Filter by entry type
CREATE INDEX idx_diary_entries_entry_type
  ON diary_entries (entry_type);

-- Filter manual vs automatic entries
CREATE INDEX idx_diary_entries_is_automatic
  ON diary_entries (is_automatic);

-- Find all diary entries linked to a specific source entity
CREATE INDEX idx_diary_entries_source_entity
  ON diary_entries (source_entity_type, source_entity_id)
  WHERE source_entity_type IS NOT NULL;
