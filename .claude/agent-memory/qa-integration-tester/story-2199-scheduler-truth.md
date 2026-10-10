---
name: story-2199-scheduler-truth
description: Story #2199 scheduler-truth test patterns - projection engine tests, clock handling, fixture-ripple pitfalls, intentional behaviours that look like bugs
metadata:
  type: project
---

Contract 4: stored start/end = PLANNED dates (never floored); `projectedStartDate/EndDate`, `isLate`, `lateDays`, `isHeldUp` are a read-time forecast from `projectSchedule`/`computeScheduleProjection` (engine run twice: `applyTodayFloor` false vs true).

- **Clock**: `getTimeline`, `getWorkItemDetail`, `listWorkItems`, `getDependencies`, `getMilestoneById` read the real UTC date (no `today` param). Service tests freeze it with `jest.useFakeTimers({ now })` (sync better-sqlite3 is fine); route tests use `futureDateStr(n)` relative helpers or year-2099 dates. Only `autoReschedule(db, { today })` and `projectSchedule(graph, today)` take an injected `today`.
- **Undated task** (not completed, no predecessor, stored start NULL): never written by `autoReschedule`, `isLate` false, forecast = today; stays on `GET /api/timeline` (membership is by stored-or-forecast dates, so "excludes undated" assertions in old timeline tests had to become "includes").
- **Looks like a bug, is not**: household-item `isLate` stays false behind a finished predecessor (ES search starts at `today`, so nothing is "floored"); a non-undated item with NULL stored end and no duration forecasts end = start.
- **Mock blast radius**: client prod code importing a NEW export (`formatDayRange`, `toBcp47Locale`) from `lib/formatters.js` breaks every test that partially mocks that module (`GanttChart.test.tsx`) with a SyntaxError at link time, not a test failure message - add the export to the mock factory.
- **Fixture codegen**: regex scripts adding required fields to literals misfire on spreads / factory params (`startDate` variables, `...overrides`, `as unknown as T` casts that hide tsc errors). Prefer: factories compute `projectedStartDate: overrides.startDate !== undefined ? ... : default`; always grep `as unknown as` fixtures and run the semantic tests, not just tsc. `git checkout` the file and redo beats hand-repairing a mangled one.
- Spec vs implementation: QA spec scenario 24 says an on-time Gantt tooltip shows neither chip nor "Planned" row; implementation renders the Planned row whenever either planned date is set (only omitted for undated). Reported to dev-team-lead.
