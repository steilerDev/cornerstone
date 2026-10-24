---
name: invoice-status-words
description: Rendered English words for invoice, deposit and cost-line states, and glossary canon they must match. Use when writing status tables or filters.
metadata:
  type: reference
---

Rendered words come from `statusVocabulary.*` in `client/src/i18n/en/common.json` through `statusBadgeVariants.tsx` (`buildInvoiceStatusVariants`). The invoice list filter (`InvoicesPage.tsx`, `enumOptions`), the create form status select and the invoice detail status menu all use the same labels. Budget keys in `budget.json` do not drive these chips.

| Vocabulary                                    | Enum                                             | Rendered English                                                     |
| --------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------- |
| `statusVocabulary.invoice`                    | pending / paid / claimed / quotation             | **To pay** / **Paid** / **Submitted** / **Offer**                    |
| `statusVocabulary.progressPayment` (deposits) | pending / paid / claimed                         | **To pay** / **Paid** / **Submitted**                                |
| `statusVocabulary.costLine`                   | estimate / offered / invoiced / paid / submitted | **Estimate** / **Offered** / **Invoiced** / **Paid** / **Submitted** |

Default status for a new invoice (manual form and Paperless review): `pending`, shown as **To pay**.

Open-items summary labels (`budget.json` `openItems`): **Still to pay** (`summaryOpenPayable`), **Refunds due to you** (`summaryRefundsDue`).

Glossary canon (`client/src/i18n/glossary.json`): Offer (doNotUse Quotation, Quote), To pay (doNotUse Pending, Open), Submitted (doNotUse Claimed), Paid, Still to pay (doNotUse Outstanding), Estimate, Offered, Invoiced, Cost line (doNotUse Budget line, Line item).

Still open (not touched by the #2235 pass, as instructed): `budget/budget-overview.md` and `invoice-deposits.md` still use older words in places ("paid, pending, or claimed", "quotation"). `budget/bank-reports.md` uses raw enum values in backticks. Fix these when those pages are next in scope.
