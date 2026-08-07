---
name: non-mandatory-register-1941
description: How to translate an sr-only "over limit but not your fault" hint without error/mandatory vocabulary (Issue #1941)
metadata:
  type: project
---

Issue #1941 added three sr-only strings to `sourceReports.editable` in `budget.json` describing a
non-enforced character-limit hint on report-wizard override fields (cover letter fields, per-invoice
usage text). Spec required `overMaxLengthHint` ("Longer than the recommended limit; shortening it is
optional.") to preserve an **informational, non-mandatory register** in German: no "müssen", no
"bitte", nothing implying user fault — because an over-limit value typically arrives from AI-generated
or derived content, not something the user typed.

Translations landed in `de/budget.json` (`sourceReports.editable`):

- `maxLengthHint`: "Maximal {{max}} Zeichen." (placeholder preserved)
- `overMaxLengthHint`: "Überschreitet die empfohlene Länge – eine Kürzung ist optional."
- `maxLengthReachedAnnouncement`: "Maximale Länge erreicht."

**Why the en dash, not a semicolon**: the English source joins two clauses with `;`, but a repo-wide
grep (`grep -rn ';' client/src/i18n/de/*.json`) found **zero** semicolon usage anywhere in the German
locale files — the established joiner for two independent clauses within one hint string is the en
dash `–` (see sibling key `allocatedAmountRequiredHint`: "Erforderlich – jeder Bericht enthält den
zugeordneten Betrag."). Always grep the target locale for the punctuation you're about to introduce
before assuming a literal transliteration of English punctuation is idiomatic — this is the same
dash-substitution principle as the en-dash-vs-em-dash convention, just triggered by a different
English character (`;` here, `—` there).

**Register technique**: avoided "Grenze" (boundary/limit — slightly closer to a rule/error framing)
in favor of "Länge" (length, neutral/descriptive), and phrased the non-obligation with "ist optional"
rather than a negated obligation construction like "muss nicht gekürzt werden" — the latter still
surfaces "müssen" even in negated form, which the spec explicitly ruled out.

No glossary entry proposed — all three keys are generic UI-chrome copy (character-limit hints), not
Cornerstone domain terminology, consistent with the glossary's documented scope.

Related: [[abschlag-glossary-shortform]] (the other case in this namespace with a hard space/length
constraint, but opposite lesson — that one is about PDF pixel budgets; this one explicitly has none
since these strings are `sr-only`).
