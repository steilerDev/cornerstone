/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { act, renderHook, waitFor } from '@testing-library/react';
import { makeSearchCompanies } from '../../test/companySearchMock.js';
import { KITCHEN, makeTaskResponse, makeTaskRow } from '../../test/taskListFixtures.js';
import type * as WorkItemsApiTypes from '../../lib/workItemsApi.js';
import type * as UsersApiTypes from '../../lib/usersApi.js';
import type * as MilestonesApiTypes from '../../lib/milestonesApi.js';
import type * as VendorsApiTypes from '../../lib/vendorsApi.js';
import type * as ListModule from './useTasksList.js';

const mockListWorkItemRows = jest.fn<typeof WorkItemsApiTypes.listWorkItemRows>();
const mockFetchVendors = jest.fn<typeof VendorsApiTypes.fetchVendors>();

jest.unstable_mockModule('../../lib/workItemsApi.js', () => ({
  listWorkItemRows: mockListWorkItemRows,
  listWorkItems: jest.fn(),
}));
jest.unstable_mockModule('../../lib/usersApi.js', () => ({
  listUsers: jest.fn<typeof UsersApiTypes.listUsers>().mockResolvedValue({ users: [] } as never),
}));
jest.unstable_mockModule('../../lib/milestonesApi.js', () => ({
  listMilestones: jest.fn<typeof MilestonesApiTypes.listMilestones>().mockResolvedValue([]),
}));
jest.unstable_mockModule('../../lib/vendorsApi.js', () => ({
  fetchVendors: mockFetchVendors,
  searchCompanies: makeSearchCompanies(mockFetchVendors),
  fetchVendor: jest.fn(),
}));
jest.unstable_mockModule('../../hooks/useAreas.js', () => ({
  useAreas: () => ({ areas: [], isLoading: false, error: null, refetch: jest.fn() }),
}));
jest.unstable_mockModule('../../contexts/LocaleContext.js', () => ({
  useLocale: jest.fn(() => ({
    locale: 'en' as const,
    resolvedLocale: 'en' as const,
    vatRate: 0.19,
    currency: 'EUR',
    setLocale: jest.fn(),
    syncWithServer: jest.fn(),
  })),
  LocaleProvider: ({ children }: { children: React.ReactNode }) => children,
}));

let useTasksList: typeof ListModule.useTasksList;

const A = makeTaskRow({ id: 'wi-a', title: 'Pour the slab', timeWindow: 'late', isLate: true });
const B = makeTaskRow({ id: 'wi-b', title: 'Frame the walls', timeWindow: 'this_week' });
const C = makeTaskRow({ id: 'wi-c', title: 'Hang the doors', timeWindow: 'later' });

function setup(url = '/project/work-items') {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>
  );
  return renderHook(() => useTasksList(), { wrapper });
}

async function loaded(result: { current: ListModule.UseTasksListResult }) {
  await waitFor(() => expect(result.current.list.totalItems).not.toBeNull());
}

beforeEach(async () => {
  if (!useTasksList) ({ useTasksList } = await import('./useTasksList.js'));
  mockListWorkItemRows.mockReset();
  mockListWorkItemRows.mockResolvedValue(makeTaskResponse([A, B, C]));
});

describe('fetchPage mapping', () => {
  it('requests the rows with the time grouping, page and pageSize, and maps the response', async () => {
    mockListWorkItemRows.mockResolvedValue(makeTaskResponse([A, B, C], { scopeTotal: 9 }));
    const { result } = setup();
    await loaded(result);
    expect(mockListWorkItemRows.mock.calls[0]![0]).toEqual({
      sortBy: 'start_date',
      sortOrder: 'asc',
      group: 'time',
      page: 1,
      pageSize: 100,
    });
    expect(result.current.list.items.map((r) => r.id)).toEqual(['wi-a', 'wi-b', 'wi-c']);
    expect(result.current.list.totalItems).toBe(3);
    expect(result.current.list.groupCounts).toEqual({
      late: 1,
      this_week: 1,
      next_two_weeks: 0,
      later: 1,
      done: 0,
    });
    expect(result.current.list.meta).toEqual({ scopeTotal: 9 });
    expect(result.current.scopeTotal).toBe(9);
  });

  it('has no scope total before the first batch', () => {
    mockListWorkItemRows.mockReturnValue(new Promise(() => undefined));
    const { result } = setup();
    expect(result.current.scopeTotal).toBeNull();
  });

  it('sends no group for a client-side grouping', async () => {
    const { result } = setup('/project/work-items?group=area');
    await loaded(result);
    expect(mockListWorkItemRows.mock.calls[0]![0]).not.toHaveProperty('group');
  });
});

