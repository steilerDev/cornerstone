# E2E Flake-Avoidance Patterns (moved from `.claude/checklists/implementation-checklist.md`, 2026-08-01)

Narrow, hard-won patterns from specific historical flakes/CI quirks. Check these when writing or
debugging timing-sensitive E2E tests; `known-flakes-and-regressions.md` holds the triaged incident log.

## Canvas interaction coordinates (Konva)

When interacting with a Konva `<canvas>` (or any element centered inside a flex container), use `page.locator('canvas').first().boundingBox()` — NOT the parent container's bounding box — to calculate mouse coordinates. A flex-centered canvas occupies only a portion of its parent; coordinates derived from the parent land outside the canvas and Konva's `getPointerPosition()` returns null, silently preventing shape commits.

## `test.slow()` vs explicit assertion timeouts

`test.slow()` triples the project-level `expect.timeout` (e.g. 15s → 45s), but an explicit `{ timeout: 15_000 }` override on an individual `expect(...).toBeVisible()` _negates_ that tripling, capping the wait at the literal value. Under heavy parallel CI load this causes intermittent failures even though the app and API are correct. When a test calls `test.slow()`, either omit per-assertion timeout overrides (let the tripled budget apply) or set them to the full tripled value (e.g. `45_000`). Prefer awaiting the gating network response (`waitForResponse` registered _before_ the triggering click) over a fixed wall-clock timeout.

## Locale timing after page reload

Do not use `page.waitForResponse(GET /api/users/me/preferences)` to gate assertions after `page.reload()` — the response may fire before `reload()` is called (from React's async post-load mounts), leaving the locale update unobserved. Use `await page.waitForLoadState('networkidle')` after `reload()` instead to ensure all async requests, including the preferences fetch, have settled before asserting on locale-dependent UI.

## Shard redistribution risk

Adding new spec files (especially `@responsive`-tagged ones with many tests) changes the Playwright shard distribution across all shards. Tests that were in a passing shard may move to a shard where they time out or race differently. After adding new spec files, re-run all shards on a main-targeted PR to confirm no previously-hidden timing failures surface in new shard positions.

## Stale CI ("E2E Cache Warmup cancelled")

If a PR shows "E2E Cache Warmup cancelled" in CI (QG fails even though all test/lint/docker jobs pass), the branch is stale relative to beta. Rebase onto the latest `origin/beta` and force-push to trigger a fresh CI run.
