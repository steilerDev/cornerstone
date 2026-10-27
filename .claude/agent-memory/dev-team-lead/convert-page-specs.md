---
name: convert-page-specs
description: Hazards from #2240 (dialog → task page): portaled forms submit the host page form, stale "blocking" premises, payload ids in document rows, new-screen baseline via same page dir, route flips break nav sweep E2E
metadata:
  type: feedback
---

Found speccing and reviewing #2240 (P4.8 Convert page, which replaced ConvertQuotationModal).

1. **A page-level `<form onSubmit>` receives submits from portaled dialog forms.** React synthetic events bubble through portals, so `InvoiceDepositFormModal`'s Save also fired the Convert page's submit and converted the offer. Unit tests mocked the modal, so only E2E would have caught it. **How to apply:** whenever a spec puts a Modal that contains a `<form>` inside a page `<form>`, require `if (event.target !== event.currentTarget) return;` in the page handler. Require a QA test with a portaled nested form, not a mocked modal.
2. **"Keep the old blocking rule" can be a false premise.** The old dialog never blocked on a refund due, and #2188 AC5 forbids blocking. Read the old hook's `canConfirm` before carrying a rule over.
3. **In document mode, `CostLineRow.id` is the task/purchase budget id.** The convert API wants `invoiceBudgetLineId`. Key the state by `invoiceLineKey(row)`.
4. **A dialog that becomes a page avoids a "new screen" rise by living in the host page's directory.** A screen is a `pages/<dir>` closure, and `ConvertQuotationModal` −1 / page +1 kept InvoiceDetailPage at 8/0/1.
5. **Flipping a route to `done` breaks the route-enumerating E2E.** `page-identity-sweep` completeness (ROWS), `phase1-exit` PATHS (X3a/X4 throw without an entry) and `legacy-url-walk` (no redirect allowed) all enumerate routes. Seed a matching record (here an offer) for both.
6. **Money-label pre-check found 6 UX rises** ("Keep offered amount", "Matches the final amount", …). Run the check before fixing en values.
7. **An aria-label that reorders the visible text** ("Keep as offered" vs "Keep {{name}} as offered") fails label-in-name. Use `"<visible>: {{name}}"`.

Related: [[first-detail-page-adopter-specs]], [[dialog-route-specs]], [[restructure-baseline-hazards]], [[detail-template-specs]]
