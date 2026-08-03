---
name: pr-1959-inline-meta-content-loss
description: PR #1959 (report PDF UX) reintroduced and then fixed the #1929 round-4 PDF content-loss regression; records the packUsageCellRows bound, the measured page-count saturation table, the it.failing tripwire technique AND the trap that nearly disarmed it (a helper that bakes in the buggy assumption), and the run-index gotcha for grey meta runs
metadata:
  type: project
---

# PR #1959 — inline meta content loss: the defect, the fix, and the tripwire trap

## Status: RESOLVED (2026-08-03, branch `fix/1959-pdf-ux-green`)

Production is fixed; the guard tests are normal `it` again. Everything below is the reusable lesson.

## The defect

`overviewPdf.ts` `buildOverviewContent` appended `areaText`/`attachmentsNote` as ONE **unchunked**
grey run on a usage-chunk row's cell. With `table.dontBreakRows: true` pdfmake does not paginate an
over-tall row — it measures the text and then **silently drops** whatever doesn't fit. #1929 round 4
had bounded exactly this by giving each field its own chunked continuation row; #1959's inline move
removed the bound without replacing it.

**Why it happened:** the PR body asked for inline rendering and the implementer took it literally
without re-bounding the *combined* cell height. `attachmentsNote` has no maxLength anywhere (editor
or server) and `areaText` is aggregate-unbounded across N leaf areas, so ordinary user data reached it.

**Measured evidence** (real unmocked renders, production 6-column shape). Rendered *line* count kept
growing linearly (~0.023 lines/char) while page count saturated — proof pdfmake measured everything
then discarded it:

| chars | usageText (chunked) | attachmentsNote — before fix | after fix |
| --- | --- | --- | --- |
| 2000 | 6 rows / 2 pages | 3 rows / 3 pages | 6 rows / 2 pages |
| 4000 | 9 rows / 3 pages | 3 rows / **2** pages | 9 rows / 3 pages |
| 8000 | 15 rows / 5 pages | 3 rows / **2** pages | 15 rows / 5 pages |
| 16000 | 27 rows / 9 pages | 3 rows / **2** pages | 27 rows / 9 pages |

Page count was even non-monotonic (3 → 2 as content grew). Reproduces the architect's original tell
verbatim: "rows requiring 3 and 9 pages both rendered as 2".

## The fix, and what it changed for tests

`packUsageCellRows(segments, maxChars)` packs the cell's **whole** content stream (prose, then the
grey meta segment) into per-row groups of ≤ `MAX_SAFE_USAGE_CHUNK_CHARS`. Lossless; byte-identical
output when the whole cell fits one row (the dominant case).

Two consequences tests must encode, not work around:

1. **The suffix now lands on the LAST row, not the first.** Pinning it to row 0 rendered grey meta
   mid-prose with more usage below it, and shrank the prose's chunk boundary (adding rows).
2. **The suffix can span many rows** — one grey run per row, always last within its own cell. So
   reconstructing it means concatenating the grey run of *every* row in the group.

`MAX_SAFE_SMALL_CHUNK_CHARS` and `SMALL_SAFE_TOKEN_CHARS_7COL/_6COL` were 9pt ceilings for the
continuation rows that no longer exist; the meta renders at 8pt `tableCell`, so the usage budget is
the right one. All three (plus the orphaned `SMALL_WORST_CASE_CHAR_WIDTH_PT`) were deleted along with
their imports and value-only tests. `TABLE_SMALL_FONT_SIZE` stays — `PDF_STYLES.small` still renders
footnotes, cover-letter date/reference lines, and the running header/footer.

## Technique: `it.failing` as a tripwire for a known-open production defect

Jest 30 here supports `it.failing` / `test.failing`. It is the right primitive when QA must leave a
suite green but must not bless broken behaviour: the suite reports **passed** while production is
broken, and the moment production is fixed Jest errors with `Failing test passed even though it was
supposed to fail`, forcing a flip back to `it`. Verify the guard is live by temporarily relaxing its
threshold and confirming that error appears.

### The trap that nearly disarmed it — check this every time

**A tripwire is worthless if a shared helper bakes in the very assumption the bug lives in.** Here
`renderCellScopeRow` derived its expected row count from `usageText` alone — i.e. it asserted "the
meta never adds rows", which is precisely what the bug did. Any correct fix *must* add rows, so the
helper threw on its own row-count assertion before the test reached its page-count assertion: the
test failed for the wrong reason and `it.failing` stayed green through the fix.

Rules that follow:
- Derive expected shape from the **same function production uses** (here `packUsageCellRows`), never
  from a re-derivation of one input channel.
- Assert losslessness and budget bounds against the **INPUT and the declared constant**, never
  against the packer's own output — otherwise a packing regression satisfies them by moving in step.
- After flipping a tripwire, confirm it passes **on its own assertion**, not merely that the suite is
  green.

## Strongest formulation found: channel equivalence

The assertion that needed no calibrated threshold and is immune to future layout tuning:
**the same text costs the same number of pages whichever channel carries it** (`usageText` vs
`attachmentsNote`). Pre-fix this failed spectacularly (9 pages vs 2 at 16,000 chars). Pair it with a
per-channel losslessness check first, so "same page count" can't be satisfied by both channels
dropping equally.

Related: tree-level assertions **cannot see this bug class at all** — the dropped text is present in
the pdfmake content tree while the reader receives a truncated PDF. Where the claim is about what the
reader receives, assert against rendered output (page count).

## Gotcha: the grey meta run is never at a fixed run index

`buildUsageTextRuns()` tokenizes prose into **one run per whitespace-delimited token**, so a cell's
`.text` for `'Kitchen work'` is `[{text:'Kitchen'},{text:' '},{text:'work'}]` and the meta run is at
`text[3]`, not `text[1]`. Locate it by its colour (`#6b7280` = `DEPOSIT_NOTE_TEXT_COLOR`), assert it
is **last within its cell**, and reconstruct prose from the runs before it — see `splitUsageCell()`
in both `overviewPdf.test.ts` and `realRender.test.ts`. Note the production code strips the leading
`'\n'` when the suffix *starts* a cell (its own continuation row), so keep both a raw and a stripped
accessor for faithful cross-row concatenation.

## Environment gotcha: `grep` silently returns nothing on these test files

After `npx prettier --write`, `grep` (even `grep -c ""`) on `overviewPdf.test.ts` and
`ReportContentEditor.test.tsx` returns **no output and no error** — binary-content detection on some
byte sequence. This produced a false "constant is unused" conclusion mid-task. Use
`awk '/pattern/{print NR": "$0}' file` instead whenever a grep result on a report-PDF test file looks
suspiciously empty. `npx eslint` is the reliable authority on unused imports.

Related: [[test-infra-reference]], [[story-1929-round2-real-render-technique]],
[[story-1923-report-table-cleanup]], [[story-1898-report-table-refinements]]
