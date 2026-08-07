---
name: story-1940-continuation-marker-runt-merge
description: Issue #1940 (continuation-row "… " marker + runt-remainder merge in overviewPdf.ts) — centralized marker-stripping pattern, fontkit glyph-coverage technique, ripple scope
metadata:
  type: project
---

Issue #1940: `packUsageCellRowsWithMinimum` (AC1/AC2 runt-remainder merge) and `buildUsageCell`'s
`isContinuation` marker (AC5, a literal `{ text: '… ' }` run prepended to every Usage continuation
row, no color override). Tests: `client/src/lib/reportPdf/overviewPdf.test.ts` (+~350 lines: new
`packUsageCellRowsWithMinimum` describe block, `AC5`/`AC8`/`AC2` describe blocks) and
`client/src/lib/reportPdf/realRender.test.ts` (+~190 lines: new `#1940` describe block).

## The marker-stripping ripple was much larger than the two "extend this block" instructions implied

The spec named 2 existing tests to fix by hand (scenario 10/11 in overviewPdf.test.ts). Actually
affected once the marker landed: **every existing test that reconstructs a Usage cell's text on a
row known to be a continuation row**, in BOTH files. Found by grepping every `splitUsageCell(`/
`rowTexts(`/`usageCellText(` call site and checking whether the row it read was ever index >= 1 of
a packed group:
- `overviewPdf.test.ts`: scenario 10, scenario 11, and the "[#1959 fix round] suffix gets a row of
  its own" test (3 existing tests).
