---
name: bug-1833-materialize-retry-dedup
description: E2E regression pattern for Bug #1833 (auto-itemize Save retry after a real commit failure created a duplicate WI/HI budget line) — how to force a genuine server-side commit failure and assert no duplicate create on retry.
metadata:
  type: project
---

## Bug #1833 — materialize-then-commit retry-dedup regression

**Root cause**: `materializeInlineDrafts` (`client/src/lib/autoItemizeDraftUtils.ts`) creates the
WI/HI budget line via a real POST *before* the atomic auto-itemize commit call. Pre-fix,
`setLines(mergeMaterializedLines(...))` was only called on the *materialize-failure* branch, not
the *materialize-success* branch — so if materialize succeeded but the subsequent commit failed,
React state never recorded `assignedBudgetLineId`. A Save retry re-ran `materializeInlineDrafts`
on the same stale draft and created a SECOND budget line. Fix: `setLines(prev =>
mergeMaterializedLines(prev, materialized.lines))` now runs unconditionally right after materialize
resolves, on both its success and failure paths, in both `AutoItemizePage.tsx` and
`PaperlessInvoiceReviewPage.tsx`.

**E2E regression tests**: `e2e/tests/budget/auto-itemize-inline-create.spec.ts` Scenario 4
(existing-invoice / AutoItemizePage flow), `e2e/tests/invoices/paperless-first-invoice.spec.ts`
Scenario 19 (new-invoice / PaperlessInvoiceReviewPage flow).

**Pattern — force a REAL (unmocked) server-side commit failure**: use the server's own
`ITEMIZED_SUM_EXCEEDS_INVOICE` Σ-guard (`persistLines`, `invoiceAutoItemizeService.ts:531`) instead
of mocking a failure. Set the invoice/metadata `amount` below the queued line's effective total
before Save #1 (genuine 400), then raise it above before Save #2 (genuine 200/201). Assert the
WI-budgets POST count stays at 1 across both attempts via a single `page.on('request')` counter
registered once, before either click — do NOT re-register between attempts, the whole point is
counting across both.

**Amount math**:
- `effectiveInvoiceAmount` passed into `persistLines` is the raw `body.invoice.amount` — no VAT
  gross-up applied to the invoice amount itself, only to line totals via `effectiveLineAmount`
  (`shared/src/types/budget.ts:141`: `Math.round(amount*1.19*100)/100` when `includesVat===false`).
- Existing-invoice flow: `TEST_LINE.totalAmount=200, includesVat:true` (in
  `auto-itemize-inline-create.spec.ts`) → itemized sum = 200 flat. Used invoice amount 100 (fail) →
  250 (pass).
- New-invoice flow: `MOCK_EXTRACTED_LINES[0]` = `totalAmount:900, includesVat:false` → effective
  gross = 900*1.19 = 1071. Used `#amount` field 500 (fail) → 1200 (pass).

**Transaction asymmetry that IS the bug**: `commitAutoItemizeCreate` (new-invoice flow) wraps
invoice + document_links + line persistence in one `db.transaction()` — a mid-transaction throw
rolls back ALL of it (no orphan invoice/document-link/junction rows), but the earlier separate
WI-budget POST is NOT part of that transaction and survives. Same is true for the existing-invoice
flow's `POST /api/invoices/:id/auto-itemize` commit endpoint.

**Other notes**:
- `document_links` unique index is `(entityType, entityId, paperlessDocumentId)` — safe to reuse the
  same fake `paperlessDocumentId` (e.g. `MOCK_DOC_1.id = 9001`) across many different real invoices
  in parallel tests; only collides if the same invoice tries to link the same doc twice.
- Scenario 19 was the FIRST scenario in `paperless-first-invoice.spec.ts` to let
  `/api/invoices/auto-itemize/commit` hit the real server — every prior scenario used `mockCommit`.
  Confirmed no existing helper conflicts; `mockPreview`'s lines + a real vendor/work-item are
  sufficient, no `mockCommit` call needed, and no `linkDocumentToInvoiceViaApi` pre-seed needed
  either (the new-invoice commit endpoint creates its own `document_links` row internally).
- `PaperlessInvoiceReviewPage`'s `metadataEdits.amount` is seeded ONCE from `computedTotal` in the
  initial load effect and is NOT recomputed/reset by the `setLines` calls in `handleSave` — safe to
  `.fill('#amount', ...)` before Save #1 and again before Save #2 without it snapping back to the
  computed default.
- Both pages expose the amount field as `#amount` with no POM getter in `PaperlessInvoiceReviewPage.ts`
  (raw `page.locator('#amount')` is the established pattern there); `AutoItemizePage.ts` already has
  `totalAmountInput` / `getMetadataAmountInput()`.
