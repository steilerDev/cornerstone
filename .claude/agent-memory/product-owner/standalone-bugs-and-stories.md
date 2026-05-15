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
- **#1421** — Surface overdue pending invoices and deposits in invoice overview (5th conditional summary box, warning colors, count breakdown `X invoices, Y deposits` + summed amount) (Todo, 2026-05-15 batch)
- **#1422** — Increase vertical spacing between Invoices page summary boxes and search bar (use spacing token, match other list pages) (Todo, 2026-05-15 batch)
- **#1423** — Deposit kebab popover clipped by list container — portal/escape clipping bounds (Todo, 2026-05-15 batch). May share a fix with budget line kebab in #1425.
- **#1424** — Edit deposit dialog shows raw i18n keys `buttons.cancel`/`buttons.save` instead of localized labels (Todo, 2026-05-15 batch)
- **#1425** — Budget line items lack kebab + full-edit-dialog parity with deposit line items — requires dev-team-lead audit of deposit edit experience to mirror it (Todo, 2026-05-15 batch). Larger UX/consistency change, not just a styling fix.

**2026-05-15 batch** brings the standalone count to 13 — strong signal to propose a new "Budget/Invoice UX Polish" epic at the next planning cycle. Themes clustering: overdue/alerting (#1421), kebab/edit affordance parity (#1423, #1425), header layout consistency (#1422, partly #1389/#1390), i18n hygiene (#1424). Suggest grouping into 3 epic themes if/when opened: (a) overdue & alerting, (b) line-item editing parity (deposit/budget/quotation), (c) header & layout polish.

## Related code references

- Slim invoice-side form: `client/src/pages/InvoiceDetailPage/InvoiceBudgetLinesSection.tsx` (lines ~744–883, `handleCreateBudgetLine` at ~232)
- Rich item-side form: `client/src/components/budget/BudgetLineForm.tsx`
- Shared form-state hook: `client/src/hooks/useBudgetSection.ts` (`BudgetLineFormState`, `emptyForm`, VAT multiplier logic in `handleSaveBudgetLine`)
- Shared API contract: `CreateBudgetLineRequest` in `shared/src/types/budget.ts` already supports quantity/unit/unitPrice/includesVat/vendorId
- Invoice-line link API: `client/src/lib/invoiceBudgetLinesApi.ts`, `server/src/routes/invoiceBudgetLines.ts`
