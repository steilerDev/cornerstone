---
name: story-2236-entity-picker
description: #2236 EntityPicker / cost-line Undo E2E - POM facts, what the 160-failure triage found, focus rules, known defects pinned with test.fail
metadata:
  type: project
---

- `EntityPickerControl` (pages/components) is the base of `CompanyPickerControl`. Area rows: ancestors `pathSegment`, last level `pathLast`, accessible name "Ground floor, Hallway". Who groups are `role=group`. `arrowTo` walks up to 40 ArrowDowns inside one `toPass` attempt (a re-opened trade list is unfiltered and long).
- Triage of the 160-failure full run (when frontend was still editing): ~15% real #2236 fallout (photo-picker-hierarchy x4 scenarios, "Other..." signature picker, task-picker breadcrumb, cost-line Undo), the rest load flakes (mobile late in a 6-worker run: goto 10 s timeouts, `apiRequestContext.delete` timeouts). Re-running changed files per project with 4 workers was green; always re-confirm flakes with `--repeat-each=3` on a quiet machine.
- Typing "Other..." into a company EntityPicker adds a "New company Other..." create row, so `getByRole('option').filter({hasText:'Other...'})` counts 2. `DiaryCapturePage.chooseSignatureCompany('Other...')` now opens the list empty instead of typing.
- Inside the New task dialog the company create form is a **child step**: it keeps the parent ObjectForm's test ids (`object-form-*`), not `company-create-form-*`. Build `new ObjectFormDialog(page, 'New company')` there.
- Undo focus rule (spec): after Undo, the restored row's ⋯ is focused only if focus is body/null/inside the section. A **click** on the toast's Undo leaves focus in the toast, so focus then goes to the section fallback (Add cost line). Use `toasts.undoViaShortcut('Control')` to assert the ⋯ focus; the click path only asserts "not on body".
- `expect(a.or(b)).toBeFocused()` is a strict-mode violation when both match; poll `document.activeElement` instead.
- The clear button's 44px is a `::after` hit area (bounding box stays ~22px): assert with `elementFromPoint` 21px above/below its centre.
- Orientation change in the photo spot viewer moves the photo; the "Tags saved" note does not show - assert the PATCH response/API instead.
- Soft-deleted users keep their e-mail: give `createMember` a unique address per call.
- Known production defects pinned with `test.fail()` (flip when fixed): W3b (after the company child step Save inside New task, focus stays on Save instead of "Clear selection"); photo-picker-hierarchy Scenario 2b (area search by parent name no longer returns descendants - old client tree search did, #1723).
