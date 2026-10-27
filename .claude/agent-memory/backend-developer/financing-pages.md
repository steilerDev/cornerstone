---
name: financing-pages
description: #2242 financing/funding-source/grant backend entry points (moneyService getFinancing etc., grant item linking, grant chips, budget_source history)
metadata:
  type: project
---

- Money figures for the pages live at the end of `server/src/services/moneyService.ts` (`getFinancing`, `getSourceMoney`, `getGrantMoney`, `getGrantCoveredItems`); they reuse `buildSources`/`buildGrants` (one definition with the overview).
- Grant item linking: `subsidyProgramService.linkGrantItems` + private `linkItems` (shared with create-with-items, one transaction, `onConflictDoNothing`). Contract 2a is an add-only POST, not the originally planned replace-all PUT.
- List-row grant chips: `server/src/services/shared/itemGrantChips.ts` (one batched query per page).
- History `entityType=budget_source` filters on `metadata.budgetSourceId` of submission batches, not `source_entity_type`; batch collapse stays on.
- Migration 0049 renames only the system source still called "Discretionary Funding".
- Jest in the sandbox OOMs on node 22 default heap; run with `NODE_OPTIONS="--experimental-vm-modules --max-old-space-size=6000"` and `-w 1`.
