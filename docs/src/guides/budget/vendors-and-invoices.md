---
sidebar_position: 4
title: Invoices & Companies
---

# Invoices & Companies

Invoices track the real cost of your project -- the receipts from everyone you pay. Each invoice can be split into cost lines across your tasks and purchases, and each company can have any number of invoices attached.

:::info Companies have their own page
Companies are a page of their own in the main navigation, separate from the budget. A company's name, trade, and contact persons are master data you set up once -- similar to areas, trades, and user accounts -- whereas invoices are financial transactions that belong with the rest of the budget. The company page also brings together what you owe the company, its offers, its work and its site diary entries.
:::

## Companies

### Company List

Navigate to **Companies** in the main navigation to see all companies. Search finds a company by its name or its trade. The list shows these columns by default:

- **Name** and **Trade**
- **Phone** and **Contact persons** -- the number of people on the company's contact list
- **Last on site** -- the date of the company's most recent site diary entry
- **Still to pay** -- the total you still owe the company across its open invoices and progress payments
- **Offers** -- the total of the company's offers, with the amount already paid shown beneath it, such as **12,000 EUR** and **5,000 EUR paid** below it. A company with no offers shows a dash.

Use **Visible columns** to show more, such as **E-mail**, **Address**, **Notes**, **Date added** or **Last updated**.

Sort by **Name**, **Trade**, **Still to pay**, **Last on site**, **Date added** or **Last updated** by selecting the column header. **Phone**, **Contact persons** and **Offers** cannot be sorted. The list shows one page at a time, so use the page controls to move through a long list.

### Creating a Company

Click **New company** and fill in the fields:

- **Name** -- Required, at most 200 characters.
- **Trade** -- Optional. The company's specialty, such as Electrical or Plumbing. Type in the field to search. If no trade matches, choose **New trade ‹text›**. Trades are managed on the Companies page (see [Areas & Trades](/guides/work-items/areas-and-trades#trades)).
- **Phone**, **E-mail**, **Address** and **Notes** -- Optional. An e-mail address must be valid if you enter one.

### Company Page

Select a company in the list to open its page. The page has a header, a summary strip and five tabs: **Overview**, **Work**, **Payments**, **Site diary** and **History**.

:::info Screenshot needed
A screenshot of the company page is still to come.
:::

#### Header and Call

The header shows the company's name with a **Call** button. **Call** dials the company's phone number:

- If the company has a phone number, **Call** uses it.
- If the company has no phone number but a contact person does, **Call** dials the number of the first contact person, in the order you added them, who has one. The button still reads **Call**.
- If no phone number is saved anywhere, the button reads **Add phone number**. Select it to go to the **Overview** tab, where the **Phone and e-mail** card opens for editing with the phone field selected.

#### Summary Strip

Below the header, a strip shows the key facts for the company:

- **Trade** -- the company's trade, or **None**.
- **Still to pay** -- the total you still owe the company.
- **Offers** -- the total of the offers, with the amount already paid beneath it, or **None**.
- **Tasks** -- the number of open tasks assigned to the company, such as **2 open**, or **None open**.
- **On site** -- the number of days recorded in the site diary for this company and the date of the last entry, such as **3 days** with **last 12 March 2027**. It reads **None yet** when no entry names the company.

#### Overview

The **Overview** tab holds four cards:

- **Contact persons** -- one row for each person, with the name, role, phone and e-mail. Each row has a **Call** button that dials that person's number. A person without a phone number shows **No phone number**. Select **New contact person** to add someone. Use a row's **⋯** menu to edit the person or remove them. Removing a contact person shows a message with an **Undo** button, which restores the person. A contact person needs a first name or a last name.
- **Phone and e-mail** -- the company's phone number and e-mail address.
- **Address** -- the company's postal address.
- **About** -- the company's name and notes, and who added the company (**Added by**).

Each card can be edited in place.

#### Payments

The **Payments** tab lists everything you pay or owe the company, and its tab label shows how many offers and invoices there are, such as **Payments (7)**.

The totals line at the top shows two figures:

