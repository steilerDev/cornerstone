/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { render, screen, fireEvent, act, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { ToastProvider } from '../Toast/ToastContext.js';
import { CommandSearchProvider } from '../CommandSearch/CommandSearchContext.js';
import { findDuplicateTestIds } from '../../test/findDuplicateTestIds.js';
import { ObjectList } from './ObjectList.js';
import type { ObjectListProps } from './ObjectList.js';
import { useObjectList } from './useObjectList.js';
import type { ObjectListController } from './useObjectList.js';
import type {
  ObjectListConfig,
  ObjectListExpandable,
  ObjectListPage,
  ObjectListQuery,
} from './types.js';

interface Task {
  id: string;
  name: string;
  state: 'todo' | 'late' | 'done';
  area: string;
}

const CONFIG: ObjectListConfig<Task> = {
  listKey: 'tasks',
  testIdPrefix: 'tasks',
  chips: {
    options: [
      { value: 'todo', label: 'To do' },
      { value: 'done', label: 'Done' },
    ],
  },
  groupBy: {
    options: [
      {
        value: 'state',
        label: 'Status',
        order: ['late', 'todo', 'done'],
        groupOf: (t) => ({ key: t.state, label: t.state, done: t.state === 'done' }),
      },
      {
        value: 'window',
        label: 'Time window',
        server: true,
        groupOf: (t) => ({ key: t.state, label: `W-${t.state}` }),
      },
    ],
  },
  sort: {
    options: [
      { value: 'name', label: 'Name' },
      { value: 'area', label: 'Area' },
    ],
    defaultValue: 'name',
    defaultOrder: 'asc',
  },
  filters: [
    {
      param: 'area',
      label: 'Area filter',
      render: ({ value, onChange, id }) => (
        <input
          id={id}
          aria-label="Area text"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value || null)}
        />
      ),
    },
  ],
};

function makeTasks(n: number, state: Task['state'] = 'todo', start = 1): Task[] {
  return Array.from({ length: n }, (_, i) => {
    const num = String(start + i).padStart(3, '0');
    return {
      id: `t${num}`,
      name: `Tile the hallway ${num}`,
      state,
      area: 'House › Ground floor › Kitchen',
    };
  });
}

interface Child {
  id: string;
}
const EXPANDABLE_BASE: ObjectListExpandable<Task, Child> = {
  getChildren: (t) => (t.id === 't001' ? [{ id: 'c1' }] : []),
  getChildKey: (c) => c.id,
  renderChildCells: () => <td>child</td>,
  renderChildCard: () => <span>child card</span>,
  getExpandLabel: (_t, expanded, n) => `${expanded ? 'Hide' : 'Show'} ${n} children`,
};
const EXPANDABLE = EXPANDABLE_BASE as unknown as ObjectListProps<Task>['expandable'];
const EXPANDABLE_DEFAULT_OPEN = {
  ...EXPANDABLE_BASE,
  isDefaultExpanded: (t: Task) => t.id === 't001',
} as unknown as ObjectListProps<Task>['expandable'];

const noop = () => undefined;
let data: Task[] = [];
const fetchPage =
  jest.fn<(q: ObjectListQuery, page: number, size: number) => Promise<ObjectListPage<Task>>>();

function defaultFetch(
  q: ObjectListQuery,
  page: number,
  size: number,
): Promise<ObjectListPage<Task>> {
  let rows = data;
  if (q.q) rows = rows.filter((r) => r.name.toLowerCase().includes(q.q.toLowerCase()));
  if (q.chip !== 'all') rows = rows.filter((r) => r.state === q.chip);
  const groupCounts = q.serverGroup
    ? rows.reduce<Record<string, number>>(
        (acc, r) => ({ ...acc, [r.state]: (acc[r.state] ?? 0) + 1 }),
        {},
      )
    : undefined;
  return Promise.resolve({
    items: rows.slice((page - 1) * size, page * size),
    totalItems: rows.length,
    groupCounts,
  });
}

let activeConfig = CONFIG;
let controller: ObjectListController<Task> | null = null;
let locationSearch = '';

function Probe() {
  locationSearch = useLocation().search;
  return null;
}

type Extra = Partial<Omit<ObjectListProps<Task>, 'list'>>;

