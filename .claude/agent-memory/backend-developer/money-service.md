---
name: money-service
description: ADR-039 money service layout (#2228): integer-cent engine, scenarios, largest-remainder split, who consumes it
metadata:
  type: project
---

Money figures come only from `server/src/services/shared/moneyEngine.ts` (pure, integer cents, `computeMoney`, `computePayments`, `largestRemainderSplit` with BigInt) and `server/src/services/moneyService.ts` (DB reads, `computeProjectMoney`, `getBreakdownMoney`, `getItemGrantPayback`, `getExpectedGrantsByHouseholdItem`). `subsidyCalculationEngine.ts` is deleted.

- `best`/`worst` name scenarios, not an order: a capped grant's per-item share can have best > worst.
- Only approved/received grants count (`counted`); eligible/applied are `possibleGrants`.
- Linked lines (any `invoice_budget_lines` row, offers included) cost their itemized face value in every scenario.
- Ready to submit = `getDrawDownSet` in `sourceReportService.ts` (shared predicate/combiner with the bank report); Still to pay = `computeOpenAmounts`.
- A new money figure goes into the service, never into a route or another service.
- Worktree typecheck of server needs `npx tsc -p shared` first (shared/dist is what `@cornerstone/shared` resolves to).
