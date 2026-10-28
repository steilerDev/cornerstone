import { describe, it, expect } from '@jest/globals';
import type {
  AreaSummary,
  TimelineHouseholdItem,
  TimelineMilestone,
  TimelineResponse,
  TimelineWorkItem,
} from '@cornerstone/shared';
import {
  DEFAULT_SCHEDULE_SHOW,
  SCHEDULE_GROUPS,
  SCHEDULE_KIND_KEYS,
  SCHEDULE_PHONE_VIEWS,
  SCHEDULE_PREFERENCE_KEY,
  SCHEDULE_SHOW_KEYS,
  SCHEDULE_SUBJECT_KINDS,
  SCHEDULE_ZOOMS,
  changedShowCount,
  filterTimeline,
  isCurrentTask,
  isLastVisibleKind,
  isLateTask,
  matchesArea,
  parseRowKey,
  parseSchedulePreference,
  parseShowParam,
  rowKey,
  serializeShowParam,
  showFromLegacyFilter,
  type ScheduleShowKey,
} from './scheduleView.js';

const area = (id: string, ancestors: string[] = []): AreaSummary => ({
  id,
  name: `Area ${id}`,
  color: null,
  ancestors: ancestors.map((a) => ({ id: a, name: `Area ${a}`, color: null })),
});

function task(id: string, o: Partial<TimelineWorkItem> = {}): TimelineWorkItem {
  return {
    id,
    title: `Task ${id}`,
    status: 'not_started',
    startDate: '2026-03-01',
    endDate: '2026-03-05',
    actualStartDate: null,
    actualEndDate: null,
    durationDays: 4,
    startAfter: null,
    startBefore: null,
    assignedUser: null,
    assignedVendor: null,
    area: null,
    projectedStartDate: '2026-03-01',
    projectedEndDate: '2026-03-05',
    isLate: false,
    lateDays: null,
    isHeldUp: false,
    ...o,
  };
}

function milestone(id: number, workItemIds: string[], o: Partial<TimelineMilestone> = {}) {
  return {
    id,
    title: `Milestone ${id}`,
    targetDate: '2026-04-01',
    isCompleted: false,
    completedAt: null,
    color: null,
    workItemIds,
    projectedDate: null,
    isLate: false,
    lateDays: null,
    isEarly: false,
    earlyDays: null,
    isCritical: false,
    ...o,
  } satisfies TimelineMilestone;
}

function purchase(id: string, o: Partial<TimelineHouseholdItem> = {}): TimelineHouseholdItem {
  return {
    id,
    name: `Purchase ${id}`,
    category: 'furniture',
    status: 'planned',
    targetDeliveryDate: null,
    earliestDeliveryDate: null,
    latestDeliveryDate: null,
    actualDeliveryDate: null,
    area: null,
    isLate: false,
    dependencyIds: [],
    ...o,
  };
}

function timeline(o: Partial<TimelineResponse> = {}): TimelineResponse {
  return {
    workItems: [],
    dependencies: [
      { predecessorId: 'a', successorId: 'b', dependencyType: 'finish_to_start', leadLagDays: 0 },
    ],
    milestones: [],
    householdItems: [],
    criticalPath: ['a'],
    dateRange: { earliest: '2026-01-01', latest: '2026-12-31' },
    holdsUp: { workItems: {}, milestones: {} },
    ...o,
  };
}

const ALL = new Set<ScheduleShowKey>(SCHEDULE_SHOW_KEYS);

describe('constants', () => {
  it('fixes the order of the Show keys, kinds, groups, phone views, subjects, zooms and preference key', () => {
    expect([...SCHEDULE_SHOW_KEYS]).toEqual([
      'tasks',
      'milestones',
      'purchases',
      'arrows',
      'critical',
      'done',
    ]);
    expect([...SCHEDULE_KIND_KEYS]).toEqual(['tasks', 'milestones', 'purchases']);
    expect([...SCHEDULE_GROUPS]).toEqual(['time', 'area']);
    expect([...SCHEDULE_PHONE_VIEWS]).toEqual(['agenda', 'chart']);
    expect([...SCHEDULE_SUBJECT_KINDS]).toEqual(['task', 'milestone', 'purchase']);
    expect([...SCHEDULE_ZOOMS]).toEqual(['day', 'week', 'month']);
    expect(SCHEDULE_PREFERENCE_KEY).toBe('schedule.view');
  });

  it('defaults to everything on except Done', () => {
    expect([...DEFAULT_SCHEDULE_SHOW].sort()).toEqual(
      ['arrows', 'critical', 'milestones', 'purchases', 'tasks'].sort(),
    );
    expect(DEFAULT_SCHEDULE_SHOW.has('done')).toBe(false);
  });
});