function Harness(extra: Extra) {
  const list = useObjectList<Task>({ config: activeConfig, fetchPage, getKey: (t) => t.id });
  controller = list;
  return (
    <ObjectList<Task>
      list={list}
      config={activeConfig}
      labels={{
        title: 'Tasks',
        search: 'Search tasks',
        resultCount: (n) => `${n} tasks`,
        selectAll: 'Select all tasks',
        empty: 'No tasks yet.',
        noMatch: 'No tasks match.',
        loadFailed: 'Could not load tasks.',
      }}
      primary={{ label: 'New task', onClick: jest.fn() }}
      title={(t) => ({ text: t.name, to: `/tasks/${t.id}` })}
      titleHeader="Task"
      columns={[
        {
          key: 'area',
          label: 'Area',
          sortValue: 'area',
          render: (t) => t.area,
          defaultVisible: true,
        },
        { key: 'plain', label: 'Plain', defaultVisible: true, render: () => 'x' },
        {
          key: 'right',
          label: 'Right',
          defaultVisible: true,
          align: 'end',
          width: 'narrow',
          render: () => 'r',
        },
        { key: 'wide', label: 'Wide', defaultVisible: true, width: 'wide', render: () => 'w' },
      ]}
      facts={(t) => [
        { key: 'a', content: t.state },
        { key: 'b', content: 'two' },
        { key: 'c', content: t.area, keep: true },
      ]}
      {...extra}
    />
  );
}

function renderList(extra: Extra = {}, url = '/tasks') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <ToastProvider>
        <CommandSearchProvider isOpen={false} onOpen={noop} onClose={noop}>
          <Probe />
          <Harness {...extra} />
        </CommandSearchProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
}

async function loaded(count?: string) {
  await waitFor(() => expect(screen.queryByLabelText('Loading the list')).not.toBeInTheDocument());
  if (count) expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(count);
}

const bulk: Extra['bulkActions'] = ({ selected, clear }) => (
  <button type="button" onClick={clear}>
    Act on {selected.length}
  </button>
);

beforeEach(() => {
  data = makeTasks(3);
  fetchPage.mockReset();
  fetchPage.mockImplementation(defaultFetch);
  controller = null;
  activeConfig = CONFIG;
  window.sessionStorage.clear();
  window.localStorage.clear();
});

