---
name: vocabulary-restructure-2258
description: EPIC-21 P6.1a (#2258) vocabulary pass decisions - bank report terms, lines wording, glossary JSON editing, orphan keys, test pins that must follow
metadata:
  type: project
---

**Bank report terms (glossary, 2026-11-25).** "Proof of funds" added as a supportingNoun term with de "Verwendungsnachweis" (deSource shipped). "Budget overview" added with de "Kostenaufstellung" (deSource approved, formerly "Budgetübersicht"). Report-type German labels use these; "Budgetübersicht" is retired from labels and kept only as a search alias.

**Why:** AC2 asks for the bank's own words. The product-owner ruling on these two terms was given by the orchestrator before the translator ran. If a later ruling rejects one, revert that term and its de labels.

**How to apply:** `glossary.test.ts` PERMANENT_ALIASES must list `['Budget overview', 'Budgetübersicht']` (QA owns the test). Until it does, the "lists every current former name" test fails.

**Glossary JSON editing.** Edit `glossary.json` with exact string replacement. A parse-and-restringify plus prettier rewrites every inline `{ "en": ... }` object and produces a noisy diff across the whole file.

**Lines wording.** "Lines" (no cost qualifier) becomes "Positionen" (invoice and extracted lines). "Cost line(s)" becomes "Kostenposition(en)" (glossary canon). "Task or purchase" becomes "Aufgabe oder Anschaffung".

**Done stays Abgeschlossen.** The glossary `Done` entry is Abgeschlossen. The older "Fertig" button note in [[german-conventions]] predates the glossary entry; the glossary wins.

**Home page name.** "Start" is the Home page canon. In prose, use "Startseite" (e.g. the term-hint definition for Not now). Bare "Start" in prose trips the glossary-leakage warning.

**Orphan de keys removed.** `de/budget.json` `invoices.{tableHeaders,actions,attribution,openItems}` had no en counterpart and no code references. They were already absent from en on beta.

**Audit false positives.** `i18n-audit.mjs` reports `draft.badgeLabel` (explicit `{ ns: 'diary' }`) and a JSDoc example `t('…columns.waitsFor')` in `TermHint.tsx`. Both are false positives, as is the existing `#2236` pattern.

**Test counts that follow the registry.** `unionKeys.test.ts` pins 80 sets, and the new term-hint sets make it 82 (QA updates the count and order).

Related: [[german-conventions]], [[glossary-proposals-pending-approval]], [[audit-and-verification-rules]].
