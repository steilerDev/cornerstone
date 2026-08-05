---
name: story-2003-1980-overflow-legend
description: Horizontal-overflow helpers (#2003) and legend sentence occurrence tests (#1980) added to realRender.test.ts and buildReportContent.test.ts
metadata:
  type: project
---

Issues #2003 and #1980 (2026-08-05, PR `fix/2003-1980-realrender-overflow-legend-assertions`).

## What was added

**`realRender.test.ts` — two new module-level helpers after `cellPageNumber` (~line 263):**

- `collectHorizontalRatios(node, out?)` — recursively collects all `positions[].horizontalRatio` values from a rendered pdfmake Content tree. Only detects column-START overflow (left edge past the margin), not content-extent overflow.
- `maxHorizontalRatio(pdfContent)` — returns `Math.max(...ratios)`; throws if called before the render. Used ONLY in the revert-test (column-start overflow scenario); not used in production-content assertions.

**`realRender.test.ts` — describe `'ADR-034 rule #1: horizontal-overflow via _minWidth <= _calcWidth (issue #2003)'` (after the last `});` at EOF):**

- Revert-test: `widths: [600, 50]` forces column 2 past the right margin → `maxHorizontalRatio > 1`. Proves the helper detects column-START overflow.
- it.each usageText (claim/budget-overview × en/de): `applyOverrides({..., 'row.inv-normal.usageText': 'W'.repeat(30)})` → `usageCell._minWidth <= usageCalcWidth` (via `calcWidthsOf(table.widths)`). Falsifiable: removing `wordBreak: 'break-all'` from `buildUsageTextRuns` breaks this (30 W chars → _minWidth ~266pt > ~69pt _calcWidth).
- it.each areaText (claim/budget-overview × en/de): invoice with `areaName = 'W'.repeat(30)` → same `_minWidth <= _calcWidth` assertion on `tableItem.table.body[1][usageColIndex]`.
- Total: 9 tests in this describe block (1 revert + 4 usageText + 4 areaText). 13 total including #1980.
- NOTE: Earlier iteration of this describe had vacuous `maxHorizontalRatio <= 1` production assertions (commits dc40b769, f2b4e77a). Final form uses `_minWidth <= _calcWidth` exclusively for production content. The describe rename (from "assertion" to "via _minWidth <= _calcWidth") was commit ad511908.

**`realRender.test.ts` — describe `'legend sentence layout and occurrence count (#1980)'` (after `#2003` describe):**

- `collectAllStrings` redefined locally (module-level version is inside an inner describe block, inaccessible here).
- AC1 (it.each en/de): fixture with one split invoice + one depositReduced invoice → both legend sentences present in `collectAllStrings(pdfContent)`, `pageCount >= 1`. Legend sentences derived from `content.footnotes[].text` (locale-agnostic, not hardcoded).
- AC2: two split invoices → `allStrings.filter(s => s.includes(splitSentence)).length === 1` (not `.some()` which passes vacuously).
- AC3: normal invoice (no flags) → neither `tEn('sourceReports.table.splitFootnote')` nor `tEn('sourceReports.table.depositReducedFootnote')` appear in collected strings.

**`buildReportContent.test.ts` — inside existing `describe('buildReportContent — footnotes ...')` block:**

- AC4 (#1980): two invoices with `isSplit: true, budgetLines: [], deposits: [{budgetSourceId: null}]` → `footnotes.length === 1 && footnotes[0].id === 'depositReduced'`. Empty `budgetLines` prevents `splitInvoiceIds` from being populated.

**`wiki/ADR-034-Client-Side-Report-PDF-Generation.md`:**

- Added implementing-test pointer bullet immediately after the "No horizontal overflow" bullet in the Testing requirement section.

## Key technique notes

- `horizontalRatio` measures the START position of rendered text lines, not their rightward extent. The revert-test exploits this to validate the helper, but production assertions use `_minWidth <= _calcWidth` which IS falsifiable for content-extent overflow.
- `_minWidth` is set by pdfmake's DocMeasure.js on each cell object. `_calcWidth` is set by columnCalculator.js on the column width descriptor (`table.widths[i]`); read via `calcWidthsOf(table.widths)[colIndex]`.
- With `wordBreak: 'break-all'`, `_minWidth` for a 30-W cell drops to ~33.54pt (single glyph). Without it, ~266pt far exceeds the ~69pt Usage column → assertion fails.
- AC2's `filter().length === 1` vs `.some()` is the entire point: `.some()` would pass even if the sentence were absent.
- AC3 derives sentences from `tEn(...)` rather than hardcoding strings — tracks translations, not literals.

**Why:** #2003 required the overflow ADR rule to be backed by a real test that can detect regression; #1980 required legend sentence dedup to be verified at the count level, not just presence.
