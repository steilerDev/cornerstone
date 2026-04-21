---
sidebar_position: 6
title: Budget Overview
---

# Budget Overview

The budget overview dashboard at **Budget > Overview** gives you a high-level view of your project's financial health. It surfaces totals across financing sources, four different "remaining budget" perspectives, and a cost breakdown grouped by **area hierarchy**.

## Summary Tiles

At the top of the overview you see a set of summary tiles -- Total Budget, Total Estimated, Total Invoiced, Total Remaining, and one per financing source. Each tile is **clickable**: clicking a tile selects every matching budget line in the table below, so you can jump straight from a headline number into the underlying lines that drive it. Click the same tile again (or click in empty space) to clear the selection.

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

- **Budget lines linked to a paid, pending, or claimed invoice** use the itemized invoice amount (0% margin)
- **Budget lines linked to a quotation** use the itemized amount with a +/- 5% margin
- **Budget lines without an invoice link** use the estimated amount with the confidence margin

This means your projections automatically become more accurate as your project progresses and estimates are replaced by real invoices.

### Confidence Margins

The margin applied to non-invoiced budget lines depends on the confidence level:

| Confidence Level | Margin |
|-----------------|--------|
| Own Estimate | +/- 20% |
| Professional Estimate | +/- 10% |
| Quote | +/- 5% |
| Invoice | 0% (actual cost used) |

## Cost Breakdown by Area

The cost breakdown table is grouped by your **area hierarchy** rather than by category. This makes it easy to see what each room, floor, or zone of the project actually costs.

- Each **area** is a row. Its totals roll up every descendant area beneath it.
- Clicking a row expands it to show child areas and, at the leaf level, the individual budget lines.
- Nested rows are visually indented so the tree is easy to scan.
- Budget lines whose work item or household item has no area assigned are collected in a dedicated **No Area** bucket at the bottom of the table (previously labeled "Unassigned").

Each row displays the estimated total, invoiced total, subsidy reduction, and remaining amount for that slice of the project.

## Financing Source Summary

A summary of each financing source shows:

- Total amount available
- Current depletion (based on actual invoice costs)
- Remaining balance

For a much deeper view of each source -- including every budget line attached to it, grouped by area and work item, with multi-select and mass-move -- see [Financing Sources](financing-sources).

## Subsidy Impact

Approved and disbursed [subsidies](subsidies) are factored into the overview calculations. The dashboard shows how much each subsidy reduces the total cost for its linked category. Pending and rejected subsidies are excluded from calculations.

## Printing the Overview

The Budget Overview has dedicated **print styling** so you can hand your bank, accountant, or partner a clean PDF or paper copy.

- Use your browser's Print command (`Cmd+P` on macOS, `Ctrl+P` on Windows/Linux) directly from the overview page.
- The app chrome -- sidebar, navigation, floating buttons -- is suppressed in print.
- Page margins, title spacing, and nested area group boxes are tuned for A4/Letter output.
- Inner item separators keep individual budget lines readable when an area group contains many children.
- The browser's own print header/footer is suppressed; pick your target (printer or "Save as PDF") and go.

:::tip
If the exported PDF does not match what you see on screen, make sure your browser's "Background graphics" option is enabled in the print dialog -- the nested group boxes rely on background color to stay legible.
:::

![Budget overview dashboard](/img/screenshots/budget-overview-light.png)
