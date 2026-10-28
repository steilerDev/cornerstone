import { eq, asc, and, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import {
  milestones,
  milestoneWorkItems,
  workItemMilestoneDeps,
  users,
  workItems,
  householdItemDeps,
} from '../db/schema.js';
import type {
  MilestoneSummary,
  MilestoneDetail,
  WorkItemDependentSummary,
  CreateMilestoneRequest,
  UpdateMilestoneRequest,
  MilestoneListRowsResponse,
  AttentionHoldsUp,
  MilestoneWorkItemLinkResponse,
  UserSummary,
  WorkItemSummary,
} from '@cornerstone/shared';
import {
  NotFoundError,
  ValidationError,
  DuplicateDependencyError,
  CircularDependencyError,
} from '../errors/AppError.js';
import {
  deleteMilestoneDepRow,
  deleteMilestoneLinkRow,
  type DeletedMilestoneDepSnapshot,
  type DeletedMilestoneLinkSnapshot,
} from './workItemMilestoneService.js';
import { toWorkItemSummary } from './workItemService.js';
import {
  autoReschedule,
  computeScheduleProjection,
  loadScheduleGraph,
  projectSchedule,
  todayUtc,
  MILESTONE_NODE_PREFIX,
} from './schedulingEngine.js';
import { buildScheduleIndex, computeHoldsUp } from './shared/holdsUp.js';
import type { ScheduleProjection } from './schedulingEngine.js';
import { loadAreaMap } from './areaService.js';
import type { AreaMapEntry } from './areaService.js';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

/** Regex for hex color validation: #RRGGBB */
const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

/** ISO 8601 date: YYYY-MM-DD */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Convert a database user row to UserSummary shape.
 */
function toUserSummary(user: typeof users.$inferSelect): UserSummary {
  return {
    id: user.id,
    displayName: user.displayName,
    email: user.email,
  };
}

/**
 * Fetch linked work items for a milestone.
 */
function getLinkedWorkItems(
  db: DbType,
  milestoneId: number,
  areaMap: Map<string, AreaMapEntry>,
  projection: ScheduleProjection,
): WorkItemSummary[] {
  const rows = db
    .select({ workItem: workItems })
    .from(milestoneWorkItems)
    .innerJoin(workItems, eq(workItems.id, milestoneWorkItems.workItemId))
    .where(eq(milestoneWorkItems.milestoneId, milestoneId))
    .all();

  return rows.map((row) => toWorkItemSummary(db, row.workItem, areaMap, projection));
}

/**
 * Fetch work items that depend on this milestone (required milestone deps).
 * EPIC-06 UAT Fix 4: Bidirectional milestone-work item dependency tracking.
 */
function getWorkItemsWithDep(db: DbType, milestoneId: number): WorkItemDependentSummary[] {
  const rows = db
    .select({ workItem: workItems })
    .from(workItemMilestoneDeps)
    .innerJoin(workItems, eq(workItems.id, workItemMilestoneDeps.workItemId))
    .where(eq(workItemMilestoneDeps.milestoneId, milestoneId))
    .all();

  return rows.map((row) => ({
    id: row.workItem.id,
    title: row.workItem.title,
  }));
}

/**
 * Fetch dependent work items for a milestone (public service function).
 * Returns work items that depend on this milestone completing before they can start.
 * EPIC-06 UAT Fix 4.
 *
 * @throws NotFoundError if milestone does not exist
 */
export function getDependentWorkItems(db: DbType, milestoneId: number): WorkItemDependentSummary[] {
  const milestone = db.select().from(milestones).where(eq(milestones.id, milestoneId)).get();
  if (!milestone) {
    throw new NotFoundError('Milestone not found');
  }
  return getWorkItemsWithDep(db, milestoneId);
}

/**
 * Count linked work items for a milestone.
 */
function countLinkedWorkItems(db: DbType, milestoneId: number): number {
  const result = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(milestoneWorkItems)
    .where(eq(milestoneWorkItems.milestoneId, milestoneId))
    .get()!; // an aggregate select always returns one row
  return result.count;
}

/**
 * Count dependent work items for a milestone (work items that require the milestone).
 */
function countDependentWorkItems(db: DbType, milestoneId: number): number {
  const result = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(workItemMilestoneDeps)
    .where(eq(workItemMilestoneDeps.milestoneId, milestoneId))
    .get()!; // an aggregate select always returns one row
  return result.count;
}

/**
 * Fetch the createdBy user for a milestone.
 */
function getCreatedByUser(db: DbType, createdBy: string | null): UserSummary | null {
  if (!createdBy) return null;
  // created_by is a foreign key (ON DELETE SET NULL), so a non-null id always has a user row
  const user = db.select().from(users).where(eq(users.id, createdBy)).get()!;
  return toUserSummary(user);
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
    dependentWorkItemCount: countDependentWorkItems(db, milestone.id),
    createdBy: getCreatedByUser(db, milestone.createdBy),
    createdAt: milestone.createdAt,
    updatedAt: milestone.updatedAt,
  };
}

