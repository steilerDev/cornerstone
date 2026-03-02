# Story #142 Learnings: Budget Categories CRUD Testing

## Test Coverage Added (2026-02-20)

- **server/src/services/budgetCategoryService.test.ts** (NEW): 62 unit tests
- **server/src/routes/budgetCategories.test.ts** (NEW): 39 integration tests
- **client/src/lib/budgetCategoriesApi.test.ts** (NEW): 18 API client tests
- **client/src/pages/BudgetCategoriesPage/BudgetCategoriesPage.test.tsx** (NEW): 41 component tests
- **server/src/db/schema.test.ts** (EXPANDED): 21 new budget schema tests (50 → 71 total)
- Full test suite after Story #142: **1325 tests pass** (61 suites)

## Critical: Migration-Seeded Data

Migration `0003_create_budget_tables.sql` seeds 10 default budget categories:

- Materials, Labor, Permits, Design, Equipment, Landscaping, Utilities, Insurance, Contingency, Other

**Never use these names in tests** — UNIQUE constraint on `budget_categories.name` will cause failures.

**Pattern:** Use unique prefixes like "Custom _" or "Test Cat _":

```typescript
const SEEDED_CATEGORY_COUNT = 10; // document the migration seed
// Count assertions:
expect(result.length).toBeGreaterThanOrEqual(SEEDED_CATEGORY_COUNT);
// Not: expect(result.length).toBe(0)
```

## UNIQUE Constraint Testing with better-sqlite3

better-sqlite3 is synchronous — constraint errors throw synchronously, NOT as rejected Promises.

**Wrong (flaky in parallel runs):**

```typescript
await expect(db.insert(schema.budgetCategories).values({...})).rejects.toThrow();
```

**Correct (matches existing schema.test.ts pattern):**

```typescript
let error: Error | undefined;
try {
  await db.insert(schema.budgetCategories).values({ id: 'dup', name: 'Existing Name', ... });
} catch (err) {
  error = err as Error;
}
expect(error).toBeDefined();
expect(error?.message).toMatch(/UNIQUE constraint failed/);
```

## Fastify `additionalProperties: false` Behavior

When a JSON schema has `additionalProperties: false`, Fastify **strips** unknown properties
(does NOT return 400). Test should assert 201, not 400:

```typescript
it('creates category with extra properties stripped (not rejected)', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/api/budget-categories',
    headers: { cookie: `sessionId=${sessionId}` },
    payload: { name: 'Test Cat', unknownField: 'foo' },
  });
  expect(response.statusCode).toBe(201); // Not 400
});
```

## BudgetCategoriesPage Component Behavior Quirks

### Empty name — button disabled, not validation error

The Create Category button is disabled when `!newName.trim()`. Test correctly:

```typescript
// Test 1: button is disabled
const button = screen.getByRole('button', { name: /create category/i });
expect(button).toBeDisabled();

// Test 2: whitespace-only → validation error via form submit
fireEvent.change(nameInput, { target: { value: '   ' } });
fireEvent.submit(screen.getByRole('form')); // bypass disabled button
expect(screen.getByText(/category name is required/i)).toBeInTheDocument();
```

### Multiple elements with same text → scope to dialog

When a category name appears in BOTH the list AND a confirmation modal:

```typescript
// Wrong: getByText('Materials') finds multiple elements
// Correct:
const dialog = screen.getByRole('dialog');
expect(dialog).toHaveTextContent('Materials');
```

### Success message persists when re-opening create form

The component clears `createError` but NOT `successMessage` when opening the create form.

```typescript
// After successful create, open form again:
userEvent.click(screen.getByRole('button', { name: /add category/i }));
// Success message STILL shows — this is the correct behavior
expect(screen.getByText(/category created successfully/i)).toBeInTheDocument();
```

## CategoryInUseError

Service throws `CategoryInUseError` (code: `CATEGORY_IN_USE`, statusCode: 409) when a budget
category is referenced by a subsidy program in `subsidy_program_categories` junction table.

Test helper to simulate in-use scenario:

```typescript
function createSubsidyProgramReferencing(categoryId: string) {
  const programId = `prog-${Date.now()}`;
  db.insert(schema.subsidyPrograms).values({ id: programId, name: 'Test Program', ... }).run();
  db.insert(schema.subsidyProgramCategories).values({ subsidyProgramId: programId, budgetCategoryId: categoryId }).run();
}
```
