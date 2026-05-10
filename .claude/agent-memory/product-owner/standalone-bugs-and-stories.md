---
name: Standalone budget/invoice bugs and stories (no active parent epic)
description: Index of standalone Todo items for budget, invoice, and quotation flows after EPIC-15 closed. Useful when a future invoice/budget epic is opened.
type: project
---

After EPIC-15 (#602, Budget-Line Invoice Linking Rework) closed in 2026-03, several invoice/budget improvements landed as standalone issues without a parent epic. The only currently open epic is EPIC-16 (Floor Plans, unrelated). When a new invoice/budget epic is created, consider linking these as sub-issues:

**Why:** the natural parent (EPIC-15) is closed, so we accept ungrouped stories rather than re-opening a closed epic. Cluster of related work signals a future epic.

**How to apply:** when triaging a new invoice/budget user-reported improvement, check this list — if it's growing (≥4 items), propose a new epic at the next planning cycle.

## Items

- **#1369** — hide-linked filter on Paperless picker (Todo, 2026-04-28 batch)
- **#1370** — disable scroll-wheel on numeric inputs (Todo, 2026-04-28 batch)
- **#1371** — "Includes VAT" parity for direct-amount budget lines (Todo, 2026-04-28 batch)
- **#1372** — vendor in invoice picker (Todo, 2026-04-28 batch)
- **#1373** — "Claimed" total on Budget Invoices summary (Todo, 2026-04-28 batch)
- **#1389** — remove Budget Health hero card from /budget/overview (Todo, 2026-04-29 batch)
- **#1390** — source-name badge missing from print preview (Todo, 2026-04-29 batch)
- **#1401** — Unify budget-line creation form on invoice/quotation flow and auto-link with planned amount (Todo, 2026-05-10) — **new story** addressing form parity gap between invoice picker create-form and item-side rich form, plus auto-link after create.

## Related code references

- Slim invoice-side form: `client/src/pages/InvoiceDetailPage/InvoiceBudgetLinesSection.tsx` (lines ~744–883, `handleCreateBudgetLine` at ~232)
- Rich item-side form: `client/src/components/budget/BudgetLineForm.tsx`
- Shared form-state hook: `client/src/hooks/useBudgetSection.ts` (`BudgetLineFormState`, `emptyForm`, VAT multiplier logic in `handleSaveBudgetLine`)
- Shared API contract: `CreateBudgetLineRequest` in `shared/src/types/budget.ts` already supports quantity/unit/unitPrice/includesVat/vendorId
- Invoice-line link API: `client/src/lib/invoiceBudgetLinesApi.ts`, `server/src/routes/invoiceBudgetLines.ts`
