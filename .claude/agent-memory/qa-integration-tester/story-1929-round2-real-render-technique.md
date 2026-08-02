---
name: story-1929-round2-real-render-technique
description: pdfmake real-render _calcWidth/.positions measurement technique, and the git-stash genuine-regression verification pattern, from #1929 round 2 (PR #1935)
metadata:
  type: project
---

## The pdfmake mutate-in-place measurement technique (verified against pdfmake@0.3.11 source)

Round 1's `realRender.test.ts` had a comment claiming pdfmake's resolved column widths were
inaccessible via the public API. **That comment was wrong** — confirmed by reading
`node_modules/pdfmake/js/*.js` directly:

- `DocMeasure.js` `extendTableWidths()` mutates each `table.widths[i]` **in place**, replacing the
  primitive (`number` or `'*'`) with `{ width: <original> }`. `columnCalculator.js`'s
  `buildColumnWidths()` then sets `._calcWidth` on that same object during layout.
- Since `pdfMake.createPdf({ content, ... })` takes `content` **by reference**, holding the exact
  array/object returned by `buildOverviewContent()` and passing it into `createPdf()` means
  `tableItem.table.widths[i]._calcWidth` is readable on your own reference after
  `await pdfDoc.getBlob()` resolves.
- `LayoutBuilder.js`'s `decorateNode()` sets `node.positions = []` on **every** node the layout
  engine processes (including `{ text }` table cells); `processLine()` / `ElementWriter.addLine()`
  push a position object per rendered line, each carrying `.pageNumber` (from
  `DocumentContext.getCurrentPosition()`). So `cell.positions[0].pageNumber` after a render tells
  you which page that cell actually landed on — comparing this across every cell in a row is a
  direct, real assertion that "this row did not split across a page boundary" (not an inference
  from page count or string presence).

Reusable helper pattern (see `client/src/lib/reportPdf/realRender.test.ts`,
`renderOverviewPdfContent`/`findTableItem`/`calcWidthsOf`/`cellPageNumber`): build `pdfContent` via
the real `buildOverviewContent()`, pass that exact reference into a real `pdfMake.createPdf({...})`
call (reuse the app's own `PDF_STYLES`/`PDF_DEFAULT_STYLE`/`pageMargins` — import from
`merge.ts`/`pageGeometry.ts`, never hand-copy), `await getBlob()`, then read `_calcWidth`/
`.positions` off the same reference. This is real measurement, not declared-config inspection —
use it whenever a round-1-style "we can't verify computed layout" comment shows up in a pdfmake
test file; it's very likely wrong, verify against the installed pdfmake version's own source first.

## Measured results (#1929 round 2, PR #1935, pdfmake 0.3.11)

With worst-case content (long German vendor + legal suffix, deposit badge + multiple footnote
markers + refund note in Allocated, German-compound-noun Usage override) and both locales:

| Shape | fixed-column sum | Usage `_calcWidth` | floor (`USAGE_MIN_WIDTH_*COL`) | total rendered width |
|---|---|---|---|---|
| 7-col budget-overview | 317pt | **138.28pt** (en & de identical) | 130pt | 515.28pt (== printableWidth() exactly) |
| 6-col claim/proof-of-funds | 277pt | **186.78pt** (en & de identical) | 175pt | 515.28pt (== printableWidth() exactly) |

Both clear their floor comfortably and exactly match the code comment's own analytical derivation
in `overviewPdf.ts` (138.28pt / 186.78pt) — because with **zero** `'auto'` columns in the design
(all non-Usage columns are literal fixed widths), the single `'*'` Usage column always receives
**exactly** `usableColumnWidth(n) - fixedSum`, regardless of content, as long as its own minimum
width (its widest unbreakable word) doesn't exceed that share. Locale didn't move the number because
none of the *fixed* columns' content differs enough between en/de to change their own widths in this
fixture. **Action for frontend-developer**: the `overviewPdf.ts` comment's "~138.28pt / ~186.78pt
estimate" can be updated to state these as the *measured, confirmed* values, not an estimate.

AC12 measured ceiling: `MAX_SAFE_USAGE_CHUNK_CHARS` (1200) itself was verified via real render to
still land as a single row on a single page (see realRender.test.ts's "[scenario 19, measured
ceiling]" test) — confirms the chosen chunking threshold is safe against the real printable height,
not just the architect's ~2000-char estimate.

