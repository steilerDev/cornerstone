---
name: inline-label-quoting-1973
description: Convention for quoting a UI column/label name inline inside a German sentence (warning/hint text)
metadata:
  type: project
---

When a hint/warning sentence needs to name a specific column header or UI label inline (e.g. "hiding Usage removes..."), the established `de/budget.json` precedent (`selectForMergeAriaLabel`: `"„{{description}}\" zum Zusammenführen auswählen"`) uses an opening German curly quote `„` paired with a **straight** closing quote `"` — not the typographically-correct closing `“`. This is inconsistent typography but is the codebase's existing convention; match it rather than "fixing" it to `„...“`, to avoid a gratuitous style drift in an otherwise-unrelated change.

Applied in Issue #1973 (`sourceReports.editable.usageHiddenAttachmentsWarning`): named the "Usage" column inline as `„Verwendung"`, matching the exact German column-header translation at `sourceReports.table.usage` (confirmed via the EN/DE table headers, not guessed) — the warning must name a column the user can actually find, so always cross-check the referenced column's own header translation before writing the sentence, don't independently translate the noun.

Also confirmed during this pass: `sourceReports.editable.columnVisibilityHint` deletion (superseded by these two new keys, AC 1.3) was already clean in `de/budget.json` before I started — zero dangling references anywhere in `client/src` — and a full flattened-key parity diff across the entire `budget` namespace (not just `sourceReports.editable`) came back 0/0 in both directions, so no pre-existing drift to report for this namespace at this time.

See [[history-2026-h1]] for the general dash-substitution rule (spaced en dash `–` for English's em dash `—`) applied again here in `allocatedAmountRequiredHint`.
