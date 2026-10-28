import { describe, it, expect } from '@jest/globals';
import type { ScheduleImpact } from '@cornerstone/shared';
import {
  buildPreviewGhosts,
  buildScheduleRelations,
  resolveScheduleSubject,
  scheduleSubjectTitle,
} from './scheduleRelations.js';
import {
  makeMilestone,
  makePurchase,
  makeTask,
  makeTimeline,
} from '../../test/scheduleFixtures.js';

const data = makeTimeline({
  workItems: [
    makeTask('a', { requiredMilestoneIds: [1, 99] }),
    makeTask('b', { requiredMilestoneIds: [2] }),
    makeTask('c'),
  ],
  dependencies: [
    { predecessorId: 'a', successorId: 'b', dependencyType: 'finish_to_start', leadLagDays: 0 },
    { predecessorId: 'c', successorId: 'a', dependencyType: 'start_to_start', leadLagDays: 0 },
    { predecessorId: 'ghost', successorId: 'a', dependencyType: 'finish_to_start', leadLagDays: 0 },
    { predecessorId: 'a', successorId: 'ghost', dependencyType: 'finish_to_start', leadLagDays: 0 },
  ],
  milestones: [
    makeMilestone(1, { workItemIds: ['c', 'gone'] }),
    makeMilestone(2, { workItemIds: ['a'] }),
  ],
  householdItems: [
    makePurchase('afterA', {
      dependencyIds: [{ predecessorType: 'work_item', predecessorId: 'a' }],
    }),
    makePurchase('afterM1', {
      dependencyIds: [{ predecessorType: 'milestone', predecessorId: '1' }],
    }),
    makePurchase('both', {
      dependencyIds: [
        { predecessorType: 'work_item', predecessorId: 'c' },
        { predecessorType: 'milestone', predecessorId: '2' },
        { predecessorType: 'work_item', predecessorId: 'missing' },
        { predecessorType: 'milestone', predecessorId: '77' },
      ],
    }),
  ],
});

describe('resolveScheduleSubject', () => {
  it('finds a task, a milestone and a purchase by row key', () => {
    expect(resolveScheduleSubject(data, 'task:a')).toMatchObject({ kind: 'task' });
    expect(resolveScheduleSubject(data, 'milestone:2')).toMatchObject({ kind: 'milestone' });
    expect(resolveScheduleSubject(data, 'purchase:both')).toMatchObject({ kind: 'purchase' });
  });

  it('returns null for a record that is not in the timeline', () => {
    expect(resolveScheduleSubject(data, 'task:zzz')).toBeNull();
    expect(resolveScheduleSubject(data, 'milestone:42')).toBeNull();
    expect(resolveScheduleSubject(data, 'purchase:zzz')).toBeNull();
  });
});

describe('scheduleSubjectTitle', () => {
  it('uses the title for tasks and milestones and the name for purchases', () => {
    expect(scheduleSubjectTitle(resolveScheduleSubject(data, 'task:a')!)).toBe('Task a');
    expect(scheduleSubjectTitle(resolveScheduleSubject(data, 'milestone:1')!)).toBe('Milestone 1');
    expect(scheduleSubjectTitle(resolveScheduleSubject(data, 'purchase:both')!)).toBe(
      'Purchase both',
    );
  });
});

