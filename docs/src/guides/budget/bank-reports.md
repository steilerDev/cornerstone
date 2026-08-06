---
sidebar_position: 9
title: Bank Reports
---

# Bank Reports

Most construction loans and subsidy programs require you to prove how money was spent -- a claim submission to your bank, a proof-of-funds statement, or a general budget overview for your own records. The **Report Wizard** (**Budget > Reports**) turns your invoices and budget lines into a formatted PDF you can hand to a lender, submit for a subsidy claim, or file away, without you having to assemble it by hand.

## When to Use It

The wizard supports three report types, chosen in step 1:

| Report Type | Purpose | Invoices Included |
|---|---|---|
| **Budget Overview** | A summary of all invoices and their allocations for a source, for your own records | All invoices for the selected source |
| **Claim** | Document invoices marked as paid or claimed, for submitting a reimbursement claim to a bank or subsidy program | Invoices in `pending` or `paid` status |
| **Proof of Funds** | Show only claimed invoices, as evidence that previously claimed funds were actually spent | Invoices in `claimed` status |

Each report is generated for a single **budget source** at a time (a specific loan, credit line, or savings account) -- see [Financing Sources](financing-sources).

## The Five Steps

The wizard walks through five steps, shown in a stepper at the top of the page. You can jump back to any step you have already reached.

### 1. Report Type

Choose Budget Overview, Claim, or Proof of Funds. This determines which invoices are eligible in step 3 and which document types qualify to be attached in step 4.

### 2. Budget Source

Select the financing source the report is for. Each source shows the relevant amount for the chosen report type (Total Amount, Pending Amount, or Claimed Amount).

### 3. Select Invoices

Every eligible invoice for the source and report type is listed, pre-selected. You can:

- Deselect individual invoices, or use **Select all** / **Reset selection**
- Expand an invoice to see its individual budget lines and deposits/refunds, and exclude specific line items from the report without excluding the whole invoice
- See a **partial** badge on invoices whose funding is split across more than one budget source -- both invoices split across budget lines and invoices with a source-tagged deposit are flagged, and the PDF's footnotes distinguish which kind of split applies to each row
- See invoices with no allocation for this source grouped separately under **Unallocated Invoices**

Excluding a line item narrows the amount shown in the report but does not change the invoice's claim status -- see [Marking Invoices as Claimed](#marking-invoices-as-claimed) below.

### 4. Settings

- **Report language** -- choose the language the exported PDF is written in, independent of your own UI language. This only affects the report content (table captions, cover letter, footnotes); the wizard's own controls stay in your UI language.
- **Attach invoice PDFs** -- append each selected invoice's source document as a PDF appendix. Which document types qualify depends on the report type (quotations qualify for a Budget Overview, but not for a Claim or Proof of Funds report -- so a document that would undercut the report's evidentiary value is never silently attached).
- **Include cover letter** -- adds a formal letter ahead of the report table, addressed using the source's contact details. Disabled if the source has no contact address or reference number configured.

### 5. Preview & Export

The final step shows an editable HTML preview of the report -- this is what generates the PDF, so what you see here is what you get.

- **Cover letter fields** (sender, recipient, reference, subject, body, closing, signature) are all editable text, each with a maximum length shown as you type. Editing a field marks it as edited; use the reset button next to a field to discard your edit and fall back to the generated text.
- **Show/hide columns** -- toggle which table columns appear in the exported PDF (Vendor, Invoice No., Date, Status, Invoice Amount, Allocated Amount, Usage). The Allocated Amount column is always required and cannot be hidden. If you hide the Usage column while **Attach invoice PDFs** is enabled, a warning explains that readers lose the text linking each row to its attached document.
- **Enhance with AI** -- if your instance has an LLM provider configured (see [Auto-itemize Invoices](auto-itemize)), a button generates usage descriptions and a full cover letter draft in one batched call, in the report language you selected. Regenerating -- or changing report type, source, or invoice selection while a generation is in progress -- asks for confirmation before discarding your edits or cancelling the in-flight request.
- **Preview PDF** opens the exact rendered PDF in a modal before you commit to downloading it.

From here you can:

- **Download PDF** -- saves the report to your device
- **Upload to Paperless** -- if [Paperless-ngx integration](../documents/setup) is configured, uploads the generated PDF directly into your document library

## Marking Invoices as Claimed

For **Claim** reports, after exporting you are offered **Mark N invoices as claimed** or **Finish without marking**. Marking as claimed flips the included invoices (and any of their deposits swept into this report) to `claimed` status, so they stop appearing in future Claim reports and become eligible for a Proof of Funds report instead. If any selected invoice has excluded line items, it keeps its current claim status so the excluded portion stays claimable in a later report.

:::caution
Marking invoices as claimed cannot be undone from the wizard. If you are not ready to close out these invoices yet -- for example, you generated the PDF just to double-check totals -- choose **Finish without marking**.
:::

## Long Descriptions and Multi-Page Tables

Usage text and other free-form fields can run long, especially with German construction terminology. The report table wraps and paginates automatically to keep every character intact rather than truncating or dropping content; where a row's text must continue onto a following page, the continuation is marked so it doesn't read as a truncated or broken row. Split and deposit-reduced amounts each get their own footnote so it's clear at a glance *why* a row's allocated amount differs from its invoice amount.
