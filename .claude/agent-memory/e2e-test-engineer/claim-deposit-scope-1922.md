---
name: claim-deposit-scope-1922
description: PR #1922 (Issues #1895/#1896/#1918/#1891) invoice/deposit claim-scope split — copy changes, server truth for claim counts, and the deposit-only close-out E2E path.
metadata:
  type: project
---

Fix-loop round 1 for PR #1922 (`fix/1895-1918-claim-deposit-scope`) landed a claim-scope split in
`ReportWizardPage.tsx`'s `handleMarkClaimed` — CI shard 2/16 caught stale i18n-copy assertions in
`e2e/tests/budget/reportWizardEditableContent.spec.ts` Scenario 10.

**New semantics** (`client/src/pages/ReportWizardPage/ReportWizardPage.tsx`):

- `handleMarkClaimed` submits TWO separate arrays: `invoiceIds` (included invoices with ZERO
  excluded lines — any excluded line drops the invoice out entirely) and `depositIds` (all
  non-`claimed` deposits of included invoices, deliberately INCLUDING deposits belonging to
  invoices that got dropped from `invoiceIds`).
- If both computed arrays are empty, the client shows `sourceReports.claimNothingClaimable`
  ("Nothing can be marked as claimed: all selected invoices have excluded line items and there
  are no unclaimed deposits.") as the `claimErrorBanner` and closes the confirm modal WITHOUT
  calling the API. This guard runs synchronously inside the confirm-button handler, not the
  "Mark Claimed" button that opens the modal — the modal (and its `#1891` excluded-lines
  warning block) still opens/renders even when the eventual submit will be a no-op.
- Otherwise the SERVER (`markInvoicesClaimed` in `server/src/services/sourceReportService.ts`)
  decides what actually flips: an invoice only flips to `claimed` if its status is
  pending/paid AND it has no OTHER-source budget-line interest (checked via a join query) —
  an invoice can be validly _requested_ in `invoiceIds` (e.g. a quotation invoice, or one with
  cross-source funding) and still not appear in the response's `claimedInvoiceIds`. The success
  banner (`sourceReports.claimSuccess`, key `claimSuccessBanner`) reads
  `"{{invoices}} invoice(s) and {{deposits}} deposit(s) marked as claimed"` using the SERVER's
  `response.claimedInvoiceIds.length`/`claimedDepositIds.length` — NOT the client's request
  counts. Always trace both through the server logic before writing an E2E assertion; the two
  numbers frequently diverge (deposit-only close-out, cross-source funding, quotation invoices).
- `confirmClaimExcludedItemsWarning` copy changed to "…have excluded line items and will keep
  their current claim status — the excluded portion stays claimable in a future report." Match
  on a resilient prefix regex (`/^1 invoice\(s\) have excluded line items/`), not the old
  "will be claimed in full" wording.

**Three distinct "deposit only surfaces the invoice" shapes** — don't conflate them when writing
fixtures:

1. Zero-line source (`reportWizardExpansion.spec.ts` Scenario 5/8): the reported source never had
   a budget line for this invoice at all — Rail B (tagged deposit) is the ONLY way the invoice
   enters the report.
2. Cross-source funding (Scenario 9, Issue #1895): the invoice's budget line is funded by a
   DIFFERENT source; the server's other-source-interest check blocks the invoice from flipping
   even though the client legitimately requested it.
3. Manual UI exclusion (NEW Scenario 11, the architect's originally-blocked flow): the invoice's
   budget line IS funded by the reported source itself, but the user unchecks it via the Items
   sub-table's `itemExclusionCheckbox` — the CLIENT drops the invoice from `invoiceIds` before
   the request is even sent (line exclusion, not a funding conflict). Reached via
   `wizard.invoiceExpandToggle(...).click()` then `wizard.itemExclusionCheckbox(...).click()`.

**Deposit re-fetch for assertions**: no single-deposit GET endpoint exists — use
`GET /api/invoices/:invoiceId/deposits` (returns `{ deposits: [...] }`) and find by `id`.

Files touched this round: `e2e/tests/budget/reportWizardEditableContent.spec.ts` (Scenario 10
rewritten to hit the both-empty guard instead of a success banner — its fixture, one invoice with
a partially-excluded line and no deposits, has empty `invoiceIds` AND empty `depositIds`),
`e2e/tests/budget/reportWizardExpansion.spec.ts` (Scenario 10's stale `'2 invoice(s) marked as
claimed'` fixed to `'1 invoice(s) and 1 deposit(s) marked as claimed'`; NEW Scenario 11 added for
the manual-exclusion deposit-only shape), `e2e/tests/budget/reportWizard.spec.ts` (Scenario 1's
stale success-banner text fixed to `'2 invoice(s) and 0 deposit(s) marked as claimed'` — that
fixture has no deposits at all), `e2e/pages/ReportWizardPage.ts` (class docstring updated with the
claim-scope-split reference notes above, for future scenario authors).

Not yet re-verified against a live CI run at the time this note was written — Playwright browser
binaries are still undownloadable in this sandbox class (see
[[sandbox-live-verification]]), so validation was static only: `tsc --noEmit` (zero errors in the
touched files; the pre-existing container/page-object errors elsewhere in `e2e/` are unrelated),
targeted `eslint`/`prettier` clean. Defer actual pass/fail to CI shard 2/16 on the next push.
