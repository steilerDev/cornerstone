---
name: source-report-split-inference
description: Why the report PDF's †/‡ footnote classification is a proxy, not exact — budgetLines[] and deposits[] are both this-source-scoped, so one cross-source case is undetectable client-side (found reviewing PR #1902 / story #1898)
metadata:
  type: project
---

# Source-report split inference is a proxy, not a fact

`client/src/lib/reportPdf/overviewPdf.ts` classifies footnotes as
`† iff isSplit && budgetLines.length > 0`, `‡ iff isSplit && deposits.length > 0`
(wording `constituted` iff a deposit carries `budgetSourceId === report.source.id`, else `reduced`).

**Both arrays are this-source-scoped server-side** — this is the load-bearing fact:

- `budgetLines[]` comes from Rail A rows, whose SQL `WHERE` is `wib2/hib2.budget_source_id = ${sourceId}`
  (`sourceReportService.ts` step a → step i). **Only this source's lines**, never other sources'.
- `deposits[]` is filtered `budgetSourceId === null || === sourceId` (step j).

## The blind spot

Invoice with all lines on source A + a deposit tagged to source B, no untagged deposits:
`isSplit` true, `budgetLines.length > 0`, `deposits.length === 0` → renders `†` (generic split).
AC #1898-4 says it should render `‡ reduced` — and that wording is *correct*, because the
invoice-level residual rule means a B-tagged deposit does reduce A's Rail A share
(see [[dual-rail-aggregation]]).

**It is indistinguishable from a genuine A/B line split in the response.** Not fixable client-side.
`overviewPdf.test.ts` [Scenario 15] pins the ambiguous shape as "pure line-split".

The mirror view is correct: from B's report the same invoice has `budgetLines: []` +
the tagged deposit → `‡ constituted`, no `†`.

## Proposed fix (not yet filed as of 2026-07-31)

Add to `SourceReportInvoice`, derived in the existing `isSplit` UNION query whose two arms already
separate line-sourced from deposit-sourced `source_id`s — no extra query, no other-source data leak:

```ts
/** How the cross-source split arises. Only meaningful when isSplit. */
splitKind: 'lines' | 'deposits' | 'both';
```

Client becomes `† iff splitKind !== 'deposits'`, `‡ iff splitKind !== 'lines'` — no `.length` proxies.

## Wiki deviation to fix (open)

`wiki/API-Contract.md` L~3610 and `shared/src/types/sourceReport.ts` both describe `budgetLines[]`
as *"all ibl lines per invoice (even portion 0)"*. Wrong — it is all of **this source's** ibl lines.
Pre-existing since #1878/#1891. Needs the correction + a Deviation Log row on API-Contract.md.

## pdfmake width gotcha (confirmed by QA on #1898)

`@types/pdfmake@0.3.x`'s `Size` type is `number | 'auto' | '*' | string` — the trailing `| string`
lets `'2*'` typecheck, but pdfmake 0.3.11 has **no weighted-star feature**; it crashes pdfkit's
`Renderer.renderVector` with `unsupported number: NaN` at `getBlob()`. Only valid widths: number,
percentage string, `'auto'`, plain `'*'`. Content-tree unit tests cannot catch this — only
`realRender.test.ts`'s real `getBlob()` can. The ux-designer spec for #1898 recommended `'2*'`;
implementation correctly deviated to `'*'`.
