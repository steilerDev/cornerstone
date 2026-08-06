---
name: issue-1950-derived-ceiling-guard
description: Issue #1950 (test-only guard for MAX_SAFE_USAGE_CHUNK_CHARS' derived Ѹ ceiling) — the char/line/pt derivation formula, continuation-row marker arithmetic, and a stale-AC discovery (MAX_SAFE_SMALL_CHUNK_CHARS no longer exists, removed 3 days before the issue was filed)
metadata:
  type: project
---

## Status: DONE (2026-08-06, branch `test/1950-usage-chunk-ceiling-guard`)

Test-only, zero production changes (verified byte-identical after 5 separate mutate/restore
rounds — see below). Added to `client/src/lib/reportPdf/overviewPdf.test.ts` (new describe block
`Issue #1950: derived Ѹ ceiling guard...`) and `client/src/components/reports/
ReportContentEditor.test.tsx` (new describe block `#1950 AC2: usageText input cap...`).

## The derivation formula (AC 1.1/1.2, computed not re-typed)

```
USOK_ADVANCE_EM = 1.1611          // Ѹ U+0478's measured per-em advance at 8pt/9pt — a SCANNED
                                    // glyph metric from #1939's comment, not derivable from any
                                    // geometry constant; pinned as a literal, same status as the
                                    // measured line budgets below.
perLineChars(fontSize) = floor(USAGE_WIDTH_7COL / (fontSize * USOK_ADVANCE_EM))
  -> 8pt: floor(138.28 / 9.2888) = 14
  -> 9pt: floor(138.28 / 10.4499) = 13

MEASURED_LINE_BUDGET_8PT = 44     // pinned literal (AC 1.6) — real-render page-height measurement
MEASURED_LINE_BUDGET_9PT = 39     // pinned literal (AC 1.6)

derivedCeiling(fontSize, lineBudget) = perLineChars(fontSize) * lineBudget
  -> 8pt: 14 * 44 = 616
  -> 9pt: 13 * 39 = 507
```

Cross-check (also guards `DEFAULT_LINE_HEIGHT`, which the char-ceiling formula above never touches):
`lineBudget * fontSize * DEFAULT_LINE_HEIGHT` reproduces the ~492.8pt/~491.4pt figures from
`MAX_SAFE_USAGE_CHUNK_CHARS`'s own doc comment exactly (44*8*1.4=492.8, 39*9*1.4=491.4).

## Base-row overage (AC 1.3/1.4) vs. continuation-row overage (orchestrator carry-forward from #1940)

Base row: `overageChars = 650 - 616 = 34`; `overageLines = ceil(34/14) = 3`; `overagePt = 3*8*1.4 =
33.6`.

