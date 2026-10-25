/**
 * Work item milestone service — manages bidirectional milestone relationships for work items.
 *
 * Two distinct relationship types:
 * - "Required" (work_item_milestone_deps): work item depends on milestone completing first.
 * - "Linked" (milestone_work_items): work item contributes to milestone completion.
 *
 * EPIC-06 UAT Fix 4: Bidirectional milestone-work item dependency tracking.
 */

import { eq, and } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import { workItems, milestones, milestoneWorkItems, workItemMilestoneDeps } from '../db/schema.js';
import type { WorkItemMilestones, MilestoneSummaryForWorkItem } from '@cornerstone/shared';
import {
  NotFoundError,
  DuplicateDependencyError,
  CircularDependencyError,
  ConflictError,
} from '../errors/AppError.js';
import { autoReschedule } from './schedulingEngine.js';
import type { UndoTransaction } from './undoService.js';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

/**
 * Convert a milestone row to the compact MilestoneSummaryForWorkItem shape.
 */
function toMilestoneSummaryForWorkItem(
  milestone: typeof milestones.$inferSelect,
): MilestoneSummaryForWorkItem {
  return {
    id: milestone.id,
    name: milestone.title,
    targetDate: milestone.targetDate,
  };
}

/**
 * Get all milestone relationships for a work item.
 * Returns both required (dependency) and linked (contribution) milestones.
 *
 * @throws NotFoundError if work item does not exist
 */
export function getWorkItemMilestones(db: DbType, workItemId: string): WorkItemMilestones {
  // Verify work item exists
  const workItem = db.select().from(workItems).where(eq(workItems.id, workItemId)).get();
  if (!workItem) {
    throw new NotFoundError('Work item not found');
  }

  // Fetch required milestones (from work_item_milestone_deps)
  const requiredRows = db
    .select({ milestone: milestones })
    .from(workItemMilestoneDeps)
    .innerJoin(milestones, eq(milestones.id, workItemMilestoneDeps.milestoneId))
    .where(eq(workItemMilestoneDeps.workItemId, workItemId))
    .all();

  // Fetch linked milestones (from milestone_work_items)
  const linkedRows = db
    .select({ milestone: milestones })
    .from(milestoneWorkItems)
    .innerJoin(milestones, eq(milestones.id, milestoneWorkItems.milestoneId))
    .where(eq(milestoneWorkItems.workItemId, workItemId))
    .all();

  return {
    required: requiredRows.map((row) => toMilestoneSummaryForWorkItem(row.milestone)),
    linked: linkedRows.map((row) => toMilestoneSummaryForWorkItem(row.milestone)),
  };
}

/**
 * Add a required milestone dependency to a work item.
 * The milestone must complete before the work item can start.
 *
 * @throws NotFoundError if work item or milestone does not exist
 * @throws DuplicateDependencyError if the dependency already exists
 */
export function addRequiredMilestone(
  db: DbType,
  workItemId: string,
  milestoneId: number,
): WorkItemMilestones {
  // Verify work item exists
  const workItem = db.select().from(workItems).where(eq(workItems.id, workItemId)).get();
  if (!workItem) {
    throw new NotFoundError('Work item not found');
  }

  // Verify milestone exists
  const milestone = db.select().from(milestones).where(eq(milestones.id, milestoneId)).get();
  if (!milestone) {
    throw new NotFoundError('Milestone not found');
  }

  // Check for duplicate
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

  return getWorkItemMilestones(db, workItemId);
}

/** A deleted milestone-to-work-item link (`milestone_work_items`), as needed to restore it. */
export interface DeletedMilestoneLinkSnapshot {
  row: typeof milestoneWorkItems.$inferSelect;
}

/** A deleted work-item-requires-milestone dependency, as needed to restore it. */
export interface DeletedMilestoneDepSnapshot {
  row: typeof workItemMilestoneDeps.$inferSelect;
}

/**
 * Read and delete a `milestone_work_items` row in one transaction. Callers verify that the
 * milestone and work item exist and re-schedule afterwards.
 * @throws NotFoundError (with the given message) if the link does not exist
 */
export function deleteMilestoneLinkRow(
  db: DbType,
  milestoneId: number,
  workItemId: string,
  notFoundMessage: string,
): DeletedMilestoneLinkSnapshot {
  const where = and(
    eq(milestoneWorkItems.milestoneId, milestoneId),
    eq(milestoneWorkItems.workItemId, workItemId),
  );
  const row = db.transaction((tx) => {
    const existing = tx.select().from(milestoneWorkItems).where(where).get();
    if (!existing) {
      throw new NotFoundError(notFoundMessage);
    }
    tx.delete(milestoneWorkItems).where(where).run();
    return existing;
  });
  return { row };
}

/**
 * Read and delete a `work_item_milestone_deps` row in one transaction. Callers verify that the
 * milestone and work item exist and re-schedule afterwards.
 * @throws NotFoundError (with the given message) if the dependency does not exist
 */
export function deleteMilestoneDepRow(
  db: DbType,
  milestoneId: number,
  workItemId: string,
  notFoundMessage: string,
): DeletedMilestoneDepSnapshot {
  const where = and(
    eq(workItemMilestoneDeps.workItemId, workItemId),
    eq(workItemMilestoneDeps.milestoneId, milestoneId),
  );
  const row = db.transaction((tx) => {
    const existing = tx.select().from(workItemMilestoneDeps).where(where).get();
    if (!existing) {
      throw new NotFoundError(notFoundMessage);
    }
    tx.delete(workItemMilestoneDeps).where(where).run();
    return existing;
  });
  return { row };
}

function refuseRestore(workItemId: string): never {
  throw new ConflictError('The record changed after this action', {
    changed: [{ type: 'work_item', id: workItemId }],
  });
}

