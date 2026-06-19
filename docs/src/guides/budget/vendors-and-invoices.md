---
sidebar_position: 4
title: Invoices & Vendors
---

# Invoices & Vendors

Invoices track the real cost of your project -- the receipts from everyone you pay. Each invoice can be linked to multiple budget lines across your work items and household items, and each vendor can have any number of invoices attached.

:::info Vendors now live under Settings
Vendor records have moved out of the Budget subnav and into **Settings > Vendors**. That makes sense because a vendor's name, trade, and contact details are master data you set up once -- similar to areas, trades, and user accounts -- whereas invoices are financial transactions that belong with the rest of the budget. All existing links between invoices, budget lines, and vendors are preserved; only the menu location has changed.
:::

## Vendors (under Settings)

### Vendor List

Navigate to **Settings > Vendors** in the sidebar to see all vendors. The list supports:

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

Navigate to **Budget > Invoices** in the sidebar to see all invoices across all vendors. (Invoices remain in the Budget section; only the vendor records themselves moved to Settings.) The list supports:

- **Search** -- Find invoices by number or vendor name
- **Status Filter** -- Filter by Quotation, Pending, Paid, or Claimed
- **Sorting** -- Sort by date, amount, or status
- **Pagination** -- Browse through large invoice lists

### Creating an Invoice

Click **New Invoice** -- either from a vendor's detail page or from the top of the **Budget > Invoices** list. Provide:

- **Invoice Number** -- The vendor's invoice reference number
- **Date** -- The invoice date
- **Amount** -- The total invoice amount

Budget lines are linked to the invoice after creation from the invoice detail page (see [Linking Budget Lines](#linking-budget-lines-to-an-invoice) below).

### Creating an Invoice from a Paperless document

If you have both [Paperless-ngx](/guides/documents/setup) and [Auto-itemize](auto-itemize) configured, **New Invoice** becomes a faster, document-first flow. Instead of the blank form, it opens a **document picker**: choose the scanned PDF the vendor sent you, and Cornerstone reads the invoice straight off the page.

Picking a document takes you to a review screen that:

- **Pre-fills the invoice metadata** (number, amount, date, due date, notes) from the document, each with a one-click suggestion to apply the extracted value.
- **Suggests the vendor** -- pick the matching vendor (the picker pre-suggests one based on the document); this field is required.
- **Lists the extracted line items**, each ready to include, edit, categorise, fund, and assign to a work item or household item -- exactly like the [Auto-itemize](auto-itemize) review page. Net line items are grossed up by VAT so the totals match the invoice.

Click **Create Invoice & Itemize** to create the invoice and all its budget lines in one step. The new-invoice review screen and the existing-invoice [Auto-itemize](auto-itemize) page share the same review interface, so the line-item editing, assignment, and funding-source behaviour is identical in both -- including the queued-on-save **Create Budget Line** flow: choosing to create a new work-item budget line drops an inline "Creating New" draft onto the row (with a **Discard** button) and materialises it when you save, rather than creating it up front. See [Assign each line](auto-itemize#6-assign-each-line-and-set-its-category-and-funding-source) for the details.

A couple of small touches are specific to building an invoice from a Paperless document: the line confidence is applied automatically from the document's Paperless type (an **Invoice** type is treated as a firm cost, a **Quotation** as an estimate) and the confidence control is hidden once it has been set for you. The extraction also benefits from the [human-authored metadata you keep in Paperless](auto-itemize#what-data-leaves-your-server) -- title, correspondent, document type, tags, and date -- so the suggested vendor and dates tend to land closer to correct.

If Paperless or Auto-itemize is not configured, **New Invoice** opens the plain form described above -- there is no document step. You can also fall back to manual entry from the picker at any time.

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

Click an invoice to see its full detail page with the invoice amount, current status, the **Deposits** section (for tracking staged payments), and the **Linked Budget Lines** section.

If you have [Paperless-ngx configured](/guides/documents/setup), you can also link documents (invoice PDFs, receipts, supporting files) directly to invoices from the detail page. See [Linking Documents](/guides/documents/linking-documents) for details.

### Staged Payments (Deposits)

Many invoices are paid in stages -- a deposit on signing, progress payments at milestones, and a final balance. Cornerstone supports this with **invoice deposits**: each deposit is a partial payment with its own due date, status, and description. The remaining (final) payment uses the parent invoice's status. Budget rollups respect deposit status so `actualCostPaid` reflects real cash flow.

See [Invoice Deposits](invoice-deposits) for the full guide.

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

:::tip Skip the typing with Auto-itemize
If the invoice has a Paperless document linked and you have configured an LLM provider, an **Auto-itemize** action appears on the linked-document card in the **Documents** section. Cornerstone reads the OCR text from the PDF and proposes one budget line per row on a dedicated review page with the PDF shown alongside -- you only review and assign them. See [Auto-itemize Invoices](auto-itemize) for the full guide.
:::

### Unassigned Budget Lines

Budget lines can exist on an invoice without yet being linked to a work item or household item -- they are called **Unassigned** and show up with a muted pill in the "Linked Item" column. This happens when you add a budget line directly on the invoice and leave the parent picker empty to decide later. (Auto-itemize, by contrast, lets you assign each extracted line to its target right on the [review page](auto-itemize) before you save.)

Each Unassigned row has an inline **Assign…** button. Clicking it opens a picker with two tabs -- **Work Item** and **Household Item** -- where you choose the target and save. Unassigned lines still count toward your financing-source and category totals, but they do not appear on any single work item's Budget tab until they are assigned. If you assign a line to the wrong item, you can change it later -- invoice-linked lines can be edited and [moved to a different parent item](work-item-budgets#editing-invoice-linked-budget-lines).

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
