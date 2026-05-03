---
sidebar_position: 3
title: Work Item Budgets
---

# Work Item Budgets

Each work item can have one or more **budget lines** that track the estimated or actual cost of that task. Budget lines connect a work item to a budget category and financing source.

## Adding a Budget Line

On the work item detail page, switch to the **Budget** tab. Click **Add Budget Line** and provide:

- **Budget Category** -- Which category this cost belongs to (e.g., "Electrical")
- **Financing Source** -- Which funding source will pay for it (selected from a dropdown of your configured [financing sources](financing-sources))
- **Estimated Amount** -- Your best estimate of the cost
- **Confidence Level** -- How reliable the estimate is (see below)

## Confidence Levels

Each budget line has a confidence level that reflects how accurate the estimate is. The confidence level determines the margin used in budget projections:

| Confidence Level | Margin | Meaning |
|-----------------|--------|---------|
| **Own Estimate** | +/- 20% | Your personal rough estimate |
| **Professional Estimate** | +/- 10% | An estimate from a contractor or professional |
| **Quote** | +/- 5% | A formal quote from a vendor |
| **Invoice** | 0% | An actual invoice -- the real cost |

Higher confidence levels produce tighter budget projections. As your project progresses from early estimates to formal quotes to actual invoices, the budget overview becomes increasingly accurate.

## Linking to Invoices

When a vendor invoice arrives for work covered by a budget line, you can link the budget line to an invoice. You can do this from either direction:

- From the **invoice detail page** -- use the two-step picker to select a work item and then a budget line, and specify the itemized amount
- From the **work item Budget tab** -- click the link action on an unlinked budget line to attach it to an existing invoice

When multiple budget lines on the same work item share an invoice, they collapse into an **Invoice Group** showing the invoice total alongside each line's planned and itemized amounts.

See [Invoices & Vendors](vendors-and-invoices) for details on managing invoices and the linking workflow.

## Multiple Budget Lines per Work Item

A single work item can have multiple budget lines. For example, "Renovate bathroom" might have separate budget lines for plumbing, electrical, and tiling -- each in a different category and potentially funded by different financing sources.

## VAT Handling

The budget line form has a **Price includes VAT** checkbox. When entering an amount that already includes VAT (gross), leave the box checked; when entering a net amount, uncheck the box and Cornerstone will apply the VAT multiplier on save.

Internally, planned amounts are always stored as gross (VAT-inclusive). The checkbox controls how Cornerstone interprets your input, not how the value is stored -- so all comparisons in the [Budget Overview](budget-overview), Available Funds row, and printed reports are like-for-like across budget lines, regardless of the pricing mode you chose when entering each one. The same behavior applies whether you use direct pricing or unit pricing (quantity × unit price) on the budget line.



