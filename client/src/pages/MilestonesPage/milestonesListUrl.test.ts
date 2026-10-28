import { describe, it, expect } from '@jest/globals';
import type { MilestoneListRow } from '@cornerstone/shared';
import type { ObjectListQuery } from '../../components/ObjectList/types.js';
import {
  MILESTONE_DEFAULT_SORT,
  MILESTONE_FILTER_PARAMS,
  MILESTONE_LEGACY_COLUMN_KEYS,
  MILESTONE_LIST_CHIPS,
  MILESTONE_SORTS,
  selectMilestoneRows,
} from './milestonesListUrl.js';

function query(overrides: Partial<ObjectListQuery> = {}): ObjectListQuery {
  return {
    q: '',
    chip: 'all',
    searchingAll: false,
    serverGroup: null,
    sortBy: 'target_date',
    sortOrder: 'asc',
    isDefaultSort: true,
    filters: {},
    ...overrides,
  };
}

let nextId = 1;
function row(overrides: Partial<MilestoneListRow> = {}): MilestoneListRow {
  const id = nextId++;
  return {
    id,
    title: `Milestone ${id}`,
    description: null,
    targetDate: '2026-06-01',
    isCompleted: false,
    completedAt: null,
    color: null,
    workItemCount: 0,
    dependentWorkItemCount: 0,
    createdBy: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    projectedDate: null,
    holdsUp: null,
    ...overrides,
  };
}

const titles = (rows: readonly MilestoneListRow[]) => rows.map((r) => r.title);
const select = (rows: MilestoneListRow[], q: Partial<ObjectListQuery> = {}) =>
  selectMilestoneRows(rows, query(q));

describe('constants', () => {
  it('offers Upcoming and Reached chips only, and the five sorts', () => {
    expect(MILESTONE_LIST_CHIPS).toEqual(['upcoming', 'reached']);
    expect(MILESTONE_SORTS).toEqual([
      'target_date',
      'title',
      'projected_date',
      'status',
      'waits_for',
    ]);
    expect(MILESTONE_DEFAULT_SORT).toBe('target_date');
    expect(MILESTONE_FILTER_PARAMS).toEqual(['targetDate', 'waitsFor']);
  });

  it('maps the old column keys onto the new ones', () => {
    expect(MILESTONE_LEGACY_COLUMN_KEYS).toEqual({
      title: null,
      status: null,
      targetDate: 'target',
      workItemCount: 'waitsFor',
    });
  });
});

describe('chip and scope total', () => {
  const open = row({ title: 'Open' });
  const done = row({ title: 'Done', isCompleted: true });

  it('All keeps every milestone', () => {
    expect(titles(select([open, done]).items).sort()).toEqual(['Done', 'Open']);
  });

  it('Upcoming keeps the milestones not yet reached, Reached the others', () => {
    expect(titles(select([open, done], { chip: 'upcoming' }).items)).toEqual(['Open']);
    expect(titles(select([open, done], { chip: 'reached' }).items)).toEqual(['Done']);
  });

  it('scopeTotal counts the chip only, never the search or the filters', () => {
    const result = select([open, done, row({ title: 'Other' })], {
      chip: 'upcoming',
      q: 'zzz',
      filters: { waitsFor: 'min:5' },
    });

    expect(result.items).toEqual([]);
    expect(result.scopeTotal).toBe(2);
  });

  it('scopeTotal is every milestone for All', () => {
    expect(select([open, done]).scopeTotal).toBe(2);
  });
});

describe('search', () => {
  it('matches the title and the description, ignoring case and accents', () => {
    const a = row({ title: 'Roof closed' });
    const b = row({ title: 'Handover', description: 'Keys at the Café' });
    const c = row({ title: 'Garden' });

    expect(titles(select([a, b, c], { q: 'ROOF' }).items)).toEqual(['Roof closed']);
    expect(titles(select([a, b, c], { q: 'cafe' }).items)).toEqual(['Handover']);
  });

  it('a milestone without a description is matched by its title only', () => {
    expect(select([row({ title: 'Garden' })], { q: 'null' }).items).toEqual([]);
  });
});

describe('filters', () => {
  const march = row({ title: 'March', targetDate: '2026-03-15', workItemCount: 1 });
  const april = row({ title: 'April', targetDate: '2026-04-15', workItemCount: 4 });
  const may = row({ title: 'May', targetDate: '2026-05-15', workItemCount: 9 });

  it('Target date is an inclusive range, either side alone', () => {
    const f = (value: string) =>
      titles(select([march, april, may], { filters: { targetDate: value } }).items);

    expect(f('from:2026-04-15,to:2026-05-15')).toEqual(['April', 'May']);
    expect(f('from:2026-04-16')).toEqual(['May']);
    expect(f('to:2026-03-14')).toEqual([]);
    expect(f('to:2026-03-15')).toEqual(['March']);
  });

  it('Waits for is an inclusive count range, either side alone', () => {
    const f = (value: string) =>
      titles(select([march, april, may], { filters: { waitsFor: value } }).items);

    expect(f('min:4,max:9')).toEqual(['April', 'May']);
    expect(f('min:5')).toEqual(['May']);
    expect(f('max:1')).toEqual(['March']);
  });

  it('ignores a range value that has no valid side', () => {
    const result = select([march, april], {
      filters: { targetDate: 'from:2026-13-40', waitsFor: 'nonsense' },
    });

    expect(result.items).toHaveLength(2);
  });
});