- **Paid** -- what you have paid so far, across the company's invoices and progress payments.
- **Still to pay** -- what is still open, across the company's invoices and progress payments.

A submitted invoice is not counted in **Still to pay**. When one exists, a note beneath the totals says how many, such as **1 submitted invoice is not counted in Still to pay.**

Below the totals are three lists:

- **Invoices** -- each invoice with its due date, the amount paid and the **Still to pay** amount. Select the invoice to open it.
- **Offers** -- each offer with its amount, the amount paid and **Remaining on offer**.
- **Progress payments** -- the progress payments on the company's invoices, each with its date and amount.

Select **New invoice** or **New offer** to add a record with the company already filled in. The row menu **⋯** on an invoice or offer offers **Delete**, which asks you to confirm first.

#### Work

The **Work** tab shows what the company is doing or supplying for your project, in three lists:

- **Tasks** -- the tasks assigned to the company, with the end date of each.
- **Purchases** -- the household purchases that name the company as supplier, with their delivery or delivered date.
- **Cost lines** -- the cost lines that name the company.

#### Site Diary

The **Site diary** tab lists the diary entries that name this company, such as a daily log for the company or a delivery from it. The tab label shows how many there are, such as **Site diary (12)**. Select **Show all in Site diary** to open the Site diary with the same company filter applied.

#### History

The **History** tab lists what has happened to the company's offers and invoices, such as an invoice being recorded. Select **Show all in History** to open the full history with the same filter.

### Going Back to the Company

On an invoice or offer page, the company's name in the header links to the company page. From there you can return to its invoices and offers on the **Payments** tab.

## Invoices

### Invoice List

Navigate to **Budget > Invoices** in the sidebar to see every invoice and offer across all companies. The page heading shows how many rows there are, such as **Invoices (24)**. Invoices stay in the Budget section, and companies have their own page.

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

On the offer rows, the columns show each offer's **Offered**, **Paid**, **Remaining on offer** and **Progress payments**. The summary appears only on the Offers chip. To turn an offer into a final invoice, open the offer and select **Convert to final invoice**, which opens the Convert page (see [Converting an Offer to a Final Invoice](#converting-an-offer-to-a-final-invoice)).

#### Empty Lists

- On **To pay**, with nothing filtered: **Nothing to pay right now**. Every invoice and progress payment is paid or submitted.
- On the other chips with no rows: **No invoices yet**. Add an invoice or an offer to start tracking payments.
- When filters hide every row: **No invoices match.** with a **Clear filters** button.

#### Old Links

Links from before this list was redesigned still work. `?status=quotation` opens the **Offers** chip, and `?openOnly=true` opens the **To pay** chip. The **Still to pay** figure on [Money Overview](budget-overview) and on the Home page links to the **To pay** chip.

### Adding an Invoice or Offer

Open the dialog from any of these places. It opens over the page you are on, so that page stays visible behind it:

- **New menu** -- choose **Invoice** or **Offer**. On a company's page, the company is already filled in.
- **Budget > Invoices** -- select **New invoice**. On the **Offers** chip the button reads **New offer**.
- **Company page** -- on the **Payments** tab, select **New invoice**. The company is already filled in.
- **Task or purchase page** -- in the **Cost lines** section, select **New invoice**. The task or purchase is already filled in.

The dialog title says **New invoice** or **New offer**, depending on what you are adding. To add an offer for a task or purchase, use the New menu and choose **Offer**, then pick the task or purchase under **For task / purchase**.

The fields are:

- **Company** -- Choose an existing company. If it does not exist yet, type its name and choose **New company ‹text›**. The company form opens with the name filled in, and the new company is selected when you save it.
- **Number** -- The company's reference number, such as `INV-001`. Optional.
- **Amount** -- The total, greater than 0. Required.
- **Date** -- The invoice date. Required, and set to today when you open the dialog.
- **Due date** -- Optional. If you enter one, it must be on or after the date.
- **Status** -- Invoices only: **To pay** (the default), **Paid** or **Submitted**. An offer has no status.
- **For task / purchase** -- Optional. Choose a task or purchase to create one cost line for the full amount on it. Leave it empty to save the invoice without a cost line, and split it later from the invoice page.
- **Notes** -- Optional. Notes sit under **More details**.

