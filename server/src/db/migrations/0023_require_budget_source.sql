-- Backfill NULL budget_source_id to discretionary-system in work_item_budgets
UPDATE work_item_budgets
SET budget_source_id = 'discretionary-system'
WHERE budget_source_id IS NULL;

-- Backfill NULL budget_source_id to discretionary-system in household_item_budgets
UPDATE household_item_budgets
SET budget_source_id = 'discretionary-system'
WHERE budget_source_id IS NULL;
