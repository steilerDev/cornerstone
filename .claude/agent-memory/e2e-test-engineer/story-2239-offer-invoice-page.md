---
name: story-2239-offer-invoice-page
description: '#2239 offer/invoice page on the detail template: POM composition, test ids, behaviours that changed old specs, what was written statically (not run).'
metadata:
  type: project
---

- `InvoiceDetailPage` is composed of `ObjectHeaderControl('invoice-header')`, `SummaryStripControl('invoice-summary')`, `ObjectTabsControl('invoice-tabs')`, `RelatedListControl('invoice-progress-payments' | 'invoice-refunds')`, `CostLinesPanel`. Removed: `editButton`, `deleteButton`, `infoList`, `getDetailFields`, `depositsSection`, `refundBadge`, `openDepositMenu` and the table/card deposit members.
- Test ids: chip `invoice-status-badge` (absent on an offer), primaries `convert-quotation-button` / `invoice-primary-mark-paid` (StatusMenu action, no date step) / `invoice-primary-bank-report` / `invoice-primary-add-payment`, secondary `invoice-secondary-add-payment`, menu `object-header-menu`, items `invoice-menu-edit` / `object-header-delete`, row chips `payment-status-<id>`, rows `<list>-row-<id>`, `final-payment` row id, Documents is strip fact `summary-fact-documents` (value = bare count; DocumentsPanel.open('summary-fact-documents')).
- Behaviour traps: Cost tab is default, Payments must be opened (`openPayments()`) before touching rows; final-payment row exists only with >= 1 progress payment (refunds do not count); `tab=payments` contains "payment", so a `?payment=` removal wait must use `includes('payment=')`; the edit dialog is titled "Edit details"; document-mode cost lines have no Belongs-to column (task link + area breadcrumb live in the group heading, "Not assigned" is a group heading); mocked `GET /api/invoices/:id` bodies need `paid`, `openAmount`, `notYetSplit`.
- Written without a live run (sandbox lacks containers): CI is the first execution. Watch first: E2 Mark paid primary applies at once, E3 heading focus after convert, E10/E11 geometry numbers (given in the spec), E9 show-all mock of `/api/history`.
