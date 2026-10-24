---
name: kind-gender-and-test-lists-2235
description: German gender clash for a runtime {{kind}} (offer=neuter, invoice=feminine) and the literal lists in glossary/parity tests that must grow with new terms and namespaces
metadata:
  type: project
---

Issue #2235 (costLines de): `{{kind}}` is passed as "Angebot" (neuter) or "Rechnung" (feminine), so no article or determiner can be attached to it.

- **Why:** a sentence like "Split this {{kind}}" cannot agree in gender for both values.
- **How to apply:** write `{{kind}}` as a label-style lead-in ("{{kind}}: Rest in Kostenpositionen aufschlüsseln") or pair both genders explicitly ("dieses Angebots oder dieser Rechnung"). Never put "diese"/"dieses" directly before `{{kind}}`.

Literal lists in tests that go stale when glossary terms, statusVocabulary leaves or namespaces are added (test files are not the translator's to edit; report them):

- `glossary.test.ts`: AC3 mapping table (every `statusVocabulary` leaf) and `PERMANENT_ALIASES` (every `formerly` entry must be pinned there).
- `i18n.parity.test.ts`: a hand-written `NAMESPACES` list of 16 entries versus 17 en files.
- `unionKeys.test.ts`: `LOCALE_JSON` lacks the new `costLines` namespace, the `57` set count and the declaration-order list.

Glossary terms added for #2235 (approved by PO): Offered, Invoiced (de "Berechnet", never "Abgerechnet"), Net, Gross, Basis (`formerly: Confidence`), Entered as, Own estimate, Professional estimate (`formerly: Pro estimate`).