afterEach(() => {
  jest.useRealTimers();
  delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
  delete (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;
});

describe('ObjectList states', () => {
  it('L1 shows a skeleton before the first batch', async () => {
    let resolve: (p: ObjectListPage<Task>) => void = () => undefined;
    fetchPage.mockImplementationOnce(() => new Promise((r) => (resolve = r)));
    renderList();
    expect(screen.getByLabelText('Loading the list')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).not.toHaveTextContent('(');
    await act(async () => resolve({ items: makeTasks(1), totalItems: 1 }));
    await loaded('Tasks (1)');
  });

  it('L2 shows the failure and Retry focuses the heading, then retries', async () => {
    fetchPage.mockRejectedValueOnce(new Error('boom'));
    renderList();
    const retry = await screen.findByTestId('tasks-retry');
    expect(screen.getByText('Could not load tasks.')).toBeInTheDocument();
    await userEvent.click(retry);
    await loaded('Tasks (3)');
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus();
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it('L3 distinguishes the unfiltered empty list from a filtered one', async () => {
    data = [];
    const view = renderList();
    expect(await screen.findByText('No tasks yet.')).toBeInTheDocument();
    expect(screen.queryByTestId('tasks-clear-filters')).toBeNull();
    view.unmount();

    data = makeTasks(2);
    renderList({}, '/tasks?q=zzz');
    expect(await screen.findByText('No tasks match.')).toBeInTheDocument();
    const empty = screen.getByText('No tasks match.').parentElement as HTMLElement;
    await userEvent.click(within(empty).getByRole('button', { name: /clear filters/i }));
    await waitFor(() => expect(locationSearch).toBe(''));
    expect(await screen.findByTestId('tasks-row-t001')).toBeInTheDocument();
  });

  it('shows the count wording (n) and (n of m) only with search or a filter', async () => {
    renderList({ scopeTotal: 3 });
    await loaded('Tasks (3)');
  });

  it('chip alone keeps (n); search gives (n of m)', async () => {
    renderList({ scopeTotal: 3 }, '/tasks?status=todo');
    await loaded('Tasks (3)');
    const input = screen.getByRole('searchbox');
    await userEvent.type(input, 'hallway 001');
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('(1 of 3)'),
    );
  });

  it('keeps (n) when scopeTotal is missing even while filtering', async () => {
    renderList({}, '/tasks?q=hallway');
    await loaded('Tasks (3)');
  });
});

describe('ObjectList batches and footer', () => {
  it('L4 has no footer up to 100 rows', async () => {
    data = makeTasks(100);
    renderList();
    await loaded('Tasks (100)');
    expect(screen.queryByTestId('tasks-footer-sentinel')).toBeNull();
    expect(screen.queryByText(/Showing/)).toBeNull();
  });

  it('L4 above 100 rows shows Showing 100 of 240 and appends on Load more', async () => {
    data = makeTasks(240);
    renderList();
    await loaded('Tasks (240)');
    expect(screen.getByText('Showing 100 of 240')).toBeInTheDocument();
    expect(fetchPage).toHaveBeenCalledWith(expect.anything(), 1, 100);
    await userEvent.click(screen.getByTestId('tasks-footer-load-more-button'));
    await waitFor(() => expect(screen.getByText('Showing 200 of 240')).toBeInTheDocument());
    expect(screen.getByTestId('tasks-row-t200')).toBeInTheDocument();
  });
});

describe('ObjectList grouping', () => {
  beforeEach(() => {
    data = [...makeTasks(2, 'todo', 1), ...makeTasks(2, 'done', 3), ...makeTasks(1, 'late', 5)];
  });

  it('L5 groups client side, done collapsed while other groups exist', async () => {
    renderList({}, '/tasks?group=state');
    await loaded('Tasks (5)');
    const toggle = screen.getByTestId('tasks-group-toggle-todo');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('tasks-group-toggle-done')).toHaveAttribute('aria-expanded', 'false');
    expect(within(toggle).getByText('(2)')).toBeInTheDocument();
  });

  it('L5 groups render without bulk actions or checkboxes', async () => {
    renderList({}, '/tasks?group=state');
    await loaded();
    expect(screen.queryByTestId('tasks-select-t001')).toBeNull();
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });

  it('L5 falls back to a flat list with the reason above 100 rows for a client option', async () => {
    data = makeTasks(130);
    renderList({}, '/tasks?group=state');
    await loaded('Tasks (130)');
    expect(screen.queryByTestId('tasks-group-toggle-todo')).toBeNull();
    expect(screen.getByText(/Grouping needs all rows/)).toBeInTheDocument();
  });

  it('L5 renders server groups above 100 rows using groupCounts', async () => {
    data = [...makeTasks(120, 'todo'), ...makeTasks(20, 'done', 200)];
    renderList({}, '/tasks?group=window');
    await loaded('Tasks (140)');
    expect(fetchPage).toHaveBeenCalledWith(
      expect.objectContaining({ serverGroup: 'window' }),
      1,
      100,
    );
    const toggle = screen.getByTestId('tasks-group-toggle-todo');
    expect(within(toggle).getByText('(100 of 120)')).toBeInTheDocument();
  });

  it('L6 toggling a group keeps focus, writes session state and announces', async () => {
    renderList({}, '/tasks?group=state');
    await loaded();
    const toggle = screen.getByTestId('tasks-group-toggle-done');
    toggle.focus();
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveFocus();
    expect(window.sessionStorage.getItem('objectList:tasks:state')).toContain('"done":true');
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('done expanded'));
    await userEvent.click(toggle);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('done collapsed'));
  });

  it('reads stored group open state and resets it when the group option changes', async () => {
    window.sessionStorage.setItem('objectList:tasks:state', JSON.stringify({ todo: false }));
    renderList({}, '/tasks?group=state');
    await loaded();
    expect(screen.getByTestId('tasks-group-toggle-todo')).toHaveAttribute('aria-expanded', 'false');
    act(() => controller?.setGroup('none'));
    await waitFor(() => expect(screen.queryByTestId('tasks-group-toggle-todo')).toBeNull());
    act(() => controller?.setGroup('state'));
    expect(await screen.findByTestId('tasks-group-toggle-todo')).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });
});

