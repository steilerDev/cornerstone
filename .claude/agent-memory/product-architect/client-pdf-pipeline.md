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

| Module              | Role                                                            |
| ------------------- | --------------------------------------------------------------- |
| `loader.ts`         | Lazy `import()` of both packages, promise-cached                |
| `shared.ts`         | Page header/footer builders, table layout, PDF formatters       |
| `coverLetterPdf.ts` | Pure fn: report -> cover-letter `Content[]`                     |
| `overviewPdf.ts`    | Pure fn: report -> overview-table `Content[]`                   |
| `merge.ts`          | Orchestration: fetch docs, build, pdfmake render, pdf-lib merge |
| `sinks.ts`          | Output: download / preview blob URL / upload to Paperless       |
| `types.ts`          | `ReportPdfOptions`, `GeneratedReport`, `SkippedDocument`        |

Builders are pure and take `t: TFunction` -- they cannot use hooks, which is exactly why locale
and currency get dropped (see [[story-reviews]] B3). Anything locale-dependent must be threaded
in as a parameter.

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

TODO (mine): ADR-034 does not yet record this contract. Add it.

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

**Forward note for #1901 (AI generation):** `ReportContentOverrides` has no provenance concept, and
`buildReportContent` is a closed pure derivation with no injection seam. AI text dumped into `overrides`
would show the "edited" dot on every field, offer a reset-to-non-AI-text, and be silently wiped by
`guardedUpdate` on any step 1-4 change. Design a third layer (`baseline -> generated -> user`) or a
`generatedText` parameter — do not let it default into the overrides map.
