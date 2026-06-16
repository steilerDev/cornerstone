---
sidebar_position: 3
title: Linking Documents
---

# Linking Documents

You can link Paperless-ngx documents to **work items**, **household items**, and **vendor invoices** so that related documents -- contracts, receipts, permits, plans, warranties -- are always accessible from the entity they belong to.

## Where Documents Appear

A **Documents** section appears on:

- **Work item detail pages** -- Link contracts, permits, receipts, and plans to the work item they relate to
- **Household item detail pages** -- Link product specs, receipts, warranties, and delivery confirmations to household items
- **Invoice detail pages** -- Link invoice PDFs and supporting documents to vendor invoices

Each section shows the number of linked documents as a badge next to the heading.

:::note
Screenshots for the documents feature require a connected Paperless-ngx instance and will be added in a future release.
:::

## Linking a Document

1. Open a work item or invoice detail page
2. Scroll down to the **Documents** section
3. Click **+ Add Document** -- this opens a document picker modal
4. Search or browse for the document you want to link
5. Click a document card to link it

The document is immediately linked and appears in the Documents section. A screen reader announcement confirms the link was created.

The picker shows **all documents** by default. If your document store is large and you only want to see documents that are not yet linked anywhere in Cornerstone, tick the **Hide already-linked documents** checkbox at the top of the picker. The filter is **system-wide**: it hides any document that is already linked to *any* work item, household item, or invoice in Cornerstone -- not just the entity you are currently working on -- so you can quickly find documents that have not been filed anywhere yet. The toggle stays unchecked unless you turn it on, so you never have to clear it just to find a document you intend to re-link, and the count of hidden documents is shown while the filter is active.

:::note
Each document can only be linked once to the same entity. If you try to link a document that is already attached, Cornerstone will show a message that the document is already linked.
:::

## Viewing a Linked Document

Linked documents are displayed as compact cards showing the thumbnail, title, and date. You can interact with them in two ways:

- **View details** -- Click the document card to expand an inline detail panel with full metadata, content preview, and a link to open the document in Paperless-ngx
- **Open in Paperless-ngx** -- Click the external link icon on the card to go directly to the document in your Paperless-ngx instance (opens in a new tab)

## Unlinking a Document

1. Find the linked document card in the Documents section
2. Click the **✕** button in the **top-right corner** of the card (it appears on hover, focus, or touch; its tooltip reads *Remove document link*)
3. A confirmation dialog appears -- click **Unlink** to confirm or **Cancel** to keep the link

The unlink control lives as an overlay in the corner of each document card so it is easy to find without crowding the card's other actions.

:::caution
Unlinking removes the association between the Cornerstone entity and the Paperless-ngx document. The document itself is not deleted from Paperless-ngx -- it remains in your document store.
:::

## Without Paperless-ngx

If Paperless-ngx is not configured, the Documents section on work item and invoice detail pages shows an informational message explaining how to enable the integration. The **+ Add Document** button is disabled.

If Paperless-ngx was previously configured and documents were linked, but the connection is later removed or becomes unreachable, the linked document records are preserved. The cards will show the Paperless-ngx document ID but will not be able to display thumbnails or metadata until the connection is restored.
