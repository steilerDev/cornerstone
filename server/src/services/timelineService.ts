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
  householdItems,
  householdItemDeps,
} from '../db/schema.js';
import type {
  TimelineResponse,
  TimelineWorkItem,
  TimelineDependency,
  TimelineMilestone,
  TimelineHouseholdItem,
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
 * Compute the date range (earliest startDate, latest endDate) across work items and household items.
 * Returns null if no item has either date set.
 */
function computeDateRange(
  workItems: TimelineWorkItem[],
  householdItems: TimelineHouseholdItem[],
): TimelineDateRange | null {
  let earliest: string | null = null;
  let latest: string | null = null;

  // Consider work item dates
  for (const item of workItems) {
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

  // Consider household item delivery dates
  for (const item of householdItems) {
    if (item.earliestDeliveryDate) {
      if (!earliest || item.earliestDeliveryDate < earliest) {
        earliest = item.earliestDeliveryDate;
      }
    }
    if (item.latestDeliveryDate) {
      if (!latest || item.latestDeliveryDate > latest) {
        latest = item.latestDeliveryDate;
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
  const hasCycle = !!scheduleResult.cycleNodes?.length;
  const criticalPath = hasCycle ? [] : scheduleResult.criticalPath;

  // ── 5b. Apply CPM-scheduled dates for not_started items ──────────────────────
  //
  // The schedule engine applies the implicit "today floor" for not_started items:
  // their start date cannot be in the past. Apply the engine's output to the
  // timeline response so the Gantt chart always reflects the current schedule.
  // Only not_started items are updated — in_progress and completed items keep
  // their stored dates (which represent user-accepted/actual values).

  if (!hasCycle) {
    const scheduledDatesMap = new Map<string, { start: string; end: string }>();
    for (const si of scheduleResult.scheduledItems) {
      scheduledDatesMap.set(si.workItemId, {
        start: si.scheduledStartDate,
        end: si.scheduledEndDate,
      });
    }

    for (const wi of timelineWorkItems) {
      if (wi.status === 'not_started') {
        const scheduled = scheduledDatesMap.get(wi.id);
        if (scheduled) {
          wi.startDate = scheduled.start;
          wi.endDate = scheduled.end;
        }
      }
    }
  }

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
  // For not_started items, use CPM-scheduled end dates so milestone projections
  // reflect the current schedule (including the today floor).
  const workItemStatusMap = new Map<string, string>();
  const workItemEndDateMap = new Map<string, string | null>();
  for (const wi of allWorkItems) {
    workItemStatusMap.set(wi.id, wi.status);
    workItemEndDateMap.set(wi.id, wi.endDate);
  }
  if (!hasCycle) {
    for (const si of scheduleResult.scheduledItems) {
      if (workItemStatusMap.get(si.workItemId) === 'not_started') {
        workItemEndDateMap.set(si.workItemId, si.scheduledEndDate);
      }
    }
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

  // ── 7. Fetch household items with at least one date set ─────────────────────────

  const hiWithDates = db
    .select()
    .from(householdItems)
    .where(
      or(
        isNotNull(householdItems.earliestDeliveryDate),
        isNotNull(householdItems.latestDeliveryDate),
      ),
    )
    .all();

  // ── 7a. Fetch all HI dependencies ────────────────────────────────────────────

  const allHIDeps = db.select().from(householdItemDeps).all();

  // Build householdItemId → dependency references map.
  const hiDepRefMap = new Map<
    string,
    { predecessorType: 'work_item' | 'milestone'; predecessorId: string }[]
  >();
  for (const dep of allHIDeps) {
    const existing = hiDepRefMap.get(dep.householdItemId) ?? [];
    existing.push({
      predecessorType: dep.predecessorType as 'work_item' | 'milestone',
      predecessorId: dep.predecessorId,
    });
    hiDepRefMap.set(dep.householdItemId, existing);
  }

  // ── 7b. Compute isLate for each household item ────────────────────────────────
  // isLate is true when the scheduler floored earliestDeliveryDate to today.
  // Re-compute based on status and delivery dates.

  const timelineHouseholdItems: TimelineHouseholdItem[] = hiWithDates.map((hi) => {
    let isLate = false;

    // isLate heuristic: if status is not_ordered/ordered and earliest is today or later
    // relative to when it was scheduled, or if status is in_transit and latest was floored.
    // For simplicity, check if earliest/latest is today and status suggests it should be later.
    if (
      (hi.status === 'not_ordered' || hi.status === 'ordered') &&
      hi.earliestDeliveryDate === today
    ) {
      // Could be late if it was supposed to be earlier, but we can't tell from DB alone.
      // Mark as potentially late if earliest = today and status suggests ordering/transit.
      isLate = true;
    } else if (hi.status === 'in_transit' && hi.latestDeliveryDate === today) {
      isLate = true;
    }

    const dependencyIds = hiDepRefMap.get(hi.id) ?? [];

    return {
      id: hi.id,
      name: hi.name,
      category: hi.category as any,
      status: hi.status as any,
      expectedDeliveryDate: hi.expectedDeliveryDate,
      earliestDeliveryDate: hi.earliestDeliveryDate,
      latestDeliveryDate: hi.latestDeliveryDate,
      actualDeliveryDate: hi.actualDeliveryDate,
      isLate,
      dependencyIds,
    };
  });

  // ── 8. Compute date range from returned work items and household items ────────

  const dateRange = computeDateRange(timelineWorkItems, timelineHouseholdItems);

  return {
    workItems: timelineWorkItems,
    dependencies: timelineDependencies,
    milestones: timelineMilestones,
    householdItems: timelineHouseholdItems,
    criticalPath,
    dateRange,
  };
}
