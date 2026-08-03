---
name: story-1965-report-legend
description: #1965 — PDF legend footnotes reinstated; locale-aware positive check pattern; goneFootnotes loop tail extension
metadata:
  type: project
---

Story #1965 reinstated legend sentences for split and depositReduced footnotes in
`buildReportContent.ts` after they were removed in #1959.

**Key changes (2026-08-03):**
- `buildReportContent.ts` now pushes `{id:'split', marker:..., text:...}` to `footnotes[]`
  when `splitInvoiceIds.size > 0`, and `{id:'depositReduced'...}` when
  `depositReducedInvoiceIds.size > 0`.

**Test pattern learned — locale-aware positive check inside a locale for-loop:**
When adding a positive "this text IS present" assertion inside an `[en, de]` locale for-loop,
use `expected.depositFootnoteText` (locale-specific) rather than a hardcoded English string.
Task instructions may provide the English literal — adapt to `expected.<key>` to avoid
a DE-iteration failure. Adding a field to each entry of the `as const` locale array is the
correct fix.

**goneFootnotes extension pattern:**
To assert a text was REMOVED from goneFootnotes AND add a positive check it IS now present:
1. Remove the string from `goneFootnotes` array
2. Add `depositFootnoteText: '<locale-specific-text>'` to the `expected` object for each locale
3. Right after the goneFootnotes inner-for loop, add:
   ```ts
   const depositFootnoteText = expected.depositFootnoteText;
   expect(allStrings.some((s) => s.includes(depositFootnoteText))).toBe(true);
   ```

**Coverage result:** `buildReportContent.ts` — 100% statements, 97.5% branches (uncovered:
`if (options?.includeCoverLetter ?? false)` null-coalescence truthy path, not reachable from the
new footnote tests).
