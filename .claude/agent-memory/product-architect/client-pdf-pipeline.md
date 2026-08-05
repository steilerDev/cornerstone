---
name: client-pdf-pipeline
description: Client-side bank-report PDF generation (pdfmake + pdf-lib) introduced in story #1879 -- module seams, lazy-loading contract, pdfmake 0.3.x gotchas; documented as ADR-034
metadata:
  type: project
---

# Client-side PDF pipeline (`client/src/lib/reportPdf/`)

Introduced by story #1879 / PR #1887 (bank report wizard frontend, final story of the Bank Report
Wizard mini-epic). Reviewed CHANGES_REQUIRED -- see [[story-reviews]] for the findings.

**ADR written: [ADR-034 Client-Side Report PDF Generation: pdfmake + pdf-lib]** (`wiki/ADR-034-Client-Side-Report-PDF-Generation.md`,
wiki master `0cd728d`, 2026-07-30). Closes PR #1887 finding B6. Status Accepted. It is the
canonical home for everything in this file plus: the puppeteer/pdfkit rejection rationale, the
two-libraries-one-capability-seam argument, the ~2MB / 50MB-upload-cap / Roboto-only trade-offs,
and the **real-render testing requirement** (B1-B5/M4 written up as generalizable rules). Cite
ADR-034 in future reviews instead of re-deriving. **ADR-035 is the next free number** --
`app_settings` still owes one, see [[app-settings-mechanism]].

## Module seams (good decomposition, keep it)

**The authoritative module table is ADR-034's** (corrected 2026-08-04, issue #1914) — read it there
rather than duplicating it here, since this copy drifted twice. Current shape: `loader.ts`,
`pageGeometry.ts` (sole owner of the pt coordinate system, extracted #1939), `shared.ts` (header/footer
builders + `TABLE_LAYOUT` callbacks, **no formatters, no geometry constants**), `coverLetterPdf.ts`,
`overviewPdf.ts`, `merge.ts`, `sinks.ts`, `types.ts`, `index.ts`.

Builders are pure -- they cannot use hooks, which is exactly why locale and currency got dropped
(see [[story-reviews]] B3). Anything locale-dependent must be threaded in as a parameter. Since #1900
the builders take `(reportContent: ReportContent, …, t: TFunction)` and **no formatters at all**:
`buildReportContent` is the single place `reportFormatters` is applied. The residual `t` covers only
generation-time strings (`*N` skip-note reasons, cover-letter `Reference:`/`Subject:` prefixes) and is
always `reportT`.

## Lazy-loading contract (fragile -- verify on every change)

The ~2MB stays out of the main bundle **only** because every static reference is `import type`.
The sole value-level references are the three `import()` calls in `loader.ts`. Webpack's
`splitChunks: { chunks: 'all' }` then keeps them in async chunks. **One plain `import { X } from
'pdfmake/...'` anywhere in the client graph silently pulls it all into the initial bundle.**
Guard command:

```
grep -rn "from 'pdfmake\|from 'pdf-lib" client/src --include=*.ts --include=*.tsx | grep -v "import type"
```

Must return nothing. `ReportWizardPage` is additionally `lazy()`-loaded in `App.tsx`.

## pdfmake 0.3.11 gotchas (all verified empirically, all cost a review round)

These are pinned by `loader.test.ts`, which deliberately does NOT mock the packages -- the best
test in the PR and the template to copy for any new external-format pipeline.

- `pdfmake/build/pdfmake` is a **UMD/CJS bundle**: real exports live on the dynamic-import
  namespace's `.default`, not the namespace. The namespace is non-extensible, so assigning `.vfs`
  to it throws `TypeError: Cannot add property vfs`.
- `pdfmake/build/vfs_fonts` **default-exports the font map directly** -- no `.pdfMake.vfs`
  wrapper (that shape was pre-0.3.x).
- `pdfMake.fonts` defaults to `{ Roboto: {...} }` **only**. Any other font name in `defaultStyle`
  throws `Font 'X' in style 'normal' is not defined`. Contrast: an unknown **style** name is
  silently ignored (probed -- no throw).
- `widths: 'auto'` applies no total-width constraint; the table overflows the page. Use `'*'` for
  the flexible column. A4 portrait with 40pt margins = **515.28pt** content width.
- `getBlob()` is promise-based per `@types/pdfmake@0.3.3` and works in jsdom. `getBuffer()` with a
  callback did **not** fire in plain Node CJS -- probe inside jest/jsdom instead.
- `content` objects come back **mutated** after render (pdfmake annotates `_minWidth`,
  `_maxWidth`, `positions`, `__height`). Handy for asserting real layout geometry.

## Table geometry traps (verified empirically on 0.3.11 during the #1929 / PR #1935 review)

Four independent traps, each of which produced a wrong "fix" that passed its own unit tests. Any
change to `overviewPdf.ts` widths, `TABLE_LAYOUT`, or `pageMargins` must be validated by
**rendering and reading back resolved geometry**, never by asserting the declared config.

