/**
 * Timeline service — aggregates work items, dependencies, milestones, and critical path
 * into the TimelineResponse shape for the GET /api/timeline endpoint.
 *
 * EPIC-06 Story 6.3 — Timeline Data API
 */

import { eq, isNotNull, or } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import {
  workItems,
  workItemTags,
  tags,
  users,
  workItemDependencies,
  milestones,
  milestoneWorkItems,
  workItemMilestoneDeps,
} from '../db/schema.js';
import type {
  TimelineResponse,
  TimelineWorkItem,
  TimelineDependency,
  TimelineMilestone,
  TimelineDateRange,
  UserSummary,
  TagResponse,
} from '@cornerstone/shared';
import { schedule } from './schedulingEngine.js';
import type { SchedulingWorkItem, SchedulingDependency } from './schedulingEngine.js';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

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
 * Fetch tags for a single work item.
 */
function getWorkItemTags(db: DbType, workItemId: string): TagResponse[] {
  const rows = db
    .select({ tag: tags })
    .from(workItemTags)
    .innerJoin(tags, eq(tags.id, workItemTags.tagId))
    .where(eq(workItemTags.workItemId, workItemId))
    .all();

  return rows.map((row) => ({
    id: row.tag.id,
    name: row.tag.name,
    color: row.tag.color,
  }));
}

/**
 * Compute the date range (earliest startDate, latest endDate) across a set of timeline work items.
 * Returns null if no work item has either date set.
 */
function computeDateRange(items: TimelineWorkItem[]): TimelineDateRange | null {
  let earliest: string | null = null;
  let latest: string | null = null;

  for (const item of items) {
    if (item.startDate) {
      if (!earliest || item.startDate < earliest) {
        earliest = item.startDate;
      }
    }
    if (item.endDate) {
      if (!latest || item.endDate > latest) {
        latest = item.endDate;
      }
    }
  }

  if (!earliest && !latest) {
    return null;
  }

  // If only one side is present across all items, use it for both bounds.
  return {
    earliest: earliest ?? latest!,
    latest: latest ?? earliest!,
  };
}

/**
 * Fetch the aggregated timeline data for GET /api/timeline.
 *
 * Returns all work items with at least one date set, all dependencies,
 * all milestones with their linked work item IDs, the critical path, and
 * the overall date range.
 */
