-- Convert existing unit-pricing budget lines (includes_vat = false) from
-- VAT-inclusive storage back to net amounts. Display now applies × 1.19.
UPDATE work_item_budgets
SET planned_amount = ROUND(planned_amount / 1.19, 2)
WHERE quantity IS NOT NULL AND includes_vat = 0;

UPDATE household_item_budgets
SET planned_amount = ROUND(planned_amount / 1.19, 2)
WHERE quantity IS NOT NULL AND includes_vat = 0;
