# Translator Agent Memory

## Glossary

- **Location**: `client/src/i18n/glossary.json`
- **Supported locales**: `de` (German)
- **Scope**: Domain-specific terms only (not common UI words like save, cancel, delete)

## Key Conventions

- Formal register: use "Sie" form in German
- Translation files: `client/src/i18n/{locale}/{namespace}.json`
- Namespaces: areas, auth, budget, common, dashboard, diary, documents, errors, householdItems, photoAnnotator, photoViewer, schedule, settings, workItems
- Preserve `{{variable}}` interpolation placeholders exactly
- Preserve `_one` / `_other` pluralization suffixes
- Detailed per-issue translation rationale from 2026 H1 (before Issue #1812) has been moved to [history-2026-h1.md](history-2026-h1.md) to keep this file within the 200-line budget

## Key Terminology (from glossary)

| English        | German (singular) | German (plural)  |
| -------------- | ----------------- | ---------------- |
| Work Item      | Arbeitspaket      | Arbeitspakete    |
| Household Item | Haushaltsartikel  | Haushaltsartikel |
| Vendor         | Auftragnehmer     | Auftragnehmer    |
| Budget Line    | Budgetposition    | Budgetpositionen |
| Budget Source  | Budgetquelle      | Budgetquellen    |
| Milestone      | Meilenstein       | Meilensteine     |
| Invoice        | Rechnung          | Rechnungen       |
| Subsidy        | Förderprogramm    | Förderprogramme  |
| Diary Entry    | Tagebucheintrag   | Tagebucheinträge |
| Quotation      | Angebot           | Angebote         |
| Area           | Bereich           | Bereiche         |
| Trade          | Gewerk            | Gewerke          |
| Draft          | Entwurf           | Entwürfe         |
| Unassigned     | Nicht zugewiesen  | —                |
| Correspondent  | Korrespondent     | Korrespondenten  |

## Button/Action Label Convention

- Two-word imperative buttons `{Noun} {Verb}` capitalise **both** words: `Rechnung Hinzufügen`, `Auftragnehmer Hinzufügen`, `Förderprogramm Hinzufügen`.
- **Exception**: phrases starting with a preposition (`Mit …`, `Zu …`, `Von …`) keep the trailing verb **lowercase** — standard German sentence-case, not title-case. Confirmed pattern: `"Mit SSO anmelden"` (auth.json), `"Mit Rechnung verknüpfen"` (householdItems.json, budget.json `invoiceLinkModal.title`/`.linkButton`). Do not capitalise the verb in this construction even though it's a button/title.

## Orphan Cleanup Heuristic

A DE key with **no EN counterpart** and **zero code references** (`grep -rn "<key>" client/src --include=*.tsx --include=*.ts`) is very likely a stale rename/supersession artifact — safe to delete. Confirmed case: `de/budget.json overview.costBreakdown.autoOriginBadge.*` (added Issue #1551, superseded by `autoItemize.createdFromAutoItemization`, orphan deleted during Issue #1812 full-namespace audit). Do NOT delete an orphan that still exists in the EN file (that's just a de-parity gap, not a true orphan) — only delete when it's absent from EN AND unreferenced in code.

## Full-Namespace Diff Audits (Issue #1812, 2026-07-07)

When a spec says "diff flattened key sets across N namespaces," write a quick Node script that `JSON.parse`s both `en/<ns>.json` and `de/<ns>.json`, flattens to dotted paths, and diffs both directions — far more reliable than eyeballing. Re-run after every edit; require 0/0 before finishing. See `/tmp/i18n-audit/diff.mjs` pattern (flatten via recursive object walk, skip arrays).

**Critical gotcha — duplicate top-level JSON keys in `en/*.json`:** `en/diary.json` has had duplicate top-level keys (`page`, `filterBar`, `detailPage`) reappear **twice now** (first noted pre-#1426, recurred in #1812) — a frontend-developer adding new keys to an existing section appends a **second** top-level object with the same name instead of merging into the first. `JSON.parse`/JS object literals silently keep only the **last** occurrence, so the _entire first block_ (e.g. `page.title`, `filterBar.search`, `detailPage.backLink`, and ~40 sibling keys) is silently dropped from what i18next actually loads — a real production bug (raw keys or `undefined` shown to English AND German users, since the DE file may still have the correct un-duplicated structure). This is **frontend-developer's file to fix**, not mine to touch, but:

- **Always** run the duplicate-key Python/Node check (`JSON.parse` with an `object_pairs_hook`/reviver that flags repeats) on any EN file before diffing, whenever the flattened diff shows a large, oddly-specific block of "missing in en" keys that already have plausible DE translations — that pattern is the signature of this bug, not a real translation gap.
- On the DE side, merge new keys into the **existing** section (never duplicate) — this keeps `de/*.json` valid even while the EN source is broken.
- **Flag the duplicate-key bug explicitly in the final report** every time it's found — it's a recurring defect worth escalating to dev-team-lead/frontend-developer for a real fix (dedupe + lint rule), not just a translator workaround.

## Diary sourceType / entryTypes Glossary Fixes (Issue #1812, 2026-07-07)

Found and fixed pre-existing (not newly introduced) glossary violations while auditing `de/diary.json`:

- `detailPage.sourceType.budget_source`: "Budget Quellen" (two words, wrong) → "Budgetquellen" (glossary compound)
- `detailPage.sourceType.subsidy_program`: "Zuschuss Programme" → "Förderprogramme" (glossary term)
- `entryTypes.subsidy_status` / `typeBadge.subsidyStatus`: "Zuschussstatus" → "Förderprogrammstatus" (glossary term; matches sibling compound pattern `Rechnungsstatus`, `Budgetüberschreitung`)

**Lesson**: full-namespace audits are a good opportunity to re-scan for `Zuschuss` (old/wrong term for Subsidy) and `Budget Quellen`/`Haushalts Artikel`-style incorrectly-spaced compounds, not just the "Arbeitselement"/"Haushaltsgegenstand"/"Budgetzeile" terms already tracked. Ran `grep -niE 'Budgetzeile|Arbeitselement|Arbeitsgegenstand|Haushaltsgegenstand|Haushaltselement|Anbieter'` plus a separate `grep '"Zuschuss'` across all touched namespaces as a final pre-handoff sweep — worth repeating on every full-namespace audit.

## Cost Perspective / Avg Abbreviation

`overview.costBreakdown.perspective.avg` = "Avg" → "Ø" (German average symbol, compact for 3-way Min/Ø/Max segmented toggle) — not "Durchschn." (too long for a toggle button).

## Section-Navigation Aria Label Pattern (Issue #1887, 2026-07-30)

Established de pattern for `"<X> section navigation"` aria labels (SubNav component instances) is the compound `"<X>-Abschnittsnavigation"` — confirmed from `schedule.json`'s `navigation.ariaLabel`: en "Schedule section navigation" → de "Zeitplan-Abschnittsnavigation". Applied same pattern for `budget.json` `sourceReports.subNavAriaLabel`: en "Budget section navigation" → de "Budget-Abschnittsnavigation". Note: `DashboardPage.tsx` ("Project section navigation") and `VendorsPage.tsx` ("Settings section navigation") hardcode this string directly in JSX rather than using `t()` — not a translator concern, but means those two instances have no de counterpart to check against; only use schedule.json as the reference pattern.

Also confirmed: "allocated" vocabulary in de/budget.json is consistently `zugeordnet`/`Zuordnung` (e.g. `allocatedAmount` → "Zugeordneter Betrag", `unallocatedExplained` → "...nicht zugeordnet"). Used for new `sourceReports.table.splitFootnote`: "Amount shown reflects only the portion allocated to this source." → "Der angezeigte Betrag umfasst nur den dieser Quelle zugeordneten Anteil."
