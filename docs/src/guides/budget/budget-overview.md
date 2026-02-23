---
sidebar_position: 6
title: Budget Overview
---

# Budget Overview

The budget overview dashboard at **Budget > Overview** gives you a high-level view of your project's financial health. It shows totals by budget category, financing source allocations, and four different "remaining budget" perspectives.

## Remaining Budget Perspectives

The overview provides four ways to look at how much budget remains, each answering a different question:

| Perspective | Calculation | What It Tells You |
|------------|-------------|-------------------|
| **vs Min Planned** | Financing - (Estimated x (1 - margin)) | Best-case remaining budget assuming all estimates come in under |
| **vs Max Planned** | Financing - (Estimated x (1 + margin)) | Worst-case remaining budget assuming all estimates come in over |
| **vs Actual Cost** | Financing - Actual costs | Remaining budget based on real invoice amounts where available |
| **vs Actual Paid** | Financing - Paid amounts | Remaining budget based on what has actually been paid out |

Switch between perspectives to understand your financial position from different angles. Early in a project, the min/max planned views are most useful. As invoices arrive, the actual cost and actual paid views become more meaningful.

## How Projections Work

The budget overview uses a **blended projection model** that combines estimates and actuals:

- **Budget lines with invoices** use the actual invoice amount (0% margin)
- **Budget lines without invoices** use the estimated amount with the confidence margin

This means your projections automatically become more accurate as your project progresses and estimates are replaced by real invoices.

### Confidence Margins

The margin applied to non-invoiced budget lines depends on the confidence level:

| Confidence Level | Margin |
|-----------------|--------|
| Own Estimate | +/- 20% |
| Professional Estimate | +/- 10% |
| Quote | +/- 5% |
| Invoice | 0% (actual cost used) |

## Category Breakdown

The overview groups costs by budget category, showing:

- Total estimated amount for the category
- Progress bar indicating how much has been invoiced vs estimated
- Subsidy reductions applied to the category

## Financing Source Summary

A summary of each financing source shows:

- Total amount available
- Current depletion (based on actual invoice costs)
- Remaining balance

## Subsidy Impact

Approved and disbursed [subsidies](subsidies) are factored into the overview calculations. The dashboard shows how much each subsidy reduces the total cost for its linked category. Pending and rejected subsidies are excluded from calculations.

:::info Screenshot needed
A screenshot of the budget overview dashboard will be added here.
:::
