# CI fix: timeline.test.ts calendar-drift + fake-timer/autoReschedule gate interaction (2026-07-31, PR #1902)

## What happened

Quality Gates Test Shard failed on `server/src/routes/timeline.test.ts` — unrelated to the PR's
actual scope (report table refinements). Root cause: test `'returns projectedDate equal to the
max endDate of linked work items'` created `not_started` work items with hardcoded absolute
calendar literals (`startDate: '2026-05-01'`, `endDate: '2026-07-30'`) and asserted
`projectedDate === '2026-07-30'`. `timelineService.ts` applies an implicit "today floor" CPM
override to `not_started` items (their start date cannot be in the past) — once the real clock
passed the fixture dates, the scheduler recomputed the date and the assertion expired.

## First attempt (rejected): freezing the clock

Tried `jest.useFakeTimers({ doNotFake: [...all except Date...] }); jest.setSystemTime(...)`
scoped to just the one test, with `jest.useRealTimers()` in a `finally` block. This is normally
the "right" pattern for Fastify+better-sqlite3 integration suites (freeze only `Date`, leave
`setImmediate`/`setTimeout`/etc. real so the event loop and sqlite I/O are unaffected).

**It caused a NEW cascading regression**: `schedulingEngine.ts` has a module-level
`lastRescheduleDate` variable gating `ensureDailyReschedule()` (called from the `/api/timeline`
route on every request, throttled to once per real calendar day per process). Freezing `Date` in
one test causes `ensureDailyReschedule` to compute `today` from the frozen clock and write that
frozen value into the shared `lastRescheduleDate` gate. The clock is restored after the test, but
the gate is left desynced from the real date — so the _next_ test in the file sees
`lastRescheduleDate !== realToday` and triggers an unwanted **real** `autoReschedule()` pass
against its own (otherwise-unrelated) database. In this case it broke the very next test
(`'returns projectedDate: null when all linked work items have null endDate'`), which uses an
`in_progress` item with no endDate — Rule 3's in_progress end-date floor kicked in via the
unwanted autoReschedule pass and persisted `endDate = today` to that test's DB row, turning a
previously-passing `null` assertion into a failure. Confirmed via `git stash` + full-suite run
that the _original_ file only had one failure — the second one was self-inflicted by the
fake-timers fix.

Diagnosed by adding temporary `console.error` debug lines directly into
`schedulingEngine.ts`/`timelineService.ts` (not `console.log` — it's globally mocked in
`server/src/test/setupTests.ts`), running, then reverting with `git checkout --`. Useful technique:
write JSON debug output to `/tmp/*.json` via `writeFileSync` from a throwaway
`server/src/services/__debug.test.ts` file (deleted after) when you need to inspect
`schedule()`'s raw output in isolation from the full route/service stack.

## Fix that worked: relative-date fixtures, no clock mocking at all

Added a `futureDateStr(daysFromNow)` helper (`new Date()` + `setUTCDate` offset, sliced to
`YYYY-MM-DD`) and rewrote the one affected test to use dates computed relative to the real
current date (e.g. `futureDateStr(30)`, `futureDateStr(150)`) instead of hardcoded literals. This
sidesteps the today-floor entirely (dates are always safely in the future) without touching
`Date`/timers at all, so there's no `lastRescheduleDate` gate interaction. Full 33-test file green,
twice in a row (checked for flakiness). Prettier/eslint clean.

**Takeaway**: in this codebase, prefer the "compute fixture dates relative to now" fallback over
clock-freezing for `not_started`/`in_progress` scheduling-engine fixtures whenever the test file
also (even indirectly, via the route) exercises `ensureDailyReschedule`/`autoReschedule` — which
in practice means **any** `server/src/routes/*.test.ts` file that hits an endpoint touching work
items/milestones/household items with scheduling logic. Reserve fake-timers for logic that has no
path into `schedulingEngine.ts`'s module-level reschedule gate.

## Future-drift risks found elsewhere (NOT fixed — not currently failing, out of scope per task)

- `server/src/services/householdItemDepService.test.ts` (~line 270-282), test `'creates a
work_item dependency with default FS type and 0 lag'`: not_started work item with
  `endDate: '2027-06-15'` (no startDate/durationDays) asserted verbatim after `createDep()` calls
  `autoReschedule()`. Safe only while `2027-06-15 >= today`. MEDIUM risk (~10-11 months out as of
  2026-07-31).
- `server/src/routes/schedule.test.ts` (~line 767-786), test `'should apply startAfter hard
constraint when scheduling'`: not_started item with `startAfter: '2027-06-01'`, asserts CPM
  output `scheduledStartDate` equals that literal. Safe only while `2027-06-01 >= today`. MEDIUM
  risk.
- Everything else audited (schedulingEngine*.test.ts — `today` is an injected param, immune;
  timelineService.test.ts — `schedule()` fully mocked; milestone*.test.ts — `targetDate` is a
  pass-through field never rewritten by CPM; householdItemService.reschedule.test.ts and
  workItems.test.ts's optional-fields test already use dynamic `new Date()` — exemplary pattern to
  copy) is confirmed safe.
