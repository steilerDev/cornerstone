/**
 * Scheduling Engine — Critical Path Method (CPM) implementation.
 *
 * This module is a pure function: it takes work item and dependency data as input
 * and returns the proposed schedule. No database access occurs here.
 *
 * See wiki/ADR-014-Scheduling-Engine-Architecture.md for algorithm details.
 *
 * EPIC-06: Story 6.2 — Scheduling Engine (CPM, Auto-Schedule, Conflict Detection)
 * EPIC-06 UAT Fix 1: Added autoReschedule() for automatic rescheduling on constraint changes.
 */

import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import {
  workItems,
  workItemDependencies,
  workItemMilestoneDeps,
  milestoneWorkItems,
} from '../db/schema.js';
import type { ScheduleResponse, ScheduleWarning } from '@cornerstone/shared';

// ─── Input types for the pure scheduling engine ───────────────────────────────

/**
 * Minimal work item data required by the scheduling engine.
 */
export interface SchedulingWorkItem {
  id: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  durationDays: number | null;
  startAfter: string | null;
  startBefore: string | null;
}

/**
 * A dependency edge in the scheduling graph.
 */
export interface SchedulingDependency {
  predecessorId: string;
  successorId: string;
  dependencyType: 'finish_to_start' | 'start_to_start' | 'finish_to_finish' | 'start_to_finish';
  leadLagDays: number;
}

/**
 * Parameters for the scheduling engine's schedule() function.
 */
export interface ScheduleParams {
  mode: 'full' | 'cascade';
  anchorWorkItemId?: string;
  workItems: SchedulingWorkItem[];
  dependencies: SchedulingDependency[];
  /** Today's date in YYYY-MM-DD format (injectable for testability). */
  today: string;
}

/**
 * Result of the scheduling engine — extends ScheduleResponse with an optional cycleNodes
 * field that signals a circular dependency was detected.
 */
export interface ScheduleResult extends ScheduleResponse {
  /** Present and non-empty when a circular dependency is detected. */
  cycleNodes?: string[];
}

// ─── Internal CPM data structures ─────────────────────────────────────────────

interface NodeData {
  item: SchedulingWorkItem;
  duration: number; // 0 if no durationDays
  es: string; // Earliest start (ISO date)
  ef: string; // Earliest finish (ISO date)
  ls: string; // Latest start (ISO date)
  lf: string; // Latest finish (ISO date)
}

// ─── Date arithmetic helpers ───────────────────────────────────────────────────

/**
 * Parse an ISO 8601 date string (YYYY-MM-DD) and return a UTC Date object.
 * Using UTC midnight to avoid DST issues in date arithmetic.
 */
function parseDate(dateStr: string): Date {
  return new Date(dateStr + 'T00:00:00Z');
}

/**
 * Format a UTC Date object as an ISO 8601 date string (YYYY-MM-DD).
 */
function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Add a number of days to an ISO date string and return the result as ISO date string.
 * Positive adds days, negative subtracts.
 */
function addDays(dateStr: string, days: number): string {
  const d = parseDate(dateStr);
  d.setUTCDate(d.getUTCDate() + days);
  return formatDate(d);
}

/**
 * Return the later of two ISO date strings.
 */
function maxDate(a: string, b: string): string {
  return a >= b ? a : b;
}

/**
 * Return the earlier of two ISO date strings.
 */
function minDate(a: string, b: string): string {
  return a <= b ? a : b;
}

/**
 * Calculate the difference in calendar days between two ISO date strings (b - a).
 */
function diffDays(a: string, b: string): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / msPerDay);
}

// ─── Topological sort (Kahn's algorithm) ──────────────────────────────────────

/**
 * Perform Kahn's algorithm topological sort on a set of node IDs with edges.
 *
 * @param nodeIds - Set of all node IDs to include in the sort
 * @param edges - Directed edges as [predecessorId, successorId] pairs
 * @returns Object with sorted array and cycle array. If cycle is non-empty, a cycle was detected.
 */
