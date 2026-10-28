---
sidebar_position: 7
title: Purchases
---

# Purchases

Purchases let you track furniture, appliances, fixtures, and other household items for your home -- separate from construction tasks. Each purchase has its own lifecycle from planning through delivery, with budget tracking, company management, delivery scheduling, and document linking.

## Overview

The purchases system provides:

- **Purchase Management** -- Create, edit, and track purchases with categories, statuses, companies, rooms, quantities, and product URLs
- **Budget Integration** -- Add cost lines with a basis, cost categories, and financing sources -- purchase costs appear in the project-wide budget overview
- **Task Linking** -- Link purchases to tasks for installation coordination (e.g., "Kitchen sink" depends on "Plumbing rough-in")
- **Delivery Scheduling** -- Track order dates, delivery windows (earliest/latest), actual delivery dates, and late detection
- **Timeline Dependencies** -- Add dependencies on tasks and milestones so delivery dates integrate with the project schedule chart
- **Invoice Linking** -- Link company offers and invoices to purchase cost lines to track actual costs
- **Document Linking** -- Attach documents from [Paperless-ngx](/guides/documents) (product specs, receipts, warranties) to purchases
- **Areas & Notes** -- Assign items to project areas and add timestamped notes
- **Grant Support** -- Link grants to purchases so the grant covers their costs

## Categories

Each purchase has a category, such as Furniture or Appliances. Categories come from a list you manage in **Settings > Project setup**, in the **Purchase categories** section.

The app starts with eight defaults: Furniture, Appliances, Fixtures, Decor, Electronics, Outdoor, Storage, and Other. You can rename them, add more, or delete the ones you no longer need. You can also create a new category on the spot: type a name in the category field and choose **New category ‹text›**. See [Categories](/guides/budget/categories) for how these lists are managed.

## Statuses

Purchases move through a lifecycle:

| Status | Meaning |
|--------|---------|
| **Planned** | Item identified but not yet ordered |
| **Ordered** | Order placed with the company |
| **Delivery scheduled** | Delivery date confirmed |
| **Delivered** | Item delivered |

## Area Breadcrumbs

Purchases display the full **area ancestor path** (e.g. `House / Ground Floor / Kitchen`) wherever they appear -- list pages, detail pages, pickers, and any task or diary entry that references them. See [Areas & Trades](/guides/work-items/areas-and-trades) for how the area hierarchy works.

## List View

The **Purchases** page lists every purchase. Open it from **Purchases** in the main navigation. The list provides:

- **Status chips** -- **Planned**, **Ordered**, **Delivery scheduled** and **Delivered** show one status at a time, and **All** shows every purchase
- **Search** -- Type in **Search purchases** to find a purchase by its name or description. The search applies within the selected status chip, and **All** searches every status
- **Filters** -- Select **Filters** to narrow the list by **Category**, **Area**, **Company**, **Target delivery**, **Delivered on**, **Expected cost**, **Invoiced**, **Grants**, **After grants** and **Cost lines**. The button shows how many filters are active, and **Clear filters** resets them all
- **Group by** -- Group the purchases by **Status** (the default), **Area** or **Company**. Purchases with no area or no company sit in a last group called **No area** or **No company**
- **Sort** -- Sort by **Name** (the default, A to Z), **Status**, **Category**, **Delivery**, **Target delivery**, **Delivered on**, **Order date**, **Expected cost** or **Invoiced**, in ascending or descending order
- **Columns** -- Show or hide **Area**, **Company**, **Delivery**, **Expected cost**, **Invoiced**, **Category**, **Order date**, **Grants**, **After grants** and **Cost lines**
- **Totals** -- A footer shows **Expected cost**, **Invoiced** and **Paid** across every purchase that matches. While you narrow the list, the footer is labeled **Totals (filtered)**
- **Responsive layout** -- Table view on desktop, card view on mobile and tablet

When the list is grouped by status, **Delivered** starts collapsed as long as other groups have purchases, so open items stay in view. Select the group heading to expand it.

Purchases load as you scroll. If the next batch does not load, select **Load more** at the bottom of the list. Each row has a **⋯** menu with **Open** and **Delete**. Press **n** to open the **New purchase** dialog.

All filter and sort settings are synced to the URL, so your view is bookmarkable and shareable.

### Filtering by Area

The **Area** filter supports the full area hierarchy: picking a parent area also matches every descendant area. The **No area** option surfaces items that have not yet been assigned to any area.

:::info Screenshot needed
The Purchases list has changed layout. A new screenshot is needed for this section.
:::

## Detail View

Click any purchase to see its full detail page with all fields, budget lines, notes, dependencies, linked tasks, linked documents (open them with the **Documents (n)** button), and linked grants. Fields can be edited inline by clicking on them.

![Household item detail page](/img/screenshots/household-item-detail-light.png)

## Next Steps

- [Creating & Editing Items](creating-editing-items) -- How to create and manage purchases
- [Budget & Invoices](budget-and-invoices) -- Track costs and link invoices
- [Task Linking](work-item-linking) -- Coordinate installation with tasks
- [Delivery & Dependencies](delivery-and-dependencies) -- Schedule deliveries with timeline dependencies
