---
name: per-line-payment-attribution
description: ADR-039 §5 amendment (#2237) - per-line Paid/Still to pay attribution, the sub-cent reconciliation trap, and why breakdown By-source Paid differs from per-source (Rail A/B) Paid
metadata:
  type: project
---

Per-line Paid / Still to pay (#2237, ADR-039 §5, API Contract EPIC-21 contract 25): each record's
Paid (`aggregateInvoiceStatusBreakdown` paid+claimed) and open amount are split over its links by
itemized cents, plus the engine's `notYetSplitByInvoice` remainder as one weight, largest remainder.

- **Sub-cent trap:** invoice/deposit `amount` schemas have no `multipleOf`, so stored amounts can be
  finer than a cent. `computePayments` rounds once per record type; per-record `toCents` then summing
  can differ by a few cents. The ADR requires reconciling the drift onto the largest-|P| record.
  **How to apply:** any new per-record decomposition of a project money figure needs this reconcile
  step or an exactness test on a sub-cent fixture.
- **Tagged payments (owner decision, 2026-10-25, option B):** a progress payment tagged to source S
  goes to its record's lines of S only (by itemized cents); with no S line on the record it stays in
  the untagged split. Untagged = reconciled record figure minus matched tagged shares, so drift never
  touches a tagged share. Remaining gaps vs the funding-source pages (Rail A/B): own funds there also
  sweeps Unassigned lines + all remainders; unmatched tags; over-itemizing; float rounding (ADR-039 §5
  steps 4-6, contract 25 rule 6). **How to apply:** in 4.10 Financing reviews, check which meaning a
  "Paid" per source shows; the canonical 1000/600A/400B/150-tagged-A fixture must give 660/340 both ways.
- **Response schemas:** none on the money read routes (fast-json-stringify would strip unlisted
  nested fields); shape pinned by shared types + route key assertions (contract 25 rule 8).
- One link per line is enforced by unique indexes on `invoice_budget_lines` (work/household budget id),
  so "if several links" branches are dead code.

Related: [[dual-rail-aggregation]], [[source-report-split-inference]].
