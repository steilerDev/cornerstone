---
name: story-2239-offer-invoice-page-tests
description: Story #2239 offer/invoice page tests - Node 22 local jest workaround for buildApp tests, fixtures, ESM partial mocks of @cornerstone/shared, defects and dead branches found
metadata:
  type: project
---

**Local jest on Node 22 (no ts-node):** `jest.config.ts` cannot be parsed. Transpile it with `typescript` to an untracked `jest.local.config.mjs` at the repo root (scratch script), add a `@cornerstone/shared` -> `shared/src/index.ts` mapper and `ignoreCodes: [151002,1343]` to the server project, run `npx jest -c jest.local.config.mjs`, delete the file afterwards. Node 22 lacks jest require(esm): any `buildApp()` test dies on `content-disposition` (ESM-only, required by `@fastify/static`); map `^content-disposition$` to a 1-line CJS shim in the local config. When a `String.replace` replacement contains `$'` use a function replacement.

**Fixtures:** `client/src/test/invoiceDetailFixtures.ts` (`makeInvoiceDetail`, `makePayment`, `makeCostLine`, `makeBudgetSource`) serves all offer/invoice page tests. Real `LocaleProvider` + real formatters give `€1,000.00` and `Aug 1, 2026`; wrap every component using `useFormatters` in it.

**Partial mock of `@cornerstone/shared`:** `import * as sharedActual` at the top, then `jest.unstable_mockModule('@cornerstone/shared', () => ({...sharedActual, isRouteServed: ...}))`. Same for `statusChangeApi` (keep `depositStatusBody`/`invoiceStatusBody` real) and `HouseNameContext` (spread actual: the page tree needs `useHouseName`).

**Quirks that look like bugs but are not:**

- `useInvoiceRecord`'s `reload` depends on `t`/`tErrors`; a `mockRejectedValueOnce` is consumed and a second effect run can succeed, so error-state tests use persistent `mockRejectedValue`, then switch to resolved before clicking Retry.
- RelatedList renders the Add button in the empty state without the `-add` test id (use the role) and header Add only when rows exist.
- A pending invoice page has two "Add progress payment" buttons (header secondary + list): scope with `within(getByTestId('invoice-progress-payments'))`.
- ObjectTabs keeps visited panels mounted but `hidden`: assert `not.toBeVisible()`, not absence.
- Bank report route is `/budget/reports`.
- Offer `openAmount` counts in `money.stillToPay` (consistency case 13 sums all records).

**Defects / dead branches reported (do not re-find):**

- `useObjectTabs.select` uses `setSearchParams(..., {replace:true})` without `state`: origin state ("Back to") is lost on every tab select and on the `?payment=` deep link. Pinned with `it.failing` in InvoiceDetailPage.test.tsx.
- Dead branches: `factSpans.ts` line 11 (`spans.length > 0` inside the overflow branch), `InvoicePaymentsPanel.tsx` line 73 (`if (deposit)` after `depositById`), `InvoiceEditModal.tsx` lines 76-77 (`!form.date` unreachable after `saveBlocked`), `InvoiceDetailPage.tsx` line 193 (`headingRef.current?.focus()` null) and 335 (`vendorName?.`, vendorName is a required string).
