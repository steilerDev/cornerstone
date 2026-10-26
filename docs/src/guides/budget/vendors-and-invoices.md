---
sidebar_position: 4
title: Invoices & Vendors
---

# Invoices & Vendors

Invoices track the real cost of your project -- the receipts from everyone you pay. Each invoice can be split into cost lines across your tasks and purchases, and each company can have any number of invoices attached.

:::info Vendors now live under Settings
Vendor records have moved out of the Budget subnav and into **Settings > Vendors**. That makes sense because a vendor's name, trade, and contact details are master data you set up once -- similar to areas, trades, and user accounts -- whereas invoices are financial transactions that belong with the rest of the budget. All existing links between invoices, cost lines, and vendors are preserved; only the menu location has changed.
:::

## Vendors (under Settings)

### Vendor List

Navigate to **Settings > Vendors** in the sidebar to see all vendors. The list supports:

- **Search** -- Find companies by name
- **Sorting** -- Sort by name or creation date
- **Pagination** -- Browse through large company lists

### Creating a Vendor

Click **New Vendor** and provide the vendor's name and optionally assign a **trade** to indicate the vendor's specialty (e.g., Electrical, Plumbing). Type in the **Trade** field to search. If no trade matches, choose **New trade ‹text›**. Trades are managed on the Companies page (see [Areas & Trades](/guides/work-items/areas-and-trades#trades)).

### Vendor Detail

Click a company to see their detail page, which shows the company's information, assigned trade, and all their invoices. From the company edit page, you can navigate directly to any invoice detail by clicking on it.

![Vendor detail page](/img/screenshots/budget-vendor-detail-light.png)

## Invoices

### Invoice List

Navigate to **Budget > Invoices** in the sidebar to see every invoice and offer across all companies. The page heading shows how many rows there are, such as **Invoices (24)**. Invoices remain in the Budget section; only the company records themselves moved to Settings.

The list loads more rows as you scroll down, so there are no pages to step through.

#### Status Chips

Chips across the top of the list show one status each. Each chip carries its row count, such as **To pay (12)**. Select a chip to show only its rows. The pressed chip is the one you are looking at.

| Chip | Shows |
|------|-------|
| **To pay** | Invoices that are not paid yet, and progress payments still to pay. The list opens here. |
| **Offers** | Company offers. Opens the [Offers summary](#offers). |
| **Paid** | Paid invoices. |
| **Submitted** | Invoices included in a draw-down request to the bank. |
| **All** | Every invoice and offer, whatever its status. |

On the **To pay** chip, an invoice with progress payments still to pay expands to show those payments and any refunds due. On the other chips, the expanded row shows all of its progress payments.

Search looks across every status. If a match sits on another chip, no chip is pressed and a note such as **Searching all · 1 more in Offers** names the chips that hold matches.

#### Filters

Select **Filters** to narrow the list by company, invoice date, due date and amount. The **Show only** group holds four checkboxes. Each one applies only while it is ticked:

- **Not yet split** -- invoices and offers not yet divided into cost lines.
- **Without document** -- no Paperless-ngx document is linked yet.
- **Refunds due** -- a refund is still expected from the company. The option shows its count and amount, such as **Refunds due (1 · 250 EUR)**, and appears only while a refund is due or while it is ticked.
- **Due or overdue** -- overdue, or due within the next 7 days. It counts the invoice itself and its pending progress payments. Refunds are not counted.

A note above the list names the active checkboxes, such as **Showing only: Not yet split, Due**, so an empty list is explained. **Clear filters** resets everything at once.

#### Totals

The **To pay** chip shows a **Still to pay** footer: the total you still owe across all open invoices and progress payments. While a search or filter is active, the footer reads **Still to pay in this list** and totals only the rows shown. The other chips have no footer.

#### Sort and Group

Sort by **Due date** (the default), **Date**, **Amount**, **Company** or **Invoice number**. On the **To pay** chip with the default sort, the list puts the earliest open due dates first, so overdue items come at the top.

**Group by** sorts the rows under headings: **None** (the default), **Status**, or **Company**.

#### Rows and Badges

Each row shows the invoice number (or **No number**), the company, the due date, the amount and the **Still to pay** amount. Select the invoice number to open the invoice. Select the company name to open the company.

Badges appear next to the status:

- **Not yet split** -- the invoice is not fully divided into cost lines.
- **Overdue** or **Due soon** -- the due date has passed, or is within 7 days.
- **Progress payment overdue** -- one of its progress payments is overdue.
- **Progress payments only** -- on the To pay chip, the invoice is already paid or submitted, but some progress payments are still open.

Select **Columns...** to show or hide columns such as **Split** and **Notes**. On a phone, each row is a card with the company, the due date and the amount.

#### Mark Paid

Select **Mark paid** on a To pay invoice to mark it paid at once. The row leaves the To pay chip, and a message with an **Undo** button appears. Select **Undo** to put it back.

To mark several invoices at once, tick their checkboxes. The selection bar shows **Mark paid (n)**, where n counts the selected invoices that are To pay. Offers and progress payments in the selection are skipped, and the bar says how many were skipped. One **Undo** reverses the whole batch.

Offers cannot be marked paid. Progress payments have their own **Mark paid** action on the progress payment row, which asks for the payment date.

#### Offers

Select the **Offers** chip to see company offers. Above the list, the **Offers summary** shows four facts for the rows in the list, with any filters applied:

- **Offers** -- how many offers there are
- **Offered** -- the total of the offers
- **Paid** -- the progress payments made so far
- **Remaining on offer** -- the offered total minus those progress payments

On the offer rows, the columns show each offer's **Offered**, **Paid**, **Remaining on offer** and **Progress payments**. The summary appears only on the Offers chip. To turn an offer into a final invoice, open the offer and use **Convert to final invoice** (see [Converting an Offer to a Final Invoice](#converting-an-offer-to-a-final-invoice)).

#### Empty Lists

- On **To pay**, with nothing filtered: **Nothing to pay right now**. Every invoice and progress payment is paid or submitted.
- On the other chips with no rows: **No invoices yet**. Add an invoice or an offer to start tracking payments.
- When filters hide every row: **No invoices match.** with a **Clear filters** button.

#### Old Links

Links from before this list was redesigned still work. `?status=quotation` opens the **Offers** chip, and `?openOnly=true` opens the **To pay** chip. The **Still to pay** figure on [Money Overview](budget-overview) and on the Home page links to the **To pay** chip.

### Creating an Invoice

Click **New Invoice** -- either from a company's detail page or from the top of the **Budget > Invoices** list. Provide:

- **Invoice Number** -- The company's invoice reference number
- **Date** -- The invoice date
- **Amount** -- The total invoice amount

Cost lines are added after creation from the invoice detail page (see [Splitting an offer or invoice into cost lines](#splitting-an-offer-or-invoice-into-cost-lines) below).

### Creating an Invoice from a Paperless document

If you have both [Paperless-ngx](/guides/documents/setup) and [Auto-itemize](auto-itemize) configured, **New Invoice** becomes a faster, document-first flow. Instead of the blank form, it opens a **document picker**: choose the scanned PDF the vendor sent you, and Cornerstone reads the invoice straight off the page.

Picking a document takes you to a multi-step review screen:

**Step 1: Company & Status**

- **Company picker** -- Pick the matching company (the picker pre-suggests one based on the document). If the company doesn't exist, type its name and choose **New company ‹text›**. The company form opens with the name filled in, and the new company is selected when you save it.
- **Invoice status** -- Choose the initial status: Offer, To pay, Paid, or Submitted. Defaults to **To pay**.
- **Default budget source (optional)** -- If set, all extracted lines are assigned to this funding source. You can still override the source for individual lines in step 2. This field is useful when you know the entire invoice comes from a single financing source.

**Step 2: Metadata & Lines**

- **Pre-fills the invoice metadata** (number, amount, date, due date, notes) from the document, each with a one-click suggestion to apply the extracted value.
- **Lists the extracted lines in the same grid as [Split with AI](auto-itemize)**, so you can include, edit, categorise, fund, and assign each line to a task or purchase. Net lines are grossed up by VAT so the totals match the invoice. If you specified a default budget source in step 1, each line uses that source by default but can be overridden.

Click **Create Invoice & Itemize** to create the invoice and its cost lines in one step. The new-invoice review screen and the existing-invoice [Split with AI](auto-itemize) page share the same grid, so line editing, assignment, and funding-source behaviour is identical in both. See [Assign each line](auto-itemize#6-assign-each-line-and-set-its-category-and-funding-source) for the details.

The extraction also benefits from the [human-authored metadata you keep in Paperless](auto-itemize#what-data-leaves-your-server) -- title, correspondent, document type, tags, and date -- so the suggested vendor and dates tend to land closer to correct.

If Paperless or Auto-itemize is not configured, **New Invoice** opens the plain form described above -- there is no document step. You can also fall back to manual entry from the picker at any time.

### Invoice Statuses

Invoices have four statuses:

| Status | Meaning |
|--------|---------|
| **Offer** | A formal offer from the company -- not yet an actual cost |
| **To pay** | Invoice received but not yet paid |
| **Paid** | Invoice has been paid to the company |
| **Submitted** | Paid or due, and included in a draw-down request to the bank (a claim for reimbursement from the financing source) |

:::tip
Use the **Offer** status for company offers that you want to track alongside actual invoices. Cost lines linked to an offer count at their face value on the task and purchase pages and on **Money > Overview**. The offer's amount is not shown as a range.
:::

### Converting an Offer to a Final Invoice

When an offer becomes a finalized invoice from the company, you can convert it to capture the final amounts and details. On the offer's invoice detail page, click **Convert to final invoice** to open a dialog where you:

1. **Enter final invoice details** -- final amount, invoice date, invoice number, due date, and notes (the offered amount is automatically added as a note)
2. **Optionally select a Paperless document** -- the document becomes the invoice attachment. If Paperless and an LLM are configured, **Prefill from document** auto-extracts the final details
3. **Review and edit the cost lines** -- proposed amounts are scaled pro rata to the final amount. You can adjust them or keep the existing lines; any unallocated amount goes to Discretionary
4. **See deposits and final payment** -- deposits remain unchanged and are shown separately from the final balance
5. **Choose payment status** -- mark the invoice as To pay or already Paid

If the final amount is less than the net deposits (deposits minus refunds), the dialog shows an **"Overpaid"** advisory note. You can optionally add a refund from the dialog to adjust the overpaid amount. Conversion is still blocked if the cost lines add up to more than the final amount -- adjust the lines first. Nothing is saved until you confirm the dialog.

### Invoice Detail

Click an invoice to see its full detail page with the invoice amount, current status, the **Deposits** section (for tracking staged payments), and the **Cost lines** section.

If you have [Paperless-ngx configured](/guides/documents/setup), you can also link documents (invoice PDFs, receipts, supporting files) directly to invoices. Click **Documents (n)** on the invoice detail page to open the Documents panel and use **Link document**. See [Linking Documents](/guides/documents/linking-documents) for details.

### Staged Payments (Deposits)

Many invoices are paid in stages -- a deposit on signing, progress payments at milestones, and a final balance. Cornerstone supports this with **invoice deposits**: each deposit is a partial payment with its own due date, status, and description. The remaining (final) payment uses the parent invoice's status. Budget rollups respect deposit status so `actualCostPaid` reflects real cash flow.

See [Invoice Deposits](invoice-deposits) for the full guide.

![Invoice detail page](/img/screenshots/budget-invoice-detail-light.png)

## Cost Lines on an Offer or Invoice

A single invoice often covers multiple cost items -- for example, one contractor invoice might include materials, labor, and equipment hire across different cost categories. The **Cost lines** section on the invoice detail page shows every line of that document, each linked to a task or purchase, with its amount.

### The Cost Lines Section

Each line shows:

- A **state chip** -- Estimate, Offered, Invoiced, Paid, or Submitted. Lines on an invoice normally show the state of that invoice.
- The **description**, and for unit-priced lines **quantity × unit price**, marked **Net** or **Gross** so you can see how the price was entered
- The **gross amount**. Hover over it, or focus it, to see the net amount and VAT.
- The task or purchase the line **belongs to**. A line with no task or purchase shows **Not assigned**.

The heading shows how many lines there are, such as **Cost lines (4)**. Use **Add cost line** to add a single line, or **Add lines (grid)** to enter several at once.

The **Total** of the lines is shown beneath them. For an offer, the **Expected cost** row on this page shows the offer's amount with no range. When grants apply to the lines, the row reads **After grants**.

### Splitting an Offer or Invoice into Cost Lines

Until every amount of the document is divided into lines, the table shows a **Not yet split** row with the amount still to divide and a **Split** button. Click **Split** to open the grid with the rest of the amount.

The grid is the same one used by [Split with AI](auto-itemize) and the new-invoice review screen:

- **Columns** -- One row per cost line. From left to right the columns are **Row**, **Description**, **Quantity**, **Unit**, **Unit price**, **Entered as** (Net or Gross), **Gross**, **Belongs to** (the task or purchase), **Cost category**, and **Actions** (**Duplicate**, **Use existing** to link a row to a cost line that already exists, and **Remove**). A blank quantity makes the unit price the single amount of the line. Type a description and the amounts, then pick the task or purchase the line **Belongs to**. The Include and Select checkboxes and the Funding source column appear in the [Split with AI](auto-itemize) grid and the new-invoice review screen, not here.
- **Keyboard** -- Move between cells with Tab and type straight into them. **Ctrl/⌘+D** duplicates the current row, and **Ctrl/⌘+Backspace** removes an empty row. **Ctrl/⌘+S** or **Ctrl/⌘+Enter** saves.
- **Defaults** -- New rows use unit pricing with **Net** entry, so VAT is added to the price. Use **Entered as for all** to change this for every row at once.
- **Assign all to** -- Set the same task or purchase for every row. Pick the item first, then adjust rows that belong elsewhere.
- **Paste rows** -- Copy rows from a spreadsheet and paste them into the grid. Each row is read as Description, Quantity, Unit, and Unit price. Up to 200 rows can be pasted at a time. If the paste has three or more columns, a **Check pasted rows** step asks you which column is which (or to ignore it) before the rows are inserted. Choose **Insert** to add them.
- **Document preview** -- When Paperless-ngx is on and the record has a linked document, the most recently linked document appears beside the grid, so you can check the rows against the source.
- **Status line** -- Shows how many lines you have entered and how many rows still need attention, for example a missing description or a number that can be read two ways. Numbers are read in your language's format (1.234,56 in German, 1,234.56 in English).

Save writes the lines. Each line is linked to this offer or invoice and appears in the Cost lines section. Lines that remain without a task or purchase are saved as **Not assigned**, and you can assign them later.

:::tip Skip the typing with Split with AI
If the invoice has a Paperless document linked and you have configured an LLM provider, the card for that document in the **Documents** panel has an **Itemize** action. It proposes the lines from the PDF in the same grid, with the PDF shown alongside. See [Auto-itemize Invoices](auto-itemize) for the full guide.
:::

### Linking an Existing Line

If a line already exists on a task or purchase without an offer or invoice, you can link it instead of creating a new one. In the form, choose **Use an existing cost line**, pick the line, and confirm. A line can be linked to only one offer or invoice, and the amount you link must fit within what is still left to split.

See [Work Item Budgets](work-item-budgets#linking-to-invoices) for linking from the task's side.

### Removing a Line from the Invoice

**Remove from invoice** detaches a line from this invoice. On an offer page, the action reads **Remove from offer**. The line stays on its task or purchase as an estimate.

The link is removed at once, with no confirmation dialog. A message appears with an **Undo** button. Select **Undo** to link the line to this invoice again. If the line has changed since, Undo does not restore the link, and the message says so. **Delete** still asks you to confirm before it removes a cost line.

### Rules and Constraints

- A cost line can be linked to **at most one** offer or invoice -- each line is exclusive to a single document
- An offer or invoice can have **many** cost lines across different tasks and purchases
- Line amounts are the amounts that apply to each line from the document. They are independent of the planned amount on the task or purchase.
- A line with no task or purchase is saved as **Not assigned**. It still counts toward financing-source and category totals.

### Invoice Amount Validation

When you edit the total amount of an invoice, Cornerstone enforces one constraint to prevent budget integrity violations:

- **Line total ceiling** -- When lowering an invoice total, the amounts of all cost lines linked to it must stay at or below the new amount. For example, if you have allocated 1000 EUR across cost lines and the invoice total is 1200 EUR, you can lower it to 1000 EUR but not below. Edits that raise the amount (or leave it unchanged) are never blocked.

:::info Date validation
Cornerstone rejects calendar-impossible invoice dates (e.g., 2026-02-31). Dates must be valid ISO 8601 dates.
:::
