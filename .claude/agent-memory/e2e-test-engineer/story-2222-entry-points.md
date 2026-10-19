---
name: story-2222-entry-points
description: #2222 Log now tiles / ?start= / Log today E2E: POM additions, spec Q1-Q11 layout, facts verified live
metadata:
  type: project
---

Spec `e2e/tests/diary/quick-log-entry-points.spec.ts`; `CreateMenu` POM gained `quickLogGroup/quickLogTile/quickLogTiles/chooseQuickLog` + `QUICK_LOG_LABELS` (`rows()` untouched: tiles use `quick-log-*`, not `create-sheet-*`); `DiaryCapturePage.goto({start})` (photo waits for `capture-screen` only); `DiaryPage.newEntryButton` -> `logTodayLink` ("Log today").

- Fresh Playwright context = empty localStorage, so default tile order needs no seeding; last-used key `cornerstone.newSheet.lastQuickLog`.
- Note start = More-chip trigger `data-current="true"` (not aria-pressed); Delivery chip is aria-pressed.
- Count `POST /api/diary-entries` via `page.on('request')` to prove "no draft" on a start.
- All 11 scenarios passed first run on desktop/tablet/mobile (no production defects found).
