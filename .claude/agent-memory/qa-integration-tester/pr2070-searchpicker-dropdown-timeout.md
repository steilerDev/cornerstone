---
name: pr2070-searchpicker-dropdown-timeout
description: Picker-family (SearchPicker/WorkItemPicker/HouseholdItemPicker/DependencySentenceBuilder/InvoicePaperlessPickerModal) tests took 20-40 s per test and timed out in CI — root cause was nwsapi 2.2.27 recursing on `:modal` (fixed in 2.2.28); profile first, bisect transitive deps too; plus durable jest gotchas found along the way
metadata:
  type: project
---

# Picker-family test slowness (PR #2070, issues #2076/#2077/#2078) — RESOLVED

**Root cause (found 2026-09-30 by `node --cpu-prof`, fixed on PR #2114):** `nwsapi` 2.2.27 —
jsdom 26's CSS selector engine, a _transitive_ dependency — resolves `:modal`/`:fullscreen` via
`matchesNative()`, which calls `node.matches`, which in jsdom _is_ nwsapi again. It recurses until
the stack overflows, the `try/catch` swallows it and returns `false`. Net effect:
`element.matches(':modal')` cost **~281 ms per call** (plain selectors: 0.01 ms). `@floating-ui`'s
`isTopLayer()` calls `matches(':modal')` on every `computePosition`, so every SearchPicker dropdown
open burned tens of seconds of CPU. nwsapi 2.2.28 fixes it (0.09 ms/call). The 11 picker-family
files (167 tests) went from ~4,300 s of CI time to ~20 s locally.

It arrived with Dependabot commit `038a9431` (2026-09-07, nwsapi 2.2.24 → 2.2.27) — exactly when the
#2070 timeouts started. The original bisection downgraded jest / jest-environment-jsdom /
@testing-library but **not nwsapi**, so it wrongly "proved" the bump innocent. Every theory built on
that (CI runner ~1.8x slower, real-timer scheduling, worker contention, fake-timer conversion) was a
symptom of the same bug and is withdrawn.

**Why / how to apply:**

- **Profile before theorising.** One `node --cpu-prof --cpu-prof-dir=<dir> --experimental-vm-modules
node_modules/.bin/jest <file> -i -t '<one test>'` plus a self-time-by-package tally of the
  `.cpuprofile` found this in minutes after weeks of timeout/worker/timer experiments.
- **A dependency bisection must cover the full lockfile diff, including transitive packages**
  (`git diff <before> <after> -- package-lock.json`, or restore the whole old lockfile), not just
  the direct packages named in the Dependabot title.
- **A test that is "slow but green" in jsdom is a bug signal**, not a timeout-tuning problem. Do not
  raise `testTimeout` to absorb it.
- If picker-family tests regress to multi-second-per-test again, first check
  how long `el.matches(':modal')` takes under the installed jsdom/nwsapi (from the repo root:
  `node -e "const d=new (require('jsdom').JSDOM)('<p>').window.document;console.time('m');d.body.matches(':modal');console.timeEnd('m')"`
  — healthy is ~2 ms for this first, compiling call; the bug measured ~280 ms).
- jsdom 27+ replaces nwsapi with `@asamuzakjp/dom-selector`, but `jest-environment-jsdom` 30.x
  still requires `jsdom ^26.1.0` — we stay on nwsapi until Jest moves.

## Durable jest gotchas found during the investigation (still valid)

- **`projects[].testTimeout` is a silent no-op in jest-circus** — it only reads
  `globalConfig.testTimeout`, so set it at the top level of `jest.config.ts` (or `--testTimeout`).
- **Debounce vs query-agnostic mock race** (HouseholdItemPicker.test.tsx): with a mock that returns
  the same items for any query, a `waitFor` on the rendered result can pass after the first
  keystroke's debounce, before the full-query call. Assert the mock call (with the full query)
  inside `waitFor` instead.
- **Run jest from the repo root.** `npx jest <file>` from inside `client/` picks up a different
  transform and fails on `import type * as X` with a Babel parser error.
- The fake-timer idiom (`jest.useFakeTimers()` + `userEvent.setup({ advanceTimers:
jest.advanceTimersByTime.bind(jest) })`) already applied to the SearchPicker/WorkItemPicker/
  HouseholdItemPicker suites is fine to keep, but it was never the fix — don't mass-convert other
  suites for performance reasons.
