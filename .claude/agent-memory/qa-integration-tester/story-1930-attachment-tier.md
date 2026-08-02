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
