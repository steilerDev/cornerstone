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

### Source Attribution Badges

Every leaf-level budget line carries a **source attribution badge** so you can see at a glance which financing source funds each line:

- Each source is assigned a deterministic color from a 10-slot palette -- the same source always gets the same color across the table, between sessions, and in both light and dark mode.
- On **desktop**, the badge shows the full source name next to a colored dot (long names are truncated with the full name available on hover).
- On **mobile**, only the colored dot is shown to keep the row compact; tapping the line still opens the full detail.
- Lines without a source assignment are shown with a neutral "Unassigned" badge in a reserved color slot.

### Available Funds Row

The cost breakdown includes a dedicated **Available Funds** row at the top of the totals section. Click the row to expand it and see one line per financing source, with three columns:

- **Cost** -- how much of that source has been allocated to budget lines (perspective-aware: switches between min, max, and average projection)
- **Payback** -- the subsidy payback expected against budget lines funded from this source
- **Net** -- the remaining headroom on that source after subtracting cost and adding back payback

This makes it easy to spot which source is most depleted, which one is being subsidized, and which one still has slack -- all in a single glance.

### Filter by Source

Click any source detail row inside the **Available Funds** expansion to toggle that source on or off. Deselected sources are dropped from the entire breakdown:

- The summary tiles, projected cost range, every nested area row, and the **Available Funds** and **Remaining Budget** (Cost + Net) totals all recalculate against the visible set in real time as you toggle.
- A small "X of N selected" caption appears next to **Available Funds** while a filter is active.
- The selection is **persisted in the URL** as `?deselectedSources=<id>,<id>` so you can bookmark a filtered view, share it with your bank or partner, or refresh without losing state.
- Press **Escape** while focused on a source row to clear all deselections in one go.
- Source detail rows stay visible even when every source is deselected -- the filter is never a dead-end; you can always click your way back in.
- When you print a filtered view, deselected source rows are hidden from the printed output so the report only shows the sources you actually have selected.

Filtering happens **server-side** (`GET /api/budget/breakdown?deselectedSources=...`), which means subsidy payback math stays consistent with the visible set: subsidies that no longer have any qualifying budget lines drop out cleanly instead of double-counting. The Pending, Paid, and Quotation summary cards at the top of the page also refresh in step with the filter -- pick the sources you care about and the headline numbers update without leaving the page.

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

## Related Pages

- [Work Items](../work-items/overview) — track progress and link budget lines to construction tasks
- [Household Items](../household-items/overview) — manage furniture and appliance purchases with their own budget lines
- [Financing Sources](financing-sources) — detailed view of each financing source and its allocated lines
- [Subsidies](subsidies) — manage subsidy applications and their impact on your budget
