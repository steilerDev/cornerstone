-- Migration 0028: Add 'quotation' status to invoices table
-- 'quotation' represents a formal quote (not yet an actual cost).
--
-- NOTE: SQLite does not support altering CHECK constraints on existing tables.
-- Full table recreation is required for schema changes.
-- Foreign keys are disabled during the migration to allow table renames.

PRAGMA foreign_keys = OFF;

-- ── Step 1: Recreate invoices table with updated status enum ────────────────

CREATE TABLE invoices_new (
  id TEXT PRIMARY KEY,
  vendor_id TEXT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  invoice_number TEXT,
  amount REAL NOT NULL,
  date TEXT NOT NULL,
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'paid', 'claimed', 'quotation')),
  notes TEXT,
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
  status, notes, created_by, created_at, updated_at
FROM invoices;

DROP TABLE invoices;
ALTER TABLE invoices_new RENAME TO invoices;

CREATE INDEX idx_invoices_vendor_id ON invoices(vendor_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_date ON invoices(date);

-- ── Step 2: Recreate invoice_budget_lines table (has FK to invoices) ────────

CREATE TABLE invoice_budget_lines_new (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  work_item_budget_id TEXT REFERENCES work_item_budgets(id) ON DELETE CASCADE,
  household_item_budget_id TEXT REFERENCES household_item_budgets(id) ON DELETE CASCADE,
  itemized_amount REAL NOT NULL CHECK(itemized_amount > 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (
    (work_item_budget_id IS NOT NULL AND household_item_budget_id IS NULL) OR
    (work_item_budget_id IS NULL AND household_item_budget_id IS NOT NULL)
  )
);

INSERT INTO invoice_budget_lines_new (
  id, invoice_id, work_item_budget_id, household_item_budget_id,
  itemized_amount, created_at, updated_at
)
SELECT
  id, invoice_id, work_item_budget_id, household_item_budget_id,
  itemized_amount, created_at, updated_at
FROM invoice_budget_lines;

DROP TABLE invoice_budget_lines;
ALTER TABLE invoice_budget_lines_new RENAME TO invoice_budget_lines;

CREATE INDEX idx_invoice_budget_lines_invoice_id ON invoice_budget_lines(invoice_id);
CREATE UNIQUE INDEX idx_invoice_budget_lines_work_item_budget_id
  ON invoice_budget_lines(work_item_budget_id)
  WHERE work_item_budget_id IS NOT NULL;
CREATE UNIQUE INDEX idx_invoice_budget_lines_household_item_budget_id
  ON invoice_budget_lines(household_item_budget_id)
  WHERE household_item_budget_id IS NOT NULL;

PRAGMA foreign_keys = ON;
