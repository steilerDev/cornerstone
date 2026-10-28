/**
 * Holds up (#2229, EPIC-21 contract 1 / AC7): the ONE definition of "how much work does this
 * slip hold up". The attention service, the task page (5.2) and the Reschedule preview (5.3)
 * all call `computeHoldsUp`; no surface counts its own.
 *
 * Pure: no database, no clock. Works on the schedule graph (`loadScheduleGraph`) and one
 * projection (`projectSchedule`).
 */

import type { AttentionHoldsUp } from '@cornerstone/shared';
import { MILESTONE_NODE_PREFIX } from '../schedulingEngine.js';
import type { ScheduleGraph, ScheduleProjection, SchedulingWorkItem } from '../schedulingEngine.js';

/** Window (days after today) for `startingWithin14Days`. */
export const HOLDS_UP_SOON_DAYS = 14;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Add days to an ISO date (UTC; never local time). */
export function addDaysUtc(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Calendar days from `a` to `b` (b - a), UTC. */
export function diffDaysUtc(a: string, b: string): number {
  return Math.round(
    (new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / MS_PER_DAY,
  );
}

export interface ScheduleIndex {
  /** node id -> distinct successor node ids */
  successors: Map<string, string[]>;
  /** node id -> distinct predecessor node ids */
  predecessors: Map<string, string[]>;
  nodes: Map<string, SchedulingWorkItem>;
}

export interface HoldsUpContext {
  today: string;
  projection: Pick<ScheduleProjection, 'workItems'>;
}

export interface HoldsUpResult extends AttentionHoldsUp {
  /** Visited unfinished work item ids (for group unions). */
  ids: Set<string>;
}

/** Successor/predecessor index over the schedule graph, built once per request. */
export function buildScheduleIndex(
  graph: Pick<ScheduleGraph, 'workItems' | 'dependencies'>,
): ScheduleIndex {
  const nodes = new Map<string, SchedulingWorkItem>();
  for (const wi of graph.workItems) nodes.set(wi.id, wi);

  const successors = new Map<string, string[]>();
  const predecessors = new Map<string, string[]>();
  const seen = new Set<string>();
  for (const dep of graph.dependencies) {
    const edgeKey = `${dep.predecessorId}\u0000${dep.successorId}`;
    if (seen.has(edgeKey)) continue;
    seen.add(edgeKey);
    const succ = successors.get(dep.predecessorId) ?? [];
    succ.push(dep.successorId);
    successors.set(dep.predecessorId, succ);
    const pred = predecessors.get(dep.successorId) ?? [];
    pred.push(dep.predecessorId);
    predecessors.set(dep.successorId, pred);
  }
  return { successors, predecessors, nodes };
}

/**
 * Work that waits for `subjectNodeId` (a work item id or `milestone:<id>`), directly or through
 * chains and unreached milestone gates. Breadth-first over successor edges; a finished node
 * (completed task, reached milestone) is neither counted nor entered, because it no longer
 * passes a slip on. The subject itself is never counted. Cycle-safe.
 *
 * - `count`: visited unfinished work items (milestones are passed through, never counted).
 * - `startingWithin14Days`: of those, not-started ones whose planned start
 *   (`start_date ?? projectedStartDate`) is on or before today + 14 (past starts included).
 */
export function computeHoldsUp(
  index: ScheduleIndex,
  subjectNodeId: string,
  ctx: HoldsUpContext,
): HoldsUpResult {
  const visited = new Set<string>([subjectNodeId]);
  const ids = new Set<string>();
  const queue: string[] = [subjectNodeId];

  // for...of over an array also visits elements pushed during iteration (breadth-first)
  for (const current of queue) {
    for (const next of index.successors.get(current) ?? []) {
      if (visited.has(next)) continue;
      visited.add(next);
      const node = index.nodes.get(next);
      if (!node || node.status === 'completed') continue;
      queue.push(next);
      if (!next.startsWith(MILESTONE_NODE_PREFIX)) ids.add(next);
    }
  }

  return { ...summarizeHoldsUp(index, ids, ctx), ids };
}

/**
 * Counts for a set of unfinished work item ids. Used by `computeHoldsUp` and, for a grouped
 * row, on the union of its members' sets, so a group shares the same definition.
 */
export function summarizeHoldsUp(
  index: ScheduleIndex,
  ids: ReadonlySet<string>,
  ctx: HoldsUpContext,
): AttentionHoldsUp {
  const limit = addDaysUtc(ctx.today, HOLDS_UP_SOON_DAYS);
  let startingSoon = 0;
  for (const id of ids) {
    const node = index.nodes.get(id);
    if (!node || node.status !== 'not_started') continue;
    const start = node.startDate ?? ctx.projection.workItems.get(id)?.projectedStartDate;
    if (start !== null && start !== undefined && start <= limit) startingSoon += 1;
  }
  return { count: ids.size, startingWithin14Days: startingSoon };
}

/**
 * Distinct unfinished real direct predecessors of a task: real ones, plus the contributors of
 * unreached milestone gates (a reached milestone no longer gates, so it contributes nothing).
 */
function directPredecessorIds(index: ScheduleIndex, workItemId: string): string[] {
  const direct = new Set<string>();
  for (const pred of index.predecessors.get(workItemId) ?? []) {
    if (pred.startsWith(MILESTONE_NODE_PREFIX)) {
      if (index.nodes.get(pred)?.status === 'completed') continue;
      for (const contributor of index.predecessors.get(pred) ?? []) direct.add(contributor);
    } else {
      direct.add(pred);
    }
  }
  return [...direct].filter((id) => {
    if (id.startsWith(MILESTONE_NODE_PREFIX)) return false;
    const node = index.nodes.get(id);
    return node !== undefined && node.status !== 'completed';
  });
}

/** The id with the latest projectedEndDate (null last), ties by id ascending. */
function latestEndingId(
  ids: readonly string[],
  projection: Pick<ScheduleProjection, 'workItems'>,
): string | null {
  let best: string | null = null;
  let bestEnd: string | null = null;
  for (const id of ids) {
    const end = projection.workItems.get(id)?.projectedEndDate ?? null;
    let better: boolean;
    if (best === null) better = true;
    else if (end !== bestEnd) better = end !== null && (bestEnd === null || end > bestEnd);
    else better = id < best;
    if (better) {
      best = id;
      bestEnd = end;
    }
  }
  return best;
}

/**
 * The unfinished direct predecessor (real, or a contributor of an unreached milestone gate) that
 * is late or held up; the one with the latest projectedEndDate (null last), ties by id ascending.
 * null when none. N2 folding and the Home "Waits for" line share this definition.
 */
export function heldUpCauseOf(
  index: ScheduleIndex,
  workItemId: string,
  projection: Pick<ScheduleProjection, 'workItems'>,
): string | null {
  const slipping = directPredecessorIds(index, workItemId).filter((id) => {
    const fields = projection.workItems.get(id);
    return fields !== undefined && (fields.isLate || fields.isHeldUp);
  });
  return latestEndingId(slipping, projection);
}

/**
 * What a task waits for (Tasks list "Waits for"): the number of unfinished direct predecessors
 * and the one shown first, which is `heldUpCauseOf` when there is one (so Home agrees), else the
 * latest-ending predecessor. null when it waits for nothing.
 */
export function waitsForOf(
  index: ScheduleIndex,
  workItemId: string,
  projection: Pick<ScheduleProjection, 'workItems'>,
): { firstId: string; count: number } | null {
  const direct = directPredecessorIds(index, workItemId);
  const firstId =
    heldUpCauseOf(index, workItemId, projection) ?? latestEndingId(direct, projection);
  return firstId === null ? null : { firstId, count: direct.length };
}

/**
 * True when an unfinished direct predecessor of the task is itself late or held up, so the
 * task's lateness is already inside that predecessor's chain (N2 folding).
 */
export function isFoldedLateStart(
  index: ScheduleIndex,
  workItemId: string,
  projection: Pick<ScheduleProjection, 'workItems'>,
): boolean {
  return heldUpCauseOf(index, workItemId, projection) !== null;
}
