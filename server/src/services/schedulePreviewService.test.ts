/**
 * Schedule preview (#2247, contract 3): pure service. Synthetic graphs only.
 *
 * Mutations these tests catch:
 *  - overrides persisted/mutating the input graph (applyOverrides copies);
 *  - endDate winning over durationDays; a wrong effective-start chain (override start, actual,
 *    baseline projected, stored); a null start not falling back to endDate only;
 *  - overridden, completed or unchanged tasks listed in movedItems; wrong sort or delta sign;
 *  - reached milestones listed; milestones without a contributor listed;
 *  - holdsUp counting a shared successor twice or taking only the first overridden task;
 *  - the baseline cycle check being skipped.
 */

import { describe, it, expect } from '@jest/globals';
import { CircularDependencyError, ValidationError } from '../errors/AppError.js';
import { MILESTONE_NODE_PREFIX, projectSchedule } from './schedulingEngine.js';
import type {
  ScheduleGraph,
  SchedulingDependency,
  SchedulingWorkItem,
} from './schedulingEngine.js';
import { buildScheduleIndex, computeHoldsUp, summarizeHoldsUp } from './shared/holdsUp.js';
import {
  applyOverrides,
  computeScheduleImpact,
  prepareSchedulePreview,
  realWorkItemIds,
  resolveOverrides,
  validateOverrides,
} from './schedulePreviewService.js';

const TODAY = '2026-03-02';

function wi(id: string, o: Partial<SchedulingWorkItem> = {}): SchedulingWorkItem {
  return {
    id,
    status: 'not_started',
    startDate: null,
    endDate: null,
    actualStartDate: null,
    actualEndDate: null,
    durationDays: null,
    startAfter: null,
    startBefore: null,
    ...o,
  };
}

