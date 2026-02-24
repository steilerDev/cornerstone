import { eq, asc, and, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import { milestones, milestoneWorkItems, users, workItems } from '../db/schema.js';
import type {
  MilestoneSummary,
  MilestoneDetail,
  CreateMilestoneRequest,
  UpdateMilestoneRequest,
  MilestoneListResponse,
  MilestoneWorkItemLinkResponse,
  UserSummary,
  WorkItemSummary,
} from '@cornerstone/shared';
import { NotFoundError, ValidationError, ConflictError } from '../errors/AppError.js';
import { toWorkItemSummary } from './workItemService.js';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

/** Regex for hex color validation: #RRGGBB */
const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

/** ISO 8601 date: YYYY-MM-DD */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Convert a database user row to UserSummary shape.
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
 * Fetch linked work items for a milestone.
 */
function getLinkedWorkItems(db: DbType, milestoneId: number): WorkItemSummary[] {
  const rows = db
    .select({ workItem: workItems })
    .from(milestoneWorkItems)
    .innerJoin(workItems, eq(workItems.id, milestoneWorkItems.workItemId))
    .where(eq(milestoneWorkItems.milestoneId, milestoneId))
    .all();

  return rows.map((row) => toWorkItemSummary(db, row.workItem));
}

/**
 * Count linked work items for a milestone.
 */
function countLinkedWorkItems(db: DbType, milestoneId: number): number {
  const result = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(milestoneWorkItems)
    .where(eq(milestoneWorkItems.milestoneId, milestoneId))
    .get();
  return result?.count ?? 0;
}

/**
 * Fetch the createdBy user for a milestone.
 */
function getCreatedByUser(db: DbType, createdBy: string | null): UserSummary | null {
  if (!createdBy) return null;
  const user = db.select().from(users).where(eq(users.id, createdBy)).get();
  return toUserSummary(user ?? null);
}

/**
 * Convert a database milestone row to MilestoneSummary shape.
 */
function toMilestoneSummary(
  db: DbType,
  milestone: typeof milestones.$inferSelect,
): MilestoneSummary {
  return {
    id: milestone.id,
    title: milestone.title,
    description: milestone.description,
    targetDate: milestone.targetDate,
    isCompleted: milestone.isCompleted,
    completedAt: milestone.completedAt,
    color: milestone.color,
    workItemCount: countLinkedWorkItems(db, milestone.id),
    createdBy: getCreatedByUser(db, milestone.createdBy),
    createdAt: milestone.createdAt,
    updatedAt: milestone.updatedAt,
  };
}

/**
 * Convert a database milestone row to MilestoneDetail shape (includes work items).
 */
function toMilestoneDetail(db: DbType, milestone: typeof milestones.$inferSelect): MilestoneDetail {
  return {
    id: milestone.id,
    title: milestone.title,
    description: milestone.description,
    targetDate: milestone.targetDate,
    isCompleted: milestone.isCompleted,
    completedAt: milestone.completedAt,
    color: milestone.color,
    workItems: getLinkedWorkItems(db, milestone.id),
    createdBy: getCreatedByUser(db, milestone.createdBy),
    createdAt: milestone.createdAt,
    updatedAt: milestone.updatedAt,
  };
}

/**
 * Validate a color value. Must match /^#[0-9A-Fa-f]{6}$/ or be null/undefined.
 */
function validateColor(color: string | null | undefined, fieldContext: string): void {
  if (color !== null && color !== undefined && !HEX_COLOR_RE.test(color)) {
    throw new ValidationError(`${fieldContext} must be a valid hex color (e.g. #EF4444)`);
  }
}

/**
 * Validate a date value. Must match YYYY-MM-DD.
 */
function validateDate(date: string | undefined, fieldContext: string): void {
  if (date !== undefined && !DATE_RE.test(date)) {
    throw new ValidationError(`${fieldContext} must be an ISO 8601 date (YYYY-MM-DD)`);
  }
}

/**
 * Get all milestones sorted by target_date ascending.
 */
export function getAllMilestones(db: DbType): MilestoneListResponse {
  const rows = db.select().from(milestones).orderBy(asc(milestones.targetDate)).all();
  return {
    milestones: rows.map((m) => toMilestoneSummary(db, m)),
  };
}

/**
 * Get a single milestone with its linked work items.
 * @throws NotFoundError if milestone does not exist
 */
export function getMilestoneById(db: DbType, id: number): MilestoneDetail {
  const milestone = db.select().from(milestones).where(eq(milestones.id, id)).get();
  if (!milestone) {
    throw new NotFoundError('Milestone not found');
  }
  return toMilestoneDetail(db, milestone);
}

/**
 * Create a new milestone.
 * @throws ValidationError if required fields are missing or invalid
 */
export function createMilestone(
  db: DbType,
  data: CreateMilestoneRequest,
  userId: string,
): MilestoneDetail {
  // Validate required fields
  if (!data.title || data.title.trim().length === 0) {
    throw new ValidationError('Title is required');
  }
  if (data.title.trim().length > 200) {
    throw new ValidationError('Title must be 200 characters or fewer');
  }
  if (!data.targetDate) {
    throw new ValidationError('targetDate is required');
  }
  validateDate(data.targetDate, 'targetDate');

  // Validate optional fields
  if (data.description !== undefined && data.description !== null) {
    if (data.description.length > 2000) {
      throw new ValidationError('Description must be 2000 characters or fewer');
    }
  }
  validateColor(data.color, 'color');

  const now = new Date().toISOString();

  const result = db
    .insert(milestones)
    .values({
      title: data.title.trim(),
      description: data.description ?? null,
      targetDate: data.targetDate,
      isCompleted: false,
      completedAt: null,
      color: data.color ?? null,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: milestones.id })
    .get();

  const milestone = db.select().from(milestones).where(eq(milestones.id, result.id)).get()!;
  return toMilestoneDetail(db, milestone);
}

/**
 * Update a milestone.
 * When isCompleted transitions to true, completedAt is set to now.
 * When isCompleted transitions to false, completedAt is cleared to null.
 * @throws NotFoundError if milestone does not exist
 * @throws ValidationError if no fields provided or fields are invalid
 */
export function updateMilestone(
  db: DbType,
  id: number,
  data: UpdateMilestoneRequest,
): MilestoneDetail {
  if (Object.keys(data).length === 0) {
    throw new ValidationError('At least one field must be provided');
  }

  const milestone = db.select().from(milestones).where(eq(milestones.id, id)).get();
  if (!milestone) {
    throw new NotFoundError('Milestone not found');
  }

  const updateData: Partial<typeof milestones.$inferInsert> = {};

  if ('title' in data) {
    if (!data.title || data.title.trim().length === 0) {
      throw new ValidationError('Title cannot be empty');
    }
    if (data.title.trim().length > 200) {
      throw new ValidationError('Title must be 200 characters or fewer');
    }
    updateData.title = data.title.trim();
  }

  if ('description' in data) {
    if (data.description !== null && data.description !== undefined) {
      if (data.description.length > 2000) {
        throw new ValidationError('Description must be 2000 characters or fewer');
      }
    }
    updateData.description = data.description ?? null;
  }

  if ('targetDate' in data) {
    validateDate(data.targetDate, 'targetDate');
    updateData.targetDate = data.targetDate;
  }

  if ('isCompleted' in data) {
    updateData.isCompleted = data.isCompleted ?? false;
    if (data.isCompleted === true) {
      updateData.completedAt = new Date().toISOString();
    } else if (data.isCompleted === false) {
      updateData.completedAt = null;
    }
  }

  if ('color' in data) {
    validateColor(data.color, 'color');
    updateData.color = data.color ?? null;
  }

  updateData.updatedAt = new Date().toISOString();

  db.update(milestones).set(updateData).where(eq(milestones.id, id)).run();

  const updated = db.select().from(milestones).where(eq(milestones.id, id)).get()!;
  return toMilestoneDetail(db, updated);
}

/**
 * Delete a milestone. Cascades to milestone-work-item associations.
 * @throws NotFoundError if milestone does not exist
 */
export function deleteMilestone(db: DbType, id: number): void {
  const milestone = db.select().from(milestones).where(eq(milestones.id, id)).get();
  if (!milestone) {
    throw new NotFoundError('Milestone not found');
  }
  db.delete(milestones).where(eq(milestones.id, id)).run();
}

/**
 * Link a work item to a milestone.
 * @throws NotFoundError if milestone or work item does not exist
 * @throws ConflictError if the work item is already linked to this milestone
 */
export function linkWorkItem(
  db: DbType,
  milestoneId: number,
  workItemId: string,
): MilestoneWorkItemLinkResponse {
  // Verify milestone exists
  const milestone = db.select().from(milestones).where(eq(milestones.id, milestoneId)).get();
  if (!milestone) {
    throw new NotFoundError('Milestone not found');
  }

  // Verify work item exists
  const workItem = db.select().from(workItems).where(eq(workItems.id, workItemId)).get();
  if (!workItem) {
    throw new NotFoundError('Work item not found');
  }

  // Check for duplicate link
  const existing = db
    .select()
    .from(milestoneWorkItems)
    .where(
      and(
        eq(milestoneWorkItems.milestoneId, milestoneId),
        eq(milestoneWorkItems.workItemId, workItemId),
      ),
    )
    .get();

  if (existing) {
    throw new ConflictError('Work item is already linked to this milestone');
  }

  db.insert(milestoneWorkItems).values({ milestoneId, workItemId }).run();

  return { milestoneId, workItemId };
}

/**
 * Unlink a work item from a milestone.
 * @throws NotFoundError if milestone, work item, or the link does not exist
 */
export function unlinkWorkItem(db: DbType, milestoneId: number, workItemId: string): void {
  // Verify milestone exists
  const milestone = db.select().from(milestones).where(eq(milestones.id, milestoneId)).get();
  if (!milestone) {
    throw new NotFoundError('Milestone not found');
  }

  // Verify work item exists
  const workItem = db.select().from(workItems).where(eq(workItems.id, workItemId)).get();
  if (!workItem) {
    throw new NotFoundError('Work item not found');
  }

  // Verify the link exists
  const link = db
    .select()
    .from(milestoneWorkItems)
    .where(
      and(
        eq(milestoneWorkItems.milestoneId, milestoneId),
        eq(milestoneWorkItems.workItemId, workItemId),
      ),
    )
    .get();

  if (!link) {
    throw new NotFoundError('Work item is not linked to this milestone');
  }

  db.delete(milestoneWorkItems)
    .where(
      and(
        eq(milestoneWorkItems.milestoneId, milestoneId),
        eq(milestoneWorkItems.workItemId, workItemId),
      ),
    )
    .run();
}
