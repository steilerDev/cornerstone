import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ColumnDef, TableState } from './DataTable.js';
import { DataTableHeader } from './DataTableHeader.js';

interface TestItem {
  id: string;
  title: string;
  amount: number;
}

const DEFAULT_COLUMNS: ColumnDef<TestItem>[] = [
  {
    key: 'title',
    label: 'Title',
    sortable: true,
    filterable: true,
    filterType: 'string',
    filterParamKey: 'title',
    render: (item) => item.title,
  },
  {
    key: 'amount',
    label: 'Amount',
    sortable: true,
    render: (item) => item.amount,
  },
  {
    key: 'id',
    label: 'ID',
    render: (item) => item.id,
  },
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

function renderHeader({
  columns = DEFAULT_COLUMNS,
  visibleColumns = new Set(DEFAULT_COLUMNS.map((c) => c.key)),
  tableState = makeTableState(),
  onSort = jest.fn(),
  onFilter = jest.fn(),
}: {
  columns?: ColumnDef<TestItem>[];
  visibleColumns?: Set<string>;
  tableState?: TableState;
  onSort?: jest.Mock;
  onFilter?: jest.Mock;
} = {}) {
  return render(
    <table>
      <DataTableHeader<TestItem>
        columns={columns}
        visibleColumns={visibleColumns}
        tableState={tableState}
        onSort={onSort}
        onFilter={onFilter}
      />
    </table>,
  );
}

describe('DataTableHeader', () => {
  describe('rendering', () => {
    it('renders a thead element', () => {
      const { container } = renderHeader();
      expect(container.querySelector('thead')).toBeInTheDocument();
    });

    it('renders a th for each visible column', () => {
      const { container } = renderHeader();
      const headers = container.querySelectorAll('th');
      expect(headers).toHaveLength(3);
    });

    it('renders only visible columns', () => {
      const { container } = renderHeader({
        visibleColumns: new Set(['title', 'amount']),
      });
      expect(container.querySelectorAll('th')).toHaveLength(2);
      expect(screen.getByText('Title')).toBeInTheDocument();
      expect(screen.getByText('Amount')).toBeInTheDocument();
      expect(screen.queryByText('ID')).not.toBeInTheDocument();
    });

    it('renders column labels', () => {
      renderHeader();
      expect(screen.getByText('Title')).toBeInTheDocument();
      expect(screen.getByText('Amount')).toBeInTheDocument();
      expect(screen.getByText('ID')).toBeInTheDocument();
    });

    it('renders filter button only for filterable columns with filterParamKey and filterType', () => {
      renderHeader();
      // Only 'title' column has filterable=true AND filterParamKey AND filterType
      const filterButtons = screen.queryAllByRole('button');
      expect(filterButtons).toHaveLength(1);
    });
  });

  describe('sort aria-sort attributes', () => {
    it('has aria-sort="none" on all columns when no sort is active', () => {
      const { container } = renderHeader();
      const headers = container.querySelectorAll('th');
      headers.forEach((th) => {
        expect(th).toHaveAttribute('aria-sort', 'none');
      });
    });

    it('has aria-sort="ascending" on the sorted column when sortDir is "asc"', () => {
      const { container } = renderHeader({
        tableState: makeTableState({ sortBy: 'title', sortDir: 'asc' }),
      });
      const titleTh = container.querySelectorAll('th')[0]!;
      expect(titleTh).toHaveAttribute('aria-sort', 'ascending');
    });

    it('has aria-sort="descending" on the sorted column when sortDir is "desc"', () => {
      const { container } = renderHeader({
        tableState: makeTableState({ sortBy: 'title', sortDir: 'desc' }),
      });
      const titleTh = container.querySelectorAll('th')[0]!;
      expect(titleTh).toHaveAttribute('aria-sort', 'descending');
    });

    it('has aria-sort="none" on columns not being sorted', () => {
      const { container } = renderHeader({
        tableState: makeTableState({ sortBy: 'title', sortDir: 'asc' }),
      });
      // 'amount' is index 1, not being sorted
      const amountTh = container.querySelectorAll('th')[1]!;
      expect(amountTh).toHaveAttribute('aria-sort', 'none');
    });

    it('displays ascending sort icon when column is sorted asc', () => {
      renderHeader({
        tableState: makeTableState({ sortBy: 'title', sortDir: 'asc' }),
      });
      expect(screen.getByText(/Title.*↑/)).toBeInTheDocument();
    });

    it('displays descending sort icon when column is sorted desc', () => {
      renderHeader({
        tableState: makeTableState({ sortBy: 'title', sortDir: 'desc' }),
      });
      expect(screen.getByText(/Title.*↓/)).toBeInTheDocument();
    });
  });

  describe('sort click handling', () => {
    it('calls onSort with column key when sortable column header is clicked', async () => {
      const user = userEvent.setup();
      const mockOnSort = jest.fn();
      const { container } = renderHeader({ onSort: mockOnSort });
      const titleTh = container.querySelectorAll('th')[0]!;
      await user.click(titleTh);
      expect(mockOnSort).toHaveBeenCalledWith('title', undefined);
    });

    it('does not call onSort when non-sortable column header is clicked', async () => {
      const user = userEvent.setup();
      const mockOnSort = jest.fn();
      const { container } = renderHeader({ onSort: mockOnSort });
      // 'id' column (index 2) is not sortable
      const idTh = container.querySelectorAll('th')[2]!;
      await user.click(idTh);
      expect(mockOnSort).not.toHaveBeenCalled();
    });

    it('passes sortKey to onSort when column has a custom sortKey', async () => {
      const user = userEvent.setup();
      const mockOnSort = jest.fn();
      const columnsWithSortKey: ColumnDef<TestItem>[] = [
        {
          key: 'title',
          label: 'Title',
          sortable: true,
          sortKey: 'title_text',
          render: (item) => item.title,
        },
      ];
      const { container } = renderHeader({
        columns: columnsWithSortKey,
        visibleColumns: new Set(['title']),
        onSort: mockOnSort,
      });
      await user.click(container.querySelector('th')!);
      expect(mockOnSort).toHaveBeenCalledWith('title', 'title_text');
    });
  });

  describe('filter button', () => {
    it('shows filter button for filterable column with filterParamKey and filterType', () => {
      renderHeader();
      expect(screen.getByRole('button', { name: /filter by title/i })).toBeInTheDocument();
    });

    it('filter button click stops propagation and does not trigger sort', async () => {
      const user = userEvent.setup();
      const mockOnSort = jest.fn();
      renderHeader({ onSort: mockOnSort });
      const filterBtn = screen.getByRole('button', { name: /filter by title/i });
      await user.click(filterBtn);
      // onSort should not be called because click stops propagation
      expect(mockOnSort).not.toHaveBeenCalled();
    });

    it('filter button toggles filter popover visibility on click', async () => {
      const user = userEvent.setup();
      const { container } = renderHeader();
      const filterBtn = screen.getByRole('button', { name: /filter by title/i });

      // Before click: no dialog
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

      // Click to open — note: getBoundingClientRect returns zeros in jsdom
      // so we need a mock
      jest.spyOn(filterBtn, 'getBoundingClientRect').mockReturnValue({
        bottom: 40,
        top: 20,
        left: 100,
        right: 200,
        width: 100,
        height: 20,
        x: 100,
        y: 20,
        toJSON: () => ({}),
      } as DOMRect);

      await user.click(filterBtn);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('filter button has active class when filter is active for that column', () => {
      const activeFilters = new Map([['title', { value: 'test' }]]);
      renderHeader({
        tableState: makeTableState({ filters: activeFilters }),
      });
      // Filter button should exist and have an active class
      const filterBtn = screen.getByRole('button', { name: /filter by title/i });
      // The class name uses CSS modules (identity-obj-proxy returns class name as-is)
      expect(filterBtn.className).toContain('tableHeaderFilterButtonActive');
    });
  });

  describe('actions column translation (#1137)', () => {
    it('renders an "Actions" column header when hasActions is true', () => {
      const { container } = renderHeader({ columns: DEFAULT_COLUMNS });
      // Re-render with hasActions
      const { container: c } = render(
        <table>
          <DataTableHeader<TestItem>
            columns={DEFAULT_COLUMNS}
            visibleColumns={new Set(DEFAULT_COLUMNS.map((col) => col.key))}
            tableState={makeTableState()}
            onSort={jest.fn()}
            onFilter={jest.fn()}
            hasActions={true}
          />
        </table>,
      );
      const headers = c.querySelectorAll('th');
      const headerTexts = Array.from(headers).map((th) => th.textContent?.trim());
      expect(headerTexts).toContain('Actions');
    });

    it('does NOT render an "Actions" column header when hasActions is false', () => {
      renderHeader();
      // Default render has no hasActions prop (undefined = falsy)
      expect(screen.queryByText('Actions')).not.toBeInTheDocument();
    });

    it('does NOT render an "Actions" column header when hasActions is omitted', () => {
      const { container } = render(
        <table>
          <DataTableHeader<TestItem>
            columns={DEFAULT_COLUMNS}
            visibleColumns={new Set(DEFAULT_COLUMNS.map((col) => col.key))}
            tableState={makeTableState()}
            onSort={jest.fn()}
            onFilter={jest.fn()}
          />
        </table>,
      );
      const headers = container.querySelectorAll('th');
      const headerTexts = Array.from(headers).map((th) => th.textContent?.trim());
      expect(headerTexts).not.toContain('Actions');
    });

    it('actions column is added after all data columns', () => {
      const { container } = render(
        <table>
          <DataTableHeader<TestItem>
            columns={DEFAULT_COLUMNS}
            visibleColumns={new Set(DEFAULT_COLUMNS.map((col) => col.key))}
            tableState={makeTableState()}
            onSort={jest.fn()}
            onFilter={jest.fn()}
            hasActions={true}
          />
        </table>,
      );
      const headers = container.querySelectorAll('th');
      // Actions should be the last header
      expect(headers[headers.length - 1]!.textContent?.trim()).toBe('Actions');
    });
  });
});
