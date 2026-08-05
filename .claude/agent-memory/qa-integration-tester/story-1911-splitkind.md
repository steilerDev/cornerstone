---
name: story-1911-splitkind
description: Issue #1911 (splitKind field) test coverage — server derivation trap tests, client flag-rewrite ripple across 6 files, AC1.2 anti-vacuity git-stash proof
metadata:
  type: project
---

## What landed (implementer's diff, not mine)

- `shared/src/types/sourceReport.ts`: new **required** `SourceReportInvoice.splitKind: 'lines' | 'deposits' | 'both' | null`.
- `server/src/services/sourceReportService.ts` step f: UNION query gains an `origin` literal per arm
  + two `MAX(CASE...)` conditional aggregates (`has_foreign_line_source`/`has_foreign_deposit_source`),
  same `db.all` call, `COUNT(DISTINCT source_id)` untouched as the `isSplit` basis.
- `client/src/lib/reportContent/buildReportContent.ts`: pre-pass rewritten — `isSplit`/`isDepositReduced`
  driven purely by `splitKind` (`'lines'|'both'` / `'deposits'|'both'`); `isDeposit`'s trigger is
  UNCHANGED (`invoice.isSplit(raw) && hasOwnTaggedDeposit`) — the old `if/else` between constituted
  and reduced is gone, so `isDeposit` and `isDepositReduced` can now co-occur (§3.4 mixed case).

## The trap (AC 1.5) — pin this in any future touch of the step-f query

The predicate is **"this arm contains a source ≠ S"**, NOT "this arm contains ≥2 distinct sources".
AC 1.2's shape (lines all in A, one deposit tagged to B) has exactly ONE source per arm (`{A}` in
the line arm, `{B}` in the deposit arm) yet must resolve to `splitKind: 'deposits'`. A naive
"count distinct sources per arm" implementation returns `null` here and silently reproduces the bug.
Test: `sourceReportService.test.ts` "AC 1.5 (the trap)".

## AC 1.9 regression-guard mechanism (UNION dedup)

Adding the `origin` column to each UNION arm **defeats UNION's cross-arm row dedup** — a source
appearing in BOTH arms (e.g. S has both a budget line AND a tagged deposit, both tagged to S) now
yields two rows (`(S, 'line')` and `(S, 'deposit')`) instead of collapsing to one. `COUNT(DISTINCT
source_id)` must stay the `isSplit` basis (not `COUNT(*)` over the subquery) or this fixture flips
`isSplit` from false to true. Fixture: source S has both a line AND a tagged deposit, both tagged S,
nothing else → `isSplit === false && splitKind === null`.

## AC 1.8 round-trip proof technique (drizzle `sql`` introspection)

`jest.spyOn(db, 'all')` with **no** `.mockImplementation` is a genuine pass-through (jest's default
spy behavior calls through to the real method) — proves "same statement, not a second query" without
faking the DB layer. To find the step-f call among all `db.all` calls without a real SQL-to-string
API (`SQL.toQuery()` throws without dialect config), reconstruct static text from drizzle's internal
`SQL.queryChunks` array: string segments are `{ value: string[] }`-shaped, bound params appear as
raw (unwrapped) values interleaved — join only the string-chunk `.value` arrays, skip everything
else, and check the result contains a literal from the query (`'split_data'` in this case, which
never straddles an interpolation boundary in the source).

## Client-side ripple: `splitKind` isn't just a factory default — it changes WHICH tests are real

Adding `splitKind: null` to a `SourceReportInvoice` factory default is not cosmetic. Any pre-existing
test that constructed `isSplit: true` + `budgetLines`/`deposits` shapes to drive the OLD
`isSplit && budgetLines.length>0` / `isSplit && deposits.length>0 && !tagged` gates goes **vacuously
green with the wrong assertions silently passing** — or breaks outright — because those gates are
gone. Found and fixed 9 broken pre-existing tests this way, entirely OUTSIDE the "add splitKind"
checklist item, by just running the file after the factory-default edit and reading every failure:

- `buildReportContent.test.ts`: the whole `describe('isSplit / isDepositReduced / isDeposit flags')`
  block (rewrite, not append) AND the whole footnote/legend describe block below it — both drove
  behavior from `isSplit`+array-shape, both needed `splitKind` on every fixture. One test's assertion
  was **exactly backwards** post-fix (`isSplit=true, budgetLines:[], deposits:[]` used to assert
  `isSplit(row)===false`; post-#1911 with `splitKind:'lines'` it must assert `true` — this is the
  explicit AC 3.1 zero-contribution-line regression case, not a mistake to "fix back").
