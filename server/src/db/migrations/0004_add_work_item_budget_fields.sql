-- EPIC-05 Story #147: Add budget fields to work items
-- Adds planned budget, actual cost, confidence percentage, and FK references
-- to budget_categories and budget_sources.

ALTER TABLE work_items ADD COLUMN planned_budget REAL;
ALTER TABLE work_items ADD COLUMN actual_cost REAL;
ALTER TABLE work_items ADD COLUMN confidence_percent INTEGER;
ALTER TABLE work_items ADD COLUMN budget_category_id TEXT REFERENCES budget_categories(id) ON DELETE SET NULL;
ALTER TABLE work_items ADD COLUMN budget_source_id TEXT REFERENCES budget_sources(id) ON DELETE SET NULL;

CREATE INDEX idx_work_items_budget_category ON work_items(budget_category_id);
CREATE INDEX idx_work_items_budget_source ON work_items(budget_source_id);

-- Rollback:
-- DROP INDEX IF EXISTS idx_work_items_budget_source;
-- DROP INDEX IF EXISTS idx_work_items_budget_category;
-- (SQLite does not support DROP COLUMN for these ALTERs; requires table recreation)
