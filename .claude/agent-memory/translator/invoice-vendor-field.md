---
name: invoice-vendor-field
description: Translation patterns for invoice vendor search field (Story #1736) — placeholder, no-results, validation, and error message keys
metadata:
  type: project
---

## Story #1736 — Invoice Vendor Field Translations (2026-06-17)

Keys added to `de/budget.json` under `invoiceDetail`:

| Key path                    | German value                                                   |
| --------------------------- | -------------------------------------------------------------- |
| `form.placeholders.vendor`  | `"Auftragnehmer suchen…"`                                      |
| `form.noVendorsFound`       | `"Keine Auftragnehmer gefunden"`                               |
| `validation.vendorRequired` | `"Bitte wählen Sie einen Auftragnehmer aus"`                   |
| `messages.vendorNotFound`   | `"Der ausgewählte Auftragnehmer konnte nicht gefunden werden"` |

**Why:** Search placeholder pattern `"{Noun} suchen…"` confirmed by existing keys at `vendors.searchPlaceholder` = "Auftragnehmer nach Name oder Fachrichtung suchen..." and `sources.budgetLines.move.pickerPlaceholder` = "Quellen suchen…". The short form `"Auftragnehmer suchen…"` matches `budget.json:973` `vendorPlaceholder` = "Auftragnehmer suchen…" exactly.

**validation.vendorRequired article note:** "Auftragnehmer" is masculine → accusative = "einen Auftragnehmer" (cf. `assignParentRequired` uses "ein Arbeitspaket" for neuter and "einen Haushaltsartikel" for masculine).

**messages.vendorNotFound pattern:** "Der ausgewählte X konnte nicht gefunden werden" — matches the standard error pattern used throughout the file (passive past, "konnte nicht … werden").

No glossary additions required — "Vendor" → "Auftragnehmer" already in glossary.
