---
sidebar_position: 4
title: Vendors & Invoices
---

# Vendors & Invoices

Vendors are the companies and contractors that provide services or materials for your project. Each vendor can have multiple invoices, and each invoice can be linked to multiple budget lines across your work items and household items.

## Vendors

### Vendor List

Navigate to **Budget > Vendors** in the sidebar to see all vendors. The list supports:

- **Search** -- Find vendors by name
- **Sorting** -- Sort by name or creation date
- **Pagination** -- Browse through large vendor lists

### Creating a Vendor

Click **New Vendor** and provide the vendor's name and optionally assign a **trade** to indicate the vendor's specialty (e.g., Electrical, Plumbing). Trades are managed on the [Manage page](/guides/work-items/areas-and-trades).

### Vendor Detail

Click a vendor to see their detail page, which shows the vendor's information, assigned trade, and all their invoices. From the vendor edit page, you can navigate directly to any invoice detail by clicking on it.

![Vendor detail page](/img/screenshots/budget-vendor-detail-light.png)

## Invoices

### Invoice List

Navigate to **Budget > Invoices** in the sidebar to see all invoices across all vendors. The list supports:

- **Search** -- Find invoices by number or vendor name
- **Status Filter** -- Filter by Quotation, Pending, Paid, or Claimed
- **Sorting** -- Sort by date, amount, or status
- **Pagination** -- Browse through large invoice lists

### Creating an Invoice

From a vendor's detail page, click **New Invoice** and provide:

- **Invoice Number** -- The vendor's invoice reference number
- **Date** -- The invoice date
- **Amount** -- The total invoice amount

Budget lines are linked to the invoice after creation from the invoice detail page (see [Linking Budget Lines](#linking-budget-lines-to-an-invoice) below).

### Invoice Statuses

Invoices have four statuses:

| Status | Meaning |
|--------|---------|
| **Quotation** | A formal quote from the vendor -- not yet an actual cost |
| **Pending** | Invoice received but not yet paid |
| **Paid** | Invoice has been paid to the vendor |
| **Claimed** | Payment has been claimed from / reimbursed by the financing source |

:::tip
Use the **Quotation** status for vendor quotes that you want to track alongside actual invoices. Quotation amounts are treated with a +/- 5% margin in budget projections, reflecting the typical variance from a formal quote.
:::

### Invoice Detail

Click an invoice to see its full detail page with the invoice amount, current status, and the **Linked Budget Lines** section.

If you have [Paperless-ngx configured](/guides/documents/setup), you can also link documents (invoice PDFs, receipts, supporting files) directly to invoices from the detail page. See [Linking Documents](/guides/documents/linking-documents) for details.

![Invoice detail page](/img/screenshots/budget-invoice-detail-light.png)

## Linking Budget Lines to an Invoice

A single invoice often covers multiple cost items -- for example, one contractor invoice might include materials, labor, and equipment hire across different budget categories. Cornerstone supports linking **multiple budget lines** from work items and household items to a single invoice, each with an itemized amount.

### How to Link from the Invoice Page

On the invoice detail page, the **Linked Budget Lines** section lets you add budget line links using a two-step picker:

1. **Select an item** -- Choose a work item or household item from the picker
2. **Select a budget line** -- Pick which budget line on that item to link

Once linked, enter the **itemized amount** for each budget line -- the portion of the invoice total that applies to that specific line. All itemized amounts are shown alongside a computed **Remaining** row that displays the unallocated portion of the invoice total.

:::tip
The Remaining row helps you ensure the full invoice amount is allocated. If the remaining amount is zero, the invoice is fully distributed across budget lines.
:::

### How to Link from an Item Detail Page

You can also link budget lines to invoices directly from the work item or household item detail page. On the **Budget** tab, each budget line that is not yet linked to an invoice shows a link action that lets you select an existing invoice.

This bidirectional linking means you can work from whichever direction makes sense -- start with the invoice and find the budget lines, or start with a budget line and attach it to an invoice.

### Invoice Groups on Item Detail Pages

When multiple budget lines on a work item or household item share the same invoice, they are visually grouped into an **Invoice Group**. The group is collapsible and shows:

- The **invoice total** amount
- Each budget line's **planned amount** and **itemized amount** (the portion allocated from that invoice)
- The invoice status and date

This grouped view helps you see at a glance how a single invoice is distributed across the item's budget lines.

### Rules and Constraints

- A budget line can be linked to **at most one invoice** -- each budget line is exclusive to a single invoice
- An invoice can be linked to **many budget lines** across different work items and household items
- Itemized amounts are independent of the planned amount on the budget line -- they represent the actual cost attribution from the invoice