function topologicalSort(
  nodeIds: Set<string>,
  edges: Array<[string, string]>,
): { sorted: string[]; cycle: string[] } {
  // Build adjacency list and in-degree map restricted to nodeIds
  const successors = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const id of nodeIds) {
    successors.set(id, []);
    inDegree.set(id, 0);
  }

  for (const [pred, succ] of edges) {
    // Only include edges where both endpoints are in the scheduled set
    if (!nodeIds.has(pred) || !nodeIds.has(succ)) continue;
    successors.get(pred)!.push(succ);
    inDegree.set(succ, (inDegree.get(succ) ?? 0) + 1);
  }

  // Queue: all nodes with in-degree 0 (no predecessors in this set)
  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const sorted: string[] = [];

  while (queue.length > 0) {
    // Sort queue for deterministic output (stable ordering by ID)
    queue.sort();
    const node = queue.shift()!;
    sorted.push(node);

    for (const succ of successors.get(node) ?? []) {
      const newDeg = (inDegree.get(succ) ?? 0) - 1;
      inDegree.set(succ, newDeg);
      if (newDeg === 0) {
        queue.push(succ);
      }
    }
  }

  if (sorted.length !== nodeIds.size) {
    // Cycle detected — collect nodes still with positive in-degree
    const cycle: string[] = [];
    for (const [id, deg] of inDegree) {
      if (deg > 0) cycle.push(id);
    }
    return { sorted, cycle };
  }

  return { sorted, cycle: [] };
}

// ─── Forward pass: compute ES and EF ─────────────────────────────────────────

/**
 * Compute the ES (earliest start) that a given dependency imposes on the successor.
 * Takes the successor's duration because FF and SF constraints are EF-based.
 *
 * ADR-014 dependency type rules:
 * - FS: Successor ES >= Predecessor EF + lead/lag
 * - SS: Successor ES >= Predecessor ES + lead/lag
 * - FF: Successor EF >= Predecessor EF + lead/lag  => Successor ES >= (PredEF + LL) - succDuration
 * - SF: Successor EF >= Predecessor ES + lead/lag  => Successor ES >= (PredES + LL) - succDuration
 */
function forwardDepEs(
  dep: SchedulingDependency,
  predNode: NodeData,
  successorDuration: number,
): string {
  const { dependencyType, leadLagDays } = dep;

  switch (dependencyType) {
    case 'finish_to_start':
      return addDays(predNode.ef, leadLagDays);

    case 'start_to_start':
      return addDays(predNode.es, leadLagDays);

    case 'finish_to_finish': {
      // Successor EF >= predNode.ef + leadLagDays
      // => Successor ES >= required_ef - successorDuration
      const requiredEf = addDays(predNode.ef, leadLagDays);
      return addDays(requiredEf, -successorDuration);
    }

    case 'start_to_finish': {
      // Successor EF >= predNode.es + leadLagDays
      // => Successor ES >= required_ef - successorDuration
      const requiredEf = addDays(predNode.es, leadLagDays);
      return addDays(requiredEf, -successorDuration);
    }
  }
}

// ─── Backward pass: compute LS and LF ────────────────────────────────────────

/**
 * Compute the LF (latest finish) constraint imposed on a predecessor by a given dependency.
 * Takes the predecessor's duration because SS and SF constraints are LS-based.
 *
 * ADR-014 backward pass rules:
 * - FS: Predecessor LF <= Successor LS - lead/lag
 * - SS: Predecessor LS <= Successor LS - lead/lag  => Predecessor LF <= (SucLS - LL) + predDuration
 * - FF: Predecessor LF <= Successor LF - lead/lag
 * - SF: Predecessor LS <= Successor LF - lead/lag  => Predecessor LF <= (SucLF - LL) + predDuration
 */
function backwardDepLf(
  dep: SchedulingDependency,
  succNode: NodeData,
  predDuration: number,
): string {
  const { dependencyType, leadLagDays } = dep;

  switch (dependencyType) {
    case 'finish_to_start':
      // Predecessor LF <= Successor LS - lead/lag
      return addDays(succNode.ls, -leadLagDays);

    case 'start_to_start': {
      // Predecessor LS <= Successor LS - lead/lag
      // => Predecessor LF = constrainedLS + predDuration
      const constrainedLs = addDays(succNode.ls, -leadLagDays);
      return addDays(constrainedLs, predDuration);
    }

    case 'finish_to_finish':
      // Predecessor LF <= Successor LF - lead/lag
      return addDays(succNode.lf, -leadLagDays);

    case 'start_to_finish': {
      // Predecessor LS <= Successor LF - lead/lag
      // => Predecessor LF = constrainedLS + predDuration
      const constrainedLs = addDays(succNode.lf, -leadLagDays);
      return addDays(constrainedLs, predDuration);
    }
  }
}

