-- Migration 0031: Make includes_vat NOT NULL DEFAULT 1
-- Backfills any NULL values to 1 (true) and recreates both budget tables with NOT NULL constraint.
-- Uses explicit column lists in INSERT...SELECT to be safe regardless of column order.
-- Preserves all CHECK constraints from the original table definitions.

PRAGMA foreign_keys = OFF;

-- Backfill NULLs before table recreation
UPDATE work_item_budgets SET includes_vat = 1 WHERE includes_vat IS NULL;
UPDATE household_item_budgets SET includes_vat = 1 WHERE includes_vat IS NULL;

-- Recreate work_item_budgets with includes_vat NOT NULL DEFAULT 1
CREATE TABLE work_item_budgets_new (
  id TEXT PRIMARY KEY,
  work_item_id TEXT NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  description TEXT,
  planned_amount REAL NOT NULL DEFAULT 0 CHECK(planned_amount >= 0),
  confidence TEXT NOT NULL DEFAULT 'own_estimate' CHECK(confidence IN ('own_estimate', 'professional_estimate', 'quote', 'invoice')),
  budget_category_id TEXT REFERENCES budget_categories(id) ON DELETE SET NULL,
  budget_source_id TEXT REFERENCES budget_sources(id) ON DELETE SET NULL,
  vendor_id TEXT REFERENCES vendors(id) ON DELETE SET NULL,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  quantity REAL,
  unit TEXT,
  unit_price REAL,
  includes_vat INTEGER NOT NULL DEFAULT 1
);

INSERT INTO work_item_budgets_new (
  id, work_item_id, description, planned_amount, confidence,
  budget_category_id, budget_source_id, vendor_id,
  created_by, created_at, updated_at,
  quantity, unit, unit_price, includes_vat
)
SELECT
  id, work_item_id, description, planned_amount, confidence,
  budget_category_id, budget_source_id, vendor_id,
  created_by, created_at, updated_at,
  quantity, unit, unit_price, includes_vat
FROM work_item_budgets;

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
  planned_amount REAL NOT NULL DEFAULT 0 CHECK(planned_amount >= 0),
  confidence TEXT NOT NULL DEFAULT 'own_estimate' CHECK(confidence IN ('own_estimate', 'professional_estimate', 'quote', 'invoice')),
  budget_category_id TEXT REFERENCES budget_categories(id) ON DELETE SET NULL,
  budget_source_id TEXT REFERENCES budget_sources(id) ON DELETE SET NULL,
  vendor_id TEXT REFERENCES vendors(id) ON DELETE SET NULL,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  quantity REAL,
  unit TEXT,
  unit_price REAL,
  includes_vat INTEGER NOT NULL DEFAULT 1
);

INSERT INTO household_item_budgets_new (
  id, household_item_id, description, planned_amount, confidence,
  budget_category_id, budget_source_id, vendor_id,
  created_by, created_at, updated_at,
  quantity, unit, unit_price, includes_vat
)
SELECT
  id, household_item_id, description, planned_amount, confidence,
  budget_category_id, budget_source_id, vendor_id,
  created_by, created_at, updated_at,
  quantity, unit, unit_price, includes_vat
FROM household_item_budgets;

DROP TABLE household_item_budgets;
ALTER TABLE household_item_budgets_new RENAME TO household_item_budgets;

CREATE INDEX idx_household_item_budgets_household_item_id ON household_item_budgets(household_item_id);
CREATE INDEX idx_household_item_budgets_vendor_id ON household_item_budgets(vendor_id);
CREATE INDEX idx_household_item_budgets_budget_category_id ON household_item_budgets(budget_category_id);
CREATE INDEX idx_household_item_budgets_budget_source_id ON household_item_budgets(budget_source_id);

PRAGMA foreign_keys = ON;
