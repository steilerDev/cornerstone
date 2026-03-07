# E2E Parallel Test Isolation Patterns

## Problem (2026-02-20)

Playwright config uses `fullyParallel: true` with 8 workers and 3 viewport projects (desktop, tablet, mobile).
All tests share one SQLite database. Parallel workers create entities with the same hardcoded `'E2E ...'` names, causing:

- Strict mode violations: `getByRole('button', { name: 'Delete E2E Delete Target Vendor' })` matches 3+ buttons
- Count assertion failures: "Exactly 10 default categories" fails when parallel workers add extras
- Locator ambiguity: duplicate entity names across workers

## Solution: `testPrefix` Fixture

### Added to `e2e/fixtures/auth.ts`

```typescript
export const test = base.extend<{
  authenticatedPage: Page;
  testPrefix: string;
}>({
  // ...authenticatedPage unchanged...

  // eslint-disable-next-line no-empty-pattern  ← DO NOT ADD THIS — use _fixtures instead
  testPrefix: [
    async (_fixtures, use, testInfo: TestInfo) => {
      const project = testInfo.project.name.slice(0, 3); // "des", "tab", "mob"
      await use(`E2E-${project}${testInfo.workerIndex}`);
    },
    { scope: 'test' },
  ],
});
```

**Critical ESLint note**: Use `_fixtures` NOT `{}` for the first parameter. `no-empty-pattern` ESLint rule
flags `async ({}, use, testInfo)` → use `async (_fixtures, use, testInfo)` instead.

### Usage pattern in test files

```typescript
test('Delete vendor — no references', async ({ page, testPrefix }) => {
  const vendorName = `${testPrefix} Delete Target Vendor`;
  const createdId = await createVendorViaApi(page, { name: vendorName });
  // ...
  await vendorsPage.openDeleteModal(vendorName);
  // ...
});
```

Produces names like `"E2E-des0 Delete Target Vendor"` — unique per worker+project.

### API query strings: use `encodeURIComponent()`

When using vendor names in API query params:

```typescript
const resp = await page.request.get(`${API.vendors}?q=${encodeURIComponent(vendorName)}`);
```

### Count assertion fixes in budget-categories.spec.ts

The old test "Exactly 10 default categories" fails when other workers have added categories:

**Old (broken with parallel workers):**

```typescript
const count = await categoriesPage.getCategoriesCount();
expect(count).toBe(DEFAULT_CATEGORIES.length); // fails if parallel workers added extras
```

**New (parallel-safe):**

```typescript
// Check all 10 default names are present (regardless of total count)
const names = await categoriesPage.getCategoryNames();
for (const expectedName of DEFAULT_CATEGORIES) {
  expect(names).toContain(expectedName);
}
// Check heading shows count >= 10
const count = await categoriesPage.getCategoriesCount();
expect(count).toBeGreaterThanOrEqual(DEFAULT_CATEGORIES.length);
```

### Duplicate name validation test fix

When testing "duplicate name shows error", capture count BEFORE the duplicate attempt:

```typescript
const countBefore = await categoriesPage.getCategoriesCount();
await categoriesPage.createCategory({ name: 'Labor' }); // attempt duplicate
// ...
const countAfter = await categoriesPage.getCategoriesCount();
expect(countAfter).toBe(countBefore); // unchanged (not toBe(DEFAULT_CATEGORIES.length))
```

## Shared State Tests: Serial Mode

Tests that modify the shared admin user (display name, password, role) cannot use `testPrefix`
since there's only one admin user. Use `test.describe.configure({ mode: 'serial' })` inside the describe block:

```typescript
test.describe('Change Password', { tag: '@responsive' }, () => {
  test.describe.configure({ mode: 'serial' });
  // ...tests run in serial within this describe block
});
```

Files that need serial mode:

- `e2e/tests/profile/update-display-name.spec.ts`
- `e2e/tests/profile/change-password.spec.ts`
- `e2e/tests/admin/edit-user.spec.ts`
- `e2e/tests/admin/deactivate-user.spec.ts`

## Route interception tests are parallel-safe

Tests that use `page.route()` to mock API responses are already isolated (per-page intercept,
not global). They don't need `testPrefix` because they don't touch the real DB.

## Files changed

- `e2e/fixtures/auth.ts` — added `testPrefix` fixture
- `e2e/tests/budget/vendors.spec.ts` — all entity names use `testPrefix`
- `e2e/tests/budget/budget-categories.spec.ts` — entity names use `testPrefix`; count assertions fixed
- `e2e/tests/profile/update-display-name.spec.ts` — `test.describe.configure({ mode: 'serial' })`
- `e2e/tests/profile/change-password.spec.ts` — `test.describe.configure({ mode: 'serial' })`
- `e2e/tests/admin/edit-user.spec.ts` — `test.describe.configure({ mode: 'serial' })`
- `e2e/tests/admin/deactivate-user.spec.ts` — `test.describe.configure({ mode: 'serial' })`
