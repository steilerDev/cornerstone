---
name: bug-1808-totalreductions-cap
description: Test patterns for subsidySummary.totalReductions maximumAmount cap fix in budgetOverviewService
metadata:
  type: project
---

Bug #1808: `getBudgetOverview()`'s `subsidySummary.totalReductions` was a flat per-line running
total that never respected `subsidy_programs.maximum_amount`, while the sibling
`minTotalPayback`/`maxTotalPayback` fields (computed via `computeSubsidyEffects()` ->
`applySubsidyCaps()`) correctly clamped. Fix: accumulate `totalReductions` per-subsidy in a
`Map<string, number>`, then feed each subsidy's point-estimate total as **both** the min and max
input into the existing `applySubsidyCaps(perSubsidyTotals, subsidyMeta)` — the capped min/max
collapse to the same value, giving a capped scalar. Test file:
`server/src/services/budgetOverviewService.test.ts`, `describe('subsidy summary —
totalReductions maximumAmount cap (#1808)', ...)`, 6 scenarios (capped/uncapped percentage,
capped/uncapped fixed, mixed multi-subsidy, confidence-margin range invariant).

**Why this matters for future subsidy tests**: `insertSubsidyProgram()` test helper across
`budgetOverviewService*.test.ts` files didn't uniformly support `maximumAmount` — only the
`.vat.test.ts` sibling had it. Extended the main `budgetOverviewService.test.ts` helper to match
(optional `maximumAmount?: number | null`, defaults to `null`). Before this fix, zero
`maximumAmount` assertions existed anywhere in `budgetOverviewService*.test.ts` — this was a
pre-existing coverage gap on `applySubsidyCaps`'s clamp behavior, independent of the bug.

**Pre-existing engine quirk, flagged but out of scope**: `computeSubsidyEffects()`
(`subsidyCalculationEngine.ts:102-105`) computes fixed-subsidy payback as a flat
`minPayback = maxPayback = reductionValue` **per entity**, ignoring category matching and line
count — unlike `totalReductions`'s accumulation, which correctly divides across matching lines
and applies a per-line `Math.min(perLineAmount, costBasis)` clamp. For fixed subsidies with
multiple budget lines or category restrictions, `totalReductions` can legitimately be _less than_
`minTotalPayback`, breaking the `minTotalPayback <= totalReductions` invariant direction — this
is unrelated to `maximumAmount` capping. **Do not** write a range-invariant test for multi-line
or category-restricted fixed subsidies; keep such scenarios single-line and universal. Worth a
future backlog item if the team wants the payback engine to match `totalReductions`'s line-level
fidelity, but treat any such test as out of scope until that's fixed.

**Regression baseline**: before this fix, ~40 pre-existing `totalReductions` assertions in
`budgetOverviewService.test.ts` (none using `maximumAmount`) exercise the pass-through branch of
`applySubsidyCaps` (`meta.maximumAmount === null`) — they must stay byte-identical after any
similar refactor. Also re-run `budgetOverviewService.vat.test.ts`,
`.household.test.ts`, `.orphan.test.ts`, `.subsidyRecalculation.test.ts` as siblings that
exercise the same `getBudgetOverview()` subsidy code path.
