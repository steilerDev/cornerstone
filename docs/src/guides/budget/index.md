---
sidebar_position: 5
title: Budget
---

# Budget

The budget system in Cornerstone helps you track construction costs across your entire project. Organize expenses by category, manage multiple financing sources, track vendor invoices, and apply subsidies -- all with real-time projections that account for estimate confidence levels.

## Overview

The budget system provides:

- **Cost Categories** -- Organize costs into categories like "Electrical", "Plumbing", or "Windows & Doors"
- **Financing Sources** -- Track where money comes from (construction loan, savings, family loan) with depletion tracking, inline expansion of all attached budget lines, and a mass-move tool to reassign lines to a different source
- **Work Item Cost Lines** -- Link estimated costs to work items with a basis that reflects how reliable each estimate is
- **Invoices** -- Track vendor offers and invoices, split them into cost lines with a grid, and link the lines to tasks and purchases (vendor records now live under the Settings section -- see [Invoices & Vendors](vendors-and-invoices))
- **Subsidy Programs** -- Manage percentage-based or fixed-amount subsidies that reduce your effective costs
- **Budget Overview Dashboard** -- See your project's financial health grouped by **area hierarchy**, with clickable summary tiles, expandable nested rows, source attribution badges on every line, a per-source filter that updates the entire breakdown, and print-friendly styling
- **Bank Reports** -- Generate a formatted PDF for a budget source -- a claim submission, a proof-of-funds statement, or a general overview -- with an editable cover letter, optional AI-drafted content, and configurable columns

## How It Fits Together

Each **work item** can have one or more **cost lines**. A cost line connects a work item to a **cost category** and a **financing source** with an estimated amount and a basis.

When a vendor submits an **offer** or **invoice**, you split it into cost lines and link them to the tasks and purchases they belong to. A single invoice can be split across different work items and household items, and each linked line carries the amount that applies to it. This replaces the estimate with the actual cost and automatically updates the budget overview.

**Subsidies** reduce the total amount needed from financing sources, applied per budget category.

![Budget overview dashboard](/img/screenshots/budget-overview-light.png)

## Next Steps

- [Cost Categories](categories) -- Create and manage cost categories in Settings > Project setup
- [Financing Sources](financing-sources) -- Track funding sources, inline expansion of attached lines, and mass-move
- [Work Item Budgets](work-item-budgets) -- Add cost estimates to work items
- [Invoices](vendors-and-invoices) -- Track invoices and link them to budget lines (vendors are managed from Settings)
- [Auto-itemize Invoices](auto-itemize) -- Extract line items from invoice PDFs using your own LLM provider
- [Subsidies](subsidies) -- Manage subsidy programs
- [Budget Overview](budget-overview) -- Area-grouped cost breakdown, source attribution badges, per-source filter, clickable tiles, and print output
- [Bank Reports](bank-reports) -- Generate claim, proof-of-funds, and budget overview PDFs for a financing source
