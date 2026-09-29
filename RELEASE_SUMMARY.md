# Release Summary

## What's New

The Paperless-ngx document browser now uses **infinite scroll** instead of page navigation, making it easier to browse and link large document collections. The load-more experience is accessible and responsive, with automatic batch loading when filters hide documents.

### Highlights

- **Infinite scroll for Paperless documents** -- Scroll to load more documents instead of clicking Previous/Next, providing a smoother browsing experience
- **Automatic batch loading** -- When "Hide already-linked documents" hides an entire batch, new batches load automatically so you can always find documents
- **Accessible load-more** -- Load-more button with focus handoff to newly loaded items and live-region announcements for screen readers
- **Better document ordering** -- An `id` tiebreaker eliminates duplicate or skipped documents when batching

## Upgrade

```bash
docker pull steilerdev/cornerstone:latest
```

Restart your container. No schema migrations needed for this release.