// ─── Cascade helper ───────────────────────────────────────────────────────────

/**
 * Build the set of all downstream successors of an anchor node (inclusive of anchor).
 * Uses BFS traversal of the dependency graph following successor edges.
 */
function buildDownstreamSet(anchorId: string, dependencies: SchedulingDependency[]): Set<string> {
  const successorsOf = new Map<string, string[]>();
  for (const dep of dependencies) {
    if (!successorsOf.has(dep.predecessorId)) {
      successorsOf.set(dep.predecessorId, []);
    }
    successorsOf.get(dep.predecessorId)!.push(dep.successorId);
  }

  const visited = new Set<string>();
  const queue: string[] = [anchorId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    for (const succ of successorsOf.get(current) ?? []) {
      if (!visited.has(succ)) {
        queue.push(succ);
      }
    }
  }

  return visited;
}

// ─── Main scheduling engine ────────────────────────────────────────────────────

/**
 * Run the CPM scheduling algorithm.
 *
 * This is a pure function — it takes data as input and returns the schedule result.
 * No database access occurs.
 *
 * @param params - Scheduling parameters including work items, dependencies, mode, and today's date
 * @returns ScheduleResult — scheduled items with CPM dates, critical path, warnings,
 *   and optionally cycleNodes if a circular dependency was detected
 */