## Git-stash technique for verifying genuine regression tests (AC11-style requirements)

When a spec explicitly requires proof that new/rewritten tests "fail on the current unpatched
behavior and pass after the fix" (see #1929's strengthened AC11), and the fix is already landed
in the working tree (uncommitted) with tests written against it:

```bash
# 1. Back up the round-N production files (the ones under test).
cp path/to/file.ts /tmp/backup/file.ts   # repeat per file

# 2. Swap in the PREVIOUS (committed) version for just the production files, keep test files as-is.
git show HEAD:path/to/file.ts > path/to/file.ts   # repeat per file

# 3. Run the new/updated test files against this reverted production code — confirm real failures
#    (either assertion failures or, just as validly, import/module-shape errors proving the new
#    API surface genuinely doesn't exist in the old code).
NODE_OPTIONS=--experimental-vm-modules npx jest <test files> --no-coverage --maxWorkers=1

# 4. Restore the round-N production files from backup.
cp /tmp/backup/file.ts path/to/file.ts   # repeat per file
```

`git stash push -u -- <paths>` also works for this (stash just the production files, keeping test
files unstashed) but requires a clean `git stash pop` afterward — the manual backup+restore above
is more robust when you want surgical control over which specific files get reverted (e.g. keeping
a shared new module like `pageGeometry.ts` at its new version while reverting only the files that
consume it, to distinguish "fails because the module doesn't exist" from "fails because the
behavior differs").

Do this **before** reporting AC11-style compliance — it's cheap (a few minutes) and it's the only
way to actually know the tests aren't vacuously green.

## Fixture-sizing gotcha: tighter layouts break old page-count assumptions

Round 1's `realRender.test.ts` had an existing (not-authored-this-round) test asserting a 15-invoice
/ 4-long-usage-override fixture produces `pageCount >= 3`. Round 2's fix (8pt font vs 10pt, halved
cell padding 8->4, wider Usage column) is **more space-efficient** — the exact same fixture now
renders in only 2 pages. This is not a regression; it's the direct, correct consequence of the
layout fix reclaiming vertical space too (narrower cells -> shorter wrapped Usage stacks). **When a
layout/geometry fix lands, always re-run pre-existing page-count-sensitive fixtures and expect they
may need scaling up** (more invoices / more overridden rows) to keep testing the same thing (i.e.
"does pagination work correctly under long content") — don't just weaken the assertion; scale the
fixture back to genuinely exercising multi-page behavior. In this round: 15->35 invoices / 4->8
overrides restored a reliable 3+ page spread for the data-loss test; a separate AC13 smoke test
(no usage overrides, just a long `sourceName`) needed 70 short-row invoices to reach 3+ pages under
the new layout, since short rows alone are ~23pt each at the new density.

## Broken pattern to avoid: `expect(async () => {...}).not.toThrow()`

This is a no-op — the matcher never awaits the returned promise, so a rejection inside surfaces as
an unrelated unhandled rejection instead of failing the test. For "does not throw" on an async call,
just `await` it directly (a rejection there fails the test naturally), or wrap in try/catch and
assert the caught value is `undefined` if you need to continue asserting other things afterward.

## Follow-up round: word-break fix changed the Usage cell's `.text` shape everywhere