describe('config and labels', () => {
  it('defines the status chips, the four groupings, sorts and the legacy column keys', async () => {
    const { result } = setup();
    await loaded(result);
    const { config } = result.current;
    expect(config.listKey).toBe('workItems');
    expect(config.testIdPrefix).toBe('tasks');
    expect(config.chips!.options.map((o) => [o.value, o.label])).toEqual([
      ['not_started', 'Not started'],
      ['in_progress', 'In progress'],
      ['completed', 'Done'],
    ]);
    expect(config.groupBy!.defaultValue).toBe('time');
    expect(config.groupBy!.options.map((o) => o.value)).toEqual([
      'time',
      'area',
      'company',
      'status',
    ]);
    expect(config.sort.options.map((o) => o.value)).toEqual([
      'start_date',
      'end_date',
      'title',
      'status',
      'expected_cost',
      'created_at',
    ]);
    expect(config.sort.defaultValue).toBe('start_date');
    expect(config.legacyColumnKeys).toMatchObject({ assignedTo: 'who', vendor: 'who' });
    expect(config.filters!.map((f) => f.param)).toEqual([
      'areaId',
      'assignedVendorId',
      'assignedUserId',
      'milestoneId',
      'startDate',
      'endDate',
      'budgetLines',
    ]);
  });

  it('time groups: server-ordered windows, a Late badge, Done flagged', async () => {
    const { result } = setup();
    await loaded(result);
    const time = result.current.config.groupBy!.options[0]!;
    expect(time.server).toBe(true);
    expect(time.order).toEqual(['late', 'this_week', 'next_two_weeks', 'later', 'done']);
    const late = time.groupOf(A);
    expect(late).toMatchObject({ key: 'late', label: 'Late' });
    expect(late.badge).toBeDefined();
    expect(time.groupOf(B)).toMatchObject({ key: 'this_week', label: 'This week', done: false });
    expect(time.groupOf(B).badge).toBeUndefined();
    expect(time.groupOf(makeTaskRow({ timeWindow: 'done' })).done).toBe(true);
    expect(time.groupOf(makeTaskRow({ timeWindow: 'next_two_weeks' })).label).toBe('Next 2 weeks');
  });

  it('area groups use the full path and send No area last; company groups likewise', async () => {
    const { result } = setup();
    await loaded(result);
    const [, area, company, status] = result.current.config.groupBy!.options;
    expect(area!.last).toEqual(['__none__']);
    expect(area!.groupOf(makeTaskRow({ area: KITCHEN }))).toEqual({
      key: 'area-kitchen',
      label: 'House › Ground floor › Kitchen',
    });
    expect(area!.groupOf(B)).toEqual({ key: '__none__', label: 'No area' });
    expect(company!.last).toEqual(['__none__']);
    expect(
      company!.groupOf(
        makeTaskRow({ assignedVendor: { id: 'v-1', name: 'Example Carpentry Co' } as never }),
      ),
    ).toEqual({ key: 'v-1', label: 'Example Carpentry Co' });
    expect(company!.groupOf(B)).toEqual({ key: '__none__', label: 'No company' });
    expect(status!.order).toEqual(['not_started', 'in_progress', 'completed']);
    expect(status!.groupOf(makeTaskRow({ status: 'completed' }))).toMatchObject({
      key: 'completed',
      label: 'Done',
      done: true,
    });
    expect(status!.groupOf(B).done).toBe(false);
  });

  it('labels the list', async () => {
    const { result } = setup();
    await loaded(result);
    const { labels } = result.current;
    expect(labels.title).toBe('Tasks');
    expect(labels.search).toBe('Search tasks');
    expect(labels.resultCount(1)).toBe('1 task');
    expect(labels.resultCount(3)).toBe('3 tasks');
    expect(labels.empty).toBe('No tasks yet');
    expect(labels.noMatch).toBe('No tasks match.');
    expect(labels.loadFailed).toBe("Couldn't load the tasks.");
  });
});

