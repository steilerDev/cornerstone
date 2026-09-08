---
name: pr2070-searchpicker-dropdown-timeout
description: WorkItemPicker/InvoicePaperlessPickerModal/HouseholdItemPicker tests exceeding jest's 5000ms default (or racing a real debounce) on the SearchPicker dropdown-open/type interaction — bisection method, the jest-circus per-project testTimeout gotcha, a genuine debounce-assertion race; issue #2076's fake-timer conversion (applied as safe-but-unproven, NOT a proven mechanism — the earlier "control group" causal inference was withdrawn after a full-file A/B found no timing difference) plus the still-open ~21s-per-test CPU cost and the cpu-prof diagnostic for #2077
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

**CORRECTION (issue #2076, superseding the Verdict above)**. The "legitimate slowness, nothing to
fix beyond raising the ceiling" verdict was wrong. The same two files hit the raised 60000ms ceiling
again on the next promotion (PR #2075: shard wall-clock 8→26→45 min run-over-run with **no code
change between runs** — a real dependency regression would step once and stay flat, not worsen
monotonically). One finding below is solid (rules out the dependency bump, again); the other was an
inference that a later measurement overturned — recorded here in full, including the withdrawal,
because this file has now over-claimed a fix twice (#2070's "legitimate slowness, nothing to fix"
above, and the control-group inference below) and a third time is not acceptable:

1. **Fake-timer control group inference — WITHDRAWN, see the A/B measurement below.** The original
   argument was: `SearchPicker.test.tsx`'s two pre-existing fake-timer tests (the 300ms-debounce
   tests) mount the same `FloatingPortal` for the first time as the failing real-timer tests and
   have never failed, so the cost must be real-timer scheduling latency, not CPU, and fake timers
   should collapse it. **A full-file A/B measurement (below) falsifies this.** If fake timers
   collapsed the dominant cost, the fully-converted file would be dramatically faster than the
   unconverted one. It isn't — both run in the same ~1290-1352s band. So the two control tests were
   never "immune" to a real cost; they simply never happened to cross a 60000ms ceiling that ~51 of
   their real-timer siblings also never crossed locally. That is a two-sample coincidence, not
   evidence of a mechanism. **Do not cite the control group as proof of anything going forward.**
2. **Binary diff of the two `user-event` tarballs (14.6.1 vs 14.6.7)**, run independently of the
   #2070 bisection above: the only substantive `dist/esm` changes are a key-repeat flag in
   `keyboard/index.js` and a property-descriptor form change in `document/patchFocus.js`.
   `utils/misc/wait.js` is byte-identical and `delay: 0` is unchanged in `setup/setup.js` — no
   hot-path change capable of a 5x+ regression. This independently corroborates the #2070 bisection
   below: **the dependency bump was never the cause, confirmed twice by two different methods.**
   (This finding is unaffected by the withdrawal above — it rules out a dependency cause, it never
   claimed to establish that fake timers are the fix.)

