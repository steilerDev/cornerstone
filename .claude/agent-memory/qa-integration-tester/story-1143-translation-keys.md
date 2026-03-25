---
name: Story #1143 — translationKey field testing patterns
description: Patterns for testing the translationKey field added to trades, budgetCategories, householdItemCategories
type: project
---

## Story #1143 translationKey Testing (2026-03-22)

**Migration 0030**: Adds nullable `translation_key` column to `trades`, `budget_categories`, `household_item_categories`. Predefined rows get keys (e.g. `trades.plumbing`); user-created rows always get `null`.

**Test files created/modified**:

- `client/src/lib/categoryUtils.test.ts` (NEW) — unit tests for `getCategoryDisplayName` + i18n key coverage
- `server/src/services/tradeService.test.ts` — added `translationKey field` describe block
- `server/src/services/budgetCategoryService.test.ts` — added `translationKey field` describe block
- `server/src/services/householdItemCategoryService.test.ts` — added `translationKey field` describe block
- `server/src/routes/trades.test.ts` — added route-level `translationKey` tests
- `server/src/routes/budgetCategories.test.ts` — added route-level `translationKey` tests
- `server/src/routes/householdItemCategories.test.ts` — added route-level `translationKey` tests

**Key patterns**:

- `getCategoryDisplayName(t, name, translationKey)`: when key is non-null, calls `t(key, { defaultValue: name })`; when null/empty string (falsy), returns name without calling t()
- Empty string `translationKey` is falsy in JS — treated same as null in the implementation
- Seeded trades table is cleared in `beforeEach` in route tests (`app.db.delete(trades).run()`). To test predefined translationKey in route tests, re-insert the row manually with the `translationKey` set.
- Service tests for seeded categories (budget/HI): these tables are NOT cleared in beforeEach, so predefined rows are available directly after `runMigrations()`.
- `createTrade()`, `createBudgetCategory()`, `createHouseholdItemCategory()` always write `translationKey: null` — verified by unit test.
- i18n coverage tests: import JSON directly (`import en from '../i18n/en/settings.json'`), no assert { type: 'json' } needed (resolveJsonModule: true in client tsconfig).
- Key parity test pattern: `expect(Object.keys(de.section).sort()).toEqual(Object.keys(en.section).sort())`

**Seeded predefined IDs verified**:

- Trades (15): trade-plumbing, trade-hvac, trade-electrical, trade-drywall, trade-carpentry, trade-masonry, trade-painting, trade-roofing, trade-flooring, trade-tiling, trade-landscaping, trade-excavation, trade-general-contractor, trade-architect-design, trade-other
- BudgetCategories (7 surviving on fresh DB): bc-materials, bc-labor, bc-permits, bc-design, bc-household-items, bc-waste, bc-other
- HI Categories (7 surviving on fresh DB): hic-furniture, hic-appliances, hic-fixtures, hic-decor, hic-electronics, hic-equipment, hic-other