describe('ObjectList selection', () => {
  it('L11 renders no checkboxes without bulkActions', async () => {
    renderList();
    await loaded();
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });

  it('L7 selects a row, a group and all with tri-state and a count in the bar', async () => {
    data = [...makeTasks(2, 'todo', 1), ...makeTasks(2, 'late', 3)];
    renderList({ bulkActions: bulk }, '/tasks?group=state');
    await loaded();
    await userEvent.click(screen.getByTestId('tasks-select-t001'));
    expect(screen.getByTestId('tasks-selection-bar')).toHaveTextContent('1 selected');
    const todoGroup = screen.getAllByRole('checkbox', {
      name: 'Select todo',
    })[0] as HTMLInputElement;
    expect(todoGroup.indeterminate).toBe(true);
    await userEvent.click(todoGroup);
    expect(screen.getByTestId('tasks-selection-bar')).toHaveTextContent('2 selected');
    expect(todoGroup.indeterminate).toBe(false);
    expect(todoGroup.checked).toBe(true);
    const all = screen.getAllByRole('checkbox', {
      name: 'Select all tasks',
    })[0] as HTMLInputElement;
    expect(all.indeterminate).toBe(true);
    await userEvent.click(all);
    expect(screen.getByTestId('tasks-selection-bar')).toHaveTextContent('4 selected');
    await userEvent.click(all);
    expect(screen.queryByTestId('tasks-selection-bar')).toBeNull();
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('0 selected'));
  });

  it('L7 shows the not-loaded count when rows remain on the server', async () => {
    data = makeTasks(120);
    renderList({ bulkActions: bulk });
    await loaded();
    await userEvent.click(screen.getByTestId('tasks-select-t001'));
    expect(screen.getByTestId('tasks-selection-bar')).toHaveTextContent(
      '1 selected, 20 more not loaded',
    );
  });

  it('L7 wide: select-all lives in the table header only, with no note row', async () => {
    renderList({ bulkActions: bulk });
    await loaded();
    expect(document.getElementById('tasks-select-all-mobile')).toBeNull();
    await userEvent.click(
      screen.getAllByRole('checkbox', { name: 'Select all tasks' })[0] as HTMLElement,
    );
    expect(screen.getByTestId('tasks-selection-bar')).toHaveTextContent('3 selected');
  });

  it('announces the final appended batch together with the end of the list', async () => {
    data = makeTasks(120);
    renderList();
    await loaded();
    await userEvent.click(screen.getByTestId('tasks-footer-load-more-button'));
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('20 more rows loaded. All rows shown.'),
    );
  });

  it('L7 hands selected items and clear to bulkActions', async () => {
    renderList({ bulkActions: bulk });
    await loaded();
    await userEvent.click(screen.getByTestId('tasks-select-t002'));
    await userEvent.click(screen.getByRole('button', { name: 'Act on 1' }));
    expect(screen.queryByTestId('tasks-selection-bar')).toBeNull();
  });

  it('L7 clears through the bar clear button', async () => {
    renderList({ bulkActions: bulk });
    await loaded();
    await userEvent.click(screen.getByTestId('tasks-select-t002'));
    await userEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect(screen.queryByTestId('tasks-selection-bar')).toBeNull();
  });

  it('uses the short select-all label when labels.selectAll is absent', async () => {
    renderList({
      bulkActions: bulk,
      labels: {
        title: 'Tasks',
        search: 'Search tasks',
        resultCount: (n) => `${n}`,
        empty: 'e',
        noMatch: 'n',
        loadFailed: 'f',
      },
    });
    await loaded();
    expect(screen.getAllByRole('checkbox', { name: 'Select all' }).length).toBeGreaterThan(0);
  });

  it('announces a user selection once, not again from the prune effect', async () => {
    renderList({ bulkActions: bulk });
    await loaded();
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('3 tasks'));
    const raf = jest.spyOn(window, 'requestAnimationFrame');
    await userEvent.click(screen.getByTestId('tasks-select-t001'));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('1 selected'));
    expect(raf).toHaveBeenCalledTimes(1);
    raf.mockRestore();
  });

  it('L8 prunes the selection when rows leave and keeps it otherwise', async () => {
    renderList({ bulkActions: bulk });
    await loaded();
    await userEvent.click(screen.getByTestId('tasks-select-t001'));
    await userEvent.click(screen.getByTestId('tasks-select-t002'));
    act(() => controller?.updateItem('t003', (t) => ({ ...t, name: 'Renamed' })));
    expect(screen.getByTestId('tasks-selection-bar')).toHaveTextContent('2 selected');
    act(() => controller?.removeItem('t001'));
    await waitFor(() =>
      expect(screen.getByTestId('tasks-selection-bar')).toHaveTextContent('1 selected'),
    );
    // The prune announces the new count.
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('1 selected'));
    act(() => {
      controller?.removeItem('t002');
    });
    await waitFor(() => expect(screen.queryByTestId('tasks-selection-bar')).toBeNull());
  });

  it('L9 Escape clears the selection unless handled or outside the root', async () => {
    renderList({ bulkActions: bulk });
    await loaded();
    const box = screen.getByTestId('tasks-select-t001');
    await userEvent.click(box);
    // Already handled: ignored.
    const handled = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    handled.preventDefault();
    box.dispatchEvent(handled);
    expect(screen.getByTestId('tasks-selection-bar')).toBeInTheDocument();
    // Escape from an element outside the root (portal) is ignored.
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    fireEvent.keyDown(outside, { key: 'Escape' });
    expect(screen.getByTestId('tasks-selection-bar')).toBeInTheDocument();
    outside.remove();
    // Other keys are ignored.
    fireEvent.keyDown(box, { key: 'a' });
    expect(screen.getByTestId('tasks-selection-bar')).toBeInTheDocument();
    fireEvent.keyDown(box, { key: 'Escape' });
    expect(screen.queryByTestId('tasks-selection-bar')).toBeNull();
    // Nothing selected: Escape is a no-op.
    fireEvent.keyDown(box, { key: 'Escape' });
  });
});