describe('sorting', () => {
  it('Target date ascending by default, then title, then id for ties', () => {
    const late = row({ title: 'Z late', targetDate: '2026-09-01' });
    const b = row({ title: 'B', targetDate: '2026-05-01' });
    const a = row({ title: 'A', targetDate: '2026-05-01' });
    const twinFirst = row({ title: 'A', targetDate: '2026-05-01' });

    expect(select([late, b, twinFirst, a]).items.map((r) => r.id)).toEqual([
      a.id,
      twinFirst.id,
      b.id,
      late.id,
    ]);
  });

  it('Target date descending reverses the dates but keeps the tie order', () => {
    const early = row({ title: 'Early', targetDate: '2026-01-01' });
    const b = row({ title: 'B', targetDate: '2026-05-01' });
    const a = row({ title: 'A', targetDate: '2026-05-01' });

    expect(titles(select([early, b, a], { sortOrder: 'desc' }).items)).toEqual(['A', 'B', 'Early']);
  });

  it('Title sorts case-insensitively and by base letter (umlauts)', () => {
    const rows = [
      row({ title: 'Zaun' }),
      row({ title: 'Übergabe' }),
      row({ title: 'abnahme' }),
      row({ title: 'Uzaun' }),
      row({ title: 'Bauantrag' }),
    ];

    expect(titles(select(rows, { sortBy: 'title' }).items)).toEqual([
      'abnahme',
      'Bauantrag',
      'Übergabe',
      'Uzaun',
      'Zaun',
    ]);
    expect(titles(select(rows, { sortBy: 'title', sortOrder: 'desc' }).items)[0]).toBe('Zaun');
  });

  it('Waits for sorts by the count, ties by target date', () => {
    const a = row({ title: 'A', workItemCount: 3, targetDate: '2026-06-02' });
    const b = row({ title: 'B', workItemCount: 3, targetDate: '2026-06-01' });
    const c = row({ title: 'C', workItemCount: 1 });

    expect(titles(select([a, b, c], { sortBy: 'waits_for' }).items)).toEqual(['C', 'B', 'A']);
    expect(titles(select([a, b, c], { sortBy: 'waits_for', sortOrder: 'desc' }).items)).toEqual([
      'B',
      'A',
      'C',
    ]);
  });

  it('Status sorts Upcoming, Late, Early, Reached', () => {
    const upcoming = row({ title: 'Upcoming', targetDate: '2026-06-01' });
    const late = row({ title: 'Late', targetDate: '2026-06-02', projectedDate: '2026-06-10' });
    const early = row({ title: 'Early', targetDate: '2026-06-03', projectedDate: '2026-06-01' });
    const reached = row({ title: 'Reached', targetDate: '2026-06-04', isCompleted: true });

    const rows = [reached, early, late, upcoming];
    expect(titles(select(rows, { sortBy: 'status' }).items)).toEqual([
      'Upcoming',
      'Late',
      'Early',
      'Reached',
    ]);
    expect(titles(select(rows, { sortBy: 'status', sortOrder: 'desc' }).items)).toEqual([
      'Reached',
      'Early',
      'Late',
      'Upcoming',
    ]);
  });

  it('Projected date sorts by date and puts milestones without one last in both directions', () => {
    const a = row({ title: 'A', projectedDate: '2026-07-01' });
    const b = row({ title: 'B', projectedDate: '2026-06-01' });
    const none = row({ title: 'None', projectedDate: null });
    const none2 = row({ title: 'None 2', projectedDate: null, targetDate: '2026-07-01' });

    expect(titles(select([none, a, none2, b], { sortBy: 'projected_date' }).items)).toEqual([
      'B',
      'A',
      'None',
      'None 2',
    ]);
    expect(
      titles(select([none, a, none2, b], { sortBy: 'projected_date', sortOrder: 'desc' }).items),
    ).toEqual(['A', 'B', 'None', 'None 2']);
  });

  it('falls back to Target date for a sort it does not know', () => {
    const later = row({ title: 'Later', targetDate: '2026-09-01' });
    const sooner = row({ title: 'Sooner', targetDate: '2026-01-01' });

    expect(titles(select([later, sooner], { sortBy: 'nonsense' }).items)).toEqual([
      'Sooner',
      'Later',
    ]);
  });

  it('does not change the order of the rows it was given', () => {
    const rows = [row({ targetDate: '2026-09-01' }), row({ targetDate: '2026-01-01' })];
    const before = rows.map((r) => r.id);

    select(rows);

    expect(rows.map((r) => r.id)).toEqual(before);
  });
});
