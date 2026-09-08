---
name: issue-2046-open-items-translation
description: Issue #2046 invoices open items — 23 new German translation keys for deposit/refund open items list
metadata:
  type: project
---

## Translation Summary — Issue #2046 (feat/subsidy-no-category-items)

Completed translation of 23 new English keys into German for the invoices open-items feature.

### Keys Translated

**Under `invoices.tableHeaders`** (2 keys):
- `stillDue`: "Noch fällig" — unpaid final payment plus unpaid deposits
- `stillDueHint`: Full explanation that deposits are already included in the figure, not additional

**Under `invoices.openItems`** (21 keys):
- `toggleLabel`, `toggleDisabledHint`, `defaultSortHint` — UI control labels
- `containerLabel`: "Nur Abschlagszahlungen" — badge label for deposits-only quotations (preserves "only" qualifier to signal row is a container, not itself an open item per AC10)
- `overdueLabel`, `depositOverdueLabel` — critical distinction maintained:
  - "Überfällig" (invoice is late)
  - "Abschlag überfällig" (a deposit is late, using short form for clarity)
- `depositOrdinal`: "Abschlag {{index}}/{{total}}" — preserves interpolation
- `childOf`, `childIncludedCaption`, `childExcludedCaption` — critical distinction maintained:
  - "Im Rechnungstotal oben enthalten" (deposit included in parent total)
  - "Wird unten separat aufgeführt" (refund reported separately)
- `expandLabel_one/_other`, `collapseLabel_one/_other` — plural forms correct
- `summaryOpenPayable`, `summaryRefundsDue`, `summaryRefundsDueHint` — payment summary
- `empty.message`, `empty.description` — empty state

### Glossary Compliance

All domain terms verified:
- **Deposit**: "Abschlagszahlung" / "Abschlagszahlungen" / "Abschlag" (short form) ✓
- **Refund**: "Rückerstattung" / "Rückerstattungen" ✓
- **Invoice**: "Rechnung" / "Rechnungen" ✓
- **Vendor**: "Auftragnehmer" ✓

All terms use glossary-approved singular/plural forms and the approved short form "Abschlag" where appropriate (depositOrdinal, depositOverdueLabel).

### Key Design Decisions

1. **`containerLabel`**: "Nur Abschlagszahlungen" — badge label preserving the "only" qualifier to signal that the row is a container (a quotation listed purely because of deposits), not itself an open item (AC10)
2. **`depositOverdueLabel`**: "Abschlag überfällig" — deliberately using glossary short-form "Abschlag" to create visual distinction from "Überfällig" (which refers to the invoice itself being late)
3. **`childIncludedCaption` vs `childExcludedCaption`**: German phrasing keeps the semantic distinction clear even for screen readers:
   - Deposit inclusion: "...in...enthalten" (included in)
   - Refund exclusion: "...separat aufgeführt" (reported separately)
4. **Plural forms**: German `_one` and `_other` suffixes handle both deposit counts and expansion labels correctly

### No Glossary Additions Needed

All new keys use existing glossary terms. "ContainerLabel" ("Nur Abschlagszahlungen") is not a domain term requiring glossary entry — it's a UI badge label using the plural form of the existing "Deposit" glossary term, with "Nur" (only) added to preserve the semantic meaning from the English original.

### Verification

- JSON validity: ✓ (both en/budget.json and de/budget.json parse)
- Key parity: ✓ (23 keys present in both EN and DE)
- Glossary compliance: ✓ (all domain terms match glossary)
- Interpolation preservation: ✓ (`{{invoiceNumber}}`, `{{count}}`, `{{index}}/{{total}}`)
- Plural form correctness: ✓ (`_one` and `_other` suffixes preserved)
