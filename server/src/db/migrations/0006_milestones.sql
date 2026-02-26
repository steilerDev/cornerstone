-- EPIC-06: Timeline, Gantt Chart & Dependency Management
-- Creates milestones and milestone_work_items tables.
-- Adds lead_lag_days column to work_item_dependencies.

-- Milestones for tracking major project progress points
CREATE TABLE milestones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  target_date TEXT NOT NULL,
  is_completed INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  color TEXT,
  -- created_by nullable: ON DELETE SET NULL preserves milestone when creating user is removed
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_milestones_target_date ON milestones(target_date);

-- Junction: milestones <-> work items (M:N)
CREATE TABLE milestone_work_items (
  milestone_id INTEGER NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
  work_item_id TEXT NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  PRIMARY KEY (milestone_id, work_item_id)
);

CREATE INDEX idx_milestone_work_items_work_item_id ON milestone_work_items(work_item_id);

-- Add lead/lag days to work item dependencies for scheduling offsets
ALTER TABLE work_item_dependencies ADD COLUMN lead_lag_days INTEGER NOT NULL DEFAULT 0;

-- Rollback:
-- ALTER TABLE work_item_dependencies DROP COLUMN lead_lag_days;
-- DROP INDEX IF EXISTS idx_milestone_work_items_work_item_id;
-- DROP TABLE IF EXISTS milestone_work_items;
-- DROP INDEX IF EXISTS idx_milestones_target_date;
-- DROP TABLE IF EXISTS milestones;
