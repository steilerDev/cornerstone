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
- `de/budget.json` — `overview.costBreakdown.area.unassigned` and `sources.lines.unassignedArea` both updated to "Kein Bereich" 2026-04-19 (Issue #1295), aligned with `de/areas.json` and the `noCategory` → "Keine Kategorie" parallel pattern
- `de/budget.json` — `sources.lines.noCategory` orphan deleted 2026-04-19 (Issue #1313); `sources.lines.invoiceStatus.*`, `sources.lines.underArea`, `sources.lines.typeColumnHeader`, `sources.lines.statusColumnHeader` added 2026-04-19 (Issue #1313)
- `de/budget.json` — Issue #1356 (2026-04-25): `sourceFilter` rework — removed `label`, `allSources`, `clearAriaLabel`, `chipSelected`, `chipNotSelected`, `activeAnnouncement`; added `statusAnnouncement`; added new blocks `sourceRow.*` and `availableFunds.*`
- **Pre-existing gap** (as of 2026-04-25, outside #1356 scope): `sources.lines.typeColumnHeader` and `sources.lines.statusColumnHeader` exist in `en` but not `de` — needs a dedicated spec to fix
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

## Pluralization Note for "Budgetpositionen" / "Position"

- When the English source uses `_one`/`_other` keys, German uses "Position" (singular) / "Positionen" (plural).
- Example: `areaLineCount_one` = "{{count}} Position", `areaLineCount_other` = "{{count}} Positionen" (Issue #1247).
- "Budgetposition(en)" is the glossary term for the entity "Budget Line". The word "Position" alone (without "Budget-" prefix) is acceptable as a short count label in compact UI contexts.

## Confidence Level Labels (budget lines) — Issue #1247

- `own_estimate` → "Eigene Schätzung"
- `professional_estimate` → "Fachschätzung"
- `quote` → "Angebot" (glossary: Quotation = Angebot)
- `invoice` → "Rechnung" (glossary: Invoice = Rechnung)

## "Invoiced" Badge vs "Claimed" Invoice Status — Issue #1247

- `invoiceLinked` = "Verrechnet" — badge shown on a budget line that has a linked invoice (i.e. the cost has been invoiced/billed)
- `invoiceStatusLabels.claimed` = "Eingereicht" — invoice payment status (submitted for reimbursement)
- These are distinct concepts; do not conflate them.

## Budget-Line invoiceStatus Labels — Issue #1313

The `sources.lines.invoiceStatus.*` keys are budget-line-level status labels (different context from vendor invoice status labels):

- `none` → "Nicht abgerechnet" (no invoice attached)
- `pending` → "Ausstehend" (invoice submitted, not yet paid)
- `paid` → "Bezahlt" (invoice fully paid)
- `claimed` → "Beantragt" (subsidy claim submitted — distinct from `invoiceStatusLabels.claimed` = "Eingereicht" which is the vendor invoice status)
- `quotation` → "Angebot" (glossary: Quotation = Angebot)

Note: `claimed` here uses "Beantragt" (applied/requested for subsidy) rather than "Eingereicht" (filed/submitted) to distinguish the budget-line view (subsidy claim sense) from the vendor invoice status. Both are defensible; "Beantragt" better conveys the subsidy-application meaning.

## i18n Coverage Fixes — Issue #1306 (2026-04-19)

- Live-region contact toast pattern: "Kontakt {{name}} hinzugefügt/aktualisiert/gelöscht"
- `milestones.detail.error` (singular) → "Fehler beim Laden des Meilensteins. Bitte versuchen Sie es erneut." (cf. plural `milestones.error` = "…Meilensteine…")
- `invoices.modal.description` → full sentence with "Füllen Sie … aus, um … hinzuzufügen." (Sie form, imperative)
- `invoices.form.placeholders.notes` → "Optionale Notizen zu dieser Rechnung" (matches other placeholder style in budget)
- `dashboard:cards.budgetSummary.subsidiesOversubscribed` → "Einige Förderprogramme sind überzeichnet" (glossary: Subsidy = Förderprogramm)
- Tier-3 audit tip: `budget:invoices.actions.menuAriaLabel` was already present in de/budget.json — always verify before adding
- Orphan deletion: `de/householdItems.json` table.headers.room removed; `de/budget.json` vendors.tableHeaders.actions removed

## Mass-Move Dialog Patterns — Issue #1248

- `sources.budgetLines.move.*` added 2026-04-16 — mass-move dialog for budget lines
- "Destination source" / "Target source" → "Zielquelle" (compound: "Ziel" + short form "Quelle" of glossary "Budgetquelle")
- "Move lines" (button label) → "Positionen verschieben" — verb follows noun in imperative button labels of this type
- "claimed invoice" in warning context → "eingereichte Rechnung" (consistent with `invoiceStatusLabels.claimed` = "Eingereicht")
- Soft-warning copy pattern: state the non-effect first ("hat keinen Einfluss auf…"), then the advisory action ("Bitte prüfen Sie … mit Ihrem Steuerberater")
- Checkbox confirmation label pattern: "Ich verstehe, dass hierdurch … neu zugeordnet werden" — use "hierdurch" for concise causal phrasing
- "I understand" checkbox quoted reference → use German quotation marks „Ich verstehe" (not "Ich verstehe")
- `confirmDisabledHint` quotes the checkbox label using „…" German quotation style within the sentence
- `successToast_one` uses "wurde … verschoben" (sg); `successToast_other` uses "wurden … verschoben" (pl) — standard German passive past

## Bar Chart Summary Labels — sources.barChart (2026-04-19)

- `projectedRange` / `summaryProjectedLabel` → "Projiziert" (same as existing `projected`)
- `projectedUncertainty` → "Prognoseunsicherheit" (range/uncertainty band label)
- `headroom` → "Spielraum" (available unused budget headroom — natural German business term)
- `totalBadge` → "Gesamt: {{amount}}" (preserving {{amount}} placeholder)
- `totalBadgeAriaLabel` → "Gesamtbetrag: {{amount}}"
- `summaryPaidLabel` → "Bezahlt"
- `summaryClaimedLabel` → "Eingereicht" (bar chart summary; consistent with `barChart.claimed` = "Eingereicht")
- `srOnly` screen reader text: "Eingereicht {{claimed}}, Bezahlt {{paid}}, Projiziert {{projectedMin}} bis {{projectedMax}}, von Gesamt {{total}}"
- Obsolete keys removed in this update: `allocated`, `total`, `available`, `planned`

## Source Filter & Source Badge Patterns — Issue #1354 (2026-04-25)

- `overview.costBreakdown.sourceFilter.*`, `sourceImpact.*`, `sourceBadge.*` added to `de/budget.json`
- "Unassigned" (source filter / source badge context) → "Nicht zugewiesen" (glossary `Unassigned` term, not "Kein X" pattern which is used for area/category absence)
- "Budget source: {{name}}" (aria label) → "Budgetquelle: {{name}}" — always use full glossary term "Budgetquelle" in aria labels, short "Quelle" only in UI labels
- `sourceImpact.allocated` → "Zugeordnet"; `sourceImpact.remaining` → "Verbleibend"
- **Note**: `label`, `allSources`, `clearAriaLabel`, `chipSelected`, `chipNotSelected` and `activeAnnouncement` were added in #1354 but removed again in #1356 rework (chip-based filter replaced)

## Source Row & Status Announcement Patterns — Issue #1356 (2026-04-25)

- `sourceFilter.statusAnnouncement` → "{{selected}} von {{total}} Budgetquellen ausgewählt" (uses plural "Budgetquellen" from glossary)
- `sourceRow.selectedAriaLabel` → "{{name}}, ausgewählt – zum Abwählen klicken" (en-dash, infinitive construction)
- `sourceRow.deselectedAriaLabel` → "{{name}}, abgewählt – zum Auswählen klicken"
- `availableFunds.activeFilterCaption` → "({{selected}} von {{total}} ausgewählt)"
- Aria label click-instruction pattern: "– zum [Verb] klicken" (en-dash, infinitive with "zu")
