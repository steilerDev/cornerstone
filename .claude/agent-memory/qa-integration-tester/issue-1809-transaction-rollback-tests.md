---
name: issue-1809-transaction-rollback-tests
description: Patterns for testing db.transaction() rollback atomicity via jest.spyOn(db, 'update'/'insert'/'delete') mid-sequence throws
metadata:
  type: project
---

# Issue #1809 — DB transaction rollback tests

Backend wrapped 5 multi-step write sequences in `db.transaction(() => { db.xxx(...) })`
(closure style, not `tx`-param style) specifically so QA could spy on the outer `db` object.
Added 9 rollback tests across 5 files, all passing, 407/407 regression green.

## The spy pattern (confirmed reliable)

```ts
const originalUpdate = db.update.bind(db); // bind BEFORE spyOn replaces the method
let calls = 0;
const spy = jest.spyOn(db, 'update').mockImplementation((...args) => {
  calls++;
  if (calls === N) throw new Error('Simulated crash mid-transaction');
  return originalUpdate(...args);
});
expect(() => serviceFn(db, ...)).toThrow('Simulated crash mid-transaction');
spy.mockRestore();
// assert EVERY write in the sequence is unchanged, including ones before the Nth call —
// proves the transaction rolled back earlier statements too, not just the throwing one.
```

This only works because the backend used closure style (`db.transaction(() => { db.xxx() })`).
If a site used `db.transaction((tx) => { tx.xxx() })`, spying on outer `db` would miss it entirely
— `tx` is a distinct object per the Drizzle better-sqlite3 session implementation. Always verify
closure style via `git diff` before trusting this pattern; flag `tx`-param sites as a review
finding rather than trying to work around them.

## Don't trust the spec's call-index guesses — verify empirically

The implementation spec guessed call orderings (e.g. "throw on call 3, in case call 2 is an
internal fallback select"). Verified empirically via a throwaway scratch test file
(`server/src/services/_scratch....test.ts`, deleted after use) that the actual call counts were
simpler than guessed:
- `replaceCategoryLinks()` (subsidyProgramService.ts) does ONE delete + ONE bulk insert (all
  categoryIds in a single `.values(rows)` call), not one insert per category — so
  `createSubsidyProgram` has exactly 2 `db.insert` calls (program row, then bulk category-links),
  and `updateSubsidyProgram` has exactly 1 `db.insert` call total (the update itself is
  `db.update`, not `db.insert`).
- `autoReschedule`'s cross-loop scenario (1 WI + 1 dependent HI) produces exactly 2 `db.update`
  calls (WI then HI) — the "fallback select" the spec worried about is a `db.select()`, which
  never shows up on a `db.update` spy at all, and doesn't fire anyway when the WI is already in
  `scheduledMap`.

**Gotcha**: `console.log` is globally mocked in `server/src/test/setupTests.ts`
(`jest.spyOn(console, 'log').mockImplementation(() => undefined)`), so a scratch test that logs
observations produces no visible output even with `--verbose`. Instead, force the values into the
test failure message itself, e.g. `expect(labels).toEqual(['FORCE_FAIL_TO_SHOW:' + labels.join(',')])`
— the diff in the failure output surfaces the real call order.

## Sanity-check: prove the test fails on the old code

Before trusting a new rollback test, `git stash push -- <production-file>` to briefly revert just
that one file to its unwrapped (pre-fix) state, re-run only the new test with `-t "rolls back"`,
confirm it FAILS, then `git stash pop`. Did this for `subtaskService.ts` — the test failed with
`Expected: 2, Received: 0` (first subtask's sortOrder was NOT rolled back), confirming the test is
a real regression guard and not a tautology. Cheap and worth doing for at least one of the N
rollback tests in a batch.

## Coverage: file-level % can look low but still be 100% on the diff

`milestoneService.ts` line coverage is ~76-78% and `workItemService.ts` ~93% — these are
pre-existing baselines (confirmed by stashing the new test file and re-running: identical
percentages before and after). The uncovered lines are unrelated untouched functions
(`getDependentWorkItems`, unlink/link helpers, unrelated validation branches). What matters is
that the *modified* transaction-wrapped regions (createMilestone/deleteMilestone,
deleteWorkItem, etc.) show 0 uncovered lines in that range — confirmed by cross-referencing the
`Uncovered Line #s` list against `grep -n '^export function'` for the target function's line
range. Don't chase the whole-file 95% number if the gap is pre-existing and out of scope; do
verify the diff itself is fully covered.

`schedulingEngine.ts`'s `autoReschedule` write-application phase is tested across FIVE test files
(not just one) — `schedulingEngine.dailyReschedule.test.ts`, `.householdItems.test.ts`,
`.workItemMilestones.test.ts`, `.milestoneCpm.test.ts`, plus the pure-`schedule()`-function tests
in `schedulingEngine.test.ts` (that last one never calls `autoReschedule`/touches the DB at all —
don't add DB-write tests there). Collecting coverage against `schedulingEngine.ts` requires
running all four DB-touching files together to get a true picture (95.05% achieved that way);
running just one file alone understates it.

## File/describe-block targets used

- `server/src/services/schedulingEngine.dailyReschedule.test.ts` — added
  `describe('autoReschedule — transaction rollback (#1809)', ...)` with 2 tests (own-loop +
  cross-loop). Chosen over `schedulingEngine.test.ts` (pure `schedule()`, no DB) — this file
  already imports `jest` and has the exact `jest.spyOn(db, 'update')` idiom cited in the spec.
- `subtaskService.test.ts` — extended `describe('reorderSubtasks()', ...)`.
- `milestoneService.test.ts` — extended both `describe('createMilestone', ...)` and
  `describe('deleteMilestone', ...)`.
- `workItemService.test.ts` — extended `describe('deleteWorkItem()', ...)`.
- `subsidyProgramService.test.ts` — extended both `describe('createSubsidyProgram()', ...)` and
  `describe('updateSubsidyProgram()', ...)`.

See [[test-infra-reference]] for general Drizzle/jest test infra conventions.
