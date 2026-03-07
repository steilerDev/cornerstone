-- Migration 0012: Replace household_item_work_items with household_item_deps dependency model
-- Adds CPM delivery date columns, creates deps table, migrates data, drops old table.
--
-- EPIC-09: Story 9.1 — Household Item Timeline Dependencies & Delivery Date Scheduling
--
-- Changes:
--   - Add earliest_delivery_date and latest_delivery_date columns to household_items
--   - Create household_item_deps table (mirrors work_item_dependencies structure)
--   - Migrate existing household_item_work_items rows as FS/0-lag dependencies
--   - Drop household_item_work_items junction table
--
-- See wiki/ADR-017 for design rationale.
--
-- ROLLBACK:
--   ALTER TABLE household_items DROP COLUMN earliest_delivery_date;
--   ALTER TABLE household_items DROP COLUMN latest_delivery_date;
--   DROP TABLE IF EXISTS household_item_deps;
--   CREATE TABLE household_item_work_items (
--     household_item_id TEXT NOT NULL REFERENCES household_items(id) ON DELETE CASCADE,
--     work_item_id TEXT NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
--     PRIMARY KEY (household_item_id, work_item_id)
--   );
--   CREATE INDEX idx_household_item_work_items_work_item_id ON household_item_work_items(work_item_id);

-- 1. Add computed delivery date columns to household_items
ALTER TABLE household_items ADD COLUMN earliest_delivery_date TEXT;
ALTER TABLE household_items ADD COLUMN latest_delivery_date TEXT;

-- 2. Create household_item_deps table
CREATE TABLE household_item_deps (
  household_item_id TEXT NOT NULL
    REFERENCES household_items(id) ON DELETE CASCADE,
  predecessor_type  TEXT NOT NULL CHECK (predecessor_type IN ('work_item', 'milestone')),
  predecessor_id    TEXT NOT NULL,
  dependency_type   TEXT NOT NULL DEFAULT 'finish_to_start'
    CHECK (dependency_type IN ('finish_to_start','start_to_start','finish_to_finish','start_to_finish')),
  lead_lag_days     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (household_item_id, predecessor_type, predecessor_id)
);

CREATE INDEX idx_hi_deps_predecessor ON household_item_deps(predecessor_type, predecessor_id);

-- 3. Migrate existing household_item_work_items rows as FS/0-lag work_item deps
INSERT INTO household_item_deps
  (household_item_id, predecessor_type, predecessor_id, dependency_type, lead_lag_days)
SELECT
  household_item_id,
  'work_item',
  work_item_id,
  'finish_to_start',
  0
FROM household_item_work_items;

-- 4. Drop old junction table
DROP TABLE household_item_work_items;
