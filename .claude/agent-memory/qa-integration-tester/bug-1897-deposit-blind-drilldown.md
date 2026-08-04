---
name: bug-1897-deposit-blind-drilldown
description: Issue #1897 — getBudgetSourceBudgetLines was deposit-blind; fix routes through getInvoiceAggregates; 7 integration tests added at end of budgetSourceService.test.ts
metadata:
  type: project
---

## Fix

`buildWorkItemBudgetLine` and `buildHouseholdItemBudgetLine` in `budgetSourceService.ts` previously used a deposit-blind local SQL helper to compute `actualCostPaid` and `hasClaimedInvoice`. The fix routes both through `getInvoiceAggregates(db, line.id, 'work_item_budget_id' | 'household_item_budget_id')` from `budgetServiceFactory.ts`, which uses `computeDepositAwareAggregates`.

Rider fix: `computeDiscretionaryInvoiceAmount` changed `new Set([status === 'claimed' ? 'claimed' : 'paid'])` → `new Set([status])`. Behavior is identical for 'paid'/'claimed' (the only caller-supplied values).

**Why:** Pre-fix, a pending invoice with a €400 paid deposit returned `actualCostPaid = 0` in the drill-down view.

## Tests added

File: `server/src/services/budgetSourceService.test.ts` — new `describe('deposit-aware drill-down — getBudgetSourceBudgetLines (#1897)')` appended at end of outer describe (before final `});`).

7 tests (AC1–AC7):
- AC1: reproduction — pending invoice + paid deposit → `actualCostPaid = 400`, `actualCost = 1000`
- AC2: pending invoice, no deposits → `actualCostPaid = 0` (no regression)
- AC3: paid invoice, no deposits → `actualCostPaid = 800` (no regression)
- AC4: claimed invoice → `hasClaimedInvoice = true`, `actualCostPaid = 600`
- AC5: pending invoice + claimed deposit → `hasClaimedInvoice = true`, `actualCostPaid = 300`
- AC6: household item variant — pending invoice + paid deposit → `householdItemLines[0].actualCostPaid = 500`
- AC7: rider regression — `computeDiscretionaryInvoiceAmount` via `getBudgetSourceById` on `discretionary-system` source

Local helpers defined in the new describe scope:
- `insertInvoiceForWILine(budgetLineId, amount, status)` — vendor + invoice + ibl (workItemBudgetId FK)
- `insertDeposit(invoiceId, amount, status)` — plain deposit, budgetSourceId=null
- `insertInvoiceForHILine(budgetLineId, amount, status)` — vendor + invoice + ibl (householdItemBudgetId FK)

## Coverage

Changed functions (`buildWorkItemBudgetLine`, `buildHouseholdItemBudgetLine`, `computeDiscretionaryInvoiceAmount`) fully covered. Overall `budgetSourceService.ts` file: 82% (moveBudgetSourceBudgetLines and compareBudgetSourceLines bring average down — unrelated to fix).

## Worktree symlink needed

Test run required creating symlinks first:
```bash
ln -sf /main/node_modules /worktree/node_modules
ln -sf /main/server/node_modules /worktree/server/node_modules
```
Then: `NODE_OPTIONS=--experimental-vm-modules npx jest server/src/services/budgetSourceService.test.ts --maxWorkers=1`