- `realRender.test.ts`: 5 pre-existing tests broke (`makeMixedReport`'s two line-split fixtures needed
  `splitKind:'lines'`; `makeUsageFeatureReport`'s "Reduced Vendor" fixture used an UNTAGGED deposit
  to drive `isDepositReduced` — that's now the AC 3.2 *over-inclusive* bug shape and must NOT fire;
  rewrote it to `splitKind:'both', deposits:[]` to preserve the original test's intent (this ONE
  fixture alone produced both legend entries under the old code) without relying on the now-fixed
  bug to do it; two `#1980` legend tests needed the same treatment). Also proactively fixed 2 more
  "worst-case content" fixtures that DIDN'T fail (column widths are content-independent since #1929
  round 3, so a missing `splitKind` doesn't break an assertion there) but WOULD silently under-render
  their documented "worst case" intent without it — worth doing when found, not just when red.
- 4 files needed **only** the factory default (`isSplit:` literal always paired 1:1 with a
  `splitKind:` default, no fixture-specific overrides anywhere in the file): `reportExclusions.test.ts`,
  `reportPdf/merge.test.ts`, `ReportInvoiceList.test.tsx`, `shared/reportMath.test.ts`.
- `ReportWizardPage.test.tsx`/`.aiGeneration.test.tsx`: 10+2 raw literals, all `isSplit: false,`
  immediately followed by `documents: [],` — safe to batch-fix with a scoped `perl -pi -e
  's/^(\s*)isSplit: false,$/$1isSplit: false,\n$1splitKind: null,/'` on just these two files (verified
  every match was this exact shape via grep count parity with the spec's line list before running it).
- CONFIRMED NOT needing changes (verified via `makeRow`/type import inspection, not just doc trust):
  `ReportContentEditor.test.tsx`, `overviewPdf.test.ts`, `applyAiContent.test.ts`,
  `applyOverrides.test.ts` — all build `ReportContentRow` (client-only content-model type with its
  own unrelated `isSplit` boolean), never `SourceReportInvoice`.

## AC 1.2 anti-vacuity verification (git-stash technique, [[story-1929-round2-real-render-technique]])

Both the `buildReportContent.test.ts` AC1.2 test and its own AC5.5 mutation test were verified via
`git show HEAD:<file> > <file>` (production files were uncommitted working-tree changes, so `HEAD`
IS the pre-#1911 code — no need to find a prior commit). 9 of 70 tests in the file genuinely failed
against the reverted code, including the AC1.2 headline test itself (`isDepositReduced: Expected
true, Received false`) — confirms these are not vacuous. Restore via `cp` from a `/tmp` backup taken
before the swap, re-run to confirm 70/70 green again.

## Gap found in review: a green Jest run is NOT proof a new required field was threaded everywhere

Review round found `client/src/pages/ReportWizardPage/wizardReducer.test.ts`'s `makeInvoice` factory
(untouched by my diff, not in the spec's file list) still missing `splitKind` — a real
`tsc --noEmit -p client/tsconfig.json` break (TS2741), invisible to `npx jest` because **ts-jest
runs no type diagnostics in this repo**. All 495 tests were green and coverage was accurate; the
build was still broken. Grepping the spec's named files for `isSplit:` is not a substitute for a
compiler sweep when a shared type gains a required field — the compiler enumerates every
construction site, a targeted grep only finds the ones you already thought to look for.

**Action for future stories that add a required field to a shared type**: after finishing the test
sweep, run `npx tsc --noEmit -p client/tsconfig.json` and `-p server/tsconfig.json` as a final check,
scoped to "does this introduce any error in a file this PR touches or any file that constructs the
changed type" — do not judge by the raw error count alone, since a worktree can carry pre-existing
unrelated errors. In this case both projects came back fully clean (0 errors) after the one-line fix
(`splitKind: null,` next to `isSplit: false,`), so whatever pre-existing error count the coordinator
warned about didn't materialize for this run — but the scoped-check discipline is the reusable
lesson, not the specific number.

## Coverage

`sourceReportService.ts`: 100% stmts/lines/funcs, 93.75% branch (whole-file; the new splitKind lines
269-317 are 100% branch-covered themselves — the uncovered branches are pre-existing, unrelated
`markInvoicesClaimed`/Rail-B-metadata defensive paths at lines 233-237/372/437/458/462/609/688).
`buildReportContent.ts`: 100% stmts/lines/funcs, 97.54% branch.
