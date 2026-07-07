---
name: auto-itemize-and-invoices-e2e
description: E2E patterns for AutoItemizePage, PaperlessInvoiceReviewPage, invoice budget lines, document-link fixtures, and the paperless-first invoice flow. Consolidated from dated notes 2026-03 through 2026-07.
metadata:
  type: project
---

See also `bug-1833-materialize-retry-dedup.md` for the retry-dedup regression test pattern.

## AutoItemize commit requires a document-link fixture (2026-06-18)

`POST /api/invoices/:id/auto-itemize` (commit, `dryRun:false`) validates the `paperlessDocumentId` is linked to the invoice via `document_links` — else 404 `NOT_FOUND`. Any scenario that commits MUST call `POST /api/document-links` (`{entityType:'invoice', entityId, paperlessDocumentId}` → 201) after invoice creation and before navigation. Scenarios that cancel/discard don't need it. No shared helper in `apiHelpers.ts` yet — inline `linkDocumentToInvoiceViaApi` per spec. (Note: the new-invoice `commitAutoItemizeCreate` endpoint creates its OWN `document_links` row internally — no pre-seed needed there.)

## AutoItemize Inline-Create + VAT E2E (Stories #1737/#1738, 2026-06-18) — `auto-itemize-inline-create.spec.ts`, `auto-itemize-vat-itemized.spec.ts`

