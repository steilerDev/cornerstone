-- Migration 0044: Add budget_source_id to invoice_deposits
-- Story #1891: direct optional deposit→source link (deliberately NOT via budget lines).
-- Nullable, no backfill. Tagged deposit contributes 100% to its source in status-sliced
-- rollups even with zero budget lines for that source (see depositAggregateUtils.ts).
-- ROLLBACK: ALTER TABLE invoice_deposits DROP COLUMN budget_source_id;
ALTER TABLE invoice_deposits ADD COLUMN budget_source_id TEXT REFERENCES budget_sources(id) ON DELETE SET NULL;
CREATE INDEX idx_invoice_deposits_budget_source_id ON invoice_deposits (budget_source_id);