function milestoneAndWorkItemExist(
  tx: UndoTransaction,
  milestoneId: number,
  workItemId: string,
): boolean {
  const milestone = tx
    .select({ id: milestones.id })
    .from(milestones)
    .where(eq(milestones.id, milestoneId))
    .get();
  const workItem = tx
    .select({ id: workItems.id })
    .from(workItems)
    .where(eq(workItems.id, workItemId))
    .get();
  return Boolean(milestone && workItem);
}

/**
 * Re-insert a deleted milestone link.
 * @throws ConflictError (details.changed) when the milestone or work item is gone, the link
 *   exists again, or the work item now depends on that milestone
 */
export function restoreDeletedMilestoneLink(
  tx: UndoTransaction,
  snapshot: DeletedMilestoneLinkSnapshot,
): void {
  const { row } = snapshot;
  if (!milestoneAndWorkItemExist(tx, row.milestoneId, row.workItemId))
    refuseRestore(row.workItemId);

  const linkAgain = tx
    .select({ workItemId: milestoneWorkItems.workItemId })
    .from(milestoneWorkItems)
    .where(
      and(
        eq(milestoneWorkItems.milestoneId, row.milestoneId),
        eq(milestoneWorkItems.workItemId, row.workItemId),
      ),
    )
    .get();
  const nowDepends = tx
    .select({ workItemId: workItemMilestoneDeps.workItemId })
    .from(workItemMilestoneDeps)
    .where(
      and(
        eq(workItemMilestoneDeps.workItemId, row.workItemId),
        eq(workItemMilestoneDeps.milestoneId, row.milestoneId),
      ),
    )
    .get();
  if (linkAgain || nowDepends) refuseRestore(row.workItemId);

  tx.insert(milestoneWorkItems).values(row).run();
}

/**
 * Re-insert a deleted required-milestone dependency.
 * @throws ConflictError (details.changed) when the milestone or work item is gone, the
 *   dependency exists again, or the work item now contributes to that milestone
 */
export function restoreDeletedMilestoneDep(
  tx: UndoTransaction,
  snapshot: DeletedMilestoneDepSnapshot,
): void {
  const { row } = snapshot;
  if (!milestoneAndWorkItemExist(tx, row.milestoneId, row.workItemId))
    refuseRestore(row.workItemId);

  const depAgain = tx
    .select({ workItemId: workItemMilestoneDeps.workItemId })
    .from(workItemMilestoneDeps)
    .where(
      and(
        eq(workItemMilestoneDeps.workItemId, row.workItemId),
        eq(workItemMilestoneDeps.milestoneId, row.milestoneId),
      ),
    )
    .get();
  const nowContributes = tx
    .select({ workItemId: milestoneWorkItems.workItemId })
    .from(milestoneWorkItems)
    .where(
      and(
        eq(milestoneWorkItems.milestoneId, row.milestoneId),
        eq(milestoneWorkItems.workItemId, row.workItemId),
      ),
    )
    .get();
  if (depAgain || nowContributes) refuseRestore(row.workItemId);

  tx.insert(workItemMilestoneDeps).values(row).run();
}

/**
 * Remove a required milestone dependency from a work item and return the deleted row.
 *
 * @throws NotFoundError if work item, milestone, or the dependency does not exist
 */
export function removeRequiredMilestoneWithSnapshot(
  db: DbType,
  workItemId: string,
  milestoneId: number,
): DeletedMilestoneDepSnapshot {
  // Verify work item exists
  const workItem = db.select().from(workItems).where(eq(workItems.id, workItemId)).get();
  if (!workItem) {
    throw new NotFoundError('Work item not found');
  }

  // Verify milestone exists
  const milestone = db.select().from(milestones).where(eq(milestones.id, milestoneId)).get();
  if (!milestone) {
    throw new NotFoundError('Milestone not found');
  }

  const snapshot = deleteMilestoneDepRow(
    db,
    milestoneId,
    workItemId,
    'Work item does not depend on this milestone',
  );

  return snapshot;
}

/**
 * Add a linked milestone association to a work item.
 * The work item contributes to the milestone's completion.
 * Delegates to the existing milestone_work_items table.
 *
 * @throws NotFoundError if work item or milestone does not exist
 * @throws DuplicateDependencyError if the link already exists
 */
export function addLinkedMilestone(
  db: DbType,
  workItemId: string,
  milestoneId: number,
): WorkItemMilestones {
  // Verify work item exists
  const workItem = db.select().from(workItems).where(eq(workItems.id, workItemId)).get();
  if (!workItem) {
    throw new NotFoundError('Work item not found');
  }

  // Verify milestone exists
  const milestone = db.select().from(milestones).where(eq(milestones.id, milestoneId)).get();
  if (!milestone) {
    throw new NotFoundError('Milestone not found');
  }

  // Check for duplicate
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

  return getWorkItemMilestones(db, workItemId);
}

/**
 * Remove a linked milestone association from a work item and return the deleted row.
 *
 * @throws NotFoundError if work item, milestone, or the link does not exist
 */
export function removeLinkedMilestoneWithSnapshot(
  db: DbType,
  workItemId: string,
  milestoneId: number,
): DeletedMilestoneLinkSnapshot {
  // Verify work item exists
  const workItem = db.select().from(workItems).where(eq(workItems.id, workItemId)).get();
  if (!workItem) {
    throw new NotFoundError('Work item not found');
  }

  // Verify milestone exists
  const milestone = db.select().from(milestones).where(eq(milestones.id, milestoneId)).get();
  if (!milestone) {
    throw new NotFoundError('Milestone not found');
  }

  const snapshot = deleteMilestoneLinkRow(
    db,
    milestoneId,
    workItemId,
    'Work item is not linked to this milestone',
  );

  return snapshot;
}
