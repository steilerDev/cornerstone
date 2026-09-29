---
name: issue-2101-paperless-infinite-scroll
description: Paperless document picker infinite scroll E2E (#2101) - page-aware mock fixture, POM footer/scroll helpers, scroller quirks, diary regression review
metadata:
  type: project
---

- `e2e/fixtures/paperlessPaginatedMock.ts` (`mockPaginatedPaperless`) is the page-aware Paperless mock (status, tags, correspondents, linked-ids, thumbs, exact-pathname documents route). Returns `requestedPages` and `titleFor(id)`. Register AFTER any broader `**/api/paperless/documents**` mock (latest route wins).
- `PaperlessPickerModal` constructor takes an optional dialog name (`'Add Document'` for LinkedDocumentsSection, default = invoice picker); has `documentItems`, footer locators (testIdPrefix `paperless-documents`) and `scrollToBottom()` (walks to the grid's scrollable ancestor, falls back to window scroll).
- Scrollers are NOT Modal `.content`: `.pickerBody` (LinkedDocumentsSection custom modal) and `.modalBody` (invoice picker). IO root = nearest overflow ancestor.
- Known inherent race: asserting `requestedPages === [1]` after first load assumes the sentinel starts outside the 600px lookahead; 25 cards make this safe in practice.
- Diary regression review: every diary mock has totalPages <= 2, so the re-observe-after-batch change cannot add batches; no assertion needed weakening. Stub-IO tsc error (`implements IntersectionObserver`) is a pre-existing pattern, not a regression.
- Existing Paperless specs asserted no pager; no updates were needed.
- Not run live (browser binary blocked in sandbox); validated via eslint, prettier, `playwright --list`.