Select **Save** to create the invoice or offer. The app opens its page. To enter several in a row, tick **Add another after saving**: the dialog stays open for the next one instead of opening the saved record.

#### Starting from a Paperless document

When [Paperless-ngx](/guides/documents/setup) is configured, the dialog has a **Start from a document** field at the top. Search for the scanned PDF by its title and select it. Documents that are already linked to something in Cornerstone are not listed here. Any document can still be linked afterwards from the Documents panel.

With only Paperless-ngx configured, picking a document fills in what it can and nothing else:

- **Date** -- the document's date, but only when the date still shows today's default or is empty.
- **Company** -- only when exactly one company has the same name as the document's correspondent. If there is no match, or more than one, Company stays empty.
- **Notes** -- the document's title, but only when Notes is empty.

Amount and Number are never filled from the document. Type them yourself, and check the other values.

When an LLM provider is also configured, the field shows an extra link, **Read amounts and lines with AI**, once a document is picked. It opens the review screen described in [Creating an Invoice from a Paperless document](#creating-an-invoice-from-a-paperless-document) for that document. The dialog closes and nothing from it is saved.

To remove the document from the dialog, clear the **Start from a document** field.

### Editing an Invoice or Offer

On an invoice or offer page, open the **⋯** menu and select **Edit details**. The form has the same fields as the new-invoice dialog, with Notes always visible. It has no document field, no task or purchase field and no **Add another** option, and an offer has no **Status** field.

An invoice cannot be turned back into an offer from this form. The only way from an offer to an invoice is the **Convert to final invoice** page (see [Converting an Offer to a Final Invoice](#converting-an-offer-to-a-final-invoice)).

### Creating an Invoice from a Paperless document

If you have both [Paperless-ngx](/guides/documents/setup) and [Auto-itemize](auto-itemize) configured, the review screen can build the whole invoice from its PDF. Pick the document in the **New invoice** dialog and select **Read amounts and lines with AI**. Cornerstone reads the invoice straight off the page and opens a multi-step review screen:

**Step 1: Company & Status**

- **Company picker** -- Pick the matching company (the picker pre-suggests one based on the document). If the company doesn't exist, type its name and choose **New company ‹text›**. The company form opens with the name filled in, and the new company is selected when you save it.
- **Invoice status** -- Choose the initial status: Offer, To pay, Paid, or Submitted. Defaults to **To pay**.
- **Funding source (optional)** -- Shows **No default** until you pick one. If set, all extracted lines are assigned to this funding source. You can still override the source for individual lines in step 2. This field is useful when you know the entire invoice comes from a single financing source.

**Step 2: Metadata & Lines**

- **Pre-fills the invoice metadata** (number, amount, date, due date, notes) from the document, each with a one-click suggestion to apply the extracted value.
- **Lists the extracted lines in the same grid as [Split with AI](auto-itemize)**, so you can include, edit, categorise, fund, and assign each line to a task or purchase. Net lines are grossed up by VAT so the totals match the invoice. If you specified a funding source in step 1, each line uses that source by default but can be overridden.

Click **Create Invoice & Itemize** to create the invoice and its cost lines in one step. The new-invoice review screen and the existing-invoice [Split with AI](auto-itemize) page share the same grid, so line editing, assignment, and funding-source behaviour is identical in both. See [Assign each line](auto-itemize#6-assign-each-line-and-set-its-category-and-funding-source) for the details.

The extraction also benefits from the [human-authored metadata you keep in Paperless](auto-itemize#what-data-leaves-your-server) -- title, correspondent, document type, tags, and date -- so the suggested company and dates tend to land closer to correct.

Without Paperless-ngx, the **Start from a document** field and the review screen do not appear, and you enter the invoice by hand.


### Invoice Statuses

Invoices have three statuses. An offer is a separate kind of record and has no status:

| Status | Meaning |
|--------|---------|
| **To pay** | Invoice received but not yet paid |
| **Paid** | Invoice has been paid to the company |
| **Submitted** | Paid or due, and included in a draw-down request to the bank (a claim for reimbursement from the financing source) |

:::tip
Add company offers with **New offer** (on the **Offers** chip) or from the New menu, so they sit alongside actual invoices. Cost lines linked to an offer count at their face value on the task and purchase pages and on **Money > Overview**. The offer's amount is not shown as a range.
:::

### Converting an Offer to a Final Invoice

When the company sends the final invoice for an offer, convert the offer on the **Convert to final invoice** page. The offer keeps its record, its ID and its URL, so it becomes the final invoice in place. Nothing is saved until you select **Convert to final invoice** on the page.

This is the only way to turn an offer into an invoice. The edit form cannot do it (see [Editing an Invoice or Offer](#editing-an-invoice-or-offer)).

To open the page, open the offer and select **Convert to final invoice** in its header. You can also select **Convert** on the offer's row in **Needs attention** on the Home page. The breadcrumb reads Money › Invoices › the company and offer number.

The page has up to four cards, from top to bottom.

**Document** (only when Paperless-ngx is configured)

- **Source document** is a picker for the PDF of the final invoice in Paperless-ngx. Pick a document and it is linked to the final invoice. Pick another one to replace it, or clear the picker to remove it.
- **Read amounts** (needs an LLM provider as well) reads the selected document and suggests values for the final amount, invoice date, invoice number, due date and notes.
- Read amounts fills only empty fields. A field you have typed in, or one that already holds saved data from the offer, such as the notes or the invoice number, is not overwritten. It shows a suggestion you can apply instead.
- If the document total differs from the offer total, the page says so.

**Final invoice details**

- **Final amount** and **Invoice date** are required. **Invoice number**, **Due date** and **Notes** are optional. A note with the offer amount is added to the notes automatically.
- Next to the final amount, a badge shows how far it is from the offer: more, less, or the same, as an amount and a percentage.
- A due date before the invoice date is rejected.
- **Status after converting** sets the invoice to **To pay** or **Paid**.

**Cost lines**

The table lists the offer's cost lines, grouped by task or purchase. Lines with no task or purchase are grouped as **Not assigned**. Each row shows three amounts:

- **Offered** -- the amount on the offer.
- **Proposed** -- the amount the final invoice will use. It starts as the offered amount scaled pro rata to the final amount. Type a new amount to change a line.
- **Keep** -- tick to keep the line at its offered amount. A kept line does not change when you change the final amount.

Above the table, **Keep all offered amounts** keeps every line at its offered amount. Clearing it returns every line to the proposal. **Reset to proposal** discards the amounts you typed and returns every line to the proposal.

Below the table, a note compares the lines with the final amount:

- **Nothing left to split** -- the proposed lines add up to the final amount.
- An amount **not yet split** -- the lines add up to less than the final amount. You can still convert.
- An amount **more than the final amount** -- the lines add up to more. Conversion is blocked until you lower them.

**Progress payments** (only when the offer already has progress payments)

- The summary shows the **Progress payments** made so far, the **Final amount**, and the **Final payment** that remains after them.
- If the progress payments add up to more than the final amount, a **Refund due** box shows the difference. It is advice only. It does not block conversion.
- **Add refund** opens the refund form with the difference as the amount, today as the due date and a funding source you can change. Saving the refund records it at once. It does not wait for **Convert to final invoice**. Once it is recorded, the page confirms it.

**Convert to final invoice**

Select **Convert to final invoice** at the bottom of the page to save. The button stays unavailable while something needs fixing, such as a missing final amount or date, a proposed amount of zero or less, or cost lines that add up to more than the final amount. The page lists these problems above the button.

When the conversion succeeds, the page returns to the invoice's detail page with a confirmation. The record keeps its ID and URL, and it moves from the **Offers** chip to the **To pay** or **Paid** chip of the same list. **Cancel** returns without saving. If you have changed anything, it asks you to confirm before discarding.

If you open the Convert page for an invoice that is already final, the page says that it is not an offer and links to the invoice.

:::info Screenshot needed
A screenshot of the Convert to final invoice page is still to come.
:::

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
