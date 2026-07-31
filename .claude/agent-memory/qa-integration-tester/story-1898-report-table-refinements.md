---
name: story-1898-report-table-refinements
description: Story #1898 (report table refinements) test rewrite — pdfmake 0.3.11 has no "N*" weighted-star width syntax; '2*' crashed real rendering, now fixed to plain '*' and confirmed via real render tests.
metadata:
  type: project
---

## RESOLVED (fix round, 2026-07-31): production fixed, tests updated to match

frontend-developer changed `overviewPdf.ts`'s `widths` arrays from `'2*'` to plain `'*'`
(`['*','auto','auto','auto','auto','auto','*']` / `['*','auto','auto','auto','auto','*']`), added a
`const columns: Content[]` type annotation, and removed the no-op `appendixByInvoiceId;` +
eslint-disable. QA updated the literal-value assertions that were still asserting the old `'2*'` in
both `overviewPdf.test.ts` (2 spots, ~L265/293 — plus their test-title strings) and
`realRender.test.ts` (2 spots, ~L399/421 in the "German overview table column widths" describe
block), and rewrote the file-header "KNOWN BLOCKER" doc comment (~L1-40) to past tense describing
the now-fixed bug instead of documenting it as current/expected-failing behavior.

Confirmed fully green after the fix: `overviewPdf.test.ts` 44/44, `realRender.test.ts` 11/11 (all 6
previously-failing real-render tests now pass for real, both en and de locales), `merge.test.ts`
19/19 — 74/74 total across the three suites. Coverage on `overviewPdf.ts`: 100% stmts, 94.82%
branch, 100% funcs, 100% lines (branch ceiling unchanged — see below, pre-existing and
unreachable-by-construction, not caused by this fix). `i18n.parity.test.ts` still green at 46/46.
Lint/prettier clean on both touched test files (prettier reported "unchanged").

## HISTORICAL: pdfmake 0.3.11 does not support "N*" (weighted star) column widths

Confirmed via an isolated repro (no report/invoice fixtures involved — a bare `pdfMake.createPdf({
content: [{ table: { widths: [...], body: [...] }, layout: {...} }], ... }).getBlob()` call using
only `loadPdfLibs()` from `client/src/lib/reportPdf/loader.ts`): any `widths` array containing the
string `'2*'` crashes with `unsupported number: NaN` inside pdfkit's `Renderer.renderVector` the
moment the table is actually rendered (`getBlob()`), regardless of what else is in the array (`'*'`
alone and `'auto'` alone, and combinations of the two, all work fine — only `'2*'` breaks it).

Root cause: `@types/pdfmake@0.3.x`'s `Size` type
(`node_modules/@types/pdfmake/interfaces.d.ts`) is `number | 'auto' | '*' | string` — the trailing
`| string` widens to accept `'2*'` at the TYPE level (so `tsc`/lint never catch it), but the actual
documented/supported values are only: a `number` (pt), a percentage string (`'50%'`), `'auto'`, or
plain `'*'` (equal-share). There is no weighted-star feature in this pdfmake version at all.

This bit story #1898: `overviewPdf.ts`'s new `widths` arrays ended in `'2*'` for the Usage column in
BOTH layouts — unconditional on every overview-table render. `overviewPdf.test.ts` (unit-level, only
inspects the returned `Content[]` tree, never calls `getBlob()`) couldn't catch this — only
`realRender.test.ts` (real, unmocked `generateReportPdf()` → real pdfmake `getBlob()`) did. Filed as
a BLOCKER bug, not fixed by QA at the time (out of QA's remit) — see [[test-infra-reference]] for the
general real-render-test rationale. 6 of realRender.test.ts's tests failed as a result (every test
that calls `generateReportPdf()`); tests that call `buildOverviewContent()` directly (content-shape/
i18n-interpolation checks) were unaffected and passed, since the crash happened downstream inside
pdfmake's layout engine, after overviewPdf.ts's own code had already finished successfully — so
overviewPdf.ts's OWN coverage (100% stmts/funcs/lines) was untouched by this bug. **Fixed in the
next round** — see "RESOLVED" section above; frontend-developer changed both arrays to plain `'*'`.

**How to apply:** if a future story wants proportional/weighted table columns in a pdfmake doc,
verify the width string against `node_modules/@types/pdfmake/interfaces.d.ts`'s `Size` type first,
or write a throwaway `getBlob()` smoke test before trusting any width syntax beyond `'*'`/`'auto'`/
number/percentage — the type system will not stop you from shipping an invalid value, and only a
real (unmocked) render test catches it.

## Coverage ceiling on overviewPdf.ts (94.82% branch, 100% stmts/funcs/lines)

Three unreachable-by-construction branches remain uncovered after full scenario coverage:

- `skipFootnotesByInvoiceId.has(invoiceId)` guard: always false-first-time because `skippedDocuments`
  is itself a `Map` (unique keys), so the "already has this key" else-branch can never fire within a
  single iteration.
- Split/deposit footnote blocks' `report.invoices.find((inv) => inv.invoiceId === invoiceId) ?? '—'`
  fallback: unlike the skip block (whose `invoiceId` comes from a caller-supplied, independently-keyed
  map and CAN reference an unknown invoice — that fallback IS tested), the split/deposit maps are
  built by iterating `report.invoices` itself and keying on `invoice.invoiceId`, so `.find()` is
  guaranteed to succeed. Don't chase these with contrived fixtures — same reasoning pattern as prior
  Record<Status,...> ceiling cases documented elsewhere in memory.

## Fixture-audit gotcha (recurring across #1898 scenarios)

When a marker/classification rule changes to require a NEW field (here: `isSplit && budgetLines.length

> 0`for †, replacing an unconditional-on-isSplit rule), grep every existing`isSplit: true`fixture
in the file(s) under test —`makeInvoice()`'s convenience defaults (`budgetLines: []`, `deposits: []`)
will silently satisfy the OLD rule's requirements while silently violating the NEW one, producing an
invoice that looks "split" but renders with NEITHER marker. This recurred in both
`overviewPdf.test.ts`and`realRender.test.ts`'s `makeMixedReport()` fixture (`splitNoDoc`/
`splitWithDoc`both needed explicit`budgetLines` added). See also the general pattern in
> [[test-infra-reference]].
