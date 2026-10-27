---
sidebar_position: 9
title: Bank Reports
---

# Bank Reports

Most construction loans and grant programs require you to prove how money was spent -- a draw-down request to your bank, a proof-of-funds statement, or a budget overview for your own records. The **bank report** wizard turns your invoices and budget lines into a formatted PDF you can hand to a lender, submit for a grant claim, or file away, without you having to assemble it by hand.

## Terms

| Term | Meaning |
|------|---------|
| **Draw-down request** | A request to the lender to pay out money against invoices that are pending or paid and not yet submitted to the bank. Formerly called "Claim" |
| **Submitted** | An invoice or progress payment that has been sent to the bank in a bank report. Recording a submission moves it out of the Draw-down request list |
| **To pay** | An invoice that is not paid yet, including progress payments still to pay |
| **Paid** | An invoice that has been paid in full |
| **Funding source** | The loan, credit line, or other source the report is for. See [Financing](financing-sources) |
| **Progress payment** | A partial payment made against an offer or invoice before the final payment |

## Where to Start

The wizard has no sidebar entry. Open it from one of these places:

| Entry point | Report type | Funding source | Lands on |
|---|---|---|---|
| **Money > Financing**, **Prepare bank report** in the page header | Draw-down request | None | Step 3 when exactly one bank loan or credit line is not closed, otherwise step 2 |
| **Money > Financing**, a bank loan or credit line card, **⋯** menu, **Prepare bank report** | Draw-down request | That card's source | Step 3 |
| A bank loan or credit line's funding source page, **Prepare bank report** in the header | Draw-down request | That source | Step 3 |
| **Home**, **Needs attention**, the item for a loan or credit line's invoices | Draw-down request | That source | Step 3 |
| **Money > Overview**, **⋯** menu, **Budget overview for the bank** | Budget overview | None | Step 3 when exactly one bank loan or credit line is not closed, otherwise step 2 |

If a link names a funding source that no longer exists, the wizard opens on step 2 with the message "That funding source no longer exists. Choose one." Pick a source to continue.

If you open the wizard without a link, it starts on step 1.

## When to Use It

The wizard supports three report types, chosen in step 1. The order below is the order in the wizard.

| Report Type | Purpose | Invoices Included |
|---|---|---|
| **Draw-down request** | Document invoices that are not yet submitted to the bank, for a request to your bank or a grant program | Pending or paid invoices, and their progress payments, that have not been submitted |
| **Budget overview** | A summary of all invoices and their allocations for a source, for your own records | Offers, pending, paid, and submitted invoices of the selected source |
| **Proof of funds** | Show only submitted invoices, as evidence that the funds were actually spent | Submitted invoices only |

Each report is generated for a single **funding source** at a time (a specific loan, credit line, or savings account) -- see [Financing](financing-sources).

## The Five Steps

The wizard walks through five steps, shown in a stepper at the top of the page. You can jump back to any step you have already reached.

When you arrive from a link that already names a report type and funding source, steps 1 and 2 show as completed and the wizard opens on step 3. You can select step 1 or step 2 to change either choice.

### 1. Report type

Choose Draw-down request, Budget overview, or Proof of funds. This determines which invoices are eligible in step 3 and which document types qualify to be attached in step 4.

Changing the type after you have selected invoices clears the selection.

### 2. Funding source

Select the funding source the report is for, using the **Select the funding source for this report** field. Each source shows the amount that matches the chosen report type.

### 3. Select invoices

Every eligible invoice for the source and report type is listed, pre-selected. Invoices are grouped by company, in alphabetical order, with **No company** last. Within a group, invoices are ordered by invoice date, oldest first.

Each group has its own checkbox, its count, and a subtotal. Selecting the group checkbox selects or clears every invoice in that group, including the ones not yet shown on screen.

The list shows 25 invoices at a time. Select **Show more invoices** to load the next batch, and the footer shows how many you have seen so far.

Selection covers the whole report, not only the invoices on screen. The select-all checkbox shows the total number of invoices, for example **Select all invoices (61)**, and the summary above the list reads **n of m selected**, with the total amount of the selected invoices.

From the list you can:

- Deselect individual invoices, or use **Select all** / **Reset selection**
- Expand an invoice to see its individual budget lines and deposits or refunds, and exclude specific line items from the report without excluding the whole invoice
- See a **partial** badge on invoices whose funding is split across more than one funding source -- both invoices split across budget lines and invoices with a source-tagged deposit are flagged, and the PDF's footnotes distinguish which kind of split applies to each row
- See invoices that are not split to this funding source, grouped separately under **Not split to this source (n)** below the company groups

Excluding a line item narrows the amount shown in the report but does not change the invoice's status -- see [After you send it](#after-you-send-it) below.

### 4. Settings

- **Report language** -- choose the language the exported PDF is written in, independent of your own UI language. This only affects the report content (table captions, cover letter, footnotes); the wizard's own controls stay in your UI language.
- **Attach invoice PDFs** -- append each selected invoice's source document as a PDF appendix. Which document types qualify depends on the report type (quotations qualify for a Budget overview, but not for a Draw-down request or Proof of funds report -- so a document that would undercut the report's evidentiary value is never silently attached).
- **Max file size (optional)** -- set a maximum file size in MB. If the final report exceeds this size, it will be automatically split into multiple PDF files, each with its own continuation cover letter. The first file notes that the report spans multiple attachments; continuation files reference the report without repeating the full table. If unset, the report is generated as a single file regardless of size.
- **Include cover letter** -- adds a formal letter ahead of the report table, addressed using the source's contact details. Disabled if the source has no contact address or reference number configured.

