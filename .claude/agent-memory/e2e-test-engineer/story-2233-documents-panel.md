---
name: story-2233-documents-panel
description: #2233 Documents panel E2E (replaces LinkedDocumentsSection): DocumentsPanel POM, host test ids, real-server Unlink/Undo recipe, slide-in box trap, Escape-in-menu defect.
metadata:
  type: project
---

**Panel facts** (verified live): five hosts, trigger test ids `documents-panel-button` (task/purchase/invoice),
`source-docs-<id>`, `program-docs-<id>`; trigger text "Documents (n)", accessible name "Documents (n) for <record>" on rows.
Sheet is `role=dialog` ONLY while open (closed panels are inert, still in DOM) so `DocumentsPanel.dialog`
(`name: /^(Documents \(\d+\)|Link document)$/`) is unique even with one panel per row. Picker view title is
"Link document"; `PaperlessPickerModal(page, 'Link document')` works against it. Unlink has no confirm; Undo toast is
`ToastRegion.undoToastWith('Unlinked <title>.')`.

**Why:** the panel replaced `LinkedDocumentsSection`; old `#documents-section-title`, "+ Add Document", region "Documents",
`document-unlink-*` confirm dialog, `Show/Hide documents for` toggles no longer exist anywhere in `e2e/`.

**How to apply:**

- Real-server Unlink/Undo: `POST /api/document-links` with a synthetic id (7_000_000+) works with Paperless off; mock only
  `/api/paperless/status` (`mockPaperlessConfigured`). Rows then have no metadata -> title "Document #<id>", menu = Unlink only.
- Metadata-rich rows (Open in Paperless href, Details preview) need the mocked `document-links` GET (see `document-linking.spec.ts`).
- `boundingBox()` right after `open()` is mid slide-in (x = viewport width): poll until `x+width == viewport`.
- Per-row hosts: wait for THIS record's links via `settleDocumentsHost(page, entityId, open)` before asserting "no trigger";
  `mockKeptDocumentLinks` answers every row with the same mock links.
- Itemize/Unlink/Open live in the card's ⋯ menu (portal, outside the dialog): use `page.getByRole('menuitem', ...)`;
  `InvoiceDetailPage.openDocuments()/openCardMenu()/clickItemize()`.
- Row Edit no longer disables the Documents button (the old toggle did); no E2E asserts the old disabled state.

**Defect found (live):** Escape with an open card ⋯ menu inside the sheet closes the whole sheet. `OverflowMenu` handlers never call
`markEscapeHandled`, and the focus trap's document listener runs first. Guard test: "Escape in an open ⋯ menu closes only the
menu" in `document-linking.spec.ts` (fails until `OverflowMenu` marks Escape handled).
