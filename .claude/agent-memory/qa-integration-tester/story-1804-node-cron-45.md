---
name: story-1804-node-cron-45
description: node-cron 4.5 scheduler-status testing patterns; scheduler-status testing; BACKUP_NOT_CONFIGURED was later removed (#2132); how to force scheduler failure without mocks
metadata:
  type: project
---

## Story #1804 — node-cron 4.5 adoption (backupService scheduler status) — 2026-07-07

**node-cron 4.5 `ScheduledTask.execute()` triggers a real run immediately, bypassing the cron heartbeat** — no need to mock `node-cron` at all to test scheduled-run outcomes. Pattern used in `server/src/services/backupService.test.ts`:

```ts
import { getTasks } from 'node-cron';
import type { ScheduledTask } from 'node-cron';
function getRegisteredSchedulerTask(): ScheduledTask | undefined {
  const matches = [...getTasks().values()].filter((t) => t.name === 'backup-scheduler');
  return matches[matches.length - 1]; // registry never removes stopped tasks — pick the latest
}
// ... initScheduler(db, config, logger); const task = getRegisteredSchedulerTask();
await task!.execute(); // resolves/rejects for real; updates task.lastRun()
```

`getTasks()` returns a `Map` keyed by a random `task.id` (NOT `task.name`), so you must filter by `.name`. `stopScheduler()` (production code) only calls `.stop()`, never `.destroy()`, so previously-started tasks with the same name accumulate in node-cron's global registry across tests in one file — always pick the last match. This avoids the ESM `jest.unstable_mockModule` + static-import ordering trap entirely (see [[jest-esm-flag-gotcha]]) since backupService.test.ts keeps its existing static-import structure unchanged.

**To force a scheduled run to fail without mocking**: mutate the `config` object in place _after_ calling `initScheduler(db, config, logger)` by pointing `config.backupDir` at a path under a regular file (e.g. `join(<regular file>, 'backups')`) — the scheduled closure captures `config` by reference, so the next `.execute()` fails (mkdir ENOTDIR -> `BACKUP_FAILED`) and node-cron records `lastRun().error`. (`backupEnabled` / `BackupNotConfiguredError` no longer exist, see #2132 below.)

**node-cron's injected `Logger` interface requires 4 methods (info/warn/error/debug) but only `.warn` (missed-execution/overlap, heartbeat-only) and `.error` (task failure) are ever actually invoked internally** — `.info` and `.debug` on a custom logger wrapper passed via `TaskOptions.logger` are permanently dead code from a coverage perspective; don't chase 100% on those two lines, they're unreachable via any real node-cron execution path (confirmed by reading `node_modules/node-cron/dist/node-cron.js` and `_shared.js`).

## `BACKUP_NOT_CONFIGURED` / `backupEnabled` were REMOVED (error-code bundle #2132, 2026-10)

`BACKUP_DIR` always defaults to `/backups` (since PR #1202), so the 503 path and the `backupEnabled` config flag were dead and have been deleted (code, `AppConfig` field, route/service guards, client "not configured" branch). Never re-add a 503 test or a `backupEnabled` fixture field. `backups.test.ts` instead has a default-config case (GET /api/backups as admin -> 200).

**Forcing a scheduled-run failure without mocking internals**: the scheduled closure holds `config` by reference, so after `initScheduler()` set `config.backupDir = join(<regular file>, 'backups')`; `createBackup` then fails (mkdir ENOTDIR -> `BACKUP_FAILED`) and `task.execute()` rejects. A path under a regular file also works as a root-safe "unwritable" simulation (chmod is ignored when running as root). For restore's temp-dir mkdir failure: pin `Date.now` via `jest.spyOn` and pre-create a regular file named `.restore-<pinned ts>` next to the backup dir.

## Test file gotchas

- `@cornerstone/shared` must be built (`cd shared && npx tsc`) before running ANY server-side Jest test locally in a fresh worktree — the server jest project has no moduleNameMapper for it (unlike the client project, which maps straight to `shared/src/index.ts`). Missing `shared/dist` → `Cannot find module '@cornerstone/shared'` failing the whole suite with 0 tests run.
- `BadgesStyles` regression-guard pattern: import `badgeStyles` from `Badge.module.css` directly in the test file and assert `screen.getByText('Enabled').className).toContain(badgeStyles.success)`. Since `identity-obj-proxy` maps CSS module keys to themselves as literal strings, this only catches "wrong variant selected" bugs (e.g. success vs error), not "made-up nonexistent class name" bugs — identity-obj-proxy returns whatever property you access regardless of whether it's real CSS.
- `BackupsPage.test.tsx`: the scheduler-status `useEffect` is _independent_ from the main backups-list `useEffect`. Any jest.fn() mock for `getSchedulerStatus` MUST have a default `mockResolvedValue({scheduler: {enabled:false,lastRun:null,nextRuns:[]}})` set in the shared `beforeEach` — otherwise pre-existing unrelated tests (e.g. asserting `screen.getByRole('alert')` singular) break because an unmocked scheduler fetch throws/resolves `undefined`, rendering an unexpected second alert banner.
