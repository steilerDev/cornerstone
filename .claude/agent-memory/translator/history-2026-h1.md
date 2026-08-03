# Historical Translation Decisions (2026 H1, pre-#1812)

Detailed rationale for older namespace work, kept for reference but unlikely to need re-litigating.
See MEMORY.md for the current, load-bearing conventions.

## Key Parity Notes (chronological)

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
- `de/budget.json` — `invoiceDetail.budgetLines` block added 2026-05-10 (Issue #1401): `createFormLegend` + `autoLinkedSuccess`
- `de/budget.json` — Issue #1545 (2026-05-21): `invoiceDetail.budgetLines.unassigned`, `unassignedAriaLabel`, `assignButton`, `assigningButton`, `assignAriaLabel`, `assignedSuccess`, `assignParentRequired` added; `budgetLineForm.parentPickerLabel`, `parentPickerWorkItemTab`, `parentPickerHouseholdItemTab`, `parentPickerSeparator`, `parentPickerFieldsetLegend`, `parentPickerError` added
- `de/errors.json` — `BUDGET_LINE_ALREADY_ASSIGNED` had glossary violations ("Arbeitselement" → "Arbeitspaket", "Haushaltsgegenstand" → "Haushaltsartikel") — corrected 2026-05-21 (Issue #1545)
- `de/budget.json` — `budgetLineForm` parent-move keys added 2026-05-22 (Issue #1553): `linkedItemLegend`, `changeParentButton`, `cancelChangeParentButton`, `moveButton`, `movingButton`, `moveCrossTableHint`, `moveCrossTableHintReverse`, `itemizedAmountLabel` — see [parent-move-patterns.md](parent-move-patterns.md)
- `de/diary.json` — Issue #1672 (2026-06-13): `form.dailyLogVendorPlaceholder`, `form.workStartTime`, `form.workEndTime`, `form.workDuration`, `metadata.workStart`, `metadata.workEnd` added; `metadata.vendor` colon added ("Auftragnehmer:"); new `validation` object added with `workTimeEndBeforeStart`
- `de/budget.json` — `autoItemize` inline-draft keys added 2026-06-17: `creatingNewBadge`, `inlineFormLabel`, `discardInlineDraft`, `inlineDraftInvalid`, `inlineDraftCreateFailed`, `inlineDraftLinkFailed`, `inlineDraftPartialFailure`
- `de/budget.json` — `overview.costBreakdown.costBasis.*` added 2026-06-25: `label`→"Kostenbasis", `all`→"Alle", `paid`→"Bezahlt", `outstanding`→"Ausstehend"

## Backup/Restore Terminology (2026-03-22)

- "Backup" → "Sicherung"; "Restore" → "Wiederherstellung"; "Backup & Restore" (title) → "Sicherung & Wiederherstellung"; "Restore & Restart" → "Wiederherstellen & Neu starten"

## Initial Cleanup (2026-03-17)

Fixed terminology inconsistencies from EPIC-17 i18n rollout: "Arbeitselemente"/"Arbeitsgegenstand(e)" → "Arbeitspaket(e)"; "Haushaltsgegenstände"/"Haushaltselement" → "Haushaltsartikel"; "Anbieter" (vendor context) → "Auftragnehmer".

## Pluralization Note for "Budgetpositionen" / "Position"

When EN uses `_one`/`_other`, German uses "Position" (sg) / "Positionen" (pl), e.g. `areaLineCount_one` = "{{count}} Position" (Issue #1247). Bare "Position" (no "Budget-" prefix) is fine as a compact count label.

## Confidence Level Labels (budget lines) — Issue #1247

`own_estimate` → "Eigene Schätzung"; `professional_estimate` → "Fachschätzung"; `quote` → "Angebot"; `invoice` → "Rechnung".

## "Invoiced" Badge vs "Claimed" Invoice Status — Issue #1247

`invoiceLinked` = "Verrechnet" (budget line has a linked invoice) vs `invoiceStatusLabels.claimed` = "Eingereicht" (payment status, submitted for reimbursement). Distinct concepts.

## Budget-Line invoiceStatus Labels — Issue #1313

`sources.lines.invoiceStatus.*` (budget-line-level, different from vendor invoice status labels): `none` → "Nicht abgerechnet"; `pending` → "Ausstehend"; `paid` → "Bezahlt"; `claimed` → "Beantragt" (subsidy claim sense, distinct from `invoiceStatusLabels.claimed` = "Eingereicht"); `quotation` → "Angebot".

## i18n Coverage Fixes — Issue #1306 (2026-04-19)

Live-region contact toast: "Kontakt {{name}} hinzugefügt/aktualisiert/gelöscht". `milestones.detail.error` → "Fehler beim Laden des Meilensteins. Bitte versuchen Sie es erneut." `dashboard:cards.budgetSummary.subsidiesOversubscribed` → "Einige Förderprogramme sind überzeichnet".

## Mass-Move Dialog Patterns — Issue #1248

`sources.budgetLines.move.*` (2026-04-16): "Destination/Target source" → "Zielquelle"; "Move lines" → "Positionen verschieben"; soft-warning pattern states non-effect first, then advisory action; "I understand" checkbox uses „Ich verstehe" German quotes; `successToast_one/_other` uses "wurde/wurden … verschoben".

## Bar Chart Summary Labels — sources.barChart (2026-04-19)

`projectedRange`/`summaryProjectedLabel` → "Projiziert"; `projectedUncertainty` → "Prognoseunsicherheit"; `headroom` → "Spielraum"; `totalBadge` → "Gesamt: {{amount}}"; `summaryClaimedLabel` → "Eingereicht".

## Source Filter & Source Badge / Row Patterns — Issues #1354/#1356 (2026-04-25)

"Unassigned" (source context) → "Nicht zugewiesen" (not "Kein X"). "Budget source: {{name}}" aria → "Budgetquelle: {{name}}" (full glossary term in aria, short "Quelle" only in UI labels). `sourceImpact.allocated`/`remaining` → "Zugeordnet"/"Verbleibend". `sourceRow.selectedAriaLabel` → "{{name}}, ausgewählt – zum Abwählen klicken" (en-dash + infinitive-with-zu click-instruction pattern). `sourceFilter.statusAnnouncement` → "{{selected}} von {{total}} Budgetquellen ausgewählt".

## Draft / Auto-Save Terminology — Issue #1426 (2026-05-16)

"Draft" → "Entwurf"/"Entwürfe" (glossary). "Discard Draft" → "Entwurf verwerfen"; "Keep Draft" → "Entwurf behalten". Auto-save bar: "Gespeichert" / "Wird gespeichert..." / "Speichern fehlgeschlagen – wird beim nächsten Ändern erneut versucht". "Promote" button → "Speichern". Photo upload queue states: Queued/Uploading/Succeeded/Failed → "In Warteschlange"/"Wird hochgeladen ..."/"Hochgeladen"/"Fehlgeschlagen".

## Budget Line Assignment Patterns — Issue #1545 (2026-05-21)

`unassigned` → "Nicht zugewiesen"; `unassignedAriaLabel` → "Nicht zugewiesen – kein Arbeitspaket oder Haushaltsartikel verknüpft"; `assignButton` → "Zuweisen…"; `assigningButton` → "Wird zugewiesen…"; `assignedSuccess` → "Budgetposition '{{lineDescription}}' wurde {{parentItemName}} zugewiesen"; `parentPickerLabel` → "Zuweisen zu".

## photoAnnotator Namespace Patterns (Issues #1475/#1477/#1478, 2026-05-18/19)

Tool aria-label: `{Noun}-Werkzeug` (e.g. "Pfeil-Werkzeug", "Linien-Werkzeug"). Shape-added announcement: `{Noun} hinzugefügt`. Highlight → "Markierung". `toolMeasurement` → "Maß-Werkzeug" (not "Maßband"/"Messen"); `toolFreehand` → "Freihand-Werkzeug". Compound rule: "Annotations-" (noun stem) not "Annotierungs-" (gerund). "Annotate" verb → "annotieren" (glossary). `photoViewer.json` metadata panel: `saving` → "Wird gespeichert..."; inline `noArea` → "(kein Bereich)" lowercase parenthesised (distinct from heading-form `areas.noArea` = "Kein Bereich").

## Auto-itemize Feature — Issues #1547/#1551/#1564/#1584/#1591 (2026-05-22 to 2026-05-26)

See [auto-itemize-patterns.md](auto-itemize-patterns.md). "Auto-itemize" button → "Positionen Extrahieren"; "Itemize manually" → "manuell aufschlüsseln". Edit aria-label pattern: "X der Position bearbeiten". `autoItemize.createdFromAutoItemization` badge → "Auto-created"/"Automatisch erstellt" — this is the **current, live** badge for auto-created budget lines (used in `AutoItemizePage.tsx` and `PaperlessInvoiceReviewPage.tsx`).

**Superseded/orphaned**: `overview.costBreakdown.autoOriginBadge.{label,ariaLabel}` was added 2026-05-29 (Issue #1551) for the same "auto-created badge" concept but was later superseded by `autoItemize.createdFromAutoItemization` — the EN key was removed at some point but the DE orphan lingered undetected until the #1812 full-namespace audit (2026-07-07) found and deleted it. **Lesson: when a DE key has no EN counterpart AND no code references it, it's very likely a stale rename artifact — safe to delete after confirming both conditions with grep.**

## Paperless-first Invoice + autoItemize from Document — Issue #1679 (2026-06-15)

"Correspondent" added to glossary → "Korrespondent"/"Korrespondenten". `createAndItemize` → "Rechnung Erstellen & Aufschlüsseln". Progress states use "wird ... analysiert…" pattern, "KI" for AI.

## Invoice Vendor Field — Story #1736 (2026-06-17)

See [invoice-vendor-field.md](invoice-vendor-field.md). `placeholders.vendor` = "Auftragnehmer suchen…"; `validation.vendorRequired` = "Bitte wählen Sie einen Auftragnehmer aus".
