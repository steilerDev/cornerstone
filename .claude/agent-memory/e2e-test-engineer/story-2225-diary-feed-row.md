---
name: story-2225-diary-feed-row
description: '#2225 Site diary feed-row E2E: POM/test ids, mock helpers, seed fixture, live-run traps (sequential runs only), production defects found.'
metadata:
  type: project
---

- POMs: `DiaryPage` (row `li[data-testid^="diary-entry-"]`, `diary-week-<monday>`, Unfinished row, `openFilters()` picks sheet/panel, `pickArea/pickCompany`), `DiaryEntryDetailPage` (`moreMenu` -> `deleteItem`, `metaLine`, `historySection`), `PhotoViewerPage.annotateReason`.
- Fixtures: `fixtures/diaryMocks.ts` (`stubUnfinishedEmpty` must be registered AFTER the feed mock; `stubFilterOptions` fixes the Type/Area/Company sources), `fixtures/diaryFeedSeed.ts` (`seedDiaryFeed`, `mondayOf`, per-test `uniqueTag`).
- The Site diary now makes TWO list requests on load (feed `status=saved` + Unfinished `status=draft&pageSize=3`): blanket `**/api/diary-entries*` mocks and request counters need the stub. `*` in a glob does not match `/`, so filter-options is not caught.
- "Last week" seed date is today-7, not -8 (Monday-8 is two weeks back). Far-future dates (2099-12-29..31) keep drafts/promoted entries on top of the Unfinished row / Recent Diary card.
- Tablet project = iPad gen 7 = 810px WebKit: gets the anchored PANEL (>=768), not the sheet. Tablet/mobile only run `@responsive`-tagged tests.
- Playwright treats `aria-disabled` as not enabled: use `click({ force: true })` to prove a disabled control does nothing. FormError field variant is not `role=alert`.
- Live runs: concurrent runs from one worktree clobber `test-results/.auth` + `playwright-output` -> run desktop/tablet/mobile SEQUENTIALLY (chain script). A signed entry takes no new photos: attach to the signed draft, then promote.
- Defects found and FIXED in #2225: area chips pointed at an unserved route (now `routeUrl('areas')`, interim until P5.7); Filters panel closed on every live write (`closeSignal` now `location.pathname`).
- History date inputs: use `HistoryPage.setDate(which, value)` (fill, assert value, await URL param); consecutive fills raced the URL-driven input on WebKit.
- photoAnnotation 'Measurement ... Escape' fails 3/3 on desktop at plain HEAD too (pre-existing, not #2225).
- Unrelated flakes seen: tablet History H5a (WebKit date fill), tablet phone-tablet-shell S6 (goto interrupted), desktop photoAnnotation "Measurement Escape" once.
