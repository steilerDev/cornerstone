import { randomUUID } from 'node:crypto';
import { eq, sql, and, or, desc, asc, inArray, isNull } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import type { areas } from '../db/schema.js';
import {
  workItems,
  users,
  workItemSubtasks,
  workItemDependencies,
  householdItemDeps,
  workItemBudgets,
  vendors,
  milestoneWorkItems,
} from '../db/schema.js';
import { toLikeContainsPattern } from './shared/likePattern.js';
import { listWorkItemBudgets } from './workItemBudgetService.js';
import {
  autoReschedule,
  computeScheduleProjection,
  loadScheduleGraph,
  projectSchedule,
  shownWorkItemDates,
  workItemProjectionOf,
} from './schedulingEngine.js';
import { getExpectedCostByWorkItem } from './moneyService.js';
import { buildScheduleIndex, computeHoldsUp, waitsForOf } from './shared/holdsUp.js';
import { taskTimeWindowOf } from './shared/taskTimeWindow.js';
import type { ScheduleProjection } from './schedulingEngine.js';
import type { ScheduleIndex } from './shared/holdsUp.js';
import { deleteLinksForEntity } from './documentLinkService.js';
import { loadAreaMap, resolveAreaAncestors, resolveAreaFilter } from './areaService.js';
import type { AreaMapEntry } from './areaService.js';
import {
  onWorkItemStatusChanged,
  onMilestoneDelayed,
  SYSTEM_CONTEXT,
  type EventContext,
} from './diaryAutoEventService.js';
import { toUserSummary, toAreaSummary, toVendorSummaryWithTrade } from './shared/converters.js';
import { validateAreaId } from './shared/validators.js';
import { loadGrantChips } from './shared/itemGrantChips.js';
import type {
  WorkItemDetail,
  WorkItemSummary,
  UserSummary,
  SubtaskResponse,
  DependencyResponse,
  CreateWorkItemRequest,
  UpdateWorkItemRequest,
  WorkItemListQuery,
  PaginationMeta,
  WorkItemBudgetLine,
  FilterMeta,
  AttentionHoldsUp,
  TaskTimeWindow,
  WorkItemListRow,
  WorkItemListRowsResponse,
  WorkItemPageDetail,
  WorkItemPageVendor,
} from '@cornerstone/shared';
import { TASK_TIME_WINDOWS } from '@cornerstone/shared';
import { NotFoundError, ValidationError } from '../errors/AppError.js';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

/**
 * Count budget lines for a work item.
 */
function getBudgetLineCount(db: DbType, workItemId: string): number {
  const result = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(workItemBudgets)
    .where(eq(workItemBudgets.workItemId, workItemId))
    .get();
  return result!.count;
}

/**
 * Convert database subtask row to SubtaskResponse shape.
 */
function toSubtaskResponse(subtask: typeof workItemSubtasks.$inferSelect): SubtaskResponse {
  return {
    id: subtask.id,
    title: subtask.title,
    isCompleted: subtask.isCompleted,
    sortOrder: subtask.sortOrder,
    createdAt: subtask.createdAt,
    updatedAt: subtask.updatedAt,
  };
}

/**
 * Fetch assigned user for a work item.
 */
function getAssignedUser(db: DbType, assignedUserId: string | null): UserSummary | null {
  if (!assignedUserId) return null;
  const user = db.select().from(users).where(eq(users.id, assignedUserId)).get();
  return toUserSummary(user || null);
}

/**
 * Fetch assigned vendor for a work item, with trade resolution.
 */
function getAssignedVendor(
  db: DbType,
  assignedVendorId: string | null,
): ReturnType<typeof toVendorSummaryWithTrade> {
  if (!assignedVendorId) return null;
  const vendor = db.select().from(vendors).where(eq(vendors.id, assignedVendorId)).get();
  return toVendorSummaryWithTrade(db, vendor || null);
}

/**
 * Get area with ancestors resolved from the area map.
 * Returns null if areaId is null or area is not found in the map.
 */
function getAreaWithAncestors(
  areaId: string | null,
  areaMap: Map<string, AreaMapEntry>,
): ReturnType<typeof toAreaSummary> {
  if (!areaId) return null;
  const entry = areaMap.get(areaId);
  if (!entry) return null;
  const ancestors = resolveAreaAncestors(areaId, areaMap);
  return toAreaSummary(
    {
      id: entry.id,
      name: entry.name,
      color: entry.color,
      parentId: entry.parentId,
    } as typeof areas.$inferSelect,
    ancestors,
  );
}

/**
 * Convert database work item row to WorkItemSummary shape.
 */
