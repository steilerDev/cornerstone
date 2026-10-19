---
name: diary-list-specs
description: Hazards found speccing EPIC-21 #2225 (Site diary list on FeedRow) — AnchoredPanel vs portaled SearchPicker, infinite-scroll reset clears items, role=article in ul, orphan test-only component folders, shared summary builder reaching History, list-side draft discard
metadata:
  type: feedback
---

Found while speccing #2225 (P2.6). Each was invisible in the AC and the UX visual spec.

1. **AnchoredPanel + SearchPicker**: the picker's listbox is a `FloatingPortal` outside the panel element, so AnchoredPanel's `useClickOutside` dismisses the panel on the option mousedown and the pick is lost. Spec an AnchoredPanel rule (ignore presses inside `[data-search-picker-dropdown]`). Escape is fine: SearchPicker's React `stopPropagation` stops the native event before the trap's document listener. Sheet/Modal hosts do not have this problem.
2. **`useInfiniteScroll` clears `items` on every `resetKey` change.** A UX ask like "keep the old list dimmed while a filter change loads" needs a hook change; call it out as a deviation instead of letting the implementer discover it.
3. **`role="article"` on an `<li>` inside `<ul>` fails axe's `list` rule.** Feed rows stay plain `li` in the `role="feed"` wrapper.
4. **A "retire N components" list can include folders that hold only tests** (`DiaryOutcomeBadge/`, `DiarySeverityBadge/` had no `.tsx`; the maps lived in another component). `ls` each folder before writing the retirement steps; the deleting agent must also delete the test files (a test importing a deleted module cannot stay), so give that deletion to the frontend, not QA.
5. **`toDiarySummaries` feeds both the diary list and `GET /api/history`.** Additive summary fields reach History's include-diary rows; say so in the contract and test it once.
6. **Discarding a draft outside the capture screen** must mirror the capture's discard: `useCaptureUploads().discardDraft(id)` (waiting IndexedDB uploads), `deleteDiaryEntry`, `clearStickyTags`. A bare DELETE leaves the upload queue posting to a deleted entry.
7. **Prefix testid locators** (`[data-testid^="diary-entry-"]`) also match sub-element ids like `…-link`; tell E2E to scope by element (`li[data-testid^=…]`) whenever a row's sub-elements share its prefix.

Review round 1 of #2225 found three more, worth pre-empting in any similar spec:

8. **One retry handler for two retry buttons**: a "focus after retry" flag set by the first-batch Retry was also set by the `InfiniteScrollFooter` Retry, so a page-3 retry yanked focus to the h1. Spec separate handlers (footer gets the bare `retry`).
9. **A validated two-field range that writes only the changed side** leaves a previously rejected side on screen but not in the URL once the range becomes valid. On every valid change write both sides.
10. **"Focus the Filters button" after Clear all** must not run while the button sits behind an open modal Sheet; inside the sheet, focus stays in the sheet.
11. **A planned route target in a story's AC** (chips "open the area" while route `area` is `planned`) needs the interim recorded where the serving story will find it: the `Interim until route X (story)` code comment, the capmap note, the routemap note of the planned route and the wiki.

**Why:** each would have surfaced as an E2E failure, an axe finding or a reviewer round.

**How to apply:** any story that puts pickers in a popover, re-lays out an infinite-scroll list, retires components, or adds fields to a shared summary builder.

Related: [[history-page-specs]], [[infinite-scroll-consumer-hazards]], [[server-search-picker-specs]], [[areas-index-specs]]