1. **`dontBreakRows` lives on `table`, not `layout`.** `TableProcessor.js:123` reads
   `tableNode.table.dontBreakRows`. The `layout` object is packed into `node._layout`
   (`DocMeasure.js:469`) and only feeds the border/padding/fill callbacks — nothing reads
   `_layout.dontBreakRows`. Put it in `layout` and you get a **byte-identical PDF** (modulo
   `/CreationDate` + `/ID`); a unit test asserting `TABLE_LAYOUT.dontBreakRows === true` passes and
   proves nothing.
2. **Declared widths are CONTENT widths.** pdfmake subtracts `_offsets.total` from the available
   width _before_ distributing them. `offsetsTotal = cols * (paddingLeft + paddingRight +
vLineWidth) + vLineWidth`. With `TABLE_LAYOUT`'s `8/8/0.5` that is **116.0pt for 7 columns,
   99.5pt for 6** out of the 515.28pt A4 printable width. Budget columns against
   `515.28 - offsetsTotal(cols)`, not 515.28. Getting this wrong made a comment claim Usage got
   185.28pt when it actually got **69.28pt**.
3. **A `'*'` column never shrinks below its longest unbreakable word.**
   `columnCalculator.js:66-75` — when `minW >= availableWidth` the star is set to `starMaxMin` and
   _the table overflows the page_. So no static assertion on the `widths` array can prove "no
   horizontal overflow": German compounds (`Wärmedämmverbundsystem` ~128pt @10pt Roboto) push a
   69.28pt star to 128pt and the table to 574pt on a 515.28pt page.
4. **`dontBreakRows` + a row taller than the printable height = silent data loss.** pdfmake does
   not paginate an over-tall unbreakable row; it **drops** it. Measured 7-col with a 69.28pt Usage
   column: 450 chars renders, 500 chars renders the header row only, and the text-show-op count
   stays flat no matter how much longer the text gets. Always pair `dontBreakRows` with a width
   wide enough that realistic max content stays inside `pageHeight - topMargin - bottomMargin`
   (706.89pt at A4/75/60), and regression-test the boundary.

**`_calcWidth` is the verification lever.** `createPdf(def)` mutates `table.widths` entries in
place into objects; after `await getBlob()` each carries `_calcWidth` (the resolved pt width).
Real coverage is therefore just: build content -> render -> assert
`offsetsTotal + sum(_calcWidth) <= 515.28` and `_calcWidth[usageIdx] >= floor`, with a
German-locale compound-noun case. The comment in `realRender.test.ts` claiming pdfmake's public
Node API cannot expose computed widths is **wrong** — it can, it is just a private field, so pin
the version. Same trick measures text: `pdfkit` + the Roboto TTF out of `vfs_fonts` gives
`doc.widthOfString(s)` for exact fit checks (avg lowercase prose char ~4.68pt @10pt Roboto).

**Page geometry WAS scattered across four sites** (`PAGE_TOP_MARGIN` in `shared.ts`, L/R/B inline
in `merge.ts`, printable-width prose comment in `overviewPdf.ts`, paddings in `TABLE_LAYOUT`).
Recommended in the PR #1935 review and **since implemented as `pageGeometry.ts` (#1939)**, exporting
`PAGE_WIDTH/HEIGHT`, `PAGE_MARGIN_*`, `CELL_PADDING_X`, `V_LINE_WIDTH`, font sizes, `PDF_STYLES`,
`printableWidth()`, `printableHeight()`, `tableOffsetsTotal(cols)`, `usableColumnWidth(cols)`,
`headerFootprint()`, and the derived `PAGE_TOP_MARGIN` (now 93, not 75). `tokens.css` is explicitly NOT the answer —
the pdfmake layer is its own pt coordinate system outside the design system.

**`PAGE_TOP_MARGIN` (75) is derived from a single-line-header assumption.** `buildPageHeader`
gives the title/source stack the left half of a 2-column split = 257.64pt; `sourceInfo.sourceName`
is unbounded user data and wraps past ~45 chars (realistic German bank names measure 341-442pt),
adding 16.8pt to the 60.4pt footprint and re-breaking the header band. Derive the footprint from
the same constants `merge.ts`'s `styles` uses, or clamp the subheader with `noWrap`.

## Dependencies

`pdfmake@0.3.11`, `pdf-lib@1.17.1`, `@types/pdfmake@0.3.3` -- all exact-pinned in
`client/package.json`. 27 transitive packages (`fontkit`, `pdfkit`, `restructure`, `pako`,
`brotli`, `linebreak`, `@noble/*`, `unicode-*`), all pure JS, no install scripts, all hoisted to
root `node_modules/` with zero workspace nesting. Two libraries not one because pdfmake generates
and pdf-lib merges/appends existing Paperless PDFs -- pdfmake cannot embed foreign PDF pages.

