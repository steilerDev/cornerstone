---
name: consistency-test-specs
description: Hazards found speccing EPIC-21 #2232 (figure consistency test) — "tests only" stories hide real inconsistencies; sweep equal labels, former names and same-label-different-count; rendered E2E on a shared DB needs API-bracketed retry; registry + markers + guard for "later stories add themselves"
metadata:
  type: feedback
---

#2232 (P3.5) was filed as S, tests only. Sweeping for "equal labels" found three real inconsistencies, each of which had to be fixed in the story:

1. **A legacy screen showing a figure under its former name.** Money › Overview showed "Remaining Budget" (glossary `formerly` of Left to spend) twice, before and after payback, computed client-side from retired fields with all sources counted. Grep the glossary `formerly`/`doNotUse` forms of every shared figure across en locale files, not only the new label.
2. **Same label, different count.** The Gantt/Calendar tooltip "Holds up (n)" counted direct successors, while attention used the transitive `computeHoldsUp`. Grep the en value of each figure label ("Holds up") in every namespace.
3. **A second definition behind a canon label.** Invoices "Ready to submit" (`aggregateClaimableBreakdown`) ≠ money `readyToSubmit` (the draw-down set). The server consistency test had skipped it, which hinted the two differed.
4. **An earlier owner decision "accept until story X" can collide with the phase exit criteria** when X lands after the phase exit. Surface it as a decision with the fix as the default.
5. **Rendered E2E on the shared DB**: global figures move under other workers. Read the API, then all surfaces, then the API again, and retry when the API changed (the H8d pattern). Subject-scoped figures (own company, own task chain) are deterministic.
6. **"Later stories add themselves" (AC3)**: a typed registry in `e2e/fixtures/`, `data-figure` markers, a Jest guard listing the marked files, a stage guard on planned routes, and a CLAUDE.md rule.
7. **In review, re-run `plan:check` after the last implementer round.** Here the architect ran `plan:build` before the frontend's dead-branch cleanup deleted another money-label key (`costBreakdown.loading`), which left the baseline behind again.

**How to apply:** any "consistency"/"one answer" story or test-only story over existing surfaces. Before accepting the S size, sweep labels, former names and the server consistency gaps. Related: [[money-service-specs]], [[attention-service-specs]], [[home-page-specs]], [[shell-popover-specs]]
