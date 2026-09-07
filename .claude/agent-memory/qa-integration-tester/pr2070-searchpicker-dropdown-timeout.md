---
name: pr2070-searchpicker-dropdown-timeout
description: WorkItemPicker/InvoicePaperlessPickerModal tests exceeding jest's 5000ms default on the SearchPicker dropdown-open interaction — bisection method proving it's environment timing, not a code/dependency regression, and the fix (file-level jest.setTimeout)
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

**Fix**: `jest.setTimeout(60000);` placed once near the top of each file (after mocks, before the
top-level `describe`), not per-`it()` — simpler, and covers future tests added to the same
dropdown-opening pattern without needing to remember a third `it()` argument. Verified: 32/32 tests
pass reliably across 2 independent full runs of both files together with the file-level timeout (no
`--testTimeout` CLI flag needed). Files: `client/src/components/WorkItemPicker/WorkItemPicker.test.tsx`,
`client/src/components/invoices/InvoicePaperlessPickerModal.test.tsx`.

**Reusable lesson**: when CI reports a bare timeout (not an assertion failure) right after a dependency
bump, resist fixing the newer library's *behavior* before bisecting whether the bump is even the cause
— a scratch `npm install --no-save <pkg>@<old-version>` for just the suspect packages is fast and
conclusive. See also environment-setup.md for the virtiofs `node_modules` workaround this relied on.