export function toWorkItemSummary(
  db: DbType,
  workItem: typeof workItems.$inferSelect,
  areaMap: Map<string, AreaMapEntry>,
  projection: ScheduleProjection,
): WorkItemSummary {
  const assignedUser = getAssignedUser(db, workItem.assignedUserId);
  const assignedVendor = getAssignedVendor(db, workItem.assignedVendorId);
  const area = getAreaWithAncestors(workItem.areaId, areaMap);
  const budgetLineCount = getBudgetLineCount(db, workItem.id);

  return {
    id: workItem.id,
    title: workItem.title,
    status: workItem.status,
    startDate: workItem.startDate,
    endDate: workItem.endDate,
    actualStartDate: workItem.actualStartDate,
    actualEndDate: workItem.actualEndDate,
    durationDays: workItem.durationDays,
    ...workItemProjectionOf(projection, workItem),
    assignedUser,
    assignedVendor,
    area,
    budgetLineCount,
    createdAt: workItem.createdAt,
    updatedAt: workItem.updatedAt,
  };
}

/** Attaches `grants` to list rows with one batched query (never per row). */
function withGrantChips(db: DbType, rows: WorkItemSummary[]): WorkItemSummary[] {
  const chips = loadGrantChips(
    db,
    'work_item',
    rows.map((row) => row.id),
  );
  return rows.map((row) => ({ ...row, grants: chips.get(row.id)! }));
}

/**
 * Fetch subtasks for a work item (sorted by sortOrder ascending).
 */
function getWorkItemSubtasks(db: DbType, workItemId: string): SubtaskResponse[] {
  const subtaskRows = db
    .select()
    .from(workItemSubtasks)
    .where(eq(workItemSubtasks.workItemId, workItemId))
    .orderBy(asc(workItemSubtasks.sortOrder))
    .all();

  return subtaskRows.map(toSubtaskResponse);
}

/**
 * Fetch dependencies (predecessors and successors) for a work item.
 */
function getWorkItemDependencies(
  db: DbType,
  workItemId: string,
  areaMap: Map<string, AreaMapEntry>,
  projection: ScheduleProjection,
): { predecessors: DependencyResponse[]; successors: DependencyResponse[] } {
  // Predecessors: work items that this item depends on
  const predecessorRows = db
    .select({
      dependency: workItemDependencies,
      workItem: workItems,
    })
    .from(workItemDependencies)
    .innerJoin(workItems, eq(workItems.id, workItemDependencies.predecessorId))
    .where(eq(workItemDependencies.successorId, workItemId))
    .all();

  const predecessors: DependencyResponse[] = predecessorRows.map((row) => ({
    workItem: toWorkItemSummary(db, row.workItem, areaMap, projection),
    dependencyType: row.dependency.dependencyType,
    leadLagDays: row.dependency.leadLagDays,
  }));

  // Successors: work items that depend on this item
  const successorRows = db
    .select({
      dependency: workItemDependencies,
      workItem: workItems,
    })
    .from(workItemDependencies)
    .innerJoin(workItems, eq(workItems.id, workItemDependencies.successorId))
    .where(eq(workItemDependencies.predecessorId, workItemId))
    .all();

  const successors: DependencyResponse[] = successorRows.map((row) => ({
    workItem: toWorkItemSummary(db, row.workItem, areaMap, projection),
    dependencyType: row.dependency.dependencyType,
    leadLagDays: row.dependency.leadLagDays,
  }));

  return { predecessors, successors };
}

/**
 * Convert database work item row to WorkItemDetail shape.
 */
export function toWorkItemDetail(
  db: DbType,
  workItem: typeof workItems.$inferSelect,
  areaMap: Map<string, AreaMapEntry>,
  projection: ScheduleProjection,
): WorkItemDetail {
  const assignedUser = getAssignedUser(db, workItem.assignedUserId);
  const assignedVendor = getAssignedVendor(db, workItem.assignedVendorId);
  const area = getAreaWithAncestors(workItem.areaId, areaMap);
  const createdByUser = workItem.createdBy
    ? db.select().from(users).where(eq(users.id, workItem.createdBy)).get()
    : null;
  const subtasks = getWorkItemSubtasks(db, workItem.id);
  const dependencies = getWorkItemDependencies(db, workItem.id, areaMap, projection);

  const budgets: WorkItemBudgetLine[] = listWorkItemBudgets(db, workItem.id);

  return {
    id: workItem.id,
    title: workItem.title,
    description: workItem.description,
    status: workItem.status,
    startDate: workItem.startDate,
    endDate: workItem.endDate,
    actualStartDate: workItem.actualStartDate,
    actualEndDate: workItem.actualEndDate,
    durationDays: workItem.durationDays,
    ...workItemProjectionOf(projection, workItem),
    startAfter: workItem.startAfter,
    startBefore: workItem.startBefore,
    assignedUser,
    assignedVendor,
    area,
    createdBy: toUserSummary(createdByUser || null),
    subtasks,
    dependencies,
    budgets,
    createdAt: workItem.createdAt,
    updatedAt: workItem.updatedAt,
  };
}

/**
 * Validate date constraints for a work item.
 * Throws ValidationError if constraints are violated.
 */
