---
sidebar_position: 2
title: Budget & Invoices
---

# Budget & Invoices

Household items integrate with the project-wide budget system. Each item can have budget lines that track estimated and actual costs, and these costs appear alongside work item costs in the [Budget Overview](/guides/budget/budget-overview).

## Adding Budget Lines

On the household item detail page, switch to the **Budget** tab. Click **Add Budget Line** and provide:

- **Description** -- Optional label for this budget line (e.g., "Base unit cost", "Shipping")
- **Planned Amount** -- Your estimated cost
- **Confidence Level** -- How reliable the estimate is:

| Confidence Level | Margin | Meaning |
|-----------------|--------|---------|
| **Own Estimate** | +/- 20% | Your personal rough estimate |
| **Professional Estimate** | +/- 10% | An estimate from a professional |
| **Quote** | +/- 5% | A formal quote from a vendor |
| **Invoice** | 0% | An actual invoice -- the real cost |

- **Budget Category** -- Which category this cost belongs to (e.g., "Kitchen", "Fixtures")
- **Financing Source** -- Which funding source will pay for it
- **Vendor** -- Optional vendor for this specific budget line

## Multiple Budget Lines

A single household item can have multiple budget lines. For example, a kitchen appliance might have separate lines for the unit cost, delivery fee, and installation -- each potentially in a different budget category or funded by a different financing source.

## Invoice Linking

When a vendor invoice arrives for a household item purchase, you can link invoice line items to the item's budget lines. This replaces the estimate with the actual cost:

1. Navigate to the vendor's invoice detail page (via **Budget > Invoices**)
2. On an invoice line item, select the household item's budget line as the linked budget
3. The actual cost updates automatically

See [Vendors & Invoices](/guides/budget/vendors-and-invoices) for details on creating invoices.

## Subsidies

Household items can benefit from subsidy programs. On the detail page, you can link applicable subsidy programs to the item. Only subsidies with **Approved** or **Disbursed** status affect budget calculations.

See [Subsidies](/guides/budget/subsidies) for details on managing subsidy programs.

## Budget Overview Integration

Household item costs are included in the project-wide [Budget Overview](/guides/budget/budget-overview) alongside work item costs. The budget overview dashboard shows total planned costs, actual costs, and subsidy reductions across both work items and household items, with projections that account for confidence margins.
