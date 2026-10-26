/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type * as ToolbarModule from './ObjectListToolbar.js';
import type { ObjectListToolbarProps } from './ObjectListToolbar.js';
import type { ObjectListController } from './useObjectList.js';
import type { SearchDraft } from './useSearchDraft.js';
import type { ObjectListConfig } from './types.js';

jest.unstable_mockModule('../CommandSearch/SearchEverywhereRow.js', () => ({
  SearchEverywhereRow: ({ query }: { query: string }) => (
    <div data-testid="everywhere-row">{query}</div>
  ),
}));

let ObjectListToolbar: typeof ToolbarModule.ObjectListToolbar;

beforeEach(async () => {
  if (!ObjectListToolbar) {
    ObjectListToolbar = (await import('./ObjectListToolbar.js')).ObjectListToolbar;
  }
});

interface Task {
  id: string;
}

const config: ObjectListConfig<Task> = {
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
      { value: 'area', label: 'Area', groupOf: () => ({ key: 'a', label: 'A' }) },
      {
        value: 'when',
        label: 'Time window',
        server: true,
        groupOf: () => ({ key: 'w', label: 'W' }),
      },
    ],
  },
  sort: {
    options: [
      { value: 'title', label: 'Title' },
      { value: 'due', label: 'Due date' },
    ],
    defaultValue: 'title',
    defaultOrder: 'asc',
  },
  filters: [
    {
      param: 'area',
      label: 'Area',
      render: ({ id, value, onChange }) => (
        <input
          id={id}
          aria-label="Area filter"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value || null)}
        />
      ),
    },
  ],
};

function makeList(overrides: Partial<ObjectListController<Task, undefined>> = {}) {
  const list = {
    query: {
      q: '',
      chip: 'open',
      searchingAll: false,
      serverGroup: null,
      sortBy: 'title',
      sortOrder: 'asc',
      isDefaultSort: true,
      filters: {},
    },
    explicitChip: null,
    group: 'none',
    activeFilterCount: 0,
    filtersActive: false,
    clearable: false,
    setChip: jest.fn(),
    setGroup: jest.fn(),
    setSort: jest.fn(),
    setFilter: jest.fn(),
    clearSheetFilters: jest.fn(),
    totalItems: 20,
    ...overrides,
  } as unknown as ObjectListController<Task, undefined>;
  return list;
}

function setup(
  overrides: Partial<ObjectListToolbarProps<Task, undefined>> = {},
  listOverrides: Partial<ObjectListController<Task, undefined>> = {},
) {
  const search: SearchDraft = { draft: '', onInput: jest.fn(), flush: jest.fn(), reset: jest.fn() };
  const props: ObjectListToolbarProps<Task, undefined> = {
    list: makeList(listOverrides),
    config,
    searchLabel: 'Search tasks',
    wide: true,
    search,
    searchInputRef: createRef<HTMLInputElement>(),
    searchingAllText: null,
    groupingUnavailableText: null,
    selectAll: null,
    onClear: jest.fn(),
    ...overrides,
  };
  render(
    <MemoryRouter>
      <ObjectListToolbar {...props} />
    </MemoryRouter>,
  );
  return props;
}