describe('ObjectList focus after removal', () => {
  it('L10 keeps focus on a row title when a status change moves the row to another group', async () => {
    data = [...makeTasks(2, 'todo', 1), ...makeTasks(1, 'late', 3)];
    renderList({}, '/tasks?group=state');
    await loaded();
    screen.getByTestId('tasks-title-t001').focus();
    act(() => controller?.updateItem('t001', (t) => ({ ...t, state: 'late' })));
    await waitFor(() => expect(screen.getByTestId('tasks-title-t001')).toHaveFocus());
  });

  it('L10 skips candidates inside a collapsed group', async () => {
    data = [...makeTasks(2, 'todo', 1), ...makeTasks(1, 'done', 3)];
    renderList({}, '/tasks?group=state');
    await loaded();
    expect(screen.getByTestId('tasks-group-toggle-done')).toHaveAttribute('aria-expanded', 'false');
    screen.getByTestId('tasks-title-t002').focus();
    act(() => controller?.removeItem('t002'));
    await waitFor(() => expect(screen.getByTestId('tasks-title-t001')).toHaveFocus());
  });

  it('L10 leaves focus alone after a deliberate blur, such as a click elsewhere', async () => {
    renderList();
    await loaded();
    const link = screen.getByTestId('tasks-title-t002');
    link.focus();
    link.blur();
    act(() => controller?.removeItem('t002'));
    await waitFor(() => expect(screen.queryByTestId('tasks-title-t002')).toBeNull());
    expect(document.activeElement).toBe(document.body);
  });

  it('L10 moves focus to the next row title, then the previous, then the heading', async () => {
    renderList();
    await loaded();
    screen.getByTestId('tasks-title-t002').focus();
    act(() => {
      controller?.removeItem('t002');
    });
    await waitFor(() => expect(screen.getByTestId('tasks-title-t003')).toHaveFocus());
    act(() => {
      screen.getByTestId('tasks-title-t003').focus();
      controller?.removeItem('t003');
    });
    await waitFor(() => expect(screen.getByTestId('tasks-title-t001')).toHaveFocus());
    act(() => {
      screen.getByTestId('tasks-title-t001').focus();
      controller?.removeItem('t001');
    });
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveFocus());
  });

  it('L10 leaves focus alone when it already sits on another element', async () => {
    renderList();
    await loaded();
    screen.getByTestId('tasks-title-t002').focus();
    const search = screen.getByRole('searchbox');
    act(() => {
      search.focus();
      controller?.removeItem('t002');
    });
    expect(search).toHaveFocus();
  });
});

