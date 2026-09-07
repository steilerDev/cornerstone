---
name: pr2070-searchpicker-dropdown-timeout
description: WorkItemPicker/InvoicePaperlessPickerModal/HouseholdItemPicker tests exceeding jest's 5000ms default (or racing a real debounce) on the SearchPicker dropdown-open/type interaction — bisection method, the jest-circus per-project testTimeout gotcha, and a genuine debounce-assertion race distinct from the timeout issue
metadata:
  type: project
---

On PR #2070 (Dependabot dev-dependencies re-roll of #2056, jest bumped further to 30.5.1,
`@testing-library/react` 16.3.2→16.3.3, `@testing-library/user-event` 14.6.1→14.6.7), CI's real run
(shard 3/6) failed 8 tests in `WorkItemPicker.test.tsx` and 2 in `InvoicePaperlessPickerModal.test.tsx`
— all `"Exceeded timeout of 5000 ms"`, not assertion mismatches. `WorkItemPicker.test.tsx` alone took
315s server-side.

**Bisection method (the reusable technique)**: rather than trust the coordinator's leading hypothesis
(a `user-event` patch bump changing async/delay handling), I built a throwaway scratch copy
(`rsync --exclude=node_modules --exclude=.git` off an already-`npm install`-ed scratch dir, avoiding
this worktree's virtiofs-corrupted `node_modules`), then ran
`npm install --no-save --ignore-scripts @testing-library/react@16.3.2 @testing-library/user-event@14.6.1 jest@30.4.2 jest-environment-jsdom@30.4.1`
in it to downgrade JUST the suspect packages back to the pre-#2070 versions, and re-ran the same
failing files. **Identical failure — same 8 test names, same ~5000ms-per-test symptom, same overall
shape** — with the OLD versions. This is airtight proof the dependency bump did not cause the
regression; do not skip this step and jump straight to "fix the newer library's behavior."

**Root cause, found via `console.time` instrumentation** (temporarily added to a scratch copy of the
test, never committed): for the affected tests, `render()` and `waitFor()` were both fast (single-digit
ms); the entire delay (~23-30s, once observed needing ~45s) was inside the FIRST `userEvent.click()`
that opens the `SearchPicker` dropdown for the first time in that test (mounts
`@floating-ui/react`'s `FloatingPortal` + `useFloating`/`autoUpdate`). A SECOND click on an
already-open dropdown (e.g. selecting a result) was fast (~11ms) — so the cost is tied to the
first-time portal mount / dropdown-open transition, not to `userEvent.click()` in general or to a
per-event artificial delay (confirmed `userEvent`'s default `delay: 0`). Read `@floating-ui/dom`'s
`autoUpdate()` source directly (`node_modules/@floating-ui/dom/dist/floating-ui.dom.mjs`) to rule out
an actual infinite-loop bug: `elementResize` uses `typeof ResizeObserver === 'function'` (true here —
`setupTests.ts` polyfills a no-op `ResizeObserver`, so `.observe()` never fires a callback, can't loop);
`layoutShift` uses `typeof IntersectionObserver === 'function'` (false — jsdom doesn't provide one, so
that code path is skipped entirely); `animationFrame` defaults to `false` (no `requestAnimationFrame`
polling loop). The floating-ui code is properly guarded — this is not a floating-ui bug.

**Verdict**: legitimate, non-infinite slowness under this environment's real-timer/CPU-contention
characteristics (same class of issue as the pre-existing `workerGracefulExitTimeout: 2000` comment in
`jest.config.ts` — "the 500ms default is too tight in the resource-constrained sandbox"), not a hang
(proven: passing reliably at `--testTimeout=60000`, twice in a row) and not a functional regression
(proven via bisection). `WorkItemPicker.test.tsx` itself already carried a comment
(from #1270, before this PR) calling out these exact test names as having "pre-existing test
infrastructure failures" — this was a known-fragile spot before #2070 ever touched it.

**Fix, round 1 (superseded — see round 2)**: `jest.setTimeout(60000);` placed once near the top of
each file, not per-`it()`. Worked for these two files, but the SAME pattern then surfaced in two more
files in the NEXT CI shard (`DependencySentenceBuilder.test.tsx`, `HouseholdItemPicker.test.tsx`) —
systemic across all ~16 files that render the shared `SearchPicker`, not isolated to any one file.
Per-file whack-a-mole doesn't scale against CI-shard-by-CI-shard discovery.

**Fix, round 2 — the actual durable fix, and a real jest-circus gotcha**: raise `testTimeout` project-
wide via `jest.config.ts`. First attempt put `testTimeout: 60000` *inside* the `client` project entry
of the `projects: [...]` array (matching TypeScript's `ProjectConfig` type, which does list
`testTimeout`, and matching what a maintainer would naturally suggest — "add it to the client project
block"). **This silently does nothing at runtime** — verified: `--showConfig` correctly echoes
`"testTimeout": 60000` for the project, but the actual test run still failed at the old 5000ms. Root
cause, found by reading `node_modules/jest-circus/build/jestAdapterInit.js`:
```js
if (globalConfig.testTimeout) {
  getState().testTimeout = globalConfig.testTimeout;
}
```
jest-circus's test runner ONLY reads `testTimeout` off `globalConfig` (derived from the top-level
config keys / CLI flags), never off the per-project config, despite `testTimeout` being a documented
field on `ProjectConfig` too. **The fix must be at the top level of the main config object, outside
`projects: [...]`** (alongside `workerGracefulExitTimeout`) — this then applies to `server`/`shared`
too, not just `client`, which is an accepted trade-off (raising the ceiling can't slow down tests that
already finish well within it) since per-project scoping isn't achievable here. Removed the two
file-level `jest.setTimeout()` calls once the global default covered them (redundant, not harmful, but
cleaner without). Verified against the full ~16-file SearchPicker-family suite (409 tests): 408 passed
cleanly relying purely on the new global default, no `--testTimeout` CLI override needed.

**A third, DIFFERENT bug surfaced by that full-suite run — not a timeout, a genuine race**:
`HouseholdItemPicker.test.tsx`'s "shows item names in search results after typing" failed with a
value mismatch (`mockListHouseholdItems` called with `q: "S"`, not `q: "Sofa"`), not a timeout. Root
cause: the test types "Sofa" via `user.type()` (exercising `SearchPicker`'s real 300ms
`useDebouncedCallback` debounce, not the focus-triggered immediate-fetch path the other passing tests
use), then does `await waitFor(() => screen.getByText('Sofa'))` followed by a **synchronous**
(non-waited) assertion that the mock was called with the full query. The test's own
`mockListHouseholdItems.mockResolvedValue(...)` in `beforeEach` is query-agnostic — it returns the
same static `sampleItems` list (which includes a "Sofa" item) regardless of what `q` it's called
with. Under this environment's real-timer jitter (the same class of timing variance behind the
dropdown-open cost above), the debounce can fire prematurely after just the "S" keystroke — before
"o"/"f"/"a" arrive — and since the mock doesn't care what `q` was, that premature call ALSO renders
"Sofa" in the DOM, satisfying the `waitFor` before the real, full-query debounce call has fired. The
very next synchronous assertion then catches the mock mid-flight, still on its first (wrong) call.
Confirmed reproducible on demand (first attempt, deterministic in this environment) and confirmed the
debounce implementation itself (`client/src/hooks/useDebouncedCallback.ts`) is textbook-correct
cancel-and-restart — no production bug. **Fix (test-only, not a timeout bump)**: move the mock-call
assertion INSIDE the `waitFor`, alongside the DOM assertion, so the test waits on the condition it
actually cares about (the debounce settling with the full query) instead of treating a query-agnostic
mock's DOM output as a proxy for that. Verified reliable across 4 consecutive runs after the fix.

**Reusable lessons**:
1. When CI reports a bare timeout (not an assertion failure) right after a dependency bump, resist
   fixing the newer library's *behavior* before bisecting whether the bump is even the cause — a
   scratch `npm install --no-save <pkg>@<old-version>` for just the suspect packages is fast and
   conclusive. See also environment-setup.md for the virtiofs `node_modules` workaround this relied on.
2. `projects[].testTimeout` in `jest.config.ts` is a documented-but-non-functional no-op in jest-circus
   (30.5.x, likely all versions using this circus internals path) — always set `testTimeout` at the
   top level of the main config, never inside an individual project entry. `--showConfig` will NOT warn
   you; it happily echoes the ignored value back.
3. A bare "Exceeded timeout" failure and a "wrong value received" failure can share the exact same root
   cause (real-timer jitter under CPU contention) while requiring completely different fixes — one a
   timeout ceiling raise, the other a test-assertion-ordering fix. Don't assume every symptom from the
   same environmental cause needs the same treatment; diagnose each on its own evidence (bisect, trace
   the actual call sequence, read the mock setup) before choosing a fix.
