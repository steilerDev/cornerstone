# Backend Developer Memory

## CRITICAL: QA Owns ALL Tests

**The backend-developer MUST NEVER write test files.** This rule has no exceptions.

- `qa-integration-tester` owns unit tests, integration tests, and service tests; `e2e-test-engineer` owns Playwright E2E tests
- Developer agents implement production code only — never `*.test.ts` files
- Violating this rule causes BLOCKING PR rejection (as happened in PR #152)
- If you find yourself writing a test file, stop and delegate to the QA agent instead

## Quick Reference: Key Files

- Server entry: `server/src/app.ts` (registers all routes/plugins)
- DB schema: `server/src/db/schema.ts` (Drizzle ORM)
- Migrations: `server/src/db/migrations/` (hand-written SQL, `0001`=auth, `0002`=work-items, `0003`=budget, `0004`=work-item-budget-fields)
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

- Multiple test suites OOM-killed by SIGKILL — known sandbox issue, unrelated to code
  (which suites vary per run due to memory pressure; may include workItems, auth, users, budgetSources, budgetCategories, invoices, subsidyPrograms, dependencies)
- All test assertions pass when suites do complete; SIGKILL is pure memory pressure

## Completed Work

- EPIC-02 stories: DB plugin, config mgmt, error handling, client routing/API (PRs #39-#52)
- EPIC-03 stories: work items CRUD, tags, notes, subtasks, dependencies (PRs merged to beta)
- Story #142 (EPIC-05 foundation): budget categories CRUD — PR #150
- Story #144 (EPIC-05): invoice management for vendors — PR #152
- Story #145 (EPIC-05): budget sources CRUD — branch feat/145-budget-sources
- Story #146 (EPIC-05): subsidy program management — branch feat/146-subsidy-programs
- Story #147 (EPIC-05): work item budget props + vendor/subsidy linking — branch feat/147-work-item-budget-props
- Story #148 (EPIC-05): budget overview dashboard aggregation — branch feat/148-budget-overview-dashboard
- Story #393 (EPIC-04 Story 4.7): work item ↔ household item linking — PR #402

## Shared Type Changes Break Client Tests

When you add required fields to a shared interface (e.g., `WorkItemDetail`), all client-side test fixture objects typed as that interface fail typecheck. Update:

- `client/src/lib/workItemsApi.test.ts` — fixtures in getWorkItem, createWorkItem, updateWorkItem tests
- `client/src/pages/WorkItemDetailPage/WorkItemDetailPage.test.tsx` — mockWorkItem fixture
- `client/src/pages/WorkItemCreatePage/WorkItemCreatePage.test.tsx` — mockResolvedValue object

## Junction Table Pattern (M:N with individual add/remove semantics)

Reference `server/src/services/workItemVendorService.ts` for work item ↔ vendor links:

- `listXLinks(db, id)` — join through junction table, map to full entity shape
- `linkXToY(db, xId, yId)` — validate both exist, check for existing link (409 if found), insert
- `unlinkXFromY(db, xId, yId)` — validate parent exists, check link exists (404 if not), delete
- Return `Vendor` or `SubsidyProgram` (full entity) from link/unlink operations

## Junction Table Pattern (M:N with replace-all semantics)

Reference `server/src/services/subsidyProgramService.ts` for linking programs to categories:

- `loadApplicableCategories(db, id)` — select junction rows, then `inArray` on category IDs
- `replaceCategoryLinks(db, id, categoryIds)` — delete existing rows, insert new rows
- `validateCategoryIds(db, categoryIds)` — `inArray` select + diff found vs requested for missing IDs
- On update: check `data.categoryIds !== undefined` (not `length > 0`) to distinguish "replace with empty" from "no change"
- Always bump `updatedAt` even if only junction table changed (no scalar fields updated)

## Aggregation Service Pattern (read-only, no CRUD)

Reference `server/src/services/budgetOverviewService.ts` for read-only aggregation:

- Use `db.get<ResultType>(sql`...`)` for single-row aggregations (totals, counts)
- Use `db.all<ResultType>(sql`...`)` for multi-row aggregations (GROUP BY results)
- Raw SQL via `sql` tagged template from `drizzle-orm` — better than Drizzle query builder for complex GROUP BY/CASE
- `COALESCE(SUM(...), 0)` to avoid null results when no rows exist
- `CASE WHEN ... THEN ... ELSE 0 END` inside SUM for conditional aggregation
- No need for `select().from()` chaining when raw SQL is cleaner

## Standalone Invoice API Pattern (cross-vendor)

Added in standalone invoice feature (branch `feat/standalone-invoice-api`):

- `Invoice.vendorName: string` is now a required field — `toInvoice()` resolves it from vendors table
- `Invoice.workItemBudget: WorkItemBudgetSummary | null` — enriched budget line details (added by PR #202)
- `listAllInvoices(db, query)` in `invoiceService.ts`:
  - Paginated cross-vendor listing using `innerJoin(vendors, eq(invoices.vendorId, vendors.id))`
  - Global status summary (unfiltered) via separate `GROUP BY invoices.status` query
  - Supports filtering: `status`, `vendorId`, `q` (LIKE on invoiceNumber with escaping)
  - Supports sorting by: `date` (default), `amount`, `status`, `vendor_name`, `due_date`
  - Returns `{ invoices, pagination: PaginationMeta, summary: InvoiceStatusBreakdown }`
  - **CRITICAL**: `listAllInvoices()` has an inline `.map()` (not using `toInvoice()`) — any new `Invoice` fields must be added to BOTH `toInvoice()` AND the inline map
- `getInvoiceById(db, id)` — cross-vendor single lookup, throws `NotFoundError` if missing
- Route file: `server/src/routes/standaloneInvoices.ts` — registered at `/api/invoices`
- New shared types exported: `InvoiceStatusSummary`, `InvoiceStatusBreakdown`, `InvoiceListPaginatedResponse`, `InvoiceDetailResponse`, `WorkItemBudgetSummary`

## Worktree Typecheck Limitation

Worktrees have no `node_modules/`. TypeScript resolves `@cornerstone/shared` from the main repo's `node_modules/`, which points to the main repo's older `shared/`. Typecheck errors for types that exist in the worktree's `shared/` but not main repo's `shared/` are **false positives**. CI is authoritative — it runs `npm ci` which correctly resolves the worktree's shared package.

## InvoiceSummary Type Disambiguation

Two different "InvoiceSummary" concepts:

- `InvoiceSummary` from `workItemBudget.ts` (re-exported in `index.ts`) — per-invoice row embedded in `WorkItemBudgetLine.invoices[]`
- `InvoiceStatusBreakdown` from `invoice.ts` — status-grouped count/total aggregates (was previously named `InvoiceSummary` before rename in feat branch)

## Integer PK Pattern (milestones, EPIC-06)

- Use `integer('id').primaryKey({ autoIncrement: true })` in Drizzle
- Route param schema: `{ type: 'integer' }` (Fastify coerces string to number)
- Typed in route handlers as `{ id: number }` generics
- `created_by TEXT REFERENCES users(id) ON DELETE SET NULL` must be nullable — contradicts wiki which said NOT NULL. ON DELETE SET NULL requires nullable. Fix: omit .notNull() in Drizzle, remove NOT NULL from SQL.

## EPIC-06 Story 6.1 Files (Milestones Backend)

Migration `0006_milestones.sql` creates: `milestones`, `milestone_work_items`, adds `lead_lag_days` to `work_item_dependencies`.

Key files added/modified:

- `shared/src/types/milestone.ts` — new (MilestoneSummary, MilestoneDetail, CreateMilestoneRequest, UpdateMilestoneRequest, MilestoneListResponse, LinkWorkItemRequest, MilestoneWorkItemLinkResponse)
- `shared/src/types/dependency.ts` — added `leadLagDays` to Dependency, CreateDependencyRequest, DependencyCreatedResponse; added UpdateDependencyRequest
- `shared/src/types/workItem.ts` — added `leadLagDays` to DependencyResponse
- `server/src/services/milestoneService.ts` — new (getAllMilestones, getMilestoneById, createMilestone, updateMilestone, deleteMilestone, linkWorkItem, unlinkWorkItem)
- `server/src/routes/milestones.ts` — new, registered at `/api/milestones`
- `server/src/services/dependencyService.ts` — updated createDependency (leadLagDays), getDependencies (leadLagDays in response), new updateDependency()
- `server/src/routes/dependencies.ts` — leadLagDays in POST schema, new PATCH endpoint

## Shared Type Changes Break Client Tests

When you add required fields to a shared interface (e.g., `DependencyResponse.leadLagDays`), all client-side test fixture objects typed as that interface fail typecheck. Update:

- `client/src/lib/workItemsApi.test.ts` — fixtures
- `client/src/pages/WorkItemDetailPage/WorkItemDetailPage.test.tsx` — mockWorkItem fixture
- `client/src/pages/WorkItemCreatePage/WorkItemCreatePage.test.tsx` — mockResolvedValue object

## EPIC-06 Story 6.2 Files (Scheduling Engine)

No DB migration needed (uses existing `work_items` and `work_item_dependencies` tables).

Key files added/modified:

- `shared/src/types/schedule.ts` — new (ScheduleRequest, ScheduleResponse, ScheduledItem, ScheduleWarningType, ScheduleWarning)
- `shared/src/index.ts` — added schedule type exports
- `server/src/services/schedulingEngine.ts` — pure CPM algorithm (Kahn's topo sort, forward/backward pass, float, critical path)
- `server/src/routes/schedule.ts` — POST /api/schedule, registered at `/api/schedule`
- `server/src/errors/AppError.ts` — added CircularDependencyError (409)

CPM Dependency Math (ADR-014):
| Type | Forward ES | Backward LF |
|------|-----------|-------------|
| FS | PredEF + LL | SucLS - LL |
| SS | PredES + LL | (SucLS - LL) + predDur |
| FF | (PredEF + LL) - succDur | SucLF - LL |
| SF | (PredES + LL) - succDur | (SucLF - LL) + predDur |

Engine is a pure function with injectable `today` parameter for testability.
Cascade mode uses BFS from anchor to collect all downstream successors.

## Formatting Gotcha

CI runs `prettier --check` before typecheck. Always run Prettier from within the worktree directory to use the correct `.prettierrc`:

```bash
cd /path/to/worktree && npx prettier --write "path/to/file.ts"
```

Running from the parent project root uses a different config and may not format correctly.

## EPIC-06 UAT Fixes (2a, 2b, 3a) — applied to worktree jazzy-percolating-bird

- `shared/src/types/timeline.ts`: Added `projectedDate: string | null` to `TimelineMilestone`
- `shared/src/types/milestone.ts`: Added `workItemIds?: string[]` to `CreateMilestoneRequest`
- `server/src/routes/milestones.ts`: Added `workItemIds` array of UUID strings to create schema
- `server/src/services/milestoneService.ts`: After insert, loop `data.workItemIds` and insert junction rows (silently skip non-existent IDs)
- `server/src/services/timelineService.ts`: Build `workItemEndDateMap` from `allWorkItems`; for each milestone compute `projectedDate` = max endDate of linked work item IDs (null if none have dates)

## EPIC-06 UAT Fix 4 — Required Milestone Dependencies

Migration `0007_milestone_dependencies.sql`: creates `work_item_milestone_deps(work_item_id, milestone_id)`.

New shared types (UAT Fix 4):

- `MilestoneSummaryForWorkItem { id, name, targetDate }` in `workItem.ts` — note `name` (not `title`)
- `WorkItemMilestones { required, linked }` in `workItem.ts`
- `WorkItemDependentSummary { id, title }` in `milestone.ts`
- `MilestoneDetail.dependentWorkItems: WorkItemDependentSummary[]` — required field
- `TimelineWorkItem.requiredMilestoneIds?: number[]` — optional field

Key files:

- `server/src/services/workItemMilestoneService.ts` — new service
- `server/src/routes/workItemMilestones.ts` — new routes at `/api/work-items/:workItemId/milestones`
- Endpoints: GET /, POST/DELETE /required/:milestoneId, POST/DELETE /linked/:milestoneId

When `MilestoneDetail` got `dependentWorkItems` as a required field, two client test files needed updates:

- `client/src/components/milestones/MilestonePanel.test.tsx` (MILESTONE_DETAIL fixture)
- `client/src/lib/milestonesApi.test.ts` (MILESTONE_DETAIL fixture)

## EPIC-06 UAT Fix 1 — Auto-Reschedule on Constraint Changes

`autoReschedule(db: DbType): number` added to `schedulingEngine.ts`.

Scheduling engine now has DB imports at the top even though the `schedule()` pure function doesn't use them — only `autoReschedule()` does. The `DbType` alias is defined inside the file (after the pure function exports).

Milestone dependency expansion in `autoReschedule`:

- Fetch `work_item_milestone_deps` (WI depends on milestone M)
- Fetch `milestone_work_items` (WI contributes to milestone M)
- For each (WI, M) required dep, find all contributing WIs for M
- Create synthetic finish-to-start deps: contributor → dependent WI
- Merge with real deps before passing to `schedule()`

Triggers (call `autoReschedule(db)` after mutation):

- `workItemService.updateWorkItem()` — if any of: startDate, endDate, durationDays, startAfter, startBefore, status changed
- `dependencyService.createDependency()`, `updateDependency()`, `deleteDependency()`
- `workItemMilestoneService.addRequiredMilestone()`, `removeRequiredMilestone()`, `addLinkedMilestone()`, `removeLinkedMilestone()`

## Issue #296 — Actual Dates, Delay Tracking, Status Simplification

Migration `0008_actual_dates_and_status.sql`:

- `ALTER TABLE work_items ADD COLUMN actual_start_date TEXT`
- `ALTER TABLE work_items ADD COLUMN actual_end_date TEXT`
- `UPDATE work_items SET status = 'not_started' WHERE status = 'blocked'`

Status enum change: removed `'blocked'`; now `not_started | in_progress | completed`.
The SQLite CHECK constraint in old migrations still includes 'blocked' but migration 0008 cleans existing rows. The Drizzle schema and app-layer validation enforce the new enum.

Auto-population logic in `workItemService.updateWorkItem()`:

- Only triggers when `data.status !== workItem.status` (actual transition)
- `isExplicitActualStart/End` = `'actualStartDate' in data` (checks presence, not value)
- If explicit in request, no auto-population (even if null being set explicitly)
- If NOT explicit and current actual date is null: set to `today`

Scheduling engine changes (in `schedule()` forward pass):

- `SchedulingWorkItem` now has `actualStartDate: string | null` and `actualEndDate: string | null`
- If `item.actualStartDate` is set → use as ES, skip CPM computation (continue statement)
- If `item.actualEndDate` is set alongside actualStartDate → use as EF
- "Today floor" for not_started: `if (item.status === 'not_started') es = maxDate(es, today)`
- All callers (autoReschedule, schedule route, timelineService) must pass these fields through

`autoReschedule` trigger list now includes `actualStartDate` and `actualEndDate` field changes.

## Detailed Notes (topic files)

- `epic-05-budget.md` — EPIC-05 budget tables, migration 0003, CATEGORY_IN_USE error pattern

## Sandbox Git Worktree Limitations (CRITICAL)

The sandbox has strict limitations for git operations in worktrees:

1. **`core.sharedRepository=group`** in `.git/config` prevents writing new objects to `.git/objects` — git requires group-write on object dirs owned by uid 502/dialout. Some object subdirs are owned by uid 502 (not `agent`), making writes impossible.

2. **Write tools (Edit, Write) do NOT work reliably in worktrees** — use Bash with `python3 -c "..."` or heredoc `cat > file << 'EOF'` for file modifications.

3. **Working git worktree commit workflow**:

   ```bash
   ALTDIR=/tmp/git-obj-$$; mkdir -p $ALTDIR
   printf "$ALTDIR\n" >> /path/to/.git/objects/info/alternates
   # Stage: GIT_OBJECT_DIRECTORY=$ALTDIR GIT_ALTERNATE_OBJECT_DIRECTORIES=/path/.git/objects git add <files>
   # Commit: GIT_OBJECT_DIRECTORY=$ALTDIR GIT_ALTERNATE_OBJECT_DIRECTORIES=/path/.git/objects git commit -m "..."
   # Verify: GIT_ALTERNATE_OBJECT_DIRECTORIES=$ALTDIR git log --oneline -3
   # If branch ref detaches, manually: echo "SHA" > .git/refs/heads/branch-name
   # Push: GIT_ALTERNATE_OBJECT_DIRECTORIES=$ALTDIR git push "https://USER:TOKEN@github.com/..." branch:branch
   ```

4. **git reset/branch rename** also requires reflog directories to exist. Create them with `mkdir -p .git/logs/refs/heads/DIRNAME`.

5. **`git -C worktree-path` works for status/log but NOT for git add** (due to sharedRepository).

6. **`git branch -m`** via `GIT_DIR=.git/worktrees/atomic-...` fails — the worktree metadata dir is NOT a full git dir. Use `GIT_DIR=.git` or direct ref file manipulation.

7. **ALTDIR objects are transient** — push immediately after commit. The `$ALTDIR` path is session-specific.

## Pre-commit Hook Architecture

- `.husky/pre-commit`: runs `npm run typecheck` (typecheck only — lint, format, and audit are handled by CI auto-fix workflow)
- Lint, format, and `npm audit fix` run automatically on `beta` via `.github/workflows/auto-fix.yml`

## Bug #484 Fix — Milestones on Critical Path

**Issue**: Milestones never appeared on the critical path, even when they sat on the longest path through the project.

**Root cause**: Milestone dependency expansion in `autoReschedule()` created synthetic WI→WI dependencies but did NOT add milestones as CPM nodes. The CPM graph never saw the milestones, so they couldn't be marked as critical.

**Solution**: Model milestones as zero-duration CPM nodes with ID prefix `milestone:<id>`. The scheduler naturally includes them in critical path calculations.

**Changes** (PR #487):

- `shared/src/types/timeline.ts`: Add `isCritical?: boolean` to `TimelineMilestone`
- `server/src/services/schedulingEngine.ts`:
  - Replace synthetic WI→WI expansion with milestone CPM nodes
  - Create one node per milestone with contributors or dependents (ID = `milestone:<id>`, zero duration)
  - Create FS deps: contributor→milestone and milestone→dependent
  - Skip writing milestone nodes back to DB (section 7: filter IDs starting with `milestone:`)
- `server/src/services/timelineService.ts`:
  - Add milestone CPM nodes to `getTimeline()` schedule call
  - Extract critical milestone IDs from CPM result
  - Filter `milestone:` entries from returned `criticalPath` array (API only returns WI IDs)
  - Propagate `isCritical` field to each milestone in response

Key insight: The CPM engine already handles zero-duration nodes correctly. By giving milestones their own nodes (instead of expanding them away), the critical path calculation naturally identifies them.