- Clicking "Create Budget Line" in picker step 2 closes the picker immediately: `creating-new-badge` testid + inline form wrapper + discard button. No API calls until outer Save.
- Save sequence: `POST /api/work-items/:id/budgets` → auto-itemize commit (dryRun:false). Only `Promise.all([wiCreatePromise, commitPromise])` needed (a third client-side POST to `/budget-lines` fires but tests don't need to wait on it — idempotent server-side).
- `commitPromise` predicate: don't gate on `resp.ok()`; match `url includes .../auto-itemize && method POST && !postDataJSON()?.dryRun`, pass `{timeout:30000}`, then assert `commitResp.ok()` explicitly and throw with body text if not. Use `test.setTimeout(60_000)` rather than `test.slow()` (triples default but may still be short vs. a hardcoded 30s wait + overhead).
- VAT math: `includesVat=false, amount=100` → `plannedAmount=100` (net), `itemizedAmount=119` (gross, `Math.round(100*1.19*100)/100`).
- Cancel-after-queue: `cancelButton.click()` → `cancelModal` → `discardButton.click()` navigates away; monitor `page.on('request')` to assert 0 POSTs to WI budgets.
- Discard inline: `getInlineDraftDiscardButton(0).click()` → badge/form hidden, `lineAssignButton(0)` re-visible, no API call.
- Dry-run mock pattern: intercept `**/api/invoices/${invoiceId}/auto-itemize`, branch on `body?.dryRun`.
- `lineVatCheckbox(0)`: `not.toBeChecked()` when `includesVat=false`.

## Paperless mocking essentials

- **Tags mock is mandatory** (2026-06-15): `usePaperless` Phase 2 calls `listPaperlessTags()` in a `Promise.all()` alongside documents. If `/api/paperless/tags` isn't mocked, the `Promise.all` rejects, `DocumentBrowser` renders `role="alert"` instead of `#document-grid`, and `waitForDocumentsLoaded()` times out. Always mock `**/api/paperless/tags` → `{tags:[]}` whenever a test opens DocumentBrowser (picker modal or LinkedDocumentsSection).
- **Correspondent query param is `?correspondent=<id>`** (integer), NOT `?correspondentId=` — that's the DocumentBrowser/usePaperless _prop_ name. Always check `url.searchParams.get('correspondent')` in route mocks.
- **DocumentBrowser two-stage loading race** (`PaperlessPickerModal.ts`): stage 1 = status check (`div.infoState[aria-busy="true"]`, `#document-grid` not mounted yet); stage 2 = document fetch (`#document-grid[aria-busy="true"]` skeletons). `waitForDocumentsLoaded()` = `grid.waitFor({state:'visible'})` then `expect(grid).toHaveAttribute('aria-busy','false',{timeout:10000})`. `DocumentCard` root is `role="button"` on a `<div>` (not `<button>`), aria-label `"Document: {{title}}{{date}}"`; "Open in Paperless" is `role="link"`.

## Paperless-First Invoice E2E (Story #1679, 2026-06-15) — `paperless-first-invoice.spec.ts` + `-fallbacks.spec.ts`

- No Paperless testcontainer — all Paperless + LLM endpoints mocked via `page.route()`.
- POMs: `PaperlessPickerModal.ts` (`getByRole('dialog',{name:/Select Invoice Document/i})`), `PaperlessInvoiceReviewPage.ts`.
- `InvoicesPage.clickNewInvoice()` waits for the button to be enabled (`aria-disabled !== 'true'`) — disabled while config+status loads.
- `PaperlessInvoiceReviewPage` reads `documentId` from React Router `location.state` — MUST navigate through the full picker flow (`navigateToReviewPage()` helper), never `page.goto()` directly (shows an error guard with no state).
- Correspondent SearchPicker portal: `page.locator('[data-search-picker-dropdown]')` scoped to `page`, not `modal`.
- `InvoicePaperlessPickerModal` uses `useTranslation(['invoices','documents'])` with `t('invoices:pickerModal.title')` but there's no `invoices.json` — keys actually live in `budget.json` under `invoices.pickerModal.*` (namespace fallback).
- Confirm button ("Create Invoice & Itemize") is `disabled={!vendorId}` — assert `toBeDisabled()` directly, can't click.
- Preview endpoint mock: `page.route('**/api/invoices/auto-itemize/preview', ...)` (no invoice ID in URL — this is the create-from-scratch path, distinct from `**/api/invoices/:id/auto-itemize`).
- `InvoicesPage` POM: `clickNewInvoice()`, `waitForPickerModal()`, `waitForManualModal()`.
- **`POST /auto-itemize/commit` has a `paperlessEnabled` gate that 503s BEFORE any other validation** (server/src/routes/invoiceAutoItemize.ts) — the E2E container has no Paperless configured, so this endpoint can NEVER be hit for real in CI. Every scenario in this file mocks it (`mockCommit()` or an inline `page.route`) — do not attempt a real-server call against it. See bug-1833-materialize-retry-dedup.md for the full gotcha (this bit Scenario 19 once already — a real-server attempt got a 503 instead of the expected business-logic error).

## SearchPicker display-mode gotcha (applies to vendor picker on both AutoItemizePage flows, 2026-06-15)

When SearchPicker has `initialTitle + value` both set (pre-filled), it renders `<div class*="selectedDisplay">` (a chip), NOT `<input id="...">`. Input only reappears after clicking the clear (×) button. Always scope `[class*="selectedDisplay"]` to its containing card (e.g. `[class*="vendorCard"] [class*="selectedDisplay"]`) to avoid ambiguity — never assume `#vendor-picker` / `#edit-vendor` is present.

`handleSave` on PaperlessInvoiceReviewPage requires each included line to have `budgetCategoryId` OR `assignedBudgetLineId` — inject `budgetCategoryId` via a real `GET /api/budget-categories` call before mocking `preview` if your fixture lines have neither.

## PaperlessInvoiceReviewPage CSS-Module/TSX class-name mismatch (fix/1679, 2026-06-15 — production bug, not fixed in E2E scope)

TSX was reworked to new class names (`lineList`, `lineCard`, `cardTopRow`, etc., mirroring AutoItemizePage) but `PaperlessInvoiceReviewPage.module.css` kept the OLD names (`linesList`, `lineItem`, ...) — all new class refs resolve to `undefined`/`"undefined "` in the DOM. **POM workaround**: `lineItemsList` = `page.getByRole('list', {name:'Extracted line items'})` (role/aria-label survive regardless of the CSS mismatch); `getLineItem(index)`/`getLineItemCount()` = `lineItemsList.locator('li')`. Do not rely on `[class*="lineItem"]` here.

## LinkedDocumentsSection defaultHideLinked (Story #1679, 2026-06-15)

`LinkedDocumentsSection` and `InvoicePaperlessPickerModal` both now pass `defaultHideLinked={true}` to `DocumentBrowser`. With an empty `linkedDocumentIds` array this doesn't hide anything (nothing to filter); with populated IDs, those docs are hidden by default.

## Invoice Vendor Reassignment E2E (Story #1736, 2026-06-17) — `invoices/invoice-vendor-change.spec.ts`, `InvoiceDetailPage.ts`

- 6 scenarios, all `@responsive`, no `@smoke` (feature not in beta yet).
- Edit-modal vendor SearchPicker: pre-populated → `[class*="selectedDisplay"]` (scoped to `editModal`), not `#edit-vendor` (page-scoped, only present after clearing).
- `editVendorError` = `editModal.locator('label[for="edit-vendor"]').locator('xpath=parent::div/div[last()]')` — FormError `variant="field"` does NOT emit `role="alert"`; the XPath walks label→parent field-wrapper→last child div.
- Vendor dropdown portals to `[data-search-picker-dropdown]` on `document.body` (page-scoped).
- Reassignment PATCH: `PATCH /api/vendors/:ORIGINAL_vendorId/invoices/:invoiceId` with `{vendorId: NEW_vendorId}`. Cleanup after reassignment must delete via the NEW vendor's path.
- `/budget/invoices?vendorId=:id` filters the list — used to verify the invoice moved vendors.
- **DataTable dual-DOM strict-mode fix**: DataTable renders both desktop `<table>` and mobile `cardsContainer` simultaneously (CSS-hidden per viewport) — `getByText(invoiceNumber)` resolves 2 nodes. Fix: `page.locator('[class*="invoiceLink"]', {hasText: invoiceNumber}).filter({visible:true})`, then `toHaveCount(0)`/`toHaveCount(1)`.

## Discretionary Note + Auto-Origin Badge E2E (Story #1551, 2026-05-29) — `auto-itemize-discretionary.spec.ts`

- `discretionaryNote` = `page.locator('[role="note"][class*="discretionaryNote"]')`. Condition: a discretionary `isDiscretionary:true` budget source AND ≥1 line with matching `budgetSourceId` (mock `GET /api/budget-sources`, GET-only).
- `origin='auto'` lines are NOT creatable via `POST /api/work-items/:id/budgets` (schema blocks `origin`) — must go through auto-itemize commit (`dryRun:false, mode:'append'`, with a doc link already created). Commit validates the doc link in DB but does not call Paperless.
- Auto-origin badge: `page.locator('[aria-label*="automatically"]')`.
- Discretionary source id is hardcoded `'discretionary-system'` (seeded by migration 0021).

## AutoItemizePage E2E (Stories #1564/#1584/#1586–#1600, latest 2026-05-26) — `invoice-auto-itemize-page.spec.ts` (35 scenarios; @smoke on 1,2,3,8)

- Portal dropdown for assign-picker search: `pickerPortalDropdown = page.locator('[data-search-picker-dropdown]')` — in `document.body`, NOT inside `pickerModal`. Scope option search there.
- `autoCreatedBadge` = `page.getByTestId('auto-created-badge')`.
- `suggestionBadge()` uses `xpath=ancestor::div[contains(@class,"fieldRow")]`. `lineAssignedBadge()` = `[class*="assignedBadge"]:not([class*="Wrapper"])` (CSS Modules emit both `assignedBadge_<hash>` and `assignedBadgeWrapper_<hash>`, both matching `class*="assignedBadge"` → strict-mode violation without the `:not()`).
- `GET /api/budget-categories` returns `{categories:[...]}`, not `{budgetCategories:[...]}`.
- Category select: `lineRow(i).getByRole('combobox', {name:/Select budget category for line item/i})` (an `aria-label`led `<select>`, use `getByRole('combobox')` not `locator('select')`). Funding source: same pattern, `/Select funding source for line item/i`.
- VAT checkbox label is "Price includes VAT" (i18n `autoItemize.includesVat`), not "VAT applies".
- Assign-picker step 1 uses `ParentPicker` (`role="tablist"`, two `role="tab"` — Work Item / Household Item); inactive tab's panel is UNMOUNTED, not hidden. Placeholder = tab label text ("Work Item"/"Household Item"), not "Search work items...". Step 2 modal title: "Select Budget Line for {itemTitle}" — wait on `pickerStep2Modal()` not `pickerModal`.
- `assignmentMode` in commit payload: `"assign-existing"` (assignedBudgetLineId set) vs `"create-new"`.
- Mobile (≤860px): `previewColumn` computed `position: static` — verify via `el.evaluate(() => getComputedStyle(el).position)`.
- `lineCheckbox()` uses `.first()` — rows have multiple checkboxes (include + includesVat).
- SearchPicker's `getByRole('option')` results ALWAYS portal to `document.body` — never scope to a modal locator.
- `eagerLinkInvoice:false` for AutoItemizePage's picker — budget line is not immediately linked; linking happens in the Save commit payload.
- Commit POST intercept: register `page.waitForResponse` with `postDataJSON().dryRun === false` predicate BEFORE the click.
- `createWorkItemBudgetViaApi(page, wiId, {description, plannedAmount})` seeds a real WI budget row; cascades on WI deletion (no separate cleanup).
- **Production regression #1611** (real bug, not weakened): `InvoiceBudgetLinesSection` sets `eagerLinkInvoice:false` (PR #1566) — "Create Budget Line" in the picker creates the budget but does not link it to the invoice.

## Invoice-Linked Budget Line Edit from WI/HI Detail (Bug #1603, 2026-05-29) — `invoice-linked-budget-line-edit.spec.ts` (9 scenarios; @smoke 1,6,9; @responsive 1,6)

- `InvoiceGroup` accordion wraps invoice-linked lines — toggle via `[class*="toggleBtn"]` (`aria-expanded`), must expand before Edit is clickable. Content panel `[id^="invoice-group-"]`.
- Edit button aria-label: `"Edit budget line: {description}"`. Modal: `getByRole('dialog', {name:'Edit Budget Line'})`. Inputs: `#budget-description`, `#budget-planned-amount`, `#budget-itemized-amount`. Save: `/Save Changes|Saving/i`. PATCH `/api/invoices/:invoiceId/budget-lines/:invoiceBudgetLineId`.
- HI budget line via invoice: `POST /api/household-items/:id/budgets` with `householdItemBudgetId` in the link payload.
- Parent picker: expand via "Change" ghost button; search input `parentPickerSection.getByRole('textbox')` (plain input, NOT combobox role); options portal to `document.body`.

## Invoice Budget Line Full Edit + Parent Move (Story #1553, 2026-05-22) — `invoice-budget-line-full-edit.spec.ts` + `-edit-remove.spec.ts` (6 scenarios; @smoke/@responsive on 1,2)

- Edit modal via accessible name (`Modal title=` prop sets it), not `aria-labelledby` filter.
- `#budget-itemized-amount` replaced the old `#budget-line-amount` (unified BudgetLineForm, commit 5f5cb79b).
- Parent picker fieldset only present for assigned lines; "Change" ghost button toggles it. "Move to selected item" button `/Move to selected item|Moving/i`. Cross-table hint: `[role="status"]` with `/transfer/i`.
- `BUDGET_LINE_ALREADY_LINKED` (409) surfaces via `[class*="parentPickerError"]` paragraph, NOT `role="alert"` — modal stays open.
- Full-edit submit button text is "Save Changes" (not bare "Save").
- WI inline edit save is `PATCH /api/work-items/:workItemId/budgets/:budgetId` (not `/budget-lines/`).

## Auto-Itemize E2E (Story #1547, 2026-05-22) — `auto-itemize.spec.ts` (9 scenarios; @smoke/@responsive on 1,2)

- Modal locators via `[role="dialog"]` filtered by h2 text (Modal uses `useId()` — no stable accessible name on the dialog itself). Preview modal h2 "Review extracted line items"; doc picker h2 "Choose document to analyze".
- Auto-itemize button aria-label "Extract line items from a linked Paperless document" is the stable locator (not button text).
- Error banner inside the `<section>` (not a portal): `budgetLinesSection.locator('[role="alert"]').filter({visible:true}).first()`. **Double nested `role="alert"`** when the preview modal shows an error (`<div role="alert"><FormError/></div>` and FormError itself also renders `role="alert"`) — use `.last()`.
- `THREE_EXTRACTED_LINES` fixture sums to 1700; invoice amount 2000 → TOTAL_MISMATCH; 100 → ITEMIZED_SUM_EXCEEDS_INVOICE.
- Currency assertions must use locale-agnostic regex (`/1[.,]700/`), never a hardcoded locale format.

## Orphan Budget Line Assignment E2E (Story #1545, 2026-05-21) — `budget-line-assign.spec.ts` (6 scenarios; @smoke/@responsive on 1,2)

- No REST API creates `work_item_budgets` with `work_item_id=NULL` — seed via `docker exec <containerId> node -e "..."` (container has `node` + `better-sqlite3`; container ID from `e2e/test-results/.state/containers.json`).
- Unassigned badge: `[class*="badge"]` with text "Unassigned", aria-label "Unassigned — no work item or household item linked". Assign button: `[class*="assignButton"]` text "Assign…".
- **Bug**: assign submit button text is "Work Item" (wrong i18n key) — locate by CSS class, not text.
- After HI assignment, the original `work_item_budgets` row is server-deleted (no separate cleanup needed).
- Assign endpoint: `POST /api/budget-lines/:id/assign` where `:id` = `work_item_budget.id` (not `invoice_budget_line.id`).

## InvoiceBudgetLinesSection Picker (Issue #1401, 2026-05-10) — `invoice-budget-line-create-and-link.spec.ts` (5 scenarios, no @smoke)

- Same modal (`role="dialog"`, `aria-labelledby="picker-title"`) serves both invoice-edit and the picker. Step 1 WorkItemPicker: `getByPlaceholder('Search work items...')`. Step 2 "Create Budget Line" appears in empty-state OR below the list (only one visible at a time).
- BudgetLineForm IDs: `#budget-description`, `#budget-planned-amount`, `#budget-quantity`, `#budget-unit`, `#budget-unit-price`, `#budget-confidence`, `#budget-category`, `#budget-source`, `#budget-vendor`. Submit text "Add Line" (create) / "Saving..." — never "Save Changes" here.
- On `ITEMIZED_SUM_EXCEEDS_INVOICE`, form closes back to list view; error in `role="alert"` inside modal, text "...would exceed the invoice total."
- `createBudgetSourceViaApi(page, {name, totalAmount})` — object param, not positional.

## Invoices + Manage Settings E2E (2026-03-26)

- API response shapes: Areas POST `{area:{id}}`, Trades POST `{trade:{id}}`, HI-Categories POST `{id}` (bare), Invoices POST `{invoice:{id}}`.
- `InvoicesPage.heading` = "Budget" (PageLayout title). Modal: `getByRole('dialog',{name:/Invoice/i})`.
- `InvoiceDetailPage`: edit modal `[aria-labelledby="edit-modal-title"]`, delete modal `[aria-labelledby="delete-modal-title"]`, confirm-delete `[class*="confirmDeleteButton"]`.
- ManagePage tab panels: `areas-panel`, `trades-panel`, `budget-categories-panel`, `hi-categories-panel`. Area/trade delete buttons have NO aria-label (scope via row + exact "Delete" text); HI-category delete DOES have `aria-label="Delete {name}"`.

## HI Breadcrumb E2E (Story #1240, 2026-04-17)

- Invoice route `/budget/invoices/:id` (not `/project/...`). Invoice API `POST /api/vendors/:vendorId/invoices` → `{invoice:{id}}`.
- **Invoice status enum**: `'pending'|'paid'|'claimed'|'quotation'` — NOT `'draft'` (400 if used).
- HouseholdItemPicker `renderSecondary` shows compact breadcrumb in dropdown options (test via InvoiceDetailPage "Add Budget Line" modal → HI picker `getByPlaceholder('Search household items...')`).

## Vendors to Settings Migration E2E (Story #1283, 2026-04-18)

Vendors moved `/budget/vendors` → `/settings/vendors` (legacy redirects via `<Navigate replace>`). `vendors.title` i18n key unchanged ("Budget" heading). SubNav aria-label → "Settings section navigation". Spec moved to `e2e/tests/vendors/vendors.spec.ts`.

## Budget Overview Hero Card Removed (Issues #1389/#1390, 2026-04-29)

- `<section aria-label="Budget overview">` (heroCard) is gone from BudgetOverviewPage.tsx. POM `waitForLoaded()` now races on `costBreakdownCard`. New spec `budget-overview-no-hero-card.spec.ts` (@smoke).
- Source badge (`aria-label="Budget source: {name}"`) only on Level 3 rows — must expand Work Items → area → item.
- `BreakdownBudgetLine`: `id, description, plannedAmount, confidence, actualCost, hasInvoice, isQuotation, budgetSourceId` (NOT `sourceId`/`sourceName`). BudgetSources mock: `{budgetSources:[{id,name,...}]}`.

## Budget Source Filter E2E (Story #1360, 2026-04-25 — server-side rewrite)

- `BudgetSourceSummaryBreakdown` has `subsidyPaybackMin/Max`, not `subsidyPayback`.
- URL: `?deselectedSources=id1,id2`. `waitForResponse` predicates check `.includes('/api/budget/breakdown')` +/- `.includes('deselectedSources=')`. Register BEFORE the click (debounced refetch).
- Route mock glob: `'**/api/budget/breakdown**'` (leading+trailing `**`) — path-only form is unreliable.
- Debounce is 50ms; `breakdownRefetching` CSS class marks in-flight refetch.
