/**
 * Schedule preview (#2247, EPIC-21 contract 3): the pure part of POST /api/schedule when the
 * request carries `overrides`. Overrides are applied in memory to a copy of the engine inputs;
 * nothing is persisted. Pure: no database, no clock (`today` is passed in).
 */

import type {
  ScheduleImpact,
  ScheduleImpactItem,
  ScheduleImpactMilestone,
  ScheduleOverride,
} from '@cornerstone/shared';
import { CircularDependencyError, ValidationError } from '../errors/AppError.js';
import {
  MILESTONE_NODE_PREFIX,
  projectSchedule,
  shownWorkItemDates,
  workItemProjectionOf,
} from './schedulingEngine.js';
import type { ScheduleGraph, ScheduleProjection, SchedulingWorkItem } from './schedulingEngine.js';
import {
  buildScheduleIndex,
  computeHoldsUp,
  diffDaysUtc,
  summarizeHoldsUp,
} from './shared/holdsUp.js';
import { isValidIsoDate } from './shared/validators.js';

/** The engine inputs an override may change. */
export type SchedulePatch = Partial<
  Pick<SchedulingWorkItem, 'startDate' | 'endDate' | 'durationDays'>
>;

/** Real (non-milestone) work item ids of a graph. */
export function realWorkItemIds(graph: Pick<ScheduleGraph, 'workItems'>): Set<string> {
  const ids = new Set<string>();
  for (const wi of graph.workItems) {
    if (!wi.id.startsWith(MILESTONE_NODE_PREFIX)) ids.add(wi.id);
  }
  return ids;
}

/**
 * Validate the overrides. Details carry ids and a reason only, never titles.
 * Checked in order: duplicate, unknown_work_item, invalid_date, start_after_end.
 */
export function validateOverrides(
  overrides: readonly ScheduleOverride[],
  knownWorkItemIds: ReadonlySet<string>,
): void {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const o of overrides) {
    if (seen.has(o.workItemId)) duplicates.add(o.workItemId);
    seen.add(o.workItemId);
  }
  if (duplicates.size > 0) {
    throw new ValidationError('Duplicate work item in overrides', {
      workItemIds: [...duplicates],
      reason: 'duplicate',
    });
  }

  const unknown = overrides.filter((o) => !knownWorkItemIds.has(o.workItemId));
  if (unknown.length > 0) {
    throw new ValidationError('Unknown work item in overrides', {
      workItemIds: unknown.map((o) => o.workItemId),
      reason: 'unknown_work_item',
    });
  }

  const badDate = overrides.filter(
    (o) =>
      (o.startDate !== undefined && !isValidIsoDate(o.startDate)) ||
      (o.endDate !== undefined && !isValidIsoDate(o.endDate)),
  );
  if (badDate.length > 0) {
    throw new ValidationError('Invalid date in overrides', {
      workItemIds: badDate.map((o) => o.workItemId),
      reason: 'invalid_date',
    });
  }

  const reversed = overrides.filter(
    (o) => o.startDate !== undefined && o.endDate !== undefined && o.startDate > o.endDate,
  );
  if (reversed.length > 0) {
    throw new ValidationError('Override start is after its end', {
      workItemIds: reversed.map((o) => o.workItemId),
      reason: 'start_after_end',
    });
  }
}

/**
 * Turn validated overrides into engine patches (D1). `durationDays` drives the engine when
 * present; an `endDate` alone becomes a duration from the effective start
 * (override start, actual start, baseline projected start, stored start); with no effective
 * start only the end date is set.
 */
export function resolveOverrides(
  graph: Pick<ScheduleGraph, 'workItems'>,
  baseline: ScheduleProjection,
  overrides: readonly ScheduleOverride[],
): Map<string, SchedulePatch> {
  const byId = new Map(graph.workItems.map((wi) => [wi.id, wi]));
  const patches = new Map<string, SchedulePatch>();
  for (const o of overrides) {
    const patch: SchedulePatch = {};
    if (o.startDate !== undefined) patch.startDate = o.startDate;
    if (o.durationDays !== undefined) {
      patch.durationDays = o.durationDays;
    } else if (o.endDate !== undefined) {
      // validateOverrides guarantees the id is a known work item
      const wi = byId.get(o.workItemId)!;
      const start =
        o.startDate ??
        wi.actualStartDate ??
        workItemProjectionOf(baseline, wi).projectedStartDate ??
        wi.startDate;
      if (start === null) {
        patch.endDate = o.endDate;
      } else {
        const duration = diffDaysUtc(start, o.endDate);
        if (duration < 0) {
          throw new ValidationError('Override end is before its start', {
            workItemIds: [o.workItemId],
            reason: 'end_before_start',
          });
        }
        patch.durationDays = duration;
      }
    }
    patches.set(o.workItemId, patch);
  }
  return patches;
}

/** Copies of the items with the patches applied; never mutates the input. */
export function applyOverrides(
  items: readonly SchedulingWorkItem[],
  patches: ReadonlyMap<string, SchedulePatch>,
): SchedulingWorkItem[] {
  return items.map((item) => ({ ...item, ...patches.get(item.id) }));
}

function latest(dates: readonly (string | null)[]): string | null {
  let best: string | null = null;
  for (const d of dates) {
    if (d !== null && (best === null || d > best)) best = d;
  }
  return best;
}

