---
name: first-detail-page-adopter-specs
description: Hazards found speccing the first ObjectHeader/SummaryStrip/ObjectTabs page (#2239 invoice page) — detail endpoints lack list-only money figures, "existing" grouping premises, lazily mounted tabs vs header actions, final rows inflating RelatedList counts, figure guard ignores object literals, closure pre-measure
metadata:
  type: feedback
---

Found while speccing #2239 (P4.7). P5.4–P5.7 adopt the same template; expect the same gaps.

1. **Per-record money figures were list-only.** `InvoiceListRow` carried `paid`/`openAmount`/`remainingOnOffer`/`notYetSplit`; `GET /api/invoices/:id` did not. A strip fact marked `data-figure` must show the money service's figure, so "Layers: C" needed a small backend change (shared helper used by list and detail, plus a consistency assertion). **How to apply:** for every strip fact, name the API field it reads before accepting "client only".
2. **UX "existing" can be false.** UX said the Cost tab's "grouped by task or purchase with area chips" was existing; document mode was one flat group with a Belongs-to column. Read the component against the AC, not the UX table.
3. **Header actions that open dialogs cannot live in a tab panel.** `ObjectTabs` mounts panels on first visit, so a header "Add progress payment" needs page-level dialog state the panel also uses.
4. **A non-removable summary row (Final payment) inflates `RelatedList`'s count** and makes the empty state unreachable. Show it only when real rows exist, and give the list a `count` override.
5. **`figureKind.test.ts` scans only `data-figure=`/`figureKind=` attributes.** Facts built as object literals (`{ figureKind: 'paid' }`) are not scanned, so the page file must NOT be added to `FIGURE_FILES` (the "missing" check would fail). The SummaryStrip file already carries the marker.
6. **Pre-measure the page's import closure** with a scratch copy of `build-baseline.mjs` next to an installed `typescript` (the worktree has no node_modules): template components add primaries (ObjectHeader +1, SectionCard +1), so state the page file's own primary budget explicitly.
7. **`?param` deep links into a tab** (`?payment=` without `?tab=`) need an explicit "select that tab" rule; `useObjectTabs` reads only `?tab`.
8. **Capability `to` vs header redesign:** the capmap pinned the company link (MNY-059, 1 click) that a plain-text h1 drops; give it a home (description line) instead of silently demoting it.

Related: [[detail-template-specs]], [[object-list-adopter-specs]], [[related-list-picker-specs]], [[cost-line-specs]], [[consistency-test-specs]], [[restructure-baseline-hazards]]
