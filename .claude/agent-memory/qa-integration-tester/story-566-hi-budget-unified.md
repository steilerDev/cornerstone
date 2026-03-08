# Story #566 — HI Unified Budget View Tests (2026-03-07)

Test file: `client/src/pages/HouseholdItemDetailPage/HouseholdItemDetailPage.budget-unified.test.tsx`
20 tests, all passing. PR branch: `fix/566-unify-hi-budget-view`.

## Key Patterns Confirmed

### ESM Mock beforeEach Pattern (Critical)

Do NOT call `jest.resetModules()` in `beforeEach` — it creates multiple React instances causing
"Invalid hook call" errors from `useParams` and other hooks. The correct pattern (from the existing
`.budget.test.tsx`) is:

```typescript
beforeEach(async () => {
  // Only reset mock return values — do NOT call jest.resetModules()
  mockGetHouseholdItem.mockReset();
  // ...other resets...

  // Import only once — guard with if check
  if (!HouseholdItemDetailPageModule) {
    HouseholdItemDetailPageModule = await import('./HouseholdItemDetailPage.js');
  }
});
```

### jest.MockedFunction Generic Syntax

Multiline generics must end with `>;` NOT `>();`:

```typescript
// CORRECT
const mockFetchBudgetSources = jest.fn() as jest.MockedFunction<
  () => Promise<{ budgetSources: [] }>
>;

// WRONG — TS parse error
const mockFetchBudgetSources = jest.fn() as jest.MockedFunction<
  () => Promise<{ budgetSources: [] }>
>();
```

### SubsidyPaybackEntry Required Fields

`HouseholdItemSubsidyPaybackEntry = SubsidyPaybackEntry` requires ALL of:
- `subsidyProgramId`, `name`, `reductionType` ('percentage'|'fixed'), `reductionValue`, `minPayback`, `maxPayback`

Always use a `makeSubsidyEntry()` helper to avoid TS2739 errors.

### Duplicate Text Assertions

"Expected Subsidy Payback" appears TWICE when subsidies + budget lines render:
- Once in `propertyGrid` as a `propertyLabel` span
- Once in the `subsidyPaybackRow` as a `subsidyPaybackLabel` span

Use `getAllByText('Expected Subsidy Payback').length >= 1` or `getAllByText(...)` to avoid
TestingLibraryElementError from `getByText`.

### Lines Count Collision

`makeItem()` sets `quantity: 1` by default. If testing the "Lines: 1" property grid value,
`getByText('1')` is ambiguous because quantity is also rendered as `'1'`. Override with
`makeItem({ quantity: 99 })` to make the `'1'` unique.

### HI Component Additional Mock Required

`HouseholdItemDetailPage.tsx` imports `fetchHouseholdItemCategories` from
`../../lib/householdItemCategoriesApi.js`. The older `.budget.test.tsx` did NOT mock this
(works by accident since it's called async). New tests should mock it explicitly:

```typescript
jest.unstable_mockModule('../../lib/householdItemCategoriesApi.js', () => ({
  fetchHouseholdItemCategories: mockFetchHouseholdItemCategories,
  createHouseholdItemCategory: jest.fn(),
  updateHouseholdItemCategory: jest.fn(),
  deleteHouseholdItemCategory: jest.fn(),
}));
```

## Unified Budget Layout Structure (as implemented)

The HI detail page (post-#566) unified layout:
- `<section>` with `<h2>Budget</h2>` — single top-level section
- NO separate Subsidies `<h2>` — replaced by `<h3>Subsidies</h3>` inside the Budget section
- `propertyGrid` entries (when `budgetLines.length > 0`):
  - "Total Actual Cost" — only when `totalActualCost > 0`
  - "Planned Range" — always (label doesn't change even when no range)
  - "Expected Subsidy Payback" — when `hasSubsidyPayback` (subsidies.length > 0)
  - "Net Cost" — when `hasSubsidyPayback && totalActualCost > 0`
  - "Lines" — always (count of budget lines)
- `subsidyPaybackRow` — rendered when `hasSubsidyPayback`, contains per-subsidy chips