/**
 * The graph as it would be stored after Save + autoReschedule: every dated task carries the
 * planned (unfloored) dates the engine computed, so stored dates no longer pin successors
 * (a projection shows stored dates unless the today floor moved them). Undated tasks,
 * completed tasks (actual dates win, so their shown end is unchanged) and milestone nodes are
 * left as they are.
 */
function settleGraph(graph: ScheduleGraph, planned: ScheduleProjection['planned']): ScheduleGraph {
  const plannedById = new Map(planned.scheduledItems.map((i) => [i.workItemId, i]));
  const hasPredecessor = new Set(graph.dependencies.map((d) => d.successorId));
  const workItems = graph.workItems.map((wi) => {
    if (wi.id.startsWith(MILESTONE_NODE_PREFIX)) return wi;
    if (wi.status === 'completed') return wi;
    if (wi.startDate === null && !hasPredecessor.has(wi.id)) return wi;
    // No cycle, so every task is scheduled
    const scheduled = plannedById.get(wi.id)!;
    return { ...wi, startDate: scheduled.scheduledStartDate, endDate: scheduled.scheduledEndDate };
  });
  return { ...graph, workItems };
}

/** A validated preview: baseline and previewed projections plus the engine patches. */
export interface PreparedPreview {
  graph: ScheduleGraph;
  previewGraph: ScheduleGraph;
  baseline: ScheduleProjection;
  preview: ScheduleProjection;
  patches: Map<string, SchedulePatch>;
  overriddenIds: string[];
  today: string;
}

/**
 * Validate the overrides against the graph and project the baseline and the previewed schedule.
 * Throws ValidationError (400) or CircularDependencyError (409).
 */
export function prepareSchedulePreview(
  graph: ScheduleGraph,
  overrides: readonly ScheduleOverride[],
  today: string,
): PreparedPreview {
  validateOverrides(overrides, realWorkItemIds(graph));
  const baseline = projectSchedule(graph, today);
  if (baseline.hasCycle) {
    throw new CircularDependencyError('The dependency graph contains a circular dependency', {
      // work items only (ADR-009); the cycle check ignores the today floor, so planned carries them
      cycle: baseline.planned.cycleNodes!.filter((id) => !id.startsWith(MILESTONE_NODE_PREFIX)),
    });
  }
  const patches = resolveOverrides(graph, baseline, overrides);
  const patchedGraph = { ...graph, workItems: applyOverrides(graph.workItems, patches) };
  // Predict what Save + autoReschedule would store, then project that (nothing is written)
  const previewGraph = settleGraph(patchedGraph, projectSchedule(patchedGraph, today).planned);
  return {
    graph,
    previewGraph,
    baseline,
    preview: projectSchedule(previewGraph, today),
    patches,
    overriddenIds: overrides.map((o) => o.workItemId),
    today,
  };
}

/** What the previewed overrides change (D2). */
export function computeScheduleImpact(args: PreparedPreview): ScheduleImpact {
  const { graph, previewGraph, baseline, preview, overriddenIds, today } = args;
  const overridden = new Set(overriddenIds);

  const movedItems: ScheduleImpactItem[] = [];
  const previousEnds: (string | null)[] = [];
  const newEnds: (string | null)[] = [];
  for (const wi of graph.workItems) {
    if (wi.id.startsWith(MILESTONE_NODE_PREFIX)) continue;
    const previousEnd = shownWorkItemDates(wi, workItemProjectionOf(baseline, wi)).end;
    const newEnd = shownWorkItemDates(wi, workItemProjectionOf(preview, wi)).end;
    previousEnds.push(previousEnd);
    newEnds.push(newEnd);
    if (wi.status === 'completed' || overridden.has(wi.id)) continue;
    if (previousEnd === null || newEnd === null || previousEnd === newEnd) continue;
    movedItems.push({
      workItemId: wi.id,
      previousEndDate: previousEnd,
      newEndDate: newEnd,
      deltaDays: diffDaysUtc(previousEnd, newEnd),
      isLate: workItemProjectionOf(preview, wi).isLate,
    });
  }
  movedItems.sort(
    (a, b) => a.newEndDate.localeCompare(b.newEndDate) || a.workItemId.localeCompare(b.workItemId),
  );

  const milestones: ScheduleImpactMilestone[] = [];
  for (const m of graph.milestones) {
    if (m.isCompleted || m.completedAt !== null) continue;
    // Every graph milestone has projection fields
    const previous = baseline.milestones.get(m.id)!.projectedDate;
    const next = preview.milestones.get(m.id)!.projectedDate;
    if (previous === null || next === null || previous === next) continue;
    milestones.push({
      milestoneId: m.id,
      previousProjectedDate: previous,
      newProjectedDate: next,
      deltaDays: diffDaysUtc(previous, next),
    });
  }
  milestones.sort(
    (a, b) => a.newProjectedDate.localeCompare(b.newProjectedDate) || a.milestoneId - b.milestoneId,
  );

  const index = buildScheduleIndex(previewGraph);
  const ctx = { today, projection: preview };
  const union = new Set<string>();
  for (const id of overriddenIds) {
    for (const held of computeHoldsUp(index, id, ctx).ids) union.add(held);
  }

  return {
    movedItems,
    milestones,
    projectEnd: { previousDate: latest(previousEnds), newDate: latest(newEnds) },
    holdsUp: summarizeHoldsUp(index, union, ctx),
  };
}
