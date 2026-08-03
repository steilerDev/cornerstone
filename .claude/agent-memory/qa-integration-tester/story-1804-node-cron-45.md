---
name: story-1804-node-cron-45
description: node-cron 4.5 scheduler-status testing patterns; discovered BACKUP_NOT_CONFIGURED is unreachable in production
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

**To force a scheduled run to fail without mocking**: mutate the `config` object in place _after_ calling `initScheduler(db, config, logger)` (e.g. `config.backupEnabled = false`) — the scheduled closure captures `config` by reference, so the next `.execute()` naturally throws `BackupNotConfiguredError` and node-cron records `lastRun().error`.

**node-cron's injected `Logger` interface requires 4 methods (info/warn/error/debug) but only `.warn` (missed-execution/overlap, heartbeat-only) and `.error` (task failure) are ever actually invoked internally** — `.info` and `.debug` on a custom logger wrapper passed via `TaskOptions.logger` are permanently dead code from a coverage perspective; don't chase 100% on those two lines, they're unreachable via any real node-cron execution path (confirmed by reading `node_modules/node-cron/dist/node-cron.js` and `_shared.js`).

## RESOLVED (was: "confirmed pre-existing bug") — `BACKUP_NOT_CONFIGURED` (503) is INTENTIONALLY unreachable, not a bug

`server/src/plugins/config.ts` line ~241: `const backupDir = getValue('BACKUP_DIR') ?? '/backups';` then `backupEnabled = !!backupDir`. Since `getValue()` treats `''` as `undefined`, there is no env value that makes `backupDir` falsy — `backupEnabled` is always `true`. I initially wrote a test asserting the route's docstring-claimed 503 contract and flagged it as a bug.

**dev-team-lead review (2026-07-07) corrected this**: the `?? '/backups'` default was a **deliberate** change in commit c44b40f3 (PR #1202, "feat(backup): set sensible default for BACKUP_DIR", Fixes #1199) — that same PR removed the equivalent 503 tests for the other 4 backup endpoints (`POST/GET /api/backups`, `DELETE /api/backups/:filename`, `POST /api/backups/:filename/restore`) for exactly this reason. The route file's docstring and the wiki API-Contract page are **stale documentation** describing the pre-#1202 contract, not a current defect. My test was correct against the (wrong) spec I was matching, but the spec itself was outdated — diagnosis: TEST_BUG, not a production bug.

**Action taken**: deleted the entire `'GET /api/backups/scheduler-status — BACKUP_DIR not configured'` describe block from `server/src/routes/backups.test.ts` (beforeEach/afterEach + the single `it`), mirroring the PR #1202 precedent of outright removal (no `.skip`/TODO). Verified 19/19 tests green after removal; `npx eslint server/src/routes/backups.test.ts` clean.

**Lingering doc debt (not mine to fix)**: `server/src/routes/backups.ts`'s docstring and the wiki API-Contract page still claim "All endpoints return 503 BACKUP_NOT_CONFIGURED if BACKUP_DIR is not set" — this is stale and should eventually be corrected by product-architect/backend-developer to reflect the always-defaulted `BACKUP_DIR` behavior from PR #1202. Do not re-add a 503-BACKUP_NOT_CONFIGURED test for any backup endpoint unless `config.ts`'s default-fallback behavior actually changes.

## Test file gotchas

- `@cornerstone/shared` must be built (`cd shared && npx tsc`) before running ANY server-side Jest test locally in a fresh worktree — the server jest project has no moduleNameMapper for it (unlike the client project, which maps straight to `shared/src/index.ts`). Missing `shared/dist` → `Cannot find module '@cornerstone/shared'` failing the whole suite with 0 tests run.
- `BadgesStyles` regression-guard pattern: import `badgeStyles` from `Badge.module.css` directly in the test file and assert `screen.getByText('Enabled').className).toContain(badgeStyles.success)`. Since `identity-obj-proxy` maps CSS module keys to themselves as literal strings, this only catches "wrong variant selected" bugs (e.g. success vs error), not "made-up nonexistent class name" bugs — identity-obj-proxy returns whatever property you access regardless of whether it's real CSS.
- `BackupsPage.test.tsx`: the scheduler-status `useEffect` is _independent_ from the main backups-list `useEffect`. Any jest.fn() mock for `getSchedulerStatus` MUST have a default `mockResolvedValue({scheduler: {enabled:false,lastRun:null,nextRuns:[]}})` set in the shared `beforeEach` — otherwise pre-existing unrelated tests (e.g. asserting `screen.getByRole('alert')` singular) break because an unmocked scheduler fetch throws/resolves `undefined`, rendering an unexpected second alert banner.
