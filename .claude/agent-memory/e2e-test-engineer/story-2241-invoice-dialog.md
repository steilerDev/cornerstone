---
name: story-2241-invoice-dialog
description: #2241 New invoice/offer ObjectForm dialog - InvoiceFormDialog POM, changed consumers, static-only verification, what to watch in CI
metadata:
  type: project
---

- `e2e/pages/components/InvoiceFormDialog.ts` extends ObjectFormDialog (modes invoice/offer/edit; testId `invoice-form` / `invoice-edit-form`). The company create form is a CHILD STEP of the same dialog: `companyChild` = ObjectFormDialog('New company', parent testId); `openNewCompany(text)`; Back = `companyChild.backButton`.
- InvoicesPage keeps member names via `createDialog`/`offerDialog`/`createModal` (any-create locator); `closeCreateModal()` confirms the discard dialog when the form is dirty. InvoiceDetailPage `edit*` members alias `editDialog` fields. Save now navigates to the invoice page (no longer stays on the list).
- Removed old picker-modal scenarios (paperless-first-invoice 1,2,5,6,8,15; fallbacks 10); review-page specs deep-link `reviewPage.goto(docId)` after `invoicesPage.goto()`.
- Edit form errors are field errors (`fieldError('amount')`), validation message "Choose a company." Save is no longer disabled when invalid.
- Config flags differ: dialog AI link uses `llmEnabled`; review page/redirect uses `autoItemizeEnabled` (I6c mocks both).
- Verified statically only (tsc, eslint, prettier, --list); never run live.
