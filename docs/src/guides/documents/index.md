---
sidebar_position: 6
title: Documents
---

# Documents

Cornerstone integrates with [Paperless-ngx](https://docs.paperless-ngx.com/) to bring your construction documents -- invoices, contracts, permits, plans -- into the same place you manage your project. No documents are stored in Cornerstone itself; it references documents in your existing Paperless-ngx instance and displays them inline.

## Overview

The document integration provides:

- **Document Browser** -- A dedicated page to search, filter, and browse all documents in your Paperless-ngx instance
- **Document Linking** -- Attach Paperless-ngx documents to work items and vendor invoices so related documents are always one click away
- **Thumbnail Previews** -- Document thumbnails are displayed inline so you can identify documents at a glance
- **Detail Panel** -- View document metadata (title, created date, correspondent, document type, tags, content preview) without leaving Cornerstone
- **Tag Filtering** -- Filter documents by Paperless-ngx tags in the document browser
- **Graceful Degradation** -- If Paperless-ngx is not configured or unreachable, Cornerstone shows clear status messages instead of errors

## How It Works

All communication with Paperless-ngx is proxied through the Cornerstone backend. Your Paperless-ngx API token never leaves the server -- the browser only talks to Cornerstone, which forwards requests to Paperless-ngx on your behalf. This keeps your credentials secure and simplifies network configuration.

```
Browser  -->  Cornerstone Server  -->  Paperless-ngx
               (proxy layer)            (document store)
```

:::info Screenshot needed
A screenshot of the Documents page showing the document browser will be added on the next stable release.
:::

## Prerequisites

You need a running [Paperless-ngx](https://docs.paperless-ngx.com/) instance with API access enabled. Cornerstone has been tested with Paperless-ngx v2.x.

## Next Steps

- [Setup](setup) -- Configure the Paperless-ngx connection
- [Browsing Documents](browsing-documents) -- Use the document browser to search and filter
- [Linking Documents](linking-documents) -- Attach documents to work items and invoices
