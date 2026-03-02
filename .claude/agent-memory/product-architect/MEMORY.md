# Product Architect Memory

## Tech Stack (Accepted)

- Server: Fastify 5.x (ADR-001)
- Client: React 19 + React Router 7 (ADR-002)
- DB: SQLite via better-sqlite3 + Drizzle ORM (ADR-003)
- Bundler: Webpack 5.x (ADR-004)
- Tests: Jest 30.x + Playwright (ADR-005)
- Styling: CSS Modules (ADR-006)
- Structure: npm workspaces monorepo (ADR-007)
- TypeScript ~5.9
- Node.js 24 LTS

## Project Layout

- `shared/` (@cornerstone/shared) - types, must build first, composite:true in tsconfig
- `server/` (@cornerstone/server) - Fastify app, Drizzle schema
- `client/` (@cornerstone/client) - React SPA, Webpack, CSS Modules
- Build order: shared -> client -> server

## Key Patterns

- All API endpoints under `/api/` prefix
- Standard error shape: `{ error: { code, message, details? } }`
- Server serves SPA static files in production (from client/dist)
- Webpack dev server proxies /api/\* to Fastify in development
- Graceful shutdown handlers in server.ts (SIGTERM/SIGINT)
- Database at configurable path via DATABASE_URL env var

## Fastify Plugin Pattern

- All plugins use `fastify-plugin` (fp) to break encapsulation for global visibility
- Type augmentation: `declare module 'fastify'` adds properties to `FastifyInstance`
- Registration order: config -> errorHandler -> compress -> cookie -> db -> auth -> routes -> static
- Config plugin: `fastify.config: AppConfig` (sessionDuration, secureCookies included)
- DB plugin: `fastify.db` (Drizzle + better-sqlite3), WAL mode, migrations on startup
- Error handler: AppError subclasses, AJV validation mapping, production sanitization
- Auth plugin: preValidation hook, public route exemption Set, hourly session cleanup

## EPIC-01 Auth Architecture (ADR-010)

### Schema

- `users` table: TEXT PK (UUID), email (UNIQUE), display_name, role, auth_provider, password_hash, oidc_subject, deactivated_at, created_at, updated_at
- `sessions` table: TEXT PK (256-bit random hex), user_id FK, expires_at, created_at
- Migration: `0001_create_users_and_sessions.sql`

### Auth Decisions

- Server-side sessions in SQLite + HttpOnly cookie (`cornerstone_session`)
- Session token: crypto.randomBytes(32).toString('hex') (256-bit)
- Password hashing: scrypt (N=16384,r=8,p=1,keylen=64) via node:crypto -- PHC format storage
- OIDC: openid-client v6 (pure JS, OpenID Certified)
- Route protection: global preValidation hook + requireRole('admin') decorator
- Cookie: HttpOnly, SameSite=Strict, Secure (configurable), Path=/
- Session cleanup: hourly interval, not per-request
- Timing attack prevention: dummy scrypt verify on non-existent user login

### Initial Setup Flow (documented in Architecture wiki)

- First launch: GET /api/auth/me returns `setupRequired: true` when no users exist
- Client redirects to /setup automatically (AuthGuard)
- POST /api/auth/setup creates initial admin account (only works when DB is empty)
- After setup: returns 403 SETUP_COMPLETE; client redirects to /login
- Setup page only accessible when setupRequired is true

### Plugin Registration Order

- config -> errorHandler -> compress -> cookie -> db -> auth -> routes -> static

### EPIC-01 Complete (promoted to main via PR #82)

- All 8 stories + refinement merged. 614 unit/integration + 402 E2E tests.
- COOKIE_NAME in `server/src/constants.ts`, isSafeRedirect() for open redirect, TRUST_PROXY env var
- Future: OIDC discovery cache no TTL, /api/health/ready scrypt overhead

## EPIC-03 Work Items Architecture (ADR-012)

### Story 3.1 Complete (PR #97) — Schema Foundation

- Migration 0002 created and runs successfully
- All 6 Drizzle ORM table definitions match migration SQL exactly
- Shared types fully defined: WorkItem, WorkItemSummary, WorkItemDetail, Tag, Subtask, Note, Dependency, pagination wrapper
- 30 integration tests pass, covering migration structure, FK cascades, CHECK constraints, index verification
- **Critical fix**: `created_by` is nullable (NOT NULL was contradictory with ON DELETE SET NULL)
- Error codes added: CIRCULAR_DEPENDENCY, DUPLICATE_DEPENDENCY

