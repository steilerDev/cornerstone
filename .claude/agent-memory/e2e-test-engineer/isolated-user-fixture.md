---
name: isolated-user-fixture
description: e2e/fixtures/isolatedUser.ts — how to give a preference-mutating spec its own user; why opting a file in reshuffles shard membership suite-wide and reddens unrelated shards; plus the login rate limit and soft-delete facts that dictate per-worker vs per-test scope
metadata:
  type: project
---

`e2e/fixtures/isolatedUser.ts` (added for Issue #1957) is the canonical way to stop a spec
from reading/writing per-user preference rows on the shared admin
(`test-results/.auth/admin.json`). Import `test`/`expect` from it and opt in:

- `test.use({ isolatedUserPerWorker: { emailPrefix: 'dash' } })` — **file scope only**, one
  dedicated user per worker. Preferred.
- `test.use({ isolatedUserPerTest: { emailPrefix: 'x' } })` — file _or_ describe scope, fresh
  user per test. Use when only a few tests inside a shared-admin file need isolation.

It works by overriding the built-in **`storageState` option**, so plain `page`/`context` are
already the dedicated user (no `scopedPage` rewrites) _and_ Playwright keeps trace/video/
screenshot artifacts — a hand-made `browser.newContext()` silently loses those. An `auto`
guard fixture checks `/api/auth/me` once per test so a silent regression of the override
fails loudly instead of quietly reverting to shared-admin writes.

**Why:** `LocaleContext.syncWithServer` treats the server as authoritative — it applies the
server locale _and_ deletes the victim's `localStorage.locale`, so a concurrent PATCH from
another file flips a running test's language permanently. Same shape for
`dashboard.hiddenCards` and `table.*.columns`. `mode: 'serial'` cannot fix it (orders a file
against itself only).

**How to apply — constraints that decide the scope, verified against the server:**

- `POST /api/auth/login` is rate-limited **20 requests / 15 min per IP**
  (`server/src/routes/auth.ts`); every worker in a shard shares the bucket (`global: false`,
  so only explicitly-configured routes are limited). Per-worker = 1 login per worker;
  per-test multiplies fast. Budget it before converting a big file.
- `DELETE /api/users/:id` is a **soft delete** (`deactivateUser` + `destroyUserSessions`) —
  the `user_preferences` row survives, so the issue's "ON DELETE CASCADE cleans up" claim is
  wrong. Isolation still holds (the account can never be logged into again), but users
  accumulate.
- User accumulation is bounded **per shard, not per run**: each shard is its own CI job with
  its own container and DB (`containers/setup.ts` runs in globalSetup). So the 100-row
  `/settings/users` page (`sortBy: null`, insertion order, scanned row-by-row by
  `edit-user.spec.ts` / `deactivate-user.spec.ts`) is never remotely in reach — my original
  worry was overstated. The case for per-worker rests on the login rate limit above.
- Keep the string "admin" out of generated e-mails/display names —
  `search-users.spec.ts` asserts every row matching a search for "Admin" has "admin" in its
  name column.
- Admin-gating is narrow: server `requireRole('admin')` only on `/api/users` mutations +
  `/api/backups/*`; client only the Settings sub-nav "User Management"/"Backups" tabs and
  work-item note edit/delete. So `role: 'member'` (the default) is fine for almost everything.

**Playwright mechanics learned here (all verified in `node_modules/playwright/lib`):**

- A **worker-scoped option cannot be set from inside a `describe`** — Playwright throws
  "Cannot use({ x }) in a describe group, because it forces a new worker." That is the only
  reason `isolatedUserPerTest` exists.
- Option values participate in the worker hash, so each distinct `test.use()` value forces
  its own worker group (extra worker restarts, a few seconds per shard).
- **`test.use()` reshuffles shard MEMBERSHIP across the whole suite — expect an unrelated
  shard to go red.** `createTestGroups` (`node_modules/playwright/lib/runner/index.js:2251`)
  buckets tests by `test._workerHash` **first** and emits groups in bucket insertion order;
  `filterForShard` (`:2321`) then walks that list and slices by cumulative test count. So
  changing one file's worker hash moves **every** shard boundary in the suite, even with the
  total test count unchanged. Any latent cross-file shared-state assumption in a newly
  co-located pair then fails, looking completely unrelated to the change. This is what bit
  #1957: `no-area-filter.spec.ts` moved from shard 15 to shard 14 next to
  `area-filter.spec.ts`, whose Scenarios 3/5/6 hold area-less household items, and its
  suite-global "no unassigned household item exists" precondition became unreachable.
  **Diagnostic before blaming the change:** diff shard membership between base and head with
  `npx playwright test --list --shard=N/16` — extract the base tree via
  `git archive <base-sha> e2e | tar -x -C /tmp/base` and symlink `node_modules` into it.
  Never respond by pinning or reordering shard assignment; fix the test that assumes
  suite-global state (scope it to its own data — see
  [general-e2e-patterns.md](general-e2e-patterns.md) and the Scenario 4 comment in
  `e2e/tests/household-items/no-area-filter.spec.ts` for the `&q=`+`testPrefix` pattern).
- `_combinedContextOptions` depends on the `storageState` _fixture_, so overriding that option
  really does re-point `page`/`context` (not a silent no-op).
- Project context options (incl. `baseURL`) are merged into `browser.newContext()` /
  `request.newContext()` only by instrumentation installed by the test-scoped
  `_setupArtifacts` fixture. A **worker-scoped** fixture runs before that, so it must pass
  `baseURL` explicitly (`process.env.APP_BASE_URL || 'http://localhost:3000'`, set by
  `containers/setup.ts` in globalSetup).
- `npx playwright test --list` validates the whole fixture graph (scope violations, cycles,
  load errors) **without containers or a browser** — the only meaningful local check available
  in this sandbox. `npx tsc --noEmit -p e2e/tsconfig.json` also works, but e2e carries ~123
  pre-existing errors (it is not covered by `npm run typecheck`), so use it differentially.
