import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';
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
    isLoaded: true,
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
    it('renders search input', () => {
      renderDataTable();
      expect(screen.getByRole('searchbox')).toBeInTheDocument();
    });

    it('search input has current search value', () => {
      renderDataTable({ tableState: makeTableState({ search: 'my search' }) });
      expect(screen.getByRole('searchbox')).toHaveValue('my search');
    });

    it('calls onStateChange with new search when input changes', () => {
      const mockOnStateChange = jest.fn();
      renderDataTable({ onStateChange: mockOnStateChange });
      fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'hello' } });
      expect(mockOnStateChange).toHaveBeenCalled();
      const calls = mockOnStateChange.mock.calls as [TableState][];
      const lastCall = calls[calls.length - 1]!;
      expect(lastCall[0]!.search).toBe('hello');
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
});