describe('rowKey / parseRowKey', () => {
  it('builds keys per kind', () => {
    expect(rowKey('task', 'abc')).toBe('task:abc');
    expect(rowKey('purchase', 'p1')).toBe('purchase:p1');
    expect(rowKey('milestone', 7)).toBe('milestone:7');
  });

  it('round-trips each kind with the id as a string', () => {
    expect(parseRowKey('task:abc')).toEqual({ kind: 'task', id: 'abc' });
    expect(parseRowKey('purchase:p1')).toEqual({ kind: 'purchase', id: 'p1' });
    expect(parseRowKey('milestone:7')).toEqual({ kind: 'milestone', id: '7' });
  });

  it('splits at the first colon only, so ids may contain colons', () => {
    expect(parseRowKey('task:a:b:c')).toEqual({ kind: 'task', id: 'a:b:c' });
  });
});

describe('parseSchedulePreference', () => {
  it('returns {} for undefined, bad JSON, non-objects and arrays', () => {
    expect(parseSchedulePreference(undefined)).toEqual({});
    expect(parseSchedulePreference('{not json')).toEqual({});
    expect(parseSchedulePreference('42')).toEqual({});
    expect(parseSchedulePreference('null')).toEqual({});
    expect(parseSchedulePreference('[1,2]')).toEqual({});
  });

  it('reads every valid field', () => {
    const raw = JSON.stringify({
      show: ['done', 'tasks'],
      zoom: 'week',
      group: 'area',
      areaId: 'a1',
      legendOpen: true,
      phoneView: 'chart',
    });
    expect(parseSchedulePreference(raw)).toEqual({
      show: ['tasks', 'done'],
      zoom: 'week',
      group: 'area',
      areaId: 'a1',
      legendOpen: true,
      phoneView: 'chart',
    });
  });

  it('keeps a null areaId (no area) and a false legendOpen', () => {
    expect(parseSchedulePreference(JSON.stringify({ areaId: null, legendOpen: false }))).toEqual({
      areaId: null,
      legendOpen: false,
    });
  });

  it('drops only the fields with unknown members', () => {
    const raw = JSON.stringify({
      show: ['bogus'],
      zoom: 'year',
      group: 'colour',
      areaId: 5,
      legendOpen: 'yes',
      phoneView: 'list',
    });
    expect(parseSchedulePreference(raw)).toEqual({});
    expect(parseSchedulePreference(JSON.stringify({ show: 'tasks', zoom: 'day' }))).toEqual({
      zoom: 'day',
    });
  });

  it('ignores unknown show keys but keeps the known ones in fixed order', () => {
    expect(parseSchedulePreference(JSON.stringify({ show: ['x', 'milestones', 'tasks'] }))).toEqual(
      {
        show: ['tasks', 'milestones'],
      },
    );
  });
});

describe('parseShowParam', () => {
  it('is null for absent or empty', () => {
    expect(parseShowParam(null)).toBeNull();
    expect(parseShowParam('')).toBeNull();
  });

  it('is null when no kind is on, even with other toggles', () => {
    expect(parseShowParam('arrows,critical,done')).toBeNull();
    expect(parseShowParam('nonsense')).toBeNull();
  });

  it('returns exactly the listed known keys', () => {
    expect([...parseShowParam('tasks,done,bogus')!].sort()).toEqual(['done', 'tasks']);
  });
});

describe('serializeShowParam', () => {
  it('is null for the default set', () => {
    expect(serializeShowParam(new Set(DEFAULT_SCHEDULE_SHOW))).toBeNull();
  });

  it('lists the keys in fixed order regardless of insertion order', () => {
    expect(serializeShowParam(new Set<ScheduleShowKey>(['done', 'tasks']))).toBe('tasks,done');
    expect(serializeShowParam(ALL)).toBe('tasks,milestones,purchases,arrows,critical,done');
  });

  it('round-trips through parseShowParam', () => {
    const show = new Set<ScheduleShowKey>(['milestones', 'critical']);
    expect(parseShowParam(serializeShowParam(show))).toEqual(show);
  });
});

