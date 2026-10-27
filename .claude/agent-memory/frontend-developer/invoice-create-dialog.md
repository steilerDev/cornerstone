---
name: invoice-create-dialog
description: How the New invoice/offer ObjectForm dialog (#2241) is wired - provider, document EntityPicker kind, edit reuse, quirks
metadata:
  type: project
---

- Pages open the dialog only via `useOpenInvoiceForm()` (objectForms/); `InvoiceCreateProvider` (App root, inside CompanyCreateProvider) owns ObjectForm. Never import ObjectForm/provider in pages.
- One `useInvoiceFormSchema({mode:'create'|'edit'})` in objectForms/invoiceForm.tsx serves create and `InvoiceEditDialog`. Offers have no Status field (sent as `quotation`); invoice statuses exclude `quotation`.
- `EntityPicker kind="document"` (Paperless search, linked ids hidden) replaced InvoicePaperlessPickerModal; `useDocumentIntegration` is the shared Paperless/AI status hook.
- `getPaperlessDocument` returns `{ document }` (not the doc itself).
- Pending `?documentId=` is consumed once via `onPendingConsumed` (state in the schema hook) so a remount after a child step does not re-apply it.
  **Why:** pattern-baseline counts must only drop (no btnPrimary/Link/new components/X/X.tsx). **How to apply:** extend these, do not add parallel create UIs.
