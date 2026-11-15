---
sidebar_position: 2
title: Browsing Documents
---

# Browsing Documents

The **Documents** page lists every document in your Paperless-ngx instance. From there you can search and filter the list, read a document's details, see which tasks and purchases it is linked to, and link or unlink it.

The page is only available when Paperless-ngx is connected (see [Setup](setup)). Without a connection, **Documents** does not appear in the navigation and the page address redirects to Home.

## Opening the Page

- **Sidebar** -- **Documents** is in the secondary group, below **History**.
- **Phone** -- **Documents** is the third entry of the **More** sheet, below **Areas** and **History**.
- **Object panels** -- Click **Browse all** at the bottom of a task's, purchase's, invoice's, funding source's, or grant's **Documents** panel. It opens this page with no filters applied.
- **Command search** -- A document found through command search opens this page with its details panel already open.

The page has no add button. Documents are created in Paperless-ngx, and Cornerstone only shows and links them.

:::info Screenshot needed
Add a screenshot of the Documents page with the list and the details panel open, in light and dark themes.
:::

## Searching and Filtering

Type in the **Search documents** box to search your Paperless-ngx documents. Results update as you type.

Click **Filters** to open the filter panel. The button shows how many filters are active, for example "Filters, 2 active". Filters are:

- **Type** -- Choose one document type, such as *Invoice* or *Contract*, or leave it at **Any type**. The choices are all document types from Paperless-ngx, not only the ones on the current page.
- **Tags** -- Tick one or more tags. A document must have all ticked tags to appear.
- **Linked** -- Tick **Hide already linked** to hide every document that is linked to any task, purchase, invoice, funding source, or grant in Cornerstone. This is a system-wide check, not just the records you are looking at.

Click **Clear filters** to reset all filters.

:::note
If your administrator has set `PAPERLESS_FILTER_TAG`, the page shows the note *Showing only documents tagged* followed by that tag name. Documents without the tag are not visible to Cornerstone.
:::

## The Document List

On a desktop or tablet, the list is a table. The default columns are:

| Column | Shows |
|--------|-------|
| **Title** | The document title. Click it to open the details panel. |
| **Type** | The Paperless-ngx document type, if set. |
| **Tags** | Up to three tags, then a count such as "+2". |
| **Document date** | The date on the document. |
| **Linked** | A **Linked** badge when the document is linked to at least one record. |

Use **Columns…** to show **Added**, **Last modified**, or **Archive no.** as well. Click a column heading to sort by it.

On a phone, each document is a card showing the title, the type and document date, the tags, and the **Linked** badge. The whole card opens the details panel.

### Sort Options

Use the **Sort** control to choose the order:

- **Date added** (default, newest first)
- **Document date**
- **Last modified**
- **Title**
- **Archive number**

Documents load in batches of 100 as you scroll. If the next batch does not load, select **Load more** at the bottom of the list. The footer shows "Showing N of M" and, once every document has loaded, "All rows shown." The count `M` already leaves out documents hidden by **Hide already linked**.

## The Details Panel

Click a document's title to open its details. On a wide screen the panel docks beside the list. On a medium screen it slides in from the side, and on a phone it fills the screen from the bottom. Close it with the close control, or use the browser's Back button, which also closes it. The list stays where you left it.

The panel shows:

- **Thumbnail** -- A preview image of the document.
- **Facts** -- Document date, correspondent, type, archive number, page count, date added, and last modified. Empty fields are left out.
- **Tags** -- All tags on the document.
- **Content preview** -- The first 300 characters of the text Paperless-ngx extracted from the document.
- **Open in Paperless** -- Opens the document in Paperless-ngx in a new tab.

### Linked To

Below the details, **Linked to** lists every record this document is linked to. Each row shows the kind of record and its title:

- **Task**, **Purchase**, **Invoice**, **Funding source**, or **Grant**

Click a title to open that record. If the record has been deleted, the row shows *Record no longer exists*. You can still unlink such a row.

If the document is not linked to anything, the list says *Not linked to anything yet.*

**Unlink**
: Click **Unlink** on a row. The link is removed straight away, without a confirmation, and a notice reads *Unlinked from* followed by the record's title. Click **Undo** while the notice is visible to restore the link. The document itself stays in Paperless-ngx.

**Link to…**
: Click **Link to…** to search for a task or purchase. Tasks and purchases that this document is already linked to are not offered. Choose a record to link it. A notice reads *Linked to* followed by the record's title, with an **Undo** button. If Cornerstone refuses the link, the reason is shown under the search field and the picker stays open.

:::info
**Link to…** on this page only offers tasks and purchases. Link invoices, funding sources, and grants from their own **Documents** panels, as described in [Linking Documents](linking-documents).
:::

The Linked badges in the list and the **Linked to** list update after each change, and the panel stays open.

## When Things Go Wrong

- **Paperless-ngx is unreachable** -- The page shows *Paperless-ngx Unreachable* with a **Try Again** button and a link to the Paperless settings. Check that Paperless-ngx is running and reachable from the Cornerstone server.
- **The list fails to load** -- The page shows *Documents could not be loaded.* with a **Retry** button.
- **No documents** -- *No documents in Paperless yet.* appears when the Paperless-ngx instance has no documents visible to the API token.
- **No matches** -- *No documents match.* appears when your search or filters exclude everything. Click **Clear filters** to see the full list again.
- **The document is not available** -- If a document is no longer in Paperless-ngx, or is hidden by `PAPERLESS_FILTER_TAG`, the panel does not open and the page shows *That document is not available.*
- **Details could not be loaded** -- The panel shows *This document could not be loaded.* with a **Try Again** button.

## Keyboard Navigation

- **Tab** moves between the search box, **Filters**, **Sort**, the document titles, the **Linked to** actions, and the panel controls.
- **Enter** on a title opens the details panel.
- Focus moves to the panel heading when it opens, and returns to the document's title when the panel closes.