describe('refreshRows', () => {
  async function ready(url?: string) {
    const view = setup(url);
    await loaded(view.result);
    mockListWorkItemRows.mockClear();
    return view;
  }

  it('does nothing for no keys', async () => {
    const { result } = await ready();
    await expect(result.current.refreshRows([])).resolves.toBeNull();
    expect(mockListWorkItemRows).not.toHaveBeenCalled();
  });

  it('reloads instead of asking for more than 100 ids', async () => {
    const { result } = await ready();
    const keys = Array.from({ length: 101 }, (_, i) => `k${i}`);
    await expect(result.current.refreshRows(keys)).resolves.toBeNull();
    await waitFor(() => expect(mockListWorkItemRows).toHaveBeenCalledTimes(1));
    expect(mockListWorkItemRows.mock.calls[0]![0]).not.toHaveProperty('ids');
  });

  it('patches the row in place, updates the counts and returns the Late count', async () => {
    const { result } = await ready();
    const fresh = { ...B, status: 'in_progress' as const, title: 'Frame the walls (done soon)' };
    mockListWorkItemRows.mockResolvedValueOnce(makeTaskResponse([fresh])).mockResolvedValueOnce(
      makeTaskResponse([A, fresh, C], {
        scopeTotal: 11,
        pagination: { page: 1, pageSize: 1, totalItems: 3, totalPages: 3 },
      }),
    );
    let figures: Awaited<ReturnType<typeof result.current.refreshRows>> = null;
    await act(async () => {
      figures = await result.current.refreshRows(['wi-b']);
    });
    expect(figures).toEqual({ lateCount: 1 });
    expect(mockListWorkItemRows.mock.calls[0]![0]).toMatchObject({ ids: ['wi-b'], group: 'time' });
    expect(mockListWorkItemRows.mock.calls[1]![0]).toMatchObject({ page: 1, pageSize: 1 });
    expect(result.current.list.items.find((r) => r.id === 'wi-b')!.title).toBe(
      'Frame the walls (done soon)',
    );
    expect(result.current.list.groupCounts).toMatchObject({ late: 1, this_week: 1 });
    expect(result.current.scopeTotal).toBe(11);
  });

  it('removes a row that left the list', async () => {
    const { result } = await ready();
    mockListWorkItemRows
      .mockResolvedValueOnce(makeTaskResponse([]))
      .mockResolvedValueOnce(makeTaskResponse([A, C]));
    await act(async () => {
      await result.current.refreshRows(['wi-b']);
    });
    expect(result.current.list.items.map((r) => r.id)).toEqual(['wi-a', 'wi-c']);
    expect(result.current.list.totalItems).toBe(2);
  });

  it('has no Late count without the time grouping', async () => {
    const { result } = await ready('/project/work-items?group=area');
    mockListWorkItemRows
      .mockResolvedValueOnce(makeTaskResponse([B], { group: false }))
      .mockResolvedValueOnce(makeTaskResponse([A, B, C], { group: false }));
    let figures: Awaited<ReturnType<typeof result.current.refreshRows>> = null;
    await act(async () => {
      figures = await result.current.refreshRows(['wi-b']);
    });
    expect(figures).toEqual({ lateCount: null });
    expect(result.current.list.groupCounts).toBeNull();
  });

  it('reloads when a request fails', async () => {
    const { result } = await ready();
    mockListWorkItemRows.mockRejectedValueOnce(new Error('boom'));
    let figures: unknown = 'unset';
    await act(async () => {
      figures = await result.current.refreshRows(['wi-b']);
    });
    expect(figures).toBeNull();
    await waitFor(() => expect(mockListWorkItemRows.mock.calls.length).toBeGreaterThanOrEqual(3));
  });

  it('drops the answer when the query changed meanwhile', async () => {
    const { result } = await ready();
    let release: (r: ReturnType<typeof makeTaskResponse>) => void = () => undefined;
    mockListWorkItemRows.mockImplementationOnce(
      () => new Promise((resolve) => (release = resolve)),
    );
    mockListWorkItemRows.mockResolvedValue(makeTaskResponse([B]));
    let pending!: Promise<unknown>;
    act(() => {
      pending = result.current.refreshRows(['wi-b']);
    });
    act(() => result.current.list.setSearch('frame'));
    release(makeTaskResponse([B]));
    let figures: unknown = 'unset';
    await act(async () => {
      figures = await pending;
    });
    expect(figures).toBeNull();
  });

  it('reloads instead of patching when rows are still on the server and one changed window', async () => {
    const many = Array.from({ length: 100 }, (_, i) =>
      makeTaskRow({ id: `m${i}`, timeWindow: 'this_week' }),
    );
    mockListWorkItemRows.mockResolvedValue(
      makeTaskResponse(many, {
        pagination: { page: 1, pageSize: 100, totalItems: 150, totalPages: 2 },
      }),
    );
    const { result } = await ready();
    mockListWorkItemRows.mockResolvedValueOnce(
      makeTaskResponse([{ ...many[0]!, timeWindow: 'late' }]),
    );
    mockListWorkItemRows.mockResolvedValueOnce(makeTaskResponse(many));
    let figures: unknown = 'unset';
    await act(async () => {
      figures = await result.current.refreshRows(['m0']);
    });
    expect(figures).toBeNull();
    await waitFor(() => expect(mockListWorkItemRows.mock.calls.length).toBeGreaterThanOrEqual(3));
  });

  it('patches in place when more rows exist but no row changed window', async () => {
    const many = Array.from({ length: 100 }, (_, i) =>
      makeTaskRow({ id: `m${i}`, timeWindow: 'this_week' }),
    );
    mockListWorkItemRows.mockResolvedValue(
      makeTaskResponse(many, {
        pagination: { page: 1, pageSize: 100, totalItems: 150, totalPages: 2 },
      }),
    );
    const { result } = await ready();
    mockListWorkItemRows
      .mockResolvedValueOnce(makeTaskResponse([{ ...many[0]!, title: 'Renamed' }]))
      .mockResolvedValueOnce(
        makeTaskResponse(many, {
          pagination: { page: 1, pageSize: 1, totalItems: 150, totalPages: 150 },
        }),
      );
    await act(async () => {
      expect(await result.current.refreshRows(['m0'])).toEqual({ lateCount: 0 });
    });
    expect(result.current.list.items[0]!.title).toBe('Renamed');
  });

  it('treats a row that is not loaded as unchanged', async () => {
    const many = Array.from({ length: 100 }, (_, i) =>
      makeTaskRow({ id: `m${i}`, timeWindow: 'this_week' }),
    );
    mockListWorkItemRows.mockResolvedValue(
      makeTaskResponse(many, {
        pagination: { page: 1, pageSize: 100, totalItems: 150, totalPages: 2 },
      }),
    );
    const { result } = await ready();
    mockListWorkItemRows
      .mockResolvedValueOnce(
        makeTaskResponse([makeTaskRow({ id: 'unloaded', timeWindow: 'late' })]),
      )
      .mockResolvedValueOnce(makeTaskResponse(many));
    await act(async () => {
      expect(await result.current.refreshRows(['unloaded'])).not.toBeNull();
    });
  });
});
