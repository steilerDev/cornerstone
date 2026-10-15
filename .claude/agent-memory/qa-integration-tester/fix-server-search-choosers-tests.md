---
name: fix-server-search-choosers-tests
description: EPIC-21 fix PR (company/task/invoice choosers -> server-searching SearchPicker) test patterns - factory mocks need searchCompanies, controlled pickers, chip-hides-input traps
metadata:
  type: project
---

Test patterns that came out of the server-search chooser fix PR (branch fix/2190-search-capped-choosers).

- Tests that mock `lib/vendorsApi.js` with a factory must export `searchCompanies` and `fetchVendor`, or the whole suite dies with "does not provide an export named". Use `client/src/test/companySearchMock.ts` (`makeSearchCompanies(mockFetchVendors)`) so the request is still asserted on `fetchVendors`.
- SearchPicker shows the chip only when `value !== ''`, so a test whose `onChange` is a bare `jest.fn()` never sees a chip. Use `client/src/test/ControlledSearchPicker.tsx` / `withControlledValue.tsx` (stores the id, forwards to the spy).
- A selected chip hides the input: to reach the list in a test, click "Clear selection" (it now focuses the input and opens the list with showItemsOnFocus) before asserting options. Pickers without showItemsOnFocus (dependency/milestone link pickers) need typing.
- Entity filters write the URL (`handleStateChange` -> setSearchParams), not `setFilter`; assert with a `useLocation` probe. `setFilter(param, null)` is only the 404 drop from `useCompanyName.onUnknown`.
- First Escape in an open picker only closes its dropdown (stopPropagation), the second closes the DataTable filter popover.
- Hidden-by-default table columns (WorkItemsPage vendor) need a `table.<pageKey>.columns` preference `{visible:[...]}` to expose the filter button.
- Run broad jest sets via a script file; a worktree-isolated session refuses compound shell commands with loops/variables.
