---
name: story-2251-area-page-tests
description: Story #2251 Area page test notes - harness traps (worktree shell refusals, seeded trades, RelatedList ToastProvider), intentional behavior that looks like a bug
metadata:
  type: project
---

Area page (#2251) tests: server `areaPageService.test.ts` (own in-memory DB, dated tasks, `now` injected), `moneyService.areaMoney.test.ts` (uses `test/moneyDb.ts` seed helpers), client `pages/AreaDetailPage/*.test.tsx` with fixtures in `client/src/test/areaPageFixtures.ts`.

- **Worktree-isolated shell refuses** heredocs (`cat <<EOF`, `python - <<`), `sed` with a `$VAR` file operand, and any compound command containing git. Use Write/Edit for file creation and appends (anchor on the last `});`), and run git in its own call.
- **Trades are seeded by migrations** (`Plumbing` etc.): a fixture trade with a duplicate name fails `UNIQUE trades.name`. Seeded `translationKey`s are `trades.<name>` (not bare `plumbing`).
- **RelatedList needs `ToastProvider`** (even read-only) and a mocked `HouseNameContext` (`useEntriesLanguage`).
- **CostLineTable test ids**: group heading `th` is `<prefix>-group-<groupId>` (no `-table` suffix; card surface is `-mobile-`), rows `<prefix>-row-<id>`; budget overview route is `/budget/overview`.
- **PageBreadcrumbs + `extraParents`**: Back is suppressed when the origin equals the last extra parent, and an origin path without a label key and without `name` shows no Back at all (pass a name to `originStateFor`). Opening a child chip from its parent therefore shows no Back (the parent is already in the trail).
- **Photos page filtered by `areaId`** still renders every area row; areas outside the subtree appear as empty "No photos" cells (spots are filtered, rows are not). Looks like a bug, is the current behavior; pinned as such. Raised with the dev-team-lead as a UX question, not a defect.
- Heavy server route suites (`figures.consistency`, `areas`) need `NODE_OPTIONS="--experimental-vm-modules --max-old-space-size=6000"` and `-i`; filter the pino log noise with `grep -E "Tests:|FAIL|●"`.
- figureKind guard: new file carrying `data-figure="paid"` goes into `FIGURE_FILES` (sorted); the e2e surface registry is `e2e/fixtures/figureSurfaces.ts` (already had `area.page.paid`).
