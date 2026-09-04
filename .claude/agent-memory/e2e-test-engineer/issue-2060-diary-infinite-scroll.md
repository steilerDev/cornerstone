---
name: issue-2060-diary-infinite-scroll
description: Diary pager replaced by IntersectionObserver infinite scroll (Issue #2060) — hook/component DOM shape, footer render conditions, POM additions, dedupe/error/filter-reset test patterns.
metadata:
  type: project
---

## What changed (frontend-developer + ux-designer, PR for #2060)

- New shared hook `client/src/hooks/useInfiniteScroll.ts` (generic `<T>`) — owns `IntersectionObserver`
  (600px `rootMargin`, constant `INFINITE_SCROLL_LOOKAHEAD_PX`), `status: 'idle'|'loading'|'error'|'done'`
  state machine, in-flight dedupe (`inFlightRef`), `resetKey`-driven reset effect.
- New shared component `client/src/components/InfiniteScrollFooter/InfiniteScrollFooter.tsx` (+ css) —
  purely presentational, driven by `status`/`hasMore`/`sentinelRef`/`onLoadMore`/`onRetry`.
- `DiaryPage.tsx`: pager fully removed (`handlePageChange`, `?page=` URL param, prev/next buttons all
  gone). No `searchParams.get('page')` reference exists anywhere anymore — a stale `/diary?page=3`
  bookmark is silently ignored, not stripped from the URL, not read.
- `pagination.*` i18n keys already removed from `client/src/i18n/en/diary.json`; new `infiniteScroll.*`
  block added (see keys below).

## DOM shape / render conditions (verified against actual source, not just the spec)

- `InfiniteScrollFooter` is rendered by `DiaryPage` **only when `entries.length > 0`** — for a
  zero-item response there is no footer, no sentinel, no button, no end-of-list message at all
  (confirms AC9 "empty state, no footer" behavior structurally, not just visually).
- Inside the footer, in DOM order: sentinel (`data-testid="infinite-scroll-sentinel"`, 0×0,
  `aria-hidden`) → `FormError` banner (`role="alert"`, only when `status==='error'`) → **either**
  the button (`data-testid="diary-load-more-button"`) **or** the end-of-list row
  (`data-testid="diary-end-of-list"`) — button and end-of-list are mutually exclusive
  (`status === 'done' ? endOfList : button`), but the error banner and the button coexist
  simultaneously on `status==='error'` (button relabels to "Retry").
- **The button is the SAME DOM node across idle/loading/error** — never unmounted until `status`
  becomes `'done'`. It self-labels: idle→"Load more", loading→disabled+inline spinner, error→"Retry".
  This means `diaryPage.loadMoreButton` is a stable locator through an entire failure→retry cycle —
  no need to re-query after a state change.
- Root testid on the whole footer container: `data-testid="diary-infinite-scroll-footer"` — use this
  to scope `getByRole('alert')` so it never collides with the page-level `shared.bannerError`
  (top-of-page banner, only shown when `error && entries.length === 0`, i.e. FIRST batch fails —
  a completely different code path/DOM node than the footer's error, which only ever appears once at
  least one batch has already succeeded).
- `hasMore` prop is passed to `InfiniteScrollFooter` but not read inside it (component only reads
  `status`) — `hasMore` is consumed by the parent for other purposes; don't assert on it directly via
  DOM, assert on `status`-derived visible elements instead.

## POM additions (`e2e/pages/DiaryPage.ts`)

`loadMoreButton`, `endOfListMessage`, `infiniteScrollSentinel`, `footerError` (scoped via
`getByTestId('diary-infinite-scroll-footer').getByRole('alert')`), plus a `scrollToLoadMore()` helper
mirroring the existing `waitForLoaded()` `Promise.race` pattern (races a generic diary-entries response
against the end-of-list locator — does NOT filter by status 200, since it must also resolve correctly
when the triggered batch fails). Removed: `prevPageButton`/`nextPageButton` (verified via repo-wide
grep that no OTHER page object shares these field names on `DiaryPage` — the identically-named fields
on `VendorsPage`/`HouseholdItemsPage`/`InvoicesPage`/`WorkItemsPage` are unrelated `DataTable`-based
pager locators, explicitly out of scope per the issue and untouched).

## Test file (`e2e/tests/diary/diary-list.spec.ts`, "Infinite scroll (Scenario 7)")

11 tests replacing the old 2-test "Pagination (Scenario 7)" block:

1. Auto-load on scroll (`@smoke @responsive` — the smoke tag matters: this is the fast regression
   guard for the whole rework, and `@responsive` means it re-runs unmodified on tablet+mobile
   projects, which is the literal regression test for the original "nothing happens on mobile" bug —
   no separate per-viewport test needed, the existing project/grep matrix does it for free).
2. Keyboard-only "Load more" (focus + Enter, no scroll) + focus-visible `box-shadow !== 'none'` check
   in both light and dark mode (pattern copied from `reportWizardEditableContent.spec.ts` Scenario 13
   — `.focus()` + `getComputedStyle(el).boxShadow`, not `outlineStyle`, since `:focus-visible` here
   uses `box-shadow: var(--shadow-focus)` like every other `shared.module.css` button).
3. Full pager removal — `page.getByTestId('prev-page-button')`/`next-page-button` `.toHaveCount(0)`.
4. Fast repeated scroll dedupe (best-effort, explicitly labeled as such) — realistically this passes
   because `IntersectionObserver` only fires its callback on a threshold crossing, not per scroll
   frame, so repeated identical `scrollTo(bottom)` calls naturally coalesce into one callback
   regardless of the hook's own `inFlightRef` guard; the artificial 500ms route delay + request
   counter just makes the assertion meaningful/timeable, it does not really stress the dedupe guard
   itself. Don't oversell this test's rigor if revisiting it.
5. End-of-list immediately on a single-page dataset, exactly one request total.
6. Empty dataset → no footer/sentinel/button/end-of-list at all (structural, not just visual).
7. Filter change mid-scroll discards old batch and loads disjoint new set + updates header count —
   route handler dispatches on the `type` query param (`work_item_status` → automatic single-item
   set, else → manual 2-page set) since clicking `mode-filter-automatic` changes `type`, not a
   dedicated "mode" query param.
8. Search reset — URL gains `q=` and never gains `page=`, checked both after loading page 2 AND
   after the search.
9. Batch failure → footer `role="alert"` + button relabels to "Retry"; scrolling again while errored
   does NOT re-issue the request (asserted via a before/after route-hit counter, not just "eventually
   consistent" waiting); retry re-fetches the same page and succeeds with the entry testid appearing
   with `toHaveCount(1)` (dedup proof) and end-of-list following since it was the last page.
10. Legacy `/diary?page=3` bookmark — asserted via mocked route capturing the actual `page` query
    param sent to the backend (`requestedPages[0] === '1'`), NOT by checking the URL bar, since the
    app never strips `?page=3` from the address bar — it just never reads it. Don't assert the URL is
    "cleaned"; that's not a real behavior and would be an assertion-that-passes-on-nothing risk if
    written against a `.not.toContain('page=3')` check that happens to also pass because of an
    unrelated bug.
11. Dark mode — one combined test walking error→retry→done inside a single `data-theme="dark"`
    session (cheaper than 3 separate dark-mode tests), asserting `role="alert"` visibility, the
    button's className contains `btnSecondary` (proves the shared button style class applied — CSS
    Modules classnames retain the literal source name as a substring in this codebase's build, same
    convention as the pervasive `[class*="..."]` locator idiom used everywhere else in this suite),
    and no horizontal overflow at each state transition.

## i18n keys (`client/src/i18n/en/diary.json`, `infiniteScroll` namespace)

`loadMoreButton` ("Load more"), `loadingMore` ("Loading more entries…"), `loadingMoreAriaLabel`,
`retryButton` ("Retry"), `errorMessage` ("Failed to load more entries."), `endOfList`,
`endOfListAnnouncement`, `batchAppendedAnnouncement` ("{{count}} more entries loaded"),
`batchAppendedAndEndAnnouncement`. All `pagination.*` keys were already gone by the time E2E work
started — no dead-key cleanup needed on the E2E side.

## Playwright project mechanics relevant here

`tablet`/`mobile` projects (`e2e/playwright.config.ts`) only run tests matching `grep: /@responsive/`;
`desktop` runs everything. Tagging a test `@responsive` is sufficient to get it repeated verbatim on
all 3 viewports — no manual `page.setViewportSize()` loop needed, and this is the established pattern
throughout `diary-list.spec.ts` (Scenarios 1, 2, 4, 6, 10, 11 all do this already). `npm run
test:e2e:smoke` = `--grep @smoke --project desktop` only.
