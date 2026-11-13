---
name: area-page-strip-wording-2251
description: de wording for the Area page strip and detail.* (#2251) - sibling alignment with Task/Purchase strips, count-based late/open forms
metadata:
  type: project
---

Area detail strip and sections were translated for #2251 (P5.7). Choices to keep sibling pages consistent:

- `detail.strip.noneYet` = "Noch keine" (matches householdItems `purchasePage.strip.noneYet`).
- `detail.strip.latest` = "zuletzt {{date}}" (lowercase, matches photos cellLabel; the index `count.latest` stays "Zuletzt {{date}}").
- `detail.strip.late` = "{{count}} verspätet" (count form of glossary Late "Verspätet").
- `detail.strip.open` / `rooms.open` = "{{count}} offen" (matches `index.count.openOfTotal`).
- `detail.cost.overview` = "Finanzen öffnen" (imperative link label, "go to the Money page", like ", Bereich öffnen"; NOT "Offene Finanzen", which reads as "outstanding finances"). Link labels take verb/noun-phrase forms; only status words like "{{count}} offen" take the adjective.
- `detail.strip.paid` = "Bezahlt" (glossary Paid); the remark's amount is rendered in code, so no `<figure>` tag in de.
- `photos.filter.label` = "Fotos filtern"; `photos.spots.areaLinkSuffix` = ", Bereich öffnen" (follows en ", open area").

**Why:** sibling strips on Task and Purchase pages must read the same for the same English words.
**How to apply:** when a future Area or Photos string reuses one of these English words, reuse the de form above rather than inventing a new one.
