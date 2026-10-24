---
sidebar_position: 2
title: Budget & Invoices
---

# Budget & Invoices

Household items integrate with the project-wide budget system. Each item can have cost lines that track estimated and actual costs, and these costs appear alongside task costs in the [Budget Overview](/guides/budget/budget-overview).

:::note Renamed from budget lines
The lines on an item were called **budget lines** before. They are now called **cost lines**.
:::

## The Cost Lines Section

On the purchase detail page, scroll to the **Cost** section. Its **Cost lines** list shows every cost line on the purchase. The page has no tabs. Each line shows a state chip that says where its amount comes from:

| State | Meaning |
|-------|---------|
| **Estimate** | Not linked to an offer or invoice yet. The amount is your planned amount. |
| **Offered** | Linked to a company's offer. |
| **Invoiced** | Linked to an invoice that is not paid yet. |
| **Paid** | Linked to an invoice that has been paid. |
| **Submitted** | Linked to an invoice that has been submitted for reimbursement from a financing source. |

Amounts are shown gross (including VAT). Hover over an amount, or focus it with the keyboard, to see the net amount and the VAT.

## Adding Cost Lines

Click **Add cost line** and provide:

- **Description** -- Optional label for this line (e.g., "Base unit cost", "Shipping")
- **Pricing** -- **Unit pricing** (quantity times unit price, the default) or **Direct amount**
- **Entered as** -- **Net** (the default, VAT is added) or **Gross** (VAT already included)
- **Basis** -- How reliable the amount is:

| Basis | Margin | Meaning |
|-------|--------|---------|
| **Own estimate** | +/- 20% | Your personal rough estimate |
| **Professional estimate** | +/- 10% | An estimate from a professional |
| **Offer** | +/- 5% | A formal offer from a company |
| **Invoice** | 0% | An actual invoice -- the real cost |

- **Cost category** -- Which category this cost belongs to (e.g., "Kitchen", "Fixtures")
- **Funding source** -- Which funding source will pay for it
- **Company** -- Optional. The company you expect to pay for this line

After you save, the form stays open with **Add another** so you can enter the next line.

## Multiple Cost Lines

A single purchase can have multiple cost lines. For example, a kitchen appliance might have separate lines for the unit cost, delivery fee, and installation -- each potentially in a different cost category or funded by a different financing source.

## Invoice Linking

When a company's offer or invoice arrives for a purchase purchase, you can link the item's cost lines to it. You can do this from either direction:

- **From the invoice detail page** -- split the invoice into cost lines on the household item. The grid is described in [Invoices & Vendors](/guides/budget/vendors-and-invoices#splitting-an-offer-or-invoice-into-cost-lines).
- **From the Cost section of the purchase page** -- on an estimate, click **Link to offer or invoice** and pick the offer or invoice, then enter the amount for this line

A single invoice can cover cost lines across different items. When several cost lines on the same purchase belong to the same invoice, they appear together in one group headed by the invoice number and its total.

Linked lines keep their state chip, so you can see at a glance which purchases are still waiting for an invoice and which are paid.

See [Invoices & Vendors](/guides/budget/vendors-and-invoices) for details on managing invoices and the full linking workflow.

## Subsidies

Purchases can benefit from subsidy programs. On the detail page, you can link applicable subsidy programs to the item. Only subsidies with **Approved** or **Disbursed** status affect budget calculations.

See [Subsidies](/guides/budget/subsidies) for details on managing subsidy programs.

## Budget Overview Integration

Purchase costs are included in the project-wide [Budget Overview](/guides/budget/budget-overview) alongside task costs. The budget overview dashboard shows total planned costs, actual costs, and subsidy reductions across both work items and household items, with projections that account for confidence margins.
