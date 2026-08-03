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

**Assertion strengthening round (2026-08-03):**
Three improvements landed in the same PR to tighten #1965 test assertions:

1. **Weak-to-strong marker assertions:** Replaced `not.toContain('†')` / `not.toContain('‡')`
   with `toBe(content.labels.splitNote)` / `toBe(content.labels.depositReducedNote)` — proves the
   marker is the actual inline label, not merely "not a symbol".

2. **Text assertions:** Added `toBe(expected.splitFootnoteText)` / `toBe(expected.depositFootnoteText)`
   using the locale-specific values, proving real i18n bundle resolution (not key echo).

3. **Rendered-surface AC 3.1:** Added `splitFootnoteText` to the locale expected objects and added
   `expect(allStrings.some((s) => s.includes(splitFootnoteText))).toBe(true)` after the existing
   deposit-reduced rendered-surface check.

**Fix 3 gotcha — NBSP + testing-library string matcher:**
`ReportContentEditor.test.tsx` stale fixture (`†`/`‡`) updated to use current marker format.
The marker `'less deposit'` (which is `'less deposit'` from locale — NBSP encoded as `\xc2\xa0`)
caused `getByText('less deposit:')` to FAIL because testing-library's `matches()` normalizes the
**element text** (NBSP→space) but compares against the **raw un-normalized matcher string**:
```
normalizedText === String(matcher)
// 'less deposit:' === 'less deposit:'  → FALSE
```
Fix: use a regex, which IS tested against the already-normalized text:
```ts
expect(screen.getByText(/^less\sdeposit:$/)).toBeInTheDocument();
```
The `\s` matches the plain space that NBSP normalizes to. This is a general pattern: whenever a
marker or label contains NBSP (from a locale file), use a regex for the `getByText` assertion, not
a plain string — they will never `===`-match the normalized element text.
