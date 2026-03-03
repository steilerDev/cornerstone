/**
 * Household item dependency service — CRUD and circular dependency detection.
 *
 * EPIC-09: Story 9.1 — Household Item Timeline Dependencies
 *
 * Manages dependencies between household items and work items/milestones.
 * Household items depend on work items or milestones; HIs are terminal nodes (no successors).
 */

import { eq, and } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import { householdItemDeps, householdItems, workItems, milestones, users } from '../db/schema.js';
import type {
  HouseholdItemDepDetail,
  HouseholdItemDepPredecessorSummary,
  CreateHouseholdItemDepRequest,
  WorkItemLinkedHouseholdItemSummary,
  HouseholdItemCategory,
  HouseholdItemStatus,
} from '@cornerstone/shared';
import { NotFoundError, ValidationError, ConflictError } from '../errors/AppError.js';
import { autoReschedule } from './schedulingEngine.js';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

/**
 * Verify a household item exists.
 * @throws NotFoundError if household item does not exist
 */
function ensureHouseholdItemExists(db: DbType, householdItemId: string): void {
  const item = db.select().from(householdItems).where(eq(householdItems.id, householdItemId)).get();
  if (!item) {
    throw new NotFoundError('Household item not found');
  }
}

/**
 * Verify a work item exists.
 * @throws NotFoundError if work item does not exist
 */
function ensureWorkItemExists(db: DbType, workItemId: string): void {
  const item = db.select().from(workItems).where(eq(workItems.id, workItemId)).get();
  if (!item) {
    throw new NotFoundError('Work item not found');
  }
}

/**
 * Verify a milestone exists.
 * @throws NotFoundError if milestone does not exist
 */
function ensureMilestoneExists(db: DbType, milestoneId: string): void {
  const milestone = db
    .select()
    .from(milestones)
    .where(eq(milestones.id, parseInt(milestoneId, 10)))
    .get();
  if (!milestone) {
    throw new NotFoundError('Milestone not found');
  }
}

/**
 * Get predecessor summary for a work item.
 */
function getWorkItemPredecessor(
  db: DbType,
  workItemId: string,
): HouseholdItemDepPredecessorSummary {
  const item = db.select().from(workItems).where(eq(workItems.id, workItemId)).get();
  if (!item) {
    throw new NotFoundError('Work item not found');
  }
  return {
    id: item.id,
    title: item.title,
    status: item.status,
    endDate: item.endDate,
  };
}

/**
 * Get predecessor summary for a milestone.
 */
function getMilestonePredecessor(
  db: DbType,
  milestoneId: string,
): HouseholdItemDepPredecessorSummary {
  const milestone = db
    .select()
    .from(milestones)
    .where(eq(milestones.id, parseInt(milestoneId, 10)))
    .get();
  if (!milestone) {
    throw new NotFoundError('Milestone not found');
  }
  return {
    id: milestone.id.toString(),
    title: milestone.title,
    status: null, // Milestones don't have a status field
    endDate: milestone.targetDate,
  };
}

/**
 * Detect circular dependencies.
 * Household items are terminal nodes in the dependency graph — they can depend
 * on work items and milestones, but nothing depends on them. Therefore, cycles
 * are impossible by construction.
 *
 * @returns false (cycles are impossible)
 */
function detectCycle(
  db: DbType,
  householdItemId: string,
  predecessorId: string,
  predecessorType: 'work_item' | 'milestone',
): boolean {
  // Household items are terminal nodes in the dependency graph — they can depend
  // on work items and milestones, but nothing depends on them. Cycles are
  // impossible by construction.
  return false;
}

/**
 * List all dependencies for a household item (with predecessor details).
 * @throws NotFoundError if household item does not exist
 */
export function listDeps(db: DbType, householdItemId: string): HouseholdItemDepDetail[] {
  ensureHouseholdItemExists(db, householdItemId);

  const rows = db
    .select()
    .from(householdItemDeps)
    .where(eq(householdItemDeps.householdItemId, householdItemId))
    .all();

  return rows.map((row) => {
    const predecessor =
      row.predecessorType === 'work_item'
        ? getWorkItemPredecessor(db, row.predecessorId)
        : getMilestonePredecessor(db, row.predecessorId);

    return {
      householdItemId: row.householdItemId,
      predecessorType: row.predecessorType as 'work_item' | 'milestone',
      predecessorId: row.predecessorId,
      dependencyType: row.dependencyType as
        | 'finish_to_start'
        | 'start_to_start'
        | 'finish_to_finish'
        | 'start_to_finish',
      leadLagDays: row.leadLagDays,
      predecessor,
    };
  });
}

