import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

interface TestItem {
  id: string;
  title: string;
  amount: number;
}

// Mock useColumnPreferences to return all columns as visible by default
const mockToggleColumn = jest.fn();
const mockMoveColumn = jest.fn();
const mockResetToDefaults = jest.fn();
const mockUseColumnPreferences = jest.fn();

jest.unstable_mockModule('../../hooks/useColumnPreferences.js', () => ({
  useColumnPreferences: mockUseColumnPreferences,
}));

import type * as DataTableModule from './DataTable.js';

let DataTable: (typeof DataTableModule)['DataTable'];
type TableState = DataTableModule.TableState;

const COLUMNS: DataTableModule.ColumnDef<TestItem>[] = [
  { key: 'title', label: 'Title', defaultVisible: true, render: (i) => i.title },
  { key: 'amount', label: 'Amount', defaultVisible: true, render: (i) => String(i.amount) },
  { key: 'id', label: 'ID', defaultVisible: true, render: (i) => i.id },
];

const SAMPLE_ITEMS: TestItem[] = [
  { id: 'item-1', title: 'Alpha Work', amount: 1000 },
  { id: 'item-2', title: 'Beta Work', amount: 2000 },
  { id: 'item-3', title: 'Gamma Work', amount: 3000 },
];

function makeTableState(overrides: Partial<TableState> = {}): TableState {
  return {
    search: '',
    filters: new Map(),
    sortBy: null,
    sortDir: null,
    page: 1,
    pageSize: 25,
    ...overrides,
  };
}

function renderDataTable({
  items = SAMPLE_ITEMS,
  totalItems = SAMPLE_ITEMS.length,
  totalPages = 1,
  currentPage = 1,
  isLoading = false,
  error = null,
  tableState = makeTableState(),
  onStateChange = jest.fn(),
  onRowClick,
  emptyState,
}: {
  items?: TestItem[];
  totalItems?: number;
  totalPages?: number;
  currentPage?: number;
  isLoading?: boolean;
  error?: string | null;
  tableState?: TableState;
  onStateChange?: jest.Mock;
  onRowClick?: jest.Mock;
  emptyState?: {
    message: string;
    description?: string;
    action?: { label: string; onClick: () => void };
  };
} = {}) {
  return render(
    <DataTable<TestItem>
      pageKey="test-page"
      columns={COLUMNS}
      items={items}
      totalItems={totalItems}
      totalPages={totalPages}
      currentPage={currentPage}
      isLoading={isLoading}
      error={error}
      getRowKey={(item) => item.id}
      onRowClick={onRowClick}
      tableState={tableState}
      onStateChange={onStateChange}
      emptyState={emptyState}
    />,
  );
}

beforeEach(async () => {
  ({ DataTable } = (await import('./DataTable.js')) as typeof DataTableModule);
  mockUseColumnPreferences.mockReturnValue({
    visibleColumns: new Set(COLUMNS.map((c) => c.key)),
    columnOrder: COLUMNS.map((c) => c.key),
    toggleColumn: mockToggleColumn,
    moveColumn: mockMoveColumn,
    resetToDefaults: mockResetToDefaults,
  });
  mockToggleColumn.mockReset();
  mockMoveColumn.mockReset();
  mockResetToDefaults.mockReset();
});

