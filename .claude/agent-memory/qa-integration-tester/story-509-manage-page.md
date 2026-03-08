# Story #509 — Unified Tags & Categories Management Page (E2E Fix)

## Route Changes

| Old route            | New route                       | Notes                                                                  |
| -------------------- | ------------------------------- | ---------------------------------------------------------------------- |
| `/tags`              | `/manage`                       | Redirect via `<Navigate to="/manage" replace />` in App.tsx            |
| `/budget/categories` | `/manage?tab=budget-categories` | Redirect via `<Navigate to="/manage?tab=budget-categories" replace />` |

## ManagePage Structure

- `<h1>Manage</h1>` — single h1 for the unified page
- Three tabs: Tags (default), Budget Categories, Household Item Categories
- Tab panels: `#tags-panel`, `#budget-categories-panel`, `#hi-categories-panel`
- Tab panel has `hidden` attribute when inactive; tab content only mounted when active
- Loading state renders a `<div className={styles.loading}>Loading ...</div>` — NOT the "Add Category" button
- "Add Category" button appears in BOTH BudgetCategoriesTab AND HouseholdItemCategoriesTab

## CSS Class Name Changes (ManagePage vs old standalone pages)

ManagePage BudgetCategoriesTab uses a shared design system with classes:

| Old class (standalone page) | New class (ManagePage) |
| --------------------------- | ---------------------- |
| `categoryRow`               | `itemRow`              |
| `categoryName`              | `itemName`             |
| `categorySwatch`            | `itemSwatch`           |
| `categorySortOrder`         | `itemSortOrder`        |
| `categoryDescription`       | `itemDescription`      |
| `categoriesList`            | `itemsList`            |

These classes are shared across ALL three tabs (tags, budget-categories, hi-categories).
**Always scope locators to `#budget-categories-panel`** to avoid cross-tab ambiguity.

## BudgetCategoriesPage POM Key Pattern

```typescript
const tabPanel = page.locator('#budget-categories-panel');
this.addCategoryButton = tabPanel.getByRole('button', { name: 'Add Category', exact: true });
this.categoriesList = tabPanel.locator('[class*="itemsList"]');
// etc. — scope everything to tabPanel
```

## goto() Wait Strategy

After navigating to `/manage?tab=budget-categories`:

1. Wait for `<h1>Manage</h1>` (heading) — appears when ManagePage mounts
2. ALSO wait for `addCategoryButton` — only appears when BudgetCategoriesTab finishes loading

The heading alone is NOT sufficient because ManagePage mounts immediately but the tab
content loads asynchronously. `addCategoryButton` only renders after `isLoading: false`.

## HouseholdItem Category ID Changes

Migration 0016 added a `household_item_categories` table with seeded IDs using `hic-` prefix.
All bare category IDs must now use the prefixed form:

| Old value       | New value           |
| --------------- | ------------------- |
| `'furniture'`   | `'hic-furniture'`   |
| `'appliances'`  | `'hic-appliances'`  |
| `'fixtures'`    | `'hic-fixtures'`    |
| `'decor'`       | `'hic-decor'`       |
| `'electronics'` | `'hic-electronics'` |
| `'outdoor'`     | `'hic-outdoor'`     |
| `'storage'`     | `'hic-storage'`     |
| `'other'`       | `'hic-other'`       |

This affects:

- `createHouseholdItemViaApi()` default in `apiHelpers.ts`
- Explicit `category:` fields in test API calls
- `categoryFilter.selectOption('furniture')` → `selectOption('hic-furniture')`
- Form `fillForm({ category: 'furniture' })` → `fillForm({ category: 'hic-furniture' })`
- Edit page `toHaveValue('furniture')` → `toHaveValue('hic-furniture')`

## Pre-existing Failures (Bug #511, #512)

Migration 0016 uses `ALTER TABLE MODIFY` which is invalid SQLite syntax (MySQL only).
This breaks ALL server-side tests that call `runMigrations()` on in-memory SQLite:

- `budgetOverviewService.test.ts`, `timelineService.test.ts`, `budgetCategoryService.test.ts`
- `budgetCategories.test.ts`, `0012_household_item_deps.test.ts`, `householdItemBudgets.test.ts`, `budgetOverview.test.ts`

These failures are pre-existing on the branch and NOT caused by E2E test fixes.
E2E tests run against the Docker container which uses real SQLite (not in-memory), so the
migration 0016 syntax issue may be handled differently there.