describe('buildScheduleRelations', () => {
  const rel = (key: `task:${string}` | `milestone:${number}` | `purchase:${string}`) =>
    buildScheduleRelations(data, resolveScheduleSubject(data, key)!);
  const keys = (rows: readonly { rowKey: string }[]) => rows.map((r) => r.rowKey);

  it('a task waits for its predecessors and required milestones, in response order', () => {
    const { waitsFor } = rel('task:a');
    expect(keys(waitsFor)).toEqual(['task:c', 'milestone:1']);
    expect(waitsFor[0]!.label).toEqual({
      kind: 'dependency',
      direction: 'waitsFor',
      dependencyType: 'start_to_start',
    });
    expect(waitsFor[1]!.label).toEqual({ kind: 'milestoneGate' });
  });

  it('a task holds up its successors, the milestones it counts toward and dependent purchases', () => {
    const { holdsUp } = rel('task:a');
    expect(keys(holdsUp)).toEqual(['task:b', 'milestone:2', 'purchase:afterA']);
    expect(holdsUp[0]!.label).toEqual({
      kind: 'dependency',
      direction: 'holdsUp',
      dependencyType: 'finish_to_start',
    });
    expect(holdsUp[1]!.label).toEqual({ kind: 'countsToward' });
    expect(holdsUp[2]!.label).toEqual({ kind: 'delivery' });
  });

  it('skips related records that are missing from the timeline', () => {
    expect(keys(rel('task:a').waitsFor)).not.toContain('task:ghost');
    expect(keys(rel('task:a').waitsFor)).not.toContain('milestone:99');
    expect(keys(rel('task:a').holdsUp)).not.toContain('task:ghost');
  });

  it('a milestone waits for its contributing tasks and holds up tasks and purchases that need it', () => {
    const m1 = rel('milestone:1');
    expect(keys(m1.waitsFor)).toEqual(['task:c']);
    expect(m1.waitsFor[0]!.label).toEqual({ kind: 'countsToward' });
    expect(keys(m1.holdsUp)).toEqual(['task:a', 'purchase:afterM1']);
    expect(m1.holdsUp[0]!.label).toEqual({ kind: 'waitingForMilestone' });
    expect(m1.holdsUp[1]!.label).toEqual({ kind: 'delivery' });
  });

  it('a purchase waits for its task and milestone predecessors and holds up nothing', () => {
    const { waitsFor, holdsUp } = rel('purchase:both');
    expect(keys(waitsFor)).toEqual(['task:c', 'milestone:2']);
    expect(waitsFor.every((r) => r.label.kind === 'beforeDelivery')).toBe(true);
    expect(holdsUp).toEqual([]);
  });

  it('returns empty lists for an unconnected task', () => {
    const lone = makeTimeline({ workItems: [makeTask('x')] });
    expect(buildScheduleRelations(lone, { kind: 'task', item: lone.workItems[0]! })).toEqual({
      waitsFor: [],
      holdsUp: [],
    });
  });
});

describe('buildPreviewGhosts', () => {
  const impact: ScheduleImpact = {
    movedItems: [
      {
        workItemId: 'b',
        previousEndDate: '2026-03-10',
        newEndDate: '2026-03-15',
        deltaDays: 5,
        isLate: false,
      },
      {
        workItemId: 'started',
        previousEndDate: '2026-03-10',
        newEndDate: '2026-03-12',
        deltaDays: 2,
        isLate: false,
      },
      {
        workItemId: 'undated',
        previousEndDate: '2026-03-10',
        newEndDate: '2026-03-12',
        deltaDays: 2,
        isLate: false,
      },
      {
        workItemId: 'ghost',
        previousEndDate: '2026-03-10',
        newEndDate: '2026-03-12',
        deltaDays: 2,
        isLate: false,
      },
    ],
    milestones: [
      {
        milestoneId: 2,
        previousProjectedDate: '2026-03-20',
        newProjectedDate: '2026-03-25',
        deltaDays: 5,
      },
    ],
    projectEnd: { previousDate: null, newDate: null },
    holdsUp: { count: 0, startingWithin14Days: 0 },
  };
  const timeline = makeTimeline({
    workItems: [
      makeTask('a'),
      makeTask('b', { projectedStartDate: '2026-03-06' }),
      makeTask('started', { actualStartDate: '2026-03-03', projectedStartDate: '2026-03-09' }),
      makeTask('undated', { projectedStartDate: null, projectedEndDate: null }),
    ],
  });

  it('shows the edited task with its new end, moved tasks shifted by deltaDays, and milestones', () => {
    const ghosts = buildPreviewGhosts(timeline, timeline.workItems[0]!, '2026-03-09', impact);
    expect(ghosts).toEqual([
      { rowKey: 'task:a', start: '2026-03-02', end: '2026-03-09' },
      { rowKey: 'task:b', start: '2026-03-11', end: '2026-03-15' },
      { rowKey: 'task:started', start: '2026-03-03', end: '2026-03-12' },
      { rowKey: 'task:undated', start: null, end: '2026-03-12' },
      { rowKey: 'milestone:2', start: null, end: '2026-03-25' },
    ]);
  });
});