/** A dated, not-started task: stored start + duration, stored end consistent. */
function dated(id: string, start: string, duration: number, o: Partial<SchedulingWorkItem> = {}) {
  const end = new Date(`${start}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + duration);
  return wi(id, {
    startDate: start,
    endDate: end.toISOString().slice(0, 10),
    durationDays: duration,
    ...o,
  });
}

/**
 * A not-started task whose stored dates lie before TODAY: the forecast floors it to today, so
 * its shown dates come from the engine run (a task whose stored dates already equal the plan
 * shows them unchanged, see the it.failing case below).
 */
function past(id: string, duration: number, o: Partial<SchedulingWorkItem> = {}) {
  return dated(id, '2026-02-01', duration, o);
}

function fs(predecessorId: string, successorId: string, leadLagDays = 0): SchedulingDependency {
  return { predecessorId, successorId, dependencyType: 'finish_to_start', leadLagDays };
}

type MilestoneRow = ScheduleGraph['milestones'][number];

function milestoneRow(id: number, targetDate: string, o: Partial<MilestoneRow> = {}): MilestoneRow {
  return {
    id,
    title: `Milestone ${id}`,
    description: null,
    targetDate,
    isCompleted: false,
    completedAt: null,
    color: null,
    createdBy: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...o,
  };
}

/** Milestone virtual node for a milestone row, as loadScheduleGraph builds it. */
function milestoneNode(m: MilestoneRow): SchedulingWorkItem {
  const done = m.completedAt ? m.completedAt.slice(0, 10) : null;
  return wi(`${MILESTONE_NODE_PREFIX}${m.id}`, {
    status: m.completedAt ? 'completed' : 'not_started',
    startDate: done ?? m.targetDate,
    endDate: done ?? m.targetDate,
    actualStartDate: done,
    actualEndDate: done,
    durationDays: 0,
  });
}

function graphOf(
  items: SchedulingWorkItem[],
  deps: SchedulingDependency[] = [],
  ms: MilestoneRow[] = [],
  contributors: Record<number, string[]> = {},
): ScheduleGraph {
  return {
    workItems: [...items, ...ms.filter((m) => contributors[m.id]).map(milestoneNode)],
    dependencies: [
      ...deps,
      ...ms.flatMap((m) =>
        (contributors[m.id] ?? []).map((c) => fs(c, `${MILESTONE_NODE_PREFIX}${m.id}`)),
      ),
    ],
    milestones: ms,
    milestoneContributors: new Map(Object.entries(contributors).map(([k, v]) => [Number(k), v])),
  };
}

describe('realWorkItemIds', () => {
  it('lists real tasks and skips milestone nodes', () => {
    const ids = realWorkItemIds({ workItems: [wi('a'), wi('b'), wi('milestone:3')] });
    expect([...ids].sort()).toEqual(['a', 'b']);
  });
});

describe('validateOverrides', () => {
  const known = new Set(['a', 'b']);

  it('accepts valid overrides', () => {
    expect(() =>
      validateOverrides(
        [
          { workItemId: 'a', startDate: '2026-03-03', endDate: '2026-03-03' },
          { workItemId: 'b', durationDays: 2 },
        ],
        known,
      ),
    ).not.toThrow();
  });

  function failure(fn: () => void): ValidationError {
    try {
      fn();
    } catch (e) {
      return e as ValidationError;
    }
    throw new Error('expected a ValidationError');
  }

  it('rejects a duplicated work item with the duplicate ids and no titles', () => {
    const err = failure(() =>
      validateOverrides(
        [
          { workItemId: 'a', durationDays: 1 },
          { workItemId: 'a', durationDays: 2 },
          { workItemId: 'b', durationDays: 2 },
        ],
        known,
      ),
    );
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.details).toEqual({ workItemIds: ['a'], reason: 'duplicate' });
  });

  it('rejects unknown work items', () => {
    const err = failure(() =>
      validateOverrides(
        [
          { workItemId: 'zzz', durationDays: 1 },
          { workItemId: 'a', durationDays: 1 },
        ],
        known,
      ),
    );
    expect(err.details).toEqual({ workItemIds: ['zzz'], reason: 'unknown_work_item' });
  });

  it('rejects a milestone node id as unknown (only real tasks are known)', () => {
    const err = failure(() =>
      validateOverrides([{ workItemId: 'milestone:1', durationDays: 1 }], known),
    );
    expect(err.details).toMatchObject({ reason: 'unknown_work_item' });
  });

  it('rejects an impossible calendar start date', () => {
    const err = failure(() =>
      validateOverrides([{ workItemId: 'a', startDate: '2026-02-30' }], known),
    );
    expect(err.details).toEqual({ workItemIds: ['a'], reason: 'invalid_date' });
  });

  it('rejects an impossible calendar end date', () => {
    const err = failure(() =>
      validateOverrides(
        [
          { workItemId: 'b', durationDays: 1 },
          { workItemId: 'a', endDate: '2026-13-01' },
        ],
        known,
      ),
    );
    expect(err.details).toEqual({ workItemIds: ['a'], reason: 'invalid_date' });
  });

  it('rejects a start after the end', () => {
    const err = failure(() =>
      validateOverrides(
        [{ workItemId: 'a', startDate: '2026-03-05', endDate: '2026-03-04' }],
        known,
      ),
    );
    expect(err.details).toEqual({ workItemIds: ['a'], reason: 'start_after_end' });
  });

  it('allows start equal to end', () => {
    expect(() =>
      validateOverrides(
        [{ workItemId: 'a', startDate: '2026-03-05', endDate: '2026-03-05' }],
        known,
      ),
    ).not.toThrow();
  });

  it('checks duplicate before unknown before invalid date before order', () => {
    const err = failure(() =>
      validateOverrides(
        [
          { workItemId: 'a', startDate: '2026-02-30' },
          { workItemId: 'a', startDate: '2026-02-30' },
          { workItemId: 'zzz', durationDays: 1 },
        ],
        known,
      ),
    );
    expect(err.details).toMatchObject({ reason: 'duplicate' });
  });
});

describe('resolveOverrides (D1 conversions)', () => {
  const baselineOf = (graph: ScheduleGraph) => projectSchedule(graph, TODAY);

  it('copies startDate and durationDays as-is', () => {
    const graph = graphOf([dated('a', '2026-03-09', 5)]);
    const patches = resolveOverrides(graph, baselineOf(graph), [
      { workItemId: 'a', startDate: '2026-03-10', durationDays: 7 },
    ]);
    expect(patches.get('a')).toEqual({ startDate: '2026-03-10', durationDays: 7 });
  });

  it('lets durationDays win when endDate is also present', () => {
    const graph = graphOf([dated('a', '2026-03-09', 5)]);
    const patches = resolveOverrides(graph, baselineOf(graph), [
      { workItemId: 'a', endDate: '2026-04-30', durationDays: 3 },
    ]);
    expect(patches.get('a')).toEqual({ durationDays: 3 });
  });

  it('converts an endDate to a duration from the override start first', () => {
    const graph = graphOf([dated('a', '2026-03-09', 5, { actualStartDate: '2026-03-01' })]);
    const patches = resolveOverrides(graph, baselineOf(graph), [
      { workItemId: 'a', startDate: '2026-03-10', endDate: '2026-03-15' },
    ]);
    expect(patches.get('a')).toEqual({ startDate: '2026-03-10', durationDays: 5 });
  });

  it('converts an endDate from the actual start when there is no override start', () => {
    const graph = graphOf([
      dated('a', '2026-03-09', 5, { status: 'in_progress', actualStartDate: '2026-03-05' }),
    ]);
    const patches = resolveOverrides(graph, baselineOf(graph), [
      { workItemId: 'a', endDate: '2026-03-12' },
    ]);
    expect(patches.get('a')).toEqual({ durationDays: 7 });
  });

  it('converts an endDate from the baseline projected start of a held-up task', () => {
    // b waits for a (forecast end 03-13), so its projected start differs from its stored 02-01
    const graph = graphOf([past('a', 11), past('b', 3)], [fs('a', 'b')]);
    const baseline = baselineOf(graph);
    expect(baseline.workItems.get('b')!.projectedStartDate).toBe('2026-03-13');
    const patches = resolveOverrides(graph, baseline, [{ workItemId: 'b', endDate: '2026-03-23' }]);
    expect(patches.get('b')).toEqual({ durationDays: 10 });
  });

  it('converts an endDate from the stored start when the baseline has no projection for it', () => {
    const graph = graphOf([dated('a', '2026-03-09', 5)]);
    const baseline = { ...baselineOf(graph), workItems: new Map() };
    const patches = resolveOverrides(graph, baseline, [{ workItemId: 'a', endDate: '2026-03-19' }]);
    expect(patches.get('a')).toEqual({ durationDays: 10 });
  });

  it('sets only the end date when the task has no effective start', () => {
    const graph = graphOf([wi('a')]);
    const baseline = { ...baselineOf(graph), workItems: new Map() };
    const patches = resolveOverrides(graph, baseline, [{ workItemId: 'a', endDate: '2026-03-19' }]);
    expect(patches.get('a')).toEqual({ endDate: '2026-03-19' });
  });

  it('rejects an endDate before the effective start with end_before_start', () => {
    const graph = graphOf([dated('a', '2026-03-09', 5)]);
    let err: ValidationError | undefined;
    try {
      resolveOverrides(graph, baselineOf(graph), [{ workItemId: 'a', endDate: '2026-03-01' }]);
    } catch (e) {
      err = e as ValidationError;
    }
    expect(err).toBeInstanceOf(ValidationError);
    expect(err!.details).toEqual({ workItemIds: ['a'], reason: 'end_before_start' });
  });

  it('accepts an endDate equal to the effective start as a zero duration', () => {
    const graph = graphOf([dated('a', '2026-03-09', 5)]);
    const patches = resolveOverrides(graph, baselineOf(graph), [
      { workItemId: 'a', endDate: '2026-03-09' },
    ]);
    expect(patches.get('a')).toEqual({ durationDays: 0 });
  });
});

describe('applyOverrides', () => {
  it('returns patched copies and leaves the input untouched', () => {
    const items = [dated('a', '2026-03-09', 5), dated('b', '2026-03-09', 5)];
    const snapshot = JSON.parse(JSON.stringify(items));
    const out = applyOverrides(
      items,
      new Map([['a', { durationDays: 9, startDate: '2026-03-10' }]]),
    );
    expect(out[0]).toMatchObject({ id: 'a', durationDays: 9, startDate: '2026-03-10' });
    expect(out[1]).toEqual(items[1]);
    expect(out[0]).not.toBe(items[0]);
    expect(out[1]).not.toBe(items[1]);
    expect(items).toEqual(snapshot);
  });
});

describe('prepareSchedulePreview', () => {
  it('returns baseline and preview projections, patches and overridden ids', () => {
    const graph = graphOf([past('a', 5), past('b', 3)], [fs('a', 'b')]);
    const prepared = prepareSchedulePreview(graph, [{ workItemId: 'a', durationDays: 10 }], TODAY);
    expect(prepared.overriddenIds).toEqual(['a']);
    expect(prepared.today).toBe(TODAY);
    expect(prepared.patches.get('a')).toEqual({ durationDays: 10 });
    expect(prepared.baseline.workItems.get('a')!.projectedEndDate).toBe('2026-03-07');
    expect(prepared.preview.workItems.get('a')!.projectedEndDate).toBe('2026-03-12');
    // the input graph keeps its stored values
    expect(graph.workItems[0]!.durationDays).toBe(5);
    expect(prepared.graph).toBe(graph);
    expect(prepared.previewGraph.workItems[0]!.durationDays).toBe(10);
  });

  it('propagates a validation failure before projecting', () => {
    const graph = graphOf([past('a', 5)]);
    expect(() =>
      prepareSchedulePreview(graph, [{ workItemId: 'nope', durationDays: 1 }], TODAY),
    ).toThrow(ValidationError);
  });

  it('answers a baseline cycle with CircularDependencyError carrying the cycle nodes', () => {
    const graph = graphOf(
      [past('a', 2), past('b', 2), past('c', 2)],
      [fs('a', 'b'), fs('b', 'c'), fs('c', 'a')],
    );
    let err: CircularDependencyError | undefined;
    try {
      prepareSchedulePreview(graph, [{ workItemId: 'a', durationDays: 1 }], TODAY);
    } catch (e) {
      err = e as CircularDependencyError;
    }
    expect(err).toBeInstanceOf(CircularDependencyError);
    expect(err!.statusCode).toBe(409);
    expect((err!.details as { cycle: string[] }).cycle.slice().sort()).toEqual(['a', 'b', 'c']);
  });
});

describe('prepareSchedulePreview cycle through a milestone gate', () => {
  it('reports only work item ids in the cycle (no milestone:N nodes)', () => {
    // a contributes to M and requires M: a -> milestone:1 -> a
    const graph = graphOf(
      [past('a', 5)],
      [fs('milestone:1', 'a')],
      [milestoneRow(1, '2026-03-30')],
      {
        1: ['a'],
      },
    );
    let err: CircularDependencyError | undefined;
    try {
      prepareSchedulePreview(graph, [{ workItemId: 'a', durationDays: 1 }], TODAY);
    } catch (e) {
      err = e as CircularDependencyError;
    }
    expect(err).toBeInstanceOf(CircularDependencyError);
    expect((err!.details as { cycle: string[] }).cycle).toEqual(['a']);
  });
});

describe('computeScheduleImpact', () => {
  function impactOf(graph: ScheduleGraph, overrides: Parameters<typeof prepareSchedulePreview>[1]) {
    return computeScheduleImpact(prepareSchedulePreview(graph, overrides, TODAY));
  }

  it('lists the successors an override pushes, with deltaDays', () => {
    const graph = graphOf([past('a', 5), past('b', 3)], [fs('a', 'b')]);
    const impact = impactOf(graph, [{ workItemId: 'a', durationDays: 10 }]);
    expect(impact.movedItems).toEqual([
      {
        workItemId: 'b',
        previousEndDate: '2026-03-10',
        newEndDate: '2026-03-15',
        deltaDays: 5,
        isLate: false,
      },
    ]);
  });

  it('gives a negative deltaDays when the override pulls successors earlier', () => {
    const graph = graphOf([past('a', 10), past('b', 3)], [fs('a', 'b')]);
    const impact = impactOf(graph, [{ workItemId: 'a', durationDays: 5 }]);
    expect(impact.movedItems.map((m) => m.deltaDays)).toEqual([-5]);
  });

  it('flags isLate from the previewed forecast', () => {
    // b may start 5 days before a ends; shortening a puts b's start before today
    const graph = graphOf([past('a', 10), past('b', 3)], [fs('a', 'b', -5)]);
    const impact = impactOf(graph, [{ workItemId: 'a', durationDays: 1 }]);
    expect(impact.movedItems).toEqual([
      expect.objectContaining({ workItemId: 'b', deltaDays: -5, isLate: true }),
    ]);
  });

  it('never lists the overridden task itself', () => {
    const graph = graphOf([past('a', 5)]);
    const impact = impactOf(graph, [{ workItemId: 'a', durationDays: 10 }]);
    expect(impact.movedItems).toEqual([]);
  });

  it('excludes completed successors', () => {
    const graph = graphOf(
      [
        past('a', 5),
        past('b', 3, {
          status: 'completed',
          actualStartDate: '2026-02-20',
          actualEndDate: '2026-02-23',
        }),
        past('c', 3),
      ],
      [fs('a', 'b'), fs('a', 'c')],
    );
    const impact = impactOf(graph, [{ workItemId: 'a', durationDays: 10 }]);
    expect(impact.movedItems.map((m) => m.workItemId)).toEqual(['c']);
  });

  it('skips tasks whose shown end does not change', () => {
    const graph = graphOf([past('a', 5), past('c', 3)], [fs('a', 'c')]);
    // both stay floored to today; the new stored start changes nothing the user sees
    const impact = impactOf(graph, [{ workItemId: 'a', startDate: '2026-02-10' }]);
    expect(impact.movedItems).toEqual([]);
  });

  it('skips a moved task that has no shown end date', () => {
    const graph = graphOf([past('a', 5), past('c', 3)], [fs('a', 'c')]);
    const prepared = prepareSchedulePreview(graph, [{ workItemId: 'a', durationDays: 9 }], TODAY);
    prepared.preview.workItems.set('c', {
      ...prepared.preview.workItems.get('c')!,
      projectedEndDate: null,
    });
    expect(computeScheduleImpact(prepared).movedItems).toEqual([]);
  });

  it('sorts moved items by new end date, then id', () => {
    const graph = graphOf(
      [past('a', 5), past('z', 3), past('m', 3), past('long', 20)],
      [fs('a', 'z'), fs('a', 'm'), fs('a', 'long')],
    );
    const impact = impactOf(graph, [{ workItemId: 'a', durationDays: 8 }]);
    expect(impact.movedItems.map((m) => m.workItemId)).toEqual(['m', 'z', 'long']);
  });

  it('shifts an unreached milestone and reports the delta', () => {
    const graph = graphOf([past('a', 5)], [], [milestoneRow(1, '2026-03-30')], { 1: ['a'] });
    const impact = impactOf(graph, [{ workItemId: 'a', durationDays: 12 }]);
    expect(impact.milestones).toEqual([
      {
        milestoneId: 1,
        previousProjectedDate: '2026-03-07',
        newProjectedDate: '2026-03-14',
        deltaDays: 7,
      },
    ]);
  });

  it('skips reached milestones (flag or completedAt) and unchanged or unlinked ones', () => {
    const graph = graphOf(
      [past('a', 5), past('b', 5)],
      [],
      [
        milestoneRow(1, '2026-03-30', { isCompleted: true }),
        milestoneRow(2, '2026-03-30', { completedAt: '2026-03-01T10:00:00.000Z' }),
        milestoneRow(3, '2026-03-30'),
        milestoneRow(4, '2026-03-30'),
        milestoneRow(5, '2026-03-30'),
      ],
      { 1: ['a'], 2: ['a'], 4: ['b'], 5: ['a'] },
    );
    const impact = impactOf(graph, [{ workItemId: 'a', durationDays: 12 }]);
    // only the unreached, linked, changed milestone is reported
    expect(impact.milestones.map((m) => m.milestoneId)).toEqual([5]);
  });

  it('sorts milestone shifts by new date, then id', () => {
    const graph = graphOf(
      [past('a', 5), past('b', 5), past('c', 1)],
      [],
      [milestoneRow(7, '2026-04-30'), milestoneRow(2, '2026-04-30'), milestoneRow(5, '2026-04-30')],
      { 7: ['a'], 2: ['b'], 5: ['c'] },
    );
    const impact = impactOf(graph, [
      { workItemId: 'a', durationDays: 8 },
      { workItemId: 'b', durationDays: 8 },
      { workItemId: 'c', durationDays: 20 },
    ]);
    expect(impact.milestones.map((x) => x.milestoneId)).toEqual([2, 7, 5]);
  });

  it('reports the project end before and after over all tasks', () => {
    const graph = graphOf([past('a', 5), past('b', 30)]);
    const impact = impactOf(graph, [{ workItemId: 'a', durationDays: 40 }]);
    expect(impact.projectEnd).toEqual({ previousDate: '2026-04-01', newDate: '2026-04-11' });
  });

  it('reports a null project end when no task has an end date', () => {
    const graph = graphOf([wi('x', { status: 'completed' }), wi('y', { status: 'completed' })]);
    const impact = impactOf(graph, [{ workItemId: 'x', durationDays: 1 }]);
    expect(impact.projectEnd).toEqual({ previousDate: null, newDate: null });
  });

  it('holdsUp counts what waits behind the overridden task on the previewed schedule', () => {
    const graph = graphOf([past('a', 5), past('b', 3), past('c', 3)], [fs('a', 'b'), fs('b', 'c')]);
    const impact = impactOf(graph, [{ workItemId: 'a', durationDays: 10 }]);
    expect(impact.holdsUp).toEqual({ count: 2, startingWithin14Days: 2 });
  });

  it('holdsUp is the union over several overridden tasks, counting a shared successor once', () => {
    const graph = graphOf(
      [past('a', 5), past('b', 5), past('c', 3), past('d', 3)],
      [fs('a', 'c'), fs('b', 'c'), fs('c', 'd')],
    );
    const prepared = prepareSchedulePreview(
      graph,
      [
        { workItemId: 'a', durationDays: 9 },
        { workItemId: 'b', durationDays: 9 },
      ],
      TODAY,
    );
    const impact = computeScheduleImpact(prepared);
    const index = buildScheduleIndex(prepared.previewGraph);
    const ctx = { today: TODAY, projection: prepared.preview };
    const fromA = computeHoldsUp(index, 'a', ctx);
    const fromB = computeHoldsUp(index, 'b', ctx);
    expect(fromA.count + fromB.count).toBe(4);
    expect(impact.holdsUp).toEqual(
      summarizeHoldsUp(index, new Set([...fromA.ids, ...fromB.ids]), ctx),
    );
    expect(impact.holdsUp.count).toBe(2);
  });

  it('holdsUp covers only the overridden tasks, not unrelated chains', () => {
    const graph = graphOf(
      [past('a', 5), past('b', 3), past('x', 5), past('y', 3)],
      [fs('a', 'b'), fs('x', 'y')],
    );
    const impact = impactOf(graph, [{ workItemId: 'a', durationDays: 10 }]);
    expect(impact.holdsUp.count).toBe(1);
  });

  it('settles undated, completed and milestone nodes untouched in the previewed graph', () => {
    const m = milestoneRow(1, '2026-03-30');
    const graph = graphOf(
      [
        past('a', 5),
        wi('undated', { durationDays: 2 }),
        past('done', 3, {
          status: 'completed',
          actualStartDate: '2026-02-01',
          actualEndDate: '2026-02-04',
        }),
      ],
      [],
      [m],
      { 1: ['a'] },
    );
    const prepared = prepareSchedulePreview(graph, [{ workItemId: 'a', durationDays: 9 }], TODAY);
    const byId = new Map(prepared.previewGraph.workItems.map((w) => [w.id, w]));
    // a was settled on the planned run (stored dates replaced)
    expect(byId.get('a')).toMatchObject({ startDate: '2026-02-01', endDate: '2026-02-10' });
    // no start and no predecessor: left alone
    expect(byId.get('undated')).toMatchObject({ startDate: null, endDate: null });
    // completed: left alone (actual dates win)
    expect(byId.get('done')).toEqual(graph.workItems.find((w) => w.id === 'done'));
    // the milestone node is not a task
    expect(byId.get('milestone:1')).toEqual(graph.workItems.find((w) => w.id === 'milestone:1'));
  });

  it('settles a task that has a predecessor but no stored start', () => {
    const graph = graphOf([past('a', 5), wi('b', { durationDays: 3 })], [fs('a', 'b')]);
    const prepared = prepareSchedulePreview(graph, [{ workItemId: 'a', durationDays: 9 }], TODAY);
    const b = prepared.previewGraph.workItems.find((w) => w.id === 'b')!;
    expect(b.startDate).toBe('2026-02-10');
    expect(b.endDate).toBe('2026-02-13');
  });

  it('does not mutate the graph it was given', () => {
    const graph = graphOf([past('a', 5), past('b', 3)], [fs('a', 'b')]);
    const snapshot = JSON.parse(JSON.stringify(graph.workItems));
    impactOf(graph, [{ workItemId: 'a', durationDays: 10 }]);
    expect(JSON.parse(JSON.stringify(graph.workItems))).toEqual(snapshot);
  });

  // Regression: stored dates equal to the plan (the state after autoReschedule) must still
  // preview a duration override (the preview settles the graph on the unfloored planned run).
  it('shows the successors a duration override pushes when stored dates are consistent', () => {
    const graph = graphOf(
      [dated('a', '2026-03-09', 5), dated('b', '2026-03-14', 3)],
      [fs('a', 'b')],
    );
    const impact = impactOf(graph, [{ workItemId: 'a', durationDays: 10 }]);
    expect(impact.movedItems).toEqual([
      expect.objectContaining({
        workItemId: 'b',
        previousEndDate: '2026-03-17',
        newEndDate: '2026-03-22',
      }),
    ]);
  });
});
