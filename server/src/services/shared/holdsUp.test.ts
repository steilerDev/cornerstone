/**
 * Holds up (#2229, AC7): the one definition. Pure graphs only.
 *
 * Mutations these tests catch:
 *  - counting a diamond successor twice (no visited set);
 *  - counting milestone nodes, or the subject itself;
 *  - traversing through a completed task or a reached milestone;
 *  - not passing through an unreached milestone gate;
 *  - an off-by-one on the 14-day window (T+14 counts, T+15 does not);
 *  - ignoring past planned starts, or counting in-progress tasks as "starting soon";
 *  - folding on a completed or merely on-time predecessor; not folding via a milestone contributor;
 *  - looping forever on a cycle.
 */

import { describe, it, expect } from '@jest/globals';
import type { WorkItemScheduleFields } from '@cornerstone/shared';
import type { SchedulingDependency, SchedulingWorkItem } from '../schedulingEngine.js';
import {
  addDaysUtc,
  buildScheduleIndex,
  computeHoldsUp,
  diffDaysUtc,
  heldUpCauseOf,
  isFoldedLateStart,
  summarizeHoldsUp,
  waitsForOf,
} from './holdsUp.js';

const TODAY = '2026-03-10';

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

function ms(id: number, reached = false): SchedulingWorkItem {
  return wi(`milestone:${id}`, { status: reached ? 'completed' : 'not_started' });
}

function dep(predecessorId: string, successorId: string): SchedulingDependency {
  return { predecessorId, successorId, dependencyType: 'finish_to_start', leadLagDays: 0 };
}

function fields(o: Partial<WorkItemScheduleFields> = {}): WorkItemScheduleFields {
  return {
    projectedStartDate: null,
    projectedEndDate: null,
    isLate: false,
    lateDays: null,
    isHeldUp: false,
    ...o,
  };
}

function ctxOf(map: Record<string, Partial<WorkItemScheduleFields>> = {}) {
  return {
    today: TODAY,
    projection: {
      workItems: new Map(Object.entries(map).map(([id, f]) => [id, fields(f)])),
    },
  };
}

function holds(
  items: SchedulingWorkItem[],
  deps: SchedulingDependency[],
  subject: string,
  map: Record<string, Partial<WorkItemScheduleFields>> = {},
) {
  const index = buildScheduleIndex({ workItems: items, dependencies: deps });
  return computeHoldsUp(index, subject, ctxOf(map));
}

describe('date helpers', () => {
  it('addDaysUtc adds and subtracts across month and year ends', () => {
    expect(addDaysUtc('2026-03-10', 7)).toBe('2026-03-17');
    expect(addDaysUtc('2026-03-10', -30)).toBe('2026-02-08');
    expect(addDaysUtc('2026-12-30', 3)).toBe('2027-01-02');
  });

  it('diffDaysUtc is signed and calendar-day exact', () => {
    expect(diffDaysUtc('2026-03-05', '2026-03-10')).toBe(5);
    expect(diffDaysUtc('2026-03-10', '2026-03-05')).toBe(-5);
    expect(diffDaysUtc('2026-03-10', '2026-03-10')).toBe(0);
    expect(diffDaysUtc('2026-03-28', '2026-03-30')).toBe(2);
  });
});

describe('buildScheduleIndex', () => {
  it('builds successors, predecessors and nodes, deduplicating repeated edges', () => {
    const index = buildScheduleIndex({
      workItems: [wi('a'), wi('b')],
      dependencies: [dep('a', 'b'), dep('a', 'b')],
    });
    expect(index.successors.get('a')).toEqual(['b']);
    expect(index.predecessors.get('b')).toEqual(['a']);
    expect([...index.nodes.keys()]).toEqual(['a', 'b']);
  });
});