function validateDateConstraints(data: {
  startDate?: string | null;
  endDate?: string | null;
  startAfter?: string | null;
  startBefore?: string | null;
}): void {
  const errors: string[] = [];

  // startDate must be <= endDate if both provided
  if (data.startDate && data.endDate && data.startDate > data.endDate) {
    errors.push('startDate must be before or equal to endDate');
  }

  // startAfter must be <= startBefore if both provided
  if (data.startAfter && data.startBefore && data.startAfter > data.startBefore) {
    errors.push('startAfter must be before or equal to startBefore');
  }

  if (errors.length > 0) {
    throw new ValidationError(errors.join('; '));
  }
}

/**
 * Validate that assigned user ID exists and is active.
 * Throws ValidationError if user does not exist or is deactivated.
 */
function validateAssignedUser(db: DbType, userId: string): void {
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) {
    throw new ValidationError(`User not found: ${userId}`);
  }
  if (user.deactivatedAt) {
    throw new ValidationError(`User is deactivated: ${userId}`);
  }
}

/** A work item has one assignee: a user or a vendor, never both (DB triggers enforce it too). */
function assertSingleAssignee(
  userId: string | null | undefined,
  vendorId: string | null | undefined,
): void {
  if (userId && vendorId) {
    throw new ValidationError('A work item can be assigned to a user or a vendor, not both');
  }
}

/**
 * Replace all tags for a work item (set-semantics).
 * Deletes existing associations not in the new set, inserts new ones.
 */
/**
 * Create a new work item.
 */
