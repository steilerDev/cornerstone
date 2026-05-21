-- EPIC-20 Story #1545: Unassigned budget lines & one-shot parent assignment
-- Enable orphan work_item_budget rows (nullable work_item_id) and origin tracking

PRAGMA foreign_keys = OFF;

-- Rebuild work_item_budgets table: make work_item_id nullable and add origin column
CREATE TABLE work_item_budgets_new (
  id TEXT PRIMARY KEY,
  work_item_id TEXT REFERENCES work_items(id) ON DELETE CASCADE,
  description TEXT,
  planned_amount REAL NOT NULL DEFAULT 0,
  confidence TEXT NOT NULL DEFAULT 'own_estimate',
  budget_category_id TEXT REFERENCES budget_categories(id) ON DELETE SET NULL,
  budget_source_id TEXT REFERENCES budget_sources(id) ON DELETE SET NULL,
  vendor_id TEXT REFERENCES vendors(id) ON DELETE SET NULL,
  quantity REAL,
  unit TEXT,
  unit_price REAL,
  includes_vat INTEGER NOT NULL DEFAULT 1,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  origin TEXT NOT NULL DEFAULT 'manual'
);

-- Copy all existing rows, marking them as 'manual' origin
INSERT INTO work_item_budgets_new
SELECT id, work_item_id, description, planned_amount, confidence, budget_category_id, budget_source_id, vendor_id, quantity, unit, unit_price, includes_vat, created_by, created_at, updated_at, 'manual' AS origin
FROM work_item_budgets;

-- Drop old table and rename new one
DROP TABLE work_item_budgets;
ALTER TABLE work_item_budgets_new RENAME TO work_item_budgets;

-- Recreate indexes (matching schema.ts definitions)
CREATE INDEX idx_work_item_budgets_work_item_id ON work_item_budgets(work_item_id);
CREATE INDEX idx_work_item_budgets_vendor_id ON work_item_budgets(vendor_id);
CREATE INDEX idx_work_item_budgets_budget_category_id ON work_item_budgets(budget_category_id);
CREATE INDEX idx_work_item_budgets_budget_source_id ON work_item_budgets(budget_source_id);

-- Add origin column to household_item_budgets (no rebuild needed)
ALTER TABLE household_item_budgets ADD COLUMN origin TEXT NOT NULL DEFAULT 'manual';

PRAGMA foreign_keys = ON;