export function getTimeline(db: DbType): TimelineResponse {
  // ── 1. Fetch work items that have at least one date set ─────────────────────

  const rawWorkItems = db
    .select()
    .from(workItems)
    .where(or(isNotNull(workItems.startDate), isNotNull(workItems.endDate)))
    .all();

  // ── 2. Build a map of assignedUserId → user row (batch lookup) ──────────────

  const assignedUserIds = [
    ...new Set(rawWorkItems.map((wi) => wi.assignedUserId).filter(Boolean) as string[]),
  ];

  const userMap = new Map<string, typeof users.$inferSelect>();
  if (assignedUserIds.length > 0) {
    const userRows = db.select().from(users).all();
    for (const u of userRows) {
      userMap.set(u.id, u);
    }
  }

  // ── 3. Batch-fetch required milestone dependencies for all work items ─────────

  const allMilestoneDeps = db.select().from(workItemMilestoneDeps).all();

  // Build workItemId → required milestoneIds map.
  const workItemRequiredMilestoneMap = new Map<string, number[]>();
  for (const dep of allMilestoneDeps) {
    const existing = workItemRequiredMilestoneMap.get(dep.workItemId) ?? [];
    existing.push(dep.milestoneId);
    workItemRequiredMilestoneMap.set(dep.workItemId, existing);
  }

  // ── 4. Map to TimelineWorkItem shape ─────────────────────────────────────────

  const timelineWorkItems: TimelineWorkItem[] = rawWorkItems.map((wi) => {
    const assignedUser = wi.assignedUserId
      ? toUserSummary(userMap.get(wi.assignedUserId) ?? null)
      : null;

    const requiredMilestoneIds = workItemRequiredMilestoneMap.get(wi.id);

    return {
      id: wi.id,
      title: wi.title,
      status: wi.status,
      startDate: wi.startDate,
      endDate: wi.endDate,
      actualStartDate: wi.actualStartDate,
      actualEndDate: wi.actualEndDate,
      durationDays: wi.durationDays,
      startAfter: wi.startAfter,
      startBefore: wi.startBefore,
      assignedUser,
      tags: getWorkItemTags(db, wi.id),
      ...(requiredMilestoneIds && requiredMilestoneIds.length > 0 ? { requiredMilestoneIds } : {}),
    };
  });

  // ── 4. Fetch all dependencies ─────────────────────────────────────────────────

  const rawDependencies = db.select().from(workItemDependencies).all();

  const timelineDependencies: TimelineDependency[] = rawDependencies.map((dep) => ({
    predecessorId: dep.predecessorId,
    successorId: dep.successorId,
    dependencyType: dep.dependencyType,
    leadLagDays: dep.leadLagDays,
  }));

  // ── 5. Compute critical path via the scheduling engine ───────────────────────

  // The engine needs the full work item set (not just dated ones) for accurate CPM.
  const allWorkItems = db.select().from(workItems).all();

  const engineWorkItems: SchedulingWorkItem[] = allWorkItems.map((wi) => ({
    id: wi.id,
    status: wi.status,
    startDate: wi.startDate,
    endDate: wi.endDate,
    actualStartDate: wi.actualStartDate,
    actualEndDate: wi.actualEndDate,
    durationDays: wi.durationDays,
    startAfter: wi.startAfter,
    startBefore: wi.startBefore,
  }));

  const engineDependencies: SchedulingDependency[] = rawDependencies.map((dep) => ({
    predecessorId: dep.predecessorId,
    successorId: dep.successorId,
    dependencyType: dep.dependencyType,
    leadLagDays: dep.leadLagDays,
  }));

  const today = new Date().toISOString().slice(0, 10);

  const scheduleResult = schedule({
    mode: 'full',
    workItems: engineWorkItems,
    dependencies: engineDependencies,
    today,
  });

  // If a cycle is detected, return an empty critical path rather than erroring —
  // the timeline view should still render; the schedule endpoint surfaces the error.
  const criticalPath = scheduleResult.cycleNodes?.length ? [] : scheduleResult.criticalPath;

  // ── 6. Fetch milestones with linked work item IDs ─────────────────────────────

  const allMilestones = db.select().from(milestones).all();

  // Batch-fetch all milestone-work-item links in one query.
  const allMilestoneLinks = db.select().from(milestoneWorkItems).all();

  // Build milestoneId → workItemIds map.
  const milestoneLinkMap = new Map<number, string[]>();
  for (const link of allMilestoneLinks) {
    const existing = milestoneLinkMap.get(link.milestoneId) ?? [];
    existing.push(link.workItemId);
    milestoneLinkMap.set(link.milestoneId, existing);
  }

  // Build workItemId → endDate map for projectedDate computation.
  // Use all raw work items (not just the dated subset returned in timeline) so
  // milestones linked to undated items still compute correctly for those that do have dates.
  const workItemEndDateMap = new Map<string, string | null>();
  for (const wi of allWorkItems) {
    workItemEndDateMap.set(wi.id, wi.endDate);
  }

  const timelineMilestones: TimelineMilestone[] = allMilestones.map((m) => {
    const linkedIds = milestoneLinkMap.get(m.id) ?? [];

    // Compute projectedDate: latest endDate among linked work items.
    let projectedDate: string | null = null;
    for (const wiId of linkedIds) {
      const endDate = workItemEndDateMap.get(wiId) ?? null;
      if (endDate && (!projectedDate || endDate > projectedDate)) {
        projectedDate = endDate;
      }
    }

    return {
      id: m.id,
      title: m.title,
      targetDate: m.targetDate,
      isCompleted: m.isCompleted,
      completedAt: m.completedAt,
      color: m.color,
      workItemIds: linkedIds,
      projectedDate,
    };
  });

  // ── 7. Compute date range from returned work items ────────────────────────────

  const dateRange = computeDateRange(timelineWorkItems);

  return {
    workItems: timelineWorkItems,
    dependencies: timelineDependencies,
    milestones: timelineMilestones,
    criticalPath,
    dateRange,
  };
}