describe('computeHoldsUp', () => {
  it('counts a chain breadth-first and never counts the subject', () => {
    const r = holds([wi('a'), wi('b'), wi('c')], [dep('a', 'b'), dep('b', 'c')], 'a');
    expect(r.count).toBe(2);
    expect([...r.ids].sort()).toEqual(['b', 'c']);
    expect(r.ids.has('a')).toBe(false);
  });

  it('returns zero for a subject without successors or unknown to the graph', () => {
    expect(holds([wi('a')], [], 'a')).toMatchObject({ count: 0, startingWithin14Days: 0 });
    expect(holds([wi('a')], [], 'ghost').count).toBe(0);
  });

  it('counts a diamond successor once', () => {
    const r = holds(
      [wi('a'), wi('b'), wi('c'), wi('d')],
      [dep('a', 'b'), dep('a', 'c'), dep('b', 'd'), dep('c', 'd')],
      'a',
    );
    expect(r.count).toBe(3);
  });

  it('passes through an unreached milestone gate but counts only work items', () => {
    const r = holds(
      [wi('a'), ms(1), wi('b'), wi('c')],
      [dep('a', 'milestone:1'), dep('milestone:1', 'b'), dep('b', 'c')],
      'a',
    );
    expect(r.count).toBe(2);
    expect([...r.ids].sort()).toEqual(['b', 'c']);
  });

  it('a milestone subject holds up the tasks that wait for it (not itself)', () => {
    const r = holds([ms(1), wi('b')], [dep('milestone:1', 'b')], 'milestone:1');
    expect(r.count).toBe(1);
  });

  it('does not enter a reached milestone (a finished node passes no slip on)', () => {
    const r = holds(
      [wi('a'), ms(1, true), wi('b')],
      [dep('a', 'milestone:1'), dep('milestone:1', 'b')],
      'a',
    );
    expect(r.count).toBe(0);
  });

  it('neither counts nor traverses a completed successor', () => {
    const r = holds(
      [wi('a'), wi('done', { status: 'completed' }), wi('after')],
      [dep('a', 'done'), dep('done', 'after')],
      'a',
    );
    expect(r.count).toBe(0);
    expect(r.ids.size).toBe(0);
  });

  it('is cycle-safe', () => {
    const r = holds(
      [wi('a'), wi('b'), wi('c')],
      [dep('a', 'b'), dep('b', 'c'), dep('c', 'a')],
      'a',
    );
    expect(r.count).toBe(2);
    expect(r.ids.has('a')).toBe(false);
  });

  it('ignores an edge to a node that is not in the graph', () => {
    const r = holds([wi('a')], [dep('a', 'ghost')], 'a');
    expect(r.count).toBe(0);
  });

  describe('startingWithin14Days boundary (T = 2026-03-10)', () => {
    it('counts a planned start at T+14 and not at T+15', () => {
      const r = holds(
        [wi('a'), wi('on', { startDate: '2026-03-24' }), wi('off', { startDate: '2026-03-25' })],
        [dep('a', 'on'), dep('a', 'off')],
        'a',
      );
      expect(r.count).toBe(2);
      expect(r.startingWithin14Days).toBe(1);
    });

    it('counts a past planned start (blocked now)', () => {
      const r = holds([wi('a'), wi('past', { startDate: '2026-03-01' })], [dep('a', 'past')], 'a');
      expect(r.startingWithin14Days).toBe(1);
    });

    it('falls back to the projected start when there is no planned start', () => {
      const index = buildScheduleIndex({
        workItems: [wi('a'), wi('p1'), wi('p2'), wi('p3')],
        dependencies: [dep('a', 'p1'), dep('a', 'p2'), dep('a', 'p3')],
      });
      const r = computeHoldsUp(
        index,
        'a',
        ctxOf({
          p1: { projectedStartDate: '2026-03-24' },
          p2: { projectedStartDate: '2026-03-25' },
          // p3 has neither: not counted as starting soon
        }),
      );
      expect(r.count).toBe(3);
      expect(r.startingWithin14Days).toBe(1);
    });

    it('does not count an in-progress successor as starting soon (but counts it in count)', () => {
      const r = holds(
        [wi('a'), wi('run', { status: 'in_progress', startDate: '2026-03-12' })],
        [dep('a', 'run')],
        'a',
      );
      expect(r.count).toBe(1);
      expect(r.startingWithin14Days).toBe(0);
    });
  });
});

describe('summarizeHoldsUp', () => {
  it('summarises an arbitrary id set with the same definition and skips unknown ids', () => {
    const index = buildScheduleIndex({
      workItems: [wi('x', { startDate: '2026-03-12' }), wi('y', { startDate: '2026-05-01' })],
      dependencies: [],
    });
    const r = summarizeHoldsUp(index, new Set(['x', 'y', 'ghost']), ctxOf());
    expect(r).toEqual({ count: 3, startingWithin14Days: 1 });
  });
});

