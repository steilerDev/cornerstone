---
name: nbsp-inline-labels
description: Multi-word inline PDF labels must use U+00A0 (NBSP) instead of a regular space to prevent mid-bracket line wraps in pdfmake tables
metadata:
  type: project
---

Issue #1959 (PR review round): `depositReducedInlineLabel` (`de/budget.json`: "abzgl. Abschlag") was
the only inline report-table label containing an internal space — every sibling label
(`Teilbetrag`, `Abschlagszahlung`, `(Rückerstattung)`) is a single word. pdfmake wraps at any space
by default, so this one broke across two lines with the opening/closing bracket separated —
unacceptable in a document sent to a bank.

**Fix applied**: replaced the regular space between "abzgl." and "Abschlag" with a literal U+00A0
(non-breaking space, UTF-8 bytes `c2 a0`) in the JSON string — not a ` ` escape. Confirmed via
`xxd` that the EN sibling key (`depositReducedInlineLabel`: "less deposit", owned by
frontend-developer) already uses the same literal-NBSP convention in this repo, not the backslash
escape form. NBSP has the identical glyph advance to a regular space, so this is a **zero-width-cost**
fix — no page-geometry/column-width constant needs to change, and any prior width measurement in pt
remains exactly valid.

**Rule going forward**: any new multi-word inline label destined for a narrow pdfmake table column
(report PDF overview/cover-letter tables) must use NBSP between its words, not a regular space,
UNLESS the column is verified wide enough that the full label plus its preceding run (amount +
label share one run stream) never approaches the column's declared pt width. Do not rely on a
label-alone width calculation — pdfmake lays out the amount and the label as one continuous run, so
the combined width is what determines wrapping, not the label's width in isolation (see
[[abschlag-glossary-shortform]] for the width-budget details of this specific case).

**Verification method**: width arithmetic alone missed this bug (see the same lesson at
[[audit-pitfalls]] for the analogous "measured the wrong quantity" pattern in a different context).
The only verification that caught it was rendering the _real_ pdfmake pipeline end-to-end and
looking at the PDF. Reusable recipe (no committed harness exists for this — built ad hoc, deleted
after use):

1. Write a temporary `*.test.ts` file under `client/src/lib/reportPdf/` (Jest picks it up
   automatically; delete it before handoff — it is not a real test, just a rendering harness).
2. Reuse the real, unmocked pipeline exactly as `realRender.test.ts` does: real i18next instance
   loaded with the actual `en/budget.json`/`de/budget.json`, real `buildReportContent` +
   `generateReportPdf` (from `merge.ts`), real `loadPdfLibs()` (real pdfmake@0.3.11 + embedded
   fonts). Needs the `Blob.prototype.arrayBuffer` FileReader polyfill from that file's `beforeAll`
   (jsdom's Blob polyfill lacks `.arrayBuffer()`).
3. `fs.writeFileSync('/tmp/x.pdf', Buffer.from(await result.blob.arrayBuffer()))`.
4. `pdftoppm -png -r 200 /tmp/x.pdf /tmp/x` then `Read` the resulting PNG to visually inspect.
5. Run with `NODE_OPTIONS=--experimental-vm-modules npx jest <path> --maxWorkers=1`.
