-- EPIC-15 Story 15.1: Invoice-Budget-Line Junction Table
-- Replaces the 1:1 FK model (invoices.work_item_budget_id / household_item_budget_id)
-- with a many-to-many invoice_budget_lines junction table.
-- See ADR-018 for architectural rationale.

PRAGMA foreign_keys = OFF;

-- Step 1: Create invoice_budget_lines junction table
CREATE TABLE invoice_budget_lines (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  work_item_budget_id TEXT REFERENCES work_item_budgets(id) ON DELETE SET NULL,
  household_item_budget_id TEXT REFERENCES household_item_budgets(id) ON DELETE SET NULL,
  itemized_amount REAL NOT NULL CHECK(itemized_amount > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (work_item_budget_id IS NOT NULL AND household_item_budget_id IS NULL) OR
    (work_item_budget_id IS NULL AND household_item_budget_id IS NOT NULL)
  )
);

CREATE INDEX idx_invoice_budget_lines_invoice_id
  ON invoice_budget_lines(invoice_id);

CREATE UNIQUE INDEX idx_invoice_budget_lines_work_item_budget_id
  ON invoice_budget_lines(work_item_budget_id)
  WHERE work_item_budget_id IS NOT NULL;

CREATE UNIQUE INDEX idx_invoice_budget_lines_household_item_budget_id
  ON invoice_budget_lines(household_item_budget_id)
  WHERE household_item_budget_id IS NOT NULL;

-- Step 2: Migrate existing 1:1 FK data into junction rows
-- For work_item_budget_id links:
INSERT INTO invoice_budget_lines (
  id, invoice_id, work_item_budget_id, household_item_budget_id,
  itemized_amount, created_at, updated_at
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
  id AS invoice_id,
  work_item_budget_id,
  NULL AS household_item_budget_id,
  amount AS itemized_amount,
  created_at,
  updated_at
FROM invoices
WHERE work_item_budget_id IS NOT NULL;

-- For household_item_budget_id links:
INSERT INTO invoice_budget_lines (
  id, invoice_id, work_item_budget_id, household_item_budget_id,
  itemized_amount, created_at, updated_at
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
  id AS invoice_id,
  NULL AS work_item_budget_id,
  household_item_budget_id,
  amount AS itemized_amount,
  created_at,
  updated_at
FROM invoices
WHERE household_item_budget_id IS NOT NULL;

-- Step 3: Recreate invoices table without budget FK columns
CREATE TABLE invoices_new (
  id TEXT PRIMARY KEY,
  vendor_id TEXT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  invoice_number TEXT,
  amount REAL NOT NULL,
  date TEXT NOT NULL,
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'paid', 'claimed')),
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

-- Recreate indexes on invoices (without budget FK indexes)
CREATE INDEX idx_invoices_vendor_id ON invoices(vendor_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_date ON invoices(date);

PRAGMA foreign_keys = ON;
