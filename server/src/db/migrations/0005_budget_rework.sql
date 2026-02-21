-- EPIC-05 Story 5.9: Budget Rework Migration
-- Creates work_item_budgets table, migrates existing budget data,
-- recreates invoices table with new status enum and work_item_budget_id FK,
-- recreates work_items without old budget columns, and drops work_item_vendors.
--
-- NOTE: SQLite does not support DROP COLUMN or altering CHECK constraints on existing tables.
-- Full table recreation is required for schema changes to existing tables.
-- Foreign keys are disabled during the migration to allow table renames.

PRAGMA foreign_keys = OFF;

-- ── Step 1: Create work_item_budgets table ─────────────────────────────────────

CREATE TABLE work_item_budgets (
  id TEXT PRIMARY KEY,
  work_item_id TEXT NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  description TEXT,
  planned_amount REAL NOT NULL DEFAULT 0,
  confidence TEXT NOT NULL DEFAULT 'own_estimate' CHECK(confidence IN ('own_estimate', 'professional_estimate', 'quote', 'invoice')),
  budget_category_id TEXT REFERENCES budget_categories(id) ON DELETE SET NULL,
  budget_source_id TEXT REFERENCES budget_sources(id) ON DELETE SET NULL,
  vendor_id TEXT REFERENCES vendors(id) ON DELETE SET NULL,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_work_item_budgets_work_item_id ON work_item_budgets(work_item_id);
CREATE INDEX idx_work_item_budgets_vendor_id ON work_item_budgets(vendor_id);
CREATE INDEX idx_work_item_budgets_budget_category_id ON work_item_budgets(budget_category_id);
CREATE INDEX idx_work_item_budgets_budget_source_id ON work_item_budgets(budget_source_id);

-- ── Step 2: Migrate work item budget data to budget lines ──────────────────────
-- For each work item with any budget data, create one budget line.
-- The first vendor from work_item_vendors (if any) is assigned to the line.
-- Confidence mapping from confidence_percent integer to enum:
--   NULL/unset → 'own_estimate'
--   0-2        → 'invoice'       (very high confidence, actual invoice data)
--   3-7        → 'quote'         (formal quote received)
--   8-15       → 'professional_estimate'
--   16+        → 'own_estimate'  (low confidence rough estimate)

INSERT INTO work_item_budgets (
  id, work_item_id, planned_amount, confidence,
  budget_category_id, budget_source_id, vendor_id,
  created_by, created_at, updated_at
)
SELECT
  lower(
    hex(randomblob(4)) || '-' ||
    hex(randomblob(2)) || '-4' ||
    substr(hex(randomblob(2)), 2) || '-' ||
    substr('89ab', abs(random()) % 4 + 1, 1) ||
    substr(hex(randomblob(2)), 2) || '-' ||
    hex(randomblob(6))
  ) AS id,
  wi.id                              AS work_item_id,
  COALESCE(wi.planned_budget, 0)     AS planned_amount,
  CASE
    WHEN wi.confidence_percent IS NULL THEN 'own_estimate'
    WHEN wi.confidence_percent <= 2    THEN 'invoice'
    WHEN wi.confidence_percent <= 7    THEN 'quote'
    WHEN wi.confidence_percent <= 15   THEN 'professional_estimate'
    ELSE                                    'own_estimate'
  END                                AS confidence,
  wi.budget_category_id,
  wi.budget_source_id,
  (
    SELECT wv.vendor_id
    FROM work_item_vendors wv
    WHERE wv.work_item_id = wi.id
    LIMIT 1
  )                                  AS vendor_id,
  wi.created_by,
  wi.created_at,
  wi.updated_at
FROM work_items wi
WHERE wi.planned_budget IS NOT NULL
   OR wi.actual_cost IS NOT NULL
   OR wi.confidence_percent IS NOT NULL
   OR wi.budget_category_id IS NOT NULL
   OR wi.budget_source_id IS NOT NULL;

-- ── Step 3: Create additional budget lines for extra vendors ───────────────────
-- For work items that had multiple vendors linked, add a zero-amount budget line
-- for each additional vendor not already captured in Step 2.

INSERT INTO work_item_budgets (
  id, work_item_id, planned_amount, confidence,
  vendor_id, created_by, created_at, updated_at
)
SELECT
  lower(
    hex(randomblob(4)) || '-' ||
    hex(randomblob(2)) || '-4' ||
    substr(hex(randomblob(2)), 2) || '-' ||
    substr('89ab', abs(random()) % 4 + 1, 1) ||
    substr(hex(randomblob(2)), 2) || '-' ||
    hex(randomblob(6))
  ) AS id,
  wv.work_item_id,
  0,
  'own_estimate',
  wv.vendor_id,
  (SELECT wi.created_by FROM work_items wi WHERE wi.id = wv.work_item_id),
  datetime('now'),
  datetime('now')
FROM work_item_vendors wv
WHERE NOT EXISTS (
  SELECT 1
  FROM work_item_budgets wb
  WHERE wb.work_item_id = wv.work_item_id
    AND wb.vendor_id = wv.vendor_id
);

-- ── Step 4: Recreate invoices table with work_item_budget_id and new status ────
-- Changes:
--   • status enum: 'overdue' replaced by 'claimed'
--   • new column: work_item_budget_id (nullable FK to work_item_budgets)
-- Existing 'overdue' invoices are migrated to 'pending'.

CREATE TABLE invoices_new (
  id TEXT PRIMARY KEY,
  vendor_id TEXT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  invoice_number TEXT,
  amount REAL NOT NULL,
  date TEXT NOT NULL,
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'paid', 'claimed')),
  notes TEXT,
  work_item_budget_id TEXT REFERENCES work_item_budgets(id) ON DELETE SET NULL,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO invoices_new (
  id, vendor_id, invoice_number, amount, date, due_date,
  status, notes, created_by, created_at, updated_at
)
SELECT
  id, vendor_id, invoice_number, amount, date, due_date,
  CASE WHEN status = 'overdue' THEN 'pending' ELSE status END,
  notes, created_by, created_at, updated_at
