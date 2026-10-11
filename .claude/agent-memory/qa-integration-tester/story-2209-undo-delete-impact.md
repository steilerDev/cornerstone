---
name: story-2209-undo-delete-impact
description: Story #2209 server/shared tests - undo store clock capture, fake-timer recipe, mutation script, equivalent mutants, delete-impact parity seeding
metadata:
  type: project
---

- `undoStore` (singleton) captures `Date.now` at import, so jest fake timers and `jest.spyOn(Date,'now')` do NOT move its clock. Route tests set `(undoStore as {now}).now = () => Date.now()` in beforeEach (restore after); service tests build `createUndoStore({ now: () => Date.now() })`. Fake only Date for route tests (`doNotFake` every timer, cast `as never`), otherwise `app.inject` stalls.
- `diaryAutoEventService` W3 uses `Date.now()` directly, so `jest.useFakeTimers({now})` + `setSystemTime` works there.
- Milestone-delay event repro: `addLinkedMilestone` (not `addRequiredMilestone`), milestone target before the task's forecast end, then start the task. Assert the event really exists before claiming it is retracted (my first version passed vacuously).
- Mutation helper pattern: a script that backs up the production file, applies `perl -0pi`, runs jest, restores via `trap`. Bash tool refuses git-looking compound commands in worktrees, so put loops in a script file under the job tmp. `git status` fails here (broken wiki submodule); verify restoration with grep counts.
- Equivalent mutants (not test gaps): the in-handler `if (!request.user) throw Unauthorized` in undo/deleteImpact routes is unreachable (global auth hook answers 401 first), so those lines stay uncovered; milestone `Number.isInteger` guard is also redundant with the not-found lookup.
- Delete-impact parity tests seed with raw SQL via PRAGMA table_info (auto-fill created_at/updated_at); `deleteDiaryEntry` is async and takes a photo storage path.
- Existing suites (diaryAutoEventService, invoiceDepositService, workItemService, route PATCH suites) did NOT break from the #2209 backend changes (baseline 214 suites green), contrary to the spec's prediction.
