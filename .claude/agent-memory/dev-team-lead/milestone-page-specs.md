---
name: milestone-page-specs
description: Hazards found speccing/reviewing EPIC-21 #2250 (milestone page on the object template) — backward primary labels, uncounted Work tab, slim detail payloads, page-side projections, SectionCard focus targets, stale-stored-date projections, capmap "from" surfaces dropped by a rebuild
metadata:
  type: feedback
---

Found on #2250 (P5.6). Expect the same on P5.7 (area page).

1. **A `kind: 'status'` primary with a backward `actionTo` is labelled "Back to ‹status›"** (transition label), never "Reopen". A PO "Reopen" primary needs `kind: 'button'` calling `useUndoableStatusChange` directly.
2. **`COUNTED_OBJECT_TABS` is cost/payments/diary only.** A UX "count on Work" changes every host with a Work tab (company page); rule it out and rely on RelatedList "(n)" headings.
3. **Detail payloads can be slimmer than the rows the UX draws** (`dependentWorkItems` was `{id,title}`; purchases came from a second endpoint). Enrich the detail once in the backend instead of having the page make extra fetches.
4. **Never let a page recompute a figure the list gets from the server** (projected date): add the engine value to the detail so list and page agree.
5. **`SectionCardController.startEdit()` had no focus-target/return-focus control**; a header secondary that opens a card needs `startEdit({ focusId, returnFocus })` (added in #2250).
6. **UX key lists duplicate existing vocabulary**: `statusAction.*.markReached`, SummaryStrip landmark from `typeLabel`, tab labels from `I18N_UNION_KEYS.objectTab`, RelatedList's own removed toast. Grep before accepting new keys.
7. **A projection test that inserts rows without `autoReschedule` sees stale stored dates**: when planned and forecast runs agree (`moved=false`), `projectedStartDate` falls back to the stored `startDate`. That is a fixture artifact, not an engine bug (production reschedules after every dependency change).
8. **A rebuild that drops a surface named in a capmap `from`** (WRK-016 "milestone detail linked items" area path) needs a `#story` note on that capability too, not only on the story's own ids. Grep capmap `from` fields for the old page's path.

Review/CI rounds (same story):

9. **An undated task is projected from today** (engine contract 4 point 4), so a milestone whose only contributor is undated reads "Early · n d" with a future target, not Upcoming / On target. E2E and unit fixtures asserting the against-target word must seed dated tasks; check every strip/chip assertion against the projection, not the UX wording.
10. **Never let a spec or test guess toast or status wording; read the locale.** The E2E waited for "Removed ‹title›" while RelatedList's toast is `common:relatedList.removed` "{{title}} removed from {{list}}." (`list` = the RelatedList `title` prop, without the count). Quote the exact key and value in E2E specs for every toast the story triggers.

Related: [[purchase-page-specs]], [[task-page-specs]], [[detail-template-specs]]