### 5. Preview and export

Step 5 has two parts: **Get the report**, which produces the PDF, and **After you send it**, which records the submission. The second part appears only for Draw-down request reports.

#### Get the report

The step shows an editable HTML preview of the report -- this is what generates the PDF, so what you see here is what you get.

- **Cover letter fields** -- sender, recipient, reference, subject, body, and signature are editable text, each with a maximum length shown as you type. The date, opening salutation, and closing are generated in the report language and shown read-only. For Draw-down request reports, the default subject is "Draw-down request" and the default body asks for a draw-down for the total of the selected invoices. Editing a field marks it as edited; use the reset button next to a field to discard your edit and fall back to the generated text.
- **Sender** -- the sender is taken from **Project setup › House**. The helper under the field links there. The link opens in a new tab, so your edits in the wizard are kept. Changes to the sender apply to this report only; to change the default sender, edit **Project setup › House**.
- **Show/hide columns** -- toggle which table columns appear in the exported PDF (Vendor, Invoice No., Date, Status, Invoice Amount, Allocated Amount, Usage). The Allocated Amount column is always required and cannot be hidden. If you hide the Usage column while **Attach invoice PDFs** is enabled, a warning explains that readers lose the text linking each row to its attached document.
- **Draft with AI** -- if your instance has an LLM provider configured (see [Auto-itemize Invoices](auto-itemize)), a button generates usage descriptions and a full cover letter draft in one batched call, in the report language you selected. Regenerating -- or changing report type, source, or invoice selection while a generation is in progress -- asks for confirmation before discarding your edits or cancelling the in-flight request.
- **Preview PDF** opens the exact rendered PDF in a modal before you commit to downloading it.

From here you can:

- **Download PDF(s)** -- saves the report to your device
- **Upload to Paperless** -- if [Paperless-ngx integration](../documents/setup) is configured, uploads the generated PDF(s) directly into your document library

#### Multi-file reports

If you set a max file size in step 4 and the report exceeds it, the report is automatically split across multiple PDF files. The first file's cover letter notes "This report is sent in multiple attachments." Continuation files each have their own cover letter (with reference, date, closing, and signature fields) but no repeated totals or table headers -- they continue directly from where the previous file left off.

When downloading or uploading multi-file reports, all files are handled together:

- **Download PDF** -- if split, all files are packaged and downloaded (browser-dependent; most modern browsers can handle multi-file downloads)
- **Upload to Paperless** -- all files are uploaded sequentially with automatic retry on failure; progress is shown for each file

#### After you send it

This part appears for Draw-down request reports only. Use it after the bank has the report.

Select **Mark N invoices as submitted**, where N is the number of invoices in the report. A confirmation shows the number of invoices, their total, and the source. Select **Mark as submitted** to confirm. The invoices move from To pay or Paid to **Submitted**, so they leave the Draw-down request list and appear in Proof of funds reports instead. Any progress payments included in the report are submitted with their invoices.

If any selected invoice has excluded line items, it keeps its current status, so the excluded part stays available for a later Draw-down request. The confirmation says so.

Select **Finish without marking** if you are not ready to record the submission -- for example, if you generated the PDF only to check the totals. Nothing changes in that case.

When the submission is recorded, a success message shows how many invoices and progress payments were marked, with two links: **View invoices**, and **Open History**, which opens the funding source's History tab.

:::caution
Recording a submission is done from the wizard and is not undone there. To take it back, use [Reverting a submission](#reverting-a-submission) below.
:::

If no invoice is selected, **Mark as submitted** is unavailable, and the button explains that you need to select at least one invoice in step 3.

## Reverting a submission

You can undo a submission that was recorded by mistake. Open the funding source's **History** tab, or the **History** page, and find the submission row. Each submission appears as one row with the **Submission** badge, for example "12 invoices submitted", and a **Revert submission** button.

Select **Revert submission** to see what will happen. The dialog lists how many invoices go back to To pay, how many go back to Paid, and how many progress payments go back to pending. Each invoice returns to the status it had before the submission. Select **Revert submission** to confirm, or **Keep submission** to leave it as it is.

The original submission row stays in History and shows a **Reverted** badge. The revert itself is added as its own row.

A submission cannot be reverted in these cases, and the dialog shows the reason:

- **Some invoices changed since the submission.** If an invoice in the submission has changed status since it was submitted, the revert is refused and nothing is changed. The dialog names the problem.
- **The submission was already reverted.** A submission can be reverted only once.

## Long Descriptions and Multi-Page Tables

Usage text and other free-form fields can run long, especially with German construction terminology. The report table wraps and paginates automatically to keep every character intact rather than truncating or dropping content; where a row's text must continue onto a following page, the continuation is marked so it doesn't read as a truncated or broken row. Split and deposit-reduced amounts each get their own footnote so it's clear at a glance *why* a row's allocated amount differs from its invoice amount.
