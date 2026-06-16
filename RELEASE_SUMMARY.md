# v2.8.0 Release Summary

## What's New

This release makes capturing the real-world record of your build faster and more mobile-friendly. You can now create an entire invoice straight from a scanned Paperless document, snap and tag photos one-handed from your phone, and log who worked on site and for how long -- all without leaving the screen you are on. No manual migration steps are required.

### Highlights

- **Create invoices from a Paperless document** -- When Paperless-ngx and Auto-itemize are both configured, **New Invoice** opens a document picker. Pick the PDF the vendor sent you and Cornerstone reads the invoice for you: it pre-fills the invoice number, amount, date, due date, and notes, suggests the matching vendor, and extracts the line items -- grossing up net lines by VAT so the totals match. Review, assign each line to a work item or household item, and click **Create Invoice & Itemize** to create the invoice and all its budget lines in one step. The new-invoice review screen now shares the exact same interface as the existing Auto-itemize page.

- **Mobile-first photo capture** -- Capturing site photos is built for the phone. Snap a photo with your camera, and a photo-details modal lets you add a caption, the area it was taken in, and the compass orientation it faces before it uploads. A new **Orientations** tab on the Manage page lets you maintain your own list of directions (e.g. "South – Street-facing") to tag photos with. The photo annotator now scales to fit any screen and is fully touch- and stylus-enabled, so you can mark up a photo on a tablet as easily as on a desktop.

- **Diary daily-log vendor and work hours** -- Daily Log entries gained optional **Vendor**, **Work start**, and **Work end** fields, with the total work duration computed automatically. The entry's information panel shows who worked and for how long at a glance, turning a daily log into a simple labour record.

- **Discoverable document unlink** -- The action to unlink a document from a work item, household item, or invoice now lives as a clear **✕** overlay in the top-right corner of each linked-document card, so it is easy to find without cluttering the card.

### Notable Fixes

- Search-as-you-type pickers now position their dropdown correctly and stay anchored while scrolling on mobile.
- Mobile browsers no longer zoom in when you focus a text field or pinch, keeping forms steady on small screens.
- Hardened the construction-diary daily-log experience and the mobile diary filter panel.

## Upgrade

```bash
docker pull steilerdev/cornerstone:latest
```

Restart your container. Schema migrations run automatically on first boot. Creating invoices from Paperless documents reuses your existing [Auto-itemize](https://steilerDev.github.io/cornerstone/guides/budget/auto-itemize) configuration -- if you have already set the `LLM_*` and `PAPERLESS_*` environment variables, the document-first flow appears automatically.

<!-- CI retrigger: promotion #1700 (post-docs auto-fix skip-ci) -->
<!-- retrigger sync be8350 -->
<!-- promotion CI nudge (synchronize) -->
