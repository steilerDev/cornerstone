-- Migration 0040: Add entry_type to invoice_deposits
--
-- Story #1876: Deposit refunds with negative claim adjustments
--
-- Adds entry_type ('deposit' | 'refund') to invoice_deposits. Existing rows
-- default to 'deposit', which is a no-op for all current data and all
-- existing aggregation formulas (regression-safe).
--
-- ROLLBACK: ALTER TABLE invoice_deposits DROP COLUMN entry_type;

ALTER TABLE invoice_deposits
  ADD COLUMN entry_type TEXT NOT NULL DEFAULT 'deposit'
  CHECK(entry_type IN ('deposit', 'refund'));
