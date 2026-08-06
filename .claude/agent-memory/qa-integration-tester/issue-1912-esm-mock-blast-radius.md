---
name: issue-1912-esm-mock-blast-radius
description: New export added to a shared module broke a *different* test file's partial ESM mock than the one I checked — the blast radius is every test that mocks the module, not just tests for the file I changed.
metadata:
  type: feedback
---

Issue #1912 (report wizard code-quality follow-ups): `formatters.ts` gained a new named export
`toBcp47Locale`. `GanttHeader.tsx` started importing it (part of this PR's declared scope creep:
`CalendarView.tsx`/`MonthGrid.tsx`/`WeekGrid.tsx`/`GanttHeader.tsx` all switched from an inline
locale ternary to `toBcp47Locale`). I ran `GanttHeader.test.tsx` — it passed (that file doesn't
mock `formatters.js` at all, so it always got the real function). But CI's Shard 2 went red on
`GanttChart.test.tsx` — a *different* file, testing the *parent* component `GanttChart.tsx`, which
renders `GanttHeader`. `GanttChart.test.tsx` mocks `formatters.js` with a partial
`jest.unstable_mockModule` factory that didn't include `toBcp47Locale`.

**Why this fails at load time, not call time**: under ESM (`jest.unstable_mockModule`), when some
module in the graph does `import { toBcp47Locale } from '.../formatters.js'`, the loader links that
named binding against the *mock's* exports before any test code runs. A factory object missing the
property throws `SyntaxError: ... does not provide an export named 'toBcp47Locale'` during
`EsmLoader.tryLoadGraphSync` — the whole suite dies before one assertion executes. This is a
sibling failure mode to the `tsc`-driven-sweep lesson from #1911 (missing required *argument*,
caught by the compiler) — same shape, different mechanism: nothing catches an incomplete *mock*
except actually running the suite.

**Why my per-file check missed it**: "run the test file for the file I changed" is necessary but
not sufficient. The correct blast-radius question is "which test files mock the module that gained
the export, AND transitively render/import a consumer of the new export" — that set is *not* the
same as "tests named after files I touched."

**The mechanical check** (do this after adding *any* export to a shared module, not just
`formatters.ts`):
1. `grep -rlE "jest\.(mock|unstable_mockModule)\(['\"]\.\./*.*<module>\.js['\"]" client/src --include=*.test.ts*`
   — every test file that mocks the module at all (partial-mock candidates).
2. For the new export specifically, trace its production consumers: `grep -rln "<exportName>"
   client/src --include=*.tsx --include=*.ts | grep -v .test.` then walk one level of "who imports
   this consumer" (`grep -rl "from '.*<Consumer>"`) until you hit either (a) nothing new, or (b) a
   page/route boundary that nothing else imports.
3. Cross-reference: any file from step 1 whose subject-under-test is, or renders, a module found in
   step 2 is at risk. In this case: `GanttChart.tsx` → `GanttHeader.tsx` → `toBcp47Locale`, and
   `GanttChart.test.tsx` was the only step-1 file whose subject rendered that chain.
4. Fastest actual confirmation, cheaper than perfecting the static trace: just run *every* file from
   step 1 in one `npx jest <path1> <path2> ...` batch (absolute paths, `--maxWorkers=2`, no `$()`
   command substitution under the worktree bash-guard — spell the paths out literally). For this
   repo's `formatters.js`, that was 55 files across 3 batches (~635+747+471 tests), all green except
   the one fixed file — this is fast enough (under ~1 min/batch) to just always do instead of trusting
   the static trace alone.

**Fix pattern for the mock itself**: add the new export as a plain arrow function matching the
*style* of the file's other formatter-mock entries (this file used bare arrow functions for
`formatCurrency`/`formatDate`/`formatWeekdayMonthDay`, not `jest.fn()`) — mirror the real function's
behavior when cheap (`(locale) => locale === 'de' ? 'de-DE' : 'en-US'`), don't invent a different
mock idiom for just the new export.

See also [[test-infra-reference]] for the general ESM/jest conventions this project uses.
