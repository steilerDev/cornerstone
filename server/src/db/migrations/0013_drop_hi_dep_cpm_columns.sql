-- Migration 0013: Remove CPM dependency_type and lead_lag_days from household_item_deps
-- Household items are zero-duration terminal nodes; all deps are treated as FS with 0 lag.
-- This simplification removes unnecessary complexity from the dependency model.

ALTER TABLE household_item_deps DROP COLUMN dependency_type;
ALTER TABLE household_item_deps DROP COLUMN lead_lag_days;
