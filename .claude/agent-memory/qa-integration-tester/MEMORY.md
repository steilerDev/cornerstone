# QA & Integration Tester — Agent Memory (Index)

> Detailed notes live in topic files. This index links to them.
> See: `budget-categories-story-142.md`, `e2e-pom-patterns.md`, `e2e-parallel-isolation.md`, `story-358-document-linking.md`, `story-360-document-a11y.md`, `story-epic08-e2e.md`, `story-509-manage-page.md`

## Story #606 Invoice Budget Lines UI Tests (2026-03-08)

**Test files**: `invoiceBudgetLinesApi.test.ts` (26), `InvoiceBudgetLinesSection.test.tsx` (36), updated `InvoiceDetailPage.test.tsx` (18).

**Key patterns**:
- When stubbing a sibling component (same directory), use `jest.unstable_mockModule('./InvoiceBudgetLinesSection.js', ...)` (relative path with `.js` extension)
- When a section component has cascading deps (api mocks, pickers), stub it in the parent page test rather than setting up all transitive mocks
- **Backdrop click via CSS class**: `outerModal?.querySelector('.modalBackdrop')` reliably selects the backdrop div when there is no accessible role/label on it
- **Multiple elements same text**: `plannedAmount` and `remainingAmount` can both be `$1000.00` — use distinct values in fixture to avoid `getByText` ambiguity
- **`data-invoice-total` attribute**: Numbers become strings in HTML attributes; assert with `.toHaveAttribute('data-invoice-total', '1500')` (not `1500` as number)
- **InvoiceDetailPage test cleanup**: Removed stale `workItemBudgetsApi` and `householdItemsApi` mocks after those deps moved into `InvoiceBudgetLinesSection` (now stubbed)

## Story #603 / Story 15.1 Test Fixes — Junction Table Model (2026-03-08)

**Pattern**: When `invoice_budget_lines` uses partial UNIQUE index on `work_item_budget_id` and `household_item_budget_id`, each budget line can link to AT MOST ONE invoice. Any test that previously inserted multiple invoices for the same budget line violates this constraint.

**Fix strategy**: Replace "multiple invoices on 1 budget line" with "1 invoice per budget line". Use separate budget lines for each invoice:

- When testing totals: create N budget lines, each with 1 invoice, sum the amounts
- When testing `budgetOverviewService.insertWorkItem` helper with both `actualCost` + `actualCostPending`: create a sibling budget line for the pending invoice so the UNIQUE constraint is not violated
- When testing `invoiceCount`: with new model, max count per budget line is 1 (not 2+)
- When `invoiceService.createInvoice()` no longer validates budget IDs (moved to routes layer), remove tests that expect `ValidationError`/`MutuallyExclusiveBudgetLinkError` from the service

**Files fixed** (Story 15.1 junction table migration):

- `shared/budgetServiceFactory.test.ts` — 3 tests
- `subsidyPaybackService.test.ts` — 1 test
- `shared/subsidyPaybackServiceFactory.test.ts` — 1 test
- `budgetOverviewService.test.ts` — `insertWorkItem` helper + 3 tests
- `budgetSourceService.test.ts` — 5 tests (3 multi-invoice, 1 mixed, context: claimed+paid tracking)
- `invoiceService.household.test.ts` — removed 4 tests for old FK validation logic
- `householdItemService.totalActual.test.ts` — 3 tests

## Story #603 Invoice-Budget-Line Junction Migration (2026-03-08, Bug #611)

- **Test file**: `server/src/db/migrations/0017_invoice_budget_lines.test.ts` (52 tests, all passing)
- **Critical defect found**: SQLite DOES enforce CHECK constraints when ON DELETE SET NULL fires. ADR-018 claimed otherwise. Bug #611 filed.
- **Pattern for partial migrations**: Use symlinks in a temp dir pointing to pre-migration SQL files, call `runMigrations(db, tempDir)`, then `db.exec(readFileSync('0017...sql'))` + `INSERT OR IGNORE INTO _migrations`. Clean up symlinks in `finally`.
- **`MIGRATIONS_DIR` in migration test files**: `__dirname` IS the migrations dir (test file lives inside it), so `MIGRATIONS_DIR = __dirname` (NOT `join(__dirname, 'migrations')`).
- **`ln -sf` on existing dir**: On Linux, `ln -sf /src /dest` where `/dest` is an existing directory creates a symlink INSIDE the dir, not replacing it. Use `ln -s` only when dest doesn't exist, or remove first.
- **Worktree node_modules**: If worktree has empty `node_modules`, use `ln -sf /main/node_modules /worktree/node_modules`. The symlink replaces the empty dir (verified working).
- **`console.warn = () => undefined`** in beforeEach suppresses `runMigrations()` progress logs. In tests that create their own DB (per-test isolation), also set it before calling `setupPreMigrationDb`.
- **XOR CHECK + ON DELETE SET NULL incompatibility**: Any table with `CHECK((a IS NOT NULL AND b IS NULL) OR (a IS NULL AND b IS NOT NULL))` and `ON DELETE SET NULL` on column `a` will FAIL when the referenced row is deleted (SET NULL makes both NULL, violating XOR). Fix: use CASCADE instead of SET NULL.

## Story #498 Generic Budget Service Factory (2026-03-07)

- **Test files**: `shared/budgetServiceFactory.test.ts` (65 tests), `routes/workItemBudgets.test.ts` (24 tests) — all passing.
- **Jest binary for worktree**: `node --experimental-vm-modules /Users/franksteiler/Documents/Sandboxes/cornerstone/node_modules/.bin/jest "path/to/test.ts" --no-coverage --maxWorkers=1 --rootDir /path/to/worktree`
- **`createInvoice` signature**: `(db, vendorId, data, userId)` — vendorId is a separate positional arg, NOT inside the data object.
- **HI budget category**: always `bc-household-items` (forced by `buildInsertValues`; `budgetCategoryId` in request is stripped via destructuring before calling `service.create`).
- **WI budget lines include `invoices: []` field**; HI budget lines do NOT have an `invoices` field at all (confirmed by `(result as any).invoices === undefined`).
- **HI `blockDeleteOnInvoices: false`**: deleting an HI budget line with linked invoices succeeds — the invoice FK is `onDelete: 'set null'` so the budget line is removed and the invoice's `householdItemBudgetId` becomes null.
- **`updateHouseholdItemBudget` strips `budgetCategoryId` from update** (same destructure pattern as create) so bc-household-items can never be overridden via PATCH.
- **Factory isolation test**: create WI budget line, then list HI budgets — confirms configs are truly independent.