describe('DataTable', () => {
  describe('loading state', () => {
    it('renders loading indicator when isLoading=true and items=[]', () => {
      renderDataTable({ isLoading: true, items: [] });
      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('does not render table rows when in loading state with empty items', () => {
      const { container } = renderDataTable({ isLoading: true, items: [] });
      expect(container.querySelector('tbody')).not.toBeInTheDocument();
    });

    it('renders table content normally when isLoading=true but items exist', () => {
      // When loading but items exist (refresh scenario), show items
      const { container } = renderDataTable({ isLoading: true, items: SAMPLE_ITEMS });
      expect(container.querySelector('tbody')).toBeInTheDocument();
    });
  });

  describe('error state', () => {
    it('renders error banner when error prop is non-null', () => {
      renderDataTable({ error: 'Failed to load items' });
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Failed to load items')).toBeInTheDocument();
    });

    it('does not render error banner when error is null', () => {
      renderDataTable({ error: null });
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('does not render error banner when error is undefined', () => {
      renderDataTable();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('still renders items when error is present', () => {
      const { container } = renderDataTable({ error: 'Minor error', items: SAMPLE_ITEMS });
      expect(container.querySelector('tbody')).toBeInTheDocument();
      const rows = container.querySelectorAll('tbody tr');
      expect(rows).toHaveLength(3);
    });
  });

  describe('empty state', () => {
    it('renders empty state message when items=[] and not loading', () => {
      renderDataTable({
        items: [],
        isLoading: false,
        emptyState: { message: 'No work items found' },
      });
      expect(screen.getByText('No work items found')).toBeInTheDocument();
    });

    it('renders default empty message when emptyState not provided', () => {
      renderDataTable({ items: [], isLoading: false });
      expect(screen.getByText(/no items found/i)).toBeInTheDocument();
    });

    it('renders empty state description when provided', () => {
      renderDataTable({
        items: [],
        emptyState: {
          message: 'No results',
          description: 'Try adjusting your filters',
        },
      });
      expect(screen.getByText('Try adjusting your filters')).toBeInTheDocument();
    });

    it('renders empty state action button when provided', () => {
      const mockAction = jest.fn();
      renderDataTable({
        items: [],
        emptyState: {
          message: 'No items',
          action: { label: 'Add Item', onClick: mockAction },
        },
      });
      expect(screen.getByRole('button', { name: 'Add Item' })).toBeInTheDocument();
    });

    it('calls emptyState action onClick when action button clicked', async () => {
      const user = userEvent.setup();
      const mockAction = jest.fn();
      renderDataTable({
        items: [],
        emptyState: {
          message: 'No items',
          action: { label: 'Add Item', onClick: mockAction },
        },
      });
      await user.click(screen.getByRole('button', { name: 'Add Item' }));
      expect(mockAction).toHaveBeenCalledTimes(1);
    });

    it('renders table header even when items are empty', () => {
      const { container } = renderDataTable({ items: [] });
      expect(container.querySelector('thead')).toBeInTheDocument();
    });

    it('does not render table rows when items are empty', () => {
      const { container } = renderDataTable({ items: [] });
      expect(container.querySelector('tbody')).toBeInTheDocument();
      expect(container.querySelectorAll('tbody tr')).toHaveLength(0);
    });
  });

  describe('table rows', () => {
    it('renders a row for each item in items array', () => {
      const { container } = renderDataTable({ items: SAMPLE_ITEMS });
      const rows = container.querySelectorAll('tbody tr');
      expect(rows).toHaveLength(3);
    });

    it('renders cell content for each item', () => {
      renderDataTable({ items: SAMPLE_ITEMS });
      expect(screen.getAllByText('Alpha Work').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Beta Work').length).toBeGreaterThan(0);
    });

    it('calls onRowClick with the correct item when a row is clicked', async () => {
      const user = userEvent.setup();
      const mockOnRowClick = jest.fn();
      const { container } = renderDataTable({ onRowClick: mockOnRowClick });
      const rows = container.querySelectorAll('tbody tr');
      await user.click(rows[0] as HTMLElement);
      expect(mockOnRowClick).toHaveBeenCalledWith(SAMPLE_ITEMS[0]);
    });

    it('calls onRowClick with the second item when second row clicked', async () => {
      const user = userEvent.setup();
      const mockOnRowClick = jest.fn();
      const { container } = renderDataTable({ onRowClick: mockOnRowClick });
      const rows = container.querySelectorAll('tbody tr');
      await user.click(rows[1] as HTMLElement);
      expect(mockOnRowClick).toHaveBeenCalledWith(SAMPLE_ITEMS[1]);
    });

    it('does not throw when onRowClick not provided and row is clicked', async () => {
      const user = userEvent.setup();
      const { container } = renderDataTable({ onRowClick: undefined });
      const rows = container.querySelectorAll('tbody tr');
      await expect(user.click(rows[0] as HTMLElement)).resolves.not.toThrow();
    });
  });

  describe('search toolbar', () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    it('renders search input', () => {
      renderDataTable();
      expect(screen.getByRole('searchbox')).toBeInTheDocument();
    });

    it('search input has current search value', () => {
      renderDataTable({ tableState: makeTableState({ search: 'my search' }) });
      expect(screen.getByRole('searchbox')).toHaveValue('my search');
    });

    it('calls onStateChange with new search once the 300 ms debounce has elapsed', () => {
      jest.useFakeTimers();
      const mockOnStateChange = jest.fn();
      renderDataTable({ onStateChange: mockOnStateChange });
      fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'hello' } });
      expect(mockOnStateChange).not.toHaveBeenCalled();
      act(() => {
        jest.advanceTimersByTime(300);
      });
      expect(mockOnStateChange).toHaveBeenCalledTimes(1);
      const calls = mockOnStateChange.mock.calls as [TableState][];
      expect(calls[0]![0]!.search).toBe('hello');
    });

    it('shows Clear Filters button when search is active', () => {
      renderDataTable({ tableState: makeTableState({ search: 'active' }) });
      expect(screen.getByRole('button', { name: /clear filters/i })).toBeInTheDocument();
    });

    it('does not show Clear Filters button when no active search or filters', () => {
      renderDataTable({ tableState: makeTableState({ search: '' }) });
      expect(screen.queryByRole('button', { name: /clear filters/i })).not.toBeInTheDocument();
    });

    it('calls onStateChange with cleared search when Clear Filters clicked', async () => {
      const user = userEvent.setup();
      const mockOnStateChange = jest.fn();
      renderDataTable({
        tableState: makeTableState({ search: 'existing' }),
        onStateChange: mockOnStateChange,
      });
      await user.click(screen.getByRole('button', { name: /clear filters/i }));
      const calls = mockOnStateChange.mock.calls as [TableState][];
      const lastCall = calls[calls.length - 1]!;
      expect(lastCall[0]!.search).toBe('');
      expect(lastCall[0]!.filters.size).toBe(0);
    });
  });

  describe('search draft, debounce and stable toolbar (#2197)', () => {
    function table(props: {
      items?: TestItem[];
      isLoading?: boolean;
      tableState?: TableState;
      onStateChange?: jest.Mock;
    }) {
      return (
        <DataTable<TestItem>
          pageKey="test-page"
          columns={COLUMNS}
          items={props.items ?? SAMPLE_ITEMS}
          totalItems={(props.items ?? SAMPLE_ITEMS).length}
          totalPages={1}
          currentPage={1}
          isLoading={props.isLoading ?? false}
          error={null}
          getRowKey={(item) => item.id}
          tableState={props.tableState ?? makeTableState()}
          onStateChange={props.onStateChange ?? jest.fn()}
        />
      );
    }

    function type(value: string) {
      fireEvent.change(screen.getByRole('searchbox'), { target: { value } });
    }

    function advance(ms: number) {
      act(() => {
        jest.advanceTimersByTime(ms);
      });
    }

    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('updates the input immediately but does not call onStateChange before 300 ms', () => {
      const onStateChange = jest.fn();
      render(table({ onStateChange }));
      type('d');
      expect(screen.getByRole('searchbox')).toHaveValue('d');
      advance(299);
      expect(onStateChange).not.toHaveBeenCalled();
    });

    it('calls onStateChange once with the final text after several quick keystrokes', () => {
      const onStateChange = jest.fn();
      render(table({ onStateChange }));
      type('d');
      advance(100);
      type('dr');
      advance(100);
      type('dry');
      advance(299);
      expect(onStateChange).not.toHaveBeenCalled();
      advance(1);
      expect(onStateChange).toHaveBeenCalledTimes(1);
      expect((onStateChange.mock.calls as [TableState][])[0]![0].search).toBe('dry');
    });

    it('resets page to 1 when the debounced search commits', () => {
      const onStateChange = jest.fn();
      render(table({ onStateChange, tableState: makeTableState({ page: 3 }) }));
      type('x');
      advance(300);
      expect((onStateChange.mock.calls as [TableState][])[0]![0].page).toBe(1);
    });

    it('commits immediately on Enter and does not fire a second time after the delay', () => {
      const onStateChange = jest.fn();
      render(table({ onStateChange }));
      type('roof');
      fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Enter' });
      expect(onStateChange).toHaveBeenCalledTimes(1);
      expect((onStateChange.mock.calls as [TableState][])[0]![0].search).toBe('roof');
      advance(500);
      expect(onStateChange).toHaveBeenCalledTimes(1);
    });

    it('ignores keys other than Enter', () => {
      const onStateChange = jest.fn();
      render(table({ onStateChange }));
      type('roof');
      fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'a' });
      expect(onStateChange).not.toHaveBeenCalled();
    });

    it('does not call onStateChange on Enter when the draft equals the committed search', () => {
      const onStateChange = jest.fn();
      render(table({ onStateChange, tableState: makeTableState({ search: 'same' }) }));
      fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Enter' });
      expect(onStateChange).not.toHaveBeenCalled();
    });

    it('does not call onStateChange when the text is typed back to the committed value', () => {
      const onStateChange = jest.fn();
      render(table({ onStateChange }));
      type('x');
      type('');
      advance(300);
      expect(onStateChange).not.toHaveBeenCalled();
    });

    it('mirrors an external search change into the input when nothing is pending', () => {
      const { rerender } = render(table({}));
      expect(screen.getByRole('searchbox')).toHaveValue('');
      rerender(table({ tableState: makeTableState({ search: 'from-url' }) }));
      expect(screen.getByRole('searchbox')).toHaveValue('from-url');
    });

    it('does not overwrite text typed within the debounce window on an external change', () => {
      const { rerender } = render(table({}));
      type('typing');
      advance(100);
      rerender(table({ tableState: makeTableState({ search: 'external' }) }));
      expect(screen.getByRole('searchbox')).toHaveValue('typing');
    });

    it('D-21: Clear filters cancels a pending search and empties the input', () => {
      const onStateChange = jest.fn();
      render(table({ onStateChange, tableState: makeTableState({ search: 'existing' }) }));
      type('stale draft');
      fireEvent.click(screen.getByRole('button', { name: /clear filters/i }));
      expect(screen.getByRole('searchbox')).toHaveValue('');
      advance(1000);
      expect(onStateChange).toHaveBeenCalledTimes(1);
      expect((onStateChange.mock.calls as [TableState][])[0]![0].search).toBe('');
    });

    it('D-21: keeps the same focused search box when a reload starts and results are empty', () => {
      const { rerender } = render(table({}));
      const input = screen.getByRole('searchbox');
      input.focus();
      expect(input).toHaveFocus();

      rerender(table({ isLoading: true, items: [] }));

      const after = screen.getByRole('searchbox');
      expect(after).toBe(input);
      expect(after).toHaveFocus();
      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: /title/i })).toBeInTheDocument();
    });

    it('D-21: keeps typed text and focus across a reload cycle', () => {
      const { rerender } = render(table({}));
      const input = screen.getByRole('searchbox');
      input.focus();
      type('abc');
      rerender(table({ isLoading: true, items: [] }));
      type('abcd');
      rerender(table({ isLoading: false, items: SAMPLE_ITEMS }));
      expect(screen.getByRole('searchbox')).toBe(input);
      expect(input).toHaveValue('abcd');
      expect(input).toHaveFocus();
    });

    it('renders only the skeleton (no toolbar) on the initial load', () => {
      render(table({ isLoading: true, items: [] }));
      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    });

    it('sets aria-busy on the table container only while loading', () => {
      const { container, rerender } = render(table({}));
      expect(container.querySelector('[aria-busy]')).not.toBeInTheDocument();
      rerender(table({ isLoading: true, items: SAMPLE_ITEMS }));
      expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
      expect(container.querySelector('table')!.closest('[aria-busy="true"]')).not.toBeNull();
      rerender(table({ isLoading: false }));
      expect(container.querySelector('[aria-busy]')).not.toBeInTheDocument();
    });
  });

  describe('header content slot', () => {
    it('renders custom headerContent when provided', () => {
      render(
        <DataTable<TestItem>
          pageKey="test"
          columns={COLUMNS}
          items={SAMPLE_ITEMS}
          totalItems={3}
          totalPages={1}
          currentPage={1}
          isLoading={false}
          getRowKey={(i) => i.id}
          tableState={makeTableState()}
          onStateChange={jest.fn()}
          headerContent={<div data-testid="custom-header">My Header</div>}
        />,
      );
      expect(screen.getByTestId('custom-header')).toBeInTheDocument();
    });
  });

  describe('pagination', () => {
    it('does not render pagination when totalPages=1', () => {
      renderDataTable({ totalPages: 1 });
      expect(screen.queryByRole('button', { name: /previous/i })).not.toBeInTheDocument();
    });

    it('renders pagination when totalPages > 1', () => {
      renderDataTable({ totalPages: 3, currentPage: 1, totalItems: 75 });
      expect(screen.getByRole('button', { name: /previous/i })).toBeInTheDocument();
    });
  });

  describe('column settings integration', () => {
    it('renders column settings gear button', () => {
      renderDataTable();
      expect(screen.getByRole('button', { name: /column settings/i })).toBeInTheDocument();
    });
  });

  describe('expandableRows inertness when not configured (Story #2046 regression)', () => {
    it('renders exactly one <tbody> for the whole table, not one per row', () => {
      const { container } = renderDataTable({ items: SAMPLE_ITEMS });
      expect(container.querySelectorAll('tbody')).toHaveLength(1);
    });

    it('renders no elements with aria-expanded inside the table (the column-settings gear button legitimately has its own aria-expanded, unrelated to row expansion)', () => {
      const { container } = renderDataTable({ items: SAMPLE_ITEMS });
      const table = container.querySelector('table')!;
      expect(table.querySelectorAll('[aria-expanded]')).toHaveLength(0);
    });

    it('renders no expand-cell leading column in the header or body', () => {
      const { container } = renderDataTable({ items: SAMPLE_ITEMS });
      expect(container.querySelectorAll('.expandCell')).toHaveLength(0);
    });

    it('header <th> count equals exactly the visible column count, with no extra leading cell', () => {
      const { container } = renderDataTable({ items: SAMPLE_ITEMS });
      expect(container.querySelectorAll('thead th')).toHaveLength(COLUMNS.length);
    });

    it('each body row <td> count equals exactly the visible column count', () => {
      const { container } = renderDataTable({ items: SAMPLE_ITEMS });
      const firstRow = container.querySelector('tbody tr')!;
      expect(firstRow.querySelectorAll('td')).toHaveLength(COLUMNS.length);
    });
  });
});
