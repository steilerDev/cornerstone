-- Migration 0032: Add invoice_deposits table
--
-- Adds staged deposit tracking for invoices. A deposit represents a
-- partial payment due within a single parent invoice. Cascade-deletes
-- with the parent invoice. Both vendor-scoped and standalone invoice
-- routes share the same invoices table, so a single deposits table covers
-- both URL flavours.

CREATE TABLE invoice_deposits (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount REAL NOT NULL CHECK(amount > 0),
  due_date TEXT NOT NULL,
  paid_date TEXT,
  claimed_date TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending', 'paid', 'claimed')),
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_invoice_deposits_invoice_id
  ON invoice_deposits (invoice_id);
