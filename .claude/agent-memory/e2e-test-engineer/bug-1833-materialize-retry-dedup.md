---
name: bug-1833-materialize-retry-dedup
description: E2E regression pattern for Bug #1833 (auto-itemize Save retry after a commit failure created a duplicate WI/HI budget line) — how to force/mock a commit failure and assert no duplicate create on retry, including the paperlessEnabled gate gotcha on the new-invoice commit endpoint.
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
(existing-invoice / AutoItemizePage flow — REAL commit failure), `e2e/tests/invoices/paperless-first-invoice.spec.ts`
Scenario 19 (new-invoice / PaperlessInvoiceReviewPage flow — MOCKED commit response, see below).

## CRITICAL: the two commit endpoints are NOT equivalent for real-failure testing

`server/src/routes/invoiceAutoItemize.ts` has TWO separate commit routes with different gating:

- `POST /:invoiceId/auto-itemize` (existing-invoice flow, used by AutoItemizePage) — **no
  `paperlessEnabled` gate**. Safe to hit for real in the E2E environment (no Paperless container
  configured there). Scenario 4 uses this — a genuine `ITEMIZED_SUM_EXCEEDS_INVOICE` 400.
- `POST /auto-itemize/commit` (new-invoice flow, used by PaperlessInvoiceReviewPage) — checks
  `fastify.config.paperlessEnabled` FIRST (line ~139) and throws a 503 `PAPERLESS_NOT_CONFIGURED`
  before ANY amount validation runs. The E2E app container has no Paperless env configured, so this
  route can **never** be reached for real in CI — every other scenario in `paperless-first-invoice.spec.ts`
  already knew this and used `mockCommit()`/inline `page.route` to fully mock it. **Do not attempt to
  trigger a real `ITEMIZED_SUM_EXCEEDS_INVOICE` against this endpoint** — it will always 503 first.
  (First learned the hard way: initial Scenario 19 tried the real-server approach and failed CI Shard
  5/16 with "got 503" instead of the expected 400.)

**Fix pattern for Scenario 19**: mock ONLY the commit endpoint's *response* via `page.route`
(call-count-keyed: 1st call → 400 `ITEMIZED_SUM_EXCEEDS_INVOICE`, 2nd call → 201 success), while
leaving the WI-budgets POST (`materializeInlineDrafts`'s real create call) completely unmocked —
that POST is the actual regression surface, not the commit call itself. Capture each mocked
request's `postDataJSON()` into an array and assert `lines[0].assignmentMode === 'assign-existing'`
+ `lines[0].assignedBudgetLineId === <id captured from the real WI-budget POST response>` on BOTH
captured payloads — this proves the SAME budget line id is reused across both attempts (no
duplicate), which is the real point of the test even though the commit failure itself is simulated.
Pre-create a real invoice via `page.request.post(${API.vendors}/${vendorId}/invoices, ...)` and have
the 2nd mocked response return `{invoice:{id: thatRealId}}` so post-save navigation to
`/budget/invoices/:id` resolves against the real server (no extra invoice-detail-page mocking
needed — `GET /api/invoices/:id`, `/budget-lines`, `/document-links` all just work since the invoice
genuinely exists).

## Scenario 4 (existing-invoice flow) — REAL commit failure, still valid

**Amount math** (`persistLines`'s Σ-guard, `invoiceAutoItemizeService.ts:531`, `effectiveInvoiceAmount`
is the raw `body.invoice.amount`, no VAT gross-up on the invoice amount itself — only on line totals
via `effectiveLineAmount`, `shared/src/types/budget.ts:141`): `TEST_LINE.totalAmount=200,
includesVat:true` → itemized sum = 200 flat. Invoice amount 100 (fail) → 250 (pass). Track the
WI-budgets POST count across both attempts via a single `page.on('request')` counter registered
once, before either click.

**Transaction asymmetry that IS the bug**: both commit endpoints wrap invoice/document-link/line
persistence in one `db.transaction()` (the new-invoice one also creates the invoice + document_links
row) — a mid-transaction throw rolls back ALL of it, but the earlier separate WI-budget POST is NOT
part of that transaction and survives regardless.

## Other notes

- `document_links` unique index is `(entityType, entityId, paperlessDocumentId)` — safe to reuse the
  same fake `paperlessDocumentId` (e.g. `MOCK_DOC_1.id = 9001`) across many different real invoices
  in parallel tests; only collides if the same invoice tries to link the same doc twice.
- `PaperlessInvoiceReviewPage`'s `metadataEdits.amount` is seeded ONCE from `computedTotal` in the
  initial load effect and is NOT recomputed/reset by the `setLines` calls in `handleSave` — safe to
  `.fill('#amount', ...)` if you ever need to (not needed in the current Scenario 19 since pass/fail
  is now driven by the mocked route, not real amount validation).
- Both pages expose the amount field as `#amount` with no POM getter in `PaperlessInvoiceReviewPage.ts`
  (raw `page.locator('#amount')` is the established pattern there); `AutoItemizePage.ts` already has
  `totalAmountInput` / `getMetadataAmountInput()`.
- WI/HI budget POST response shape: `{budget:{id}}` — capture `resp.json()` from the
  `waitForResponse` promise (not a separate fetch) to get the created id without an extra round trip.