/**
 * Convert a database milestone row to MilestoneDetail shape (includes work items).
 */
function toMilestoneDetail(
  db: DbType,
  milestone: typeof milestones.$inferSelect,
  areaMap: Map<string, AreaMapEntry>,
): MilestoneDetail {
  return {
    id: milestone.id,
    title: milestone.title,
    description: milestone.description,
    targetDate: milestone.targetDate,
    isCompleted: milestone.isCompleted,
    completedAt: milestone.completedAt,
    color: milestone.color,
    workItems: getLinkedWorkItems(db, milestone.id, areaMap, computeScheduleProjection(db)),
    dependentWorkItems: getWorkItemsWithDep(db, milestone.id),
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
 * Get all milestones sorted by target_date ascending, each with its projected date and the
 * count of work held up (one schedule projection per request).
 */
export function getAllMilestones(db: DbType): MilestoneListRowsResponse {
  const rows = db.select().from(milestones).orderBy(asc(milestones.targetDate)).all();
  const today = todayUtc();
  const graph = loadScheduleGraph(db);
  const projection = projectSchedule(graph, today);
  const index = buildScheduleIndex(graph);
  return {
    milestones: rows.map((m) => {
      let holdsUp: AttentionHoldsUp | null = null;
      if (!m.isCompleted) {
        const { count, startingWithin14Days } = computeHoldsUp(
          index,
          `${MILESTONE_NODE_PREFIX}${m.id}`,
          { today, projection },
        );
        if (count > 0) holdsUp = { count, startingWithin14Days };
      }
      return {
        ...toMilestoneSummary(db, m),
        // The projection holds every milestone row (it is built from the same request's graph)
        projectedDate: projection.milestones.get(m.id)!.projectedDate,
        holdsUp,
      };
    }),
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
  const areaMap = loadAreaMap(db);
  return toMilestoneDetail(db, milestone, areaMap);
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

  const result = db.transaction(() => {
    const inserted = db
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

    // Link work items if provided
    if (data.workItemIds && data.workItemIds.length > 0) {
      for (const workItemId of data.workItemIds) {
        // Verify work item exists before linking (skip silently if not found)
        const workItem = db.select().from(workItems).where(eq(workItems.id, workItemId)).get();
        if (workItem) {
          db.insert(milestoneWorkItems).values({ milestoneId: inserted.id, workItemId }).run();
        }
      }
    }

    return inserted;
  });

  const milestone = db.select().from(milestones).where(eq(milestones.id, result.id)).get()!;
  const areaMap = loadAreaMap(db);
  return toMilestoneDetail(db, milestone, areaMap);
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
      // Use user-provided completedAt if present, otherwise auto-set to now
      if ('completedAt' in data && data.completedAt) {
        updateData.completedAt = data.completedAt;
      } else {
        updateData.completedAt = new Date().toISOString();
      }
    } else if (data.isCompleted === false) {
      updateData.completedAt = null;
    }
  } else if ('completedAt' in data) {
    // Allow updating completedAt independently (only if already completed)
    updateData.completedAt = data.completedAt ?? null;
  }

  if ('color' in data) {
    validateColor(data.color, 'color');
    updateData.color = data.color ?? null;
  }

  updateData.updatedAt = new Date().toISOString();

  db.update(milestones).set(updateData).where(eq(milestones.id, id)).run();

  const updated = db.select().from(milestones).where(eq(milestones.id, id)).get()!;
  const areaMap = loadAreaMap(db);
  return toMilestoneDetail(db, updated, areaMap);
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

  db.transaction(() => {
    // Cascade delete household item dependencies where this milestone is the predecessor
    db.delete(householdItemDeps)
      .where(
        and(
          eq(householdItemDeps.predecessorType, 'milestone'),
          eq(householdItemDeps.predecessorId, id.toString()),
        ),
      )
      .run();

    db.delete(milestones).where(eq(milestones.id, id)).run();
  });
}

/**
 * Link a work item to a milestone.
 * @throws NotFoundError if milestone or work item does not exist
 * @throws DuplicateDependencyError if the work item is already linked to this milestone
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
    throw new DuplicateDependencyError('Work item is already linked to this milestone');
  }

  // Cross-validate: cannot contribute to a milestone that the work item already depends on
  const crossDep = db
    .select()
    .from(workItemMilestoneDeps)
    .where(
      and(
        eq(workItemMilestoneDeps.workItemId, workItemId),
        eq(workItemMilestoneDeps.milestoneId, milestoneId),
      ),
    )
    .get();

  if (crossDep) {
    throw new CircularDependencyError(
      'Cannot contribute to milestone that this work item depends on',
    );
  }

  db.insert(milestoneWorkItems).values({ milestoneId, workItemId }).run();

  autoReschedule(db);

  return { milestoneId, workItemId };
}

/**
 * Unlink a work item from a milestone and return the deleted row.
 * The route reschedules after issuing the Undo token.
 * @throws NotFoundError if milestone, work item, or the link does not exist
 */
export function unlinkWorkItemWithSnapshot(
  db: DbType,
  milestoneId: number,
  workItemId: string,
): DeletedMilestoneLinkSnapshot {
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

  const snapshot = deleteMilestoneLinkRow(
    db,
    milestoneId,
    workItemId,
    'Work item is not linked to this milestone',
  );

  return snapshot;
}

/**
 * Add a dependent work item to a milestone (from the milestone side).
 * The work item will depend on this milestone completing before it can start.
 * Cross-validates that the work item is not already a contributor to this milestone.
 *
 * @throws NotFoundError if milestone or work item does not exist
 * @throws DuplicateDependencyError if already a dependent, CircularDependencyError if already a contributor
 */
export function addDependentWorkItem(
  db: DbType,
  milestoneId: number,
  workItemId: string,
): WorkItemDependentSummary[] {
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

  // Check for duplicate dependency
  const existing = db
    .select()
    .from(workItemMilestoneDeps)
    .where(
      and(
        eq(workItemMilestoneDeps.workItemId, workItemId),
        eq(workItemMilestoneDeps.milestoneId, milestoneId),
      ),
    )
    .get();

  if (existing) {
    throw new DuplicateDependencyError('Work item already depends on this milestone');
  }

  // Cross-validate: cannot require a milestone that the work item already contributes to
  const crossLink = db
    .select()
    .from(milestoneWorkItems)
    .where(
      and(
        eq(milestoneWorkItems.milestoneId, milestoneId),
        eq(milestoneWorkItems.workItemId, workItemId),
      ),
    )
    .get();

  if (crossLink) {
    throw new CircularDependencyError(
      'Cannot require milestone that this work item contributes to',
    );
  }

  db.insert(workItemMilestoneDeps).values({ workItemId, milestoneId }).run();

  autoReschedule(db);

  return getWorkItemsWithDep(db, milestoneId);
}

/**
 * Remove a dependent work item from a milestone (from the milestone side).
 *
 * @throws NotFoundError if milestone, work item, or the dependency does not exist
 */
export function removeDependentWorkItemWithSnapshot(
  db: DbType,
  milestoneId: number,
  workItemId: string,
): DeletedMilestoneDepSnapshot {
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

  const snapshot = deleteMilestoneDepRow(
    db,
    milestoneId,
    workItemId,
    'Work item does not depend on this milestone',
  );

  return snapshot;
}
