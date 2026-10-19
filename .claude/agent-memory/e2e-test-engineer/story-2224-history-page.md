---
name: story-2224-history-page
description: '#2224 History page E2E: POM/test ids, per-test unique tag (testPrefix is per worker), moved diary filter tests, live-run traps (Playwright image 1.64.1, docker disk), controlled-checkbox quirk.'
metadata:
  type: project
---

- `e2e/pages/HistoryPage.ts` (ids: `history-type-<v>`, `history-filters-toggle`, `history-object-object`, `history-date-from/to`, `history-include-diary`, `history-clear-filters`, `history-footer`, rows `li[data-testid^="system-event-"]`). The object picker input has no id: found by accessible name; once an object is picked the input is replaced by the selected display plus "Clear selection" (so test Escape-focus BEFORE picking).
- `testPrefix` is `E2E-<project><worker>`: NOT unique per test, and events outlive deleted fixtures. History specs build a per-test `uniq` tag into every title/invoice number/source name and isolate rows with `q=uniq`.
- System-event `q` search matches `subjectLabel`, so invoice numbers/task titles carrying `uniq` work. Batch collapse: filter `type=submission` + `q` gives exactly one row.
- Diary mode chips/hidden line moved to History; `DiaryPage` POM now has `historyLink`, `modeChips`, `systemEventRowsAny()`.
- The include-diary checkbox once flipped back after a click (a production bug: controlled by the URL). Fixed in #2224 with a local draft in `HistoryFilters`; use `check()` / `uncheck()` and assert `toBeChecked()` before the URL.
- Live run: Playwright npm lib moved to 1.64.1, so the 1.63 image fails with "Executable doesn't exist" - pull `mcr.microsoft.com/playwright:v1.64.1-noble`. Docker disk is only ~10 GB: `docker builder prune -af` plus removing the old playwright image frees space before the pull. `node_modules` symlink -> `<jobtmp>/nmcur/node_modules`; mount `nmcur` at the same path plus `nmcur/node_modules` onto `$WT/node_modules`. Rebuild `cornerstone:e2e` from a node_modules-free tar copy when the implementation is newer than the image.
