---
name: pdfmake-rendering-verification
description: pdfmake report-PDF review technique (render-and-rasterize) and the dontBreakRows row-split bug found in PR #1935 (Issue #1929)
metadata:
  type: project
---

## Reviewing `client/src/lib/reportPdf/` changes: render, don't estimate

`client/src/lib/reportPdf/{shared,overviewPdf,merge,coverLetterPdf}.ts` produce a pdfmake
document (no CSS, no React, no design tokens — this whole area is out of scope for the usual
token/dark-mode/responsive checklist). The only meaningful design review here is on the *printed
artifact*. Character-width estimates from nominal font metrics are unreliable (I estimated the
deposit-badge run `" (Abschlagszahlung)"` would clip in a 75pt column at fontSize 8 — it didn't;
real Roboto metrics are narrower than my estimate). Always render a real PDF and rasterize it
instead of reasoning from font-metric arithmetic:

1. Write a throwaway `*.test.ts` under `client/src/lib/reportPdf/` (jsdom test env can still use
   `node:fs` — it's Node underneath, not a real browser sandbox) that calls the real
   `generateReportPdf` (or `buildOverviewContent` directly) with a hand-built `ReportContent`
   fixture, and `writeFileSync`s the blob bytes to `/tmp/*.pdf`. Needs the same `Blob.prototype.arrayBuffer`
   FileReader polyfill `realRender.test.ts` already carries (jsdom's Blob doesn't implement it).
2. `pdftoppm -png -r 150 /tmp/x.pdf /tmp/x` (poppler-utils, preinstalled in the sandbox) rasterizes
   every page to PNG.
3. Read the PNGs with the Read tool (multimodal) for direct visual inspection — this is the only
   way to actually verify AC-language like "no column collapses," "no clipping," "no orphaned
   cells" instead of trusting the code comments' own arithmetic.
4. Delete the scratch test file(s) before finishing — never leave them committed; confirm `git
   status --porcelain` is empty. `ReportContent`/`ReportContentRow` shapes: see
   `client/src/lib/reportContent/types.ts` (`refundNoteText` is `string`, not nullable — use `''`).

## Confirmed bug: `TABLE_LAYOUT.dontBreakRows: true` does not prevent row-splitting (PR #1935)

Setting `dontBreakRows: true` (pdfmake 0.3.11, this project's pinned version) does not reliably
defer an entire table row to the next page when the row is taller than the remaining space on the
current page but well within a full page's body height. Reproduced with the PR's own
`realRender.test.ts` regression fixture (15 invoices, `usageText` override on
`inv-long-0/5/10/14` with the committed ~275-char `longUsageText` string, unmodified): the last
overridden row split across pages 2→3, landing an orphaned Usage-only fragment on page 3 with
every other column (vendor, invoice #, date, both amounts) blank — the exact defect pattern
#1929 was filed to fix. Root cause not yet diagnosed (pdfmake internal row-height/page-break
interaction with `headerRows` + mixed fixed/star widths is the leading suspect, unconfirmed).

Why the committed test didn't catch it: it only asserts `pdfDoc.getPageCount() >= 3` and that the
full usage string appears once in the content tree — both stay true even when the string's
occurrence is physically split across two pages. A real regression test for this needs per-page
text-location verification (e.g. pdf-lib page text extraction, or checking a row's vendor name
and its usage text land on the same page), not just whole-document presence + page count.

Design-review implication: don't take an AC like "rows are not split across pages" as satisfied
just because the layout code sets the documented pdfmake flag and the existing tests pass — for a
`dontBreakRows` claim specifically, render-and-inspect before approving.