describe('isFoldedLateStart', () => {
  const run = (
    items: SchedulingWorkItem[],
    deps: SchedulingDependency[],
    map: Record<string, Partial<WorkItemScheduleFields>>,
    id = 't',
  ) =>
    isFoldedLateStart(
      buildScheduleIndex({ workItems: items, dependencies: deps }),
      id,
      ctxOf(map).projection,
    );

  it('folds when an unfinished direct predecessor is late', () => {
    expect(run([wi('p'), wi('t')], [dep('p', 't')], { p: { isLate: true } })).toBe(true);
  });

  it('folds when an unfinished direct predecessor is held up', () => {
    expect(run([wi('p'), wi('t')], [dep('p', 't')], { p: { isHeldUp: true } })).toBe(true);
  });

  it('does not fold when the predecessor is merely on time', () => {
    expect(run([wi('p'), wi('t')], [dep('p', 't')], { p: {} })).toBe(false);
  });

  it('does not fold when the late predecessor is completed', () => {
    expect(
      run([wi('p', { status: 'completed' }), wi('t')], [dep('p', 't')], { p: { isLate: true } }),
    ).toBe(false);
  });

  it('does not fold without predecessors, or when the predecessor has no projection', () => {
    expect(run([wi('t')], [], {})).toBe(false);
    expect(run([wi('p'), wi('t')], [dep('p', 't')], {})).toBe(false);
  });

  it('does not fold on a predecessor that is not in the graph', () => {
    expect(run([wi('t')], [dep('ghost', 't')], { ghost: { isLate: true } })).toBe(false);
  });

  it('folds through a milestone: a late contributor of the milestone the task waits for', () => {
    expect(
      run([wi('c'), ms(1), wi('t')], [dep('c', 'milestone:1'), dep('milestone:1', 't')], {
        c: { isLate: true },
      }),
    ).toBe(true);
  });

  it('does not fold through a milestone whose contributor is on time or completed', () => {
    expect(
      run([wi('c'), ms(1), wi('t')], [dep('c', 'milestone:1'), dep('milestone:1', 't')], { c: {} }),
    ).toBe(false);
    expect(
      run(
        [wi('c', { status: 'completed' }), ms(1), wi('t')],
        [dep('c', 'milestone:1'), dep('milestone:1', 't')],
        { c: { isLate: true } },
      ),
    ).toBe(false);
  });

  it('skips a reached (completed) milestone predecessor: its contributors no longer fold the task', () => {
    expect(
      run([wi('c'), ms(1, true), wi('t')], [dep('c', 'milestone:1'), dep('milestone:1', 't')], {
        c: { isLate: true },
      }),
    ).toBe(false);
  });

  it('a reached milestone predecessor does not hide a late real predecessor', () => {
    expect(
      run(
        [wi('c'), wi('p'), ms(1, true), wi('t')],
        [dep('c', 'milestone:1'), dep('milestone:1', 't'), dep('p', 't')],
        { c: { isLate: true }, p: { isLate: true } },
      ),
    ).toBe(true);
  });

  it('does not fold on a milestone gate without contributors', () => {
    expect(run([ms(1), wi('t')], [dep('milestone:1', 't')], {})).toBe(false);
  });

  it('ignores a milestone chained behind a milestone (only one hop of contributors)', () => {
    expect(
      run(
        [wi('c'), ms(1), ms(2), wi('t')],
        [dep('c', 'milestone:1'), dep('milestone:1', 'milestone:2'), dep('milestone:2', 't')],
        { c: { isLate: true } },
      ),
    ).toBe(false);
  });
});

