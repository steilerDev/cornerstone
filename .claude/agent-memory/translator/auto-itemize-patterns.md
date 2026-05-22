---
name: auto-itemize-patterns
description: Translation patterns for the Auto-itemize (Paperless OCR extraction) feature — Issue #1547
metadata:
  type: project
---

## Auto-itemize Feature Translations — Issue #1547 (2026-05-22)

### Key added: `invoiceDetail.budgetLines.autoItemize.*` in `de/budget.json`

**Feature name translation decisions:**
- `button` ("Auto-itemize") → "Positionen Extrahieren" — follows `{Noun} {Verb}` capitalised button pattern; "Positionen" (line items, short for Budgetpositionen) + "Extrahieren" (extract)
- "Auto-itemize" as a noun concept (in error messages) → "Automatische Positionsextraktion" — full compound noun, avoids transliterated "Auto-Itemisierung"
- `loading` ("Extracting...") → "Wird extrahiert..." — progressive pattern consistent with "Wird geladen...", "Wird gespeichert..."

**UI copy patterns:**
- `modalTitle` → "Extrahierte Positionen prüfen" (past-participle adjective + noun + infinitive)
- `modeLabel` ("Apply mode") → "Anwendungsmodus"
- `modeAppend` ("Append to existing") → "Zu bestehenden hinzufügen"
- `modeReplace` ("Replace extracted items") → "Extrahierte Positionen ersetzen"
- `applyButton` ("Apply") → "Übernehmen" — preferred over "Anwenden" in confirm-action contexts
- `noLines` ("No line items detected") → "Keine Positionen erkannt"
- `noDocuments` ("No linked Paperless documents available") → "Keine verknüpften Paperless-Dokumente verfügbar"
- `docPickerTitle` ("Choose document to analyze") → "Dokument zur Analyse auswählen"
- `totalMismatchWarning` → "Extrahierter Gesamtbetrag ({{extractedTotal}}) stimmt nicht mit dem Rechnungsbetrag ({{invoiceTotal}}) überein" — preserve both placeholders; "Rechnungsbetrag" (invoice total) is the standard term

**Column headers** (reuse existing translations where applicable):
- `description` → "Beschreibung" (consistent with other column headers)
- `quantity` → "Menge" (consistent with `budgetLineForm.quantityLabel`)
- `unit` → "Einheit" (consistent with `budgetLineForm.unitLabel`)
- `unitPrice` → "Stückpreis" (consistent with `budgetLineForm.priceLabel` context)
- `total` → "Gesamt" (consistent with `budgetLineForm.totalLabel`)

**Error messages** (extraction service context):
- `unexpectedResponse` → "Der Extraktionsdienst hat eine unerwartete Antwort zurückgegeben."
- `providerError` → "Der Extraktionsdienst ist nicht erreichbar. Versuchen Sie es erneut oder schlüsseln Sie manuell auf." — "schlüsseln Sie manuell auf" for "itemize manually"
- `invalidResponseError` → "Der Extraktionsdienst hat eine ungültige Antwort zurückgegeben."

### LLM error codes in `de/errors.json` — reviewed and updated

Frontend-developer had pre-filled the 4 keys. Three were correct; one was updated:
- `LLM_NOT_CONFIGURED`: changed from "Auto-Itemisierung ist auf diesem Server nicht konfiguriert." → "Automatische Positionsextraktion ist auf diesem Server nicht konfiguriert." — avoids transliterated portmanteau
- `LLM_UNREACHABLE`, `LLM_INVALID_RESPONSE`, `LLM_UPSTREAM_ERROR`: accepted as-is (all use "Extraktionsdienst" consistently)

### "Itemize manually" verb phrase

"Itemize manually" → "manuell aufschlüsseln" — "aufschlüsseln" (to break down, to itemize) is the natural German equivalent of "to itemize" in the accounting/budget context. Consistent with the existing column header `itemized` = "Aufgeschlüsselt".