export function createWorkItem(
  db: DbType,
  userId: string,
  data: CreateWorkItemRequest,
): WorkItemDetail {
  // Validate required fields
  if (!data.title || data.title.trim().length === 0) {
    throw new ValidationError('Title is required');
  }

  // Validate date constraints
  validateDateConstraints(data);
  assertSingleAssignee(data.assignedUserId, data.assignedVendorId);

  // Validate assignedUserId if provided
  if (data.assignedUserId) {
    validateAssignedUser(db, data.assignedUserId);
  }

  // Validate areaId if provided
  if (data.areaId) {
    validateAreaId(db, data.areaId);
  }

  // Validate assignedVendorId if provided
  if (data.assignedVendorId) {
    const vendor = db.select().from(vendors).where(eq(vendors.id, data.assignedVendorId)).get();
    if (!vendor) {
      throw new ValidationError(`Vendor not found: ${data.assignedVendorId}`);
    }
  }

  const now = new Date().toISOString();
  const id = randomUUID();

  // Insert work item
  db.insert(workItems)
    .values({
      id,
      title: data.title.trim(),
      description: data.description ?? null,
      status: data.status ?? 'not_started',
      startDate: data.startDate ?? null,
      endDate: data.endDate ?? null,
      actualStartDate: data.actualStartDate ?? null,
      actualEndDate: data.actualEndDate ?? null,
      durationDays: data.durationDays ?? null,
      startAfter: data.startAfter ?? null,
      startBefore: data.startBefore ?? null,
      assignedUserId: data.assignedUserId ?? null,
      areaId: data.areaId ?? null,
      assignedVendorId: data.assignedVendorId ?? null,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  // Fetch and return the created work item
  const workItem = db.select().from(workItems).where(eq(workItems.id, id)).get();
  const areaMap = loadAreaMap(db);
  return toWorkItemDetail(db, workItem!, areaMap, computeScheduleProjection(db));
}

/**
 * Find a work item by ID.
 */
export function findWorkItemById(
  db: DbType,
  id: string,
): typeof workItems.$inferSelect | undefined {
  return db.select().from(workItems).where(eq(workItems.id, id)).get();
}

/**
 * Verify a work item exists.
 * @throws NotFoundError if work item does not exist
 */
export function ensureWorkItemExists(db: DbType, workItemId: string): void {
  const workItem = findWorkItemById(db, workItemId);
  if (!workItem) {
    throw new NotFoundError('Work item not found');
  }
}

/**
 * Get work item detail by ID.
 * Throws NotFoundError if work item does not exist.
 */
export function getWorkItemDetail(db: DbType, id: string): WorkItemDetail {
  const workItem = findWorkItemById(db, id);
  if (!workItem) {
    throw new NotFoundError('Work item not found');
  }
  const areaMap = loadAreaMap(db);
  return toWorkItemDetail(db, workItem, areaMap, computeScheduleProjection(db));
}

/**
 * Update a work item.
 * Throws NotFoundError if work item does not exist.
 *
 * @param db - Database connection
 * @param id - Work item ID
 * @param data - Update request data
 * @param ctx - Event context for the status system event (acting user; undoable for PATCH routes)
 */
export function updateWorkItem(
  db: DbType,
  id: string,
  data: UpdateWorkItemRequest,
  ctx: EventContext = SYSTEM_CONTEXT,
): WorkItemDetail {
  const workItem = findWorkItemById(db, id);
  if (!workItem) {
    throw new NotFoundError('Work item not found');
  }

  // Ensure at least one field is provided
  if (Object.keys(data).length === 0) {
    throw new ValidationError('At least one field must be provided');
  }

  // Build update data with existing values as defaults
  const updateData: Partial<typeof workItems.$inferInsert> = {};

  if ('title' in data) {
    if (!data.title || data.title.trim().length === 0) {
      throw new ValidationError('Title cannot be empty');
    }
    updateData.title = data.title.trim();
  }

  if ('description' in data) {
    updateData.description = data.description ?? null;
  }

  if ('status' in data) {
    updateData.status = data.status;
  }

  if ('startDate' in data) {
    updateData.startDate = data.startDate ?? null;
  }

  if ('endDate' in data) {
    updateData.endDate = data.endDate ?? null;
  }

  if ('durationDays' in data) {
    updateData.durationDays = data.durationDays ?? null;
  }

  if ('startAfter' in data) {
    updateData.startAfter = data.startAfter ?? null;
  }

  if ('startBefore' in data) {
    updateData.startBefore = data.startBefore ?? null;
  }

  if ('assignedUserId' in data) {
    if (data.assignedUserId) {
      validateAssignedUser(db, data.assignedUserId);
    }
    updateData.assignedUserId = data.assignedUserId ?? null;
  }

  if ('areaId' in data) {
    if (data.areaId) {
      validateAreaId(db, data.areaId);
    }
    updateData.areaId = data.areaId ?? null;
  }

  if ('assignedVendorId' in data) {
    if (data.assignedVendorId) {
      const vendor = db.select().from(vendors).where(eq(vendors.id, data.assignedVendorId)).get();
      if (!vendor) {
        throw new ValidationError(`Vendor not found: ${data.assignedVendorId}`);
      }
    }
    updateData.assignedVendorId = data.assignedVendorId ?? null;
  }

  assertSingleAssignee(
    'assignedUserId' in data ? data.assignedUserId : workItem.assignedUserId,
    'assignedVendorId' in data ? data.assignedVendorId : workItem.assignedVendorId,
  );

  if ('actualStartDate' in data) {
    updateData.actualStartDate = data.actualStartDate ?? null;
  }

  if ('actualEndDate' in data) {
    updateData.actualEndDate = data.actualEndDate ?? null;
  }

  // Validate date constraints with merged data
  const mergedData = {
    startDate: 'startDate' in updateData ? updateData.startDate : workItem.startDate,
    endDate: 'endDate' in updateData ? updateData.endDate : workItem.endDate,
    startAfter: 'startAfter' in updateData ? updateData.startAfter : workItem.startAfter,
    startBefore: 'startBefore' in updateData ? updateData.startBefore : workItem.startBefore,
  };
  validateDateConstraints(mergedData);

  // Auto-populate actual dates on status transitions.
  // Only auto-populate if the actual date is currently null AND not being explicitly set
  // in this same request.
  let statusChanged = false;
  let previousStatus: string | undefined;
  let newStatus: string | undefined;

  if ('status' in data && data.status !== workItem.status) {
    const today = new Date().toISOString().slice(0, 10);
    newStatus = data.status;
    previousStatus = workItem.status;
    statusChanged = true;

    const isExplicitActualStart = 'actualStartDate' in data;
    const isExplicitActualEnd = 'actualEndDate' in data;

    const currentActualStart = isExplicitActualStart
      ? (updateData.actualStartDate ?? null)
      : workItem.actualStartDate;
    const currentActualEnd = isExplicitActualEnd
      ? (updateData.actualEndDate ?? null)
      : workItem.actualEndDate;

    if (newStatus === 'in_progress' && previousStatus === 'not_started') {
      // not_started → in_progress: set actualStartDate to today if not already set
      if (!isExplicitActualStart && currentActualStart === null) {
        updateData.actualStartDate = today;
      }
    } else if (newStatus === 'completed' && previousStatus === 'in_progress') {
      // in_progress → completed: set actualEndDate to today if not already set
      if (!isExplicitActualEnd && currentActualEnd === null) {
        updateData.actualEndDate = today;
      }
    } else if (newStatus === 'completed' && previousStatus === 'not_started') {
      // not_started → completed (direct skip): set both actual dates if not set. A missing
      // actual start defaults to the resolved actual end (explicit end, else today) so a
      // past end date never ends up before its start (#2209 D7).
      const resolvedActualEnd = currentActualEnd ?? today;
      if (!isExplicitActualStart && currentActualStart === null) {
        updateData.actualStartDate = resolvedActualEnd;
      }
      if (!isExplicitActualEnd && currentActualEnd === null) {
        updateData.actualEndDate = today;
      }
    }
  }

  // Update work item
  updateData.updatedAt = new Date().toISOString();
  db.update(workItems).set(updateData).where(eq(workItems.id, id)).run();

  // Trigger auto-reschedule when any scheduling-relevant field changed.
  // actualStartDate and actualEndDate are included because the engine uses them
  // as absolute overrides for ES/EF in the CPM forward pass.
  const schedulingFieldChanged =
    'startDate' in data ||
    'endDate' in data ||
    'actualStartDate' in data ||
    'actualEndDate' in data ||
    'durationDays' in data ||
    'startAfter' in data ||
    'startBefore' in data ||
    'status' in data;

  if (schedulingFieldChanged) {
    autoReschedule(db, {
      onMilestoneDelayed: (milestoneId, milestoneName, targetDate, projectedDate) => {
        onMilestoneDelayed(db, milestoneId, milestoneName, targetDate, projectedDate);
      },
    });
  }

  // Log status change as a system event
  if (statusChanged && previousStatus !== undefined && newStatus !== undefined) {
    onWorkItemStatusChanged(db, id, workItem.title, previousStatus, newStatus, ctx);
  }

  // Fetch and return the updated work item
  const updatedWorkItem = db.select().from(workItems).where(eq(workItems.id, id)).get();
  const areaMap = loadAreaMap(db);
  return toWorkItemDetail(db, updatedWorkItem!, areaMap, computeScheduleProjection(db));
}

/**
 * Delete a work item.
 * Throws NotFoundError if work item does not exist.
 */
export function deleteWorkItem(db: DbType, id: string): void {
  const workItem = findWorkItemById(db, id);
  if (!workItem) {
    throw new NotFoundError('Work item not found');
  }

  db.transaction(() => {
    // Cascade delete household item dependencies where this work item is the predecessor
    db.delete(householdItemDeps)
      .where(
        and(
          eq(householdItemDeps.predecessorType, 'work_item'),
          eq(householdItemDeps.predecessorId, id),
        ),
      )
      .run();

    // Cascade delete document links (polymorphic FK, enforced at app layer)
    deleteLinksForEntity(db, 'work_item', id);

    db.delete(workItems).where(eq(workItems.id, id)).run();
  });
}

/**
 * Correlated budget-line count of the outer work_items row. The outer id is written qualified:
 * drizzle emits unqualified column names in single-table queries, so a bare `id` would bind to
 * work_item_budgets.id inside the subquery.
 */
const BUDGET_LINE_COUNT = sql`SELECT COUNT(*) FROM ${workItemBudgets} WHERE ${workItemBudgets.workItemId} = "work_items"."id"`;

/**
 * Filter conditions shared by both list functions. `baseConditions` drive filterMeta (everything
 * except the numeric budget-line range); `conditions` add the range.
 */
function buildConditions(
  db: DbType,
  query: WorkItemListQuery,
): { baseConditions: SQL[]; conditions: SQL[] } {
  const baseConditions: SQL[] = [];

  if (query.status) {
    baseConditions.push(eq(workItems.status, query.status));
  }

  if (query.assignedUserId) {
    baseConditions.push(eq(workItems.assignedUserId, query.assignedUserId));
  }

  if (query.areaId) {
    const { areaIds, includeNull, hasInput } = resolveAreaFilter(db, query.areaId);
    if (includeNull && areaIds.length > 0) {
      baseConditions.push(or(isNull(workItems.areaId), inArray(workItems.areaId, areaIds))!);
    } else if (includeNull) {
      baseConditions.push(isNull(workItems.areaId));
    } else if (areaIds.length > 0) {
      baseConditions.push(inArray(workItems.areaId, areaIds));
    } else if (hasInput) {
      // User supplied ID(s) but all were unknown — yield empty result
      baseConditions.push(sql`1 = 0`);
    }
    // else: no meaningful input (empty/whitespace-only CSV) — skip filter
  }

  if (query.assignedVendorId) {
    baseConditions.push(eq(workItems.assignedVendorId, query.assignedVendorId));
  }

  if (query.q) {
    const pattern = toLikeContainsPattern(query.q);
    baseConditions.push(
      or(
        sql`LOWER(${workItems.title}) LIKE LOWER(${pattern}) ESCAPE '\\'`,
        sql`LOWER(${workItems.description}) LIKE LOWER(${pattern}) ESCAPE '\\'`,
      )!,
    );
  }

  if (query.milestoneId !== undefined) {
    baseConditions.push(
      inArray(
        workItems.id,
        db
          .select({ id: milestoneWorkItems.workItemId })
          .from(milestoneWorkItems)
          .where(eq(milestoneWorkItems.milestoneId, query.milestoneId)),
      ),
    );
  }

  // Build full conditions with numeric range filters for the main query
  const conditions = [...baseConditions];

  // Filter by budget line count
  if (query.budgetLinesMin !== undefined) {
    conditions.push(sql`(${BUDGET_LINE_COUNT}) >= ${query.budgetLinesMin}`);
  }
  if (query.budgetLinesMax !== undefined) {
    conditions.push(sql`(${BUDGET_LINE_COUNT}) <= ${query.budgetLinesMax}`);
  }

  return { baseConditions, conditions };
}

/** Budget-line range of the rows matching the base conditions (drives the range filter bounds). */
function buildFilterMeta(db: DbType, baseConditions: SQL[]): FilterMeta {
  const metaRow = db
    .select({
      budgetLinesMin: sql<number>`COALESCE(MIN(COALESCE((${BUDGET_LINE_COUNT}), 0)), 0)`,
      budgetLinesMax: sql<number>`COALESCE(MAX(COALESCE((${BUDGET_LINE_COUNT}), 0)), 0)`,
    })
    .from(workItems)
    .where(baseConditions.length > 0 ? and(...baseConditions) : undefined)
    .get();
  return { budgetLines: { min: metaRow!.budgetLinesMin, max: metaRow!.budgetLinesMax } };
}

/** True when the shown dates fall inside the query's inclusive start/end ranges. */
function matchesShownDates(
  dates: { start: string | null; end: string | null },
  query: WorkItemListQuery,
): boolean {
  const inRange = (value: string | null, from?: string, to?: string): boolean => {
    if (from === undefined && to === undefined) return true;
    if (value === null) return false;
    return (from === undefined || value >= from) && (to === undefined || value <= to);
  };
  return (
    inRange(dates.start, query.startDateFrom, query.startDateTo) &&
    inRange(dates.end, query.endDateFrom, query.endDateTo)
  );
}

interface ListEntry {
  row: typeof workItems.$inferSelect;
  dates: { start: string | null; end: string | null };
  /** Major units; null when the task has no budget lines (or the sort does not need it). */
  expectedCost: number | null;
}

/**
 * In-memory list order: the shown dates and expected cost sort rows without a value last in both
 * directions; ties fall back to createdAt, then id.
 */
function compareListEntries(
  sortBy: NonNullable<WorkItemListQuery['sortBy']>,
  sortOrder: 'asc' | 'desc',
): (a: ListEntry, b: ListEntry) => number {
  const direction = sortOrder === 'asc' ? 1 : -1;
  const compareValues = (a: string | number, b: string | number): number =>
    a < b ? -1 : a > b ? 1 : 0;
  const nullablePick = (entry: ListEntry): string | number | null =>
    sortBy === 'start_date'
      ? entry.dates.start
      : sortBy === 'end_date'
        ? entry.dates.end
        : entry.expectedCost;
  const textPick = (row: typeof workItems.$inferSelect): string =>
    sortBy === 'title'
      ? row.title
      : sortBy === 'status'
        ? row.status
        : sortBy === 'updated_at'
          ? row.updatedAt
          : row.createdAt;
  return (a, b) => {
    let primary: number;
    if (sortBy === 'start_date' || sortBy === 'end_date' || sortBy === 'expected_cost') {
      const av = nullablePick(a);
      const bv = nullablePick(b);
      if (av === null && bv === null) primary = 0;
      else if (av === null) return 1;
      else if (bv === null) return -1;
      else primary = compareValues(av, bv) * direction;
    } else {
      primary = compareValues(textPick(a.row), textPick(b.row)) * direction;
    }
    if (primary !== 0) return primary;
    return compareValues(a.row.createdAt, b.row.createdAt) || compareValues(a.row.id, b.row.id);
  };
}

/**
 * List work items with filtering, sorting, and pagination.
 */
export function listWorkItems(
  db: DbType,
  query: WorkItemListQuery,
): { items: WorkItemSummary[]; pagination: PaginationMeta; filterMeta: FilterMeta } {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 25));
  const sortBy = query.sortBy ?? 'created_at';
  const sortOrder = query.sortOrder ?? 'desc';

  const { baseConditions, conditions } = buildConditions(db, query);

  const filterMeta = buildFilterMeta(db, baseConditions);

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Date sort/filter follow the shown date (actual ?? forecast), so they run in memory
  // before paging (contract 4, #2199). Every other query keeps the SQL path below.
  const dateFilterActive =
    query.startDateFrom !== undefined ||
    query.startDateTo !== undefined ||
    query.endDateFrom !== undefined ||
    query.endDateTo !== undefined;
  if (sortBy === 'start_date' || sortBy === 'end_date' || dateFilterActive) {
    const projection = computeScheduleProjection(db);
    const areaMap = loadAreaMap(db);

    const shown = db
      .select()
      .from(workItems)
      .where(whereClause)
      .all()
      .map((row) => ({
        row,
        dates: shownWorkItemDates(row, workItemProjectionOf(projection, row)),
        expectedCost: null,
      }))
      .filter(({ dates }) => matchesShownDates(dates, query));

    shown.sort(compareListEntries(sortBy, sortOrder));

    const filteredTotal = shown.length;
    const pageRows = shown.slice((page - 1) * pageSize, page * pageSize);
    return {
      items: withGrantChips(
        db,
        pageRows.map(({ row }) => toWorkItemSummary(db, row, areaMap, projection)),
      ),
      pagination: {
        page,
        pageSize,
        totalItems: filteredTotal,
        totalPages: Math.ceil(filteredTotal / pageSize),
      },
      filterMeta,
    };
  }

  // Count total items
  const countResult = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(workItems)
    .where(whereClause)
    .get();
  const totalItems = countResult!.count;
  const totalPages = Math.ceil(totalItems / pageSize);

  // Build ORDER BY
  const sortColumn =
    sortBy === 'title'
      ? workItems.title
      : sortBy === 'status'
        ? workItems.status
        : sortBy === 'updated_at'
          ? workItems.updatedAt
          : workItems.createdAt;

  const orderBy = sortOrder === 'asc' ? asc(sortColumn) : desc(sortColumn);

  // Load area map once for all items
  const areaMap = loadAreaMap(db);

  // Fetch paginated items
  const offset = (page - 1) * pageSize;
  const workItemRows = db
    .select()
    .from(workItems)
    .where(whereClause)
    .orderBy(orderBy)
    .limit(pageSize)
    .offset(offset)
    .all();

  const projection = computeScheduleProjection(db);
  const items = withGrantChips(
    db,
    workItemRows.map((wi) => toWorkItemSummary(db, wi, areaMap, projection)),
  );

  return {
    items,
    pagination: {
      page,
      pageSize,
      totalItems,
      totalPages,
    },
    filterMeta,
  };
}

