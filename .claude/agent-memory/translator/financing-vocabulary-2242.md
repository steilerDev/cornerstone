---
name: financing-vocabulary-2242
description: Financing (#2242) German decisions: per-kind gender templates, Covered items term, Own funds / Eigenmittel, Work tab quoting; plus the PERMANENT_ALIASES gotcha for new formerly names
metadata:
  type: project
---

Financing rename (#2242) mirrored into de: `budget:financing.*`, plus errors, history, documents panel and common deletions.

- **Gender:** per-kind titles are fixed strings (`form.titleNewSource` = "Neue Finanzierungsquelle", `form.titleNewGrant` = "Neues Förderprogramm"). Shared templates stay neutral: `actions.addSource`/`addGrant` = "{{object}} hinzufügen", `delete.titleSource`/`titleGrant` = "{{object}} löschen?", `empty.*` = "Noch keine {{objects}}".
- **Own funds** = Eigenmittel (`sourceType.discretionary`, and the DISCRETIONARY_SOURCE error).
- **Covered items** = Abgedeckte Posten (glossary, supportingNoun, formerly "Subsidy items"). Its en `formerly` entry must be pinned in `PERMANENT_ALIASES` in `glossary.test.ts`, otherwise "lists every current former name" fails. That test list is QA's file, not the translator's.
- **Tab word:** "Work" tab = "Arbeiten" (glossary tabWord). Errors refer to it as „Arbeiten“ with German quotes.
- **Link:** verb "Link document" = "Dokument verknüpfen" (glossary); "Link" alone = "Verknüpfen".
- **Scripted mirror:** deleted paths come from `git diff`-derived key lists; prune only containers emptied by the deletion. Result: de diff size matches the en diff exactly (324/181 in budget.json).

**Why:** the frontend renamed sources/grants across namespaces in one story; a scripted mirror kept parity exact.
**How to apply:** for a future rename, follow the same script pattern and check PERMANENT_ALIASES whenever a term gains a formerly entry.
