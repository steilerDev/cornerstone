---
name: pr-1937-1938-pdf-header-labels
description: #1937/#1938 PDF running-header value and DE column-fit label test updates (2026-08-04)
metadata:
  type: project
---

## Fix 1 — #1938: Running header now shows label + value

**Production change**: `merge.ts` line 131 changed from
`t('sourceReports.table.generatedAt')` (i18n key only) to
`` `${reportContent.labels.generatedAt}: ${reportContent.sourceInfo.generatedAtText}` ``

**Test updated**: `merge.test.ts` — the header-callback assertion changed from
`'sourceReports.table.generatedAt'` to `'Generated At: 01/15/2026'`.
`makeContent()` has `labels.generatedAt: 'Generated At'` and `generatedAtText: '01/15/2026'`.
**Why:** The bare i18n key assertion let the value silently disappear again.

## Fix 2 — #1937: DE header labels fit their columns

**Production change**: `de/budget.json` `sourceReports.table.vendor`:
`"Auftragnehmer"` → `"Firma"` (5 chars, fits 45pt);
`sourceReports.table.invoiceAmount`: `"Rechnungsbetrag"` → `"Betrag"` (6 chars, fits 48pt)

**Pre-existing tests that were BROKEN by the translation change and needed updating:**

1. `realRender.test.ts` HIGH1 budget-overview test (was asserting 'Auftragnehmer'/'Rechnungsbetrag')
   - The old test also asserted `positions.length > 1` (multi-line wrap). The new short words
     render in 1 line, so assertions changed to `toEqual(1)`.
2. `realRender.test.ts` HIGH1 claim (6-col) test — same label updates.
3. `realRender.test.ts` production singleton describe (line ~2818) — 'Auftragnehmer' → 'Firma'.

**New tests added**: AC7 describe block at the end of `realRender.test.ts`:
- Length bounds: `content.labels.vendor.length <= 8`, `content.labels.invoiceAmount.length <= 9`
  (derived from 5.19pt/char measured Roboto average advance at 10pt bold)
- Exact value pins: `tDe('...vendor') === 'Firma'`, `tDe('...invoiceAmount') === 'Betrag'`
- EN stability: `tEn('...vendor') === 'Vendor'`, `tEn('...invoiceAmount') === 'Invoice Amount'`

## `VENDOR_HEADER_WORST_CASE_LINES` — leave as-is

`overviewPdf.ts` still uses `'Auftragnehmer'.length` (13 chars) to compute `VENDOR_HEADER_WORST_CASE_LINES`.
This is the **designed worst-case upper bound** for space reservation — intentionally conservative,
independent of the current DE translation. Do not change it.

## Pattern: update ALL stale translation-value assertions when DE label changes

When a DE translation key changes, grep realRender.test.ts for the OLD string value — there are
typically 3+ places (HIGH1 tests + production singleton describe). All must be updated together
or tests fail at a confusing set of locations.

## Column-fit math reference

- Roboto 10pt bold average advance: 5.19pt/char (measured: "Auftragnehmer" 67.50pt / 13 chars)
- VENDOR_WIDTH (45pt) / 5.19 = 8.67 → floor = 8 chars
- INVOICE_AMOUNT_WIDTH (48pt) / 5.19 = 9.25 → floor = 9 chars
- Labels with a space (e.g. "Invoice Amount") are NOT subject to single-token width constraint —
  pdfmake wraps at word boundaries, no break-all needed.
