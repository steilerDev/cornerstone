# Story #415 Household Item Timeline Deps — QA Notes (2026-03-03)

## PR #416 — feat/415-household-item-timeline-deps

### Bugs Found

- **Bug #417**: `fetchLinkedHouseholdItems` in `householdItemWorkItemsApi.ts` calls
  `/work-items/${workItemId}/household-items` but server route is `/:id/dependent-household-items`
- **Bug #418**: `autoReschedule()` in schedulingEngine.ts returns early at line 674-676 when
  `allWorkItems.length === 0`, skipping HI delivery date computation (Steps 7-10). HIs with
  only milestone deps get null delivery dates if no work items exist in DB.

### Test Files Written (10 files, 3 commits)

1. `server/src/services/householdItemDepService.test.ts` — 45 service unit tests
2. `server/src/routes/householdItems.test.ts` — augmented with dep endpoint tests
3. `server/src/db/migrations/0010_household_items.test.ts` — updated for 0012 schema
4. `server/src/services/schedulingEngine.householdItems.test.ts` — 23 scheduling tests
5. `client/src/lib/householdItemDepsApi.test.ts` — API client tests
6. `client/src/hooks/useHouseholdItemDeps.test.tsx` — hook tests
7. `client/src/pages/HouseholdItemDetailPage/HouseholdItemDetailPage.test.tsx` — updated
8. `client/src/components/GanttChart/GanttHouseholdItems.test.tsx` — new file
9. `client/src/pages/SetupPage/SetupPage.tsx` — unchanged (was showing as modified in status)
10. `client/src/pages/HouseholdItemsPage/HouseholdItemsPage.test.tsx` — updated

### Pre-existing test failures caused by migration 0012

Migration 0012 replaced `household_item_work_items` with `household_item_deps`. Affected:

- `0010_household_items.test.ts`: table name changes, index name changes, cascade test rewrites
- `HouseholdItemDetailPage.test.tsx`:
  - "No work items linked" → Dependencies section (empty)
  - `item.workItems` → `item.dependencies`
  - Delivery date appears multiple times → `getAllByText()`
  - `describe('linked work items display')` → `describe('dependency predecessors display')`
- `routes/householdItems.test.ts`:
  - `item.workItems` → `item.dependencies`
  - `DUPLICATE_DEPENDENCY` error code → `CONFLICT` (ConflictError always uses `'CONFLICT'`)

### SVG className in jsdom (CRITICAL)

SVG elements (`<circle>`, `<rect>`, `<g>`) return `SVGAnimatedString` for `.className` in jsdom
— NOT a plain string. `toContain()` and `not.toContain()` throw `TypeError: received is not iterable`.

**Fix**: Use `element.getAttribute('class') ?? ''` for all class assertions on SVG elements:

```typescript
// WRONG — fails with SVG elements:
expect(circle.className).toContain('hiHighlighted');

// CORRECT:
expect(circle.getAttribute('class') ?? '').toContain('hiHighlighted');
```

### TypeScript typed mock pattern for ESM factories

When using `jest.unstable_mockModule()` factory with typed mock refs, avoid inline `.mockResolvedValue()`:

```typescript
// WRONG — causes TS2345 "never[]" error:
const mockFn = jest.fn().mockResolvedValue([]);
jest.unstable_mockModule('./api.js', () => ({ fetchFoo: mockFn }));

// CORRECT — declare typed mock, set value in beforeEach:
import type * as ApiTypes from './api.js';
const mockFn = jest.fn<typeof ApiTypes.fetchFoo>();
jest.unstable_mockModule('./api.js', () => ({ fetchFoo: mockFn }));
beforeEach(() => {
  mockFn.mockResolvedValue([]);
});
```

### autoReschedule guard workaround

Milestone-only HI dep tests need a dummy work item to bypass the early-return guard:

```typescript
// Must insert at least one work item or autoReschedule returns 0 early
insertWorkItem(db, userId, { endDate: '2026-01-01' }); // required by autoReschedule guard
```

### ConflictError code vs details

`ConflictError` always uses `'CONFLICT'` as the `error.code`. Domain-specific identifiers
(e.g., `'DUPLICATE_DEPENDENCY'`, `'CIRCULAR_DEPENDENCY'`) appear in `error.details`, not `error.code`.
