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

:::note
Each document can only be linked once to the same entity. If you try to link a document that is already attached, Cornerstone will show a message that the document is already linked.
:::

## Viewing a Linked Document

Linked documents are displayed as compact cards showing the thumbnail, title, and date. You can interact with them in two ways:

- **View details** -- Click the document card to expand an inline detail panel with full metadata, content preview, and a link to open the document in Paperless-ngx
- **Open in Paperless-ngx** -- Click the external link icon on the card to go directly to the document in your Paperless-ngx instance (opens in a new tab)

## Unlinking a Document

1. Find the linked document card in the Documents section
2. Click the **Unlink** button on the card
3. A confirmation dialog appears -- click **Unlink** to confirm or **Cancel** to keep the link

:::caution
Unlinking removes the association between the Cornerstone entity and the Paperless-ngx document. The document itself is not deleted from Paperless-ngx -- it remains in your document store.
:::

## Without Paperless-ngx

If Paperless-ngx is not configured, the Documents section on work item and invoice detail pages shows an informational message explaining how to enable the integration. The **+ Add Document** button is disabled.

If Paperless-ngx was previously configured and documents were linked, but the connection is later removed or becomes unreachable, the linked document records are preserved. The cards will show the Paperless-ngx document ID but will not be able to display thumbnails or metadata until the connection is restored.
