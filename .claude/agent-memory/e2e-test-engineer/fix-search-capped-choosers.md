---
name: fix-search-capped-choosers
description: In-session fix PR (EPIC-21) turning 100-capped company choosers/filters into server-searching SearchPickers - POMs, pick helper, 3 production defects found live
metadata:
  type: project
---

Specs: `tests/companies/company-pickers-search.spec.ts` (S1-S8), `company-filters-search.spec.ts` (F1-F4), `tests/milestones/milestone-link-search.spec.ts`, `tests/household-items/household-item-dependency-search.spec.ts`, `money-truth.spec.ts` (Link-to-Invoice modal on SearchPicker + a "beyond first 50" test).

POMs: `components/SearchPickerControl.ts` (`pick(text,rowText)`, `pickByKeyboard()`), `CompanyPickerControl extends` it, `components/CompanyFilterControl.ts` (table header "Filter by Vendor" popover), `DiaryEntryEditPage.chooseSignatureCompany`.

- **Pick helper must wait for the list to settle.** SearchPicker shows the unfiltered list (`showItemsOnFocus`) until the 300ms search answers; a target already present in it satisfies `toHaveCount(1)` early, then the swap re-renders and swallows ArrowDown/Enter. `pickByKeyboard` also waits until no other (non-create, non-"Other...") option remains.
- **Chip pickers have no input**: after `clearButton.click()` the input is not focused and the list does not open (defect B) - click the input to reopen.
- **Beyond-100 test** creates 101 companies named `<prefix> A Filler NNN` + `<prefix> Zz Target 100`, asserts the target is not in `GET /api/vendors?pageSize=100`.
- Tasks "Vendor" column is `defaultVisible: false` - `WorkItemsPage.enableColumn('Vendor')` first. Entity filter value is a plain URL param (`assignedVendorId` / `vendorId`).
- DataTable filter Escape: first Escape closes only the picker list (stopPropagation), second closes the popover -> `closeWithEscape()` repeats.

## Production defects found by the live run (expected-to-fail tests guard them)

- A: a pick whose parent updates `value` asynchronously (URL-synced table filter, PATCHed assignment on the task page) leaves focus on `<body>`. Cause: `SearchPicker.handleSelect` sets `pendingClearFocusRef`; the focus effect runs on the first render after the pick, when `value` is still old so the chip is not rendered yet (`selectedItem && value !== ''`), consumes the flag via `focusInputQuietly()`, then the chip replaces the input. Tests: F4, S8.
- B: `handleClear` calls `inputRef.current?.focus()` but the input is not mounted in chip mode, so focus drops to body and the list does not open. Test: S7.
- C: Link-to-Invoice option rows are 57px (two-line SearchPicker row), compact cap in `money-truth.spec.ts` is 56.
- D: at 375px the diary signature company picker (and its free-text field) overflows its `signerSection` grid block (`1fr 1fr`, no `min-width: 0`): chip right edge 390 vs block 238. Test: S9 (mobile only fails).
