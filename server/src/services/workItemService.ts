import { randomUUID } from 'node:crypto';
import { eq, sql, and, or, desc, asc, inArray, isNull } from 'drizzle-orm';
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
  trades,
} from '../db/schema.js';
import { listWorkItemBudgets } from './workItemBudgetService.js';
import { autoReschedule } from './schedulingEngine.js';
import { deleteLinksForEntity } from './documentLinkService.js';
import { getDescendantIds, loadAreaMap, resolveAreaAncestors, resolveAreaFilter } from './areaService.js';
import type { AreaMapEntry } from './areaService.js';
import {
  onWorkItemStatusChanged,
  onMilestoneDelayed,
  onAutoRescheduleCompleted,
} from './diaryAutoEventService.js';
import { toUserSummary, toAreaSummary, toVendorSummaryWithTrade } from './shared/converters.js';
import { validateAreaId } from './shared/validators.js';
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
} from '@cornerstone/shared';
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
  return result?.count ?? 0;
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
    assignedUser,
    assignedVendor,
    area,
    budgetLineCount,
    createdAt: workItem.createdAt,
    updatedAt: workItem.updatedAt,
  };
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
    workItem: toWorkItemSummary(db, row.workItem, areaMap),
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
    workItem: toWorkItemSummary(db, row.workItem, areaMap),
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
): WorkItemDetail {
  const assignedUser = getAssignedUser(db, workItem.assignedUserId);
  const assignedVendor = getAssignedVendor(db, workItem.assignedVendorId);
  const area = getAreaWithAncestors(workItem.areaId, areaMap);
  const createdByUser = workItem.createdBy
    ? db.select().from(users).where(eq(users.id, workItem.createdBy)).get()
    : null;
  const subtasks = getWorkItemSubtasks(db, workItem.id);
  const dependencies = getWorkItemDependencies(db, workItem.id, areaMap);

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
  return toWorkItemDetail(db, workItem!, areaMap);
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
  return toWorkItemDetail(db, workItem, areaMap);
}

/**
 * Update a work item.
 * Throws NotFoundError if work item does not exist.
 *
 * @param db - Database connection
 * @param id - Work item ID
 * @param data - Update request data
 * @param diaryAutoEvents - Whether to create automatic diary entries (default: true)
 */
export function updateWorkItem(
  db: DbType,
  id: string,
  data: UpdateWorkItemRequest,
  diaryAutoEvents: boolean = true,
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
      // not_started → completed (direct skip): set both actual dates to today if not set
      if (!isExplicitActualStart && currentActualStart === null) {
        updateData.actualStartDate = today;
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
        onMilestoneDelayed(
          db,
          diaryAutoEvents,
          milestoneId,
          milestoneName,
          targetDate,
          projectedDate,
        );
      },
      onRescheduleCompleted: (updatedCount) => {
        onAutoRescheduleCompleted(db, diaryAutoEvents, updatedCount);
      },
    });
  }

  // Log status change to diary if enabled
  if (statusChanged && previousStatus !== undefined && newStatus !== undefined) {
    onWorkItemStatusChanged(db, diaryAutoEvents, id, workItem.title, previousStatus, newStatus);
  }

  // Fetch and return the updated work item
  const updatedWorkItem = db.select().from(workItems).where(eq(workItems.id, id)).get();
  const areaMap = loadAreaMap(db);
  return toWorkItemDetail(db, updatedWorkItem!, areaMap);
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

  // Build base conditions (excluding numeric range filters)
  const baseConditions = [];

  if (query.status) {
    baseConditions.push(eq(workItems.status, query.status));
  }

  if (query.assignedUserId) {
    baseConditions.push(eq(workItems.assignedUserId, query.assignedUserId));
  }

  if (query.areaId) {
    const { areaIds, includeNull } = resolveAreaFilter(db, query.areaId);
    if (includeNull && areaIds.length > 0) {
      baseConditions.push(or(isNull(workItems.areaId), inArray(workItems.areaId, areaIds))!);
    } else if (includeNull) {
      baseConditions.push(isNull(workItems.areaId));
    } else if (areaIds.length > 0) {
      baseConditions.push(inArray(workItems.areaId, areaIds));
    }
  }

  if (query.assignedVendorId) {
    baseConditions.push(eq(workItems.assignedVendorId, query.assignedVendorId));
  }

  if (query.q) {
    // Escape SQL LIKE wildcards (% and _) in user input
    const escapedQ = query.q.replace(/%/g, '\\%').replace(/_/g, '\\_');
    const pattern = `%${escapedQ}%`;
    baseConditions.push(
      or(
        sql`LOWER(${workItems.title}) LIKE LOWER(${pattern}) ESCAPE '\\'`,
        sql`LOWER(${workItems.description}) LIKE LOWER(${pattern}) ESCAPE '\\'`,
      )!,
    );
  }

  const baseWhereClause = baseConditions.length > 0 ? and(...baseConditions) : undefined;

  // Compute filterMeta from base conditions
  const metaRow = db
    .select({
      budgetLinesMin: sql<number>`COALESCE(MIN(COALESCE((SELECT COUNT(*) FROM ${workItemBudgets} WHERE ${workItemBudgets.workItemId} = ${workItems.id}), 0)), 0)`,
      budgetLinesMax: sql<number>`COALESCE(MAX(COALESCE((SELECT COUNT(*) FROM ${workItemBudgets} WHERE ${workItemBudgets.workItemId} = ${workItems.id}), 0)), 0)`,
    })
    .from(workItems)
    .where(baseWhereClause)
    .get();

  // Build full conditions with numeric range filters for main query
  const conditions = [...baseConditions];

  // Filter by budget line count
  if (query.budgetLinesMin !== undefined) {
    conditions.push(
      sql`(SELECT COUNT(*) FROM ${workItemBudgets} WHERE ${workItemBudgets.workItemId} = ${workItems.id}) >= ${query.budgetLinesMin}`,
    );
  }
  if (query.budgetLinesMax !== undefined) {
    conditions.push(
      sql`(SELECT COUNT(*) FROM ${workItemBudgets} WHERE ${workItemBudgets.workItemId} = ${workItems.id}) <= ${query.budgetLinesMax}`,
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Count total items
  const countResult = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(workItems)
    .where(whereClause)
    .get();
  const totalItems = countResult?.count ?? 0;
  const totalPages = Math.ceil(totalItems / pageSize);

  // Build ORDER BY
  const sortColumn =
    sortBy === 'title'
      ? workItems.title
      : sortBy === 'status'
        ? workItems.status
        : sortBy === 'start_date'
          ? workItems.startDate
          : sortBy === 'end_date'
            ? workItems.endDate
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

  const items = workItemRows.map((wi) => toWorkItemSummary(db, wi, areaMap));

  const filterMeta: FilterMeta = {
    budgetLines: { min: metaRow?.budgetLinesMin ?? 0, max: metaRow?.budgetLinesMax ?? 0 },
  };

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
