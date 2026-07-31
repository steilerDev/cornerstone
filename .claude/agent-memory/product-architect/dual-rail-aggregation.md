---
name: dual-rail-aggregation
description: Rail A/Rail B tagged-deposit aggregation invariants for source reports (#1891/PR #1894) — the residual-denominator rule and the review heuristics that caught it
metadata:
  type: project
---

# Dual-Rail Deposit Aggregation (Story #1891, PR #1894)

Source reports allocate an invoice to a budget source via two independent rails.
`server/src/services/shared/depositAggregateUtils.ts` + `sourceReportService.ts`.

## The load-bearing invariant

**A tagged deposit loses only its pro-rata line apportionment. It stays in the residual denominator.**

- Rail A (`splitByDepositsExcludingTagged`): `residualFraction = (invoiceAmount − Σ non-refund deposit amounts) / invoiceAmount` over **all** deposits, tagged or not — byte-identical expression to legacy `splitByDeposits`. The `isTagged` filter applies **only** to the emitted `depositFractions`.
- Rail B (`sumTaggedDepositContributions*`): tagged deposits count 100% to their own source, signed by `entryType`.

**Why:** Rail B already credits the tagged money. Dropping it from the denominator too lets the residual re-absorb it → double-count. Original bug shipped a 1000€ invoice as 1400€ to the bank.

**Testable consequence:** summing `allocatedAmount` across all sources on a fully-line-covered invoice reconstructs the invoice amount exactly. Canonical fixture: 1000€ invoice, 600€ line→A, 400€ line→B, 150€ deposit tagged A ⇒ residual 0.85, A = 600×0.85+150 = 660, B = 400×0.85 = 340, Σ = 1000. Pin this invariant on any change here.

**Non-obvious corollary:** the residual fraction is _invoice-level_, so a deposit tagged to source A also reduces the Rail A share of a source-B line on the same invoice. That looks wrong at first glance; it is exactly what makes the rails reconcile.

## `isSplit`

UNION over two arms (budget-line sources via `work_item_budgets`/`household_item_budgets`, and `invoice_deposits.budget_source_id`), both `IS NOT NULL`-filtered, then `COUNT(DISTINCT source_id) > 1`. `UNION` not `UNION ALL` — a source reachable both ways must collapse to one.

## Review heuristics that earned their keep

1. **When a function is forked into an `XExcludingY` variant, diff its core formula against the original line by line.** The residual expression was the only divergence and the only bug. ~200 lines of near-duplicate logic, one of two copies wrong.
2. **A combined-rail test that puts the two rails on _different_ invoices proves nothing.** The original suite had exactly that and passed while the same-invoice case was off by 40%. Always demand the same-entity crossing case.
3. **Additive-only diffs (`@@ -N,3 +N,269 @@`, zero deletions) are strong containment** — verify with `git diff origin/beta...HEAD -- <file>` — but they only bound the blast radius to _new_ code paths. They say nothing about whether the new path is correct.
4. **Tests that assert a surprising number with a long apologetic comment are a smell.** The pre-fix test literally said "1400 … is intentionally MORE than the invoice amount". That comment was the bug report.

## Open follow-ups

- Collapse `splitByDeposits` / `splitByDepositsExcludingTagged` (and the two `computeStatusContribution*` pairs) behind `options.excludeTagged` once soaked. This round is the argument: the residual formula had to be verified in two places and only one was wrong.
- M1: N+1 in `getSourceReport` step j/d (per-invoice deposit + vendor fetches). Tolerable at scale, wrong pattern to copy.
- M3: `unallocatedInvoices` `NOT EXISTS` guard on tagged deposits is not status-qualified → an invoice whose only tagged deposit is out-of-slice appears nowhere. Visibility gap, not a money error.
- #1895 (HIGH) `markInvoicesClaimed` is invoice-scoped not source-scoped; #1896 quotation+pending-deposit 409s the batch; #1897 budget-lines drill-down is deposit-blind.
