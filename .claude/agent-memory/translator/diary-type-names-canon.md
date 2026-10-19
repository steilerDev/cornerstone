---
name: diary-type-names-canon
description: Diary entry type German names must match glossary (Tagesbericht, Begehung, Mangel, Notiz); old typeBadge values were glossary deviations fixed in #2221
metadata:
  type: feedback
---

Diary entry type labels in German are the glossary canon, not the older typeBadge wording:
Daily log = Tagesbericht, Site visit = Begehung, Defect/issue = Mangel, Note/general note = Notiz.
Banned/former forms: "Tägliches Protokoll", "Standortbesuch", "Problem" (issue), "Allgemeine Notiz".

**Why:** glossary.json lists these as doNotUse or formerly; common.json `diaryType` already used the canon, while `diary.typeBadge` still carried the old words. #2221 (EPIC-21 capture screen) aligned typeBadge to the canon.

**How to apply:** any new diary type label, chip or announcement in de must use the canon words above. When a diary key set disagrees with `common.diaryType`, follow the glossary and fix the older key in the same namespace.