describe('showFromLegacyFilter', () => {
  it('maps the legacy kind names and adds the default non-kind toggles', () => {
    expect([...showFromLegacyFilter('work-items')!].sort()).toEqual([
      'arrows',
      'critical',
      'tasks',
    ]);
    expect([...showFromLegacyFilter('milestones,household-items')!].sort()).toEqual([
      'arrows',
      'critical',
      'milestones',
      'purchases',
    ]);
    expect(showFromLegacyFilter('work-items,milestones,household-items')).toEqual(
      DEFAULT_SCHEDULE_SHOW,
    );
  });

  it('is null when no known kind is named', () => {
    expect(showFromLegacyFilter('')).toBeNull();
    expect(showFromLegacyFilter('nope,other')).toBeNull();
  });
});

describe('changedShowCount', () => {
  it('is 0 for the default and counts every toggle that differs', () => {
    expect(changedShowCount(DEFAULT_SCHEDULE_SHOW)).toBe(0);
    expect(changedShowCount(ALL)).toBe(1);
    expect(changedShowCount(new Set<ScheduleShowKey>(['tasks']))).toBe(4);
    expect(changedShowCount(new Set<ScheduleShowKey>())).toBe(5);
  });
});

describe('isLastVisibleKind', () => {
  it('is true only for the single kind left on', () => {
    const only = new Set<ScheduleShowKey>(['milestones', 'arrows']);
    expect(isLastVisibleKind(only, 'milestones')).toBe(true);
    expect(isLastVisibleKind(only, 'tasks')).toBe(false);
    expect(isLastVisibleKind(only, 'arrows')).toBe(false);
  });

  it('is false while several kinds are on, and for a single kind that is off', () => {
    expect(isLastVisibleKind(DEFAULT_SCHEDULE_SHOW, 'tasks')).toBe(false);
    expect(isLastVisibleKind(new Set<ScheduleShowKey>(), 'tasks')).toBe(false);
  });
});

describe('matchesArea', () => {
  it('matches the area itself and any descendant, never other areas', () => {
    expect(matchesArea(area('a'), 'a')).toBe(true);
    expect(matchesArea(area('c', ['a', 'b']), 'a')).toBe(true);
    expect(matchesArea(area('c', ['a', 'b']), 'b')).toBe(true);
    expect(matchesArea(area('c', ['a', 'b']), 'z')).toBe(false);
  });

  it('is false for a missing area', () => {
    expect(matchesArea(null, 'a')).toBe(false);
    expect(matchesArea(undefined, 'a')).toBe(false);
  });
});

describe('isLateTask / isCurrentTask', () => {
  it('a not-completed task with a late or held-up signal is late', () => {
    expect(isLateTask(task('a', { isLate: true, lateDays: 3 }))).toBe(true);
    expect(isLateTask(task('a', { isHeldUp: true }))).toBe(true);
    expect(isLateTask(task('a'))).toBe(false);
  });

  it('a completed task is never late', () => {
    expect(isLateTask(task('a', { status: 'completed', isLate: true, lateDays: 3 }))).toBe(false);
  });

  it('in progress or late is current', () => {
    expect(isCurrentTask(task('a', { status: 'in_progress' }))).toBe(true);
    expect(isCurrentTask(task('a', { isHeldUp: true }))).toBe(true);
    expect(isCurrentTask(task('a'))).toBe(false);
    expect(isCurrentTask(task('a', { status: 'completed' }))).toBe(false);
  });
});