A `dev-team-lead [MODE: review]` finding after the first round-2 pass: AC2 permits word-breaking
("a word may be broken across lines only when it is wider than its column on its own"), but nothing
enabled it — a single whitespace-free run wider than the Usage column's share still forced
`columnCalculator.js`'s `minW >= availableWidth` overflow path (CRITICAL 2), because
`WORST_CASE_USAGE_TEXT` (round-1's `Wärmedämmverbundsystem`, ~91pt at 8pt) never actually exceeded
the ~138pt/186pt budget, so the gap was invisible to the round-2 tests as first written.

**Fix**: `overviewPdf.ts` gained `buildUsageTextRuns(text, safeTokenChars)` — splits on
`/(\s+)/`, emits whitespace-free tokens over `safeTokenChars` as
`{ text: token, wordBreak: 'break-all' }`, everything else (including whitespace) as plain
`{ text: token }`. Two new pinned constants: `USAGE_SAFE_TOKEN_CHARS_7COL = floor(130 / (8*0.495)) = 32`,
`USAGE_SAFE_TOKEN_CHARS_6COL = floor(175 / (8*0.495)) = 44` (floored against the guaranteed MIN
widths, not the roomier measured ones — conservative by design). Deliberately **not** a cell-wide
`wordBreak: 'break-all'` — `TextBreaker.js:15-40` confirms that tokenizes per character, which would
break ordinary German prose mid-word on nearly every line (I4 violation far beyond what AC2 permits).

**Consequence for every existing test**: a Usage cell's `.text` is now **always** `Content[]` (an
array of runs), never a plain string — even `'Kitchen work'` with no oversized token becomes
`[{text:'Kitchen'},{text:' '},{text:'work'}]`. Every test that read a Usage cell's `.text` directly
as a string broke (11 across `overviewPdf.test.ts` and `realRender.test.ts` in this repo's case).
**Fix pattern**: add a small `usageCellText(text) => Array.isArray(text) ? text.map(r=>r.text).join('') : text`
helper per file (this file already had `rowTexts()` doing the array-join generically for whole
rows — reuse/extend that pattern rather than reinventing) and reconstruct before comparing. Where a
test used a whole-document `collectAllStrings().toContain(multiWordString)` search, that now
**always finds 0 occurrences** for any multi-word Usage text (each word is its own leaf) — this is
not evidence of data loss, it's the search technique becoming wrong for this shape. Replace with a
targeted read of the specific row's Usage cell + reconstruction; it's strictly more precise than the
blanket search anyway (confirms text landed on the *correct* row, not just somewhere in the tree).
When a `collectAllStrings()` helper in a describe block ends up with zero remaining callers after
this kind of fix, delete it — don't leave a dead local function (eslint `no-unused-vars` catches it
immediately, but it's easy to miss until you actually re-run).

**New regression coverage added**: a pathological 58-char unbroken token (`'Supercalifragilistic...'`,
no whitespace, well over both 32/44 thresholds) run through the same real-`_calcWidth` render
technique, both shapes/locales — asserts the rendered table still fits `printableWidth()` (AC1) and
the full token is recoverable verbatim from the rendered runs (I1/AC2). Verified genuinely
regression-worthy via the backup/restore technique: neutralizing just the `wordBreak: 'break-all'`
assignment (one line) reproduces the overflow exactly (597.8pt / 549.3pt rendered vs 515.28pt
budget, both shapes) — confirming the fix, not the test's own construction, is what makes it pass.
Also added: direct `buildUsageTextRuns()` unit tests (I1 reconstruction at the exact threshold, one
over, a 500-char single token, long tokens mixed into prose) and I4-direction tests (ordinary prose
never gets `wordBreak` on any token, German compound nouns under the floor stay unflagged) — the
latter is what stops a future "fix" from regressing to a cell-wide `break-all`.

**Measured `_calcWidth` for the pathological-token fixture**: identical to the non-pathological
worst-case fixture (138.28pt / 186.78pt, both shapes/locales) — because with zero `'auto'` columns,
the star column's width doesn't depend on content AT ALL once `columnCalculator.js`'s overflow path
is avoided; the word-break fix's entire job is keeping that path from triggering, not changing how
much space the column gets. Confirms the production constants have full headroom, no `CODE_BUG`.

## Unreachable defensive branches (branch-coverage ceiling, reconfirmed)

`overviewPdf.ts`'s `splitIntoPageSafeChunks`'s trailing `if (current) chunks.push(current);` and
`buildOverviewContent`'s `if (!skipFootnotesByInvoiceId.has(invoiceId))` both have a branch that is
mathematically unreachable given their invariants (the former: `current` can be proven non-empty at
loop end whenever the function reaches that code at all, since the early-return already guarantees
non-empty input; the latter: `Map` keys are unique by construction, so a second iteration over the
same key literally cannot occur). Both files sit at 100% statement/line coverage with branch
coverage in the high-90s because of exactly these two dead branches — do not chase them to 100%
branch coverage; they're the same "Record<Status,...>-guaranteed unreachable fallback" pattern
recorded for story #1878.