## Story #497 Subsidy & Payback Service Factories (2026-03-07)

- **householdItems requires `categoryId`** (NOT NULL FK after migration 0016). Use `categoryId: 'hic-furniture'` in direct DB inserts — seeded by migration 0016.
- **subsidyPaybackServiceFactory uses raw SQL** (not Drizzle ORM). Configured with plain table/column string names from migrations. `supportsInvoices: false` means HI budget lines always use confidence margins — never actual invoice cost.
- **ConflictError message for HI**: `'Subsidy program is already linked to this household item'` (lowercase, matches `config.entityLabel.toLowerCase()`).
- Test files: `shared/subsidyServiceFactory.test.ts` (29), `shared/subsidyPaybackServiceFactory.test.ts` (23), `householdItemSubsidyService.test.ts` (21), `householdItemSubsidyPaybackService.test.ts` (24) — all passing.

## Running Tests from a Worktree (Critical Pattern)

Worktrees have no `node_modules`. To run tests from a worktree:

1. Create symlinks: `ln -sf /main/node_modules /worktree/node_modules` and `ln -sf /main/server/node_modules /worktree/server/node_modules`
2. Run from the WORKTREE directory: `node --experimental-vm-modules /main/node_modules/.bin/jest "path/to/test.ts" --no-coverage`
3. **This worktree already has node_modules** — node_modules are present in the worktree directly. Run jest directly without symlink step.
4. **SIGILL (exit 132) crash**: In sandbox environments, Jest may crash with SIGILL when spawning worker processes (due to CPU instruction set incompatibility). If `--maxWorkers=1` still crashes, tests cannot be run locally — commit and rely on CI. The pre-commit hook will also show SIGILL errors but still creates the commit.

## EPIC-04 Worktree @cornerstone/shared Symlink Fix