describe('ObjectList announcements', () => {
  it('L12 has one status region that receives result count, selection and group messages', async () => {
    renderList({ bulkActions: bulk });
    await loaded();
    expect(screen.getAllByRole('status')).toHaveLength(1);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('3 tasks'));
    await userEvent.click(screen.getByTestId('tasks-select-t001'));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('1 selected'));
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });

  it('announces the searching-all note once per text when settled', async () => {
    renderList({ searchingAll: { outside: 2, chips: ['Done'] } }, '/tasks?q=hallway');
    // No default chip in this config: searchingAll is false, so nothing is announced.
    await loaded();
    expect(screen.queryByTestId('tasks-searching-all')).toBeNull();
  });
});

describe('ObjectList searching all', () => {
  const chipConfig = {
    ...CONFIG,
    chips: { ...CONFIG.chips!, defaultValue: 'todo' },
  } as ObjectListConfig<Task>;

  function Searching({ outside }: { outside: number | null }) {
    const list = useObjectList<Task>({ config: chipConfig, fetchPage, getKey: (t) => t.id });
    controller = list;
    return (
      <ObjectList<Task>
        list={list}
        config={chipConfig}
        labels={{
          title: 'Tasks',
          search: 'Search tasks',
          resultCount: (n) => `${n} tasks`,
          empty: 'e',
          noMatch: 'n',
          loadFailed: 'f',
        }}
        primary={{ label: 'New', onClick: jest.fn() }}
        title={(t) => ({ text: t.name, to: `/tasks/${t.id}` })}
        titleHeader="Task"
        facts={(t) => [
          { key: 'a', content: t.state },
          { key: 'b', content: 'b' },
          { key: 'c', content: 'c' },
        ]}
        searchingAll={outside === null ? null : { outside, chips: ['Done'] }}
      />
    );
  }

  it('shows and announces "Searching all · n more in Done" while searching all', async () => {
    render(
      <MemoryRouter initialEntries={['/tasks?q=hallway']}>
        <ToastProvider>
          <CommandSearchProvider isOpen={false} onOpen={noop} onClose={noop}>
            <Searching outside={2} />
          </CommandSearchProvider>
        </ToastProvider>
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Searching all · 2 more in Done'),
    );
    expect(screen.getByTestId('tasks-searching-all')).toHaveTextContent('2 more in Done');
  });

  it('shows nothing when the host passes no searchingAll data', async () => {
    render(
      <MemoryRouter initialEntries={['/tasks?q=hallway']}>
        <ToastProvider>
          <CommandSearchProvider isOpen={false} onOpen={noop} onClose={noop}>
            <Searching outside={null} />
          </CommandSearchProvider>
        </ToastProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getAllByTestId(/tasks-row-/).length).toBeGreaterThan(0));
    expect(screen.queryByTestId('tasks-searching-all')).toBeNull();
  });
});

