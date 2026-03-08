-- Migration 0017: Invoice-Budget-Line Junction Table (EPIC-15)
--
-- Replaces the 1:1 FK model (invoices.work_item_budget_id and
-- invoices.household_item_budget_id) with a many-to-many junction table
-- (invoice_budget_lines) that links multiple budget lines to one invoice,
-- each with an itemized_amount.
--
-- Key constraints:
--   - Each budget line can only be linked to ONE invoice (exclusive linking,
--     enforced via partial unique indexes)
--   - XOR: exactly one of work_item_budget_id / household_item_budget_id is non-null
--   - itemized_amount must be > 0
--
-- See ADR-018 for design rationale.
--
-- ROLLBACK (non-trivial due to table recreation — restore from backup):
--   DROP TABLE IF EXISTS invoice_budget_lines;
--   -- Then recreate invoices with the old FK columns via full table recreation

-- 1. Create the junction table
CREATE TABLE invoice_budget_lines (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  work_item_budget_id TEXT REFERENCES work_item_budgets(id) ON DELETE SET NULL,
  household_item_budget_id TEXT REFERENCES household_item_budgets(id) ON DELETE SET NULL,
  itemized_amount REAL NOT NULL CHECK(itemized_amount > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  -- XOR constraint: exactly one budget line FK must be non-null
  CHECK (
    (work_item_budget_id IS NOT NULL AND household_item_budget_id IS NULL) OR
    (work_item_budget_id IS NULL AND household_item_budget_id IS NOT NULL)
  )
);

-- Indexes for query performance
CREATE INDEX idx_invoice_budget_lines_invoice_id
  ON invoice_budget_lines(invoice_id);

CREATE INDEX idx_invoice_budget_lines_work_item_budget_id
  ON invoice_budget_lines(work_item_budget_id);

CREATE INDEX idx_invoice_budget_lines_household_item_budget_id
  ON invoice_budget_lines(household_item_budget_id);

-- Exclusive linking: a work item budget line can only appear in one invoice
CREATE UNIQUE INDEX idx_invoice_budget_lines_unique_wib
  ON invoice_budget_lines(work_item_budget_id)
  WHERE work_item_budget_id IS NOT NULL;

-- Exclusive linking: a household item budget line can only appear in one invoice
CREATE UNIQUE INDEX idx_invoice_budget_lines_unique_hib
  ON invoice_budget_lines(household_item_budget_id)
  WHERE household_item_budget_id IS NOT NULL;

-- 2. Migrate existing FK data into the junction table
-- Work item budget links: create a junction row with itemized_amount = invoice amount
INSERT INTO invoice_budget_lines (id, invoice_id, work_item_budget_id, household_item_budget_id, itemized_amount, created_at, updated_at)
SELECT
  lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6))) AS id,
  id AS invoice_id,
  work_item_budget_id,
  NULL,
  amount,
  datetime('now'),
  datetime('now')
FROM invoices
WHERE work_item_budget_id IS NOT NULL;

-- Household item budget links: create a junction row with itemized_amount = invoice amount
INSERT INTO invoice_budget_lines (id, invoice_id, work_item_budget_id, household_item_budget_id, itemized_amount, created_at, updated_at)
SELECT
  lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6))) AS id,
  id AS invoice_id,
  NULL,
  household_item_budget_id,
  amount,
  datetime('now'),
  datetime('now')
FROM invoices
WHERE household_item_budget_id IS NOT NULL;

-- 3. Recreate invoices table WITHOUT the budget FK columns
--    (SQLite does not support DROP COLUMN for columns with FK constraints
--     or indexes, so we use the standard table recreation pattern)
CREATE TABLE invoices_new (
  id TEXT PRIMARY KEY,
  vendor_id TEXT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  invoice_number TEXT,
  amount REAL NOT NULL,
  date TEXT NOT NULL,
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending', 'paid', 'claimed')),
  notes TEXT,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO invoices_new (id, vendor_id, invoice_number, amount, date, due_date,
  status, notes, created_by, created_at, updated_at)
SELECT id, vendor_id, invoice_number, amount, date, due_date,
  status, notes, created_by, created_at, updated_at
FROM invoices;

DROP TABLE invoices;
ALTER TABLE invoices_new RENAME TO invoices;

-- Recreate invoices indexes (without the old budget FK indexes)
CREATE INDEX idx_invoices_vendor_id ON invoices(vendor_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_date ON invoices(date);
