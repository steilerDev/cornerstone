# Scheduling Engine, Milestones & Timeline (EPIC-06 + follow-ups)

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

## EPIC-06 Story 6.2 Files (Scheduling Engine)

No DB migration needed (uses existing `work_items` and `work_item_dependencies` tables).

Key files added/modified:

- `shared/src/types/schedule.ts` — new (ScheduleRequest, ScheduleResponse, ScheduledItem, ScheduleWarningType, ScheduleWarning)
- `shared/src/index.ts` — added schedule type exports
- `server/src/services/schedulingEngine.ts` — pure CPM algorithm (Kahn's topo sort, forward/backward pass, float, critical path)
- `server/src/routes/schedule.ts` — POST /api/schedule, registered at `/api/schedule`
- `server/src/errors/AppError.ts` — added CircularDependencyError (409)

CPM Dependency Math (ADR-014):

| Type | Forward ES              | Backward LF            |
| ---- | ----------------------- | ---------------------- |
| FS   | PredEF + LL             | SucLS - LL             |
| SS   | PredES + LL             | (SucLS - LL) + predDur |
| FF   | (PredEF + LL) - succDur | SucLF - LL             |
| SF   | (PredES + LL) - succDur | (SucLF - LL) + predDur |

Engine is a pure function with injectable `today` parameter for testability.
Cascade mode uses BFS from anchor to collect all downstream successors.

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
- (Superseded by Bug #484 fix below — milestones are now real CPM nodes, not expanded away)

Triggers (call `autoReschedule(db)` after mutation):

- `workItemService.updateWorkItem()` — if any of: startDate, endDate, durationDays, startAfter, startBefore, status changed (later also actualStartDate/actualEndDate — see Issue #296)
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

## Bug #484 Fix — Milestones on Critical Path (PR #487)

**Issue**: Milestones never appeared on the critical path, even when they sat on the longest path through the project.

**Root cause**: Milestone dependency expansion in `autoReschedule()` created synthetic WI→WI dependencies but did NOT add milestones as CPM nodes. The CPM graph never saw the milestones, so they couldn't be marked as critical.

**Solution**: Model milestones as zero-duration CPM nodes with ID prefix `milestone:<id>`. The scheduler naturally includes them in critical path calculations.

**Changes**:

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