describe('heldUpCauseOf (#2230: the Home "Waits for" line shares the N2 folding definition)', () => {
  const cause = (
    items: SchedulingWorkItem[],
    deps: SchedulingDependency[],
    map: Record<string, Partial<WorkItemScheduleFields>>,
    id = 't',
  ) =>
    heldUpCauseOf(
      buildScheduleIndex({ workItems: items, dependencies: deps }),
      id,
      ctxOf(map).projection,
    );

  it('returns the id of a late real predecessor', () => {
    expect(cause([wi('p'), wi('t')], [dep('p', 't')], { p: { isLate: true } })).toBe('p');
  });

  it('returns the id of a held-up real predecessor', () => {
    expect(cause([wi('p'), wi('t')], [dep('p', 't')], { p: { isHeldUp: true } })).toBe('p');
  });

  it('returns null for no predecessors, an on-time predecessor, or one without a projection', () => {
    expect(cause([wi('t')], [], {})).toBeNull();
    expect(cause([wi('p'), wi('t')], [dep('p', 't')], { p: {} })).toBeNull();
    expect(cause([wi('p'), wi('t')], [dep('p', 't')], {})).toBeNull();
  });

  it('ignores a completed predecessor and one that is not in the graph', () => {
    expect(
      cause([wi('p', { status: 'completed' }), wi('t')], [dep('p', 't')], { p: { isLate: true } }),
    ).toBeNull();
    expect(cause([wi('t')], [dep('ghost', 't')], { ghost: { isLate: true } })).toBeNull();
  });

  it('returns the contributor of an unreached milestone gate the task waits for', () => {
    expect(
      cause([wi('c'), ms(1), wi('t')], [dep('c', 'milestone:1'), dep('milestone:1', 't')], {
        c: { isLate: true },
      }),
    ).toBe('c');
  });

  it('never returns a milestone node, and a reached milestone does not gate', () => {
    expect(
      cause([wi('c'), ms(1, true), wi('t')], [dep('c', 'milestone:1'), dep('milestone:1', 't')], {
        c: { isLate: true },
      }),
    ).toBeNull();
    expect(cause([ms(1), wi('t')], [dep('milestone:1', 't')], {})).toBeNull();
  });

  describe('with several candidates', () => {
    const items = [wi('a'), wi('b'), wi('t')];
    const deps = [dep('a', 't'), dep('b', 't')];

    it('picks the one with the latest projected end, whichever comes first', () => {
      expect(
        cause(items, deps, {
          a: { isLate: true, projectedEndDate: '2026-03-12' },
          b: { isLate: true, projectedEndDate: '2026-03-20' },
        }),
      ).toBe('b');
      expect(
        cause(items, deps, {
          a: { isLate: true, projectedEndDate: '2026-03-20' },
          b: { isLate: true, projectedEndDate: '2026-03-12' },
        }),
      ).toBe('a');
    });

    it('ranks a null projected end last, in either order', () => {
      expect(
        cause(items, deps, {
          a: { isLate: true, projectedEndDate: null },
          b: { isLate: true, projectedEndDate: '2026-03-12' },
        }),
      ).toBe('b');
      expect(
        cause(items, deps, {
          a: { isHeldUp: true, projectedEndDate: '2026-03-12' },
          b: { isLate: true, projectedEndDate: null },
        }),
      ).toBe('a');
    });

    it('breaks a tie on the end date by id ascending, in either input order', () => {
      const tie = { isLate: true, projectedEndDate: '2026-03-15' };
      expect(cause(items, deps, { a: tie, b: tie })).toBe('a');
      expect(
        cause([wi('b'), wi('a'), wi('t')], [dep('b', 't'), dep('a', 't')], { a: tie, b: tie }),
      ).toBe('a');
    });

    it('breaks a tie of two null ends by id ascending', () => {
      const none = { isLate: true, projectedEndDate: null };
      expect(
        cause([wi('b'), wi('a'), wi('t')], [dep('b', 't'), dep('a', 't')], { a: none, b: none }),
      ).toBe('a');
    });

    it('skips on-time and completed candidates when choosing', () => {
      expect(
        cause(
          [wi('a'), wi('b', { status: 'completed' }), wi('c'), wi('t')],
          [dep('a', 't'), dep('b', 't'), dep('c', 't')],
          {
            a: { projectedEndDate: '2026-03-30' },
            b: { isLate: true, projectedEndDate: '2026-04-30' },
            c: { isLate: true, projectedEndDate: '2026-03-12' },
          },
        ),
      ).toBe('c');
    });

    it('chooses across a real predecessor and a milestone contributor by the same rule', () => {
      expect(
        cause(
          [wi('c'), wi('p'), ms(1), wi('t')],
          [dep('c', 'milestone:1'), dep('milestone:1', 't'), dep('p', 't')],
          {
            c: { isLate: true, projectedEndDate: '2026-03-25' },
            p: { isLate: true, projectedEndDate: '2026-03-12' },
          },
        ),
      ).toBe('c');
    });
  });

  it('agrees with isFoldedLateStart: folded exactly when a cause exists', () => {
    const scenarios: [
      SchedulingWorkItem[],
      SchedulingDependency[],
      Record<string, Partial<WorkItemScheduleFields>>,
    ][] = [
      [[wi('p'), wi('t')], [dep('p', 't')], { p: { isLate: true } }],
      [[wi('p'), wi('t')], [dep('p', 't')], { p: {} }],
      [[wi('t')], [], {}],
      [
        [wi('c'), ms(1), wi('t')],
        [dep('c', 'milestone:1'), dep('milestone:1', 't')],
        { c: { isHeldUp: true } },
      ],
    ];
    for (const [items, deps, map] of scenarios) {
      const index = buildScheduleIndex({ workItems: items, dependencies: deps });
      const projection = ctxOf(map).projection;
      expect(isFoldedLateStart(index, 't', projection)).toBe(
        heldUpCauseOf(index, 't', projection) !== null,
      );
    }
  });
});