### Schema (migration 0002)

- 6 tables: work_items, tags, work_item_tags, work_item_notes, work_item_subtasks, work_item_dependencies
- No `priority` column -- tags used instead (per requirements)
- 3 statuses: not_started, in_progress, completed (blocked removed in Issue #296 / migration 0008)
- Dependencies: composite PK (predecessor_id, successor_id), 4 types (FS/SS/FF/SF)
- Junction tables use composite PKs (no surrogate id)
- `created_by` on work_items: FK to users ON DELETE SET NULL (nullable)
- `assigned_user_id` on work_items: FK to users ON DELETE SET NULL
- Indexes: status, assigned_user_id, created_at on work_items; work_item_id on notes/subtasks; tag_id on tags; successor_id on dependencies

### API Contract (19 endpoints)

- Work Items: GET list, POST create, GET detail, PATCH update, DELETE
- Tags: GET list, POST create, PATCH update, DELETE
- Notes: GET list, POST create, PATCH update, DELETE (author/admin check)
- Subtasks: GET list, POST create, PATCH update, DELETE, PATCH reorder
- Dependencies: GET, POST (with cycle detection), DELETE by predecessorId
- New error codes: CIRCULAR_DEPENDENCY, DUPLICATE_DEPENDENCY

### Pagination Convention (ADR-012)

- Offset-based: page (1-indexed, default 1), pageSize (default 25, max 100)
- Response: { items: [...], pagination: { page, pageSize, totalItems, totalPages } }
- Tags and users NOT paginated (small collections)

### Design Decisions

- Notes NOT embedded in work item detail response (fetched separately)
- Tags, subtasks, dependencies ARE embedded in detail response
- PATCH /work-items/:id with tagIds replaces entire tag set (set-semantics)
- Subtask reorder accepts ALL subtask IDs (no partial reorder)
- Dependency delete uses /:id/dependencies/:predecessorId path

### Story 3.2 Complete (PR #98) — Work Items CRUD API

- 5 endpoints, service layer pattern, 96 tests (740 total)
- Pagination, filtering (status/assignedUserId/tagId/q), sorting (6 fields)
- Tags: set-semantics on update. Response shapes match Wiki spec.

## GitHub Wiki

- Wiki repo: `GIT_SSL_NO_VERIFY=1 git clone https://github.com/steilerDev/cornerstone.wiki.git /tmp/cornerstone-wiki`
- REST API 404s for wiki -- must use git clone/push workflow
- ADR-001 through ADR-014, Architecture, Schema, API-Contract, Home, ADR-Index

### Wiki Update Discipline (CRITICAL — recurring gap)

The wiki **MUST be updated as part of story implementation**, not caught at review time. This lag has caused deviations in EVERY epic so far.

**When to update wiki:**

- Any new API endpoint → update `wiki/API-Contract.md`
- Any new/changed DB column, table, or constraint → update `wiki/Schema.md`
- Any new shared type that's part of the API → update `wiki/API-Contract.md`
- Any architectural decision → create or update `wiki/ADR-NNN-*.md` + `wiki/ADR-Index.md`

**How to update:**

```bash
git -C wiki checkout master && git -C wiki pull --rebase origin master
# edit wiki/*.md
git -C wiki add -A && git -C wiki commit -m "docs: ..."
git -C wiki push origin master
git add wiki   # update submodule ref in parent repo
```

**Always push wiki before creating the PR.** The submodule ref must be committed in the feature branch so reviewers see up-to-date docs.

### N+1 Queries (Accepted at Current Scale)

| Service            | Query                                            | N+1 Where           | Acceptable Until |
| ------------------ | ------------------------------------------------ | ------------------- | ---------------- |
| `getAllMilestones` | Per-row: countLinkedWorkItems + getCreatedByUser | milestoneService.ts | >50 milestones   |
| `listAllInvoices`  | Per-row vendor join (now uses JOIN, not N+1)     | invoiceService.ts   | —                |

If milestone count grows beyond 50 in production use, create a EPIC-10 story to rewrite `getAllMilestones` with a single JOIN query.

## Sandbox Limitations (not real project issues)

- esbuild native binaries SIGILL on emulated aarch64 sandbox
- Docker build fails due to TLS firewall blocking Alpine repos
- 4GB RAM limit causes Jest OOM -- mitigated with --maxWorkers=2, --max-old-space-size=2048, --workerIdleMemoryLimit=300MB in root package.json test scripts. Documented in Architecture wiki "Development Environment Constraints" section. Reversal plan documented there too.
- These all work fine on real hardware / CI

## Naming Conventions

- DB columns: snake_case
- TS vars/functions: camelCase
- TS types: PascalCase
- Files (modules): camelCase.ts
- Files (React): PascalCase.tsx
- API routes: kebab-case (/api/work-items)
- Env vars: UPPER_SNAKE_CASE

## Config Files

- Root: package.json, tsconfig.base.json, eslint.config.js, .prettierrc, jest.config.ts
- Server: schema in src/db/schema.ts, migrations in src/db/migrations/
- Client: webpack.config.cjs (proxies /api to localhost:3000)

## CI/CD (ADR-008)

- GitHub Actions + semantic-release + GitHub Flow + Docker Hub + Docker Scout + Dependabot
- Beta pre-releases from `beta` branch, stable from `main`
- Feature PR -> beta: squash merge; beta -> main: merge commit

## PR Review Notes

- Cannot `gh pr review --approve` own PRs -- use `--comment` instead
- Root `typecheck` script builds shared first
- ADR-004/005/006 updated to current tech (PR #95 + wiki push)

## Pending Housekeeping

- Update Architecture wiki "Static Asset Serving" section

## E2E Test Architecture (ADR-011)

- Testcontainers for programmatic container management (not Docker Compose)
- 3 managed services: Cornerstone app, mock OIDC server, upstream nginx proxy
- Playwright 5 viewport projects: desktop-lg(1920x1080), desktop-md(1440x900), tablet(iPad), mobile-iphone, mobile-android
- `e2e/` workspace at project root (@cornerstone/e2e), separate from unit tests
- Test files: `*.spec.ts` (distinct from Jest's `.test.ts`)
- API-based seeding (through running app) + SQL fixture only for initial admin setup
- CI: separate job after quality-gates+docker, uploads traces+screenshots+HTML report
- Page Object Model pattern, organized by feature in e2e/tests/
- Chromium only (cross-browser as future opt-in)
- globalSetup/globalTeardown for container lifecycle

## EPIC-05 Budget Management

- Migration 0003: 8 tables (budget_categories, vendors, invoices, budget_sources, subsidy_programs, 3 junctions)
- Migration 0004: flat budget fields on work_items (SUPERSEDED by 0005)
- Migration 0005 (Story 5.9): Budget system rework -- see `epic05-budget.md`
- API: 5 budget-categories, 5 vendor, 4 invoice, 4 budget line, 5 budget source, 1 budget overview endpoints
- Error codes: CATEGORY_IN_USE, VENDOR_IN_USE, BUDGET_LINE_IN_USE, BUDGET_SOURCE_IN_USE, SUBSIDY_PROGRAM_IN_USE
- Wiki API-Contract: budget source CRUD + overview fully documented (Story 5.11)
- See `epic05-budget.md` for full details

## EPIC-05 Story 5.9 Budget System Rework

- `work_item_budgets` table replaces flat budget cols on work_items + work_item_vendors junction
- Confidence enum: own_estimate(20%), professional_estimate(10%), quote(5%), invoice(0%)
- Invoices gain `work_item_budget_id` FK (SET NULL), status changed: overdue -> claimed
- Budget lines embedded in WorkItemDetail response as `budgets: WorkItemBudgetLine[]`
- 4 endpoints: GET/POST/PATCH/DELETE at /api/work-items/:workItemId/budgets
- Vendor delete checks work_item_budgets.vendor_id (details: budgetLineCount)
- Category delete checks work_item_budgets.budget_category_id (details: budgetLineCount)
- Wiki Schema + API Contract updated and pushed
- **PR #187 review findings**: Missing CHECK(planned_amount >= 0) in migration; unlinkVendorFromWorkItem deletes all budget lines (not just placeholders)

## EPIC-05 Story 5.11 Budget Overview Rework

- BudgetOverview gains: projectedMin, projectedMax, remainingVsProjectedMin, remainingVsProjectedMax
- CategoryBudgetSummary gains: projectedMin, projectedMax (blended per-category)
- BudgetSource gains: claimedAmount, actualAvailableAmount (actual drawdown perspective)
- Existing fields (usedAmount, availableAmount) represent planned allocation perspective
- Blended projected model: invoiced budget lines use actual invoice total, non-invoiced use planned range
- All new fields are computed at API layer (no schema changes)
- Wiki API-Contract + Schema updated and pushed

## PR #203 Review (Standalone Invoices - Feb 2026)

- `vendorName` added to `Invoice` shared type -- wiki API Contract must be updated
- New endpoints: `GET /api/invoices` (paginated), `GET /api/invoices/:id` (cross-vendor)
- N+1 pattern: `toInvoice()` does per-row vendor query -- should accept optional vendorName param
- `listAllInvoices()` correctly uses JOIN but duplicates mapping instead of reusing `toInvoice()`
- `InvoiceDetailResponse` exported but not used in client API (uses inline type)
- formatCurrency/formatDate duplicated across 3+ pages -- extraction candidate
- CSS module duplication growing across page modules (buttons, modals, forms)

## EPIC-06 Timeline Architecture (ADR-013, ADR-014)

- ADR-013: Custom SVG Gantt chart (no third-party lib -- project policy bans native frontend deps)
- ADR-014: Server-side CPM scheduling engine, on-demand (user triggers, reviews, accepts)
- Migration 0006: milestones (INTEGER PK AUTOINCREMENT), milestone_work_items junction, lead_lag_days on work_item_dependencies
- Milestones: exception to UUID PK pattern (INTEGER AUTOINCREMENT for simpler joins, less sensitive entity)
- lead_lag_days: positive = lag (waiting), negative = lead (overlap), default 0
- POST /api/schedule?dryRun=true|false: dryRun defaults to false (persists dates). Updated Feb 2026 for Story 6.2.
- ScheduledItem includes all 4 CPM dates: scheduledStartDate (ES), scheduledEndDate (EF), latestStartDate (LS), latestFinishDate (LF)
- GET /api/timeline: aggregated view for Gantt (work items + deps + milestones + critical path)
- Timeline query params: from, to (date range filter), milestoneId (scope to milestone's items)
- milestoneId and from/to are mutually exclusive
- TimelineResponse includes dateRange: { earliest, latest } | null
- TimelineWorkItem includes startAfter/startBefore scheduling constraints
- TimelineMilestone includes completedAt (timestamp, not just boolean)
- Critical path always computed over full dataset regardless of filters
- Critical path computed on each timeline request (acceptable for <200 items)
- Dependencies have no surrogate ID -- composite key (predecessorId, successorId) is sufficient
- PATCH /api/work-items/:id/dependencies/:predecessorId: new endpoint for updating dependency type/lead_lag_days
- Household item delivery dates will be added to timeline in EPIC-04

## PR #247 Review (Story 6.1 Milestones Backend)

- Wiki Schema.md deviation: `milestones.created_by` documented as NOT NULL but implementation is nullable (correct for ON DELETE SET NULL). Flagged for wiki fix.
- N+1 query in `getAllMilestones` (countLinkedWorkItems + getCreatedByUser per row) -- acceptable for <50 milestones
- Cannot `gh pr review --request-changes` on own PRs -- must use `--comment` instead
- All 7 milestone endpoints + PATCH dependency update match API-Contract.md exactly
- Shared types (milestone.ts, dependency.ts updates) match contract interfaces

## PR #248 Review (Story 6.2 Scheduling Engine)

- Implementation matches ADR-014 exactly: pure function, Kahn's topological sort, forward/backward pass, all 4 dep types, lead/lag, float clamping
- Shared types in `shared/src/types/schedule.ts` match API Contract response shape
- `CircularDependencyError` reuses existing error code from shared types
- Engine (`server/src/services/schedulingEngine.ts`): 515 lines, pure function, injectable `today` param
- Route handler (`server/src/routes/schedule.ts`): thin 113-line adapter, maps DB data to engine types
- 865 unit tests + 825 integration tests
- **Deviation flagged**: API Contract notes say orphan items excluded; impl includes all items in full mode. Track for refinement wiki update.
- Topological sort uses `queue.sort()` for deterministic output -- O(n log n) per iteration, fine for <200 items

## EPIC-06 Story 6.4 Gantt Chart Frontend Architecture

- Component dir: `client/src/components/GanttChart/` (matches existing PascalCase convention)
- Sub-components: GanttChart (orchestrator), GanttGrid, GanttBar, GanttSidebar, GanttHeader, ganttUtils.ts
- HTML+SVG hybrid: sidebar is HTML (text quality/a11y), chart area is SVG
- Scroll sync: onScroll handler + ref assignment, NOT CSS sticky (unreliable with overflow-x)
- SVG: explicit width/height, no viewBox (1:1 pixel mapping for bars/grid)
- No virtualization needed (<500 items)
- Performance: useMemo for date calculations, React.memo for bars, rAF for scroll sync
- Bar colors: use `--color-status-*` semantic tokens
- Today marker: `var(--color-danger)` red line
- Row stripes: alternate `--color-bg-primary` / `--color-bg-secondary`
- Grid lines: `var(--color-border)`
- Default zoom: month
- Data hook: `useTimeline` in `client/src/hooks/useTimeline.ts` -> calls existing `getTimeline()`
- No schema changes, no API changes, no shared type changes needed
- Route `/timeline` already exists in App.tsx

## EPIC-06 Story 6.5 Dependency Arrows Architecture

- Frontend-only story -- no backend/schema/API changes needed
- `TimelineResponse` already provides `dependencies[]` and `criticalPath[]`
- New files: `GanttArrows.tsx`, `GanttArrows.module.css`, `arrowUtils.ts`
- Modified files: `GanttChart.tsx` (add arrow layer + criticalPathSet), `GanttBar.tsx` (isCritical prop), `TimelinePage.tsx` (showArrows toggle)
- SVG layer order: Grid -> Arrows -> Bars (arrows behind bars so bars remain interactive)
- Arrow routing: orthogonal (horizontal-first) with 12px standoff from bar edges
- Arrow is critical if both predecessor and successor are in criticalPath set
- Critical bar styling: 2px stroke (non-color cue for a11y)
- Critical arrow styling: 2.5px stroke + full opacity (vs 1.5px + 0.5 opacity for normal)
- New CSS tokens needed: `--color-gantt-arrow`, `--color-gantt-arrow-critical`, `--color-gantt-bar-critical-stroke`
- SVG markers (`<marker>`) for arrowheads, use `fill="currentColor"` to inherit from path `color` prop

## EPIC-06 Story 6.6 Gantt Interactive Features Architecture

- Drag-and-drop: custom `useGanttDrag` hook using Pointer Events API (no library)
- Edge detection: 8px EDGE_THRESHOLD constant for left/right zones; center for whole-bar drag
- `setPointerCapture()` on pointerdown to prevent drag loss outside SVG
- Grid snapping: `snapToGrid(date, zoom)` pure function in ganttUtils.ts
- New `xToDate()` inverse function in ganttUtils.ts (mirrors `dateToX()` logic)
- Ghost bar: semi-transparent dashed SVG rect overlaid during drag; original bar dims to 0.3 opacity
- Cursor feedback: col-resize on edges, grab/grabbing on center; set via JS not CSS (pixel-based zones)
- Optimistic update: `useTimeline.updateItemDates()` mutates cached data, reverts on API failure
- Toast system: new `client/src/components/Toast/` (Toast.tsx, Toast.module.css, ToastContext.tsx)
  - Portal-based, bottom-right fixed, z-index: var(--z-modal), max 3 visible
  - `<ToastProvider>` wraps app in App.tsx; `useToast().showToast(variant, message)` API
- Gantt tooltip: separate component (not reusing existing Tooltip -- SVG elements can't be wrapped in spans)
  - Portal to document.body, positioned via getBoundingClientRect()
  - Shows: title, status, dates, duration, assigned user
  - Suppressed during drag
- Auto-schedule button: in TimelinePage toolbar; calls POST /api/schedule (read-only), then applies changes via individual PATCH calls, then refetches timeline
- Schedule API client: `client/src/lib/scheduleApi.ts` -- `runSchedule(request)`
- No backend/schema/shared-type changes needed

## PR #254 Review (Story 6.7 Milestones Frontend)

- Approved: all architecture patterns followed correctly
- API client (`milestonesApi.ts`): 7 functions mapping to all wiki API Contract endpoints
- `useMilestones` hook: follows `useTimeline` pattern exactly (fetchCount, cancelled, error discrimination)
- Discriminated union for GanttTooltip: `kind: 'work-item' | 'milestone'` -- clean polymorphic approach
- GanttMilestones: SVG diamonds, memo-ized, keyboard accessible, touch-expanded hit areas
- MilestonePanel: portal-based modal, layered Escape dismissal, delete sub-dialog at z-modal+1
- 6 new milestone tokens in tokens.css (Layer 2 + Layer 3 dark mode)
- Client-side filtering via `useMemo` + `TimelineMilestone.workItemIds`
- Non-blocking: autoScheduleButton class reused for milestone button (semantic mismatch); MilestonePanel.module.css at 801 lines (dialog/button duplication); `linkedIds` Set dependency not memoized in useCallback

## PR #255 Review (Story 6.8 Calendar View)

- Approved: all architecture patterns followed correctly
- Component structure mirrors GanttChart pattern: CalendarView (orchestrator) + MonthGrid/WeekGrid + CalendarItem/CalendarMilestone + calendarUtils.ts
- URL state: `?view=calendar` toggles Gantt/Calendar, `?calendarMode=month|week` persists calendar sub-mode, `{ replace: true }` avoids history pollution
- Date handling: UTC midnight (`Date.UTC()`) throughout -- consistent with Gantt approach
- CSS: Zero hardcoded hex values, all `--color-status-*` and `--color-milestone-*` semantic tokens used
- ARIA: `role="grid"` on calendar grids, `aria-live="polite"` on nav label, `aria-pressed` on toggles
- Responsive: 44px touch targets on tablet/mobile, narrow day initials on mobile, icon-only buttons
- Non-blocking: `getShortMonthName()` exported but unused (dead code); 6-row month grid is intentional (prevents layout shift)
- Cannot approve own PRs -- must use `--comment` review type

## PR #308 Review (Issue #296 -- Actual Dates, Delay Tracking, Status Simplification)

- Migration 0008: adds actual_start_date, actual_end_date; migrates blocked -> not_started
- SQLite CHECK constraint still includes blocked (cannot ALTER); app-layer enforces 3-value enum
- WorkItemStatus: 'not_started' | 'in_progress' | 'completed' (blocked removed)
- Scheduling engine: actualStartDate overrides ES; actualEndDate overrides EF (only when actualStartDate also set)
- Today floor: all not_started items get ES = max(computedES, today)
- Status transition auto-population: not_started->in_progress sets actualStartDate; in_progress->completed sets actualEndDate; direct skip sets both
- Explicit values in same PATCH request take precedence over auto-population
- **Wiki deviation resolved**: Schema.md and API-Contract.md updated to reflect actual dates and status simplification. Wiki pushed as commit `be2c6d2`. Deviation Log entries added to both pages.
- Approved from architecture perspective

## EPIC-08 Paperless-ngx Integration Architecture (ADR-015, PR #361)

- **Proxy pattern**: Server proxies all Paperless-ngx API calls; token never reaches browser
- **Schema**: Single `document_links` table (migration 0009) with polymorphic `entity_type` discriminator (work_item, household_item, invoice)
- **No FK on entity_id**: Referential integrity enforced at application layer (entity existence check on insert, cascade-delete on entity deletion)
- **Env vars**: `PAPERLESS_URL` + `PAPERLESS_API_TOKEN` -- integration enabled when both set
- **API version pin**: `Accept: application/json; version=5` header on all upstream requests
- **No cache Phase 1**: Direct upstream calls; in-memory LRU can be added later without API contract changes
- **Proxy endpoints**: `/api/paperless/{status,documents,documents/:id,documents/:id/thumb,documents/:id/preview,tags}`
- **Link endpoints**: `POST/GET/DELETE /api/document-links`
- **Error codes**: PAPERLESS_NOT_CONFIGURED (503), PAPERLESS_UNREACHABLE (502), PAPERLESS_ERROR (502), DUPLICATE_DOCUMENT_LINK (409)
- **EPIC-04 not yet implemented**: household_items table doesn't exist; application layer should guard against household_item entity type until EPIC-04 lands
- **Shared types**: `shared/src/types/document.ts` (PaperlessDocument, PaperlessTag, DocumentLink, DocumentLinkWithMetadata, etc.)
- **Config**: `paperlessUrl`, `paperlessApiToken`, `paperlessEnabled` added to AppConfig
- **Next migration**: 0010

## Known Wiki Documentation Gaps

- `work_item_milestone_deps` table (migration 0007) not yet documented in Schema.md
- Migration 0007 section entirely missing from Schema.md
- Wiki sandbox worktrees have persistent permission issues with `.git/objects/pack/` -- workaround: clone to `/tmp`, push from there, move back

## Topic Files

- `story-reviews.md` -- detailed review notes per story
- `epic03-refinement.md` -- 40 consolidated refinement items from EPIC-03 PR reviews
- `epic05-budget.md` -- EPIC-05 budget management details