FROM invoices;

DROP TABLE invoices;
ALTER TABLE invoices_new RENAME TO invoices;

CREATE INDEX idx_invoices_vendor_id ON invoices(vendor_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_date ON invoices(date);
CREATE INDEX idx_invoices_work_item_budget_id ON invoices(work_item_budget_id);

-- ── Step 5: Recreate work_items without budget columns ────────────────────────
-- Removes: planned_budget, actual_cost, confidence_percent,
--          budget_category_id, budget_source_id
-- These columns have been migrated to work_item_budgets in Steps 2–3.

CREATE TABLE work_items_new (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'not_started' CHECK(status IN ('not_started', 'in_progress', 'completed', 'blocked')),
  start_date TEXT,
  end_date TEXT,
  duration_days INTEGER,
  start_after TEXT,
  start_before TEXT,
  assigned_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO work_items_new (
  id, title, description, status,
  start_date, end_date, duration_days,
  start_after, start_before,
  assigned_user_id, created_by, created_at, updated_at
)
SELECT
  id, title, description, status,
  start_date, end_date, duration_days,
  start_after, start_before,
  assigned_user_id, created_by, created_at, updated_at
FROM work_items;

DROP TABLE work_items;
ALTER TABLE work_items_new RENAME TO work_items;

CREATE INDEX idx_work_items_status ON work_items(status);
CREATE INDEX idx_work_items_assigned_user_id ON work_items(assigned_user_id);
CREATE INDEX idx_work_items_created_at ON work_items(created_at);

-- ── Step 6: Drop work_item_vendors ────────────────────────────────────────────
-- Vendor associations are now tracked via work_item_budgets.vendor_id.

DROP TABLE work_item_vendors;

PRAGMA foreign_keys = ON;

-- Rollback notes:
-- This migration involves multiple table recreations and data migrations.
-- A clean rollback would require restoring from backup or applying a reverse migration.
-- Key reversals would include:
--   1. Recreate work_item_vendors from work_item_budgets.vendor_id data
--   2. Recreate work_items with the old budget columns (data loss for columns removed)
--   3. Drop work_item_budgets table
--   4. Recreate invoices without work_item_budget_id, with 'overdue' status
