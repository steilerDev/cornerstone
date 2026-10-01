---
name: inline-label-quoting-1973
description: German UI text always uses proper German quotation marks „…“, never mixed or ASCII quotes
metadata:
  type: project
---

**Rule**: German UI text always quotes with „ (U+201E) to open and “ (U+201C) to close. Never use the ASCII straight double quote (U+0022) and never use U+201D (the English right double quote). Never mix forms.

**Why**: During Issue #1973, I cited two strings (`selectForMergeAriaLabel` and `usageHiddenAttachmentsWarning`) both using a mixed form — U+201E „ to open but an ASCII straight quote (U+0022) to close — declaring them the established convention. But a count revealed the entire `de/` codebase had exactly **2** U+201E characters and **0** U+201C characters before the change — both were the mixed form, and one cited the other as precedent. That's n=1 coincidence masquerading as a convention. Issue #2013 (2026-09-30) swept all 41 instances across `de/*.json` and replaced them with proper German quotes, then added a `client/src/i18n/i18n.quotes.test.ts` deterministic check to prevent reintroduction. **Key lesson**: count instances before citing a convention; a single prior use is a coincidence, not a pattern.

**Cross-check rule**: When a hint/warning names a UI column or label inline (e.g. the hint about hiding Usage), the quoted name must match the exact translation of that column's own header. Example from #1973 / #2013: `usageHiddenAttachmentsWarning` names the column as `„Verwendung“`, matching `sourceReports.table.usage` exactly — the user must be able to find the named column in the UI. Always verify the referenced element's translation; do not independently translate the noun.

See [[history-2026-h1]] for the en dash rule (spaced `–` instead of em dash `—`), and [[nbsp-inline-labels]] for width constraints in PDF inline labels.