/** Most ids one `ids` request may name (and the page size of an `ids` response). */
const MAX_LIST_IDS = 100;

/** The per-task figures shared by the Tasks list rows and the task page (one definition each). */
type WorkItemRowFigures = Pick<
  WorkItemListRow,
  'grants' | 'expectedCost' | 'waitsFor' | 'holdsUp' | 'isCritical'
>;

/**
 * Grants, expected cost, critical flag, waits-for and holds-up for the given summaries.
 * `costs` is the expected-cost map when the caller already holds it; null loads it on demand
 * (only when some summary has budget lines).
 */
function buildRowFigures(
  db: DbType,
  summaries: readonly WorkItemSummary[],
  ctx: {
    today: string;
    projection: ScheduleProjection;
    index: ScheduleIndex;
    vatRate: number;
    costs: Map<string, number> | null;
  },
): Map<string, WorkItemRowFigures> {
  const { today, projection, index } = ctx;
  let costs = ctx.costs;
  const chips = loadGrantChips(
    db,
    'work_item',
    summaries.map((summary) => summary.id),
  );
  if (costs === null && summaries.some((summary) => summary.budgetLineCount > 0)) {
    costs = getExpectedCostByWorkItem(db, ctx.vatRate);
  }

  const criticalSet = new Set(projection.criticalPath);
  const waits = new Map<string, { firstId: string; count: number }>();
  for (const summary of summaries) {
    const waitsFor =
      summary.status === 'completed' ? null : waitsForOf(index, summary.id, projection);
    if (waitsFor !== null) waits.set(summary.id, waitsFor);
  }
  const waitTitles = new Map(
    db
      .select({ id: workItems.id, title: workItems.title })
      .from(workItems)
      .where(inArray(workItems.id, [...new Set([...waits.values()].map((w) => w.firstId))]))
      .all()
      .map((wi) => [wi.id, wi.title]),
  );

  const figures = new Map<string, WorkItemRowFigures>();
  for (const summary of summaries) {
    const waitsFor = waits.get(summary.id);
    let holdsUp: AttentionHoldsUp | null = null;
    if (summary.status !== 'completed') {
      const { count, startingWithin14Days } = computeHoldsUp(index, summary.id, {
        today,
        projection,
      });
      if (count > 0) holdsUp = { count, startingWithin14Days };
    }
    figures.set(summary.id, {
      grants: chips.get(summary.id)!,
      expectedCost: summary.budgetLineCount === 0 ? null : costs!.get(summary.id)!,
      isCritical: summary.status !== 'completed' && criticalSet.has(summary.id),
      waitsFor: waitsFor
        ? {
            id: waitsFor.firstId,
            title: waitTitles.get(waitsFor.firstId)!,
            more: waitsFor.count - 1,
          }
        : null,
      holdsUp,
    });
  }
  return figures;
}

