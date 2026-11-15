---
sidebar_position: 2
title: Areas & Trades
---

# Areas & Trades

Areas and trades replace the previous tag system and give you a structured way to organize your construction project by **location** and **specialty**.

## Areas

Areas represent physical locations or spaces within your project -- rooms, floors, exterior zones, or any logical grouping of space. Areas are **hierarchical**, so you can nest them to reflect the actual structure of your home.

### Examples

- **Ground Floor** > Kitchen, Living Room, Bathroom
- **First Floor** > Master Bedroom, Guest Room, Hallway
- **Exterior** > Garden, Garage, Driveway

### Creating Areas

Navigate to **Areas** in the sidebar. Select **New area** and provide:

- **Name** -- A short label (e.g., "Kitchen")
- **Color** -- Pick from a color palette for visual identification
- **Description** -- Optional details about the area
- **Parent Area** -- Optionally nest this area under an existing one

### Hierarchy

Areas can be nested to any depth. A parent area implicitly includes all its children -- for example, filtering tasks by "Ground Floor" will also show items assigned to "Kitchen", "Living Room", and any other child areas. Filters support arbitrary hierarchy depth, so deeply nested trees resolve correctly across every list page.

### Assigning Areas

When creating or editing a task or purchase, type in the **Area** field to search. Each result shows the **full path**, such as *Ground floor › Kitchen*, so rooms that share a name on different floors are easy to tell apart. The field then shows the same path for the area you picked.

If no area matches what you typed, choose **New area ‹text›**. The New area form opens with your text as the name, and the new area is selected when you save it.

### Area Breadcrumbs Everywhere

Once you assign an area, Cornerstone displays the **full ancestor path** as a breadcrumb (e.g. `House / Ground Floor / Kitchen`) wherever the item surfaces:

- Task and purchase lists, detail pages, and create pages
- Pickers that let you select a task, purchase, or budget line (the area appears as a secondary line under the title)
- Embedded references -- diary entries, invoices, and purchase dependencies that point back to a task
- The Money Overview cost breakdown and the Cost tab of a funding source page (grouped by the full area hierarchy)

The breadcrumb keeps each item grounded in its location at a glance, without having to click through to the detail page.

### The "No area" Option

Not every item has an area assigned -- maybe it is a project-wide task, an administrative item, or something you have not classified yet. The Tasks and Purchases lists include a dedicated **No area** filter option that surfaces exactly those items, separate from any real area. The Budget Overview uses the same label ("No area") for the bucket of budget lines whose task or purchase has no area assigned.

## Area Page

The **Area page** shows what is going on in one room, floor, or outside zone: the open work, the purchases, the latest site activity, the companies, and the costs. Select an area's name on the **Areas** page to open it. The area name is also a link in other places:

- The Photos spot table and spot cards, and the photo details
- The **Where** fact on a task or purchase page
- The area list on a diary entry

An area counts its own items and everything in its sub-areas. An item booked on a larger area, such as a purchase booked on the whole floor, is not counted on the room's page. It appears in a separate context list instead (see **Now & next here** below).

### Header

- **Breadcrumb** -- The path to the area, such as **Areas › Ground floor**. Each parent is a link. A top-level area shows just **Areas**
- **Log here** -- Starts a new diary entry for this area. On a desktop, **New** in the create menu also pre-fills the area while you are on the page
- **Room chips** -- When the area has sub-areas, a row of chips lists them. Select a chip to open that sub-area's page

### Summary Strip

The strip shows four facts in one row on a desktop. Each one covers the area and its sub-areas:

- **Tasks** -- The number of open tasks, with **· m late** when some are late. Opens the Tasks list filtered to this area. Shows **No tasks** when there are none
- **Expected cost** -- The total expected cost, followed by **Paid** and the amount paid so far. Opens the **Cost** section. An en dash shows when there are no costs yet
- **Photos** -- The number of photos, with the date of the latest one. Opens the Photos page filtered to this area. Shows **None yet** when there are no photos
- **Companies** -- The number of companies. Opens the **Companies here** section

