---
name: bug-1829-shard3-flakes
description: Root cause + fix for the recurring E2E shard-3 diary flakes blocking main promotions (issue #1829) — confirms maxFailures/retry accounting semantics.
metadata:
  type: project
---

## Summary

Issue #1829 reported 3 "failing" tests on shard 3/16 desktop on main-targeted PRs
(#1791, #1828). Investigation (job 85332065279 logs, `gh api repos/.../actions/jobs/<id>/logs`)
showed only **one** was a real, independent bug — the other two were consequences of
`maxFailures: 1` fail-fast, not independent defects:

1. **`e2e/tests/diary/diary-drafts.spec.ts:854`** (Scenario 14) — REAL bug. Failed on
   BOTH attempt 1 and retry #1 (48s each) → genuinely exhausted retries → correctly
   tripped `maxFailures: 1`.
2. **`e2e/tests/documents/document-linking.spec.ts:369`** (Scenario 7a) — NOT a real
   bug. Log shows it ran only 1.6s before being marked `✘` — it was cancelled
   mid-flight as collateral damage the instant #1 tripped fail-fast, not a genuine
   assertion/timeout failure of its own.
3. **`e2e/tests/diary/diary-r2-uat.spec.ts:599`** (Scenario 10) — REAL secondary bug
   (a genuine race), but reported as "flaky" (failed attempt 1, passed retry) — this
   did NOT trip `maxFailures` (see accounting proof below), so it did not cause the
   shard cancellation; it's independently worth fixing but wasn't the trigger.

## Root cause 1: diary-drafts.spec.ts:854 (the actual trigger)

`test.slow()` triples the desktop project's **overall per-test timeout** (15s → 45s).
This is a single shared ceiling across every step in the test PLUS the `finally`-block
cleanup — it is NOT "3x budget per step," and it does NOT triple `actionTimeout` or
`expect.timeout` (a misconception baked into the original code's comments). The test
paired `test.slow()` (45s total) with FOUR separate explicit step timeouts of
30_000-45_000ms each (`waitForResponse`, `waitForURL`, two `expect(...).toBeVisible()`
calls) — any single one of which could alone consume the entire budget. Under heavy
8-worker CI load the cumulative real elapsed time across these steps regularly ate the
whole 45s, leaving nothing for the `finally` block's `deleteDiaryEntryViaApi()` call —
which is what actually threw ("apiRequestContext.delete: Test timeout of 45000ms
exceeded"), masking the true cause (slow steps, not a slow delete).

**Fix** (commit on `fix/1829-e2e-shard3-flakes`): replaced `test.slow()` with
`test.setTimeout(60_000)` (explicit absolute budget, more generous and self-documenting
than a 3x multiplier), reduced the 4 oversized step timeouts to 15_000ms each
(proportionate "something is actually stuck" ceilings, not budget reservations), and —
the generalizable pattern — added `testInfo.setTimeout(testInfo.timeout + 15_000)` as
the FIRST line of the `finally` block before cleanup. This call is **additive to the
current remaining deadline**, not a reset to an absolute value, so it always grants
15s of guaranteed headroom for cleanup regardless of how much of the original budget
the test body already burned. Wrapped the delete in `try/catch` (best-effort cleanup;
an orphaned draft in the ephemeral CI DB is harmless, a masked test outcome is not).
Applied the same defensive pattern to `document-linking.spec.ts:369`'s two-item
cleanup even though it wasn't the root cause, since it's cheap insurance and directly
named in the issue.

## Root cause 2: diary-r2-uat.spec.ts:599 (secondary, real race)

Both this test and `Scenario 9` mock `**/api/diary-entries*` with an ALWAYS-EMPTY
paginated response (`makePaginatedEmpty()`). `DiaryPage.waitForLoaded()` races
`timeline`/`emptyState`/`errorBanner` visibility — but since the empty state is
already visible from a *prior* transition and never changes, `.waitFor({state:
'visible'})` on an already-visible element resolves **instantly**, without
synchronizing to the new request/response at all. Scenario 10 clicks "All" then
"Manual" (two transitions before the assertion); after the "All" click,
`waitForLoaded()` is a no-op, so the test proceeds to reset a `requests[]` capture
array and register a fresh `waitForResponse` for the "Manual" click's response —
but the "All" click's own response can still be in flight and arrive AFTER the
reset, matching the loose `waitForResponse` predicate (any 200 response containing
`/api/diary-entries`) and resolving it *before* the real "Manual" request/response
pair occurs. Result: `requests[]` is empty when read → `expect(lastRequest).toBeDefined()`
fails intermittently. Scenario 9 does NOT have this race because its `requests[]`
reset happens right after the very first (`goto`) transition, whose response is
provably not-yet-arrived when `waitForLoaded()` resolves (nothing was visible before
first navigation).

**Fix**: explicitly `await page.waitForResponse(pred)` for the "All" transition's own
response (registered before the click) before resetting/registering for "Manual", and
derive `lastRequest`/`typeParam` directly from the resolved `Response` object's URL
instead of a side-channel mutable array — eliminates the race entirely rather than
narrowing the window.

## `maxFailures` / retry accounting — proof it already tolerates one flaky test

Verified against installed `testcontainers`... no wait, against `@playwright/test@1.61.1`
source (`packages/playwright/src/runner/dispatcher.ts`, `_reportTestEnd`):

```ts
// Test is considered failing after the last retry.
if (test.outcome() === 'unexpected' && test.results.length > test.retries)
  ++this._testRun.failedTestCount;
```

`maxFailures` only increments once a test has **exhausted all configured retries**
AND is still `'unexpected'`. A test that fails attempt 1 but passes on retry
("flaky") never counts. **AC #3 of issue #1829 ("should fail-fast tolerate one
retry-passing test before cancelling?") is already satisfied by Playwright's design —
no config change was needed.** `maxFailures: 1` in `e2e/playwright.config.ts` was left
as-is; only the comment was expanded to document this (with a source citation) so a
future engineer doesn't re-litigate it. Root-causing #1 above is the real fix — once
that test reliably passes on attempt 1 (or at worst passes on retry), fail-fast won't
trip and the other two tests stop showing collateral/independent failures.

## Playwright config values (verified 2026-07-08, corrects a stale prior note)

- Global `use`: `actionTimeout: 5_000`, `navigationTimeout: 10_000`.
- Desktop: test `timeout: 15_000` (top-level default), `expect: {timeout: 7_000}`.
- Tablet/Mobile: test `timeout: 30_000`, `expect: {timeout: 10_000}`, action/nav `10_000`.
- `retries: 1` on CI, `maxFailures: 1` only when `E2E_FAIL_FAST=1` (main-targeted PRs).

## Incidental fix: testcontainers API drift (e2e/containers/cornerstoneContainer.ts)

While attempting a real containerized verification run of this fix, discovered
`cornerstoneContainer.ts`'s `HTTP_PROXY`/`HTTPS_PROXY` branch called
`.withCopyFileToContainer(caPath, target)` (singular) — this method does not exist in
the installed `testcontainers@12.0.4` (renamed to `.withCopyFilesToContainer([{source,
target}])`, plural, array-based, confirmed by reading `node_modules/testcontainers/build/generic-container/generic-container.d.ts`
and a `node -e` runtime probe). This branch only executes when `HTTP_PROXY`/`HTTPS_PROXY`
env vars are set, which CI never sets — so the bug was dormant in CI and only surfaces
in a local sandbox that sits behind an HTTP(S) proxy requiring a trusted CA (like this
one). Fixed as a one-line incidental change. Full containerized verification still
wasn't possible in this sandbox after that fix: building the `cornerstone:e2e` image
requires `dhi.io` (Docker Hardened Images) registry credentials not available here
(`401 Unauthorized` pulling `dhi.io/node:24-alpine3.23`) — this is a credentials/
environment limitation, not a code issue. **If you hit `withCopyFileToContainer is not
a function` in a future session, this is already fixed** — don't re-diagnose, just
check whether a newer `testcontainers` bump reintroduced /renamed the API again.