/**
 * List rows for the Tasks list (GET /api/work-items): the summary plus grants, expected cost,
 * time window, critical flag, waits-for and holds-up. Always runs in memory so the time-window
 * grouping, the shown-date filters and the expected-cost sort share one path.
 */
export function listWorkItemRows(
  db: DbType,
  query: WorkItemListQuery,
  opts: { vatRate: number; now?: Date },
): WorkItemListRowsResponse {
  const today = (opts.now ?? new Date()).toISOString().slice(0, 10);
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 25));
  const sortBy = query.sortBy ?? 'created_at';
  const sortOrder = query.sortOrder ?? 'desc';

  // `ids`: usable ids only (trimmed, non-empty); narrows just the rows and the pagination.
  const idList = (query.ids ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
  if (idList.length > MAX_LIST_IDS) {
    throw new ValidationError(`ids accepts at most ${MAX_LIST_IDS} ids`);
  }
  const byIds = idList.length > 0;

  const { baseConditions, conditions } = buildConditions(db, query);
  const filterMeta = buildFilterMeta(db, baseConditions);

  const graph = loadScheduleGraph(db);
  const projection = projectSchedule(graph, today);
  const index = buildScheduleIndex(graph);

  const entries: ListEntry[] = db
    .select()
    .from(workItems)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .all()
    .map((row) => ({
      row,
      dates: shownWorkItemDates(row, workItemProjectionOf(projection, row)),
      expectedCost: null,
    }))
    .filter(({ dates }) => matchesShownDates(dates, query));

  const windowOf = new Map<string, TaskTimeWindow>();
  for (const { row } of entries) {
    windowOf.set(row.id, taskTimeWindowOf(row, workItemProjectionOf(projection, row), today));
  }

  // Expected cost is computed once: for every row when it sorts, else for the page below.
  let costs: Map<string, number> | null = null;
  if (sortBy === 'expected_cost') {
    costs = getExpectedCostByWorkItem(db, opts.vatRate);
    const lineCounts = new Set(
      db
        .select({ id: workItemBudgets.workItemId })
        .from(workItemBudgets)
        .groupBy(workItemBudgets.workItemId)
        .all()
        .map((line) => line.id),
    );
    for (const entry of entries) {
      entry.expectedCost = lineCounts.has(entry.row.id) ? costs.get(entry.row.id)! : null;
    }
  }

  const compare = compareListEntries(sortBy, sortOrder);
  const windowIndex = (entry: ListEntry): number =>
    query.group === 'time' ? TASK_TIME_WINDOWS.indexOf(windowOf.get(entry.row.id)!) : 0;
  entries.sort((a, b) => windowIndex(a) - windowIndex(b) || compare(a, b));

  let groupCounts: Record<TaskTimeWindow, number> | undefined;
  if (query.group === 'time') {
    groupCounts = { late: 0, this_week: 0, next_two_weeks: 0, later: 0, done: 0 };
    for (const entry of entries) groupCounts[windowOf.get(entry.row.id)!] += 1;
  }

  const scopeTotal = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(workItems)
    .where(query.status ? eq(workItems.status, query.status) : undefined)
    .get()!.count;

  // `ids` narrows the rows and the pagination, nothing else
  const idSet = new Set(idList);
  const matching = byIds ? entries.filter((entry) => idSet.has(entry.row.id)) : entries;
  const totalItems = matching.length;
  const pageRows = byIds ? matching : matching.slice((page - 1) * pageSize, page * pageSize);

  const areaMap = loadAreaMap(db);
  const summaries = pageRows.map(({ row }) => toWorkItemSummary(db, row, areaMap, projection));
  const figures = buildRowFigures(db, summaries, {
    today,
    projection,
    index,
    vatRate: opts.vatRate,
    costs,
  });

  const items: WorkItemListRow[] = summaries.map((summary) => ({
    ...summary,
    ...figures.get(summary.id)!,
    timeWindow: windowOf.get(summary.id)!,
  }));

  return {
    items,
    pagination: byIds
      ? { page: 1, pageSize: MAX_LIST_IDS, totalItems, totalPages: totalItems > 0 ? 1 : 0 }
      : { page, pageSize, totalItems, totalPages: Math.ceil(totalItems / pageSize) },
    filterMeta,
    ...(groupCounts ? { groupCounts } : {}),
    scopeTotal,
  };
}

