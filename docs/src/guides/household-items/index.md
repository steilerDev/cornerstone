---
sidebar_position: 7
title: Purchases
---

# Purchases

Purchases let you track furniture, appliances, fixtures, and other things for your home -- separate from construction tasks. Each purchase has its own lifecycle from planning through delivery, with budget tracking, company management, delivery scheduling, and document linking.

## Overview

The purchases system provides:

- **Purchase Management** -- Create, edit, and track purchases with categories, statuses, companies, quantities, and product links
- **Budget Integration** -- Add cost lines with a basis, cost categories, and financing sources -- purchase costs appear in the project-wide budget overview
- **Waits For** -- Make a purchase wait for a task or milestone, for installation coordination (e.g., "Kitchen sink" waits for "Plumbing rough-in")
- **Delivery Scheduling** -- Track the order date, the delivery window (earliest and latest), the delivery date, and late detection
- **Timeline Dependencies** -- Add dependencies on tasks and milestones so delivery dates integrate with the project schedule chart
- **Invoice Linking** -- Link company offers and invoices to purchase cost lines to track actual costs
- **Document Linking** -- Attach documents from [Paperless-ngx](/guides/documents) (product specs, receipts, warranties) to purchases
- **Areas** -- Assign purchases to project areas
- **Grant Support** -- Link grants to purchases so the grant covers their costs
- **Site Diary and History** -- The diary entries about a purchase, and when it was created and last changed

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

## Purchase Page

Click any purchase to open its page. The page has a header, a summary strip, and five tabs: **Overview**, **Timing**, **Cost**, **Site diary**, and **History**.

:::info Screenshot needed
The purchase page does not have a screenshot yet. One will be added with the next stable release.
:::

### Header

- The breadcrumb starts with **Purchases**, which returns you to the list. If you opened the purchase from another page, such as a company or a task, a back link returns you there as well
- The purchase name is the page heading. To change it, open **Overview** and select **Edit** in the **Details** card
- The main button sets the status. A planned purchase shows **Mark ordered**. An ordered or scheduled purchase shows **Mark delivered**. Once the purchase is delivered, the main button becomes **Log**, which opens the capture screen for a diary entry about the purchase
- **Mark ordered** and **Mark delivered** ask for the date. **Mark delivered** offers **Today** or **Pick a date**. **Mark ordered** also offers **As planned** once a recorded order date has passed. The date cannot be in the future. A short **Undo** notification follows the change in case it was a mistake, and Undo also restores the previous order date
- The status menu next to the main button lets you pick any status
- The **⋯** menu has **Delete**. It asks for confirmation and lists what goes with the purchase

### Summary Strip

The strip shows the facts that matter most at a glance. Select a fact to open the tab where you change it.

| Fact | What it shows |
|------|---------------|
| **Delivery** | The delivery date once the purchase has arrived, otherwise the **Target** date, otherwise the delivery window as **Window**. A **Late · n d** badge appears when the purchase is late |
| **Where** | The area as a breadcrumb. When no area is set, the fact is empty and opens **Overview** |
| **Company** | The company the purchase is bought from. A company with a phone number also gets a **Call** button. When no company is set, the fact opens **Overview** |
| **Expected cost** | The expected cost, with the name of the grant that covers it. If several grants apply, the strip names the first and says how many more |
| **Invoiced** | The invoiced amount, or **None yet** when nothing has been invoiced |
| **Waits for** | The first task or milestone this purchase waits for, followed by a **+n** count when there are others, or **Nothing** |
| **Documents** | The linked Paperless-ngx documents. Opens the list of documents |

### Overview

The **Overview** tab holds the purchase details in one **Details** card:

- **Details** -- The description comes first, followed by the category, the quantity when it is more than 1, the company, the product link, and the area. Empty rows are left out. **Edit** opens all of these fields at once
- **Product link** -- Opens in a new tab. Only web addresses starting with `http://` or `https://` are turned into links. Any other text is shown as plain text

### Timing

The **Timing** tab holds everything about when the purchase arrives:

- **Delivery** -- The rows **Ordered on**, **Earliest delivery**, **Latest delivery**, **Target delivery**, and **Delivered on**. Select **Edit** to change every date except **Target delivery**. **Target delivery** is calculated from the tasks and milestones the purchase waits for, so you cannot edit it. The latest delivery date cannot be before the earliest, and the delivery date cannot be before the order date
- **Late** -- When the purchase is late, the card shows the **Late · n d** badge and a sentence that names the date that has passed. See [Delivery & Dependencies](delivery-and-dependencies#late-detection)
- **Waits for** -- The tasks and milestones this purchase cannot arrive before. Select **Add** to choose one. Removing a link can be undone with the **Undo** notification that follows

### Cost

The **Cost** tab shows the money side of the purchase:

- **Cost lines** -- The estimates and the offers or invoices they are linked to. **Add cost line** adds a line, **New invoice** creates an invoice, and **Link to offer or invoice** connects an estimate to an existing document. See [Budget & Invoices](budget-and-invoices)
- **Grants** -- The grants that cover this purchase. **Add** links a grant. When no grant covers the purchase, the card says so

### Site Diary

The **Site diary** tab lists the diary entries for the purchase. Entries for the purchase's company come first. Entries that match the purchase only through photo tags and dates are folded under **Other entries**. Select **Log for this purchase** to write a new entry. **Show all in the Site diary** opens the full diary.

### History

The **History** tab shows when the purchase was created, who created it, and when it was last updated. Purchases do not have a change history yet.

### Keyboard Shortcuts on the Purchase Page

Press `e` to edit the purchase details, `Delete` to delete the purchase, and `?` to see all shortcuts.

## Next Steps

- [Creating & Editing Items](creating-editing-items) -- How to create and manage purchases
- [Budget & Invoices](budget-and-invoices) -- Track costs and link invoices
- [Task Linking](work-item-linking) -- Coordinate installation with tasks
- [Delivery & Dependencies](delivery-and-dependencies) -- Schedule deliveries with timeline dependencies
