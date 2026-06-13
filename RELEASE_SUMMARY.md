# v2.7.0 Release Summary

## What's New

This release turns invoice itemization into a one-click, AI-assisted workflow and makes budget bookkeeping far more forgiving. Cornerstone can now read the line items off a vendor's PDF invoice for you, you can edit and re-home invoice-linked budget lines without deleting them, and a brand-new in-app editor lets you mark up diary photos directly in the browser. No manual migration steps are required.

### Highlights

- **Auto-itemize Invoices (LLM-powered)** -- Open a linked invoice PDF and let Cornerstone extract its line items for you. A dedicated review page shows the original document side-by-side with the extracted lines, each on its own card with editable amounts, a confidence indicator, and inline category, funding-source, and item-assignment pickers. Works with any OpenAI-compatible provider -- Google Gemini, Anthropic, OpenAI, or a self-hosted Ollama model -- auto-detected from the endpoint you configure. The feature is **opt-in and off by default**: nothing leaves your server until you set the LLM environment variables, and even then only the document's OCR text and a few invoice details are sent -- never the PDF itself or your API key.

- **Photo Annotation Editor** -- A Shottr-style markup editor for diary photos, right in the browser. Open any diary photo and annotate it with arrows, rectangles, ellipses, lines, text labels, dimension measurements, freehand strokes, and translucent highlights. It is optimized for touch and Apple Pencil, fully non-destructive (the original is always preserved, with a **View original** toggle and **Reset to original** action), and the annotated copy is saved alongside the original.

- **Inline budget line editing & move** -- Edit invoice-linked budget lines directly from the Work Item and Household Item detail pages -- no need to unlink first. You can now also **move a line to a different work item or household item**, so a line that landed on the wrong item (a common case with auto-itemized lines) can be re-homed instead of deleted and re-created.

- **Document viewer "hide already-linked" toggle** -- The document picker gains a system-wide filter that hides any document already linked anywhere in Cornerstone, making it easy to find documents you have not filed yet.

### Notable Fixes

- Print/export of the Budget Overview now restores your expansion state afterwards and resets dark-mode styling correctly for a clean printout.
- The Budget Overview no longer shows a redundant "Auto-itemized" badge that provided no useful information.
- Diary entry editing no longer triggers spurious native form-validation popups.
- Save buttons on budget forms now meet the 44px minimum touch-target size on mobile.

## Upgrade

```bash
docker pull steilerdev/cornerstone:latest
```

Restart your container. Schema migrations run automatically on first boot. To enable Auto-itemize, set the `LLM_BASE_URL`, `LLM_API_KEY`, and `LLM_MODEL` environment variables -- see the [Auto-itemize guide](https://steilerDev.github.io/cornerstone/guides/budget/auto-itemize) for provider examples.
