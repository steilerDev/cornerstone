-- Story #741: Unit pricing and VAT columns for budget lines
ALTER TABLE work_item_budgets ADD COLUMN quantity REAL;
ALTER TABLE work_item_budgets ADD COLUMN unit TEXT;
ALTER TABLE work_item_budgets ADD COLUMN unit_price REAL;
ALTER TABLE work_item_budgets ADD COLUMN includes_vat INTEGER;

ALTER TABLE household_item_budgets ADD COLUMN quantity REAL;
ALTER TABLE household_item_budgets ADD COLUMN unit TEXT;
ALTER TABLE household_item_budgets ADD COLUMN unit_price REAL;
ALTER TABLE household_item_budgets ADD COLUMN includes_vat INTEGER;
