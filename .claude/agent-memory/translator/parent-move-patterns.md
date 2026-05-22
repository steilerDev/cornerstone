---
name: parent-move-patterns
description: Translation patterns for budgetLineForm parent-reassignment UI (Issue #1553)
metadata:
  type: project
---

## budgetLineForm Parent-Move Keys (Issue #1553, 2026-05-22)

Keys added to `de/budget.json` under `budgetLineForm`:

- `linkedItemLegend` → "Verknüpftes Element"
  - Consistent with existing table column `linkedItem` = "Verknüpftes Element" (budget.invoiceDetail.budgetLines.tableHeaders.linkedItem)
  - Used as a form section legend (fieldset/group label for the currently-assigned parent)

- `changeParentButton` → "Ändern"
  - Short action button to enter the parent-picker flow; plain imperative verb suffices here (no noun prefix needed)

- `cancelChangeParentButton` → "Abbrechen"
  - Consistent with existing `budgetLineForm.cancel` = "Abbrechen" in the same block

- `moveButton` → "Zum ausgewählten Element verschieben"
  - "verschieben" (to relocate/move) used for cross-table row move — NOT "überweisen" (financial transfer)
  - Pattern: "Zum [noun] [verb-infinitive]" for directional move buttons

- `movingButton` → "Wird verschoben…"
  - Progressive pattern: "Wird [past-participle-stem]…" consistent with "Wird gespeichert...", "Wird entfernt…", "Wird zugewiesen…"

- `moveCrossTableHint` → "Das Verschieben zu einem Haushaltsartikel überträgt diese Budgetposition in das Haushaltsartikelbudget."
  - "übertragen" chosen for cross-table row reassignment: conveys relocation without implying financial wire transfer ("überweisen")
  - Compound noun "Haushaltsartikelbudget" = "household item budget" (Haushaltsartikel + Budget)
  - Gerund subject: "Das Verschieben zu einem X" = "Moving to a X"

- `moveCrossTableHintReverse` → "Das Verschieben zu einem Arbeitspaket überträgt diese Budgetposition in das Arbeitspaketbudget."
  - Parallel construction to `moveCrossTableHint`
  - Compound noun "Arbeitspaketbudget" = "work item budget" (Arbeitspaket + Budget)

- `itemizedAmountLabel` → "Aufgeschlüsselter Betrag ({{currencySymbol}}) *"
  - "aufgeschlüsselt" is the established term for "itemized" in this codebase (see `invoiceDetail.budgetLines.tableHeaders.itemizedAmount` = "Aufgeschlüsselter Betrag")
  - Pattern follows `plannedAmountLabel` = "Geplanter Betrag ({{currencySymbol}}) *" — adjective + "Betrag" + currency placeholder + asterisk

## New Key: moveCrossTableNoInvoiceError (2026-05-22)

- `moveCrossTableNoInvoiceError` → Error message when user attempts cross-table move without invoice link
  - EN: "Cross-table moves require an invoice link. Either remove the move or link this budget line to an invoice first."
  - Pattern: User-facing error guidance, not a system error
  - Context: Thrown when non-invoiced budget line move is attempted from WI→HI or HI→WI
  - Constraint: No structural reformatting — direct translation acceptable; retain the serial "Either X or Y" structure if natural in target language

## Compound Nouns for Budget Contexts

- "household item budget" → "Haushaltsartikelbudget" (Haushaltsartikel + Budget, no hyphen)
- "work item budget" → "Arbeitspaketbudget" (Arbeitspaket + Budget, no hyphen)
