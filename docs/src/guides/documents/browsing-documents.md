---
sidebar_position: 2
title: Browsing Documents
---

# Browsing Documents

The **Documents** page provides a searchable, filterable grid of all documents in your Paperless-ngx instance. Access it from the sidebar navigation.

## Document Grid

Documents are displayed as cards in a responsive grid. Each card shows:

- **Thumbnail** -- A preview image of the document
- **Title** -- The document title from Paperless-ngx
- **Date** -- When the document was created
- **Tags** -- Paperless-ngx tags displayed as colored chips

:::info Screenshot needed
A screenshot of the document grid will be added on the next stable release.
:::

## Searching

Type in the search bar at the top of the page to search across document titles and content. The search is debounced -- results update automatically as you type, with a short delay to avoid excessive requests.

To clear a search, delete the search text or click the **Clear Search** button that appears when no results match.

## Filtering by Tags

Below the search bar, a tag strip shows all tags from your Paperless-ngx instance. Click a tag to toggle it as a filter -- only documents with the selected tag(s) will appear. You can select multiple tags to narrow results further.

Each tag chip shows the number of documents assigned to it. Active (selected) tags are visually highlighted.

## Pagination

When your Paperless-ngx instance has more documents than fit on one page, pagination controls appear at the bottom of the grid. Use the **Previous** and **Next** buttons to navigate between pages.

## Document Detail Panel

Click a document card to expand a detail panel below the grid. The detail panel shows:

- **Thumbnail** -- A larger preview image
- **Created date** -- When the document was created in Paperless-ngx
- **Correspondent** -- The associated correspondent (if set)
- **Document type** -- The document type classification (if set)
- **Archive number** -- The archive serial number (if assigned)
- **Page count** -- Number of pages in the document
- **Tags** -- All tags assigned to the document
- **Content preview** -- The first 300 characters of the document's extracted text content
- **View in Paperless-ngx** -- A link that opens the document directly in your Paperless-ngx instance (opens in a new tab)

Click the same card again or click the close button to collapse the detail panel.

## Keyboard Navigation

The document browser is fully keyboard-accessible:

- **Tab** to move between the search input, tag chips, document cards, and pagination controls
- **Enter** or **Space** to toggle a tag filter
- **Enter** to select a document card and open the detail panel
