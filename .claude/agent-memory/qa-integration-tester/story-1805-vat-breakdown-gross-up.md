---
name: story-1805-vat-breakdown-gross-up
description: VAT gross-up bugfix (#1805) for budgetBreakdownService/budgetOverviewService — fixed-subsidy math location, spec inaccuracies found, coverage gaps to check
metadata:
  type: project
---

Issue #1805: `GET /api/budget/breakdown` didn't gross up `includes_vat=false` (net-stored)
budget lines by x1.19 the way `budgetOverviewService.ts` already did, understating projections/
subsidy-payback/per-source totals by 19% for net-stored lines. Fix added `includes_vat` to both
row SELECTs in `budgetBreakdownService.ts`, a thin `effective()` adapter delegating to the shared
`effectivePlannedAmount()`, and routed it through all `computeLineProjected` call sites + subsidy-
engine inputs + `addSourcePayback` weighting. `budgetOverviewService.ts`'s pre-existing local
`effective()` was refactored to delegate to the same shared helper (behavior-preserving, not a bug
fix in that file).

Test files: `server/src/services/budgetBreakdownService.vat.test.ts` (12 scenarios),
`server/src/services/budgetOverviewService.vat.test.ts` (scenarios 13-14 + a bonus test).

**Two inaccuracies found in the dev-team-lead's QA spec — verified against actual code before
writing tests, wrote tests to match real behavior instead of the spec's illustration:**

1. Spec's manual-trace claimed `confidence: 'own_estimate'` has "0% margin". Actually
   `CONFIDENCE_MARGINS.own_estimate = 0.2` (20%) — only `'invoice'` confidence is 0%. Used the
   correct 20%-margin math throughout (e.g. plannedAmount=100, includesVat=false → effective=119,
   own_estimate → min=95.2/max=142.8) rather than forcing a 0%-margin confidence just to get a
   round number.

2. Spec's scenario 7 described a "fixed subsidy capped at `Math.min(perLineAmount, costBasis)`"
   interaction in `budgetBreakdownService.ts`. **That cap does not exist there.** In
   `budgetBreakdownService.ts`, fixed-subsidy payback flows through
   `subsidyCalculationEngine.ts`'s `computeSubsidyEffects()`, whose `else` branch for
   `reductionType==='fixed'` just sets `minPayback=maxPayback=reductionValue` — a flat per-entity
   amount, completely unrelated to any line's plannedAmount/cost basis (no `Math.min` at all).
   The `Math.min(perLineAmount, costBasis)` cap the spec described **actually lives in
   `budgetOverviewService.ts` line ~300** (`totalReductions` computation, a parallel/duplicate
   subsidy-math implementation from the one in the engine). Wrote scenario 7 in the breakdown
   file to test the real interaction (subsidyPayback flat/unaffected, but rawProjectedMin/Max
   cost-basis correctly grossed up), and added a bonus test in the overview file
   (`totalReductions applies the fixed-subsidy per-line cap against the grossed-up cost basis`)
   to actually exercise the `Math.min` cap the spec was describing, in the file where it lives.

**Coverage gotcha**: the two per-source unfiltered projection loops (WI at line ~1163, HI at
~1202 in `budgetBreakdownService.ts`) are genuinely separate code paths from the main
entity-aggregation loop — a fix applied to only one still passes tests that only exercise the
other. Needed an explicit HI-with-budgetSourceId fixture (not just WI) to hit the HI per-source
loop's `effective(row)` call for coverage. The WI/HI subsidy-payback `effective({...})` wrapping
(lines ~734/748/921/935) is evaluated eagerly as a map() argument before `computeEntitySubsidyPayback`
short-circuits on "no linked subsidy" — so it's covered by ANY WI/HI item test, not just
subsidy-linked ones.

**`includes_vat` is `NOT NULL DEFAULT 1`** (schema.ts:379,777, migration 0031_includes_vat_not_null.sql)
— genuinely impossible to construct a NULL row via any insert path (ORM or raw SQL), so the
"null → true" branch of `effective()`/`effectivePlannedAmount()` is defensive/unreachable code.
Tested this by asserting a raw `sqlite.prepare(...INSERT...includes_vat...NULL...)` throws
`NOT NULL constraint failed`, rather than skipping the scenario — proves the branch really is
unreachable rather than just "not tested".

See also [[test-patterns-reference]] for the jest-must-run-from-repo-root gotcha (re-confirmed
here: running `npx jest <file>` from inside `server/` picks up babel and fails with
`SyntaxError: Unexpected token, expected "from"` on `import type` — must run from repo root where
`jest.config.ts` lives).
