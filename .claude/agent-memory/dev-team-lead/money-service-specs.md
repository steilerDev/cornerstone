---
name: money-service-specs
description: Hazards when speccing a "one computation" money/aggregate story — hidden duplicate computations, scenario-vs-order naming, required shared fields vs client test literals, hand-verified fixtures
metadata:
  type: feedback
---

#2228 (ADR-039 money service) taught four things the plan and issue text did not say:

1. **Count every computation by grepping the inputs, not the names the plan lists.** The plan said "three grant computations"; grepping `reduction_value|reductionValue` found five (overview ×2, breakdown, per-item payback factory, Purchases `subsidyReduction`). An AC like "one computation replaces …" covers them all.
2. **Range fields name scenarios, not order.** With a cap, a per-item share in the low-cost scenario can exceed the high-cost one. Mapping legacy `min*/max*` by min()/max() breaks "items sum to total"; map them by scenario (best/worst) and document it.
3. **A required field on a shared response type breaks client test literals under tsc** (CostBreakdownTable.test.tsx had 20 BudgetBreakdown literals). Prefer one new top-level object over per-row fields, and list the client test files for QA in the spec.
4. **Compute the regression fixture's expected values yourself, with a script, before handing it to QA** (largest-remainder cents, caps, rails). Hand math slipped nowhere because node verified it.

Also: an ADR named in the orchestrator's prompt as "to write" may already exist (ADR-039 was accepted in planning) — amend it, don't renumber.

**How to apply:** in any aggregate/"single source of truth" spec, grep the raw columns, define scenario semantics explicitly, and check type-literal blast radius (`grep -rc "<field>:" client/src`). Related: [[read-time-projection-specs]], [[unmodified-tests-constraint]]
