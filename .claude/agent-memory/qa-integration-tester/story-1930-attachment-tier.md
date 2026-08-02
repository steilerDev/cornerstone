---
name: story-1930-attachment-tier
description: Attachment tier rules per report type (quotation->deposit->invoice) replace stage matching — new pure-util test file + sourceReportService.test.ts scenario replacement
metadata:
  type: project
---

Story #1930 (2026-08-02, branch feat/1930-attachment-tier-rules): backend-developer replaced
per-invoice stage matching in `sourceReportService.ts` step h with a report-type tier floor,
extracted to `server/src/services/shared/attachmentTierUtils.ts` (`ATTACHMENT_TIER`,
`REPORT_TYPE_TIER_FLOOR`, `isDocumentIncludedForReportType`).

**Test files**: new `attachmentTierUtils.test.ts` (14 tests, 100% coverage, table-driven 9-case
AC1 grid + 3 explicitly-named null-tier tests per AC4) and `sourceReportService.test.ts` scenarios
16a/16b/16c/16e (stale, asserted the removed stage-derivation) replaced with 4 new tests: scenario
16 (AC1 table-driven, 3 report types x 1 invoice-with-all-doc-types each), AC2 (quotation never in
claim), AC3 (deposit-only never in proof-of-funds), AC5 (status-independence — quotation-status vs
paid-status invoice filter identically). Kept 16d (documentId passthrough) and 17/18 (Paperless
ASN/title) verbatim — unaffected. Full file: 66 tests pass, sourceReportService.ts 100%
stmts/100% funcs/100% lines (93.18% branch — pre-existing gaps unrelated to this change, e.g.
Rail-B invoice-lookup null guards at L233-237).

**Gotcha for AC1 table-driven cross-report-type test**: the 3 report types have non-overlapping
target-status slices in places (`budget-overview` = all 4 statuses, `claim` = {pending,paid},
`proof-of-funds` = {claimed} only) — you cannot reuse one single invoice across all 3
`getSourceReport()` calls in one test, since no single status is in all 3 slices simultaneously
(e.g. 'paid' is in budget-overview+claim but not proof-of-funds; 'claimed' is in
budget-overview+proof-of-funds but not claim). Solution: a small helper that builds a fresh
source+invoice+all-4-doc-types combo per block, with a status valid for that block's report type,
scoped so `result.invoices` has exactly 1 entry (no need to filter by invoiceId).

AC6 regression guard (scenarios 8-15b: status-slice selection, isSplit, refund-adjustment,
zero-drop, unallocated) untouched and confirmed still green — no evidence the change leaked
beyond `documents[]` filtering.

**Round 2 (PO review follow-up, same day)**: PO flagged that the proof-of-funds blocks of
scenario 16 and the AC3 test were NOT change-detecting — a `claimed` no-deposit invoice hits the
old stage-derivation's default empty-stages branch too, so both would have passed on `beta`
unchanged. Added a genuinely discriminating fixture: `AC3 (discriminating)` — a **deposit-only**
invoice (no `invoice_budget_line` at all) whose sole **tagged** deposit is `claimed`, with a
`deposit`-typed document link. Under the OLD stage-derivation (`splitByDepositsExcludingTagged`
returns no entry when there's no Rail A row for the invoice → falls into the "no split" branch →
`stages.add('deposit')` fires purely because `railBContributions.has(invoiceId)`, independent of
report type) → old code would have KEPT the doc. Under the tier rule, proof-of-funds floor =
`invoice`(3) > `deposit`(2) → excluded. 81 tests total (was 80).

**Isolation technique used to prove it's discriminating** (since `attachmentTierUtils.ts` doesn't
exist on `beta`, a straight file swap fails at import resolution, not at the assertion): back up
the current (fixed) `sourceReportService.ts` to `/tmp`, edit the working copy in place to inline
the pre-#1930 stage-derivation logic (re-import `splitByDepositsExcludingTagged` from
`depositAggregateUtils.js`, replace the `isDocumentIncludedForReportType` call site with the old
`stages` Set computation copied from `git show origin/beta:...`), run *only* the new test via
`npx jest ... -t "AC3 \(discriminating\)"`, confirm it fails with the exact wrong-inclusion
diff, then `cp` the backup back over the working file and re-verify `git diff` is empty before
re-running the full suite. This isolates one specific fixture's discriminating power without
needing a parallel beta checkout or touching any other test.
