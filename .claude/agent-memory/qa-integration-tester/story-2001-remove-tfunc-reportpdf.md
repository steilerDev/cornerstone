---
name: story-2001-remove-tfunc-reportpdf
description: Issue #2001 — remove TFunction param from reportPdf/* functions; all affected test files and patterns
metadata:
  type: project
---

## Issue #2001 — Remove TFunction from reportPdf/* Functions

**Scope**: `buildCoverLetterContent`, `buildOverviewContent`, and `generateReportPdf` all lost their
`t: TFunction` last parameter. `buildReportContent` and the test-file-local helper
`renderOverviewPdfContent` (in `realRender.test.ts`) still take `t` — do NOT remove those.

### ReportContentLabels: 3 new required fields added simultaneously

```ts
coverLetterReferenceLabel: string;
coverLetterSubjectLabel: string;
skipReasonLabels: {
  footnoteFetchFailed: string;
  footnoteInvalidPdf: string;
};
```
Every fixture/`makeLabels()` helper that builds a `ReportContentLabels` object needs these 3 new
fields. Missing them causes a typecheck failure even if Jest passes.

### Round 1 — primary test files (commit fabb1aeb / 8bf1bf7d)

- `coverLetterPdf.test.ts`: removed TFunction import+mock; `replace_all: true` for 15 call sites;
  AC7 sentinel block proves `coverLetterReferenceLabel`/`coverLetterSubjectLabel` come from content
  labels, not `t()`.
- `overviewPdf.test.ts`: key-echo convention (label values = i18n key strings) preserves footnote
  assertions; AC7 sentinel block for skipReasonLabels.
- `merge.test.ts`: removed TFunction; sed for multi-line standalone `t,` at both 6-space and
  8-space indent; updated mock call-length assertions (3-arg → 2-arg).
- `buildReportContent.test.ts`: added `describe('labels — 3 new fields (#2001)')` with 4 assertions
  verifying `reportT()` is called for each new key (identity-t pattern: value == key string).

### Round 2 — missed test files (CI typecheck failed on PR #2007)

- `realRender.test.ts`: most complex. File has a test-file-local `renderOverviewPdfContent` helper
  (line 136) that STILL takes `t` — its standalone `tEn,`/`tDe,` arg lines must be KEPT. Only
  remove args from `buildOverviewContent`, `buildCoverLetterContent`, and `generateReportPdf`.
  - Single-line buildOverviewContent: `replace_all: true` on `, new Map(), tEn)` → `, new Map())`,
    `, new Map(), tDe)` → `, new Map())`, `, new Map(), t)` → `, new Map())`, `, skipped, t)` → `, skipped)`
  - Single-line buildCoverLetterContent: `replace_all: true` on `buildCoverLetterContent(effective, tEn)` → `buildCoverLetterContent(effective)`
  - Single-line generateReportPdf at one call site: direct Edit
  - Multi-line generateReportPdf calls: perl regex
    `s/(\{ attachDocuments: (?:true|false) \}[^\n]*),\n\s+t(?:En|De)?,\n/\1,\n/g`
    — targets lines after `{ attachDocuments: ... },` which only appears in generateReportPdf
    (NOT in renderOverviewPdfContent which uses `{ tableTitle: ..., sourceName: ... }`).
    WARNING: comment on same line blocks the regex — handle those with explicit Edit.
  - Added 3 new label fields to inline labels object (no makeLabels() helper in this file).
- `ReportContentEditor.test.tsx`: added 3 new fields to top-level `const labels` object with
  `REPORT_*` sentinel-style values.
- `applyOverrides.test.ts`: added 3 new fields to `makeLabels()` return value.
- `applyAiContent.test.ts`: same pattern as applyOverrides.

### Test results

- Round 1: 137 tests pass (coverLetterPdf 17, overviewPdf 99, merge 21, buildReportContent 68 incl. 4 new)
- Round 2: all 218 pass (realRender 74, ReportContentEditor, applyOverrides, applyAiContent combined 144)

### Key gotchas

- `for (const [t, formatters, expected] of [...])` loops inside `realRender.test.ts` destructure
  `tEn`/`tDe` into a `t` loop variable — those standalone `tEn,`/`tDe,` lines in the array
  literals are NOT args to remove.
- Standalone `t,`/`tEn,` belonging to `renderOverviewPdfContent` appear at specific lines: they
  are the 3rd argument to that helper, which follows `{ tableTitle: ..., sourceName: ... }`.
  Never remove these — the helper still takes `t`.
- perl `-0pe` flag loads entire file for multi-line matching.
- Comment on the `{ attachDocuments: ... }` line (`// no attachment pages...`) blocks the perl
  regex — must handle with explicit Edit.
