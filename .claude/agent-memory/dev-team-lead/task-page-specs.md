---
name: task-page-specs
description: Hazards found speccing EPIC-21 #2248 (task page on the object template) — StatusMenu action already owns date chips + Undo, strip anchors cannot nest a Call link, 8 strip candidates for 7 slots, direct-vs-transitive "Holds up" lists, setSearchParams drops the hash, create targets missing a prefill key, no creation event for "created by"
metadata:
  type: feedback
---

Found while speccing #2248 (P5.4). Expect the same on P5.5 (purchase page) and P5.6 (milestone page).

1. **UX "DateChips + Toast Undo" for Start / Mark done is already `StatusMenu appearance="action"`** (date step, Today/As planned/Pick) plus `useUndoableStatusChange`. ObjectHeader `primary.kind: 'status'` gives it for free; never spec a second date-chip flow.
2. **SummaryStrip facts are anchors/buttons**, so a Call link inside a fact value is nested interactive content. Extend the strip with a `trailing` slot rendered beside the target in the `<dd>`.
3. **Count strip candidates against MAX_SUMMARY_FACTS (7) before accepting the UX.** Documents (an AC "fact") was the 8th; folding the grant name into the Expected cost remark kept both ACs.
4. **A list of direct successors titled "Holds up (2)" next to a transitive "Holds up 5 tasks"** is the same-label-different-count defect #2232 removed. Title the direct list in plain words ("Waiting for this task").
5. **`useObjectTabs.select` / `setSearchParams` drop `location.hash`.** Hash intents (`#reschedule`, `#constraints`) and transient params (`?depError=`) must be consumed in ONE replace navigate (keep `state`), stored in page state, and handed to the panel.
6. **Create targets accept a closed prefill list** (`CREATE_TARGETS[id].prefill`, route-map `carries`). "Log … pre-fills company" needed `companyId` on `diaryEntry` plus capture-screen support; grep the target before promising a prefill.
7. **Users have no phone column**; a "member call button" is impossible. Detail endpoints lack list-only figures (expectedCost, grants, waitsFor, holdsUp, vendor phone) — add one shared helper used by list and detail.
8. **There is no "created" history event for tasks**, so a capmap "History tab (created by / updated)" needs an explicit line above `ObjectHistorySection`.
9. **Notes and subtasks DELETE answer 204 without snapshots**; a UX "Undo" there is a backend contract change. Keep ConfirmDialog unless the story budgets snapshots.

Review round 1 (same story):

10. **SummaryStrip targets are stretched links** (`.target::after { position: absolute; inset: 0 }`). A sibling added to the cell (the `trailing` Call button) is painted under the overlay, so a click opens the fact's tab. Any control added next to a stretched-link target needs `position: relative; z-index: var(--z-raised)`. jsdom cannot see it; only Playwright click hit-testing does.
11. **A `kind: 'button'` RelatedList action opened from the empty state** returns focus to a button that unmounts once the first row lands. Only the `picker` kind has the `isConnected` fallback built in, so hosts with dialogs must fall back to `${testId}-add` themselves.

Related: [[detail-template-specs]], [[company-page-specs]], [[first-detail-page-adopter-specs]], [[schedule-page-specs]], [[consistency-test-specs]], [[related-list-picker-specs]]
