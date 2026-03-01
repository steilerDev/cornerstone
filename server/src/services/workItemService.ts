import { randomUUID } from 'node:crypto';
import { eq, sql, and, or, desc, asc } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import {
  workItems,
  workItemTags,
  tags,
  users,
  workItemSubtasks,
  workItemDependencies,
} from '../db/schema.js';
import { listWorkItemBudgets } from './workItemBudgetService.js';
import { autoReschedule } from './schedulingEngine.js';
import type {
  WorkItemDetail,
  WorkItemSummary,
  UserSummary,
  TagResponse,
  SubtaskResponse,
  DependencyResponse,
  CreateWorkItemRequest,
  UpdateWorkItemRequest,
  WorkItemListQuery,
  PaginationMeta,
  WorkItemBudgetLine,
} from '@cornerstone/shared';
import { NotFoundError, ValidationError } from '../errors/AppError.js';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

/**
 * Convert database user row to UserSummary shape.
 */
function toUserSummary(user: typeof users.$inferSelect | null): UserSummary | null {
  if (!user) return null;
  return {
    id: user.id,
    displayName: user.displayName,
    email: user.email,
  };
}

/**
 * Convert database tag row to TagResponse shape.
 */
function toTagResponse(tag: typeof tags.$inferSelect): TagResponse {
  return {
    id: tag.id,
    name: tag.name,
    color: tag.color,
  };
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
 * Fetch tags for a work item.
 */
function getWorkItemTags(db: DbType, workItemId: string): TagResponse[] {
  const tagRows = db
    .select({ tag: tags })
    .from(workItemTags)
    .innerJoin(tags, eq(tags.id, workItemTags.tagId))
    .where(eq(workItemTags.workItemId, workItemId))
    .all();

  return tagRows.map((row) => toTagResponse(row.tag));
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
 * Convert database work item row to WorkItemSummary shape.
 */
export function toWorkItemSummary(
  db: DbType,
  workItem: typeof workItems.$inferSelect,
): WorkItemSummary {
  const assignedUser = getAssignedUser(db, workItem.assignedUserId);
  const itemTags = getWorkItemTags(db, workItem.id);

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
    tags: itemTags,
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
    workItem: toWorkItemSummary(db, row.workItem),
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
    workItem: toWorkItemSummary(db, row.workItem),
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
): WorkItemDetail {
  const assignedUser = getAssignedUser(db, workItem.assignedUserId);
  const createdByUser = workItem.createdBy
    ? db.select().from(users).where(eq(users.id, workItem.createdBy)).get()
    : null;
  const itemTags = getWorkItemTags(db, workItem.id);
  const subtasks = getWorkItemSubtasks(db, workItem.id);
  const dependencies = getWorkItemDependencies(db, workItem.id);

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
    createdBy: toUserSummary(createdByUser || null),
    tags: itemTags,
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
 * Validate that all tag IDs exist.
 * Throws ValidationError if any tag does not exist.
 */
function validateTagIds(db: DbType, tagIds: string[]): void {
  for (const tagId of tagIds) {
    const tag = db.select().from(tags).where(eq(tags.id, tagId)).get();
    if (!tag) {
      throw new ValidationError(`Tag not found: ${tagId}`);
    }
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
function replaceWorkItemTags(db: DbType, workItemId: string, tagIds: string[]): void {
  // Delete all existing tags
  db.delete(workItemTags).where(eq(workItemTags.workItemId, workItemId)).run();

  // Insert new tags
  if (tagIds.length > 0) {
    const values = tagIds.map((tagId) => ({
      workItemId,
      tagId,
    }));
    db.insert(workItemTags).values(values).run();
  }
}

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

  // Validate tagIds if provided
  if (data.tagIds && data.tagIds.length > 0) {
    validateTagIds(db, data.tagIds);
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
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  // Insert tags if provided
  if (data.tagIds && data.tagIds.length > 0) {
    replaceWorkItemTags(db, id, data.tagIds);
  }

  // Fetch and return the created work item
  const workItem = db.select().from(workItems).where(eq(workItems.id, id)).get();
  return toWorkItemDetail(db, workItem!);
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
  return toWorkItemDetail(db, workItem);
}

/**
 * Update a work item.
 * Throws NotFoundError if work item does not exist.
 */
export function updateWorkItem(
  db: DbType,
  id: string,
  data: UpdateWorkItemRequest,
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
  if ('status' in data && data.status !== workItem.status) {
    const today = new Date().toISOString().slice(0, 10);
    const newStatus = data.status;
    const previousStatus = workItem.status;

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

  // Update tags if provided
  if ('tagIds' in data) {
    const tagIds = data.tagIds ?? [];
    if (tagIds.length > 0) {
      validateTagIds(db, tagIds);
    }
    replaceWorkItemTags(db, id, tagIds);
  }

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
    autoReschedule(db);
  }

  // Fetch and return the updated work item
  const updatedWorkItem = db.select().from(workItems).where(eq(workItems.id, id)).get();
  return toWorkItemDetail(db, updatedWorkItem!);
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

  db.delete(workItems).where(eq(workItems.id, id)).run();
}

/**
 * List work items with filtering, sorting, and pagination.
 */
export function listWorkItems(
  db: DbType,
  query: WorkItemListQuery,
): { items: WorkItemSummary[]; pagination: PaginationMeta } {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 25));
  const sortBy = query.sortBy ?? 'created_at';
  const sortOrder = query.sortOrder ?? 'desc';

  // Build WHERE conditions
  const conditions = [];

  if (query.status) {
    conditions.push(eq(workItems.status, query.status));
  }

  if (query.assignedUserId) {
    conditions.push(eq(workItems.assignedUserId, query.assignedUserId));
  }

  if (query.q) {
    // Escape SQL LIKE wildcards (% and _) in user input
    const escapedQ = query.q.replace(/%/g, '\\%').replace(/_/g, '\\_');
    const pattern = `%${escapedQ}%`;
    conditions.push(
      or(
        sql`LOWER(${workItems.title}) LIKE LOWER(${pattern}) ESCAPE '\\'`,
        sql`LOWER(${workItems.description}) LIKE LOWER(${pattern}) ESCAPE '\\'`,
      )!,
    );
  }

  // Tag filter requires a JOIN
  if (query.tagId) {
    conditions.push(
      sql`${workItems.id} IN (SELECT ${workItemTags.workItemId} FROM ${workItemTags} WHERE ${workItemTags.tagId} = ${query.tagId})`,
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

  const items = workItemRows.map((wi) => toWorkItemSummary(db, wi));

  return {
    items,
    pagination: {
      page,
      pageSize,
      totalItems,
      totalPages,
    },
  };
}
