---
name: story-2241-new-invoice-dialog-tests
description: Story #2241 New invoice / offer dialog tests - document-kind picker needs LocaleContext (suite-wide ripple), status-cache mock, createInvoice transaction cases, it.failing defect pin, AJV nested strip
metadata:
  type: project
---

New invoice/offer ObjectForm (`objectForms/invoiceForm.tsx`, `InvoiceDocumentField`, `InvoiceCreateProvider`, `InvoiceEditDialog`) + `EntityPicker kind="document"` + server `createInvoice` with `costLine`/`paperlessDocumentId` in one transaction.

- **Ripple:** `EntityPicker` now calls `useFormatters()`, so EVERY test that renders an EntityPicker (directly or via ObjectForm/CostLineForm/pages) needs a `LocaleContext` mock or a real `LocaleProvider`. Find candidates with an import-graph script (modules that transitively import `EntityPicker.tsx` -> tests importing them without "LocaleContext" in the file), then run only those. A file that imports the component statically (AreaField.test) cannot use `unstable_mockModule` (static imports load first): wrap renders in the real `LocaleProvider` instead.
- **Status cache trap:** `useDocumentIntegration` -> `getSharedPaperlessStatus` caches 10 s at module level, and a prior test's in-flight request can settle after `resetPaperlessStatusCache()`. Mock `lib/paperlessStatusCache.js` as `{ getSharedPaperlessStatus: () => mockGetPaperlessStatus(), resetPaperlessStatusCache: jest.fn() }` in any test that varies the Paperless status (InvoicesPage, useConvertDocument, ConvertOfferForm).
- **Server:** `new Database(':memory:')` + `runMigrations` seeds the `discretionary-system` source and `hic-furniture` category. Atomicity proof: unknown `targetId` -> 404 and `SELECT COUNT(*)` of invoices/budgets/links/document_links all 0; a `BEFORE INSERT ON document_links` trigger forces a late failure to prove the rollback of the invoice AND the cost line.
- **AJV `removeAdditional`** strips an extra property inside `costLine` too (201, not 400): test it as "stripped", not as a validation error.
- `ObjectForm.setValues.test.tsx`: a custom field calls `ctx.setValues`; an "ignored while busy" case needs a never-resolving submit.
- `useCreateQuery` strips `create`, `kind`, `companyId`, `documentId` from the URL; assert with a `Location` probe.
- Hosts are tested with a fake `InvoiceCreateContext value={mockOpen}`; the real dialog is only in `InvoiceCreateProvider.test.tsx` (mocked `./invoiceForm.js`) and `invoiceForm.test.tsx`.
- Defects found in this story were all fixed and their pins flipped: the discretionary source is guaranteed (test deletes the row and expects failure with nothing created); `routes/invoices.guard.test.ts` covers the unreachable auth guards (bare Fastify + `decorateRequest('user', null)`); a rejecting `onSaved` after a saved PATCH is swallowed; `mapError` gets `details` as 3rd arg and a non-finite `itemizedTotal` uses the figure-less message (no `€NaN`).
