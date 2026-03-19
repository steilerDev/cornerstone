# Translator Agent Memory

## Glossary

- **Location**: `client/src/i18n/glossary.json`
- **Supported locales**: `de` (German)
- **Scope**: Domain-specific terms only (not common UI words like save, cancel, delete)

## Key Conventions

- Formal register: use "Sie" form in German
- Translation files: `client/src/i18n/{locale}/{namespace}.json`
- Namespaces: auth, budget, common, dashboard, diary, documents, errors, householdItems, schedule, settings, workItems
- Preserve `{{variable}}` interpolation placeholders exactly
- Preserve `_one` / `_other` pluralization suffixes

## Key Terminology (from glossary)

| English        | German (singular) | German (plural)  |
| -------------- | ----------------- | ---------------- |
| Work Item      | Arbeitspaket      | Arbeitspakete    |
| Household Item | Haushaltsartikel  | Haushaltsartikel |
| Vendor         | Auftragnehmer     | Auftragnehmer    |
| Budget Line    | Budgetposition    | Budgetpositionen |
| Milestone      | Meilenstein       | Meilensteine     |
| Invoice        | Rechnung          | Rechnungen       |
| Subsidy        | Förderprogramm    | Förderprogramme  |
| Diary Entry    | Tagebucheintrag   | Tagebucheinträge |
| Quotation      | Angebot           | Angebote         |

## Button/Action Label Convention

Action labels in German follow the pattern: `{Noun} {Verb}` with capitalised first letters on each word, e.g. `Rechnung Hinzufügen`, `Auftragnehmer Hinzufügen`, `Arbeitspaket Hinzufügen`. This matches the style already established in the existing de translation files (e.g. `"addVendor": "Auftragnehmer Hinzufügen"` in `budget.vendors.buttons.create`).

## Key Parity Notes

- `de/dashboard.json` was missing `page.actions` entirely at initial rollout — added 2026-03-19
- `de/budget.json` was missing `overview.actions` entirely at initial rollout — added 2026-03-19
- Always check key parity when picking up a new translator spec

## Initial Cleanup (2026-03-17)

Fixed terminology inconsistencies from EPIC-17 i18n rollout:

- "Arbeitselemente" / "Arbeitsgegenstand" / "Arbeitsgegenstände" → standardized to "Arbeitspaket(e)"
- "Haushaltsgegenstände" / "Haushaltselement" → standardized to "Haushaltsartikel"
- "Anbieter" (vendor context) → standardized to "Auftragnehmer"