export function schedule(params: ScheduleParams): ScheduleResult {
  const { mode, anchorWorkItemId, workItems, dependencies, today } = params;

  const warnings: ScheduleWarning[] = [];

  // ─── 1. Determine which items to schedule ────────────────────────────────────

  let scheduledIds: Set<string>;

  if (mode === 'full') {
    scheduledIds = new Set(workItems.map((wi) => wi.id));
  } else {
    // Cascade mode: anchor + all downstream successors
    if (!anchorWorkItemId) {
      throw new Error('anchorWorkItemId is required for cascade mode');
    }
    scheduledIds = buildDownstreamSet(anchorWorkItemId, dependencies);
  }

  // Index work items by ID
  const workItemMap = new Map<string, SchedulingWorkItem>();
  for (const wi of workItems) {
    workItemMap.set(wi.id, wi);
  }

  // Filter to items that exist in the data (handles orphaned IDs in cascade)
  const validScheduledIds = new Set<string>();
  for (const id of scheduledIds) {
    if (workItemMap.has(id)) {
      validScheduledIds.add(id);
    }
  }
  scheduledIds = validScheduledIds;

  // Empty result if nothing to schedule
  if (scheduledIds.size === 0) {
    return { scheduledItems: [], criticalPath: [], warnings };
  }

  // Build edge list for the scheduled node set
  const edges: Array<[string, string]> = dependencies
    .filter((d) => scheduledIds.has(d.predecessorId) && scheduledIds.has(d.successorId))
    .map((d) => [d.predecessorId, d.successorId] as [string, string]);

  // ─── 2. Topological sort (Kahn's algorithm) ──────────────────────────────────

  const { sorted: topoOrder, cycle } = topologicalSort(scheduledIds, edges);

  if (cycle.length > 0) {
    // Circular dependency detected — signal to the caller
    return { scheduledItems: [], criticalPath: [], warnings, cycleNodes: cycle };
  }

  // ─── 3. Build dependency index maps ──────────────────────────────────────────

  // predecessorDepsOf[id] = deps where id is the successor (id depends on these)
  const predecessorDepsOf = new Map<string, SchedulingDependency[]>();
  // successorDepsOf[id] = deps where id is the predecessor (these depend on id)
  const successorDepsOf = new Map<string, SchedulingDependency[]>();

  for (const id of scheduledIds) {
    predecessorDepsOf.set(id, []);
    successorDepsOf.set(id, []);
  }

  for (const dep of dependencies) {
    if (scheduledIds.has(dep.predecessorId) && scheduledIds.has(dep.successorId)) {
      predecessorDepsOf.get(dep.successorId)!.push(dep);
      successorDepsOf.get(dep.predecessorId)!.push(dep);
    }
  }

  // ─── 4. Forward pass: compute ES and EF ──────────────────────────────────────

  const nodes = new Map<string, NodeData>();

  for (const id of topoOrder) {
    const item = workItemMap.get(id)!;
    const duration = item.durationDays ?? 0;

    // Emit no_duration warning for items without a duration estimate
    if (item.durationDays === null || item.durationDays === undefined) {
      warnings.push({
        workItemId: id,
        type: 'no_duration',
        message: 'Work item has no duration set; scheduled as zero-duration',
      });
    }

    // Compute ES: start from the latest date implied by all predecessors
    const preds = predecessorDepsOf.get(id)!;
    let es: string;

    if (preds.length === 0) {
      // No predecessors within the scheduled set: start from today
      es = today;
    } else {
      // ES = max of all predecessor-derived ES constraints
      let maxEs = '0001-01-01'; // Sentinel: earliest possible date
      for (const dep of preds) {
        const predNode = nodes.get(dep.predecessorId)!;
        const depEs = forwardDepEs(dep, predNode, duration);
        maxEs = maxDate(maxEs, depEs);
      }
      es = maxEs;
    }

    // Apply start_after hard constraint (must start on or after this date)
    if (item.startAfter) {
      es = maxDate(es, item.startAfter);
    }

    const ef = addDays(es, duration);

    nodes.set(id, {
      item,
      duration,
      es,
      ef,
      ls: es, // Placeholder until backward pass
      lf: ef, // Placeholder until backward pass
    });

    // Emit start_before_violated soft warning
    if (item.startBefore && es > item.startBefore) {
      warnings.push({
        workItemId: id,
        type: 'start_before_violated',
        message: `Scheduled start date (${es}) exceeds start-before constraint (${item.startBefore})`,
      });
    }

    // Emit already_completed warning if dates would change
    if (item.status === 'completed') {
      const startWouldChange = item.startDate && es !== item.startDate;
      const endWouldChange = item.endDate && ef !== item.endDate;
      if (startWouldChange || endWouldChange) {
        warnings.push({
          workItemId: id,
          type: 'already_completed',
          message: 'Work item is already completed; dates cannot be changed by the scheduler',
        });
      }
    }
  }

  // ─── 5. Backward pass: compute LS and LF ─────────────────────────────────────

  // Traverse in reverse topological order
  for (const id of [...topoOrder].reverse()) {
    const node = nodes.get(id)!;
    const succs = successorDepsOf.get(id)!;

    if (succs.length === 0) {
      // Terminal node (no successors): LF = EF (project completion constraint)
      node.lf = node.ef;
      node.ls = node.es;
    } else {
      // LF = min of all successor-derived LF constraints
      let minLf = '9999-12-31'; // Sentinel: latest possible date
      for (const dep of succs) {
        const succNode = nodes.get(dep.successorId)!;
        const depLf = backwardDepLf(dep, succNode, node.duration);
        minLf = minDate(minLf, depLf);
      }
      node.lf = minLf;
      node.ls = addDays(minLf, -node.duration);
    }
  }

  // ─── 6. Calculate float and identify critical path ────────────────────────────

  const criticalPath: string[] = [];
  const scheduledItems: ScheduleResponse['scheduledItems'] = [];

  for (const id of topoOrder) {
    const node = nodes.get(id)!;
    // Total float = LS - ES (in days). Zero or negative = critical.
    const totalFloat = diffDays(node.es, node.ls);
    const isCritical = totalFloat <= 0;

    if (isCritical) {
      criticalPath.push(id);
    }

    scheduledItems.push({
      workItemId: id,
      previousStartDate: node.item.startDate,
      previousEndDate: node.item.endDate,
      scheduledStartDate: node.es,
      scheduledEndDate: node.ef,
      latestStartDate: node.ls,
      latestFinishDate: node.lf,
      // Clamp to 0: negative float means infeasible (constraints cannot be simultaneously met)
      totalFloat: Math.max(0, totalFloat),
      isCritical,
    });
  }

  return { scheduledItems, criticalPath, warnings };
}

// ─── Auto-reschedule (database-aware) ─────────────────────────────────────────

type DbType = BetterSQLite3Database<typeof schemaTypes>;

/**
 * Fetch all work items from the database, run the CPM scheduler, and apply any
 * changed dates back to the database.
 *
 * Milestone dependency expansion:
 *   For each required milestone dependency (WI depends on milestone M), we find all
 *   work items that are linked/contributing to M via milestone_work_items. We then
 *   create synthetic finish-to-start dependencies from each contributing WI to the
 *   dependent WI and feed them into the CPM engine alongside the real dependencies.
 *
 * @param db - Drizzle database handle
 * @returns The count of work items whose dates were updated
 */