/**
 * Create a dependency for a household item.
 * @throws NotFoundError if household item or predecessor does not exist
 * @throws ConflictError if dependency already exists (DUPLICATE_DEPENDENCY)
 * @throws ConflictError if circular dependency would be created (CIRCULAR_DEPENDENCY)
 */
export function createDep(
  db: DbType,
  householdItemId: string,
  data: CreateHouseholdItemDepRequest,
): HouseholdItemDepDetail {
  const {
    predecessorType,
    predecessorId,
    dependencyType = 'finish_to_start',
    leadLagDays = 0,
  } = data;

  // Validate household item exists
  ensureHouseholdItemExists(db, householdItemId);

  // Validate predecessor exists
  if (predecessorType === 'work_item') {
    ensureWorkItemExists(db, predecessorId);
  } else if (predecessorType === 'milestone') {
    ensureMilestoneExists(db, predecessorId);
  } else {
    throw new ValidationError('Invalid predecessor type');
  }

  // Check for duplicate dependency
  const existing = db
    .select()
    .from(householdItemDeps)
    .where(
      and(
        eq(householdItemDeps.householdItemId, householdItemId),
        eq(householdItemDeps.predecessorType, predecessorType),
        eq(householdItemDeps.predecessorId, predecessorId),
      ),
    )
    .get();

  if (existing) {
    throw new ConflictError('Dependency already exists', { code: 'DUPLICATE_DEPENDENCY' });
  }

  // Perform circular dependency detection
  if (detectCycle(db, householdItemId, predecessorId, predecessorType)) {
    throw new ConflictError('Circular dependency detected', { code: 'CIRCULAR_DEPENDENCY' });
  }

  // Create dependency
  db.insert(householdItemDeps)
    .values({
      householdItemId,
      predecessorType,
      predecessorId,
      dependencyType,
      leadLagDays,
    })
    .run();

  autoReschedule(db);

  // Fetch and return the created dependency with predecessor details
  const predecessor =
    predecessorType === 'work_item'
      ? getWorkItemPredecessor(db, predecessorId)
      : getMilestonePredecessor(db, predecessorId);

  return {
    householdItemId,
    predecessorType,
    predecessorId,
    dependencyType: dependencyType as
      | 'finish_to_start'
      | 'start_to_start'
      | 'finish_to_finish'
      | 'start_to_finish',
    leadLagDays,
    predecessor,
  };
}

/**
 * Delete a dependency for a household item.
 * @throws NotFoundError if household item or dependency does not exist
 */
export function deleteDep(
  db: DbType,
  householdItemId: string,
  predecessorType: string,
  predecessorId: string,
): void {
  ensureHouseholdItemExists(db, householdItemId);

  // Cast predecessorType to the proper enum type
  const predType = predecessorType as 'work_item' | 'milestone';

  // Check if dependency exists
  const dependency = db
    .select()
    .from(householdItemDeps)
    .where(
      and(
        eq(householdItemDeps.householdItemId, householdItemId),
        eq(householdItemDeps.predecessorType, predType),
        eq(householdItemDeps.predecessorId, predecessorId),
      ),
    )
    .get();

  if (!dependency) {
    throw new NotFoundError('Dependency not found');
  }

  // Delete the dependency
  db.delete(householdItemDeps)
    .where(
      and(
        eq(householdItemDeps.householdItemId, householdItemId),
        eq(householdItemDeps.predecessorType, predType),
        eq(householdItemDeps.predecessorId, predecessorId),
      ),
    )
    .run();

  autoReschedule(db);
}

/**
 * List all household items that depend on a work item (for WorkItemDetailPage reverse view).
 * Returns household items with delivery date information.
 */
export function listDependentHouseholdItemsForWorkItem(
  db: DbType,
  workItemId: string,
): WorkItemLinkedHouseholdItemSummary[] {
  const rows = db
    .select({ householdItem: householdItems })
    .from(householdItemDeps)
    .innerJoin(householdItems, eq(householdItems.id, householdItemDeps.householdItemId))
    .where(
      and(
        eq(householdItemDeps.predecessorType, 'work_item'),
        eq(householdItemDeps.predecessorId, workItemId),
      ),
    )
    .all();

  return rows.map((row) => ({
    id: row.householdItem.id,
    name: row.householdItem.name,
    category: row.householdItem.category as HouseholdItemCategory,
    status: row.householdItem.status as HouseholdItemStatus,
    expectedDeliveryDate: row.householdItem.expectedDeliveryDate,
    earliestDeliveryDate: row.householdItem.earliestDeliveryDate,
    latestDeliveryDate: row.householdItem.latestDeliveryDate,
  }));
}
