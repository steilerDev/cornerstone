-- Migration 0049: "Own funds" (#2242, EPIC-21)
--
-- Data only, no schema change. The system funding source created by migration 0021 is renamed
-- from "Discretionary Funding" to "Own funds" so every surface (pickers, report wizard, history
-- rows) shows the new name. Only the system source (is_discretionary = 1) that still carries
-- the original name is touched: a source the user renamed keeps its name, and a regular source
-- that happens to be called "Discretionary Funding" stays as it is. Idempotent.

UPDATE budget_sources
SET name = 'Own funds',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE is_discretionary = 1
  AND name = 'Discretionary Funding';
