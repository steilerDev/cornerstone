# Backend Developer Memory

Always-needed rules inline below; everything else lives in the topic files indexed at the bottom.

## CRITICAL: QA Owns ALL Tests

**The backend-developer MUST NEVER write test files.** This rule has no exceptions.

- `qa-integration-tester` owns unit tests, integration tests, and service tests; `e2e-test-engineer` owns Playwright E2E tests
- Developer agents implement production code only — never `*.test.ts` files
- Violating this rule causes BLOCKING PR rejection (as happened in PR #152)
- If you find yourself writing a test file, stop and delegate to the QA agent instead

## Quick Reference: Key Files

- Server entry: `server/src/app.ts` (registers all routes/plugins)
- DB schema: `server/src/db/schema.ts` (Drizzle ORM)
- Migrations: `server/src/db/migrations/` (hand-written SQL, numeric prefix)
- Services: `server/src/services/` (business logic, one file per domain)
- Routes: `server/src/routes/` (Fastify handlers, one file per resource)
- Shared types: `shared/src/types/` + exported from `shared/src/index.ts`
- Errors: `server/src/errors/AppError.ts`

## Established CRUD Service Pattern

Reference `server/src/services/tagService.ts` and `server/src/services/budgetCategoryService.ts`.

- Export pure functions: `listX()`, `getXById()`, `createX()`, `updateX()`, `deleteX()`
- Accept `DbType = BetterSQLite3Database<typeof schemaTypes>` as first arg
- Use `toXResponse()` mapper from DB row → API shape
- Case-insensitive uniqueness: `sql\`LOWER(${table.name}) = LOWER(${value})\``
- Check with `AND ${table.id} != ${id}` when updating (exclude self)
- Throw `NotFoundError`, `ValidationError`, `ConflictError`, `CategoryInUseError` from AppError.ts

## Established Route Pattern

Reference `server/src/routes/tags.ts` and `server/src/routes/budgetCategories.ts`.

- Export default `async function xRoutes(fastify: FastifyInstance)`
- Always check `if (!request.user) throw new UnauthorizedError()`
- JSON schema for body validation, `minProperties: 1` for PATCH
- `{ type: ['string', 'null'], pattern: '...' }` for nullable validated strings
- Status codes: 201 create, 200 read/update, 204 delete

## Error Codes

- `NOT_FOUND` (404), `VALIDATION_ERROR` (400), `UNAUTHORIZED` (401), `FORBIDDEN` (403)
- `CONFLICT` (409), `CATEGORY_IN_USE` (409) — full list in `shared/src/types/errors.ts`
- Fastify schema validation auto-returns 400 with `VALIDATION_ERROR` + `fields` array

## Drizzle ORM Key Patterns

- `real()` for monetary/decimal fields (not `integer`)
- `integer('col', { mode: 'boolean' })` for boolean columns
- `primaryKey({ columns: [a, b] })` for junction table composite PKs
- `asc()`, `desc()` for ordering; `sql\`LOWER(...)\`` for case-insensitive sorts
- Import: `sqliteTable, text, integer, real, index, uniqueIndex, primaryKey` from `drizzle-orm/sqlite-core`
- Forward references (`references(() => table.id)`) work fine even when the referenced table is defined later in same file

## App Registration Order (app.ts)

1. configPlugin → 2. errorHandlerPlugin → 3. fastifyCompress → 4. fastifyCookie → 5. dbPlugin → 6. authPlugin → 7. route plugins

## Quality Gates (must all pass before committing)

```bash
npm run lint && npm run format:check && npm run typecheck && npm run build && npm test
```

The `npm audit` vulnerabilities are pre-existing (in dev/tooling deps — eslint, jest, testcontainers). Not introduced by backend code.

## Sandbox Limitations

- Multiple test suites OOM-killed by SIGKILL — known sandbox issue, unrelated to code (which suites vary per run due to memory pressure)
- All test assertions pass when suites do complete; SIGKILL is pure memory pressure

## Shared Type Changes Break Client Tests

When you add required fields to a shared interface (e.g., `WorkItemDetail`, `DependencyResponse.leadLagDays`), all client-side test fixture objects typed as that interface fail typecheck. Flag for QA:

- `client/src/lib/workItemsApi.test.ts` — fixtures in getWorkItem, createWorkItem, updateWorkItem tests
- `client/src/pages/WorkItemDetailPage/WorkItemDetailPage.test.tsx` — mockWorkItem fixture
- `client/src/pages/WorkItemCreatePage/WorkItemCreatePage.test.tsx` — mockResolvedValue object

## Worktree Typecheck Limitation

Worktrees have no `node_modules/`. TypeScript resolves `@cornerstone/shared` from the main repo's `node_modules/`, which points to the main repo's older `shared/`. Typecheck errors for types that exist in the worktree's `shared/` but not main repo's `shared/` are **false positives**. CI is authoritative — it runs `npm ci` which correctly resolves the worktree's shared package.

## Formatting Gotcha

CI runs `prettier --check` before typecheck. Always run Prettier from within the worktree directory to use the correct `.prettierrc`:

```bash
cd /path/to/worktree && npx prettier --write "path/to/file.ts"
```

Running from the parent project root uses a different config and may not format correctly.

## Pre-commit Hook Architecture

- `.husky/pre-commit`: runs `npm run typecheck` (typecheck only — lint, format, and audit are handled by CI auto-fix workflow)
- Lint, format, and `npm audit fix` run automatically on `beta` via `.github/workflows/auto-fix.yml`

## Index — topic files (same directory)

- `service-patterns.md` — open when writing a service beyond basic CRUD: junction-table M:N patterns (add/remove vs replace-all), read-only aggregation with raw SQL
- `epic-05-budget.md` — open for budget/invoice domain work: migration 0003 tables, standalone cross-vendor invoice API (`listAllInvoices` inline-map trap), InvoiceSummary type disambiguation
- `scheduling-milestones.md` — open for timeline/scheduling/milestone work: CPM math (ADR-014), autoReschedule triggers, milestone CPM nodes (Bug #484), actual dates (Issue #296), integer-PK pattern
- `sandbox-git.md` — open when git add/commit/push fails in a sandbox worktree: sharedRepository object-write workarounds, ALTDIR commit workflow
- `story_1030.md` — areas & trades rework story notes (migration 0028)
- `completed-work.md` — historical log of completed stories/PRs