**A/B measurement (#2076, the one that overturned finding 1 above)**. Full-file `SearchPicker.test.tsx`,
local `--maxWorkers=1`, unloaded (no concurrent jest process):

| Version | Result | Wall clock |
| --- | --- | --- |
| Original, unconverted (real timers) | 60/60 pass | 1331.6 s |
| Converted (fake timers), run 1 | 60/60 pass | 1290.7 s |
| Converted (fake timers), run 2 | 60/60 pass | 1352.0 s |

The unconverted file **passes locally** — the sandbox does not reproduce the CI failure at all, so
this A/B cannot even confirm the fix prevents the CI timeout, only that it costs the same wall clock
either way locally. The ~21s-per-dropdown-test cost (see per-test durations captured via
`--json --outputFile`, e.g. `after selection: input hidden...` at 31.5s, `FUI-2` at 28.8s) is
**CPU-bound and currently unexplained** — real timers vs fake timers made no measurable difference to
it.

**`pointerEventsCheck` probe**: a 4-test subset with fake timers alone ran in 110.9s; the same subset
with fake timers **and** `userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never })`
ran in 101.3s — a ~9% reduction. So the `getComputedStyle` ancestor walk that `pointerEventsCheck`
performs is a real but minor contributor, not the dominant term either. **`pointerEventsCheck: Never`
was rejected on correctness grounds, not just because the measurement was unimpressive**: it disables
`userEvent`'s check that the target element isn't `pointer-events: none` before interacting — turning
it off lets a test pass against a UI element a real user could not click. That is assertion-weakening
relocated into harness config, not a legitimate performance lever, and should not be reintroduced as
one even if profiling finds it saves more time elsewhere.

**The decisive next diagnostic (do this before any further theorizing, and before #2077 converts
anything else)**: run `node --cpu-prof` (or `--prof` + `node --prof-process`) around a single
dropdown-open test in isolation. 21s of CPU inside jsdom is enough that a `--cpu-prof` capture will
surface one or two dominant frames within minutes — that trace is what should drive the next fix,
not another inference from an in-file comparison. #2077 has been re-scoped from "convert the
remaining ~592 real-timer call sites" to "profile the 21s cost first," specifically because a
mechanical rollout would chase a benefit that is not yet shown to exist.

**Durable fix (#2076)**: convert the real-timer `userEvent.setup()` call sites in both files to the
fake-timer idiom (a local `setupUser()` helper per file — do not extract a shared helper into
`client/src/test/`, that would drag a `frontend-developer` trailer onto a test-only fix per CLAUDE.md
Delegation Enforcement rule 3). This is applied as **safe and plausibly sufficient, not as a proven
fix** — see the A/B measurement above; it does not regress correctness (fake timers don't skip any
check `pointerEventsCheck: Never` would) and it does not add cost, so it ships regardless of whether
it turns out to address the CI-specific failure mode. ~592 real-timer call sites remain across the
rest of the client suite; per the re-scoped #2077, those are not converted until the CPU cost is
profiled. `testTimeout: 60000` in `jest.config.ts` must stay until that work lands — do not lower it
as part of a scoped fix.

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

**#2076 extension round (2026-09-07, PR targeting v2.15.0 promotion) — two more files, plus a stale
task-premise finding:**

- Converted `WorkItemPicker.test.tsx` (10/10 `userEvent.setup()` call sites → local `setupUser()` +
  describe-level `afterEach(() => jest.useRealTimers())`, copied verbatim from
  `HouseholdItemPicker.breadcrumb.test.tsx`'s pattern). Green twice, 14/14, ~221s and ~220s.
- **`HouseholdItemPicker.test.tsx` (the non-breadcrumb file) needed NO changes** — it was reported to
  me as still failing in CI ("excludeIds filtering… 60s timeout, shard 6"), and `git log`/`git show`
  showed it had *already* been fully converted by a same-day Dependabot commit (`a468c0cf`, already an
  ancestor of both `origin/beta` and my branch — verified via `git fetch` + `git merge-base
  --is-ancestor`, not a local artifact). That commit used a *different* shape than `setupUser()`: a
  single shared `user` declared in the outer `describe` and assigned inside `beforeEach` alongside
  `jest.useFakeTimers()`, with the matching `afterEach(() => jest.useRealTimers())` — functionally
  equivalent (every real-timer call site removed, teardown present) but not the literal per-test
  helper shape. That same commit also added two explicit `act(() => jest.advanceTimersByTime(300))`
  calls to fix a *documented* debounce assertion-ordering race (see block above this one — the
  "premature debounce fire" bug). I left the file untouched rather than rewriting it to the literal
  `setupUser()` shape: doing so would mean stripping those two `advanceTimersByTime` calls to satisfy
  "don't add explicit `advanceTimersByTime`", which would reintroduce the race the other commit was
  written to fix. **That decision was correct, but my original justification for it was wrong and has
  been corrected**: I originally wrote this off as "no evidence of currently failing" on the strength
  of two local green runs. That is false. The file WAS failing in CI at `a468c0cf` itself — the very
  commit that fully converted it — on shard 6, `excludeIds filtering works: excluded items not shown
  in results`, a 60s timeout, in the promotion PR's latest run. The right justification for leaving it
  alone was never "it's healthy" — it was "conversion is already complete and further edits would
  reintroduce a fixed race for no gain," which holds regardless of CI health. See the correction below.
- **CORRECTION — "green locally" is not evidence of health for this failure mode.** The local sandbox
  never reproduces the CI timeout, converted or not: a full *unconverted* `SearchPicker.test.tsx` also
  passes locally, 60/60, ~1330s. My two local runs of `HouseholdItemPicker.test.tsx` (14/14 each,
  ~250s) proved nothing about its CI health — I should have said so, not implied the opposite. Anyone
  checking picker-suite timing health must read the actual CI run for the commit in question; a local
  `--maxWorkers=1` pass is not evidence, in either direction, for this specific failure class.
- **CORRECTION — fake timers are not the fix; do not let a future reader convert more call sites
  expecting it to resolve CI.** Tally from the promotion PR run at `a468c0cf`:

  | File | Converted on `beta`? | CI result |
  | --- | --- | --- |
  | `SearchPicker.test.tsx` | Yes, fully | 3 tests timed out |
  | `HouseholdItemPicker.test.tsx` | Yes, fully | 1 test timed out |
  | `WorkItemPicker.test.tsx` | No (until this round) | 1 test timed out |

  Two *fully converted* files still blew the 60s ceiling — conversion is neither necessary nor
  sufficient to fix this. Local `--maxWorkers=1` passes regardless of conversion state; CI's
  `--maxWorkers=2` fails regardless of conversion state. Worker count/CI concurrency is the variable
  that actually separates pass from fail here, and a CI-concurrency change is the real remedy being
  pursued, not further mechanical `userEvent.setup()` → `setupUser()` rollout. The fake-timer
  conversion still removes a genuine wall-clock dependency and is worth keeping, but this is now the
  third time this file's history has had to walk back an over-claimed fix (see the two earlier
  corrections above) — do not add a fourth. Converting `WorkItemPicker.test.tsx` in this round was
  still worth doing (removes real-timer scheduling, matches the established idiom, all assertions
  intact) — just don't expect it, on its own, to turn CI green.
- **Lesson**: when handed a "CI just failed on file X" task, check `git log -- <file>` (and
  `git merge-base --is-ancestor <suspect-commit> HEAD`) for that file *before* touching it — a fast-
  moving beta with concurrent Dependabot/dev-team-lead sessions can fix (or fail to fix — see above)
  the reported failure between the CI run that generated the report and the session that picks it up.
  Don't assume a file's current conversion state from the failure description; verify structurally
  (git history) — and verify CI health via the actual CI run, never a local run (see above).
- **Jest invocation gotcha (new, distinct from the worktree-node_modules notes below)**: running
  `npx jest <file>` from inside `client/` (rather than the repo root) silently picks up a different
  transform pipeline and fails on `import type * as X from '...'` with a raw Babel parser
  `SyntaxError`, not a helpful "wrong config" message. Always invoke from the repo root
  (`cd <repo-root> && NODE_OPTIONS=--experimental-vm-modules npx jest client/src/...`) so
  `jest.config.ts`'s `ts-jest` preset is what actually runs.