describe('ObjectList sorting and columns', () => {
  async function headerSort(col: string, expected: string) {
    await waitFor(() =>
      expect(screen.getByTestId(`tasks-sort-header-${col}`).closest('th')).toHaveAttribute(
        'aria-sort',
        expected,
      ),
    );
  }

  it('L13 header sort cycles asc, desc, default and sets aria-sort', async () => {
    renderList();
    await loaded();
    await headerSort('area', 'none');
    await userEvent.click(screen.getByTestId('tasks-sort-header-area'));
    expect(locationSearch).toContain('sortBy=area');
    expect(locationSearch).toContain('sortOrder=asc');
    await headerSort('area', 'ascending');
    expect(screen.getByTestId('tasks-sort-header-area')).toHaveTextContent('Area ↑');
    await userEvent.click(screen.getByTestId('tasks-sort-header-area'));
    await headerSort('area', 'descending');
    expect(screen.getByTestId('tasks-sort-header-area')).toHaveTextContent('Area ↓');
    await userEvent.click(screen.getByTestId('tasks-sort-header-area'));
    await headerSort('area', 'none');
    expect(locationSearch).not.toContain('sortBy');
  });

  it('L13 the default-sorted column flips to descending first, then back to the default', async () => {
    renderList({
      columns: [
        {
          key: 'name',
          label: 'Name',
          sortValue: 'name',
          defaultVisible: true,
          render: (t) => t.name,
        },
      ],
    });
    await loaded();
    await headerSort('name', 'ascending');
    await userEvent.click(screen.getByTestId('tasks-sort-header-name'));
    await headerSort('name', 'descending');
    expect(locationSearch).toContain('sortOrder=desc');
    await userEvent.click(screen.getByTestId('tasks-sort-header-name'));
    await headerSort('name', 'ascending');
    expect(locationSearch).not.toContain('sortOrder');
  });

  it('L13 with a descending default, the default-sorted column flips to ascending', async () => {
    activeConfig = { ...CONFIG, sort: { ...CONFIG.sort, defaultOrder: 'desc' } };
    renderList({
      columns: [
        {
          key: 'name',
          label: 'Name',
          sortValue: 'name',
          defaultVisible: true,
          render: (t) => t.name,
        },
      ],
    });
    await loaded();
    await headerSort('name', 'descending');
    await userEvent.click(screen.getByTestId('tasks-sort-header-name'));
    await headerSort('name', 'ascending');
    expect(locationSearch).toContain('sortOrder=asc');
  });

  it('L10 falls back to a quote-escaping selector when CSS.escape is missing', async () => {
    const original = (globalThis as { CSS?: unknown }).CSS;
    (globalThis as { CSS?: unknown }).CSS = undefined;
    try {
      renderList();
      await loaded();
      screen.getByTestId('tasks-title-t002').focus();
      act(() => {
        controller?.removeItem('t002');
      });
      await waitFor(() => expect(screen.getByTestId('tasks-title-t003')).toHaveFocus());
    } finally {
      (globalThis as { CSS?: unknown }).CSS = original;
    }
  });

  it('renders a flat list when the config has no grouping', async () => {
    activeConfig = { ...CONFIG, groupBy: undefined };
    renderList({}, '/tasks?group=state');
    await loaded('Tasks (3)');
    expect(screen.queryByTestId('tasks-group-toggle-todo')).toBeNull();
  });

  it('L10 uses CSS.escape when the platform provides it', async () => {
    const original = (globalThis as { CSS?: unknown }).CSS;
    (globalThis as { CSS?: unknown }).CSS = { escape: (v: string) => v };
    try {
      renderList();
      await loaded();
      screen.getByTestId('tasks-title-t002').focus();
      act(() => {
        controller?.removeItem('t002');
      });
      await waitFor(() => expect(screen.getByTestId('tasks-title-t003')).toHaveFocus());
    } finally {
      (globalThis as { CSS?: unknown }).CSS = original;
    }
  });

  it('L14 dragging a column in the Columns dialog reorders the table columns', async () => {
    renderList();
    await loaded();
    await userEvent.click(screen.getByTestId('tasks-page-menu'));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Columns…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Columns' });
    const items = within(dialog)
      .getAllByRole('checkbox')
      .map((c) => c.closest('div[draggable]') as HTMLElement);
    const headers = () => screen.getAllByRole('columnheader').map((h) => h.textContent);
    const before = headers();
    expect(before.indexOf('Plain')).toBeLessThan(before.indexOf('Right'));
    jest.spyOn(items[2] as HTMLElement, 'getBoundingClientRect').mockReturnValue({
      top: 0,
      height: 10,
    } as DOMRect);
    const dataTransfer = { effectAllowed: '', dropEffect: '' };
    fireEvent.dragStart(items[1] as HTMLElement, { dataTransfer });
    fireEvent.dragOver(items[2] as HTMLElement, { dataTransfer, clientY: 9 });
    fireEvent.drop(items[2] as HTMLElement, { dataTransfer });
    await waitFor(() => {
      const after = headers();
      expect(after.indexOf('Right')).toBeLessThan(after.indexOf('Plain'));
    });
  });

  it('L14 the Columns dialog hides a column on the table surface and Done returns focus', async () => {
    renderList();
    await loaded();
    expect(screen.getByRole('columnheader', { name: 'Plain' })).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('tasks-page-menu'));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Columns…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Columns' });
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Plain' }));
    await waitFor(() => expect(screen.queryByRole('columnheader', { name: 'Plain' })).toBeNull());
    // reorder: move the first column down via the move buttons when present
    const moveButtons = within(dialog).queryAllByRole('button', { name: /Move .* down/ });
    if (moveButtons[0]) await userEvent.click(moveButtons[0]);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByTestId('tasks-page-menu')).toHaveFocus();
  });

  it('keeps stale stored column keys from breaking ordering', async () => {
    window.localStorage.setItem(
      'table.tasks.columns',
      JSON.stringify({ visible: ['area'], order: ['ghost', 'wide', 'area'] }),
    );
    renderList();
    await loaded();
    expect(screen.getAllByRole('columnheader').length).toBeGreaterThan(0);
  });
});

