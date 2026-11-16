---
sidebar_position: 1
title: Creating & Editing Items
---

# Creating & Editing Items

## Creating a Purchase

Navigate to **Purchases** in the main navigation and click **New purchase**. The dialog shows these essential fields first:

- **Name** (required) -- A descriptive name for the purchase (e.g., "Kitchen island pendant lights")
- **Category** (required) -- The purchase category, such as Furniture or Appliances. Type to search, or choose **New category ‹text›** to create one. A small dialog asks only for the name. See [Categories](#categories) below
- **Status** -- Planned, Ordered, Delivery scheduled, or Delivered (defaults to Planned)
- **Quantity** -- Number of units (defaults to 1)
- **Area** -- Optional location within your project (e.g., "Kitchen", "Master bedroom"). Type to search, or choose **New area ‹text›** to create it
- **Company** -- Optional company or retailer for this purchase. Type to search, or choose **New company ‹text›** to create it
- **Waits for** -- Optional. The tasks and milestones this purchase must wait for, such as a delivery that comes after the installation milestone. Type to search and pick one or more. Each chosen item becomes a finish-to-start link with no lag
- **Earliest delivery** and **Latest delivery** -- The start and end of the expected delivery window

Select **More details** to show the rest of the form:

- **Description** -- Optional longer description or notes about the purchase
- **Product link** -- Optional link to the product for reference
- **Ordered on** -- When the purchase was or will be ordered
- **Delivered on** -- When the purchase arrived

Select **Save** to create the purchase. The purchase is created first and the **Waits for** links are added after it. If a link cannot be saved, the purchase still exists, you are taken to its page, and a message on its **Timing** tab says which link failed. Add that link again on the **Timing** tab. Cost lines and diary entries are added on the purchase page's **Cost** and **Site diary** tabs.

## Editing a Purchase

The purchase page keeps each group of fields on a card, and you edit a card with its own **Edit** button. Changes are saved when you click **Save**. Each card uses the same fields and labels as the **New purchase** dialog. **Status** is changed from the header, and **Waits for** is managed on the **Timing** tab.

### Details

On the **Overview** tab, select **Edit** in the **Details** card to change the name, description, category, quantity, company, product link, and area together. Press `e` on the purchase page to open the same card.

### Dates

On the **Timing** tab, select **Edit** in the **Delivery** card to change the order date, the earliest and latest delivery dates, and the delivery date. The **Target delivery** date is calculated from the tasks and milestones the purchase waits for, so it cannot be edited. See [Delivery & Dependencies](delivery-and-dependencies).

### Status

Use the **Mark ordered** and **Mark delivered** buttons in the header, or the status menu next to them, to change the status. Both ask for the date. See [the purchase page](/guides/household-items/#purchase-page).

:::note Old edit links
Links to the former edit page open the purchase page with the **Details** card already in edit mode.
:::

## Areas

Purchases share the same area system as tasks. Type in the **Area** field to search. Results show the full path, such as *Ground floor › Kitchen*, so you can quickly find the right location. If no area matches, choose **New area ‹text›** to create it and select it.

## Categories

The category list is managed in **Settings > Project setup**, in the **Purchase categories** section. The app starts with eight defaults: Furniture, Appliances, Fixtures, Decor, Electronics, Outdoor, Storage, and Other. See [Categories](/guides/budget/categories) for how these lists are managed.

## Deleting a Purchase

Open the **⋯** menu in the purchase header and choose **Delete**, or press `Delete` on the purchase page. A confirmation dialog lists what goes with the purchase before anything is removed.

:::caution
Deleting a purchase also removes its cost lines, its **Waits for** links, and its grant and document links. This action cannot be undone.
:::
