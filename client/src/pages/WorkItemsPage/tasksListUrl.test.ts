import { describe, it, expect } from '@jest/globals';
import type { AreaSummary } from '@cornerstone/shared';
import type { ObjectListQuery } from '../../components/ObjectList/types.js';
import {
  NONE_KEY,
  TASK_CHIPS,
  TASK_DEFAULT_SORT,
  TASK_FILTER_PARAMS,
  TASK_LEGACY_COLUMN_KEYS,
  areaPathLabel,
  tasksListApiParams,
} from './tasksListUrl.js';

function query(overrides: Partial<ObjectListQuery> = {}): ObjectListQuery {
  return {
    q: '',
    chip: 'all',
    searchingAll: false,
    serverGroup: null,
    sortBy: 'start_date',
    sortOrder: 'asc',
    isDefaultSort: true,
    filters: {},
    ...overrides,
  };
}

describe('tasksListApiParams', () => {
  it('sends only the default sort for an untouched list', () => {
    expect(tasksListApiParams(query())).toEqual({ sortBy: 'start_date', sortOrder: 'asc' });
  });

  it('sends the search, a status chip and the time grouping', () => {
    expect(
      tasksListApiParams(query({ q: 'tile', chip: 'in_progress', serverGroup: 'time' })),
    ).toEqual({
      q: 'tile',
      status: 'in_progress',
      group: 'time',
      sortBy: 'start_date',
      sortOrder: 'asc',
    });
  });

  it('sends no status for the All chip or an unknown chip, and no group for another grouping', () => {
    expect(tasksListApiParams(query({ chip: 'all' }))).not.toHaveProperty('status');
    expect(tasksListApiParams(query({ chip: 'nope' }))).not.toHaveProperty('status');
    expect(tasksListApiParams(query({ serverGroup: 'area' }))).not.toHaveProperty('group');
  });

  it('keeps every sort the server accepts and falls back for an unknown one', () => {
    for (const sortBy of [
      'start_date',
      'end_date',
      'title',
      'status',
      'expected_cost',
      'created_at',
    ]) {
      expect(tasksListApiParams(query({ sortBy, sortOrder: 'desc' }))).toMatchObject({
        sortBy,
        sortOrder: 'desc',
      });
    }
    expect(tasksListApiParams(query({ sortBy: 'bogus' })).sortBy).toBe(TASK_DEFAULT_SORT);
  });

  it('passes every filter', () => {
    expect(
      tasksListApiParams(
        query({
          filters: {
            areaId: 'area-1',
            assignedVendorId: 'v-1',
            assignedUserId: 'u-1',
            milestoneId: '12',
            startDate: 'from:2026-01-01,to:2026-02-01',
            endDate: 'from:2026-03-01,to:2026-04-01',
            budgetLines: 'min:0,max:5',
          },
        }),
      ),
    ).toEqual({
      sortBy: 'start_date',
      sortOrder: 'asc',
      areaId: 'area-1',
      assignedVendorId: 'v-1',
      assignedUserId: 'u-1',
      milestoneId: 12,
      startDateFrom: '2026-01-01',
      startDateTo: '2026-02-01',
      endDateFrom: '2026-03-01',
      endDateTo: '2026-04-01',
      budgetLinesMin: 0,
      budgetLinesMax: 5,
    });
  });

  it('sends one side of a date range and one side of a count range', () => {
    const params = tasksListApiParams(
      query({
        filters: { startDate: 'to:2026-02-01', endDate: 'from:2026-03-01', budgetLines: 'max:3' },
      }),
    );
    expect(params).toMatchObject({
      startDateTo: '2026-02-01',
      endDateFrom: '2026-03-01',
      budgetLinesMax: 3,
    });
    expect(params).not.toHaveProperty('startDateFrom');
    expect(params).not.toHaveProperty('endDateTo');
    expect(params).not.toHaveProperty('budgetLinesMin');
  });

  it.each(['abc', '0', '1.5', '-2', ''])('omits an invalid milestoneId (%p)', (milestoneId) => {
    expect(tasksListApiParams(query({ filters: { milestoneId } }))).not.toHaveProperty(
      'milestoneId',
    );
  });

  it('omits fractional and negative cost-line bounds', () => {
    expect(
      tasksListApiParams(query({ filters: { budgetLines: 'min:1.5,max:-1' } })),
    ).not.toHaveProperty('budgetLinesMin');
    const params = tasksListApiParams(query({ filters: { budgetLines: 'min:1.5,max:2' } }));
    expect(params).not.toHaveProperty('budgetLinesMin');
    expect(params.budgetLinesMax).toBe(2);
  });

  it('ignores invalid ranges', () => {
    const params = tasksListApiParams(
      query({ filters: { startDate: 'from:nope', budgetLines: 'garbage' } }),
    );
    expect(params).toEqual({ sortBy: 'start_date', sortOrder: 'asc' });
  });

  it('never sends page, pageSize or ids', () => {
    const params = tasksListApiParams(query({ q: 'x', chip: 'completed', serverGroup: 'time' }));
    for (const key of ['page', 'pageSize', 'ids']) expect(params).not.toHaveProperty(key);
  });
});

describe('constants', () => {
  it('chips are the stored statuses and the filter params are in panel order', () => {
    expect(TASK_CHIPS).toEqual(['not_started', 'in_progress', 'completed']);
    expect(TASK_FILTER_PARAMS).toEqual([
      'areaId',
      'assignedVendorId',
      'assignedUserId',
      'milestoneId',
      'startDate',
      'endDate',
      'budgetLines',
    ]);
    expect(NONE_KEY).toBe('__none__');
  });

  it('maps the replaced DataTable column keys', () => {
    expect(TASK_LEGACY_COLUMN_KEYS).toEqual({
      title: null,
      status: null,
      area: null,
      assignedTo: 'who',
      vendor: 'who',
      startDate: 'dates',
      endDate: 'dates',
      budgetLines: 'expectedCost',
    });
  });
});

describe('areaPathLabel', () => {
  it('joins the ancestors and the area with a chevron', () => {
    const area = {
      id: 'k',
      name: 'Kitchen',
      color: null,
      ancestors: [
        { id: 'h', name: 'House', color: null },
        { id: 'g', name: 'Ground floor', color: null },
      ],
    } as AreaSummary;
    expect(areaPathLabel(area)).toBe('House › Ground floor › Kitchen');
    expect(areaPathLabel({ ...area, ancestors: [] })).toBe('Kitchen');
  });
});