## Endpoints consumed (all pre-existing, no contract change)

`GET /api/source-reports`, `POST /api/source-reports/mark-claimed`,
`POST /api/paperless/documents`, `GET /api/paperless/documents/:id/preview`.

## Report language is decoupled from the UI locale (Story #1899, PR #1903)

The report's language is chosen per-run in the wizard's Settings step and is **independent of the
app's ambient locale**. Two locale-bound artifacts are built in `ReportWizardPage.tsx` and passed
into `generateReportPdf` -- nothing else in the pipeline is locale-aware:

- `reportT = i18n.getFixedT(reportLanguage, 'budget')` -- works synchronously because
  `client/src/i18n/index.ts` statically imports _both_ `en` and `de` bundles into one `resources`
  object. **Never call `i18n.changeLanguage()` to switch report language** -- that mutates the app UI.
- `reportFormatters = createFormatters(localeTag, currency)` in `client/src/lib/formatters.ts`.
  `useFormatters()` is now a thin wrapper over the same factory, so UI and report formatting can
  never diverge in implementation (only in bound locale).

Why `reportPdf/*` needed zero changes: `merge.ts` / `overviewPdf.ts` / `coverLetterPdf.ts` already
took `t: TFunction` + `formatters?: Formatters` params and contain **no** ambient `i18n`, `Intl.`, or
`toLocale*` usage, and **no namespace-prefixed keys** (all keys are bare `sourceReports.*` in the
`budget` ns). Preserve both properties -- a single `t('common:…')` call or a raw `Intl` use inside
`reportPdf/` would silently leak the UI locale into the exported PDF.

