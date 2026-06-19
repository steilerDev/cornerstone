# v2.11.0 Release Summary

## What's New

This release sharpens invoice itemization. When you scan an invoice into Paperless-ngx, Cornerstone now hands the language model everything you have already told Paperless about the document -- its title, who it is from, the document type, tags, and date -- so the extracted line items, vendor, and dates come back more accurate. Building a budget line while reviewing a brand-new invoice is also smoother, matching the flow you already know from the Auto-itemize page. No manual migration steps are required.

### Highlights

- **Smarter invoice reading** -- Auto-itemize no longer relies on the raw OCR text alone. It now also sends the human-authored details you maintain in Paperless-ngx -- document title, correspondent, document type, tags, creation date, and original filename -- and tells the model to trust those over anything it has to guess from the scanned text. The result is fewer wrong dates, cleaner vendor matches, and more reliable line items, especially on messy scans.

- **Create a budget line without leaving the review** -- On the Paperless invoice review screen, creating a new work-item budget line now works just like the Auto-itemize page: clicking **Create Budget Line** drops an inline draft onto the row with a "Creating New" badge and a **Discard** button, and closes the picker straight away. The line is created when you save the invoice, so you can keep reviewing without interruptions.

- **A tidier review screen** -- Confidence is now applied automatically from the Paperless document type (Invoice or Quotation) and hidden once set, the category and funding-source pickers step out of the way while you are filling in a new line, and the VAT toggle is hidden for work-item assignments where the value already comes from the extracted line.

### Behind the Scenes

- The document-links view is much faster for invoices with many linked documents -- Paperless tags are now fetched once instead of once per document, removing a multi-second wait when opening busy entities.

## Upgrade

```bash
docker pull steilerdev/cornerstone:latest
```

Restart your container. Schema migrations run automatically on first boot.
