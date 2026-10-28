---
name: tasks-list-specs
description: Hazards found speccing EPIC-21 #2245 (Tasks list on ObjectList) — UX omits capabilities, group badge duplicates the label, template focus rule vs UX, closed figure list for per-row money and holds-up, EntityPickerDialog cannot pick "none", list helper reused by Home counts
metadata:
  type: feedback
---

Found while speccing #2245 (P5.1). Expect the same for P5.2 adopters (Purchases, Milestones, Companies).

1. **A UX filter list can silently drop capabilities.** UX named Area, Who and Milestone only; capmap
   WRK-007 (date ranges), WRK-008 (cost-line count) and WRK-010 (status sort) still had to stay.
   **How to apply:** diff every capmap id in the story against the UX's controls before speccing.
2. **`ObjectListGroupMeta.badge` rendered next to the label** reads "Late Late (3)". The badge carries
   the word, so it must replace the visible label (label kept for announcements and aria).
3. **The template's focus rule for a row that moves group** (focus follows the row) contradicted UX
   (stay in the former group), and it dropped to the h1 when the row moved into collapsed Done.
   Grep `ObjectList.test.tsx` L10 for the rule before accepting a UX focus line.
4. **Closed figure list.** A per-row Expected cost is a part (no `data-figure`, server consistency
   assertion instead). A UX "Holds up ‹title› +n" breaks the marker rule ("Holds up n tasks",
   first number = count); use the shared sentence and register the surface.
5. **`EntityPickerDialog` ignores special options** (`onChange('', null)` returns early), so a bulk
   "Set area" cannot offer "No area".
6. **A list service reused by another surface for counts** (`homeService` calls `listWorkItems`
   with `pageSize: 1` three times): put enrichment (money run, holds-up) in a separate rows function
   with its own row type, not in the shared helper; it also avoids the typed-test-literal blast radius.
7. **Template cell order is fixed** (title · columns · status · command · ⋯); a UX order with Status
   second is a deviation to record, not a per-adopter template flag.

8. **Review round 1 caught three spec/impl slips.**
   - The spec put `useUserText()` on an ellipsised cell, which `lib/userText.ts` forbids (hyphens vs ellipsis).
   - "Focus the first visible title" via `closest('[hidden]')` misses the CSS-hidden twin surface (table and cards are both mounted). Try `focus()`, then check `document.activeElement`.
   - A boolean predicate written as a TS type guard (`fields is F`) is unsound on its false branch.

Related: [[object-list-adopter-specs]], [[object-list-specs]], [[attention-service-specs]], [[consistency-test-specs]]
