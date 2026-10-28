/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { makeMilestoneRow } from '../../test/milestoneListFixtures.js';
import type * as MilestonesApiTypes from '../../lib/milestonesApi.js';
import type * as ListModule from './useMilestonesList.js';

const mockListRows = jest.fn<typeof MilestonesApiTypes.listMilestoneRows>();
jest.unstable_mockModule('../../lib/milestonesApi.js', () => ({
  listMilestoneRows: mockListRows,
  listMilestones: jest.fn(),
  deleteMilestone: jest.fn(),
}));

let useMilestonesList: typeof ListModule.useMilestonesList;

const roof = makeMilestoneRow({ id: 1, title: 'Roof closed', targetDate: '2026-04-01' });
const walls = makeMilestoneRow({ id: 2, title: 'Walls up', targetDate: '2026-03-01' });
const handover = makeMilestoneRow({
  id: 3,
  title: 'Handover',
  targetDate: '2026-09-01',
  isCompleted: true,
});

function setup(url = '/project/milestones') {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>
  );
  return renderHook(() => useMilestonesList(), { wrapper });
}

async function loaded(result: { current: ListModule.UseMilestonesListResult }) {
  await waitFor(() => expect(result.current.list.totalItems).not.toBeNull());
}

beforeEach(async () => {
  if (!useMilestonesList) ({ useMilestonesList } = await import('./useMilestonesList.js'));
  mockListRows.mockReset();
  mockListRows.mockResolvedValue([roof, walls, handover]);
});

describe('fetchPage', () => {
  it('loads every milestone once, sorted by Target date, and maps the scope total', async () => {
    const { result } = setup();
    await loaded(result);

    expect(mockListRows).toHaveBeenCalledTimes(1);
    expect(result.current.list.items.map((r) => r.title)).toEqual([
      'Walls up',
      'Roof closed',
      'Handover',
    ]);
    expect(result.current.list.totalItems).toBe(3);
    expect(result.current.list.meta).toEqual({ scopeTotal: 3 });
    expect(result.current.scopeTotal).toBe(3);
  });

  it('has no scope total before the first batch', () => {
    mockListRows.mockReturnValue(new Promise(() => undefined));
    const { result } = setup();

    expect(result.current.scopeTotal).toBeNull();
  });

  it('applies the chip, search and filters on the client, with the scope total of the chip', async () => {
    const { result } = setup('/project/milestones?status=upcoming&q=roof');
    await loaded(result);

    expect(result.current.list.items.map((r) => r.title)).toEqual(['Roof closed']);
    expect(result.current.list.totalItems).toBe(1);
    expect(result.current.scopeTotal).toBe(2);
  });

  it('slices the filtered rows into pages of 100', async () => {
    mockListRows.mockResolvedValue(
      Array.from({ length: 130 }, (_, i) =>
        makeMilestoneRow({ id: i + 1, title: `M ${i + 1}`, targetDate: '2026-05-01' }),
      ),
    );
    const { result } = setup();
    await loaded(result);

    expect(result.current.list.items).toHaveLength(100);
    expect(result.current.list.totalItems).toBe(130);
    expect(result.current.list.hasMore).toBe(true);

    act(() => result.current.list.loadMore());

    await waitFor(() => expect(result.current.list.items).toHaveLength(130));
  });

  it('absorbs an old ?page=2&pageSize=10 URL and a comma-separated status without an error', async () => {
    const { result } = setup('/project/milestones?page=2&pageSize=10&status=upcoming,reached');
    await loaded(result);

    expect(result.current.list.items).toHaveLength(3);
    expect(result.current.list.status).not.toBe('error');
  });

  it('keys rows by id, so one row can be updated in place', async () => {
    const { result } = setup();
    await loaded(result);

    act(() => result.current.list.updateItem('1', (row) => ({ ...row, title: 'Renamed' })));

    expect(result.current.list.items.find((r) => r.id === 1)!.title).toBe('Renamed');
  });
});

describe('config and labels', () => {
  it('has the Upcoming and Reached chips, no grouping, five sorts and two filters', async () => {
    const { result } = setup();
    await loaded(result);
    const { config } = result.current;

    expect(config.listKey).toBe('milestones');
    expect(config.testIdPrefix).toBe('milestones');
    expect(config.chips!.options.map((o) => [o.value, o.label])).toEqual([
      ['upcoming', 'Upcoming'],
      ['reached', 'Reached'],
    ]);
    expect(config.groupBy).toBeUndefined();
    expect(config.sort.options.map((o) => o.value)).toEqual([
      'target_date',
      'title',
      'projected_date',
      'status',
      'waits_for',
    ]);
    expect(config.sort.defaultValue).toBe('target_date');
    expect(config.sort.defaultOrder).toBe('asc');
    expect(config.filters!.map((f) => [f.param, f.label])).toEqual([
      ['targetDate', 'Target date'],
      ['waitsFor', 'Waits for'],
    ]);
    expect(config.legacyColumnKeys).toMatchObject({
      targetDate: 'target',
      workItemCount: 'waitsFor',
    });
  });

  it('renders the Target date and Waits for filters, writing from/to and min/max', async () => {
    const { result } = setup();
    await loaded(result);
    const writes: Array<[string, string | null]> = [];
    render(
      <>
        {result.current.config.filters!.map((def) => (
          <div key={def.param}>
            {def.render({
              id: `f-${def.param}`,
              value: null,
              onChange: (value) => writes.push([def.param, value]),
            })}
          </div>
        ))}
      </>,
    );

    fireEvent.change(screen.getByTestId('milestones-filter-targetDate-from'), {
      target: { value: '2026-03-01' },
    });
    expect(writes.at(-1)).toEqual(['targetDate', 'from:2026-03-01']);
    const max = screen.getByTestId('milestones-filter-waitsFor-max');
    expect(max).toHaveAttribute('step', '1');
    fireEvent.change(max, { target: { value: '3' } });
    fireEvent.blur(max);
    expect(writes.at(-1)).toEqual(['waitsFor', 'max:3']);
  });

  it('labels the list', async () => {
    const { result } = setup();
    await loaded(result);
    const { labels } = result.current;

    expect(labels.title).toBe('Milestones');
    expect(labels.search).toEqual(expect.any(String));
    expect(labels.resultCount(2)).toEqual(expect.stringContaining('2'));
    expect(labels.empty).toEqual(expect.any(String));
    expect(labels.noMatch).toEqual(expect.any(String));
    expect(labels.loadFailed).toEqual(expect.any(String));
  });
});
