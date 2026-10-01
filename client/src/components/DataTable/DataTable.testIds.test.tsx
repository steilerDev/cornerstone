import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { findDuplicateTestIds } from '../../test/findDuplicateTestIds.js';

const mockUseColumnPreferences = jest.fn();
jest.unstable_mockModule('../../hooks/useColumnPreferences.js', () => ({
  useColumnPreferences: mockUseColumnPreferences,
}));

import type * as DataTableModule from './DataTable.js';
import type * as TestIdModule from './dataTableTestId.js';

let DataTable: (typeof DataTableModule)['DataTable'];
let dataTableTestId: (typeof TestIdModule)['dataTableTestId'];
type TableState = DataTableModule.TableState;
type Surface = TestIdModule.DataTableSurface;

interface Item {
  id: string;
  title: string;
}
interface Child {
  id: string;
}

const ITEMS: Item[] = [
  { id: '1', title: 'One' },
  { id: '2', title: 'Two' },
];

const STATE: TableState = {
  search: '',
  filters: new Map(),
  sortBy: null,
  sortDir: null,
  page: 1,
  pageSize: 25,
};

beforeEach(async () => {
  ({ DataTable } = (await import('./DataTable.js')) as typeof DataTableModule);
  ({ dataTableTestId } = (await import('./dataTableTestId.js')) as typeof TestIdModule);
  mockUseColumnPreferences.mockReturnValue({
    visibleColumns: new Set(['title']),
    columnOrder: ['title'],
    toggleColumn: jest.fn(),
    moveColumn: jest.fn(),
    resetToDefaults: jest.fn(),
  });
});

function renderTable(
  renderActions: (item: Item, surface: Surface) => ReactNode,
  withExpandable = false,
) {
  const columns: DataTableModule.ColumnDef<Item>[] = [
    {
      key: 'title',
      label: 'Title',
      defaultVisible: true,
      render: (item, surface) => (
        <span data-testid={dataTableTestId('t', item.id, surface)}>{item.title}</span>
      ),
    },
  ];
  const expandableRows: DataTableModule.ExpandableRowsConfig<Item, Child> | undefined =
    withExpandable
      ? {
          getChildren: (item) => (item.id === '1' ? [{ id: 'c1' }] : []),
          getChildKey: (c) => c.id,
          renderChildCells: (c, _p, keys) => keys.map((k) => <td key={k}>{`child-${c.id}`}</td>),
          renderChildCard: (c) => <span>{`child-card-${c.id}`}</span>,
          getExpandLabel: (item, expanded) => `${expanded ? 'Collapse' : 'Expand'} ${item.title}`,
        }
      : undefined;
  return render(
    <DataTable<Item, Child>
      pageKey="p"
      columns={columns}
      items={ITEMS}
      totalItems={ITEMS.length}
      totalPages={1}
      currentPage={1}
      isLoading={false}
      getRowKey={(i) => i.id}
      tableState={STATE}
      onStateChange={jest.fn()}
      renderActions={renderActions}
      expandableRows={expandableRows}
    />,
  );
}

const surfaceAware = (item: Item, surface: Surface) => (
  <button type="button" data-testid={dataTableTestId('p', item.id, surface)}>
    menu
  </button>
);

describe('DataTable dual-mount testid uniqueness (#2069)', () => {
  it('has no duplicate data-testids when render and renderActions use dataTableTestId', () => {
    const { container } = renderTable(surfaceAware);
    expect(findDuplicateTestIds(container)).toEqual([]);
    expect(container.querySelector('[data-testid="p-1"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="p-mobile-1"]')).not.toBeNull();
  });

  it('mutation proof: a renderActions that ignores the surface IS reported as duplicated', () => {
    const { container } = renderTable((item) => (
      <button type="button" data-testid={`p-${item.id}`}>
        menu
      </button>
    ));
    // Table + card both emit `p-<id>`; the `title` column adds `t-<id>` / `t-mobile-<id>` only.
    expect(findDuplicateTestIds(container)).toEqual(['p-1', 'p-2']);
  });

  it('stays duplicate-free with expandableRows configured', () => {
    const { container } = renderTable(surfaceAware, true);
    expect(findDuplicateTestIds(container)).toEqual([]);
    expect(container.querySelector('[data-testid="p-1"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="p-mobile-1"]')).not.toBeNull();
  });

  it("calls renderActions once with 'table' and once with 'card' per item", () => {
    const spy = jest.fn<(item: Item, surface: Surface) => ReactNode>(() => null);
    renderTable(spy);
    for (const item of ITEMS) {
      const surfaces = spy.mock.calls.filter(([i]) => i === item).map(([, s]) => s);
      expect(surfaces.filter((s) => s === 'table')).toHaveLength(1);
      expect(surfaces.filter((s) => s === 'card')).toHaveLength(1);
    }
  });
});
