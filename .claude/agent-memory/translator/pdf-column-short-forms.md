---
name: pdf-column-short-forms
description: Measured-width PDF column header short forms (vendor → Firma, invoiceAmount → Betrag) and the rule for choosing them
metadata:
  type: project
---

Issue #1937. `sourceReports.table.vendor` ("Auftragnehmer", 13 chars, 67.5pt) overflowed its 45pt column. `sourceReports.table.invoiceAmount` ("Rechnungsbetrag", 15 chars, 78.66pt) overflowed its 48pt column. Font is Roboto Bold 10pt, about 5.19pt per char.

- `vendor` → **"Firma"**. No standard abbreviation of "Auftragnehmer" fits 8 chars without ambiguity ("Auftr." could mean Auftraggeber).
- `invoiceAmount` → **"Betrag"**. It is unambiguous next to "Zugeordneter Betrag".

**Rule:** when a glossary term overshoots a measured PDF column, prefer the shortest universally understood German synonym over a coined abbreviation. "Auftragnehmer" stays canonical everywhere else.

**Why:** the Abschlag precedent set the same measured-space approach.

**How to apply:** measure first (char count × ~5.2pt for Roboto Bold 10pt), then choose the short form.
