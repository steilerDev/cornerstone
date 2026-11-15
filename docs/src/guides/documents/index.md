---
sidebar_position: 6
title: Documents
---

# Documents

Cornerstone integrates with [Paperless-ngx](https://docs.paperless-ngx.com/) to bring your construction documents -- invoices, contracts, permits, plans -- into the same place you manage your project. No documents are stored in Cornerstone itself; it references documents in your existing Paperless-ngx instance and displays them inline.

## Overview

The document integration provides:

- **Documents Page** -- A dedicated page to search, filter, and browse all documents in your Paperless-ngx instance, and to see and change the tasks and purchases each one is linked to
- **Document Linking** -- Attach Paperless-ngx documents to tasks, purchases, invoices, funding sources, and grants from their **Documents** panel, so related documents are always one click away
- **Thumbnail Previews** -- Document thumbnails are displayed inline so you can identify documents at a glance
- **Details Panel** -- View document metadata (title, document date, correspondent, document type, tags, content preview) without leaving Cornerstone
- **Filters** -- Narrow the Documents page by type, by tags, or to documents not yet linked to anything
- **Graceful Degradation** -- If Paperless-ngx is not configured, the Documents page and every document control are hidden. If it is unreachable, the Documents page says so and offers a retry

## How It Works

All communication with Paperless-ngx is proxied through the Cornerstone backend. Your Paperless-ngx API token never leaves the server -- the browser only talks to Cornerstone, which forwards requests to Paperless-ngx on your behalf. This keeps your credentials secure and simplifies network configuration.

```
Browser  -->  Cornerstone Server  -->  Paperless-ngx
               (proxy layer)            (document store)
```

:::note
Screenshots for the documents feature require a connected Paperless-ngx instance and will be added in a future release.
:::

## Prerequisites

You need a running [Paperless-ngx](https://docs.paperless-ngx.com/) instance with API access enabled. Cornerstone has been tested with Paperless-ngx v2.x.

## Next Steps

- [Setup](setup) -- Configure the Paperless-ngx connection
- [Browsing Documents](browsing-documents) -- Use the document browser to search and filter
- [Linking Documents](linking-documents) -- Attach documents to tasks, purchases, invoices, funding sources, and grants
