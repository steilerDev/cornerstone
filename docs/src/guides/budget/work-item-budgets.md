---
sidebar_position: 3
title: Work Item Budgets
---

# Work Item Budgets

Each work item can have one or more **budget lines** that track the estimated or actual cost of that task. Budget lines connect a work item to a budget category and financing source.

## Adding a Budget Line

On the work item detail page, switch to the **Budget** tab. Click **Add Budget Line** and provide:

- **Budget Category** -- Which category this cost belongs to (e.g., "Electrical")
- **Financing Source** -- Which funding source will pay for it
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

When a vendor invoice arrives for work covered by a budget line, you can link the invoice line item to the budget line. This automatically:

- Sets the confidence level to **Invoice**
- Uses the actual invoice amount instead of the estimate
- Updates the budget overview with the real cost

See [Vendors & Invoices](vendors-and-invoices) for details on managing invoices.

## Multiple Budget Lines per Work Item

A single work item can have multiple budget lines. For example, "Renovate bathroom" might have separate budget lines for plumbing, electrical, and tiling -- each in a different category and potentially funded by different financing sources.

