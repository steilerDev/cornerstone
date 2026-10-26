/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest } from '@jest/globals';
import { act, render, waitFor } from '@testing-library/react';
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useNavigationType,
} from 'react-router-dom';
import { useObjectList } from './useObjectList.js';
import type { ObjectListController } from './useObjectList.js';
import type { ObjectListConfig, ObjectListPage, ObjectListQuery } from './types.js';

interface Row {
  id: string;
  title: string;
}

const config: ObjectListConfig<Row> = {
  listKey: 'tasks',
  testIdPrefix: 'tasks',
  chips: {
    options: [
      { value: 'open', label: 'Open' },
      { value: 'done', label: 'Done' },
    ],
    defaultValue: 'open',
  },
  groupBy: {
    options: [
      { value: 'client', label: 'Client', groupOf: () => ({ key: 'k', label: 'K' }) },
      { value: 'window', label: 'Window', server: true, groupOf: () => ({ key: 'w', label: 'W' }) },
    ],
  },
  sort: {
    options: [
      { value: 'title', label: 'Title' },
      { value: 'due', label: 'Due' },
    ],
    defaultValue: 'title',
    defaultOrder: 'asc',
  },
  filters: [
    { param: 'vendorId', label: 'Vendor', render: () => null },
    { param: 'minAmount', label: 'Amount', render: () => null },
  ],
};

const rows = (n: number, from = 0): Row[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `r${from + i}`,
    title: `Tile the hallway ${from + i}`,
  }));

type FetchPage = (q: ObjectListQuery, page: number, size: number) => Promise<ObjectListPage<Row>>;

function setup(
  fetchPage: FetchPage,
  url = '/tasks',
  cfg: ObjectListConfig<Row> = config,
  scrollRoot: Element | null = null,
) {
  let ctrl!: ObjectListController<Row>;
  const nav = {
    location: null as unknown as ReturnType<typeof useLocation>,
    type: 'POP',
    go: (_n: number) => {},
  };
  function Host() {
    ctrl = useObjectList<Row>({ config: cfg, fetchPage, getKey: (r) => r.id, scrollRoot });
    return null;
  }
  function Probe() {
    nav.location = useLocation();
    nav.type = useNavigationType();
    const navigate = useNavigate();
    nav.go = (n) => navigate(n);
    return null;
  }
  render(
    <MemoryRouter initialEntries={['/start', url]} initialIndex={1}>
      <Probe />
      <Routes>
        <Route path="/tasks" element={<Host />} />
        <Route path="/start" element={null} />
      </Routes>
    </MemoryRouter>,
  );
  return {
    nav,
    get: () => ctrl,
    search: () => nav.location.search,
  };
}

const ok = (items: Row[], totalItems = items.length): Promise<ObjectListPage<Row>> =>
  Promise.resolve({ items, totalItems });