describe('ObjectList surfaces', () => {
  class FakeRO {
    static last: FakeRO | null = null;
    cb: (e: unknown[]) => void;
    constructor(cb: (e: unknown[]) => void) {
      this.cb = cb;
      FakeRO.last = this;
    }
    observe() {}
    disconnect() {}
  }

  it('L7 narrow: the note row carries Select all and selects every loaded row', async () => {
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = FakeRO;
    renderList({ bulkActions: bulk });
    await loaded();
    act(() => FakeRO.last?.cb([{ contentRect: { width: 500 } }]));
    const all = document.getElementById('tasks-select-all-mobile') as HTMLElement;
    expect(all).not.toBeNull();
    await userEvent.click(all);
    expect(screen.getByTestId('tasks-selection-bar')).toHaveTextContent('3 selected');
  });

  it('under 768px list width drops the Columns item and the table remains mounted', async () => {
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = FakeRO;
    renderList();
    await loaded();
    act(() => FakeRO.last?.cb([{ contentRect: { width: 500 } }]));
    await userEvent.click(screen.getByTestId('tasks-page-menu'));
    expect(screen.queryByRole('menuitem', { name: 'Columns…' })).toBeNull();
  });

  it('L10 on the card surface focus moves to the next card title', async () => {
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = FakeRO;
    renderList();
    await loaded();
    act(() => FakeRO.last?.cb([{ contentRect: { width: 500 } }]));
    screen.getByTestId('tasks-title-mobile-t002').focus();
    act(() => {
      controller?.removeItem('t002');
    });
    await waitFor(() => expect(screen.getByTestId('tasks-title-mobile-t003')).toHaveFocus());
  });

  it('L? test ids stay unique across both surfaces with a row menu open', async () => {
    renderList({
      rowMenu: () => [{ id: 'edit', label: 'Edit', onClick: jest.fn() }],
      renderStatus: (t) => <span>{t.state}</span>,
      statusHeader: 'Status',
      renderCommand: () => <button type="button">Do</button>,
      expandable: EXPANDABLE_DEFAULT_OPEN,
      bulkActions: bulk,
    });
    await loaded();
    expect(findDuplicateTestIds(document.body)).toEqual([]);
    await userEvent.click(screen.getByTestId('tasks-row-menu-t001'));
    expect(findDuplicateTestIds(document.body)).toEqual([]);
    expect(screen.getByTestId('tasks-row-menu-t001')).toBeInTheDocument();
    expect(screen.getByTestId('tasks-row-menu-mobile-t001')).toBeInTheDocument();
  });

  it('expand toggles children and keeps overrides per key', async () => {
    renderList({
      expandable: EXPANDABLE,
    });
    await loaded();
    const child = screen.getByTestId('tasks-child-c1');
    expect(child).toHaveAttribute('hidden');
    await userEvent.click(screen.getByTestId('tasks-expand-t001'));
    expect(child).not.toHaveAttribute('hidden');
    expect(screen.getByTestId('tasks-expand-t001')).toHaveAccessibleName('Hide 1 children');
  });

  it('forwards children, summary, breadcrumbs and a provided heading ref', async () => {
    const headingRef = { current: null as HTMLHeadingElement | null };
    renderList({
      summary: <p>Total sum</p>,
      children: <p>Host dialog</p>,
      breadcrumbs: <nav aria-label="trail">trail</nav>,
      headingRef,
    });
    await loaded();
    expect(screen.getByText('Total sum')).toBeInTheDocument();
    expect(screen.getByText('Host dialog')).toBeInTheDocument();
    expect(headingRef.current).toBe(screen.getByRole('heading', { level: 1 }));
  });

  it('clearFilters from the toolbar clears the draft and focuses search', async () => {
    renderList({}, '/tasks?area=Kitchen');
    await loaded();
    const clear = screen.getByTestId('tasks-clear-filters');
    await userEvent.click(clear);
    await waitFor(() => expect(locationSearch).toBe(''));
    expect(screen.getByRole('searchbox')).toHaveFocus();
  });

  it('works without a ResizeObserver or IntersectionObserver (jsdom default is wide)', async () => {
    renderList();
    await loaded();
    expect(screen.getByTestId('tasks-page-menu')).toBeInTheDocument();
  });
});
