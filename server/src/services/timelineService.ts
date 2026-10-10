/**
 * Timeline service — aggregates work items, dependencies, milestones, and critical path
 * into the TimelineResponse shape for the GET /api/timeline endpoint.
 *
 * EPIC-06 Story 6.3 — Timeline Data API
 */

import { isNotNull, or } from 'drizzle-orm';
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
  AreaAncestor,
  VendorSummary,
  TradeSummary,
} from '@cornerstone/shared';
import { computeScheduleProjection, workItemProjectionOf } from './schedulingEngine.js';
import { resolveAreaAncestors } from './areaService.js';
import type { AreaMapEntry } from './areaService.js';

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
 * Convert an area map entry to AreaSummary shape.
 */
function toAreaSummaryInternal(
  area: AreaMapEntry | null,
  ancestors: AreaAncestor[] = [],
): AreaSummary | null {
  if (!area) return null;
  return {
    id: area.id,
    name: area.name,
    color: area.color,
    ancestors,
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
    for (const start of [item.startDate, item.projectedStartDate]) {
      if (start && (!earliest || start < earliest)) {
        earliest = start;
      }
    }
    for (const end of [item.endDate, item.projectedEndDate]) {
      if (end && (!latest || end > latest)) {
        latest = end;
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
  // ── 0. Schedule projection (planned vs forecast, contract 4) ────────────────

  const projection = computeScheduleProjection(db);

  // ── 1. Fetch work items that have a stored or forecast date ─────────────────
  //
  // Undated tasks (no stored dates) stay on the timeline through their forecast dates.

  const rawWorkItems = db
    .select()
    .from(workItems)
    .all()
    .filter((wi) => {
      const fields = workItemProjectionOf(projection, wi);
      return (
        wi.startDate !== null ||
        wi.endDate !== null ||
        fields.projectedStartDate !== null ||
        fields.projectedEndDate !== null
      );
    });

  // ── 1b. Fetch household items with at least one date set ─────────────────────────

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

  // ── 2. Build maps for assignedUserId, areaId, and assignedVendorId (batch lookup) ─

  const assignedUserIds = [
    ...new Set(rawWorkItems.map((wi) => wi.assignedUserId).filter(Boolean) as string[]),
  ];

  const areaIds = [
    ...new Set(
      [...rawWorkItems.map((wi) => wi.areaId), ...hiWithDates.map((hi) => hi.areaId)].filter(
        Boolean,
      ) as string[],
    ),
  ];

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

  const areaMap = new Map<string, AreaMapEntry>();
  if (areaIds.length > 0) {
    const areaRows = db
      .select({
        id: areas.id,
        name: areas.name,
        color: areas.color,
        parentId: areas.parentId,
      })
      .from(areas)
      .all();
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

    const area = wi.areaId
      ? toAreaSummaryInternal(
          areaMap.get(wi.areaId) ?? null,
          resolveAreaAncestors(wi.areaId, areaMap),
        )
      : null;

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
      ...workItemProjectionOf(projection, wi),
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

  // ── 5. Critical path and milestones from the schedule projection ─────────────

  const criticalPath = projection.criticalPath;

  const allMilestones = db.select().from(milestones).all();
  const allMilestoneLinks = db.select().from(milestoneWorkItems).all();

  const milestoneLinkMap = new Map<number, string[]>();
  for (const link of allMilestoneLinks) {
    const existing = milestoneLinkMap.get(link.milestoneId) ?? [];
    existing.push(link.workItemId);
    milestoneLinkMap.set(link.milestoneId, existing);
  }

  const timelineMilestones: TimelineMilestone[] = allMilestones.map((m) => ({
    id: m.id,
    title: m.title,
    targetDate: m.targetDate,
    isCompleted: m.isCompleted,
    completedAt: m.completedAt,
    color: m.color,
    workItemIds: milestoneLinkMap.get(m.id) ?? [],
    ...(projection.milestones.get(m.id) ?? {
      projectedDate: null,
      isLate: false,
      lateDays: null,
      isEarly: false,
      earlyDays: null,
    }),
    isCritical: projection.criticalMilestoneIds.has(m.id),
  }));

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
      area: hi.areaId
        ? toAreaSummaryInternal(
            areaMap.get(hi.areaId) ?? null,
            resolveAreaAncestors(hi.areaId, areaMap),
          )
        : null,
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