describe('filterTimeline', () => {
  const base = () =>
    timeline({
      workItems: [
        task('open'),
        task('done', { status: 'completed' }),
        task('kitchen', { area: area('k', ['house']) }),
        task('kitchenDone', { status: 'completed', area: area('k', ['house']) }),
      ],
      milestones: [
        milestone(1, ['open']),
        milestone(2, ['done'], { isCompleted: true }),
        milestone(3, ['kitchenDone']),
        milestone(4, []),
      ],
      householdItems: [
        purchase('sofa'),
        purchase('lamp', { status: 'arrived' }),
        purchase('table', { area: area('k', ['house']) }),
      ],
    });

  const view = (
    show: ReadonlySet<ScheduleShowKey>,
    areaId: string | null = null,
    applyDone = true,
  ) => ({
    show,
    areaId,
    applyDone,
  });

  it('with everything on and no area returns all rows and counts nothing hidden', () => {
    const { data, doneHidden } = filterTimeline(base(), view(ALL));
    expect(data.workItems).toHaveLength(4);
    expect(data.milestones).toHaveLength(4);
    expect(data.householdItems).toHaveLength(3);
    expect(doneHidden).toBe(0);
  });

  it('Done off removes completed tasks, reached milestones and arrived purchases and counts each once', () => {
    const { data, doneHidden } = filterTimeline(base(), view(DEFAULT_SCHEDULE_SHOW));
    expect(data.workItems.map((w) => w.id)).toEqual(['open', 'kitchen']);
    expect(data.milestones.map((m) => m.id)).toEqual([1, 3, 4]);
    expect(data.householdItems.map((h) => h.id)).toEqual(['sofa', 'table']);
    expect(doneHidden).toBe(2 + 1 + 1);
  });

  it('applyDone false keeps finished items and reports none hidden (the agenda)', () => {
    const { data, doneHidden } = filterTimeline(base(), view(DEFAULT_SCHEDULE_SHOW, null, false));
    expect(data.workItems).toHaveLength(4);
    expect(data.milestones).toHaveLength(4);
    expect(data.householdItems).toHaveLength(3);
    expect(doneHidden).toBe(0);
  });

  it('turning a kind off empties that kind without counting it as Done-hidden', () => {
    const { data, doneHidden } = filterTimeline(
      base(),
      view(new Set<ScheduleShowKey>(['milestones', 'purchases', 'done'])),
    );
    expect(data.workItems).toEqual([]);
    expect(data.milestones).toHaveLength(4);
    expect(data.householdItems).toHaveLength(3);
    expect(doneHidden).toBe(0);
    const noDone = filterTimeline(base(), view(new Set<ScheduleShowKey>(['tasks'])));
    expect(noDone.data.milestones).toEqual([]);
    expect(noDone.data.householdItems).toEqual([]);
    // only the completed tasks removed by Done are counted, not the hidden kinds
    expect(noDone.doneHidden).toBe(2);
  });

  it('an area keeps tasks and purchases of that area or below, and counts only Done removals', () => {
    const { data, doneHidden } = filterTimeline(base(), view(DEFAULT_SCHEDULE_SHOW, 'house'));
    expect(data.workItems.map((w) => w.id)).toEqual(['kitchen']);
    expect(data.householdItems.map((h) => h.id)).toEqual(['table']);
    // kitchenDone is removed by Done once; the rows the area removed are not counted
    expect(doneHidden).toBe(1);
  });

  it('an area keeps a milestone only when one of its tasks matches the area', () => {
    const { data } = filterTimeline(base(), view(DEFAULT_SCHEDULE_SHOW, 'k'));
    // 1 -> open (no area), 4 -> no tasks: gone; 3 -> kitchenDone (in the area): kept
    expect(data.milestones.map((m) => m.id)).toEqual([3]);
  });

  it('the area-milestone rule ignores the Tasks toggle', () => {
    const { data } = filterTimeline(base(), view(new Set<ScheduleShowKey>(['milestones']), 'k'));
    expect(data.workItems).toEqual([]);
    expect(data.milestones.map((m) => m.id)).toEqual([3]);
  });

  it('the area-milestone rule ignores the Done toggle (a milestone of a hidden finished task stays)', () => {
    const withDone = filterTimeline(base(), view(ALL, 'k'));
    const withoutDone = filterTimeline(base(), view(DEFAULT_SCHEDULE_SHOW, 'k'));
    expect(withDone.data.milestones.map((m) => m.id)).toEqual([3]);
    expect(withoutDone.data.milestones.map((m) => m.id)).toEqual([3]);
    expect(withoutDone.data.workItems.map((w) => w.id)).toEqual(['kitchen']);
  });

  it('keeps dependencies, critical path, holds-up and the date range untouched', () => {
    const input = base();
    const { data } = filterTimeline(input, view(new Set<ScheduleShowKey>(['tasks']), 'k'));
    expect(data.dependencies).toBe(input.dependencies);
    expect(data.criticalPath).toBe(input.criticalPath);
    expect(data.dateRange).toBe(input.dateRange);
    expect(data.holdsUp).toBe(input.holdsUp);
  });

  it('does not mutate the input arrays', () => {
    const input = base();
    const before = JSON.stringify(input);
    const { data } = filterTimeline(input, view(DEFAULT_SCHEDULE_SHOW, 'k'));
    expect(JSON.stringify(input)).toBe(before);
    expect(data.workItems).not.toBe(input.workItems);
  });

  it('copies the rows even when nothing is hidden', () => {
    const input = base();
    const { data } = filterTimeline(input, view(ALL));
    expect(data.workItems).not.toBe(input.workItems);
    expect(data.workItems).toEqual(input.workItems);
  });
});
