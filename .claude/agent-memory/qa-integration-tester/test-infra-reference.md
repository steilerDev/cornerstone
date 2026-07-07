# Test Infrastructure Reference (living doc)

> Cross-cutting, still-relevant reference patterns: quick-reference conventions, key file locations, renderHook/Drizzle/auth/circular-dep test patterns, test count history. Not dated — update in place as conventions evolve.

## Test Infrastructure Quick Reference

- **Framework**: Jest 30.x with ts-jest, ESM mode (`--experimental-vm-modules`)
- **API Testing**: Fastify `app.inject()` (in-process, no HTTP server)
- **Database**: better-sqlite3 (synchronous); Drizzle ORM 0.45.x
- **Client Testing**: jsdom + `@testing-library/react` + `@testing-library/jest-dom`
- **Test co-location**: `foo.test.ts` next to `foo.ts`
- **Test command**: `npm test -- --maxWorkers=2` (2 workers to avoid OOM in sandbox)
- **Coverage command**: `npm run test:coverage`

## Critical Patterns

### better-sqlite3 Is Synchronous

Constraint errors throw synchronously. Use try/catch, NOT `.rejects.toThrow()`:

```typescript
let error: Error | undefined;
try { await db.insert(schema.foo).values({...}); } catch (err) { error = err as Error; }
expect(error?.message).toMatch(/UNIQUE constraint failed/);
```

### ESM Mock Pattern (Client Tests)

```typescript
jest.unstable_mockModule('../../lib/someApi.js', () => ({ fetchFoo: mockFetchFoo }));
// Then deferred import inside beforeEach:
const { MyComponent } = await import('./MyComponent.js');
```

### Timestamp Ordering (DB queries with ORDER BY created_at)

Use a counter offset to ensure unique timestamps:

```typescript
let timestampOffset = 0;
function createRecord(...) { const ts = new Date(Date.now() + timestampOffset++).toISOString(); }
beforeEach(() => { timestampOffset = 0; });
```

### jsdom Limitation: isContentEditable

```typescript
Object.defineProperty(div, 'isContentEditable', { value: true, configurable: true });
```

### Fastify additionalProperties: false

Strips unknown properties (does NOT return 400). Assert 201/200, not 400.

## Test Count History (recent)

| Story                           | Tests | Suites | Date       |
| ------------------------------- | ----- | ------ | ---------- |
| EPIC-12 (Design System)         | 1072  | 53     | 2026-02-18 |
| Story #142 (Budget Categories)  | 1325  | 61     | 2026-02-20 |
| Story #143 (Vendors)            | 1555  | 66     | 2026-02-20 |
| Story #144 (Invoices)           | 1725  | 69     | 2026-02-20 |
| Story #145 (Budget Sources)     | 1927  | 73     | 2026-02-20 |
| Story #146 (Subsidy Programs)   | 2155  | 77     | 2026-02-20 |
| Story #147 (Work Item Budget)   | 2289  | 81     | 2026-02-20 |
| Story #148 (Budget Overview)    | 2388  | 85     | 2026-02-20 |
| Story 5.11 (Projected fields)   | 2379  | 85     | 2026-02-22 |
| feat/budget-hero-bar (hero bar) | 2463  | 88     | 2026-02-22 |

## Migration-Seeded Data (Critical)

`0003_create_budget_tables.sql` seeds 10 default budget categories:
Materials, Labor, Permits, Design, Equipment, Landscaping, Utilities, Insurance, Contingency, Other

**Never use these names in budget category tests** — UNIQUE constraint violations.
Use `SEEDED_CATEGORY_COUNT = 10` constant; assert `result.length >= SEEDED_CATEGORY_COUNT`.
See `budget-categories-story-142.md` for full details.

## Key File Locations

- Test utilities: `server/src/test/utils.ts`
- Test fixtures: `server/src/test/fixtures/migrations/`
- Schema tests: `server/src/db/schema.test.ts`
- Tag service tests (pattern reference): `server/src/services/tagService.test.ts`
- Tag route tests (pattern reference): `server/src/routes/tags.test.ts`

## renderHook Pattern (Custom Hooks)

```typescript
import { renderHook, act } from '@testing-library/react';
const { result } = renderHook(() => useMyHook());
act(() => {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'n' }));
});
```

## Story Patterns by Test Type

### Service Unit Tests

- Fresh in-memory SQLite per test (`new Database(':memory:')`)
- Run migrations inline (SQL strings or migration runner)
- Direct DB inserts for test data setup

### Route Integration Tests

- Temp-file SQLite per test (`fs.mkdtempSync()`)
- `buildApp()` factory from `server/src/test/utils.ts`
- `app.inject()` for HTTP requests
- `createLocalUser` + `createSession` for auth

### API Client Tests (Client)

- Mock `globalThis.fetch` with `jest.fn<typeof globalThis.fetch>()`
- Restore in `afterEach(() => { jest.restoreAllMocks(); })`

### React Component Tests

- `jest.unstable_mockModule()` + deferred import
- `renderWithRouter()` wrapper for components needing router context
- `userEvent` for interactions, `fireEvent` when you need to bypass disabled state

## Drizzle ORM Import Pattern

```typescript
import { eq } from 'drizzle-orm'; // NOT schema.eq()
db.select().from(schema.tableName).where(eq(schema.tableName.column, value));
```

## Authorization Test Patterns

- Notes: author-based (only author or admin can update/delete)
- Budget categories: any authenticated user can CRUD
- Test 401 (no auth), 403 (wrong user), 200/204 (authorized)

## Circular Dependency Testing

- Test A→B direct cycle, A→B→C indirect, A→B→C→D chain
- Verify `ConflictError` with `code: 'CIRCULAR_DEPENDENCY'` and `cyclePath` array
- Diamond DAGs (A→B, A→C, B→D, C→D) must succeed

