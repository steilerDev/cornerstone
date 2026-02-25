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
import { NotFoundError, ConflictError } from '../errors/AppError.js';

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
 * @throws ConflictError if the dependency already exists
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
    throw new ConflictError('Work item already depends on this milestone');
  }

  db.insert(workItemMilestoneDeps).values({ workItemId, milestoneId }).run();

  // TODO: call autoReschedule(db) here once available

  return getWorkItemMilestones(db, workItemId);
}

/**
 * Remove a required milestone dependency from a work item.
 *
 * @throws NotFoundError if work item, milestone, or the dependency does not exist
 */
export function removeRequiredMilestone(db: DbType, workItemId: string, milestoneId: number): void {
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

  // Verify the dependency exists
  const dep = db
    .select()
    .from(workItemMilestoneDeps)
    .where(
      and(
        eq(workItemMilestoneDeps.workItemId, workItemId),
        eq(workItemMilestoneDeps.milestoneId, milestoneId),
      ),
    )
    .get();

  if (!dep) {
    throw new NotFoundError('Work item does not depend on this milestone');
  }

  db.delete(workItemMilestoneDeps)
    .where(
      and(
        eq(workItemMilestoneDeps.workItemId, workItemId),
        eq(workItemMilestoneDeps.milestoneId, milestoneId),
      ),
    )
    .run();

  // TODO: call autoReschedule(db) here once available
}

/**
 * Add a linked milestone association to a work item.
 * The work item contributes to the milestone's completion.
 * Delegates to the existing milestone_work_items table.
 *
 * @throws NotFoundError if work item or milestone does not exist
 * @throws ConflictError if the link already exists
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
    throw new ConflictError('Work item is already linked to this milestone');
  }

  db.insert(milestoneWorkItems).values({ milestoneId, workItemId }).run();

  // TODO: call autoReschedule(db) here once available

  return getWorkItemMilestones(db, workItemId);
}

/**
 * Remove a linked milestone association from a work item.
 *
 * @throws NotFoundError if work item, milestone, or the link does not exist
 */
export function removeLinkedMilestone(db: DbType, workItemId: string, milestoneId: number): void {
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

  // TODO: call autoReschedule(db) here once available
}