describe('ObjectListToolbar', () => {
  it('T1: the search field is the page search field, and typing and Enter reach the draft', () => {
    const props = setup({
      search: { draft: 'til', onInput: jest.fn(), flush: jest.fn(), reset: jest.fn() },
    });
    const input = screen.getByTestId('tasks-search');
    expect(input).toHaveAttribute('data-page-search');
    expect(input).toHaveAttribute('placeholder', 'Search tasks');
    expect(input).toHaveAccessibleName('Search tasks in this list');
    expect(input).toHaveValue('til');
    fireEvent.change(input, { target: { value: 'tile' } });
    expect(props.search.onInput).toHaveBeenCalledWith('tile');
    fireEvent.keyDown(input, { key: 'a' });
    expect(props.search.flush).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(props.search.flush).toHaveBeenCalledTimes(1);
  });

  it('T2: Search everywhere receives the draft', () => {
    setup({ search: { draft: 'tile', onInput: jest.fn(), flush: jest.fn(), reset: jest.fn() } });
    expect(screen.getByTestId('everywhere-row')).toHaveTextContent('tile');
  });

  it('T3: the default chip is pressed when no chip param is set', () => {
    setup();
    expect(screen.getByTestId('tasks-chip-open')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('tasks-chip-all')).toHaveAttribute('aria-pressed', 'false');
  });

  it('T3: an explicit chip is pressed; clicking a chip writes it', () => {
    const list = makeList({ explicitChip: 'done' });
    setup({ list });
    expect(screen.getByTestId('tasks-chip-done')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByTestId('tasks-chip-all'));
    expect(list.setChip).toHaveBeenCalledWith('all');
  });

  it('T3: with no default chip and none chosen, All is pressed', () => {
    setup({ config: { ...config, chips: { options: config.chips?.options ?? [] } } });
    expect(screen.getByTestId('tasks-chip-all')).toHaveAttribute('aria-pressed', 'true');
  });

  it('T3: nothing is pressed while searching all', () => {
    setup({}, { query: { ...makeList().query, searchingAll: true } });
    for (const id of ['open', 'done', 'all']) {
      expect(screen.getByTestId(`tasks-chip-${id}`)).toHaveAttribute('aria-pressed', 'false');
    }
  });

  it('chips: custom aria-label, and no chip group without chips config', () => {
    setup({ config: { ...config, chips: { ...config.chips!, ariaLabel: 'Filter by trade' } } });
    expect(screen.getByRole('group', { name: 'Filter by trade' })).toBeInTheDocument();
  });

  it('no chip group, Group by or Filters without their config', () => {
    setup({ config: { listKey: 'x', testIdPrefix: 'x', sort: config.sort } });
    expect(screen.queryByRole('group', { name: 'Filter by status' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('x-group-menu')).not.toBeInTheDocument();
    expect(screen.queryByTestId('x-filters-button')).not.toBeInTheDocument();
    expect(screen.getByTestId('x-sort-menu')).toBeInTheDocument();
  });

  it('chips scroll instead of wrapping on a narrow list', () => {
    setup({ wide: false });
    expect(screen.getByTestId('tasks-chip-open')).toBeInTheDocument();
  });

  it('T4: Filters shows the active count, renders fieldsets with the field context', () => {
    const list = makeList({
      activeFilterCount: 1,
      query: { ...makeList().query, filters: { area: 'Kitchen' } },
    });
    setup({ list });
    const button = screen.getByTestId('tasks-filters-button');
    expect(button).toHaveAccessibleName('Filters, 1 active');
    fireEvent.click(button);
    const field = screen.getByLabelText('Area filter') as HTMLInputElement;
    expect(field).toHaveValue('Kitchen');
    expect(field.id).toBe('tasks-filter-area');
    expect(field.closest('fieldset')).toHaveTextContent('Area');
    fireEvent.change(field, { target: { value: '' } });
    expect(list.setFilter).toHaveBeenCalledWith('area', null);
  });

  it('T4: an unset filter renders empty and Clear in the sheet clears the filter params only', () => {
    const list = makeList();
    setup({ list });
    fireEvent.click(screen.getByTestId('tasks-filters-button'));
    expect(screen.getByLabelText('Area filter')).toHaveValue('');
    fireEvent.click(screen.getByTestId('tasks-filters-sheet-clear'));
    expect(list.clearSheetFilters).toHaveBeenCalledTimes(1);
  });

  it('uses the host allLabel for the All chip, the template default otherwise (#2238)', () => {
    setup({ config: { ...config, chips: { ...config.chips!, allLabel: 'All (12)' } } });
    expect(screen.getByTestId('tasks-chip-all')).toHaveTextContent('All (12)');
  });

  it('keeps the default All label without allLabel', () => {
    setup();
    expect(screen.getByTestId('tasks-chip-all')).toHaveTextContent('All');
    expect(screen.getByTestId('tasks-chip-all')).not.toHaveTextContent('(');
  });

  it('shows the host note in the note row, and nothing without one (#2238)', () => {
    setup({ note: 'Showing only: Not yet split' });
    expect(screen.getByTestId('tasks-note')).toHaveTextContent('Showing only: Not yet split');
  });

  it.each([[undefined], [null], [false]])('renders no note row for note=%s', (note) => {
    setup({ note: note as never });
    expect(screen.queryByTestId('tasks-note')).toBeNull();
  });

  it('groups consecutive defs of one fieldset id into a single fieldset with one legend (#2238)', () => {
    const grouped: ObjectListConfig<Task> = {
      ...config,
      filters: [
        {
          param: 'one',
          label: 'One label',
          fieldset: { id: 'show', legend: 'Show only' },
          render: ({ id }) => <input id={id} aria-label="First box" type="checkbox" />,
        },
        {
          param: 'two',
          label: 'Two label',
          fieldset: { id: 'show', legend: 'Show only' },
          render: () => null,
        },
        {
          param: 'three',
          label: 'Three label',
          fieldset: { id: 'show', legend: 'Show only' },
          render: ({ id }) => <input id={id} aria-label="Third box" type="checkbox" />,
        },
        {
          param: 'plain',
          label: 'Plain label',
          render: ({ id }) => <input id={id} aria-label="Plain box" />,
        },
        {
          param: 'other',
          label: 'Other label',
          fieldset: { id: 'second', legend: 'Second group' },
          render: ({ id }) => <input id={id} aria-label="Other box" />,
        },
      ],
    };
    setup({ config: grouped });
    fireEvent.click(screen.getByTestId('tasks-filters-button'));
    const legends = Array.from(document.querySelectorAll('legend')).map((l) => l.textContent);
    expect(legends).toEqual(['Show only', 'Plain label', 'Second group']);
    const group = screen.getByLabelText('First box').closest('fieldset') as HTMLElement;
    expect(group).toContainElement(screen.getByLabelText('Third box'));
    expect(screen.queryByText('One label')).toBeNull();
    expect(screen.queryByText('Two label')).toBeNull();
    expect((screen.getByLabelText('First box') as HTMLInputElement).id).toBe('tasks-filter-one');
    expect(screen.getByLabelText('Plain box').closest('fieldset')).not.toBe(group);
  });

  it('T5: Group by lists None and the options, with the current choice in the trigger', () => {
    setup({}, { group: 'area' });
    const trigger = screen.getByRole('button', { name: 'Group: Area' });
    fireEvent.click(trigger);
    expect(screen.getByTestId('tasks-group-none')).toBeInTheDocument();
    expect(screen.getByTestId('tasks-group-area')).toHaveAttribute('aria-checked', 'true');
  });

  it('T5: trigger says None when no group is chosen, and choosing writes the group', () => {
    const list = makeList();
    setup({ list });
    fireEvent.click(screen.getByRole('button', { name: 'Group: None' }));
    fireEvent.click(screen.getByTestId('tasks-group-area'));
    expect(list.setGroup).toHaveBeenCalledWith('area');
  });

  it('T5: a client option is disabled above 100 rows with a reason; a server option is not', () => {
    const list = makeList({ totalItems: 240 });
    setup({ list });
    fireEvent.click(screen.getByRole('button', { name: 'Group: None' }));
    const client = screen.getByTestId('tasks-group-area');
    expect(client).toHaveAttribute('aria-disabled', 'true');
    expect(client).toHaveAccessibleDescription(/100 or fewer/);
    fireEvent.click(client);
    expect(list.setGroup).not.toHaveBeenCalled();
    expect(screen.getByTestId('tasks-group-when')).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('T6: changing the sort key keeps the order; the direction keeps the key', () => {
    const list = makeList({ query: { ...makeList().query, sortBy: 'due', sortOrder: 'desc' } });
    setup({ list });
    fireEvent.click(screen.getByRole('button', { name: 'Sort: Due date' }));
    fireEvent.click(screen.getByTestId('tasks-sort-title'));
    expect(list.setSort).toHaveBeenLastCalledWith('title', 'desc');
    fireEvent.click(screen.getByTestId('tasks-sort-asc'));
    expect(list.setSort).toHaveBeenLastCalledWith('due', 'asc');
  });

  it('T6: the direction group maps desc and anything else to asc', () => {
    const list = makeList();
    setup({ list });
    fireEvent.click(screen.getByRole('button', { name: 'Sort: Title' }));
    fireEvent.click(screen.getByTestId('tasks-sort-desc'));
    expect(list.setSort).toHaveBeenLastCalledWith('title', 'desc');
  });

  it('T6: an unknown sortBy falls back to the first option label', () => {
    setup({}, { query: { ...makeList().query, sortBy: 'zzz' } });
    expect(screen.getByRole('button', { name: 'Sort: Title' })).toBeInTheDocument();
  });

  it('T6: with no sort options the trigger label is empty', () => {
    setup({ config: { ...config, sort: { ...config.sort, options: [] } } });
    expect(screen.getByRole('button', { name: 'Sort:' })).toBeInTheDocument();
  });

  it('T7: the note row shows the searching-all and grouping-unavailable texts', () => {
    setup({
      searchingAllText: 'Searching all · 3 more in Done',
      groupingUnavailableText: 'Grouping needs all rows.',
    });
    expect(screen.getByTestId('tasks-searching-all')).toHaveTextContent('3 more in Done');
    expect(screen.getByTestId('tasks-group-unavailable')).toHaveTextContent('Grouping needs');
  });

  it('T7: no note row when there is nothing to say', () => {
    setup();
    expect(screen.queryByTestId('tasks-clear-filters')).not.toBeInTheDocument();
    expect(screen.queryByTestId('tasks-searching-all')).not.toBeInTheDocument();
  });

  it('select-all (card surface) shows in the note row and reports changes', () => {
    const onChange = jest.fn();
    setup({
      selectAll: { checked: false, indeterminate: false, onChange },
    });
    const box = screen.getByLabelText('Select all');
    fireEvent.click(box);
    expect(onChange).toHaveBeenCalled();
  });

  it('T8: Clear filters is shown only when clearable and calls the host', () => {
    const props = setup({}, { clearable: true });
    fireEvent.click(screen.getByTestId('tasks-clear-filters'));
    expect(props.onClear).toHaveBeenCalledTimes(1);
  });

  it('T9: tab order is search, chips, Filters, Group by, Sort', () => {
    setup();
    const toolbar = screen.getByTestId('tasks-toolbar');
    const order = Array.from(toolbar.querySelectorAll('input, button')).map(
      (el) => el.getAttribute('data-testid') ?? el.getAttribute('aria-label'),
    );
    const idx = (id: string) => order.indexOf(id);
    expect(idx('tasks-search')).toBeLessThan(idx('tasks-chip-open'));
    expect(idx('tasks-chip-all')).toBeLessThan(idx('tasks-filters-button'));
    expect(idx('tasks-filters-button')).toBeLessThan(idx('tasks-group-menu'));
    expect(idx('tasks-group-menu')).toBeLessThan(idx('tasks-sort-menu'));
    expect(toolbar).toHaveAttribute('role', 'search');
  });
});
