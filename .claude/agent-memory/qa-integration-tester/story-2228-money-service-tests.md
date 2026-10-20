---
name: story-2228-money-service-tests
description: Story #2228 money service tests - AC8 fixture via buildApp, grant-status default flip, discretionary rails quirk, client literal patching
metadata:
  type: project
---

Money service (ADR-039) test lessons.

- **Grant rule flip ripple**: changing every subsidy helper default `?? 'eligible'` to `?? 'approved'` (one sed, rule comment on the line) fixed ~140 of ~150 failing legacy tests at once; only tests that assert eligible/applied counting, fixed-grant per-line cost caps or totals over all four statuses needed real edits. Do the default flip first, then inventory residual failures.
- **Fixture test**: seed with drizzle inserts into `buildApp()`'s `app.db` (VAT_RATE env 0.19), one `beforeAll` per describe, read-only assertions; a second describe re-seeds for the "step 2" mutation. Reusing a `describeConsistency(getCtx)` function in both avoids drift. All spec figures matched the backend on the first run.
- **Discretionary rails** (`computeDiscretionaryInvoiceAmount`) count unitemized remainders, lines with a NULL `budget_source_id` AND lines assigned to `discretionary-system` by id (fixed in review); with no own-funds row only NULL counts.
- **Filtered breakdown** (`?deselectedSources=`): an item whose only line is deselected disappears from the legacy rows (assert absence, not 0).
- Branches that cannot be hit: `invoice_budget_lines` has a CHECK (one of the two line ids set) and unique indexes (one link per line), so `lineId !== null` else and the `?? 0` accumulate in `loadMoneyInput` are unreachable; `g.input.maximumAmount ?? 0` for a capped grant is unreachable (capped implies a cap).
- **Client typed literals**: patch many literals by feeding `tsc` error positions (line, col) to a script that inserts the missing field after the next `{`; base consts (`emptyBreakdown`) are fixed by hand first so spreads inherit it. Run prettier afterwards.
- Engine is pure and testable with a seeded LCG table (50 inputs) for invariants (verdict never tight, shares sum to payout, roots + null = by type).
- Legacy fixed grants (owner decision, restored): value per item, split equally over eligible lines, each part capped at line cost, sum capped by maximum_amount; an item with no eligible line pays 0 (old tests that expected the flat value on a line-less item now expect 0).
