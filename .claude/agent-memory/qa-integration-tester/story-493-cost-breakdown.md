# Story #493 — Cost Breakdown Table Improvements (2026-03-06, PR #503)

## Summary

Added 14 backend + 12 frontend + fixture update tests for new `rawProjectedMin`, `rawProjectedMax`,
`minSubsidyPayback` fields on `BreakdownTotals`, `BreakdownWorkItemCategory`, `BreakdownWorkItem`,
`BreakdownHouseholdItemCategory`, `BreakdownHouseholdItem`.

## Key Learnings

### MemoryRouter Required for Item-Level Expansion Tests

Any `CostBreakdownTable` test that expands to item level (WI section → category → items) will
render `<Link>` components which require Router context. Use `renderWithRouter()` helper:

```typescript
function renderWithRouter(breakdown, overview, selectedCategories = new Set(), budgetSources = []) {
  return render(
    <MemoryRouter>
      <CostBreakdownTable breakdown={breakdown} overview={overview}
        selectedCategories={selectedCategories} budgetSources={budgetSources} />
    </MemoryRouter>
  );
}
```

Tests that only check top-level rows (Available funds, Work items, Household items, Sum) can still
use plain `render()` without MemoryRouter.

### CostDisplay Component is Dead Code

`CostDisplay` function in `CostBreakdownTable.tsx` is defined but never called. Work item rows
handle cost display inline (lines 296-300): shows "Actual:" for `costDisplay='actual'`, and
`formatCost(rawCost)` for both `projected` and `mixed`. Mixed items only get `rowMixed` CSS class
— no separate Actual/Projected labels shown. If test expects both labels for mixed mode, it's
testing non-existent behavior.

### renderPayback Range vs Single Value

`renderPayback(minPayback, maxPayback)`:

- `maxPayback === 0` → dash `'—'`
- `|min - max| < 0.001` → `<span>+€X.XX</span>` (single value)
- otherwise → `<span>+€min – +€max</span>` (range format)

So `getAllByText('+€120.00')` fails if test passes `subsidyPayback=120, minSubsidyPayback=0`
(defaults to 0) — component renders `"+€0.00 – +€120.00"` as a single span. To get single
value output, set `minSubsidyPayback === subsidyPayback`.

### Sum Row has Same Value in Cost and Net When No Payback

`sum = availableFunds - totalRawProjected + totalPayback`

If `totalPayback = 0`, then Sum Cost = `€(avail - raw)` and Sum Net = `€(avail - raw)` — same value.
Use `getAllByText()` not `getByText()` when asserting Sum row values to avoid "multiple elements found".

### Fixture Files to Update When Shared Types Grow

When `BreakdownTotals` or `BreakdownWorkItemCategory` gain new required fields, these test files
ALL need updating:

- `client/src/components/CostBreakdownTable/CostBreakdownTable.test.tsx` — fixture builders
- `client/src/pages/BudgetOverviewPage/BudgetOverviewPage.test.tsx` — inline fixture objects

Check for TypeScript errors after implementing new shared types — the pre-commit typecheck will
catch missing required fields in test fixtures.

### getButtonByControls Helper Relies on Hardcoded Category Name List

The `getButtonByControls` helper in `CostBreakdownTable.test.tsx` (line ~72-90) searches for
category expand buttons by checking if sibling span text matches a hardcoded list:
`['Uncategorized', 'Materials', 'Labor', 'Permits', 'Design', 'Equipment', 'Landscaping',
'Utilities', 'Insurance', 'Contingency', 'Other', 'CategoryA', 'CategoryB', 'CategoryX']`

Test data must use category names from this list. Add new names to the list when needed.
