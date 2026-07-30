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