### Now & Next Here

Shows up to five open tasks and purchases together, most urgent first: late items, then items in progress or ordered, then items with the nearest start or target date. Each row shows its kind (**Task** or **Purchase**), its status or a **Late** badge, its title, its dates, and its company. Selecting the title opens the task or purchase.

Under the list, **All tasks here (n)** and **All purchases here (n)** open the Tasks and Purchases lists filtered to this area. Each link appears only when there are items of that kind. A late item here follows the same rule as on Home.

Items booked on a larger area appear below the list in a separate box labelled **Booked on a larger area, not counted above**. Each row is one ancestor area, labelled by its level:

- **Whole building (no floor)** -- A building-level area
- **Whole floor (no room)** -- A floor-level area
- **‹name› itself (no sub-area)** -- Any other parent area

Each row shows its task and purchase counts and opens that area's page. These counts are never added to the figures on this page. Nothing planned yet shows as *Nothing planned in ‹area› yet.*

:::info Screenshot needed
The Area page does not have a screenshot yet. One will be added with the next stable release.
:::

### Latest from the Site

The three newest diary entries that have a photo tagged to this area or to one of its sub-areas. Each entry appears once. Entries without photos are not listed.

- **All diary entries here** -- Opens the Site diary filtered to this area
- **Photos of ‹area› →** -- Opens the Photos page filtered to this area, with the photo count and the latest date

If nothing has been recorded yet, the section says *No diary entries or photos for ‹area› yet.* and the Photos link is hidden.

### Companies Here

The companies on tasks or purchases in this area or its sub-areas, each listed once. Each row shows the company's trade, how many tasks and purchases it has here, and a **Call** button when the company has a phone number. Selecting the name opens the company.

### Rooms and Sub-areas

Shown only when the area has sub-areas. The heading reads **Rooms** for a building or a floor, and **Sub-areas** for deeper areas. Each sub-area shows its photo count (or **No photos**) and its open tasks, and opens its own page.

### Cost

Lists the cost lines of this area and its sub-areas, grouped by the task or purchase they belong to. Amounts are gross, including VAT. The net amount is shown in a tooltip on each amount. Select a task or purchase name to open it. **Open Money** opens the budget overview.

## Areas Page: Expected Cost

The **Areas** page has an **Expected cost** column after Photos. For each area it shows the total of that area and its sub-areas, or **None** when nothing is booked. Quiet rows, such as **Whole floor (no room)**, show only the costs booked directly to them.

## Trades

Trades represent specialties of work -- the types of professional services involved in your project. Unlike areas, trades are **flat** (no hierarchy).

### Examples

- Electrical
- Plumbing
- Carpentry
- Painting
- HVAC
- Landscaping

### Creating Trades

Trades are managed on the **Companies** page. Select **⋯** next to **New company** and choose **Trades** to open the Trades sheet, select **New trade**, and provide:

- **Name** -- A short label (e.g., "Electrical")
- **Color** -- Pick from a color palette for visual identification
- **Description** -- Optional details about the trade

You can also create a trade from a company's **Trade** field. Type the name and choose **New trade ‹text›**. A small dialog asks only for the name, and the new trade is selected once you save it.

### Linking Companies to Trades

Each company can be assigned a trade to indicate its specialty. When creating or editing a company, type in the **Trade** field to search for one. This makes it easy to see which companies cover which types of work.

## Managing Areas & Trades

From the **Areas** page you can:

- Open an area's page by selecting its name
- **Edit** an area's name, color, or description
- **Reorder** items using drag handles or sort order
- **Reparent** an area by changing its parent
- **Delete** an area (this removes the association from all items that use it)

Editing and deleting stay on the **Areas** page. The Area page is for reading and does not have Edit or Delete.

From the Trades sheet (**⋯** › **Trades** on the **Companies** page) you can rename a trade, merge duplicate trades, and delete a trade.

![Areas page with a list of areas](/img/screenshots/manage-light.png)