describe('useObjectList', () => {
  it('U3 first fetch is page 1 with size 100; hasMore comes from totalItems', async () => {
    const fetchPage = jest.fn<FetchPage>(() => ok(rows(100), 240));
    const h = setup(fetchPage);
    await waitFor(() => expect(h.get().totalItems).toBe(240));
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(fetchPage.mock.calls[0]![1]).toBe(1);
    expect(fetchPage.mock.calls[0]![2]).toBe(100);
    expect(fetchPage.mock.calls[0]![0]).toMatchObject({ chip: 'open', q: '', sortBy: 'title' });
    expect(h.get().hasMore).toBe(true);
    expect(h.get().items).toHaveLength(100);
    expect(h.get().status).toBe('idle');
  });

  it('loads the next page on loadMore and ends when everything is loaded', async () => {
    const fetchPage = jest.fn<FetchPage>((_q, page) =>
      ok(page === 1 ? rows(100) : rows(40, 100), 140),
    );
    const h = setup(fetchPage);
    await waitFor(() => expect(h.get().status).toBe('idle'));
    act(() => h.get().loadMore());
    await waitFor(() => expect(h.get().items).toHaveLength(140));
    expect(fetchPage.mock.calls[1]![1]).toBe(2);
    expect(h.get().hasMore).toBe(false);
    expect(h.get().status).toBe('done');
  });

  it('exposes a failed fetch as error and retry re-issues the page', async () => {
    const fetchPage = jest
      .fn<FetchPage>()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ items: rows(2), totalItems: 2 });
    const h = setup(fetchPage);
    await waitFor(() => expect(h.get().status).toBe('error'));
    act(() => h.get().retry());
    await waitFor(() => expect(h.get().items).toHaveLength(2));
  });

  it('keeps meta and groupCounts from the applied batch', async () => {
    const fetchPage = jest.fn<FetchPage>(() =>
      Promise.resolve({
        items: rows(1),
        totalItems: 1,
        groupCounts: { w: 3 },
        meta: undefined,
      }),
    );
    const h = setup(fetchPage);
    await waitFor(() => expect(h.get().groupCounts).toEqual({ w: 3 }));
    expect(h.get().meta).toBeUndefined();
  });

  it('U1 every setter writes with replace and writes the expected params', async () => {
    const h = setup(() => ok(rows(1)));
    await waitFor(() => expect(h.get().totalItems).toBe(1));
    const seen: string[] = [];
    const run = async (fn: () => void) => {
      await act(async () => {
        fn();
      });
      expect(h.nav.type).toBe('REPLACE');
      seen.push(h.search());
    };
    await run(() => h.get().setSearch('tile'));
    await run(() => h.get().setChip('open'));
    await run(() => h.get().setGroup('client'));
    await run(() => h.get().setSort('due', 'desc'));
    await run(() => h.get().setFilter('vendorId', 'v1'));
    expect(seen[0]).toBe('?q=tile');
    expect(seen[1]).toBe('?q=tile&status=open');
    expect(seen[2]).toContain('group=client');
    expect(seen[3]).toContain('sortBy=due&sortOrder=desc');
    expect(seen[4]).toContain('vendorId=v1');
    await run(() => h.get().setSort('title', null));
    expect(h.search()).not.toContain('sortBy');
    expect(h.get().query).toMatchObject({ q: 'tile', chip: 'open', filters: { vendorId: 'v1' } });
    // Back goes to the entry before the list: no list entries were pushed.
    act(() => {
      h.nav.go(-1);
    });
    await waitFor(() => expect(h.nav.location.pathname).toBe('/start'));
  });

  it('U2 clearFilters clears q, chip and filters in one write; keeps sort and group', async () => {
    const h = setup(
      () => ok(rows(1)),
      '/tasks?q=tile&status=done&vendorId=v1&minAmount=5&sortBy=due&sortOrder=desc&group=client&create=1',
    );
    await waitFor(() => expect(h.get().totalItems).toBe(1));
    expect(h.get().filtersActive).toBe(true);
    expect(h.get().activeFilterCount).toBe(2);
    expect(h.get().clearable).toBe(true);
    await act(async () => {
      h.get().clearFilters();
    });
    expect(h.search()).toBe('?sortBy=due&sortOrder=desc&group=client&create=1');
    expect(h.get().filtersActive).toBe(false);
    expect(h.get().clearable).toBe(false);
  });

  it('clearSheetFilters clears only the configured filter params', async () => {
    const h = setup(() => ok(rows(1)), '/tasks?q=tile&status=done&vendorId=v1&minAmount=5');
    await waitFor(() => expect(h.get().totalItems).toBe(1));
    await act(async () => {
      h.get().clearSheetFilters();
    });
    expect(h.search()).toBe('?q=tile&status=done');
  });

  it('a chip alone is not a filter; a non-default explicit chip is clearable', async () => {
    const h = setup(() => ok(rows(1)), '/tasks?status=open');
    await waitFor(() => expect(h.get().totalItems).toBe(1));
    expect(h.get().filtersActive).toBe(false);
    expect(h.get().clearable).toBe(false);
    await act(async () => {
      h.get().setChip('done');
    });
    expect(h.get().filtersActive).toBe(false);
    expect(h.get().clearable).toBe(true);
    await act(async () => {
      h.get().setChip('all');
    });
    expect(h.get().clearable).toBe(true);
  });

  it('selecting the default chip without a search removes the status param', async () => {
    const h = setup(() => ok(rows(1)), '/tasks?status=done&vendorId=v1');
    await waitFor(() => expect(h.get().totalItems).toBe(1));
    await act(async () => {
      h.get().setChip('open');
    });
    expect(h.search()).toBe('?vendorId=v1');
    expect(h.get().query.chip).toBe('open');
    expect(h.get().clearable).toBe(true);
  });

  it('selecting the default chip with a search active writes it explicitly', async () => {
    const h = setup(() => ok(rows(1)), '/tasks?q=tile&status=done');
    await waitFor(() => expect(h.get().totalItems).toBe(1));
    await act(async () => {
      h.get().setChip('open');
    });
    expect(h.search()).toBe('?q=tile&status=open');
    expect(h.get().query.searchingAll).toBe(false);
  });

  it('selecting All without a search still writes status=all', async () => {
    const h = setup(() => ok(rows(1)), '/tasks');
    await waitFor(() => expect(h.get().totalItems).toBe(1));
    await act(async () => {
      h.get().setChip('all');
    });
    expect(h.search()).toBe('?status=all');
  });

  it('U4 resets and refetches on query change; a superseded batch never lands', async () => {
    const resolvers: Array<(p: ObjectListPage<Row>) => void> = [];
    const fetchPage = jest.fn<FetchPage>(
      () => new Promise<ObjectListPage<Row>>((resolve) => resolvers.push(resolve)),
    );
    const h = setup(fetchPage);
    await waitFor(() => expect(fetchPage).toHaveBeenCalledTimes(1));
    await act(async () => {
      h.get().setSearch('tile');
    });
    await waitFor(() => expect(fetchPage).toHaveBeenCalledTimes(2));
    expect(fetchPage.mock.calls[1]![0]).toMatchObject({
      q: 'tile',
      searchingAll: true,
      chip: 'all',
    });
    // The newer fetch resolves first, then the stale one resolves last.
    await act(async () => {
      resolvers[1]!({ items: rows(2), totalItems: 2 });
    });
    await waitFor(() => expect(h.get().totalItems).toBe(2));
    await act(async () => {
      resolvers[0]!({ items: rows(50), totalItems: 999 });
    });
    expect(h.get().totalItems).toBe(2);
    expect(h.get().items).toHaveLength(2);
  });

  it('U5 removeItem without more rows is local and decrements totalItems', async () => {
    const fetchPage = jest.fn<FetchPage>(() => ok(rows(3)));
    const h = setup(fetchPage);
    await waitFor(() => expect(h.get().totalItems).toBe(3));
    act(() => h.get().removeItem('nope'));
    expect(h.get().items).toHaveLength(3);
    act(() => h.get().removeItem('r1'));
    expect(h.get().items.map((r) => r.id)).toEqual(['r0', 'r2']);
    expect(h.get().totalItems).toBe(2);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('U5 removeItem with more rows on the server refetches page 1', async () => {
    const fetchPage = jest.fn<FetchPage>(() => ok(rows(100), 240));
    const h = setup(fetchPage);
    await waitFor(() => expect(h.get().totalItems).toBe(240));
    act(() => h.get().removeItem('r5'));
    await waitFor(() => expect(fetchPage).toHaveBeenCalledTimes(2));
    expect(fetchPage.mock.calls[1]![1]).toBe(1);
  });

  it('U6 updateItem changes only the matching row', async () => {
    const h = setup(() => ok(rows(3)));
    await waitFor(() => expect(h.get().totalItems).toBe(3));
    act(() => h.get().updateItem('r1', (r) => ({ ...r, title: 'Grout the shower' })));
    expect(h.get().items.map((r) => r.title)).toEqual([
      'Tile the hallway 0',
      'Grout the shower',
      'Tile the hallway 2',
    ]);
  });

  it('U7 refresh reloads from page 1', async () => {
    const fetchPage = jest.fn<FetchPage>(() => ok(rows(2)));
    const h = setup(fetchPage);
    await waitFor(() => expect(h.get().totalItems).toBe(2));
    act(() => h.get().refresh());
    await waitFor(() => expect(fetchPage).toHaveBeenCalledTimes(2));
    expect(fetchPage.mock.calls[1]![1]).toBe(1);
  });

  it('U8 serverGroup is set only for server options and refetches; a client group does not', async () => {
    const fetchPage = jest.fn<FetchPage>(() => ok(rows(1)));
    const h = setup(fetchPage);
    await waitFor(() => expect(h.get().totalItems).toBe(1));
    expect(h.get().query.serverGroup).toBeNull();
    await act(async () => {
      h.get().setGroup('client');
    });
    expect(h.get().group).toBe('client');
    expect(h.get().query.serverGroup).toBeNull();
    expect(fetchPage).toHaveBeenCalledTimes(1);
    await act(async () => {
      h.get().setGroup('window');
    });
    await waitFor(() => expect(fetchPage).toHaveBeenCalledTimes(2));
    expect(fetchPage.mock.calls[1]![0].serverGroup).toBe('window');
    expect(h.get().group).toBe('window');
  });

  it('U9 a bad URL is normalised once with replace', async () => {
    const fetchPage = jest.fn<FetchPage>(() => ok(rows(1)));
    const h = setup(
      fetchPage,
      '/tasks?status=bogus&group=zzz&sortBy=zzz&page=3&pageSize=10&trades=1',
    );
    await waitFor(() => expect(h.search()).toBe('?trades=1'));
    expect(h.nav.type).toBe('REPLACE');
    await waitFor(() => expect(h.get().totalItems).toBe(1));
    expect(h.search()).toBe('?trades=1');
  });

  it('keeps the getKey it was given', async () => {
    const h = setup(() => ok(rows(1)));
    await waitFor(() => expect(h.get().totalItems).toBe(1));
    expect(h.get().getKey({ id: 'x', title: 't' })).toBe('x');
  });

  it('removeItem leaves totalItems null-safe before the first batch', async () => {
    const h = setup(() => new Promise<ObjectListPage<Row>>(() => undefined));
    act(() => h.get().removeItem('r0'));
    expect(h.get().totalItems).toBeNull();
    expect(h.get().items).toEqual([]);
  });

  it('works with a minimal config (no chips, groups or filters) and a scroll root', async () => {
    const minimal: ObjectListConfig<Row> = {
      listKey: 'plain',
      testIdPrefix: 'plain',
      sort: config.sort,
    };
    const h = setup(() => ok(rows(1)), '/tasks?q=x', minimal, document.createElement('div'));
    await waitFor(() => expect(h.get().totalItems).toBe(1));
    expect(h.get().query).toMatchObject({ chip: 'all', searchingAll: false, serverGroup: null });
    expect(h.get().clearable).toBe(true);
    await act(async () => {
      h.get().clearFilters();
    });
    expect(h.search()).toBe('');
    await act(async () => {
      h.get().clearSheetFilters();
    });
    expect(h.search()).toBe('');
  });
});
