---
name: test-patterns-reference
description: Evergreen Jest/ts-jest/Fastify/Drizzle test infrastructure reference patterns (not story-specific) — mock patterns, sqlite quirks, worktree execution
metadata:
  type: project
---

## Test Infrastructure Quick Reference

- **Framework**: Jest 30.x with ts-jest, ESM mode (`--experimental-vm-modules`)
- **API Testing**: Fastify `app.inject()` (in-process, no HTTP server)
- **Database**: better-sqlite3 (synchronous); Drizzle ORM 0.45.x
- **Client Testing**: jsdom + `@testing-library/react` + `@testing-library/jest-dom`
- **Test co-location**: `foo.test.ts` next to `foo.ts`
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

Strips unknown properties (does NOT return 400). Assert 201/200, not 400. See also [[archive-2026-04]] for the Ajv 8 + `minProperties` interaction.

## Key File Locations

- Test utilities: `server/src/test/utils.ts`
- Test fixtures: `server/src/test/fixtures/migrations/`
- Schema tests: `server/src/db/schema.test.ts`
- Tag service/route tests (pattern reference): `server/src/services/tagService.test.ts`, `server/src/routes/tags.test.ts`

## renderHook Pattern (Custom Hooks)

```typescript
import { renderHook, act } from '@testing-library/react';
const { result } = renderHook(() => useMyHook());
act(() => {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'n' }));
});
```

## Story Patterns by Test Type

- **Service Unit Tests**: fresh in-memory SQLite per test (`new Database(':memory:')`), run migrations inline, direct DB inserts for setup.
- **Route Integration Tests**: temp-file SQLite per test (`fs.mkdtempSync()`), `buildApp()` factory from `server/src/test/utils.ts`, `app.inject()`, `createLocalUser` + `createSession` for auth.
- **API Client Tests (Client)**: mock `globalThis.fetch` with `jest.fn<typeof globalThis.fetch>()`, restore in `afterEach(() => jest.restoreAllMocks())`.
- **React Component Tests**: `jest.unstable_mockModule()` + deferred import; `renderWithRouter()` wrapper; `userEvent` for interactions, `fireEvent` to bypass disabled state.

## Drizzle ORM Import Pattern

```typescript
import { eq } from 'drizzle-orm'; // NOT schema.eq()
db.select().from(schema.tableName).where(eq(schema.tableName.column, value));
```

## Authorization Test Patterns

Notes are author-based (only author or admin can update/delete); budget categories: any authenticated user can CRUD. Test 401 (no auth), 403 (wrong user), 200/204 (authorized).

## Circular Dependency Testing

Test A→B direct cycle, A→B→C indirect, A→B→C→D chain. Verify `ConflictError` with `code: 'CIRCULAR_DEPENDENCY'` and `cyclePath` array. Diamond DAGs (A→B, A→C, B→D, C→D) must succeed.

## Worktree Jest Execution — Definitive Pattern (historical, pre this-repo's current worktree setup)

```bash
NODE_PATH=/path/to/cornerstone/server/node_modules:/path/to/cornerstone/client/node_modules \
/usr/bin/node --experimental-vm-modules \
/path/to/cornerstone/node_modules/.bin/jest \
<test-file> --no-coverage \
--rootDir /path/to/worktree
```

- Never `npm install` in a worktree missing node_modules — installs ARM64-incompatible binaries → SIGKILL. Symlink from the base project instead.
- Server tests (better-sqlite3 native binary) may SIGKILL on ARM64 sandboxes — validate via CI.
- Stale `@cornerstone/shared` dist: worktrees may share the main project's compiled output; rebuild/copy dist after changing `shared/src/types/`.

**Current worktree setup note (2026-07)**: this repo's worktrees now ship with their own `node_modules` and a real `shared/dist` build step (`cd shared && npx tsc`) is all that's needed locally — see [[story-1804-node-cron-45]] for a fresh confirmation of this simpler flow.
