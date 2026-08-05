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

## Post-merge review finding: AC 4.5's geometry test was vacuous on both assertions — read ADR-034 first

PR #2015 review (product-owner + product-architect) found the AC 4.5 four-run-row test I wrote could
not fail on either assertion, and it was **already documented**: the wiki's `ADR-034` Deviation Log
(2026-08-05 entry, filed off PR #2008's own mutation testing) states `maxHorizontalRatio(pdfContent)
<= 1` is **proven vacuous on production content** in this exact table — every column is a fixed,
content-independent width (#1929 round 4 removed the last `'*'`), so `horizontalRatio` (recorded at
each rendered line's START x) can never move regardless of content width; it only detects a
mispositioned COLUMN, never an overflowing CELL. Always read an ADR's Deviation Log before writing a
geometry assertion in `realRender.test.ts` — the falsifiable form for this exact risk class is
already prescribed there (`ADR-034-Client-Side-Report-PDF-Generation.md`, "Testing requirement: real
renders, not mocks" section, rule #1): per-cell `_minWidth <= widths[i]._calcWidth`, read AFTER a real
render — `_minWidth` is pdfmake's own post-render measurement of the widest atom `TextBreaker` could
not further break, so it is a genuine OUTPUT value, not something the test supplies.

The SECOND assertion ("all four labels present, read from `cell.text`") was independently broken for
a different reason: pdfmake never modifies `.text` during render (only annotates `_minWidth`,
`positions`, etc. onto the same objects) — reading `.text` post-render observes exactly what the test
itself constructed, so it can never detect a drop/clip/wrap. Fixed with a **differential** check using
`.positions.length` (a real per-render line count, written by pdfmake during layout): render the
maximal 4-label fixture and a reduced 3-label comparator (same fixture, `splitKind: 'both'` →
`'deposits'`, which removes exactly the split label) side by side, and assert
`maximal.positionsLength > reduced.positionsLength`. If a code change silently drops a label from the
maximal row, the two renders become indistinguishable and the inequality collapses — this is what
actually caught the mutation (see below), not a hand-derived absolute line-count ceiling.

**Mutation-testing proof (both checks), git-diff-verified restore:**
- Backed up `overviewPdf.ts` to `/tmp` before either mutation (this file is NOT part of my PR's diff
  — it's already-committed code from #1959/#1973, so `git diff --stat` after restore showing nothing
  is the correct "byte-identical" signal here, not `git show HEAD:`).
- Mutation 1 (overflow): merged the `isDeposit`/`isSplit` label pushes into one run joined by a
  (accidentally-real, not hand-typed) NBSP — 2 of 4 `it.each` cases (both DE) went red at 113.6pt vs
  the 75pt column, confirming `_minWidth <= _calcWidth` is genuinely sensitive to an unbreakable atom
  exceeding the column. EN stayed green because the merged EN label pair happens to still fit under
  75pt — expected and fine; the proof only needs at least one genuine failure, not all four.
- Mutation 2 (drop): gated the `isSplit` label push with `&& false`. **All 4 `it.each` cases went red**
  — `positionsLength` collapsed to an exact equality (e.g. `Expected: > 4, Received: 4`) — directly
  confirming the differential check catches a silently-dropped label.
- Restored via `cp` from the `/tmp` backup after each mutation; `diff` against the backup and
  `git diff --stat`/`git status --short` both confirmed byte-identical before moving to the next step.

**Process lesson for any future geometry assertion in this file:** `maxHorizontalRatio` and reading
`.text` post-render are both natural-looking but WRONG defaults for "did this overflow/get dropped" —
the file already has two established, genuinely-falsifiable idioms for these two risk classes
(per-cell `_minWidth`/`_calcWidth` for overflow, `.positions.length`-based differential/ceiling checks
for drops) sitting in the same file (`'ADR-034 rule #1: horizontal-overflow...'` describe block,
`'#2003 usageText'`/`'#2003 areaText'` tests) — copy those idioms rather than reaching for
`maxHorizontalRatio` or a `.text` substring check on a new fixture.

## Coverage

`sourceReportService.ts`: 100% stmts/lines/funcs, 93.75% branch (whole-file; the new splitKind lines
269-317 are 100% branch-covered themselves — the uncovered branches are pre-existing, unrelated
`markInvoicesClaimed`/Rail-B-metadata defensive paths at lines 233-237/372/437/458/462/609/688).
`buildReportContent.ts`: 100% stmts/lines/funcs, 97.54% branch.
