-- Migration 0008: Add actual start/end date columns and simplify work item status enum
--
-- Changes:
--   1. Add actual_start_date column to work_items (nullable TEXT, ISO date)
--   2. Add actual_end_date column to work_items (nullable TEXT, ISO date)
--   3. Migrate existing 'blocked' status rows to 'not_started'
--      (Note: SQLite does not support ALTER COLUMN or DROP CHECK, so we use a
--       soft migration — existing rows with 'blocked' are updated to 'not_started'.
--       The application layer enforces the new three-value enum.)
--
-- ROLLBACK:
--   ALTER TABLE work_items DROP COLUMN actual_start_date;
--   ALTER TABLE work_items DROP COLUMN actual_end_date;
--   (blocked status rollback is not reversible without original data)

ALTER TABLE work_items ADD COLUMN actual_start_date TEXT;
ALTER TABLE work_items ADD COLUMN actual_end_date TEXT;

-- Migrate any existing 'blocked' rows to 'not_started'
UPDATE work_items SET status = 'not_started' WHERE status = 'blocked';
