-- Migration 0025: Add 'invoice_created' to diary_entries entry_type CHECK constraint
--
-- EPIC-13: Construction Diary — UAT feedback fixes
--
-- The Drizzle schema includes 'invoice_created' as a valid entry_type, but
-- migration 0024 did not include it in the CHECK constraint. SQLite does not
-- support ALTER TABLE ... ALTER CONSTRAINT, so we recreate the table.
--
-- ROLLBACK: (not needed — additive change, no data loss)

-- 1. Create new table with updated CHECK constraint
CREATE TABLE diary_entries_new (
  id TEXT PRIMARY KEY,
  entry_type TEXT NOT NULL CHECK(entry_type IN (
    'daily_log', 'site_visit', 'delivery', 'issue', 'general_note',
    'work_item_status', 'invoice_status', 'milestone_delay',
    'budget_breach', 'auto_reschedule', 'subsidy_status',
    'invoice_created'
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

-- 2. Copy existing data
INSERT INTO diary_entries_new SELECT * FROM diary_entries;

-- 3. Drop old table
DROP TABLE diary_entries;

-- 4. Rename new table
ALTER TABLE diary_entries_new RENAME TO diary_entries;

-- 5. Recreate indexes
CREATE INDEX idx_diary_entries_entry_date
  ON diary_entries (entry_date DESC, created_at DESC);

CREATE INDEX idx_diary_entries_entry_type
  ON diary_entries (entry_type);

CREATE INDEX idx_diary_entries_is_automatic
  ON diary_entries (is_automatic);

CREATE INDEX idx_diary_entries_source_entity
  ON diary_entries (source_entity_type, source_entity_id)
  WHERE source_entity_type IS NOT NULL;
