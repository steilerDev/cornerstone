import { randomUUID } from 'node:crypto';
import { eq, asc, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import { workItemSubtasks, workItems } from '../db/schema.js';
import type {
  SubtaskResponse,
  CreateSubtaskRequest,
  UpdateSubtaskRequest,
  ReorderSubtasksRequest,
} from '@cornerstone/shared';
import { NotFoundError, ValidationError } from '../errors/AppError.js';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

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
 * Verify a work item exists.
 * @throws NotFoundError if work item does not exist
 */
function ensureWorkItemExists(db: DbType, workItemId: string): void {
  const workItem = db.select().from(workItems).where(eq(workItems.id, workItemId)).get();
  if (!workItem) {
    throw new NotFoundError('Work item not found');
  }
}

/**
 * Get the next sort order for a new subtask (appends to end).
 */
function getNextSortOrder(db: DbType, workItemId: string): number {
  const result = db
    .select({ maxOrder: sql<number>`COALESCE(MAX(${workItemSubtasks.sortOrder}), -1)` })
    .from(workItemSubtasks)
    .where(eq(workItemSubtasks.workItemId, workItemId))
    .get();

  return (result?.maxOrder ?? -1) + 1;
}

/**
 * Create a new subtask on a work item.
 * If sortOrder is not provided, appends to the end.
 * @throws NotFoundError if work item does not exist
 * @throws ValidationError if title is empty
 */
export function createSubtask(
  db: DbType,
  workItemId: string,
  data: CreateSubtaskRequest,
): SubtaskResponse {
  // Ensure work item exists
  ensureWorkItemExists(db, workItemId);

  // Validate title
  const trimmedTitle = data.title.trim();
  if (trimmedTitle.length === 0) {
    throw new ValidationError('Subtask title cannot be empty');
  }

  // Determine sort order
  const sortOrder =
    data.sortOrder !== undefined ? data.sortOrder : getNextSortOrder(db, workItemId);

  // Create subtask
  const id = randomUUID();
  const now = new Date().toISOString();

  db.insert(workItemSubtasks)
    .values({
      id,
      workItemId,
      title: trimmedTitle,
      isCompleted: false,
      sortOrder,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  return {
    id,
    title: trimmedTitle,
    isCompleted: false,
    sortOrder,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * List all subtasks for a work item, sorted by sort_order ASC.
 * @throws NotFoundError if work item does not exist
 */
export function listSubtasks(db: DbType, workItemId: string): SubtaskResponse[] {
  // Ensure work item exists
  ensureWorkItemExists(db, workItemId);

  // Fetch subtasks
  const subtaskRows = db
    .select()
    .from(workItemSubtasks)
    .where(eq(workItemSubtasks.workItemId, workItemId))
    .orderBy(asc(workItemSubtasks.sortOrder))
    .all();

  return subtaskRows.map(toSubtaskResponse);
}

/**
 * Update a subtask's title, isCompleted, and/or sortOrder.
 * @throws NotFoundError if work item or subtask does not exist
 * @throws ValidationError if no fields provided or title is empty
 */
export function updateSubtask(
  db: DbType,
  workItemId: string,
  subtaskId: string,
  data: UpdateSubtaskRequest,
): SubtaskResponse {
  // Ensure work item exists
  ensureWorkItemExists(db, workItemId);

  // Fetch subtask
  const subtask = db
    .select()
    .from(workItemSubtasks)
    .where(eq(workItemSubtasks.id, subtaskId))
    .get();

  if (!subtask) {
    throw new NotFoundError('Subtask not found');
  }

  // Verify subtask belongs to this work item
  if (subtask.workItemId !== workItemId) {
    throw new NotFoundError('Subtask not found');
  }

  // Validate at least one field provided
  if (data.title === undefined && data.isCompleted === undefined && data.sortOrder === undefined) {
    throw new ValidationError('At least one field must be provided');
  }

  // Build update object
  const updates: Partial<typeof workItemSubtasks.$inferInsert> = {
    updatedAt: new Date().toISOString(),
  };

  // Validate and add title if provided
  if (data.title !== undefined) {
    const trimmedTitle = data.title.trim();
    if (trimmedTitle.length === 0) {
      throw new ValidationError('Subtask title cannot be empty');
    }
    updates.title = trimmedTitle;
  }

  // Add isCompleted if provided
  if (data.isCompleted !== undefined) {
    updates.isCompleted = data.isCompleted;
  }

  // Add sortOrder if provided
  if (data.sortOrder !== undefined) {
    updates.sortOrder = data.sortOrder;
  }

  // Perform update
  db.update(workItemSubtasks).set(updates).where(eq(workItemSubtasks.id, subtaskId)).run();

  // Fetch and return updated subtask
  const updated = db
    .select()
    .from(workItemSubtasks)
    .where(eq(workItemSubtasks.id, subtaskId))
    .get();

  return toSubtaskResponse(updated!);
}

/**
 * Delete a subtask.
 * @throws NotFoundError if work item or subtask does not exist
 */
export function deleteSubtask(db: DbType, workItemId: string, subtaskId: string): void {
  // Ensure work item exists
  ensureWorkItemExists(db, workItemId);

  // Fetch subtask
  const subtask = db
    .select()
    .from(workItemSubtasks)
    .where(eq(workItemSubtasks.id, subtaskId))
    .get();

  if (!subtask) {
    throw new NotFoundError('Subtask not found');
  }

  // Verify subtask belongs to this work item
  if (subtask.workItemId !== workItemId) {
    throw new NotFoundError('Subtask not found');
  }

  // Delete subtask
  db.delete(workItemSubtasks).where(eq(workItemSubtasks.id, subtaskId)).run();
}

/**
 * Reorder subtasks by updating their sort_order to match the provided array order.
 * @throws NotFoundError if work item does not exist
 * @throws ValidationError if subtaskIds array is empty or contains invalid IDs
 */
export function reorderSubtasks(
  db: DbType,
  workItemId: string,
  data: ReorderSubtasksRequest,
): SubtaskResponse[] {
  // Ensure work item exists
  ensureWorkItemExists(db, workItemId);

  // Validate subtaskIds array
  if (!Array.isArray(data.subtaskIds) || data.subtaskIds.length === 0) {
    throw new ValidationError('subtaskIds must be a non-empty array');
  }

  // Fetch all subtasks for this work item
  const existingSubtasks = db
    .select()
    .from(workItemSubtasks)
    .where(eq(workItemSubtasks.workItemId, workItemId))
    .all();

  // Verify all subtask IDs are provided (API contract requirement)
  if (data.subtaskIds.length !== existingSubtasks.length) {
    throw new ValidationError('All subtask IDs must be provided for reorder');
  }

  // Verify all provided IDs belong to this work item
  const existingIds = new Set(existingSubtasks.map((s) => s.id));
  const invalidIds = data.subtaskIds.filter((id) => !existingIds.has(id));

  if (invalidIds.length > 0) {
    throw new ValidationError('Some subtask IDs do not belong to this work item');
  }

  // Update sort_order for each subtask
  const now = new Date().toISOString();
  data.subtaskIds.forEach((subtaskId, index) => {
    db.update(workItemSubtasks)
      .set({
        sortOrder: index,
        updatedAt: now,
      })
      .where(eq(workItemSubtasks.id, subtaskId))
      .run();
  });

  // Return updated subtasks in new order
  return listSubtasks(db, workItemId);
}
