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
  users,
  workItemDependencies,
  milestones,
  milestoneWorkItems,
  workItemMilestoneDeps,
  householdItems,
  householdItemDeps,
  vendors,
  areas,
  trades,
} from '../db/schema.js';
import type {
  TimelineResponse,
  TimelineWorkItem,
  TimelineDependency,
  TimelineMilestone,
  TimelineHouseholdItem,
  TimelineDateRange,
  UserSummary,
  HouseholdItemCategory,
  HouseholdItemStatus,
  AreaSummary,
  VendorSummary,
  TradeSummary,
} from '@cornerstone/shared';
import { schedule } from './schedulingEngine.js';
import type {
  SchedulingWorkItem,
  SchedulingDependency,
  ScheduleResult,
} from './schedulingEngine.js';

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
 * Convert a database area row to AreaSummary shape.
 */
function toAreaSummaryInternal(area: typeof areas.$inferSelect | null): AreaSummary | null {
  if (!area) return null;
  return {
    id: area.id,
    name: area.name,
    color: area.color,
  };
}

/**
 * Convert a database vendor row with trade lookup to VendorSummary shape.
 */
function toVendorSummaryWithTrade(
  vendor: typeof vendors.$inferSelect | null,
  tradeMap: Map<string, typeof trades.$inferSelect>,
): VendorSummary | null {
  if (!vendor) return null;
  let trade: TradeSummary | null = null;
  if (vendor.tradeId) {
    const tradeRow = tradeMap.get(vendor.tradeId);
    if (tradeRow) {
      trade = {
        id: tradeRow.id,
        name: tradeRow.name,
        color: tradeRow.color,
        translationKey: tradeRow.translationKey ?? null,
      };
    }
  }
  return {
    id: vendor.id,
    name: vendor.name,
    trade,
  };
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
    if (item.targetDeliveryDate) {
      if (!earliest || item.targetDeliveryDate < earliest) {
        earliest = item.targetDeliveryDate;
      }
      if (!latest || item.targetDeliveryDate > latest) {
        latest = item.targetDeliveryDate;
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

  // ── 2. Build maps for assignedUserId, areaId, and assignedVendorId (batch lookup) ─

  const assignedUserIds = [
    ...new Set(rawWorkItems.map((wi) => wi.assignedUserId).filter(Boolean) as string[]),
  ];

  const areaIds = [...new Set(rawWorkItems.map((wi) => wi.areaId).filter(Boolean) as string[])];

  const assignedVendorIds = [
    ...new Set(rawWorkItems.map((wi) => wi.assignedVendorId).filter(Boolean) as string[]),
  ];

  const userMap = new Map<string, typeof users.$inferSelect>();
  if (assignedUserIds.length > 0) {
    const userRows = db.select().from(users).all();
    for (const u of userRows) {
      userMap.set(u.id, u);
    }
  }

  const areaMap = new Map<string, typeof areas.$inferSelect>();
  if (areaIds.length > 0) {
    const areaRows = db.select().from(areas).all();
    for (const a of areaRows) {
      areaMap.set(a.id, a);
    }
  }

  const vendorMap = new Map<string, typeof vendors.$inferSelect>();
  const tradeMap = new Map<string, typeof trades.$inferSelect>();
  if (assignedVendorIds.length > 0) {
    const vendorRows = db.select().from(vendors).all();
    for (const v of vendorRows) {
      vendorMap.set(v.id, v);
    }
    // Batch-fetch trades
    const tradeRows = db.select().from(trades).all();
    for (const t of tradeRows) {
      tradeMap.set(t.id, t);
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

    const area = wi.areaId ? toAreaSummaryInternal(areaMap.get(wi.areaId) ?? null) : null;

    const assignedVendor = wi.assignedVendorId
      ? toVendorSummaryWithTrade(vendorMap.get(wi.assignedVendorId) ?? null, tradeMap)
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
      assignedVendor,
      area,
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
  //
  // Build milestone CPM nodes and dependencies so milestones are included in the
  // critical path calculation.

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

  // Load milestones and links for CPM node construction
  const allMilestones = db.select().from(milestones).all();
  const allMilestoneLinks = db.select().from(milestoneWorkItems).all();
  // Note: allMilestoneDeps already loaded in section 3; reuse it here

  // Map milestones by ID
  const milestoneMap = new Map<number, typeof milestones.$inferSelect>();
  for (const milestone of allMilestones) {
    milestoneMap.set(milestone.id, milestone);
  }

  // Build milestoneId → contributors map
  const milestoneContributorsMap = new Map<number, string[]>();
  for (const link of allMilestoneLinks) {
    const existing = milestoneContributorsMap.get(link.milestoneId) ?? [];
    existing.push(link.workItemId);
    milestoneContributorsMap.set(link.milestoneId, existing);
  }

  // Build milestoneId → dependents map
  const milestoneDependentsMap = new Map<number, string[]>();
  for (const dep of allMilestoneDeps) {
    const existing = milestoneDependentsMap.get(dep.milestoneId) ?? [];
    existing.push(dep.workItemId);
    milestoneDependentsMap.set(dep.milestoneId, existing);
  }

  // Identify milestones with links and create CPM nodes
  const milestoneIdsWithLinks = new Set<number>();
  for (const id of milestoneContributorsMap.keys()) {
    milestoneIdsWithLinks.add(id);
  }
  for (const id of milestoneDependentsMap.keys()) {
    milestoneIdsWithLinks.add(id);
  }

  const milestoneCpmNodes: SchedulingWorkItem[] = [];
  const milestoneCpmDeps: SchedulingDependency[] = [];

  for (const milestoneId of milestoneIdsWithLinks) {
    const milestone = milestoneMap.get(milestoneId);
    if (!milestone) continue;

    const milestoneNodeId = `milestone:${milestoneId}`;
    const completedDate = milestone.completedAt ? milestone.completedAt.slice(0, 10) : null;

    // Create zero-duration CPM node
    milestoneCpmNodes.push({
      id: milestoneNodeId,
      status: milestone.completedAt ? 'completed' : 'not_started',
      startDate: completedDate ?? milestone.targetDate,
      endDate: completedDate ?? milestone.targetDate,
      actualStartDate: completedDate ?? null,
      actualEndDate: completedDate ?? null,
      durationDays: 0,
      startAfter: null,
      startBefore: null,
    });

    // Create contributor → milestone deps
    const contributors = milestoneContributorsMap.get(milestoneId) ?? [];
    for (const contributorId of contributors) {
      milestoneCpmDeps.push({
        predecessorId: contributorId,
        successorId: milestoneNodeId,
        dependencyType: 'finish_to_start',
        leadLagDays: 0,
      });
    }

    // Create milestone → dependent deps
    const dependents = milestoneDependentsMap.get(milestoneId) ?? [];
    for (const dependentId of dependents) {
      milestoneCpmDeps.push({
        predecessorId: milestoneNodeId,
        successorId: dependentId,
        dependencyType: 'finish_to_start',
        leadLagDays: 0,
      });
    }
  }

  const engineDependencies: SchedulingDependency[] = [
    ...rawDependencies.map((dep) => ({
      predecessorId: dep.predecessorId,
      successorId: dep.successorId,
      dependencyType: dep.dependencyType,
      leadLagDays: dep.leadLagDays,
    })),
    ...milestoneCpmDeps,
  ];

  const today = new Date().toISOString().slice(0, 10);

  const scheduleResult = schedule({
    mode: 'full',
    workItems: [...engineWorkItems, ...milestoneCpmNodes],
    dependencies: engineDependencies,
    today,
  });

  // If a cycle is detected, return an empty critical path rather than erroring —
  // the timeline view should still render; the schedule endpoint surfaces the error.
  const hasCycle = !!scheduleResult.cycleNodes?.length;
  // Filter out milestone nodes from the returned critical path
  const criticalPath = hasCycle
    ? []
    : scheduleResult.criticalPath.filter((id: string) => !id.startsWith('milestone:'));

  // Derive set of critical milestone IDs
  const criticalMilestoneIds = new Set<number>();
  if (!hasCycle) {
    for (const id of scheduleResult.criticalPath) {
      if (id.startsWith('milestone:')) {
        criticalMilestoneIds.add(parseInt(id.slice('milestone:'.length), 10));
      }
    }
  }

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

  // ── 6. Build milestone timeline objects with isCritical propagation ──────────
  //
  // Reuse allMilestones, allMilestoneLinks, and milestoneLinkMap from section 5.
  // Add isCritical field based on criticalMilestoneIds.

  // Build milestoneId → workItemIds map (reuse from section 5 data).
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
      // Skip milestone nodes when building work item end date map
      if (si.workItemId.startsWith('milestone:')) {
        continue;
      }
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
      isCritical: criticalMilestoneIds.has(m.id),
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
        isNotNull(householdItems.targetDeliveryDate),
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

  // ── 7b. Map household items to timeline representation ────────────────────────────────

  const timelineHouseholdItems: TimelineHouseholdItem[] = hiWithDates.map((hi) => {
    const dependencyIds = hiDepRefMap.get(hi.id) ?? [];

    return {
      id: hi.id,
      name: hi.name,
      category: hi.categoryId as HouseholdItemCategory,
      status: hi.status as HouseholdItemStatus,
      targetDeliveryDate: hi.targetDeliveryDate,
      earliestDeliveryDate: hi.earliestDeliveryDate,
      latestDeliveryDate: hi.latestDeliveryDate,
      actualDeliveryDate: hi.actualDeliveryDate,
      isLate: hi.isLate,
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
