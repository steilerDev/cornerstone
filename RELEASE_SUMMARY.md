## What's New

Cornerstone now integrates with Paperless-ngx for document management. Browse your entire document archive from within Cornerstone, and link invoices, contracts, permits, and receipts directly to work items and vendor invoices -- keeping all project-related documents one click away.

### Highlights

- **Document Browser** -- A dedicated page to search, filter by tags, and browse all documents in your Paperless-ngx instance, with thumbnail previews, pagination, and a detail panel showing document metadata and content excerpts
- **Document Linking** -- Attach Paperless-ngx documents to work items and vendor invoices with a picker modal, view linked documents as thumbnail cards, and open them directly in Paperless-ngx
- **Secure Proxy Architecture** -- All Paperless-ngx communication is proxied through the Cornerstone backend, keeping your API token server-side and simplifying network configuration
- **Graceful Degradation** -- Clear status messages when Paperless-ngx is not configured or unreachable, with retry functionality and preserved link records even when the connection is temporarily unavailable
- **Responsive & Accessible** -- Full keyboard navigation, ARIA roles, focus management, screen reader announcements, and a responsive layout that works on desktop, tablet, and mobile

### Configuration

To enable the integration, set two environment variables and restart Cornerstone:

```
PAPERLESS_URL=https://paperless.example.com
PAPERLESS_API_TOKEN=your-api-token-here
```
