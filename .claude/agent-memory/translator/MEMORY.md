# Translator Agent Memory

## Glossary

- **Location**: `client/src/i18n/glossary.json`
- **Supported locales**: `de` (German)
- **Scope**: Domain-specific terms only (not common UI words like save, cancel, delete)

## Key Conventions

- Formal register: use "Sie" form in German
- Translation files: `client/src/i18n/{locale}/{namespace}.json`
- Namespaces: areas, auth, budget, common, dashboard, diary, documents, errors, householdItems, schedule, settings, workItems
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
| Area           | Bereich           | Bereiche         |
| Trade          | Gewerk            | Gewerke          |

## Button/Action Label Convention

Action labels in German follow the pattern: `{Noun} {Verb}` with capitalised first letters on each word, e.g. `Rechnung Hinzufügen`, `Auftragnehmer Hinzufügen`, `Arbeitspaket Hinzufügen`. This matches the style already established in the existing de translation files (e.g. `"addVendor": "Auftragnehmer Hinzufügen"` in `budget.vendors.buttons.create`).

## Key Parity Notes

- `de/dashboard.json` was missing `page.actions` entirely at initial rollout — added 2026-03-19
- `de/budget.json` was missing `overview.actions` entirely at initial rollout — added 2026-03-19
- `de/common.json` was missing `aria.noArea`, `aria.noTrade`, `aria.selectArea`, `aria.selectTrade`, `aria.selectAssignment`, `aria.unassigned`, and `assignmentPicker.*` — added 2026-03-19 (Story #1035)
- `de/settings.json` had `manage.tags` which was replaced by `manage.areas` + `manage.trades` in Story #1035
- `de/common.json` was missing `subnav.settings.backups` — added 2026-03-22 (Issue #1146)
- `de/settings.json` was missing `backups` section entirely — added 2026-03-22 (Issue #1146)
- `de/errors.json` had four backup/restore keys with empty placeholder values (left by frontend-developer) — filled in 2026-03-22 (Issue #1146)
- `de/areas.json` created 2026-04-16 (Story #1237): `noArea` → "Kein Bereich", `pathLabel` → "Bereichspfad"
- Always check key parity when picking up a new translator spec

## Backup/Restore Terminology (2026-03-22)

- "Backup" → "Sicherung" (noun, e.g. "Sicherung erstellen", "Sicherungen")
- "Restore" / "Restore operation" → "Wiederherstellung" / "Wiederherstellungsoperation"
- "Backup & Restore" (page title) → "Sicherung & Wiederherstellung"
- "Restore & Restart" (button) → "Wiederherstellen & Neu starten"
- Frontend-developer may leave empty placeholder values in error keys when adding new error codes — the translator must fill these in.

## Initial Cleanup (2026-03-17)

Fixed terminology inconsistencies from EPIC-17 i18n rollout:

- "Arbeitselemente" / "Arbeitsgegenstand" / "Arbeitsgegenstände" → standardized to "Arbeitspaket(e)"
- "Haushaltsgegenstände" / "Haushaltselement" → standardized to "Haushaltsartikel"
- "Anbieter" (vendor context) → standardized to "Auftragnehmer"

## Ongoing Violations to Watch (2026-03-19)

- "Budgetzeile" is a non-glossary term that had slipped into `de/workItems.json` (modals + inlineErrors). Corrected to "Budgetposition(en)". Always scan for "Budgetzeile" when touching workItems or budget namespaces.

## Pluralization Note for "Budgetpositionen"

The German plural "Budgetpositionen" is used even when the count is 1 in aria-label contexts (e.g. `"{{count}} Budgetpositionen"`). If the frontend ever uses i18next pluralization keys (`_one`/`_other`), add both forms. For now the English source also uses a single key without suffix, so German matches.
