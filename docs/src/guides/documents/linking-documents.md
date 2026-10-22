---
sidebar_position: 3
title: Linking Documents
---

# Linking Documents

You can link Paperless-ngx documents to **tasks**, **purchases**, **invoices**, **funding sources**, and **grants** so that related documents -- contracts, receipts, permits, plans, warranties -- are always accessible from the record they belong to.

## Where Documents Appear

Each of these pages has a **Documents (n)** button, where *n* is the number of linked documents:

- **Task detail pages** -- Link contracts, permits, receipts, and plans to the task they relate to
- **Purchase detail pages** -- Link product specs, receipts, warranties, and delivery confirmations to the purchase
- **Invoice detail pages** -- Link invoice PDFs and supporting documents to the invoice
- **Funding source rows** -- Link loan contracts and related paperwork to a funding source
- **Grant rows** -- Link application forms, approval letters, and related paperwork to a grant

Click the button to open the **Documents** panel. On a desktop the panel slides in from the side. On a phone it fills the whole screen. The panel lists every linked document and is where you link new ones.

:::info Screenshot needed
Add a screenshot of the **Documents (n)** button on a task detail page and of the open Documents panel.
:::

## Linking a Document

1. Open a task, purchase, invoice, funding source, or grant
2. Click **Documents (n)** to open the panel
3. Click **Link document** at the bottom of the panel
4. Search or browse for the document you want
5. Click a document to link it

The picker is shown inside the panel. The document is linked straight away and appears in the list. A screen reader announcement confirms the link.

On an invoice, the picker also has a **Document type (optional)** dropdown. Choose **Quotation**, **Deposit**, or **Invoice** before you click the document to tag it with that type. Leave it empty to link the document without a type.

To leave the picker without linking anything, press **Escape** or click **‹ Documents** at the top of the picker. Escape returns you to the list of linked documents. It does not close the panel.

The picker shows **all documents** by default. If your document store is large and you only want to see documents that are not yet linked anywhere in Cornerstone, tick the **Hide already-linked documents** checkbox at the top of the picker. The filter is **system-wide**: it hides any document that is already linked to *any* task, purchase, invoice, funding source, or grant in Cornerstone -- not just the record you are working on. The checkbox stays unchecked unless you turn it on, and the number of hidden documents is shown while the filter is active.

:::note
Each document can only be linked once to the same record. If you try to link a document that is already attached, the panel shows a message such as *This document is already linked to this task.*
:::

## Viewing a Linked Document

Each linked document is a card in the panel. The card shows a thumbnail, the title, the date, and the correspondent. Two things are available on every card:

- **Details** -- Opens the document's details below the card: created date, correspondent, document type, archive number, pages, tags, and a content preview. A **View in Paperless-ngx ↗** link at the bottom opens the document in Paperless-ngx.
- **Actions menu** -- The menu button on the card. It holds the actions described below.

From the actions menu you can choose:

- **Open in Paperless** -- Opens the document in your Paperless-ngx instance in a new tab
- **Itemize** -- Only on invoices, and only when [Auto-itemize](/guides/budget/auto-itemize) is configured. Opens the Auto-itemize page for that document
- **Unlink** -- Removes the link (see below)

## Unlinking a Document

1. Open the **Documents (n)** panel on the record
2. Open the actions menu on the document's card
3. Choose **Unlink**

Unlinking happens straight away. There is no confirmation dialog. A notice confirms *Unlinked* with the document's title and offers an **Undo** button. Click **Undo** while the notice is still on screen to put the link back.

:::caution
Unlinking removes the connection between the record and the Paperless-ngx document. The document itself is not deleted from Paperless-ngx -- it remains in your document store.
:::

## Without Paperless-ngx

What you see depends on whether Paperless-ngx is connected and whether any documents are already linked:

- **Not connected and nothing linked** -- There is no **Documents** button on the page. Set up the integration first (see [Paperless-ngx Setup](/guides/documents/setup)).
- **Not connected, but links exist** -- The button still appears, and the panel shows a read-only notice such as *Paperless is not connected. 2 links are kept.* The linked documents are listed, but you cannot link, open, or unlink them until the connection is restored. Nothing is deleted.
- **Connected but unreachable** -- The panel shows *Paperless is unreachable.* with a **Try again** button. Check that Paperless-ngx is running and reachable from the Cornerstone server.

If a connection is removed or becomes unreachable, the linked document records are preserved. Cards show the Paperless-ngx document ID (for example *Document #42*) until the connection returns and the details can be loaded again.