Continuation row: `buildUsageCell()` (overviewPdf.ts) prepends a literal `'… '` (U+2026 + space, 2
chars) to every continuation row, and it is deliberately never counted against
`MAX_SAFE_USAGE_CHUNK_CHARS` (comment: "never counted against packUsageCellRowsWithMinimum's
character budget"). The KEY INSIGHT for reproducing the orchestrator-supplied 36/4/44.8 figures:
`continuationOverageChars = baseOverageChars + 2 = 36` is simple addition, but
`continuationOverageLines` is **not** `ceil(36/14)` (which would still be 3 — 36 and 34 land in the
same line-bucket under naive division). It's `baseOverageLines + 1`, justified as a sound
worst-case bound because the marker (2 chars) is strictly shorter than one full line's capacity
(14 chars): shifting a line-packed run by fewer characters than its own per-line capacity can cross
**at most one** additional line boundary. `continuationOveragePt = 4*8*1.4 = 44.8`. Verify the
`markerChars < perLineChars` precondition explicitly in the test — it's what makes "+1 line" sound
rather than a guess.

**Lesson for any future overage-in-lines computation**: don't assume `ceil(overageChars /
perLineChars)` is linear in small character additions — discrete line-packing means a K-character
insert (K < perLineChars) contributes AT MOST +1 line, never `ceil(K/perLineChars)` scaled against
the existing overage independently. Recompute overage lines from the boundary-crossing argument,
not by re-dividing a modified numerator.

## Stale AC discovery: MAX_SAFE_SMALL_CHUNK_CHARS no longer exists

Issue #1950's AC 1.5 asks to assert `MAX_SAFE_SMALL_CHUNK_CHARS` (450) stays below its derived 507
ceiling. **That constant was already deleted from production** by PR for #1959 (commit `3cc89676`,
merged 2026-08-03 — 3 days before this issue was filed 2026-08-06), along with
`SMALL_SAFE_TOKEN_CHARS_7COL/_6COL` and `SMALL_WORST_CASE_CHAR_WIDTH_PT` — see
[[pr-1959-inline-meta-content-loss]]. `overviewPdf.ts`'s own `MAX_SAFE_USAGE_CHUNK_CHARS` doc
comment documents the removal explicitly ("#1929 round 4's separate 9pt ceiling ... was removed
with those rows ... must not be reinstated as-is") and `pageGeometry.ts`'s `TABLE_SMALL_FONT_SIZE`
comment independently confirms it ("NOT the Usage column ... Nothing in the Usage column is 9pt").
The existing `overviewPdf.test.ts` file already only has a 704-ceiling test (not 546) — confirming
the 546/450 test pair was deleted along with the constant, not merely renamed.

**Handled by**: keeping the derived-507 computation (still guards `TABLE_SMALL_FONT_SIZE` drift per
AC 1.7, still documents the historical #1929-round-4 measurement other comments reference), but
replacing the literal AC 1.5 assertion with an `it.todo(...)` plus an explanatory comment, and
flagging the discrepancy prominently in the session report rather than fabricating a constant that
was deliberately removed. **General lesson**: an issue can be stale on arrival even when filed the
same day/week as the code it's guarding — always grep the target file for the literal constant
name an AC references before writing the test; don't trust the issue body's premise, especially
when a linked/adjacent PR (#1959 here) touched the exact same file after the issue's source
material (round-3 review of PR #1948) was written.

## #1941 coupling invariant (AC2) — avoided needing a production export

Issue text anticipated needing to export `USAGE_TEXT_MAX_LENGTH` from `ReportContentEditor.tsx`
(module-private) and said to flag it rather than do it myself. **Found a way to avoid the
production change entirely**: `EditableField.tsx` forwards `maxLength` straight onto the native
`<textarea maxLength={...}>` DOM attribute, so the *rendered* `maxlength` attribute IS the real
runtime value — readable via `usageField.getAttribute('maxlength')` after `renderEditor()`, the
exact technique the pre-existing #1941 test (`ReportContentEditor.test.tsx` ~line 1791) already
uses to pin it at `'500'`. Compared that against `usageChunkCharsForWidth(USAGE_WIDTH_7COL)`
(imported from `overviewPdf.ts`) directly in `ReportContentEditor.test.tsx` — satisfies "the
assertion belongs on the editor side" without inverting any dependency and without a production
diff. Verified discriminating via mutation (temporarily set `USAGE_TEXT_MAX_LENGTH` to 700 in
production, confirmed failure with the custom message, reverted).

**Reusable pattern**: before flagging "need a production export to test X," check whether X is
already observable through real rendered DOM output (attributes, text content) — a controlled
component often makes its internal constants indirectly observable without any export.

## Mutation-proof technique (AC 1.7) — reused the backup/restore pattern from #1929 round 2

See [[story-1929-round2-real-render-technique]] for the general technique. This round: `cp` each
production file to `/tmp/backup-1950/` once, then for each of the 4 named constants
(`USAGE_WIDTH_7COL`, `TABLE_BODY_FONT_SIZE`, `TABLE_SMALL_FONT_SIZE`, `DEFAULT_LINE_HEIGHT`) plus
`USAGE_TEXT_MAX_LENGTH` (the #1941 coupling): edit the source constant directly (append `+ 10` or
bump the literal), re-run only the new describe block (`-t "Issue #1950"` / `-t "1950"`), confirm
failures with the expected custom messages, then `cp` the backup back and `diff` to confirm
byte-identity before moving to the next constant. All 5 rounds confirmed the guard fires; final
`git status --short` showed only the two test files modified.

Related: [[pr-1959-inline-meta-content-loss]], [[story-1929-round2-real-render-technique]],
[[story-1923-report-table-cleanup]]