When testing new stories that add types to `shared/`, the worktree's `node_modules/@cornerstone/shared` symlink resolves to the **main repo's shared** (not the worktree's). The main repo won't have the new types built yet.

**Fix**: Update the symlink to point to the worktree's own shared directory:

```bash
rm node_modules/@cornerstone/shared
ln -s /absolute/path/to/worktree/shared node_modules/@cornerstone/shared
```

Also rebuild the worktree's shared: `node_modules/.bin/tsc -p shared/tsconfig.json`

Do NOT use `import type { Foo } from '@cornerstone/shared'` in test files if Foo is a newly added type — instead use `Parameters<typeof service.method>[N]` to derive types from the service function signatures.

## Schema Quirk: tags table has NO updated_at

The `tags` table (migration 0002) only has: `id, name, color, created_at` — NO `updated_at`. `TagResponse` also has no `updatedAt`. Do not include this field in test inserts or type assertions.

- Do NOT cast `mockGet.mock.calls[0] as [string]` — TypeScript strict mode rejects empty arrays cast to tuple. Use `expect(mockGet).not.toHaveBeenCalledWith(expect.stringContaining(...))` pattern instead.

## Story #509 Unified Tags & Categories Management Page (2026-03-06)

Bugs filed: **#511** (migration 0016 `ALTER TABLE MODIFY` invalid SQLite syntax) and **#512**
(`householdItemDepService.ts:295` references removed column `category` → TS2551).
Both bugs block ALL server-side tests that call `runMigrations()` on in-memory SQLite.

**Migration fix**: Remove line 41 of `0016_household_item_categories.sql`
(`ALTER TABLE household_items MODIFY category_id TEXT NOT NULL DEFAULT 'hic-other';`).
SQLite does not support `ALTER TABLE MODIFY COLUMN` — that's MySQL syntax.

**Client test pattern** (render helper inside describe): Move `renderManagePage()` helper
inside the `describe` block where the `let ManagePage` variable is declared. Placing it
at module scope gives TS error "Cannot find name 'ManagePage'".

**Multiple elements for modals**: Modal heading + confirm button both have "Delete Tag" /
"Delete Category" text. Use `getByRole('heading', { name: '...' })` instead of `getByText`.

**ManagePage seeded HI categories**: Migration 0016 seeds 8 categories:
Furniture, Appliances, Fixtures, Decor, Electronics, Outdoor, Storage, Other (IDs: hic-furniture etc.)

**HIC entity has no description field** (unlike BudgetCategory which has `description`).

**Test files created**:

- `server/src/services/householdItemCategoryService.test.ts` (blocked by Bug #511)
- `server/src/routes/householdItemCategories.test.ts` (blocked by Bugs #511, #512)
- `client/src/lib/householdItemCategoriesApi.test.ts` (18 tests, all passing)
- `client/src/pages/ManagePage/ManagePage.test.tsx` (38 tests, all passing)

## Story #415 HI Timeline Deps (2026-03-03, PR #416)

See `story-415-household-item-timeline-deps.md` for full details. Key learnings:

- **SVG `className` in jsdom**: Returns `SVGAnimatedString`, NOT a string. Use `element.getAttribute('class') ?? ''`.
- **`autoReschedule()` does NOT have an early return when no work items exist** — it continues to process
  HI delivery dates even when `allWorkItems.length === 0`. The guard on line 677 only skips fetching
  `workItemDependencies`, not the HI delivery date computation. Tests can create HIs with only
  `earliestDeliveryDate` (no work item dep) and still get a computed `targetDeliveryDate`.
- **ConflictError**: always uses `'CONFLICT'` as error.code (not `'DUPLICATE_DEPENDENCY'` — that's in details).
- **Bug #417**: `fetchLinkedHouseholdItems` calls wrong URL → breaks WorkItemDetailPage → E2E smoke test failure.
- **Typed mock pattern**: `jest.fn<typeof ApiTypes.method>()` in factory; `mockFn.mockResolvedValue()` in `beforeEach`.

## Bug #482: HI Schedule Not Recalculated on Constraint Change (2026-03-06)

Test file: `server/src/services/householdItemService.reschedule.test.ts` (10 tests).

Key learnings on `autoReschedule` HI delivery date logic:

- **`createHouseholdItem` does NOT call autoReschedule** — `targetDeliveryDate` is always `null` after creation.
  A subsequent `updateHouseholdItem` with any scheduling field triggers the first reschedule.
- **`isLate` for HIs is rarely true**: The CPM `maxES` defaults to `today`, so `earliestDeliveryDate` in
  the past is a no-op (it's already covered by the floor). `isLate` only fires when `targetDate < today`
  BEFORE the floor is applied — which can't happen when `maxES = today` is the starting point.
  A WI dep also can't produce `predEF < today` because WIs are floored to today by CPM too.
- **`status: 'planned'` + past `earliestDeliveryDate` → `targetDeliveryDate = TODAY, isLate = false`**
  (not isLate=true as one might expect — see above).
- **`actualDeliveryDate` overrides CPM**: When set, `targetDeliveryDate` becomes `actualDeliveryDate`
  regardless of any constraint or dep date. `isLate` is always false when `actualDeliveryDate` is set.
- **Worktree @cornerstone/shared fix needed**: When worktree adds fields to shared types, the
  `node_modules/@cornerstone/shared` symlink points to the main repo's shared (which symlinks to
  `../../shared` from the main `node_modules`). Fix: `rm node_modules/@cornerstone/shared &&
ln -s /absolute/worktree/shared node_modules/@cornerstone/shared`, then rebuild with
  `node_modules/.bin/tsc -p shared/tsconfig.json`.

## Story #390 Household Item Create & Edit Forms (2026-03-03)

- `Vendor` interface (shared/types/vendor.ts) has many required nullable fields: `phone`, `email`, `address`, `notes`, `createdBy`, `createdAt`, `updatedAt`. In vendor mock arrays, always include all fields or TypeScript strict-mode will reject.
- `HouseholdItemVendorSummary` (used in `HouseholdItemDetail.vendor`) only has `id`, `name`, `specialty` — safe to use directly.
- `HouseholdItemEditPage` error check: component checks `err.message.includes('404')`, `'not found'`, `'Not found'` for 404 detection — test all three variants.
- Submit button text: Create page uses "Create Item"; Edit page uses "Save Changes".
- Back button text: Create page "Back to Household Items"; Edit page "Back to Item".
- useToast mock pattern (same as TimelinePage): `jest.unstable_mockModule('../../components/Toast/ToastContext.js', () => ({ ToastProvider: ..., useToast: () => ({ toasts: [], showToast: jest.fn(), dismissToast: jest.fn() }) }))`.

## Story #360 Document Responsive & A11y (2026-03-02)

See `story-360-document-a11y.md` for full details. Key learnings:

- **DocumentCard aria-label**: now includes formatted date — `"Document: {title}, Mar 15, 2025"`
- **aria-busy={false}** in JSX renders as `aria-busy="false"` string — test with string `'false'`
- **tabIndex attr**: lowercase `tabindex` in HTML — use `toHaveAttribute('tabindex', '-1')`
- **Focus via setTimeout**: always use `await waitFor(...)` for focus assertions
- **Stash pop corruption**: `git stash pop` can break deferred mock import order — verify invariants

## Story #358 Document Linking (PR #378, 2026-03-02)

See `story-358-document-linking.md` for full details. Key learnings:

- **waitFor race condition**: include `isLoading` check INSIDE the same `waitFor` as mock call checks
- **Duplicate text**: `InvoiceDetailPage` renders status badge TWICE — use `getAllByText()`
- **Prettier must run FROM worktree dir** (not from main repo root) to resolve `.prettierrc` correctly
- **Skipping bug-blocked tests**: use `it.skip()` with `// TODO: Unskip after bug #N is fixed`
- **Bug #379**: unlink modal hardcodes "this work item" — must fix before enabling invoice unlink test

## EPIC-06 E2E Coverage (PR #259, 2026-02-24)

See topic file `e2e-timeline-tests.md` for full details.

- TimelinePage POM fully implemented: `e2e/pages/TimelinePage.ts` (50+ locators)
- 5 test files: `e2e/tests/timeline/timeline-{gantt,milestones,calendar,schedule,responsive}.spec.ts`
- GanttMilestoneDiamond has `role="graphics-symbol"` — select via `data-testid="gantt-milestone-diamond"`
- Timeline stub test removed from `stub-pages.spec.ts`
- Milestone API helpers added to `apiHelpers.ts`; `milestones`/`timeline`/`schedule` added to `testData.ts`

## E2E Parallel Isolation (2026-02-20)

`testPrefix` fixture added to `e2e/fixtures/auth.ts` — use `async (_fixtures, use, testInfo)` (NOT `{}` — ESLint `no-empty-pattern`).
Produces `"E2E-des0 Vendor Name"` — unique per worker+project. See `e2e-parallel-isolation.md`.
Shared-state tests (profile, admin user) use `test.describe.configure({ mode: 'serial' })`.
Count assertions: use `>= DEFAULT_CATEGORIES.length` not `=== 10`; capture `countBefore` before actions.

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

## BudgetCategoriesPage Behavior Notes

See `budget-categories-story-142.md` for:

- Empty name: button disabled (not validation error path)
- Modal text: scope to `getByRole('dialog')` when name appears in both list and modal
- Success message: persists when re-opening create form (only `createError` is cleared)
- `CategoryInUseError`: triggers 409 with in-use details from subsidy program junction table

## VendorDetailPage / VendorsPage Behavior Notes (Story #143)

- Vendors schema: NOT unique by name (multiple vendors may share the same name)
- `VendorInUseError`: throws 409 when vendor has invoices OR work item links (either)
- `deleteVendor` blocks on paid invoices too (invoiceCount > 0 regardless of status)
- Route tests use `buildApp()` + temp-file SQLite (same pattern as budget categories)
- VendorsPage renders BOTH desktop table and mobile cards — same phone/email appears twice
  → Use `getAllByText()` or `getByRole('link')` when asserting phone/email in VendorsPage
- VendorDetailPage renders specialty in TWO places (pageSubtitle + infoList dd)
  → Use `getAllByText('Plumbing')` when asserting specialty in VendorDetailPage
- VendorDetailPage ESM mock: mock all 5 exports in `jest.unstable_mockModule()`, including
  unused ones (fetchVendors, createVendor) as `jest.fn()` to avoid import errors
- VendorDetailPage uses `useParams` + `useNavigate` — need full Routes setup in tests:
  `<Route path="/budget/vendors/:id" element={<VendorDetailPage />} />`
  `<Route path="/budget/vendors" element={<div>Vendors List Page</div>} />`
- Delete success in VendorDetailPage navigates away (no success message stays on page)
- Edit success in VendorDetailPage: updates vendor state inline (no page reload needed)
- `within(dialog).getByRole(...)` pattern is required when modal button text matches page text

## Worktree Test Execution — ARM64 Crash and Shared Types

### ARM64 / SIGKILL (server tests with better-sqlite3)

- Server tests (all `server/src/services/*.test.ts`) get SIGKILL'd in the sandbox (ARM64 emulation).
- **Client tests** (jsdom, no native binary) run fine: `npx jest "Name" --no-coverage --testEnvironment=jsdom`
- Server tests MUST be validated via CI (ubuntu-latest, x86_64). Do not run them locally.
- The pre-commit hook and CI both run them successfully on the x86 CI machine.

### Stale @cornerstone/shared dist in Worktrees

- Worktrees share the main project's `node_modules` (symlink to `../../shared`).
- When a worktree branch adds fields to shared types (e.g., `vendorName` on `Invoice`), the main project's `shared/dist` is STALE — the symlink points to main project's compiled output which doesn't have the new field.
- Fix: copy the updated dist files from worktree to main project's shared/dist:
  ```bash
  cp worktree/shared/dist/types/invoice.d.ts mainproject/shared/dist/types/invoice.d.ts
  cp worktree/shared/dist/index.d.ts mainproject/shared/dist/index.d.ts
  ```
- The pre-commit hook automatically rebuilds shared (`npm run build -w shared`) before typechecking, so committing works correctly even when local test runs fail due to stale types.

## VendorDetailPage Invoice Tests (Story #144)

- Must mock BOTH `../../lib/vendorsApi.js` AND `../../lib/invoicesApi.js` before importing component
  → Two separate `jest.unstable_mockModule()` calls; mock all 4 invoicesApi exports
- Default `mockFetchInvoices.mockResolvedValue([])` in `beforeEach` prevents unexpected failures
- Resetting invoiceApi mocks in `beforeEach` is required (`mockFetchInvoices.mockReset()` etc.)
- `fireEvent.change()` needed for number/date inputs (not `userEvent.type()`) to trigger React state
- Invoice renders in BOTH desktop table AND mobile card list → amounts/status appear 2x:
  → Use `getAllByText(/\$1,500\.00/)` or assert `.length > 0` on amount assertions
- Outstanding balance badge ("Outstanding: $X.XX") only appears when `invoices.length > 0`
  → Test `screen.queryByText(/outstanding:/i)` for empty state assertion
- Edit button aria-label includes invoice number: `aria-label="Edit invoice INV-001"` (table row)
  and `aria-label="Edit invoice invoice-id"` for no-number invoices → use regex match
- Delete modal shows "this invoice" (not invoice number) when `invoiceNumber` is null
- Service unit tests: `insertRawInvoice()` helper bypasses service validation — use for setup only
- Route tests: service tests use `:memory:` DB, route tests use temp-file DB (`mkdtempSync`)
- Nested route prefix: `invoiceRoutes` registered at `/api/vendors/:vendorId/invoices` in app.ts
- JSON schema for invoices: `exclusiveMinimum: 0` enforced by Fastify (no amount<=0 through)
- Git workflow: if remote has diverged, `git reset --hard origin/branch` then re-copy test files

## BudgetSourcesPage / budgetSourceService Notes (Story #145)

- `users` schema requires `authProvider: 'local'` — always include in service test `insertTestUser()` helper
- BudgetSourcesPage: `totalAmount` and `availableAmount` both format as `$200,000.00` when usedAmount=0
  → Use `getAllByText('$200,000.00')` not `getByText()` to avoid multiple-element errors
- BudgetSourcesPage: `type="number"` inputs block non-numeric values from `userEvent.type()`
  → For negative amount validation test, use `fireEvent.change(input, { target: { value: '-1' } })`
  → `Object.defineProperty(input, 'value')` does NOT trigger React state — avoid this pattern
- BudgetSourcesPage delete modal confirm button is labeled "Delete Source" (not "Delete Budget Source")
  → Use `getByRole('button', { name: /delete source/i })` for the confirm button inside the modal
- BudgetSourcesPage: delete modal Cancel button is the FIRST button in the dialog
  → Scope to `dialog.querySelector('button')` to click Cancel safely
- budgetSources schema: no UNIQUE constraint on name (unlike budget categories) — duplicates allowed
- `BudgetSourceInUseError` has code `BUDGET_SOURCE_IN_USE` (not `CONFLICT`)
- Budget source amounts: `usedAmount` and `availableAmount` are computed fields (currently always 0 / totalAmount)
- Route tests: service tests use buildApp() + temp-file SQLite (same as other budget features)

## BudgetOverviewPage Hero Bar Test Patterns (feat/budget-hero-bar)

- `RemainingDetailPanel` is rendered TWICE (Tooltip panel + mobile inline panel) → use `getAllByText()` not `getByText()`
- Remaining range values (€60K, €40K) appear in BOTH the tooltip content AND the mobile inline panel → `getAllByText(/€60K/)`
- DOM traversal for mobile inline panel: `remainingBtn → .closest('.wrapper') → .nextElementSibling`
  (wrapper span is the Tooltip component; its sibling is the remainingDetailPanel div)
- `BudgetHealthIndicator` uses `role="status"` — conflicts with loading indicator. After loading completes, only the health badge has `role="status"`.
- `CategoryFilter` dropdown uses `role="listbox"` — check with `screen.getByRole('listbox')` when open
- Category checkboxes are labeled by `categoryName` text — use `getByRole('checkbox', { name: 'Materials' })`
- `formatShort()` converts ≥1000 to `€NNK` notation — assert `getByText(/€140K/)` not `getByText(/140,000/)`
- `availableFunds` is shown as full currency (not short) in the Available Funds metric group
- Bar segments are `aria-hidden="true"` divs — select via `container.querySelectorAll('[aria-hidden="true"]')`
- Tooltip component hide has 50ms delay — use `jest.useFakeTimers()` + `act(() => jest.advanceTimersByTime(100))`

## Two Critical E2E Anti-Patterns (2026-02-21, PR #174)

See `e2e-pom-patterns.md` for full details on:

1. **Hardcoded `waitFor({ timeout: N })`** overrides project-level tablet/mobile 15s timeout
   → Always omit explicit timeout in POM `waitFor()` calls (NEVER use `timeout: 5000`)
   → All `timeout: 5000` occurrences purged from all POMs and specs 2026-02-21 (19 files)
2. **`[class*="prefix"]` strict mode violations** — `emptyState` matches `emptyStateTitle` too
   → Add element type: `div[class*="emptyState"]` instead of `[class*="emptyState"]`
3. **Mobile CSS-hidden table** — `display:none` elements still in DOM; `textContent()` works,
   clicks fail → check `tableContainer.isVisible()` before using table rows

## E2E Wait Patterns: waitForResponse BEFORE the action (2026-02-23, PR #207)

**THE MOST IMPORTANT RULE**: `page.waitForResponse(pred)` must ALWAYS be registered
BEFORE the action that triggers the request. If registered after, a fast runner can
complete the request before the listener is attached, causing it to never resolve.

```typescript
// CORRECT — register listener first, then trigger, then await
const responsePromise = page.waitForResponse(pred);
await triggeringAction(); // fill/click/submit
await responsePromise;

// WRONG — triggers request first, may miss the response on fast/slow runners
await triggeringAction();
await page.waitForResponse(pred); // race condition
```

This applies to:

- `search()` / `clearSearch()` in WorkItemsPage.ts (debounce = 300ms)
- `confirmDelete()` in WorkItemsPage.ts (DELETE 204)
- Proxy login tests in proxy-setup.spec.ts (use Promise.all pattern)
- Any form submit that navigates

Additionally: after a `waitForResponse` for a search/filter, call `waitForLoaded()`
to wait for React to flush the new data into the DOM. The response arriving does NOT
mean the DOM has updated.

**After delete:** Register the list-refresh GET listener BEFORE calling confirmDelete().
confirmDelete() now waits for DELETE 204 AND modal to hide internally.

**Navigation timeouts:** Never hardcode `{ timeout: 7000 }` on `waitForURL()` or expect
assertions — use project-level timeouts (15s for mobile/tablet WebKit).

**Proxy login:** Use `waitForURL(url => !url.pathname.includes('/login'), { timeout: 15000 })`
not `expect(page).not.toHaveURL(/\/login/, { timeout: 15000 })` — `waitForURL` is a
reliable condition-based wait; `not.toHaveURL` can race with React router updates.

## TagManagementPage E2E Notes (2026-02-21)

- Modal has `role="dialog" aria-modal="true"` but NO `aria-labelledby` — use `page.locator('[role="dialog"][aria-modal="true"]')` not `getByRole('dialog', { name: })`.
- Edit/Delete buttons in tag rows have NO aria-labels — scope to `.tagRow` and use `getByRole('button', { name: 'Edit', exact: true })`.
- Edit form has NO aria-label — locate by `filter({ has: page.locator('input[type="text"]') })` on `.tagRow`.
- `createErrorBanner` filter: `/already exists|tag name is required|50 characters/i` — these are the server/component messages for duplicate/validation errors.
- `successBanner` filter: `/successfully/i` — all success messages contain "successfully".
- `getTagNames()` reads `.tagInfo` divs (not whole `.tagRow` which includes "Edit"/"Delete" text).
- `getEditModeRow()` is public (not private) — needed for `editSaveButton` getter.
- `waitForTagsLoaded()` races between `.tagRow first()` and `.emptyState`.
- Spec file: `e2e/tests/tags/tag-management.spec.ts` (12 scenarios, ~20 tests).
- POM file: `e2e/pages/TagManagementPage.ts`.
- `API.tags` was already in `testData.ts` (added in an earlier story).

## SubsidyProgramsPage / subsidyProgramService Notes (Story #146)

- Component imports from BOTH `subsidyProgramsApi.js` AND `budgetCategoriesApi.js` — must mock both
  → Two separate `jest.unstable_mockModule()` calls before deferred component import
- Delete confirm button text: `"Delete Program"` (not "Delete Subsidy Program")
  → Use `getByRole('button', { name: /delete program/i })` inside dialog scope
- 409 in-use error hides delete confirm button (conditional render: `!deleteError`)
  → After triggering in-use error, assert confirm button is gone (`queryByRole` returns null)
- Edit form queried with `getByRole('form', { name: /edit <program name>/i })`
  → `aria-label={`Edit ${program.name}`}` on the form element
- Reduction display: `15%` for percentage type, `$5,000.00` for fixed type (Intl.NumberFormat)
- Status badges: `{ eligible: 'Eligible', applied: 'Applied', approved: 'Approved', received: 'Received', rejected: 'Rejected' }`

## Work Item Budget Properties Notes (Story #147)

- Test count: 2289 tests, 81 suites (added ~564 tests)
- `post<void>` in API client: 201 responses return parsed JSON body, NOT undefined
  → Test `.resolves.not.toThrow()` not `.toBeUndefined()`; 204 responses DO return undefined
- budgetSourceService.computeUsedAmount: NOW real (sums work items' actualCost)
  → Old "Story 6 placeholder" tests replaced with real work item fixture tests
  → Use `insertRawWorkItemWithSource(sourceId, actualCost)` helper (bypasses service)
- Known Bug #155: `fetchWorkItemSubsidies` reads `r.subsidyPrograms` but route sends `{ subsidies: [...] }`
  → Client type: `get<{ subsidyPrograms: SubsidyProgram[] }>` — mock with `{ subsidyPrograms: [...] }` in tests
- workItemVendorService / workItemSubsidyService: standard service pattern (`:memory:` DB)
- workItemVendors.test.ts / workItemSubsidies.test.ts: standard route pattern (`mkdtempSync`)
- Both vendor and subsidy linking routes: any authenticated user (member or admin) can CRUD
- Duplicate link → 409 CONFLICT; missing work item → 404; missing vendor/subsidy → 404 NOT_FOUND
- Category pills: each category name appears as a `<span>` inside the program card
- `SubsidyProgramInUseError` has code `SUBSIDY_PROGRAM_IN_USE` (409)
- `ApiClientError(statusCode, error)` — 2-arg constructor (NOT 3-arg)
- Network error wraps as `'Network request failed'` (NOT the original error message)
- `updatedAt` timestamp test: use `setTimeout(resolve, 5)` (not 1ms — too tight)
- `fireEvent.change()` required to clear input in disabled state (not `user.clear()`)
- Service tests: avoid seeded budget category names (use `'TestCategory-${id}'` prefix)
- Route tests: use `'TestMatCat'`, `'TestLaborCat'`, `'TestDesign'` as distinct test category names
- `reductionType` enum: `'percentage' | 'fixed'`; `applicationStatus` enum: `'eligible' | 'applied' | 'approved' | 'received' | 'rejected'`
- Valid Fastify JSON schema: `exclusiveMinimum: 0` for reductionValue; `minProperties: 1` for PATCH body

## BudgetOverviewPage / budgetOverviewService Notes (Story #148)

- `getBudgetOverview(db)` runs 5 raw SQL queries — test with `:memory:` DB (service) and temp-file DB (route)
- Route registered at `/api/budget/overview` (GET) — both admin and member can access
- `categorySummaries` includes all budget categories (LEFT JOIN), even with 0 work items
  → Empty DB returns 10 rows (seeded categories), all zeroes
- `financingSummary.totalUsed` = sum of `actualCost` from work items that reference ACTIVE sources
  → Exhausted/closed sources excluded from both `totalAvailable` AND `totalUsed`
- Subsidy `totalReductions`: percentage uses `planned_budget * value / 100` (NULL planned_budget → 0)
  → Rejected programs excluded from both `activeSubsidyCount` AND `totalReductions`
- Currency format: `en-US` locale with `EUR` currency → `€150,000.00` notation
  → Use `/150,000\.00/` regex; `getAllByText(...)` for amounts appearing in both card and table

## BudgetSource unclaimedAmount Field (feat/budget-source-unclaimed, 2026-02-23)

- `unclaimedAmount` = SUM of `invoices.amount` WHERE `status='paid'` joined via `work_item_budgets.budget_source_id`
- `claimedAmount` = SUM WHERE `status='claimed'` — these two are INDEPENDENT; test them separately
- `actualAvailableAmount = totalAmount - claimedAmount` (unclaimedAmount does NOT affect it)
- BudgetSourcesPage new UI layout: Total/Claimed/Unclaimed/Available (actualAvailableAmount) + "Planned: $X" secondary line
  → "Planned" secondary line shows `usedAmount` (planned/estimated usage, not actual invoices)
  → `usedAmount` and `availableAmount` are still computed from planned budget assignments
- Route test helper pattern: `insertBudgetLineWithPaidInvoice()` mirrors `insertBudgetLineWithClaimedInvoice()`
  → Only difference is `status: 'paid'` vs `status: 'claimed'` on the invoice insert
- Test file execution count: 240 tests (4 files) all pass after update

## Worktree Jest Execution — Definitive Pattern

When running Jest from a worktree (no local node_modules):

```bash
NODE_PATH=/path/to/cornerstone/server/node_modules:/path/to/cornerstone/client/node_modules \
/usr/bin/node --experimental-vm-modules \
/path/to/cornerstone/node_modules/.bin/jest \
<test-file> --no-coverage \
--rootDir /path/to/worktree
```

- **Never `npm install` in a worktree** — installs ARM64-incompatible binaries → `Illegal instruction` (SIGKILL)
- If worktree has stale `node_modules`, remove them: `rm -rf /worktree/node_modules`
- **Stale shared dist**: worktrees share main project's `node_modules/@cornerstone/shared → ../../shared`
  → After changing `shared/src/types/`, rebuild main project's dist OR copy worktree dist files:
  `cp -r /worktree/shared/dist /path/to/cornerstone/shared/`
- Server tests (better-sqlite3 native binary) may SIGKILL on ARM64 sandbox — validate via CI if needed

## Story 6.2 (Scheduling Engine CPM, #248) — Key Patterns (2026-02-24)

### CPM Engine Behavior

- `today` floor ONLY for predecessor-less items (line 408-410 of schedulingEngine.ts)
- Items WITH predecessors: ES driven purely by dependency math, CAN go before `today`
- SF(A,B): B.ES = A.ES + leadLag - B.duration (can be before today if A.ES is close to B.duration)
- Test accordingly: SF with A.ES=2026-01-01, B.duration=3 → B.ES=2025-12-29

### Fastify additionalProperties Reminder

- `additionalProperties: false` STRIPS unknown fields → 200, not 400
- Reference: `milestones.test.ts` line 337 "Fastify with additionalProperties: false strips unknown fields rather than rejecting"
- Test should assert 200 and rename to "should strip and ignore unknown body properties (Fastify default)"

## Story 6.3 (Timeline Data API, GET /api/timeline, #240) — 2026-02-24

- **41 unit tests** in `server/src/services/timelineService.test.ts` — mocks `schedulingEngine.js`
- **29 integration tests** in `server/src/routes/timeline.test.ts` — real scheduling engine
- ESM mock pattern used: `jest.unstable_mockModule('./schedulingEngine.js', ...)` + dynamic import in `beforeEach`
- Committed `d7d92e3` on branch `feat/240-timeline-data-api`

### computeDateRange edge case (IMPORTANT)

When only `startDate` set on items → `latest` falls back to `earliest` (minimum startDate).
When only `endDate` set on items → `earliest` falls back to `latest` (maximum endDate).
Source: `computeDateRange()` uses `earliest ?? latest!` and `latest ?? earliest!` as fallbacks.

### Timeline vs Schedule endpoint behavior

- GET /api/timeline: returns 200 + empty `criticalPath: []` when circular dependency exists
- POST /api/schedule: returns 409 CIRCULAR_DEPENDENCY for the same scenario
- Both behaviors are intentional; timeline uses `scheduleResult.cycleNodes?.length ? [] : scheduleResult.criticalPath`

### Timeline `dependencies` and `milestones` not filtered by date

Only `workItems` is filtered (must have startDate OR endDate). `dependencies` and `milestones` are
returned regardless — even if the linked work items have no dates.

## Story 6.1 (Milestones Backend, #238) — Worktree Issues (2026-02-24)

Worktree `effervescent-drifting-flute` had `npm install --ignore-scripts` run on it, which
downloaded **corrupted TypeScript and eslint-plugin-react-hooks packages** (truncated .js files).
Fix: symlink from base project:

```bash
rm -rf /worktree/node_modules/typescript && ln -s /base/node_modules/typescript /worktree/node_modules/typescript
rm -rf /worktree/node_modules/eslint-plugin-react-hooks && ln -s /base/node_modules/eslint-plugin-react-hooks /worktree/node_modules/
```

The worktree's `@cornerstone/shared` symlink correctly points to `../../shared` (the worktree's own shared),
which already has the milestone types built. The pre-commit hook builds shared from source anyway.

Milestone service pattern: `getMilestoneById` with `null` scheduledDate returns `undefined` from DB
(SQLite null → JS null, not undefined). The `completedAt` field is auto-managed: set on `complete`
status, cleared on other statuses.

Milestone routes: `POST /api/milestones/:id/work-items` links by `workItemId`; responds 409 on duplicate.
`DELETE /api/milestones/:id/work-items/:workItemId` uses predecessorId in URL (unlinks, does NOT delete the work item).
Cascade delete of milestone: work items are preserved (only the link is deleted).

## Story 6.4 (Gantt Chart Core, PR #250) — 2026-02-24

### SVG element `tabindex` casing

SVG elements use lowercase `tabindex` attribute (per SVG spec), unlike HTML elements (`tabIndex`).

- `expect(svgElement).toHaveAttribute('tabindex', '0')` — CORRECT for SVG `<g>`, `<rect>`, etc.
- `expect(htmlElement).toHaveAttribute('tabIndex', '0')` — CORRECT for HTML `<div>`, `<button>`, etc.

### `toHaveStyle` with numeric pixel values

`toHaveStyle({ height: 48 })` FAILS — jsdom renders inline styles as strings with `px` units.
Fix: always use string format: `toHaveStyle({ height: '48px' })`.
The `px` suffix is required; bare numbers only work for unitless properties (opacity, z-index, etc.).

### SVG components need `<svg>` wrapper in jsdom

```tsx
function renderInSvg(props) {
  return render(
    <svg>
      <GanttBar {...props} />
    </svg>,
  );
}
```

Without the wrapper, SVG elements like `<g>`, `<rect>`, `<text>` fail to render correctly in jsdom.

### ganttUtils.ts Constants Quick Reference

| Constant               | Value | Note                        |
| ---------------------- | ----- | --------------------------- |
| `COLUMN_WIDTHS.day`    | 40    | px per day                  |
| `COLUMN_WIDTHS.week`   | 110   | px per week                 |
| `COLUMN_WIDTHS.month`  | 180   | px per month                |
| `ROW_HEIGHT`           | 40    | full row height             |
| `BAR_HEIGHT`           | 32    | bar rect height             |
| `BAR_OFFSET_Y`         | 4     | top padding within row      |
| `HEADER_HEIGHT`        | 48    | date header row height      |
| `SIDEBAR_WIDTH`        | 260   | left panel width            |
| `TEXT_LABEL_MIN_WIDTH` | 60    | min bar width to show label |

BAR_OFFSET_Y + BAR_HEIGHT = 36, NOT ROW_HEIGHT (40). 4px bottom padding intentional.

### useTimeline hook mock call-count limitation

Same pre-existing ESM mock limitation as AuthContext/WorkItemsPage: `mockGetTimeline` call
count stays 0 when testing the hook in isolation. Remove mock call-count assertions; test
behavioral outcomes (loading state, error messages) instead. Call-count tests only work
at page level (TimelinePage.test.tsx) where the mock path matches the load context exactly.

### Test files created (Story 6.4)

- `client/src/components/GanttChart/ganttUtils.test.ts` — 127 tests (pure utils)
- `client/src/hooks/useTimeline.test.tsx` — 8 tests (hook state mgmt)
- `client/src/components/GanttChart/GanttBar.test.tsx` — 29 tests (SVG bar)
- `client/src/components/GanttChart/GanttSidebar.test.tsx` — 25 tests (sidebar)
- `client/src/components/GanttChart/GanttHeader.test.tsx` — 21 tests (date header)

## EPIC-06 UAT Fixes (PR #263, 2026-02-25)

### Route Schema: workItemIds must NOT use `format: 'uuid'`

Work item IDs in Cornerstone are NOT UUIDs — they're `work-item-${timestamp}-${random}` strings.
The `format: 'uuid'` validator in Fastify JSON schema REJECTS these, returning HTTP 400.
Use `{ type: 'string' }` without any format for work item ID fields in route body schemas.
This bug was found by integration tests in CI: milestones.test.ts returned 400 instead of 201.

### MilestoneWorkItemLinker Refactor — Test Updates

When a component is refactored to delegate to WorkItemSelector:

- aria-label changes: `"search work items to link"` → `"search work items to add"` (WorkItemSelector's label)
- Placeholder text: `"No work items linked"` → `"No work items selected"` (WorkItemSelector's placeholder)
- Always update pre-existing tests to match the new component's DOM (don't assume stale tests are valid)

### global.fetch Mocking vs jest.unstable_mockModule

For components that call fetch internally (WorkItemSelector, MilestonePanel):

- `global.fetch` mocking is more reliable than `jest.unstable_mockModule` for API-calling components
- Pattern: `global.fetch = jest.fn()` in `beforeEach`; `global.fetch = undefined` in `afterEach`
- `import type * as FooTypes from './Foo.js'; let Foo: (typeof FooTypes)['Foo'];` for deferred imports

### ESLint Rules in Test Files

- `import()` type annotations forbidden inline: use `import type * as X from './X.js'` at top
- `no-unused-vars`: unused variables must be removed or prefixed with `_`
- `no-explicit-any`: add `// eslint-disable-next-line @typescript-eslint/no-explicit-any` on LINE BEFORE

### Prettier: Run After Every File Edit

- Base project prettier: `cd /base && node_modules/.bin/prettier --write <file>`
- CI's format:check will fail if files aren't formatted
- Run prettier on ALL modified files before committing

## Calendar Tooltip Tests (PR #297 fix, 2026-02-26)

### Mouse event callback patterns

- `CalendarItem`: `onMouseEnter(itemId, clientX, clientY)`, `onMouseLeave()`, `onMouseMove(clientX, clientY)`
- `CalendarMilestone`: `onMouseEnter(milestoneId, clientX, clientY)`, `onMouseLeave()`, `onMouseMove(clientX, clientY)`
- Fire with `fireEvent.mouseEnter(el, { clientX: N, clientY: N })` — React synthetic event maps `clientX/Y`

### Tooltip portal test assertion

- `GanttTooltip` renders via `createPortal` to `document.body` — jsdom supports this natively
- Tooltip appears after `TOOLTIP_SHOW_DELAY=120ms` — use `jest.useFakeTimers()` + `act(() => jest.advanceTimersByTime(150))`
- When title text appears in BOTH the CalendarItem bar AND the tooltip, use `tooltip.toHaveTextContent(title)` (scoped to tooltip element), NOT `screen.getByText()` (throws multiple-match error)
- `beforeAll`/`afterAll` for `jest.useFakeTimers()` / `jest.useRealTimers()` — avoids polluting other tests

### S/M/L toggle removed — test pattern

- `screen.queryByRole('toolbar', { name: /column size/i })` should return null
- Check mode toggle toolbar has exactly 2 buttons (Month + Week)
- `calendarSize` URL param should be silently ignored (grid renders normally)

## Story #480 Budget Overview Refinement — CostBreakdownTable + BudgetOverviewPage (2026-03-06)

Key learnings from updating these two test files:

- **`budgetSources` prop is now required** on `CostBreakdownTable`. All existing test renders needed `budgetSources={[]}` added. When updating tests for a prop change, grep ALL render calls in the file — missing one causes TS errors.
- **CSS module class selectors with identity-obj-proxy**: `container.querySelectorAll('.rowActual')` works because identity-obj-proxy returns the class name as-is. `[class*="metricRangeSep"]` also works for substring matching.
- **`formatShort()` rounding**: `(7500/1000).toFixed(0)` rounds to `"8"` → displays as `€8K`, NOT `€7K`. Always verify rounding manually for test assertions against `formatShort`.
- **`role="radio"` in radiogroup**: PerspectiveToggle uses `role="radio"` on buttons (not native `<input type="radio">`). Select with `screen.getByRole('radio', { name: 'Min' })`.
- **Multiple API mocks**: When a page calls `fetchBudgetSources` from `budgetSourcesApi.js` (separate module), mock it with a SECOND `jest.unstable_mockModule()` call. Include all 5 exports (not just `fetchBudgetSources`) to avoid import errors.
- **Level-0 row label changes**: Component now uses lowercase: `"Available funds"`, `"Work items"`, `"Household items"` (not `"Available Funds"`, `"Work Item Budget"`, `"Household Item Budget"`). Column headers: `"Cost"` (not `"Budget"`), `"Net"` (not `"Remaining"`). Always re-read the component source before writing assertions.
- **Available Funds expand button aria-label**: `"Expand available funds sources"` — query with `/expand available funds/i`.
- **Tsc validates test files without running them**: `node_modules/.bin/tsc --noEmit --project client/tsconfig.json 2>&1 | grep "TestFile"` — useful when Jest crashes (SIGILL/TypeScript version mismatch in sandbox).
- **TypeScript version mismatch**: Main repo node_modules has TypeScript incompatible with Node.js v24 in this sandbox (SyntaxError on load). Tests cannot be run locally; commit and rely on CI.

## Bug #484 Milestone CPM Tests (fix/484-milestone-critical-path, 2026-03-06)

### CPM float math for milestone non-critical scenario

A milestone has positive float (NOT critical) ONLY when there is a longer sibling path
**downstream** of it that converges to the same shared terminal node. Correct test pattern:

```
wi-a (1d) → milestone:1 (0d) → wi-c (2d)   [path total: 3d]
wi-a (1d) → wi-b (10d) → wi-c (2d)          [path total: 13d — longer path]
```

Both paths converge on `wi-c`. Backward pass: `wi-c` LS = day11 (from wi-b path).
`milestone:1` LF = LS of `wi-c` = day11. float = day11 - day1 = 10 days → NOT critical.

**Anti-pattern**: Two independent terminal nodes (no shared successor) each have 0 float
independently — so the milestone IS critical even with a longer sibling path that doesn't
share the same terminal. Always ensure paths converge to a shared terminal node.

### New test files added

- `server/src/services/schedulingEngine.milestoneCpm.test.ts` — 15 tests (pure `schedule()` + `autoReschedule` DB writes)
- `server/src/services/timelineService.test.ts` — 9 new tests in existing file (isCritical propagation, criticalPath filtering)
- `client/src/components/GanttChart/GanttMilestones.test.tsx` — 20 new tests in existing file (strokeWidth, ghost diamond, aria-label)

### Critical milestone aria-label pattern

`GanttMilestones.tsx` builds: `Milestone: ${title}, ${statusLabel}${isCritical ? ', critical path' : ''}, target date ${date}`
Test: `expect(label.toLowerCase()).toContain('critical path')` for critical; `.not.toContain` for non-critical.

### Ghost diamond never inherits critical strokeWidth

Ghost polygon always has `strokeWidth={1.5}` and `strokeDasharray` regardless of `isCritical`.
The active diamond (last polygon in group for late milestones) gets `strokeWidth={3}` when critical.

## Story 4.7 Work Item Linking Tests (2026-03-03)

**57 comprehensive tests committed: 15 service + 20 route integration + 22 API client**

Key learnings:

- **HouseholdItemStatus enum**: valid values are `'not_ordered' | 'ordered' | 'in_transit' | 'delivered'`
  (NOT `'not_started'` which is only for WorkItems). Always use correct status in tests.
- **Household items schema fields**: `vendorId`, `url`, `room`, `quantity`, `orderDate`, `expectedDeliveryDate`, `actualDeliveryDate`
  (NOT `vendor: null` or `cost: null`). Full insert example in service test.
- **Drizzle ORM WHERE clauses**: must use `eq(schema.table.column, value)` (NOT column comparison)
  and `and()` operator for multiple conditions. Never use lambda comparison `(t) => t.col === val`.
- **Valid HouseholdItemCategory values**: `'furniture' | 'appliances' | 'fixtures' | 'decor' | 'electronics' | 'outdoor' | 'storage' | 'other'`
  (NOT `'flooring'`). Reference tests check all 8 values.
- **API client test patterns**: 4 functions (fetch linked, link, unlink both directions) use standard mock fetch pattern
  with `jest.fn<typeof globalThis.fetch>()` and error assertions for all non-OK statuses.
- **Route test patterns**: household item and work item route tests follow established pattern
  (buildApp + temp-file SQLite + createUserWithSession + createTestWorkItem/HouseholdItem helpers).
- **Test count**: 57 tests total, categorized as: 8 auth, 21 success path (201/204/200), 1 validation (400),
  15 not found (404), 2 conflict (409), 5 error handling (500), 5 data shape validation.
