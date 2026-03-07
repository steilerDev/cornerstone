# EPIC-14 E2E Validation Notes (2026-03-07)

## EPIC-14 Summary
Refactoring epic (no new features). 5 PRs merged to beta:
- PR #534: `subsidyServiceFactory` + `subsidyPaybackServiceFactory` (server)
- PR #535: `budgetServiceFactory` (server)
- PR #536: Shared base types in `shared/src/types/budget.ts`
- PR #537: `budgetApiFactory.ts`, `budgetConstants.ts`, `useBudgetSection.ts` (client)
- PR #538: UI harmonization (CSS tokens, dark mode, error/loading state patterns)

All PRs had Quality Gates + E2E Smoke Tests pass before merge.

## Coverage Gap Found & Fixed

The shared budget components (`BudgetLineForm`, `BudgetLineCard`, `SubsidyLinkSection`)
had NO E2E-level CRUD tests — only the presence of the "Add Line" button was checked.

New test file: `e2e/tests/budget/budget-lines.spec.ts` (PR #539, branch `chore/495-e2e-validation`)

## API Response Shapes (Critical)

- `POST /api/work-items/:id/budgets` → `{ budget: { id, plannedAmount, ... } }`
  NOT `{ workItemBudget: ... }` — the route returns `reply.send({ budget })` for both WI and HI.
- `POST /api/household-items/:id/budgets` → `{ budget: { id, plannedAmount, ... } }`
- `POST /api/subsidy-programs` → `{ subsidyProgram: { id, ... } }`
- `POST /api/budget-sources` → `{ budgetSource: { id, ... } }`

## BudgetLineCard Component Selectors

- Edit button: `getByRole('button', { name: /^Edit$/i })`
- Delete button: `getByRole('button', { name: /^Delete$/i })`
- Inline confirm (after delete click): `getByRole('button', { name: 'Confirm', exact: true })`
- Inline cancel (after delete click): `getByRole('button', { name: 'Cancel', exact: true })`

## BudgetLineForm Component Selectors

- Form appears after clicking "Add budget line" button
- Submit button text: `'Add Line'` (not editing) or `'Save Changes'` (editing)
- Cancel: `getByRole('button', { name: 'Cancel', exact: true })`
- Planned amount input: `page.locator('#budget-planned-amount')`
- Description input: `page.locator('#budget-description')`
- Confidence select: `page.locator('#budget-confidence')`
- Category select: `page.locator('#budget-category')` (WI only; HI uses static label)
- Vendor select: `page.locator('#budget-vendor')`
- Source select: `page.locator('#budget-source')`
- Submit disabled when `plannedAmount` is empty

## SubsidyLinkSection Component Selectors

- Picker select: `getByLabel('Select subsidy program to link')`
- Link button: `getByRole('button', { name: /Add Subsidy/i })`
- Link button disabled until a subsidy is selected in the picker
- Linked item name: `locator('[class*="linkedItemName"]').filter({ hasText: subsidyName })`
- Unlink button: `getByRole('button', { name: 'Unlink subsidy <name>' })`
- Empty state: `getByText('No subsidies linked')`

## Confidence Labels & Margins (budgetConstants.ts)

- `own_estimate` → "Own Estimate" with "+20%" margin
- `professional_estimate` → "Professional Estimate" with "+10%" margin
- `quote` → "Quote" with "+5%" margin
- `invoice` → "Invoice" with "+0%" margin (no margin shown in card)

## Work Item Budget Section Locator Pattern

```typescript
const budgetSection = page
  .locator('section')
  .filter({ has: page.getByRole('heading', { level: 2, name: 'Budget', exact: true }) });
```

## Household Item Budget Section Locator Pattern

The HI detail page uses a `getByRole('heading', { name: /budget/i, level: 2 })` pattern
(no section wrapper like WI). Use the button directly on the page:
```typescript
const addButton = page.getByRole('button', { name: /add budget line|add line/i }).first();
```

## HI Budget Category

`householdItemBudgetService` forces `budgetCategoryId = 'bc-household-items'` regardless
of what is sent in the request. The form renders a static category label instead of a dropdown.

## TypeScript Check for E2E Tests

Pre-existing type errors exist in:
- `e2e/containers/cornerstoneContainer.ts` (testcontainers API mismatch)
- `e2e/containers/setup.ts` (same)
- `e2e/tests/screenshots/capture-docs-screenshots.spec.ts` (Playwright API mismatch)

These are NOT new — they exist in the base repo and do not affect test execution.
The `tsc --noEmit --project e2e/tsconfig.json` command using the main repo's tsc works:
`/Users/franksteiler/Documents/Sandboxes/cornerstone/node_modules/.bin/tsc`
