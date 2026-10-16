---
name: german-du-register
description: German UI addresses the user with informal "du" (owner decision 2026-10-16); how to convert Sie/Ihr forms and which third-party Sie/sie must stay
metadata:
  type: feedback
---

All German UI text addresses the user with informal **"du"**. The formal "Sie"/"Ihr" register is retired for the user. Owner decision, 2026-10-16: "no need to be overly polite".

**Why:** owner instruction in the EPIC-21 in-session fix (#2190, branch `fix/2190-german-du`). Earlier memory and glossary entries that quoted "Sie" examples are now superseded.

**How to apply:**

- Address forms: Sie → du, Ihnen → dir, Ihr/Ihre/Ihren/Ihrem/Ihrer/Ihres → dein/deine/deinen/deinem/deiner/deines, "Sie sich" → "dich", "für Sie" → "für dich".
- Imperatives take the du stem: "Versuchen Sie es erneut" → "Versuche es erneut", "Wählen Sie" → "Wähle", "Geben Sie … ein" → "Gib … ein", "Melden Sie sich" → "Melde dich", "Lassen Sie das" → "Lass das", "Brechen Sie … ab" → "Brich … ab".
- Inverted question forms change too: "Sind Sie sicher" → "Bist du sicher", "Möchten Sie" → "Möchtest du". Modal verbs after "Sie" become finite du forms: "Sie können" → "du kannst", "Sie müssen" → "du musst", "Sie haben" → "du hast". Subordinate clauses need the finite du form as well: "wenn Sie ... ändern" → "wenn du ... änderst", "bis Sie bestätigen" → "bis du bestätigst", "den Sie suchen" → "den du suchst".
- Keep third-party "Sie"/"sie"/"ihr"/"ihre" unchanged: a Rechnung, an app, a Filter, a Bereich or a Foto is "sie". Examples that stay: "Sie sind möglicherweise bereits eingereicht" (Rechnungen), "Sie wurde möglicherweise gelöscht" (Rechnung), "um sie anzumelden" (apps), "ihren Bereich verlieren" (Fotos).
- Exception, formal by design: outgoing documents to banks and authorities stay "Sie". This covers the generated cover letters (for example "anbei erhalten Sie die Budgetübersicht…" in `budget.json` `coverLetter`) and the LLM prompt text (`server/src/services/llmGateway/prompts.ts`, with its test at `prompts.test.ts:701`). The readers are third parties, not the user. Do not convert them when a du sweep is run.
- Agreement pass checklist (done 2026-10-16): after the Sie→du swap, check (a) subordinate clauses ("wenn/bevor/bis/dass/indem du … -st", e.g. "bevor du fortfährst", "indem du … hinzufügst"; the infinitive "fortfahren" and "hinzufügen" are the usual misses), (b) separable verbs ("du gibst … ein"), (c) modal + infinitive, where only the modal changes ("du musst … löschen"), and (d) stem-ending verbs such as "-ren" and "-hen", which a plain "-en" grep misses.
- Glossary: `client/src/i18n/glossary.json` `_meta.addressForm` (`de` is `du`) records the rule. The glossary has no German Sie forms.
- Mechanical conversion of a whole file is risky. Always re-read the converted values and grep for Sie/Ihr/sie afterwards. Justify every remaining hit.
