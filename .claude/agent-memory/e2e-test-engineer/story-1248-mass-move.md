---
name: Story #1248 Mass-Move E2E Patterns
description: Key selectors and patterns for BudgetSources multi-select + mass-move dialog E2E tests
type: project
---

# Story #1248 — Multi-select + Mass-Move Dialog E2E

**Files**: `e2e/tests/budget/budget-source-move.spec.ts` (NEW, 8 tests), `e2e/pages/BudgetSourcesPage.ts` (modified).

## Key Selectors

- **Per-line checkbox**: `getByRole('checkbox', { name: 'Select {description}' })` scoped to lines panel
- **Area group TriStateCheckbox**: `getByRole('checkbox', { name: 'Select all in {areaName}' })` scoped to panel
- **Action bar**: `getLinesPanelById(id).locator('[class*="actionBar"]')` — only renders when ≥1 line selected
- **Move button**: `getActionBar(id).getByRole('button', { name: 'Move to another source\u2026' })`
- **Move modal**: `getByRole('dialog', { name: 'Move lines to another source' })` — Modal uses `useId()` for aria-labelledby, so name-based matching is required
- **SearchPicker input**: `moveModal.locator('#target-source')` — fixed ID passed as `id="target-source"` prop
- **Picker options**: `moveModal.getByRole('option', { name: sourceName })` — SearchPicker renders `role="option"` buttons
- **Confirm button**: `moveModal.getByRole('button', { name: /Move lines|Loading/i })` — loading state shows "Loading"
- **Warning block**: `moveModal.locator('[role="alert"]')` — rendered only when claimedCount > 0
- **FormError banner**: `moveModal.locator('[class*="banner"]')` — FormError uses CSS module `.banner` class with `role="alert"`; distinguish from warning block via CSS class not role
- **Understood checkbox**: `getByRole('checkbox', { name: 'I understand this will reassign lines with a claimed invoice' })`

## API URLs for Mocking

- Lines: `**/api/budget-sources/${sourceId}/budget-lines`
- Move PATCH: `**/api/budget-sources/${sourceId}/budget-lines/move`
- Move success response: `{ movedWorkItemLines: N, movedHouseholdItemLines: N }`
- Move 409: `{ error: { code: 'STALE_OWNERSHIP', message: '...' } }`

## Implementation Notes

- `MassMoveModal.handleSearchSources` filters sources client-side (`s.id !== sourceId`) — no server-side exclude query param
- `handleSelectTarget` only sets `targetSourceName`; `setTargetSourceId` is passed as `onChange` to SearchPicker directly
- `canConfirm = targetSourceId !== '' && (claimedCount === 0 || understood) && !isSubmitting`
- Toast on success: `role="alert"` from Toast component; text: "Moved N line(s) to {targetName}"
- The action bar renders INSIDE the lines panel (`source-lines-{id}`) — scope to panel, not page

## Why:

This was Story #1248 — the frontend multi-select + mass-move feature for budget source lines. Patterns apply to any future modal that uses the shared `Modal` + `SearchPicker` combo.
