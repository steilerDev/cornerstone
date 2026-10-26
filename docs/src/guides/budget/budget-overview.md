---
sidebar_position: 7
title: Money Overview
---

# Money Overview

**Money > Overview** shows where your project's money stands: how much you have, what it is expected to cost, how much you have paid, and what is still to pay. Under the headline it breaks the cost down by area, type, cost category or funding source, down to single cost lines.

The page heading is **Money**. To add something, use the **New** menu at the top of the page. The page has no Add button.

## The Headline

The headline is **Left to spend**. It is the money still free for the whole project:

> Funding total plus Expected grants minus Expected cost.

- The figure is shown in large type, with a verdict beside it. The verdict reads **On budget** when money is left, and **Over budget** when the figure is below zero.
- Under the figure, a **range** runs from the lowest to the highest estimate. It reads "Range ... to ...".
- Select **How is this calculated?** to see the formula again. If any grants count only up to their eligible-costs cap, the disclosure lists them under "These grants count only up to their eligible-costs cap."

The headline is the same figure and verdict as the **Left to spend** tile on [Home](/guides/home), so the two pages always agree.

The headline never changes with the breakdown settings below. As soon as you change one of them (the payment, the estimate, or a funding source filter), the label shows **Whole project** beside it. This makes clear that the headline still covers the whole project.

![Money overview dashboard](/img/screenshots/budget-overview-light.png)

If no funding source or cost has been entered yet, the headline shows **No figure yet** with the note "Add a funding source and a cost to see this."

## The Facts

A row of five facts sits under the headline:

| Fact | What it is |
|------|------------|
| **Funding total** | The total of your funding sources |
| **Expected cost** | What the project is expected to cost, at the expected estimate |
| **Expected grants** | Grants you expect to receive, counted up to their caps |
| **Paid** | What you have paid so far. Select it to open [Invoices](/guides/budget/vendors-and-invoices). |
| **Still to pay** | What is still open on your invoices. Select it to open the **To pay** list of invoices. |

Paid and Still to pay come from your invoices, so they open the invoice list. Deposits count as they are paid, so a [staged deposit](invoice-deposits) adds to Paid once it has been paid.

## Funding Sources

The **Funding sources** section lists each [funding source](financing-sources) with a bar:

- **Allocated x of y** -- the expected cost of the cost lines funded by that source, out of the source's amount.
- The bar fills as the source is used. A source that is fully allocated shows a full bar.
- Only an over-allocation shows its own amount, as **Over-allocated by ...**. The section never shows a separate "Available" line.

Select **Edit or add funding sources** to open the list of funding sources. If you have none yet, the section says "No funding sources added yet" and offers **Add your first funding source**.

## The Breakdown

The **Breakdown** section shows a table of costs. Its settings are at the top of the section.

### Break down by

Choose how the rows are grouped:

| View | Rows |
|------|------|
| **Area** (default) | Your area hierarchy. Each area holds its tasks and purchases, and each task or purchase holds its cost lines. |
| **Type** | Tasks and purchases, then their cost lines |
| **Cost category** | Each cost category, then its cost lines |
| **Funding source** | Each funding source, then its cost lines |

Every view can be opened row by row, down to the single cost line. Each line shows its state (such as **Estimate**, **Offered**, **Invoiced** or **Paid**). Outside the funding-source view, the line also shows its funding source in muted text.

**Not yet split** appears in every view. It is money on an offer or invoice that you have not yet split into cost lines.

**Without a task** is the group of cost lines that are not linked to a task or purchase. In the **Area** view it sits under **No area**, and in the **Type** view under **Tasks**. In the **Cost category** and **Funding source** views, those lines sit directly under their category or source, with no task row in between.

Costs are always shown as positive amounts.

### Payment

Choose which part of the cost you want to see:

| Payment | What the table shows |
|---------|----------------------|
| **All** (default) | Expected cost, Paid and Still to pay. With **Show** set to Grants, also Grants and After grants. |
| **Paid** | Only the Paid column. Rows with nothing paid are hidden. |
| **Not yet paid** | Only the Not yet paid column. Rows with nothing left to pay are hidden. |

**Not yet paid** is the expected cost less what you have paid. For each row, Paid and Not yet paid add up to the row's expected cost. **Still to pay** counts only the open invoices, so it is not part of that sum. **Not yet paid** can be negative when a record is overpaid, for example when deposits exceed the final amount.

### Show estimates at

Choose the estimate the table uses:

- **Low** -- the lowest estimate.
- **Expected** (default) -- the expected estimate.
- **High** -- the highest estimate.

Lines that are linked to an offer or invoice count at their face value in all three. Only lines that are not yet linked use the margin of their estimate.

### Show: Grants

The **Show** chip **Grants** adds two columns to the table, when Payment is **All**:

- **Grants** -- the grants that apply to the row.
- **After grants** -- the expected cost less those grants.

### Funding source filter

The **Funding source** button opens a list of your funding sources, with a count such as "3 of 4". Tick a source to show its rows, and untick it to hide them. Select **Select all** to show every source again, and **Done** to close the list.

- At least one funding source must stay selected. The last one is kept on, and the list says "Keep at least one funding source selected."
- While a filter is active, the total reads **Total for the current settings**.
- Lines that have no funding source appear as **Unassigned**.
- In the **Funding source** view, a payment counts toward the funding source of its cost line. Each source row shows the Paid and Still to pay of its own lines.

### Totals

The **Total** row sits at the bottom of the table. It adds up the top-level rows in the view you chose. When a setting is not the default, it reads **Total for the current settings**.

If no cost lines exist yet, the breakdown says "Costs appear here once tasks or purchases have cost lines." If your filters hide everything, it says "Nothing matches these settings." and offers **Reset the breakdown settings**.

## On a Phone

On a phone the headline and facts stack as tiles. The breakdown shows a two-column list instead of a table:

- Select a row to show what is inside it. The screen says "Showing ..." and offers "Back to ..." to go up one level.
- The same settings are available above the list.

## Printing the Overview

Open the **⋯** menu (**Page actions**) and choose **Print**, or use your browser's Print command (`Cmd+P` on macOS, `Ctrl+P` on Windows and Linux).

- Every row is printed expanded, so the report shows every cost line.
- Above the table, a one-line summary lists the settings in use, such as "View: Area", "Payment: All", "Estimates: Expected", "Columns: ..." and "Funding sources: 3 of 4".
- The app's menus and buttons are left out of the printout.

:::tip
If the printed page does not match what you see on screen, turn on **Background graphics** in the print dialog.
:::

## Budget Overview for the Bank

Open the **⋯** menu and choose **Budget overview for the bank**. This opens the [Bank Reports](bank-reports) wizard with the **Budget Overview** report type already selected.

## Offers

Linked offers count at their face value on Money > Overview, the same as on the task and purchase pages. A cost line linked to an offer shows the offer's amount in every view, with no range added to it. For more, see [Invoices & Vendors](vendors-and-invoices).

## Subsidies

Only approved or received [subsidies](subsidies) count toward Expected grants and the headline. Eligible, applied and rejected subsidies are tracked but do not change the figures.

## Related Pages

- [Budget](/guides/budget/) -- how the budget pieces fit together
- [Work Items](../work-items/) -- track progress and link cost lines to construction tasks
- [Household Items](../household-items/) -- manage furniture and appliance purchases with their own cost lines
- [Financing Sources](financing-sources) -- detailed view of each funding source and its allocated lines
- [Subsidies](subsidies) -- manage subsidy applications and their impact on your budget
