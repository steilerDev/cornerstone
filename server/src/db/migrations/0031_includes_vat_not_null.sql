-- Migration 0031: Make includes_vat NOT NULL DEFAULT 1
-- Backfills any NULL values to 1 (true) and recreates both budget tables with NOT NULL constraint.
-- Direct pricing mode now always stores includes_vat alongside unit pricing mode.

PRAGMA foreign_keys = OFF;

-- Backfill NULLs before table recreation
UPDATE work_item_budgets SET includes_vat = 1 WHERE includes_vat IS NULL;
UPDATE household_item_budgets SET includes_vat = 1 WHERE includes_vat IS NULL;

-- Recreate work_item_budgets with includes_vat NOT NULL DEFAULT 1
CREATE TABLE work_item_budgets_new (
  id TEXT PRIMARY KEY,
  work_item_id TEXT NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
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
  updated_at TEXT NOT NULL
);

INSERT INTO work_item_budgets_new SELECT * FROM work_item_budgets;
DROP TABLE work_item_budgets;
ALTER TABLE work_item_budgets_new RENAME TO work_item_budgets;

CREATE INDEX idx_work_item_budgets_work_item_id ON work_item_budgets(work_item_id);
CREATE INDEX idx_work_item_budgets_vendor_id ON work_item_budgets(vendor_id);
CREATE INDEX idx_work_item_budgets_budget_category_id ON work_item_budgets(budget_category_id);
CREATE INDEX idx_work_item_budgets_budget_source_id ON work_item_budgets(budget_source_id);

-- Recreate household_item_budgets with includes_vat NOT NULL DEFAULT 1
CREATE TABLE household_item_budgets_new (
  id TEXT PRIMARY KEY,
  household_item_id TEXT NOT NULL REFERENCES household_items(id) ON DELETE CASCADE,
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
  updated_at TEXT NOT NULL
);

INSERT INTO household_item_budgets_new SELECT * FROM household_item_budgets;
DROP TABLE household_item_budgets;
ALTER TABLE household_item_budgets_new RENAME TO household_item_budgets;

CREATE INDEX idx_household_item_budgets_household_item_id ON household_item_budgets(household_item_id);
CREATE INDEX idx_household_item_budgets_vendor_id ON household_item_budgets(vendor_id);
CREATE INDEX idx_household_item_budgets_budget_category_id ON household_item_budgets(budget_category_id);
CREATE INDEX idx_household_item_budgets_budget_source_id ON household_item_budgets(budget_source_id);

PRAGMA foreign_keys = ON;