- `realRender.test.ts`: scenario 19c's reconstruction (`usageCellText` used directly, not
  `splitUsageCell`), AND — the big one — the entire "cell-scope invariant" describe block's shared
  `renderCellScopeRow` helper, which ~8 downstream tests depend on (700+400, 700+20-leaf-area,
  2000-alone, the three page-count-saturation guards, two #1968 regressions). That helper also
  derived its expected row COUNT from bare `packUsageCellRows`, which could disagree with
  production's `packUsageCellRowsWithMinimum` count whenever a runt merge fires on one of those
  large fixtures — fixed by switching the helper to call `packUsageCellRowsWithMinimum` with the
  same `Math.max(20, USAGE_SAFE_TOKEN_CHARS_6COL)` floor production uses (that block's fixture is
  always the 6-col/claim shape).

**Lesson**: when a spec says "extend the existing X and Y tests," always grep every call site of
the shared reconstruction helper across BOTH files before assuming the ripple is scoped to the two
named tests — a shared test helper used by N tests is one bug away from breaking all N silently.

## Centralization pattern (applied identically in both files)

Added `stripContinuationMarker<T extends {text,color}>(runs): T[]` once per file — strips exactly
one leading run whose `.text === '… '` AND `.color === undefined`. Gated behind an explicit
`opts.isContinuation` boolean on `rowTexts`/`splitUsageCell`, never applied unconditionally by
substring match (that would risk masking a genuine defect that happened to produce a leading '… '
in real content on row 0, which never gets the marker). Every call site on a continuation row
either passes `{ isContinuation: true }` directly, or (when mapping over a whole row group)
`{ isContinuation: i > 0 }` since row 0 of a packed group is never a continuation row.

## Deriving expected row counts: use `packUsageCellRowsWithMinimum`, not `packUsageCellRows`/`splitIntoPageSafeChunks`

Any test that derives "how many rows should this produce" from the bare packer instead of the
wrapper is a latent bug the moment a runt merge fires on that fixture — happened to not matter for
the specific pre-existing fixtures in this PR (verified by tracing: none of them contained an
actual runt), but the cell-scope block's fixtures easily could have. Always derive from the SAME
formula `buildOverviewContent` calls: `packUsageCellRowsWithMinimum(segments, usageChunkChars,
Math.max(20, usageSafeTokenCharsForWidth(colWidths.usage)))`. For the two reference shapes,
`usageChunkChars` is always `MAX_SAFE_USAGE_CHUNK_CHARS` (650) — `usageChunkCharsForWidth`'s
one-sided clamp means the 6-col shape's wider Usage column still clamps down to 650, never up.

## Pathological-runt fixture that reliably produces a MID-list runt (not just trailing)

`'A'.repeat(BUDGET) + ' hi ' + 'B'.repeat(18)` at a small BUDGET — the leftover `' hi '` (4 chars)
doesn't fit after `'A'*BUDGET` fills row 0, but DOES fit its own row, so plain `packUsageCellRows`
strands it alone as row 1, sandwiched before `'B'*18`'s own row 2. Useful whenever a spec explicitly
wants "not merely a trailing runt" coverage — most naive fixtures (a single oversized token) only
ever produce a TRAILING runt.

## fontkit glyph-coverage technique (AC9's "verify the glyph exists, don't assume from precedent")

`fontkit` is a transitive dependency (via `pdfmake` -> `pdfkit`) already resolvable at
`node_modules/fontkit` even before being declared — added it + `@types/fontkit` as EXACT-pinned
`client/package.json` devDependencies (both `2.0.4`, matching the already-hoisted version) per the
Dependency Policy, then `npm install` (root) to regenerate the lockfile — `npm ls fontkit`/`npm ls
undici` afterward confirmed no tree damage; audit findings unchanged (all pre-existing, unrelated to
fontkit). Technique, verified working under this repo's ts-jest ESM jsdom config with zero jest
config changes:

```ts
const fontkitModule = await import('fontkit');
const fontkit = (fontkitModule as { default?: typeof fontkitModule }).default ?? fontkitModule;
const vfsModule = await import('pdfmake/build/vfs_fonts'); // same module loader.ts uses
const vfs = (vfsModule as { default?: Record<string, string> }).default ?? vfsModule;
const font = fontkit.create(Buffer.from(vfs['Roboto-Regular.ttf'], 'base64'));
const glyph = font.glyphForCodePoint(0x2026); // U+2026 HORIZONTAL ELLIPSIS
expect(glyph.id).not.toBe(0); // glyph id 0 == .notdef by spec — the real "tofu box" signal
```

Confirmed empirically (Roboto-Regular): U+2026 -> glyph id 400 (real). A genuinely-unmapped astral
codepoint (`0x10ffff`) -> glyph id 0 — a positive control proving glyph id 0 is reachable/meaningful
in this exact font, not a fontkit quirk that always returns non-zero. **Glyph id, not a raw
advance-width measurement, is the dispositive check** — `.notdef` commonly has a real non-zero
advance in real fonts, so width alone can't rule out a tofu box.

## Blank pdfmake cells DO get `.positions` populated (verified empirically, not assumed)

Before writing an AC7 "every cell in the row shares one pageNumber" assertion across a continuation
row (which has blank leading/amount cells from `buildEmptyBodyCell`), I worried `cellPageNumber`
(which throws on an empty `.positions` array) would fail on those blank cells. Verified via a
disposable probe test: an empty-string `{text:'', style:'tableCell'}` cell gets exactly ONE
`.positions` entry after a real render, same shape as a non-empty cell's first entry. So
`row.map(cellPageNumber)` is safe and meaningful across a full row including blanks — no need to
filter to non-empty cells or weaken the assertion.

## Genuine-regression proof

Backup/restore technique (per [story-1929-round2-real-render-technique.md](story-1929-round2-real-render-technique.md)):
reverted `overviewPdf.ts` to `git show HEAD:...` (pre-#1940), ran the new test surface:
- `overviewPdf.test.ts`: whole suite fails to even LOAD (`SyntaxError: ... does not provide an
  export named 'packUsageCellRowsWithMinimum'`) — a clean, unambiguous module-resolution proof for
  the entire new Part A/B surface at once.
- `realRender.test.ts`'s new `#1940` describe block: 2 of 4 tests fail with REAL assertion
  failures (not import errors, since the module still loads fine using only pre-existing exports)
  — the AC9 runt-avoidance test fails because the last row's marker-stripped usage text is too
  short, and the AC5 marker test fails because the first run is real prose (`'zzz...'`), not
  `{text:'… '}`. The other 2 (glyph coverage, `_minWidth`/page-number) correctly still pass
  pre-fix, since they test generic layout properties unrelated to this fix — expected, not a gap.

Restored via `cp` from a `/tmp` backup; confirmed `git diff --stat` on `overviewPdf.ts` matched the
pre-revert diff exactly (99 insertions / 5 deletions) before finishing.

## Review round 1 fixes (product-architect + security-engineer)

- **`fontkit` devDependency confirmed harmless**: security-engineer verified it was already a
  production transitive dependency via `pdfmake` -> `pdfkit`, so declaring it in
  `client/package.json` installs nothing new — the Docker runtime image is byte-identical.
- **`TS2352` — Jest passing does NOT mean `tsc` is clean.** `(fontkitModule as { default?:
  typeof fontkitModule }).default ?? fontkitModule` compiled fine under `ts-jest` (which runs no
  type diagnostics by default) but failed `npx tsc --noEmit -p client/tsconfig.json` — "neither
  type sufficiently overlaps with the other." Fix: route through `unknown` first, exactly like the
  `vfsModule` cast two lines below it already did: `(fontkitModule as unknown as { default?:
  typeof fontkitModule }).default ?? fontkitModule`. **Lesson reinforced a third time in this
  batch** (after #1911's missing factory field, #1912's ESM mock): run the scoped `npx tsc --noEmit
  -p client/tsconfig.json` (or the server equivalent) before handback whenever a test file adds a
  nontrivial type assertion — Jest green is not proof the build is green. Make this reflexive, not
  something that has to be asked for.
- **Bare literal `20` retyped at 6 call sites — exactly the anti-pattern issue #1950 exists to
  prevent.** Once `frontend-developer` extracted `MIN_CONTINUATION_ROW_FLOOR_CHARS` (exported from
  `overviewPdf.ts`, value `20`), all 6 sites (4 in `overviewPdf.test.ts`, 2 in `realRender.test.ts`)
  were switched from `Math.max(20, ...)` to `Math.max(MIN_CONTINUATION_ROW_FLOOR_CHARS, ...)`.
  **The two operands are a deliberate non-redundant pair, not simplifiable to either alone**:
  `usageSafeTokenCharsForWidth(usageWidth)` does the main per-subset-width work; the named constant
  is the absolute fallback floor for subsets where that per-line figure is itself small. Added a
  comment at the point of use so a future reader doesn't "simplify" one operand away.
- **General lesson**: whenever a spec/AC references a bare numeric literal that also appears as a
  production magic number, check whether a name for it exists (or is about to land) before writing
  the test — retyping it in N places is itself the bug class this batch's #1950 targets.
