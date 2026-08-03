---
name: story-1876-deposit-refunds
description: E2E patterns for Story #1876 (deposit entryType 'deposit'|'refund') — reusable for any future InvoiceDepositsSection/DataTable hidden-column work.
metadata:
  type: project
---

## What was added

- `e2e/pages/InvoiceDetailPage.ts`: entry-type radio locators (`depositEntryTypeGroup`,
  `depositEntryTypeDepositRadio`/`RefundRadio`), `depositRefundAmountHint`, `refundBadge`,
  `refundAmountNegative`, `selectEntryType()` helper, `fillDepositForm()` now accepts
  `entryType`.
- `e2e/pages/InvoicesPage.ts`: generic `columnSettingsButton`, `enableColumn(label)`,
  `getColumnCellText(rowMatchText, columnLabel)` — reusable for ANY hidden-by-default
  DataTable column, not just this story's "Effective Amount".
- Tests: `e2e/tests/invoices/invoice-deposits.spec.ts` Scenarios 9-12 (add+mark-paid,
  REFUND_EXCEEDS_INVOICE, edit-locked, lifecycle-menu-reuse), `invoice-deposits-ux.spec.ts`
  Scenarios 5-6 (mobile card, dark mode), `invoices.spec.ts` "Effective Amount" column test.

## Pitfalls hit and fixed during this story

1. **Badge/amount locators must pre-filter `{ visible: true }`.** `InvoiceDepositsSection`
   renders BOTH the desktop `<table>` row AND the mobile `[class*="mobileCard"]`
   simultaneously in the DOM (CSS `display:none` toggles visibility per viewport) — same
   pattern already documented for `depositRows`/`openDepositMenu` elsewhere in this file.
   A bare `.locator('[class*="refund"]').first()` resolves to DOM order (table before
   card), which is WRONG whenever the mobile card is the actually-visible one. Fixed by
   baking `.filter({ visible: true })` into the POM locator itself (`refundBadge`,
   `refundAmountNegative`) rather than relying on every call site to remember it.

2. **`remainingAmount` on InvoicesPage is ALSO `defaultVisible: false`** — do not assume
   it's always-visible just because it's an "existing" column. Both it and the new
   `effectiveAmount` column needed `enableColumn()` before their cell text could be read.
   Verify `defaultVisible` in the actual `ColumnDef` array before writing assertions, not
   from the story spec's prose description.

3. **DataTable column position is NOT encoded on `<td>`** (`DataTableRow.tsx` renders
   `<td key={col.key}>` with no `data-column` attribute). To read a specific hidden
   column's cell value, resolve the column's index dynamically from the `<thead th>`
   order (which mirrors `columns.filter(visibleColumns.has)`, i.e. original definition
   order regardless of click-toggle order) — see `getColumnCellText()`. Match header
   label with `=== label || startsWith(label + ' ')` since sortable headers append a
   sort-direction suffix (` ↑`/` ↓`) when actively sorted.

4. **Column settings gear is desktop-only** (`DataTableColumnSettings` hidden via CSS
   `@media (max-width: 767px)`). Any test using `enableColumn()` must skip on mobile/
   tablet (`viewportWidth < 1024` guard), matching the existing convention for other
   viewport-independent tests in this codebase.

5. **Refund sum invariant is on ANY status, not just paid/claimed** — unlike
   `finalPaymentAmount` (which only counts received refunds), the
   `REFUND_EXCEEDS_INVOICE` sum check counts a `pending` refund's amount too. Don't
   mark a refund paid before testing the exceeds-invoice error; a pending one already
   consumes headroom.

## Verification note

Full containerized E2E run not possible in this sandbox (no dhi.io credentials — see
`story-epic08-e2e.md` / MEMORY.md follow-ups). Verified via: `npx eslint <files> --fix`
(clean), `npx prettier --write <files>` (clean), `npx playwright test --list` (109 tests
across desktop/tablet/mobile, scenario placement and skip-guards confirmed correct),
`npx tsc --noEmit -p e2e` scoped to touched files (no new errors; pre-existing unrelated
errors in `containers/` and other POMs are environment/stale-build noise, not caused by
this change). Real run must happen via CI post-PR.