/**
 * Task page detail (GET /api/work-items/:id): the detail plus the page's figures, computed by the
 * same helper as the Tasks list rows, and the assigned company's phone for the Call button.
 * Throws NotFoundError if the work item does not exist.
 */
export function getWorkItemPageDetail(
  db: DbType,
  id: string,
  opts: { vatRate: number; now?: Date },
): WorkItemPageDetail {
  const row = findWorkItemById(db, id);
  if (!row) {
    throw new NotFoundError('Work item not found');
  }
  const today = (opts.now ?? new Date()).toISOString().slice(0, 10);
  const graph = loadScheduleGraph(db);
  const projection = projectSchedule(graph, today);
  const index = buildScheduleIndex(graph);
  const areaMap = loadAreaMap(db);

  const detail = toWorkItemDetail(db, row, areaMap, projection);
  const summary = toWorkItemSummary(db, row, areaMap, projection);
  const { expectedCost, grants, waitsFor, holdsUp } = buildRowFigures(db, [summary], {
    today,
    projection,
    index,
    vatRate: opts.vatRate,
    costs: null,
  }).get(id)!;

  let assignedVendor: WorkItemPageVendor | null = null;
  if (detail.assignedVendor) {
    const vendorRow = db
      .select({ phone: vendors.phone })
      .from(vendors)
      .where(eq(vendors.id, detail.assignedVendor.id))
      .get();
    assignedVendor = { ...detail.assignedVendor, phone: vendorRow!.phone };
  }

  return { ...detail, assignedVendor, expectedCost, grants, waitsFor, holdsUp };
}