describe('waitsForOf (#2245: the Tasks list "Waits for" figure)', () => {
  const waits = (
    items: SchedulingWorkItem[],
    deps: SchedulingDependency[],
    map: Record<string, Partial<WorkItemScheduleFields>> = {},
    id = 't',
  ) =>
    waitsForOf(
      buildScheduleIndex({ workItems: items, dependencies: deps }),
      id,
      ctxOf(map).projection,
    );

  it('is null when the task waits for nothing', () => {
    expect(waits([wi('t')], [])).toBeNull();
  });

  it('is null when every predecessor is completed or not in the graph', () => {
    expect(waits([wi('p', { status: 'completed' }), wi('t')], [dep('p', 't')])).toBeNull();
    expect(waits([wi('t')], [dep('ghost', 't')])).toBeNull();
  });

  it('names a single unfinished predecessor with count 1', () => {
    expect(waits([wi('p'), wi('t')], [dep('p', 't')])).toEqual({ firstId: 'p', count: 1 });
  });

  it('prefers the held-up cause over a later-ending, on-time predecessor', () => {
    const result = waits([wi('a'), wi('b'), wi('t')], [dep('a', 't'), dep('b', 't')], {
      a: { isLate: true, projectedEndDate: '2026-03-12' },
      b: { projectedEndDate: '2026-04-30' },
    });
    expect(result).toEqual({ firstId: 'a', count: 2 });
  });

  it('without a held-up cause falls back to the latest-ending predecessor', () => {
    const result = waits([wi('a'), wi('b'), wi('t')], [dep('a', 't'), dep('b', 't')], {
      a: { projectedEndDate: '2026-03-12' },
      b: { projectedEndDate: '2026-03-15' },
    });
    expect(result).toEqual({ firstId: 'b', count: 2 });
  });

  it('puts a predecessor without an end date last, and ties by lowest id', () => {
    const items = [wi('a'), wi('b'), wi('t')];
    const deps = [dep('a', 't'), dep('b', 't')];
    expect(waits(items, deps, { a: {}, b: { projectedEndDate: '2026-03-01' } })).toEqual({
      firstId: 'b',
      count: 2,
    });
    expect(waits(items, deps, { b: {}, a: {} })).toEqual({ firstId: 'a', count: 2 });
    expect(
      waits(items, deps, {
        a: { projectedEndDate: '2026-03-05' },
        b: { projectedEndDate: '2026-03-05' },
      }),
    ).toEqual({ firstId: 'a', count: 2 });
  });

  it('expands an unreached milestone gate into its contributors', () => {
    const result = waits(
      [wi('c1'), wi('c2'), ms(1), wi('t')],
      [dep('c1', 'milestone:1'), dep('c2', 'milestone:1'), dep('milestone:1', 't')],
      { c2: { projectedEndDate: '2026-03-20' } },
    );
    expect(result).toEqual({ firstId: 'c2', count: 2 });
  });

  it('counts a predecessor once when it is both direct and a gate contributor', () => {
    const result = waits(
      [wi('c'), ms(1), wi('t')],
      [dep('c', 't'), dep('c', 'milestone:1'), dep('milestone:1', 't')],
    );
    expect(result).toEqual({ firstId: 'c', count: 1 });
  });

  it('a reached milestone gate contributes nothing', () => {
    expect(
      waits([wi('c'), ms(1, true), wi('t')], [dep('c', 'milestone:1'), dep('milestone:1', 't')]),
    ).toBeNull();
  });

  it('skips a milestone node that feeds a milestone (never a real predecessor)', () => {
    expect(
      waits(
        [wi('c'), ms(1), ms(2), wi('t')],
        [dep('c', 'milestone:1'), dep('milestone:1', 'milestone:2'), dep('milestone:2', 't')],
      ),
    ).toBeNull();
  });
});
