---
name: story-2236-entity-picker-tests
description: EntityPicker/SearchPicker/objectForms test patterns for story #2236 - factory-mock ripple, harnesses, pinned defects, dead branches
metadata:
  type: project
---

- Any test whose subject transitively imports `EntityPicker` and mocks `lib/vendorsApi.js` with a factory needs `searchCompanies` AND `fetchVendor` in it (also `fetchTrades`, `fetchOrientations`, `searchEverywhere`, `fetchHouseholdItemCategories`, `listWorkItems` if those modules are factory-mocked). Symptom: "does not provide an export named 'fetchVendor'" fails the whole file. Seen in SignatureCapture, companyForm, CaptureScreen, DiaryCapturePage, VendorsPage tests.
- EntityPicker.test.tsx harness: real `useCompanyCreateAction`/`useTagCreate` fed through `CompanyCreateContext`/`TagCreateContext` with jest.fn requests; capture the input element BEFORE a create click (the chip replaces it). Add-mode (`clearOnSelect`) harness must reset the host value to ''.
- Heavy suites (taskForm, CostLineForm, TradesManager) hit the 5 s default under `--coverage` with 2 workers; they pass alone. Re-run the single test before calling a timeout real.
- Both it.failing defects (host create not remembered; dialog autofocus) were fixed and are plain `it` now.
- Remaining unreachable (whole-file coverage still >=95%): Trades `if (!pending)` inside tick and `newInputRef.current?.focus()` null arms; SignatureCapture `!container`, `if (!signature)` in resize, `if (!hasStrokes)` in handleAccept (button disabled), `option?.label` arms; TagChips ref setter + `nameCount ?? 0`.
- Recipes: focus-restore fallback to `returnFocusRef` needs `fireEvent.click` (no opener focus) then Escape; EntityPicker cache-race guard needs two in-flight creates (the row is hidden while a load is searching); duplicate-dependency guard via schema `render(ctx)` rerender with a new ctx.value after picking.
- Dialogs built on EntityPickerDialog are pick-only: value is always '' and a special/none option never reaches `onPick`.
