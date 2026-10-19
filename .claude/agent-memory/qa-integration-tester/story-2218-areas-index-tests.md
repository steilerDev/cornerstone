---
name: story-2218-areas-index-tests
description: Client test patterns for the Areas index (TreeTable, AreasPage, areaForm, ColorField) and sweep of tests broken by serving route `areas`
metadata:
  type: project
---

Gotchas worth keeping from the #2218 client tests:

- ObjectForm test ids follow the host's `testId` prop: AreasPage passes `testId="areas-form"`, so the buttons are `areas-form-save/cancel/more`; the default `object-form-*` ids only exist when the prop is omitted (areaForm.test uses the default).
- Fields under "More details" stay mounted but hidden: assert `.not.toBeVisible()`, not `queryBy... toBeNull()`.
- A custom ObjectForm field never gets the `testId` on its control; mock `AreaPicker` as a `<select data-testid="area-picker-mock">` (see taskForm.test) and expose `excludeIds`/`nullLabel` as data attributes.
- A default parameter swallows an explicit `undefined`: to test "no test-id prefix" use a boolean flag in the harness, not `testIdPrefix={undefined}`.
- TreeTable picks phone/wide through `useMediaQuery('(min-width: 768px)')`: use `installMatchMedia` and `media.set(query, bool)` for live switches. Only the `position`/`dropped` announcements go through `labels.position`; `pickedUp`/canceled keep the common `referenceList.*` wording.
- Delete-dialog fixtures: a parent is blocked by the rolled-up TOTAL (finished tasks still block); an "Archive" area with 5 total / 0 open proves it. Garage-like areas with tasks cannot be used for the "delete succeeds" path.
- `NetworkError` needs two constructor args (message, cause).
- Serving route `areas` moved Areas into the quiet sidebar group: Sidebar tests now expect a separator and one quiet link; `Sidebar.quiet.test.tsx` no longer needs the NavConfig patch.
- In worktrees `git status` fails (wiki submodule); run prettier/eslint on explicit paths, never repo-wide format.
