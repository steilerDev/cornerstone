-- Migration 0011: Add household_item_budget_id to invoices
ALTER TABLE invoices ADD COLUMN household_item_budget_id TEXT
  REFERENCES household_item_budgets(id) ON DELETE SET NULL;

CREATE INDEX idx_invoices_household_item_budget_id
  ON invoices(household_item_budget_id);
