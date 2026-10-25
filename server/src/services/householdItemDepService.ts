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
import type { areas } from '../db/schema.js';
import { householdItemDeps, householdItems, workItems, milestones } from '../db/schema.js';
import type {
  HouseholdItemDepDetail,
  HouseholdItemDepPredecessorSummary,
  CreateHouseholdItemDepRequest,
  WorkItemLinkedHouseholdItemSummary,
  HouseholdItemCategory,
  HouseholdItemStatus,
  AreaSummary,
} from '@cornerstone/shared';
import {
  NotFoundError,
  ValidationError,
  DuplicateDependencyError,
  ConflictError,
} from '../errors/AppError.js';
import type { UndoTransaction } from './undoService.js';
import { autoReschedule } from './schedulingEngine.js';
import { loadAreaMap, resolveAreaAncestors, type AreaMapEntry } from './areaService.js';
import { toAreaSummary } from './shared/converters.js';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

/**
 * Helper to resolve area summary with ancestors from area map.
 */
function getAreaWithAncestors(
  areaId: string | null,
  areaMap: Map<string, AreaMapEntry>,
): AreaSummary | null {
  if (!areaId) return null;
  // areaId is a foreign key into the same areas table the map was loaded from
  const entry = areaMap.get(areaId)!;
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
  areaMap: Map<string, AreaMapEntry>,
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
    area: getAreaWithAncestors(item.areaId, areaMap),
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
    area: null, // Milestones don't have an area
  };
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

  const areaMap = loadAreaMap(db);

  return rows.map((row) => {
    const predecessor =
      row.predecessorType === 'work_item'
        ? getWorkItemPredecessor(db, row.predecessorId, areaMap)
        : getMilestonePredecessor(db, row.predecessorId);

    return {
      householdItemId: row.householdItemId,
      predecessorType: row.predecessorType as 'work_item' | 'milestone',
      predecessorId: row.predecessorId,
      predecessor,
    };
  });
}

/**
 * Create a dependency for a household item.
 * @throws NotFoundError if household item or predecessor does not exist
 * @throws DuplicateDependencyError if dependency already exists (DUPLICATE_DEPENDENCY)
 */
export function createDep(
  db: DbType,
  householdItemId: string,
  data: CreateHouseholdItemDepRequest,
): HouseholdItemDepDetail {
  const { predecessorType, predecessorId } = data;

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
    throw new DuplicateDependencyError();
  }

  // No cycle check: household items are terminal nodes (predecessors can only be work items
  // or milestones), so nothing can depend on one and a cycle is impossible by construction.

  // Create dependency
  db.insert(householdItemDeps)
    .values({
      householdItemId,
      predecessorType,
      predecessorId,
    })
    .run();

  autoReschedule(db);

  // Fetch and return the created dependency with predecessor details
  const areaMap = loadAreaMap(db);
  const predecessor =
    predecessorType === 'work_item'
      ? getWorkItemPredecessor(db, predecessorId, areaMap)
      : getMilestonePredecessor(db, predecessorId);

  return {
    householdItemId,
    predecessorType,
    predecessorId,
    predecessor,
  };
}

/** A deleted household item dependency, as needed to restore it. */
export interface DeletedHouseholdItemDepSnapshot {
  row: typeof householdItemDeps.$inferSelect;
}

/**
 * Delete a dependency for a household item and return the deleted row for an Undo snapshot.
 * The route reschedules after issuing the Undo token.
 * @throws NotFoundError if household item or dependency does not exist
 */
export function deleteDepWithSnapshot(
  db: DbType,
  householdItemId: string,
  predecessorType: string,
  predecessorId: string,
): DeletedHouseholdItemDepSnapshot {
  ensureHouseholdItemExists(db, householdItemId);

  // Cast predecessorType to the proper enum type
  const predType = predecessorType as 'work_item' | 'milestone';
  const where = and(
    eq(householdItemDeps.householdItemId, householdItemId),
    eq(householdItemDeps.predecessorType, predType),
    eq(householdItemDeps.predecessorId, predecessorId),
  );

  const row = db.transaction((tx) => {
    const existing = tx.select().from(householdItemDeps).where(where).get();
    if (!existing) {
      throw new NotFoundError('Dependency not found');
    }
    tx.delete(householdItemDeps).where(where).run();
    return existing;
  });

  return { row };
}

/**
 * Re-insert a deleted household item dependency.
 * @throws ConflictError (details.changed) when the household item or the predecessor is gone,
 *   or the dependency exists again
 */
export function restoreDeletedDep(
  tx: UndoTransaction,
  snapshot: DeletedHouseholdItemDepSnapshot,
): void {
  const { row } = snapshot;
  const refuse = (): never => {
    throw new ConflictError('The record changed after this action', {
      changed: [{ type: 'household_item', id: row.householdItemId }],
    });
  };

  const itemExists = tx
    .select({ id: householdItems.id })
    .from(householdItems)
    .where(eq(householdItems.id, row.householdItemId))
    .get();
  if (!itemExists) refuse();

  const predecessorExists =
    row.predecessorType === 'work_item'
      ? tx
          .select({ id: workItems.id })
          .from(workItems)
          .where(eq(workItems.id, row.predecessorId))
          .get()
      : tx
          .select({ id: milestones.id })
          .from(milestones)
          .where(eq(milestones.id, parseInt(row.predecessorId, 10)))
          .get();
  if (!predecessorExists) refuse();

  const again = tx
    .select({ id: householdItemDeps.predecessorId })
    .from(householdItemDeps)
    .where(
      and(
        eq(householdItemDeps.householdItemId, row.householdItemId),
        eq(householdItemDeps.predecessorType, row.predecessorType),
        eq(householdItemDeps.predecessorId, row.predecessorId),
      ),
    )
    .get();
  if (again) refuse();

  tx.insert(householdItemDeps).values(row).run();
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
    category: row.householdItem.categoryId as HouseholdItemCategory,
    status: row.householdItem.status as HouseholdItemStatus,
    targetDeliveryDate: row.householdItem.targetDeliveryDate,
    earliestDeliveryDate: row.householdItem.earliestDeliveryDate,
    latestDeliveryDate: row.householdItem.latestDeliveryDate,
  }));
}

/**
 * List all household items that depend on a milestone.
 * Returns household items with delivery date information.
 */
export function listDependentHouseholdItemsForMilestone(
  db: DbType,
  milestoneId: number,
): WorkItemLinkedHouseholdItemSummary[] {
  const rows = db
    .select({ householdItem: householdItems })
    .from(householdItemDeps)
    .innerJoin(householdItems, eq(householdItems.id, householdItemDeps.householdItemId))
    .where(
      and(
        eq(householdItemDeps.predecessorType, 'milestone'),
        eq(householdItemDeps.predecessorId, milestoneId.toString()),
      ),
    )
    .all();

  return rows.map((row) => ({
    id: row.householdItem.id,
    name: row.householdItem.name,
    category: row.householdItem.categoryId as HouseholdItemCategory,
    status: row.householdItem.status as HouseholdItemStatus,
    targetDeliveryDate: row.householdItem.targetDeliveryDate,
    earliestDeliveryDate: row.householdItem.earliestDeliveryDate,
    latestDeliveryDate: row.householdItem.latestDeliveryDate,
  }));
}