DONE 2026-08-01: ADR-034 now records this contract (wiki master `254db1d`, "Addendum: report language is
decoupled from the UI locale").

## Content/layout split: `client/src/lib/reportContent/` (Story #1900, PR #1909)

An editable content model now sits between the API response and the pdfmake builders:

```
SourceReportResponse --buildReportContent(report, includedIds, useCase, reportT, reportFormatters,
                       {includeCoverLetter, household})--> ReportContent (plain strings)
ReportContent + Record<string,string> overrides --applyOverrides--> effective ReportContent
effective ReportContent --generateReportPdf--> Blob
```

- `buildReportContent` owns **all** text derivation, including `includedTotal` and per-status subtotals.
  `merge.ts` / `overviewPdf.ts` / `coverLetterPdf.ts` are now pure layout with zero derivation — this
  finally removes the "`report.totalAmount` is not the grand total once invoices are excluded" trap from
  the layout layer.
- `applyOverrides` is pure, ignores unknown keys, and **recomputes `coverLetter.signature` from `sender`**
  (the one derived-field invariant). Override keys: `coverLetter.{sender,recipient,reference,subject,body}`
  and `row.<invoiceId>.{usageText,attachmentsNote}`.
- Two independent references by design: `coverLetter.reference` (editable) vs `sourceInfo.referenceText`
  (the overview block's read-only Reference line). Both baseline off `report.source.reference`; editing the
  letter does **not** change the table.
- `ReportContentRow.status` = raw key for the `Badge` variant map; `statusText` = report-language label.
  Both are needed; a consumer that renders the Badge label from its own `t()` re-introduces the UI-locale leak.

**Labels live in the model (closed on PR #1909 round 2).** `ReportContentLabels` (12 strings) is built with
`reportT` in `buildReportContent` and consumed by BOTH `ReportContentEditor` and `overviewPdf` — one
translated string set per report, so a second consumer cannot drift. Still re-translated independently
(correct today, both receive `reportT`): `overviewPdf` skip-footnote reasons, `merge.ts` page header/footer.
General rule when adding a consumer: **check which `t` it receives.**

### Report-language vs UI-language: the export test

The discriminator is **"does this exact string appear in the exported PDF?"** — NOT "is it next to an
editable control?". Ruled on PR #1909 round 2:

- `labels.usage` IS a PDF `tableHeader` (`overviewPdf.ts`) -> report language everywhere it captions that
  data, including the responsive mobile card. Labeling it from chrome `t` on mobile only made the language
  flip at a breakpoint.
- `labels.attachmentsNote` is NOT exported (no attachments column in the PDF) — but its desktop header
  already reads from `content.labels`, so mobile must match or desktop/mobile split.
- Cover-letter `senderLabel`/`recipientLabel`/`bodyLabel` stay UI-language because `coverLetterPdf` renders
  those blocks with **no label prefix at all** — they are genuinely unexported. (`Reference:`/`Subject:` DO
  print in the PDF, but from separate `sourceReports.coverLetter.*` keys.) So the cover-letter card is not a
  precedent for putting editable-field labels on chrome `t`.

One-line statement of the rule: **visible captions of exported data follow the report language;
screen-reader affordance sentences (`ariaLabel`, `resetAriaLabel`) are wholly UI language** — never splice a
report-language noun into a UI-language sentence. This pre-decides the same question for #1901.

### AI layer (#1901, PR #1916) — the forward note was followed

`applyAiContent(content, aiContent | null)` sits **between** `buildReportContent` and `applyOverrides`, so
the layer order is `baseline -> AI -> user overrides`. AI text is therefore not "edited", gets no reset
affordance, and survives until `guardedUpdate` clears both. `guardedUpdate`'s dirty check was widened to
`Object.keys(overrides).length > 0 || aiContent !== null`. Empty strings from the generator fall back to
baseline rather than blanking a field. Keep this shape — putting AI output in `overrides` is the trap.

Server side: `POST /api/source-reports/generate-content` re-fetches the report (client sends selection only),
persists nothing, and reuses the single `budgetExtraction/` LLM gateway as a third provider method. Both
documented in ADR-034 "Addendum: content layers".

### PR #1959 review — the Usage-cell height bound, third scope revision

**The recurring defect** (#1929 r3 -> r4 -> #1959 r1) is always the same: `table.dontBreakRows: true` makes
pdfmake measure an over-tall row and then `PageElementWriter` **silently discards** the overflow. No throw,
no visible truncation. Symptom: page count **saturates** (~2) and can go **non-monotonic** (3 -> 2 as content
grows) while rendered line count rises linearly.

**The rule that fixes it durably: bound the height of what a cell RENDERS, never of a source field.**
Any per-field bound is coupled to a layout decision and detaches silently the moment the layout changes —
which is exactly how r4's per-field continuation rows became #1959's unbounded inline run.
`packUsageCellRows(segments, MAX_SAFE_USAGE_CHUNK_CHARS)` is the right shape because the bound now lives
where the cell's content **stream** is assembled, so a new segment is bounded automatically.

**Two detection recipes that actually caught it** (both threshold-free, both worth reusing for any generated
document): page count must be **monotonic** in content size, and **channel-independent** — the same text
costs the same paper whichever field carries it.

**The generic-assertion / hand-enumerated-input asymmetry** (the reason it recurred, now the top open item):
the per-row budget assertion counts characters generically over all runs, so a new channel _would_ be
counted — but the test inputs are hand-listed (`usageText`/`areaText`/`attachmentsNote`), so a new
`ReportContentRow` string field defaults empty and every assertion passes **vacuously**. Fix is key-driven
saturation (`Object.entries(row)` -> saturate every string field), not another hand-written case.
Verified empirically during review: losslessness + per-row budget hold over 3k fuzzed inputs (0 failures);
a hypothetical **second** grey/meta segment trips the existing `splitUsageCell` "at most one grey run per row"
throw in ~49% of inputs, so _that_ channel class is already guarded.

**Geometry constraint (blocks a feature):** `USAGE_WIDTH_7COL/_6COL` derive from `usableColumnWidth(n)`, and
`MAX_SAFE_USAGE_CHUNK_CHARS = 650` was **measured against the 7-column shape**. So making column visibility
affect the PDF widens the Usage column and **invalidates the measured ceiling** — "just plumb the toggles
through" is a re-measurement story, not a UI change. #1959's toggles are preview-only local `useState`.

**`packUsageCellRows` hangs on `maxChars <= 0`** (own `remaining <= 0 -> flush() no-op -> continue` loop).
New to the packer — `splitIntoPageSafeChunks` fails loudly instead (`RangeError`). Unreachable while the
budget is a constant; matters if it ever becomes computed.

### Legend is document-level, not per-row (#1965)

DONE 2026-08-03: ADR-034 records this (wiki master `03ed804`, addendum "the legend is document-level and
deduplicated" + a Deviation Log row + a reworded B4 rule). The old B4 wording ("every footnote is referenced
from the row that owns it") described the pre-#1965 inline-symbol design (`†`/`‡`) and was **wrong** for the
current model.

Two structurally different note kinds now share the legend block but **not** a numbering scheme:

- **`*N` skipped-document notes** — numbered, row-owned, one per skipped document, built in `overviewPdf.ts`
  at generation time (never in `ReportContent`). B4's "referenced from the owning row" rule applies here only.
- **`content.footnotes[]` legend entries** — **at most one per flag type for the whole document**
  (currently 2: `split`, `depositReduced`). `buildReportContent.ts` accumulates `splitInvoiceIds` /
  `depositReducedInvoiceIds` as `Set<string>` and pushes gated on `set.size > 0`, so cardinality is
  independent of how many rows carry the flag. `marker` is the repeated human-readable inline label
  (`partial` / `less deposit`, report-language) that the Allocated Amount cell prints, **not** an identifier
  — `id` is the machine key. Row↔legend link is **by repetition of the label**, not by stored reference;
  rows carry only `isSplit`/`isDepositReduced` booleans. Storing a footnote index on a row would recreate
  B4's second numbering namespace.

Regression to guard when adding a flag type: emitting one entry per flagged row. Assert
`footnotes.length === N` (never `>= 1`) on a fixture where several rows share a flag.

### ADR-034 debt — PAID 2026-08-04 (issue #1914)

All five items below are now in the wiki. Do not re-file them.

1. `dontBreakRows` lesson + "bound the rendered cell, not a source field" + both detection recipes
   (monotonic page count, channel-independence) → new section "Unbreakable rows are silently dropped",
   plus minimum-bar rule #2 pointing at it.
2. **Minimum-bar rule #1 corrected.** The old `table._minWidth <= 515.28` was a mis-transcription of B2's
   _diagnostic_ into a _correctness check_. Replaced by two render-derived assertions:
   `max(node.positions[].horizontalRatio) <= 1` and
   `tableOffsetsTotal(cols) + sum(widths[i]._calcWidth) <= printableWidth()`. **Verified in this pass:**
   `horizontalRatio = (x - pageMargins.left) / innerWidth`, set at `pdfmake/js/DocumentContext.js:490`.
   `horizontalRatio` appears **nowhere in the Cornerstone codebase** — the assertion is documented but not
   yet implemented; `realRender.test.ts` uses the `_calcWidth` sum form only.
   **Re-verified 2026-08-04** (PR #2002 round-2 review): still zero hits for `horizontalRatio` across
   `client/`. Consequence worth naming — every horizontal-overflow fix in this pipeline is verified by
   **mechanism** (`wordBreak: 'break-all'` is present on the expected run) rather than **outcome** (nothing
   advanced past the printable edge). A mechanism assertion cannot catch "the mechanism fired and it still
   overflowed" (wrong `safeTokenChars` threshold, or a column-width edit that silently invalidates one).
   Now tracked as **issue #2003** (tech-debt, should-have, on the board backlog), which I own. Its AC
   requires a revert test on the new assertion — a documented-bar-turned-test that cannot fail would just
   move the debt. Pair candidate: rule #2's `_calcWidth` table-box form is also documented-and-unimplemented.
3. Module table rewritten: added `pageGeometry.ts` (sole owner of the pt coordinate system) and `index.ts`;
   `shared.ts` no longer claims formatters or geometry constants. Recorded _why_ the formatters were
   deleted (a PDF-local formatter is a second formatter bound to a different locale = B3).
4. Override keys corrected against `reportContent/overrideKeys.ts`: `coverLetter.{sender,recipient,
reference,subject,body,signature}` + `row.<id>.usageText`. `attachmentsNote` is gone; `signature` was
   added with a **three-way precedence** the old flat sentence misdescribed — explicit override wins,
   else re-derive from sender **only if `senderChanged`**, else baseline.
5. Fixed 6-or-7 column-count constraint recorded (blocks plumbing the column toggles into the PDF).

Also folded in during the same pass: the "injection is the only channel" contract (4 numbered invariants +
grep guard, story #1899 / architect L5), the strengthened labels rule, and the `_minWidth`
diagnostic-vs-check pointer on B2's narrative. Six Deviation Log rows added.

### `merge.ts` footer locale leak — STILL OPEN (code defect, not wiki debt)

`merge.ts:134` is still `buildPageFooter(t('sourceReports.table.pageLabel'))` — the **interface** `t`. With
interface DE + report EN, page 2+ is footed `Seite 2 / 5` under an English report. Verified still present
2026-08-04. The header was fixed in #1938; the footer was not. Fix shape: add `pageLabel` to
`ReportContentLabels` (which is `reportT`-derived). Now recorded in ADR-034 as a known open violation —
**needs a GitHub issue**, it has only ever been a PR-review follow-up note.

## ADR-034 legend model, corrected in PR #1979 (wiki `03ed804`)

The ADR-034 debt owed since #1959 is now paid. Two structurally different note kinds share the block below
the overview table and must never share a numbering scheme:

| Kind                                 | Marker                                                 | Cardinality                                | Built by                                                     |
| ------------------------------------ | ------------------------------------------------------ | ------------------------------------------ | ------------------------------------------------------------ |
| Skipped-document note                | `*N`, numbered, referenced by the owning row           | one per skipped document                   | `overviewPdf.ts` at generation time (not in `ReportContent`) |
| Legend entry (`content.footnotes[]`) | repeated inline word label — `partial`, `less deposit` | **at most one per flag type per document** | `buildReportContent.ts`                                      |

B4's old generalized rule ("every footnote is referenced from the row that owns it") applied only to the
numbered kind and was reworded. Invariants now recorded in the ADR's legend addendum:

- `footnotes[].marker` is `sourceReports.table.{split,depositReduced}InlineLabel` — the _same_ keys as
  `labels.{splitNote,depositReducedNote}` and as the inline label the row cell prints. Row↔legend joins by
  **repetition of that literal**, not by id/index/number. NBSP in `less deposit` / `abzgl. Abschlag` is
  load-bearing; `expect(footnotes[0].marker).toBe(content.labels.splitNote)` is the assertion that pins it.
- Gated on `splitInvoiceIds.size > 0` / `depositReducedInvoiceIds.size > 0` (`Set<string>` accumulated in the
  `includedInvoiceIds`-filtered row loop), so `footnotes.length` is bounded by flag count (2), never row count.
- Adding a flag type = new `Set` + `size > 0` push in `buildReportContent.ts`, new boolean on
  `ReportContentRow`, new inline label in `overviewPdf.ts`. Assert exact `footnotes.length` (not `>= 1`) on a
  fixture where several rows share a flag.
- Preview/export parity trap: once markers became _words_, `ReportContentEditor`'s
  `<span>{marker}:</span>{text}` ran them together while the PDF used `${marker}: ${text}`. Fixed in #1979 —
  any change to either surface must keep the separator identical.

## Fixed-width column headers impose a per-locale character budget (#1937/#1938, PR #1982)

The overview table's columns are fixed-width (`VENDOR_WIDTH = 45`, `INVOICE_AMOUNT_WIDTH = 48`, …) and
pdfmake's `elasticWidth` never grows a fixed column to fit its own header. So **every DE translation of a
`sourceReports.table.*` header key is width-constrained**, and DE is always the binding locale.

- `buildHeaderCell` applies `buildUsageTextRuns` (per-token `wordBreak: 'break-all'`) to every header cell.
  That is a _last-resort_ fallback (pdfmake 0.3.x has no hyphenation), not the fix: a mid-word break with
  no hyphen on a bank-facing document is a defect in its own right. The fix is a shorter localized label.
- #1937 shortened `vendor` `Auftragnehmer` → `Firma` and `invoiceAmount` `Rechnungsbetrag` → `Betrag`.
  The break-all mechanism **must stay** — vendor _data_ (server cap 200 chars, German compounds) still
  needs it, and #1937 explicitly accepted broken vendor names as unfixable without a layout change.
- Correct guard: a real-render assertion that the header cell resolves to `positions.length === 1` in the
  `de` locale. Character-count arithmetic is a weaker proxy (see recurring-patterns.md).
- `overviewPdf.test.ts:833-861` and `VENDOR_HEADER_WORST_CASE_LINES` use hardcoded `'Auftragnehmer'`
  fixtures/literals, _not_ the live bundle — so they survive translation changes, but their comments and
  test titles rot into claiming to describe the live DE labels.
- Consumers of `labels.*`: `overviewPdf.ts` (PDF) and `ReportContentEditor.tsx` (`<th>` preview, mobile
  card captions, column-toggle text). `ReportContentLabels` is `reportT`-derived and **not user-editable**,
  so a shortened label is safe — and must be identical in both surfaces by design.
- Glossary tension: `glossary.json` maps `Vendor` → `Auftragnehmer`. PDF column-header short forms diverge
  from glossary terms under a measured constraint; that exception needs recording _in glossary.json_, not
  just in translator memory, or an audit reverts it.

### Running header/footer must source strings from the report content model

`merge.ts`'s `header:` callback took the interface `t` for the generated-at label and never passed the
value (#1938) — a bare label on pages 2+ of every multi-page report. Fixed in PR #1982 to
`` `${reportContent.labels.generatedAt}: ${reportContent.sourceInfo.generatedAtText}` ``, byte-identical to
the page-1 block in `overviewPdf.ts:531`. Rule (from #1909): **artifact content resolves through
`reportT`/`reportFormatters`; only edit affordances use the interface `t`.**

- **Still violating it: `merge.ts:134`** — `buildPageFooter(t('sourceReports.table.pageLabel'))`. With
  interface DE / report EN the footer reads `Seite 2 / 5` under an English report. Needs a new
  `pageLabel` on `ReportContentLabels`; flagged as a follow-up in the PR #1982 review.
- Header height budget: `headerFootprint()` (`pageGeometry.ts`) models only the LEFT stack (title +
  two-line subheader = 57.2pt) + 20pt block margin → `PAGE_TOP_MARGIN = 93`. The generated-at line is the
  right child of a two-column node at implicit `'*'` (~257pt on A4) in `small` style, so appending the
  value cannot threaten the margin — even a two-line wrap (~18pt) stays far under the left stack.

## pdfmake typing: `Content` cannot be spread, but `Object.assign` needs no cast

Verified with `tsc --strict` in-repo (PR #2002 review):

- `{ ...r, color }` where `r: Content` → **TS2698 "Spread types may only be created from object types"**
  (the union includes `string`). Real error, not a lint rule — `tseslint.configs.recommended` is not
  type-checked, so `no-misused-spread` is not even enabled here.
- `Object.assign({}, r, { color })` **is** already assignable to `Content` — the `as Content` assertion
  seen in `overviewPdf.ts:702` is redundant. **Confirmed against the real project 2026-08-04** (not just a
  scratch file): deleting ` as Content` and running `npx tsc --noEmit -p client/tsconfig.json` yields no
  error at that line. PR #2002 shipped the redundant cast anyway (accepted as non-blocking M1).
  Method note worth reusing: the client project has ~63 **pre-existing** errors, so "tsc is clean" is not
  an available signal — ask "any error in MY file?" and prove tsc really checked it with a **positive
  control** (drop a `const __probe: number = "not-a-number"` into the same function and confirm tsc reports
  it). Without that control, a clean grep for your filename is indistinguishable from tsc never reaching it.
  Those 63 errors are stale-`shared`-type noise (`llmEnabled`, `claimable`, `areaId`) that survives
  `npm run build --workspace @cornerstone/shared`, so don't chase them.
- Cleanest fix: narrow the helper's return type. `type TextRun = { text: string; wordBreak?: 'break-all' }`,
  `buildUsageTextRuns(...): TextRun[]` — then `{ ...r, color }` compiles, `TextRun[]` stays assignable to
  `Content[]` (so `buildHeaderCell` and the vendor/usage cells keep working), and the signature stops
  over-promising that the helper might return a column/table/stack node.
- `Content` resolves via `@types/pdfmake/build/pdfmake.d.ts` → `export * from "../index"` → `interfaces.d.ts`,
  so `pdfmake/interfaces.js` and `pdfmake/build/pdfmake` give the identical type. Scratch typecheck files
  must live under `client/src/` to resolve it; `/tmp` gets TS2307.

## pdfmake run-splitting facts (read from source, PR #2002)

`node_modules/pdfmake/src/TextBreaker.js`:

- `wordBreak` is resolved **per item** (`getBreaks`, :124-127) via `StyleContextStack.getStyleProperty`, and
  `copyStyle(item)` copies `color` onto every produced word. So `wordBreak: 'break-all'` and `color`
  coexist on one run correctly, and `Object.assign` preserves the flag (own enumerable prop).
- A run whose whole text is `'\n'` still forces a line break: `splitWords('\n')` → `{ text: '', lineEnd: true }`
  (:43-46). Crucially `getLastWord` returns `null` when the last word has `lineEnd` (:88-90), so the
  cross-run merge that sets `noNewLine` (:135-141) is **skipped** after a newline-only run.
- Why that matters: had `noNewLine` landed on the `'\n'` word, `LayoutBuilder.js:1388`'s
  `hasEnoughSpaceForInline(...) || isForceContinue` would have pulled the next token onto the same line
  despite `Line.newLineForced`, silently swallowing the separator. Splitting a `'\n'`-prefixed run into
  per-token runs is safe, but check `getLastWord`/`noNewLine` before assuming so for any new split site.

## Usage-cell meta suffix renders at body size, not note size

The grey `areaText`/`attachmentsNote` suffix inherits `tableCell`'s `TABLE_BODY_FONT_SIZE` (8pt,
`pageGeometry.ts:104-106`) and deliberately does **not** set `DEPOSIT_NOTE_FONT_SIZE` the way the
deposit/split labels in the AllocatedAmount cell do (`overviewPdf.ts:720-740`). That is why
`usageSafeTokenChars` (from `BODY_WORST_CASE_CHAR_WIDTH_PT`) is the correct break threshold for it.
Adding a `fontSize` to those runs later would decouple threshold from rendered size.

## ADR-034 rule #1 is WRONG A SECOND TIME: `horizontalRatio` is a cell-origin bound, not an overflow check

Measured against `pdfmake@0.3.11` during the PR #2008 review (#2003). `ElementWriter.addLine`
(`src/ElementWriter.js:32`) captures `position = this.getCurrentPositionOnPage()` **before** placing the
line, so `positions[].horizontalRatio` records the **left origin of each text line**, never its right
extent. Consequences:

| fixture (A4, 40pt margins, five 80pt fixed cols) | `max(horizontalRatio)` |
| ------------------------------------------------ | ---------------------- |
| 400-char unbreakable `W` token in an 80pt column | 0.7006                 |
| **4000**-char unbreakable `W` token, same column | 0.7006 (identical)     |
| 4000-char token in one 500pt column              | 0.0097                 |
| `widths: [600, 50]`                              | 1.1916                 |
| widths summing 900pt                             | 1.2091                 |

The overview table is all-fixed-width summing to exactly `printableWidth()` (asserted at
`realRender.test.ts:1751`/`:1890`), so **no cell origin is ever past the right margin** ⇒
`max(horizontalRatio) <= 1` is _unconditionally true_ on every production fixture. It cannot detect token
overflow within a column — the failure mode `safeTokenChars`/`wordBreak: 'break-all'` exist to prevent.
It only catches table-box overflow, which the `tableOffsetsTotal + sum(_calcWidth) === printableWidth()`
assertion already forbids more strictly. Note even B2 as literally described (last column starts at
~511pt of 515.28) would have scored < 1.

**The assertion that DOES work: per-cell `cell._minWidth <= table.widths[c]._calcWidth`.**
`_minWidth` is computed _after_ `TextBreaker` applies `wordBreak`, so `break-all` collapses it to one
glyph. Measured on the real inline-run cell shape, Usage column `_calcWidth` = 69.28pt:

| cell                                              | `_minWidth`       |
| ------------------------------------------------- | ----------------- |
| prose + grey 30-`W` areaName **with** `break-all` | 33.54 → PASS      |
| same **without** `break-all` (the regression)     | 266.16 → **FAIL** |
| all plain prose                                   | 33.54 → PASS      |

Same cell with `'W'.repeat(400)`: 3548.83 without `break-all`, **8.87** with. So ADR-034's
"Do not assert `_minWidth`" paragraph is right about the **table-level** form but its `wordBreak`
false-positive rationale is **empirically false**, and it wrongly generalises to the **cell-level**
form, which is the discriminating revert-provable check. Needs no new renders — existing renders already
mutate both fields.

**PAID 2026-08-05** (wiki `b12ebb1`, parent ref `2a1862c7`, on the PR #2008 branch). Rule #1 now leads with
the per-cell `_minWidth <= widths[i]._calcWidth` content-extent check; `maxHorizontalRatio` was re-scoped
(not deleted) to "no element is positioned past the right margin" with an explicit vacuity warning against
asserting it on production content; the `_minWidth` ban was split into table-level (still banned, the
`starMaxMin` reason) vs per-cell (the correct check); finding B2's cross-reference now says its quoted
`_minWidth` figures are table-level sums. Third Deviation Log row added, carrying the process lesson:
**a revert test proves the helper can fire on _some_ input, not that it can fire on the input the rule is
about — the negative control must mutate the production code path the rule governs.** Note the ADR row I
wrote on 2026-08-04 is the one that introduced the wrong guidance, and #2003 implemented it faithfully:
when I replace a rule, I owe the replacement its own falsifiability check, not just a source-line citation.

### Probing pdfmake from bare Node (no jsdom)

Memory previously said `getBuffer()` callbacks don't fire in bare Node CJS. Workaround that does work
for layout-geometry probes (`createPdf().getBlob()` not needed):

```js
const PdfPrinter = require('<repo>/node_modules/pdfmake/js/printer.js').default;
const printer = new PdfPrinter(
  fonts,
  { existsSync: () => false },
  { resolve() {}, resolved: async () => {} },
  () => true,
);
const doc = await printer.createPdfKitDocument(def); // async in 0.3.x; mutates def.content in place
```

Fonts: real TTF paths under `node_modules/pdfmake/fonts/Roboto/`. The `virtualfs`/`urlResolver`/
`localAccessPolicy` ctor args are required (positional) or `resolveUrls` throws on `undefined.resolve`.
Line numbers differ between `src/` (528) and the `js/` build (490) — cite the file, not just the number.

## Measured overview-table width/`_minWidth` figures (PR #2008 re-review, 2026-08-05)

Measured directly by instrumenting `realRender.test.ts`'s `#2003` block. **Use these, not the numbers
in ADR-034's rule #1 prose — those are stale (see M1 in the PR #2008 round-2 review).**

| Quantity                                         | Value    | Source                                  |
| ------------------------------------------------ | -------- | --------------------------------------- |
| Usage `_calcWidth`, 6-col (`claim`)              | 186.78pt | `USAGE_WIDTH_6COL`, `overviewPdf.ts:58` |
| Usage `_calcWidth`, 7-col (`budget-overview`)    | 138.28pt | `USAGE_WIDTH_7COL`, `overviewPdf.ts:57` |
| Cell `_minWidth`, 30x'W' **with** `break-all`    | 7.098pt  | single 'W' glyph @ 8pt `tableCell`      |
| Cell `_minWidth`, 30x'W' **without** `break-all` | 212.93pt | 30 x 7.098pt                            |

Which use case maps to which shape: `claim` → 6 columns, `budget-overview` → 7 columns
(`reportContent.isOverview` selects the width, `overviewPdf.ts:536`).

**69.28pt is not the Usage column width and has not been for some time** — it is a pre-rebalance
figure that still appears at ADR-034 lines 105, 120, 129, 138 and in the Deviation Log. Treat any
`69.28` in this pipeline's docs as suspect.

Narrowest text column is **Vendor at 45pt** (`VENDOR_WIDTH`, `overviewPdf.ts:26`,
`VENDOR_SAFE_TOKEN_CHARS` = 5) — it is the binding constraint for the `wordBreak` rule, not Usage,
and as of PR #2008 it has no `_minWidth` coverage.
