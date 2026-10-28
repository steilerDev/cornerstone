---
name: german-conventions
description: German UI conventions and glossary canon used in translations: button/label casing, prepositional phrases, en dash, quotes, aria label pattern, terminology table, Abschlag/Invoice and related fixed words
metadata:
  type: reference
---

**Terminology (from glossary).** Work Item → Arbeitspaket(e); Household Item → Haushaltsartikel; Vendor → Auftragnehmer; Budget Line → Budgetposition(en); Budget Source → Budgetquelle(n); Milestone → Meilenstein(e); Invoice → Rechnung(en); Subsidy → Förderprogramm(e); Diary Entry → Tagebucheintrag/-einträge; Quotation → Angebot(e); Area → Bereich(e); Trade → Gewerk(e); Draft → Entwurf/Entwürfe; Unassigned → Nicht zugewiesen; Correspondent → Korrespondent(en). Cost line → Kostenposition(en). Always read `client/src/i18n/glossary.json` for the current canon.

**Button and label casing (superseded 2026-10-18).** German sentence case: only the first word and nouns (including nominalised verbs like `das Speichern`) are capitalised. Mid-label verbs, adjectives and adverbs are lowercase: `Rechnung hinzufügen`, `Änderungen speichern`. Old title-case is retired. Quoted labels inside hints must match the corrected label. A label whose first word is capitalised keeps that capital (`„Bezahlt am“`, `↑ Aufsteigend`).

- Prepositional phrases (`Mit …`, `Zu …`, `Von …`) keep the trailing verb lowercase: `Mit SSO anmelden`, `Mit Rechnung verknüpfen`.

**Quotes.** German UI always quotes with „“.

**Dashes.** en source uses em dash "—"; de uses spaced en dash "–" instead. Never copy the em dash. No semicolons in de locale files; use "–" as the clause joiner.

**Aria labels for section navigation.** `"<X> section navigation"` → `"<X>-Abschnittsnavigation"` (reference: schedule.json `navigation.ariaLabel`).

**Plurals and register.** Keep `_one`/`_other` for every pluralised key, and preserve `{{…}}` placeholders exactly. Use informal "du" in UI text (owner decision 2026-10-16). Text to third parties (cover letters, AI prompts) stays formal. See [German du register](german-du-register.md).

**Vocabulary choices that recur.**

- "allocated" → zugeordnet / Zuordnung (budget.json).
- Invoice-line column headers: "Item" → Position; "Dates" → Termine (not Daten); "Linked to" → Verknüpft mit.
- Pro-rated → anteilig, reusing the existing `splitBadge` wording.
- "Claimed" → eingereicht (not beansprucht).
- "Avg" in the cost perspective toggle → Ø.
- Photo tags → Zuordnung (see [photo tags](photo-tags-zuordnung-2226.md)).
- Total → Gesamt. Not yet split → Nicht aufgeschlüsselt. Unlink → Verknüpfung lösen. Company → Firma.
- Date-label "Start" (task timing, #2248) → Beginn, not Start: the glossary canon Start is the Home page name (de `Home` → `Start`), and the audit flags the word as glossary leakage.
- Done/close buttons: "Fertig" (never "Abgeschlossen"). Close → Schließen.

**Glossary-canon money words.** "Invoiced" → Berechnet (never "Abgerechnet"; it reads as settled). "Paid" → Bezahlt. "Submitted" → Eingereicht. "After grants" → Nach Förderung. "Net" → Netto, and "Gross" → Brutto.

**"AI" in UI copy** is always "KI", never "AI-…" (see [AI/KI terminology](ai-ki-terminology.md)).

**Progress labels.** Pick the closer sibling key as precedent (e.g. `autoItemize.analyzing` → "Analysiere… ({{seconds}}s)"). See [progress label style](progress-label-style.md).

**Inline PDF labels.** Multi-word inline labels need U+00A0 so pdfmake does not wrap mid-bracket. See [NBSP for inline labels](nbsp-inline-labels.md). Column-header short forms under a measured width are allowed (`Firma`, `Betrag`), but the glossary term stays canonical elsewhere. See [PDF column short forms](pdf-column-short-forms.md).

**Inline label quoting.** See [inline label quoting](inline-label-quoting-1973.md). Quote the referenced label's own translation.

**Non-mandatory and sr-only hints.** See [non-mandatory register](non-mandatory-register-1941.md).

**Singular/plural splits.** See [singular/plural split](singular-plural-announcement-split-2060.md).

**Abschlag.** Short form recorded in glossary.json; see [Abschlag short form](abschlag-glossary-shortform.md).

**Diary type names.** See [diary type names canon](diary-type-names-canon.md).
