---
name: recurring-patterns
description: Cross-cutting correctness traps in Cornerstone that have bitten more than once — polymorphic FK cleanup, CONFIDENCE_MARGINS units, SQLite XOR CHECK vs SET NULL, N+1 sites accepted at current scale
metadata:
  type: project
---

# Recurring Patterns & Traps

## Polymorphic FK cleanup

Polymorphic FKs carry no DB-level constraint, so **every** service that deletes the referenced entity
must clean up manually. Applies to `document_links` and `household_item_deps`. Caught as a defect on
PR #416 (orphaned deps on work-item/milestone delete). Check this on any new polymorphic reference.

## CONFIDENCE_MARGINS are fractions, not percentages

Values are `0.2 / 0.1 / 0.05 / 0`. The frontend must multiply by 100 for display. Shipped as a display
bug once (PR #401).

## SQLite: XOR CHECK is incompatible with ON DELETE SET NULL (bug #611)

SQLite enforces CHECK constraints *during* the FK SET NULL action. Given
`CHECK((a IS NOT NULL AND b IS NULL) OR (b IS NOT NULL AND a IS NULL))` plus `ON DELETE SET NULL` on `a`,
deleting the referenced row fires SET NULL, which then violates the XOR CHECK and aborts.
**Use ON DELETE CASCADE instead.** This is why `invoice_budget_lines` (ADR-018) cascades.

## Forked-function drift

When a function is forked into an `XExcludingY` / `XWithZ` variant rather than parameterised, diff the
core formula against the original line by line — that divergence is where the bug will be. Seen on
`splitByDepositsExcludingTagged` (PR #1894), where the residual expression was the sole difference and
the sole defect. Prefer an options flag over a fork; when a fork ships anyway, file the collapse follow-up.

## Test smells worth escalating in review

- A combined-path test that places the two interacting entities on **different** parents proves nothing
  about the crossing case. Demand the same-parent fixture.
- An assertion of a surprising number wrapped in a long apologetic comment is usually a bug report in
  disguise (pre-fix #1894 test literally said "1400 … is intentionally MORE than the invoice amount").
- Additive-only diffs (`@@ -N,3 +N,269 @@`, zero deletions) bound blast radius to new code paths but say
  nothing about the new path's correctness. Verify with `git diff origin/beta...HEAD -- <file>`.

## N+1 queries accepted at current scale (<5 users)

Not bugs, but do not let them become the copied pattern:

- `getAllMilestones`: per-row `countLinkedWorkItems` + `getCreatedByUser`
- `sourceReportService.getSourceReport` steps d/j: per-invoice deposit fetch + per-Rail-B-invoice vendor lookup (PR #1894 M1)