export function autoReschedule(db: DbType): number {
  // ── 1. Fetch all work items ──────────────────────────────────────────────────

  const allWorkItems = db.select().from(workItems).all();

  if (allWorkItems.length === 0) {
    return 0;
  }

  // ── 2. Fetch real dependencies ───────────────────────────────────────────────

  const allDependencies = db.select().from(workItemDependencies).all();

  // ── 3. Milestone dependency expansion ───────────────────────────────────────
  //
  // For each row in work_item_milestone_deps (WI depends on milestone M),
  // find all work items contributing to M (via milestone_work_items).
  // Generate synthetic finish-to-start deps from each contributor to the dependent WI.

  const allMilestoneDeps = db.select().from(workItemMilestoneDeps).all();
  const allMilestoneLinks = db.select().from(milestoneWorkItems).all();

  // Build milestoneId → contributing workItemIds map
  const milestoneContributorsMap = new Map<number, string[]>();
  for (const link of allMilestoneLinks) {
    const existing = milestoneContributorsMap.get(link.milestoneId) ?? [];
    existing.push(link.workItemId);
    milestoneContributorsMap.set(link.milestoneId, existing);
  }

  const syntheticDeps: SchedulingDependency[] = [];

  for (const milestoneDep of allMilestoneDeps) {
    const contributingIds = milestoneContributorsMap.get(milestoneDep.milestoneId) ?? [];
    for (const contributorId of contributingIds) {
      // Avoid self-references (should not occur, but guard defensively)
      if (contributorId !== milestoneDep.workItemId) {
        syntheticDeps.push({
          predecessorId: contributorId,
          successorId: milestoneDep.workItemId,
          dependencyType: 'finish_to_start',
          leadLagDays: 0,
        });
      }
    }
  }

  // ── 4. Build combined dependency list for the engine ────────────────────────

  const engineWorkItems: SchedulingWorkItem[] = allWorkItems.map((wi) => ({
    id: wi.id,
    status: wi.status,
    startDate: wi.startDate,
    endDate: wi.endDate,
    durationDays: wi.durationDays,
    startAfter: wi.startAfter,
    startBefore: wi.startBefore,
  }));

  const realDeps: SchedulingDependency[] = allDependencies.map((dep) => ({
    predecessorId: dep.predecessorId,
    successorId: dep.successorId,
    dependencyType: dep.dependencyType,
    leadLagDays: dep.leadLagDays,
  }));

  const engineDependencies: SchedulingDependency[] = [...realDeps, ...syntheticDeps];

  const today = new Date().toISOString().slice(0, 10);

  // ── 5. Run the CPM scheduler ─────────────────────────────────────────────────

  const result = schedule({
    mode: 'full',
    workItems: engineWorkItems,
    dependencies: engineDependencies,
    today,
  });

  // If a cycle is detected, skip rescheduling silently — the dependency creation
  // endpoint surfaces cycle errors before reaching here, but guard defensively.
  if (result.cycleNodes && result.cycleNodes.length > 0) {
    return 0;
  }

  // ── 6. Apply changed dates back to the database ──────────────────────────────

  // Build a map of current startDate/endDate by workItemId for comparison
  const currentDatesMap = new Map<string, { startDate: string | null; endDate: string | null }>();
  for (const wi of allWorkItems) {
    currentDatesMap.set(wi.id, { startDate: wi.startDate, endDate: wi.endDate });
  }

  let updatedCount = 0;
  const now = new Date().toISOString();

  for (const scheduled of result.scheduledItems) {
    const current = currentDatesMap.get(scheduled.workItemId);
    if (!current) continue;

    const newStart = scheduled.scheduledStartDate;
    const newEnd = scheduled.scheduledEndDate;

    const startChanged = newStart !== current.startDate;
    const endChanged = newEnd !== current.endDate;

    if (startChanged || endChanged) {
      db.update(workItems)
        .set({
          startDate: newStart,
          endDate: newEnd,
          updatedAt: now,
        })
        .where(eq(workItems.id, scheduled.workItemId))
        .run();
      updatedCount++;
    }
  }

  return updatedCount;
}
