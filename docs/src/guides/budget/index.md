---
sidebar_position: 5
title: Budget
---

# Budget

The budget system in Cornerstone helps you track construction costs across your entire project. Organize expenses by category, manage multiple financing sources, track company invoices, and apply grants -- all with an expected cost for the whole project, shown as a range from the lowest to the highest estimate.

## Overview

The budget system provides:

- **Cost Categories** -- Organize costs into categories like "Electrical", "Plumbing", or "Windows & Doors"
- **Financing** -- Track where money comes from on one page: loans and your own funds as cards with their figures, plus grants. Each funding source page shows its allocation, its cost lines, and its history, and lets you move lines to another source
- **Work Item Cost Lines** -- Link estimated costs to tasks with a basis that reflects how reliable each estimate is
- **Invoices** -- Track offers and invoices from companies, split them into cost lines with a grid, and link the lines to tasks and purchases (companies have their own page -- see [Invoices & Companies](vendors-and-invoices))
- **Grants** -- Track grants that pay back part of the cost of the tasks and purchases you link to them
- **Money Overview** -- See what is left to spend as one headline figure, with its verdict and range, and break the costs down by area, type, cost category or funding source, down to single cost lines, with a funding source filter and print-friendly styling
- **Bank Reports** -- Generate a formatted PDF for a funding source -- a claim submission, a proof-of-funds statement, or a general overview -- with an editable cover letter, optional AI-drafted content, and configurable columns

## How It Fits Together

Each **task** can have one or more **cost lines**. A cost line connects a task to a **cost category** and a **financing source** with an estimated amount and a basis.

When a company submits an **offer** or **invoice**, you split it into cost lines and link them to the tasks and purchases they belong to. A single invoice can be split across different tasks and purchases, and each linked line carries the amount that applies to it. This replaces the estimate with the actual cost and automatically updates the budget overview.

**Grants** reduce the total amount needed from financing sources. Each grant pays for the tasks and purchases linked to it.

![Budget overview dashboard](/img/screenshots/budget-overview-light.png)

## Next Steps

- [Cost Categories](categories) -- Create and manage cost categories in Settings > Project setup
- [Financing](financing-sources) -- Funding sources, own funds, and the cost lines each one pays for
- [Work Item Budgets](work-item-budgets) -- Add cost estimates to work items
- [Invoices](vendors-and-invoices) -- Track invoices and link them to cost lines (companies have their own page)
- [Auto-itemize Invoices](auto-itemize) -- Extract rows from invoice PDFs using your own LLM provider
- [Grants](subsidies) -- Manage grants and the tasks and purchases they cover
- [Money Overview](budget-overview) -- Left to spend, the funding sources, the cost breakdown by view, and print output
- [Bank Reports](bank-reports) -- Generate claim, proof-of-funds, and budget overview PDFs for a financing source
