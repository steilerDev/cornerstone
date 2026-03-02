# Sentence Builder Testing Learnings (2026-02-19)

## Test Coverage Added (feat/dependency-sentence-builder)

- **dependencyVerbs.test.ts** (NEW): 13 pure unit tests (all 4 verb→type mappings, all 4 type→verb mappings, round-trips)
- **DependencySentenceDisplay.test.tsx** (NEW): 21 component tests (empty state, headers per type, grouping, delete callbacks, Links)
- **DependencySentenceBuilder.test.tsx** (NEW): 17 interactive form tests (defaults, verb selects, onAdd, reset, mutual exclusion, disabled)
- **WorkItemPicker.test.tsx** (NEW): 13 tests for new `specialOptions` and `showItemsOnFocus` props
- **WorkItemDetailPage.test.tsx** (UPDATED): +4 dependency section tests
- **WorkItemCreatePage.test.tsx** (UPDATED): +3 dependency section tests
- Full test suite: **1142 tests pass** (57 suites)

## Key Patterns

### Mock Type Pattern for Dynamic Import Modules

When you need the TypeScript type from a dynamically imported module:

```typescript
import type { MyComponent as MyComponentType } from './MyComponent.js';

let Module: { MyComponent: typeof MyComponentType };
// then: Module = await import('./MyComponent.js');
```

This avoids the `@typescript-eslint/consistent-type-imports` error from `typeof import()`.

### WorkItemPicker Focus Behavior (important behavioral fact)

- With no `showItemsOnFocus` and no `specialOptions`: focus does NOT open the dropdown. No API call on focus.
- With `showItemsOnFocus=true` OR `specialOptions`: dropdown opens on focus, `fetchInitialResults()` is called.
- Test for "no dropdown on focus" by asserting `queryByRole('listbox')` returns null and mockListWorkItems not called.

### DependencySentenceBuilder Slot State Logic

Default state: `slot1Id=''`, `slot2Id=thisItemId` (pre-filled with "This item").

- `slot1SpecialOptions = []` when `slot2Id === thisItemId` (prevents both slots having same item)
- `slot1SpecialOptions = thisItemSpecialOption` when `slot2Id !== thisItemId`
- This means: "This item" only appears as special option in slot 1 AFTER clearing slot 2

### Avoiding Multiple-Matches for Generic Button Names

Detail page has "Add Note", "Add Subtask", and dependency "Add" buttons. Instead of `getByRole('button', { name: /add/i })`:

- Use specific queries: `getByRole('button', { name: /add note/i })` or check surrounding context
- Or query conjunction words like `getByText('must')`, `getByText('before')` to verify builder is rendered

### Page Tests: Default listWorkItems Mock

When testing pages that contain `DependencySentenceBuilder`, always set a default `mockListWorkItems` response in `beforeEach` — the WorkItemPicker inside will call it on focus. Without this, tests that focus the picker will hang or fail.

### ESLint: `@typescript-eslint/no-unused-vars` on Test Imports

Remove unused test imports (`beforeEach` when no `beforeEach` needed, `user` when only doing rerenders).
Prettier reformats function types inside `jest.fn<...>()` to multiline — this is expected behavior.
