import { describe, it, expect, jest } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';
import { DataTableRow } from './DataTableRow.js';
import type { ColumnDef } from './DataTable.js';

interface Item {
  id: string;
  title: string;
}
const ITEM: Item = { id: 'i1', title: 'Alpha' };

function renderRow(
  columns: ColumnDef<Item>[],
  extra: Partial<Parameters<typeof DataTableRow<Item>>[0]> = {},
) {
  return render(
    <table>
      <tbody>
        <DataTableRow<Item>
          item={ITEM}
          columns={columns}
          visibleColumns={new Set(columns.map((c) => c.key))}
          {...extra}
        />
      </tbody>
    </table>,
  );
}

describe('DataTableRow', () => {
  it("calls each column's render with the item and the 'table' surface", () => {
    const render1 = jest.fn<(item: Item, surface: 'table' | 'card') => ReactNode>((i) => i.title);
    renderRow([{ key: 'title', label: 'Title', render: render1 }]);
    expect(render1).toHaveBeenCalledWith(ITEM, 'table');
    expect(render1).not.toHaveBeenCalledWith(ITEM, 'card');
    expect(screen.getByText('Alpha')).toBeInTheDocument();
  });

  it('renders an em-dash for a column whose render returns null', () => {
    renderRow([{ key: 'title', label: 'Title', render: () => null }]);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('only renders visible columns', () => {
    const hidden = jest.fn<(item: Item) => ReactNode>(() => 'hidden');
    renderRow(
      [
        { key: 'title', label: 'Title', render: (i) => i.title },
        { key: 'h', label: 'H', render: hidden },
      ],
      { visibleColumns: new Set(['title']) },
    );
    expect(hidden).not.toHaveBeenCalled();
  });

  it('renders the actions cell and stops its clicks from reaching the row onClick', () => {
    const onClick = jest.fn();
    const renderActions = jest.fn(() => <button type="button">act</button>);
    renderRow([{ key: 'title', label: 'Title', render: (i) => i.title }], {
      onClick,
      renderActions,
    });
    fireEvent.click(screen.getByText('act'));
    expect(onClick).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Alpha'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders a leading cell only when leadingCell is passed (including null)', () => {
    const cols: ColumnDef<Item>[] = [{ key: 'title', label: 'Title', render: (i) => i.title }];
    const { container, unmount } = renderRow(cols, { leadingCell: null });
    expect(container.querySelectorAll('td')).toHaveLength(2);
    unmount();
    const { container: c2 } = renderRow(cols);
    expect(c2.querySelectorAll('td')).toHaveLength(1);
  });

  it('marks selected rows and makes clickable rows focusable', () => {
    const { container } = renderRow([{ key: 'title', label: 'Title', render: (i) => i.title }], {
      isSelected: true,
      onClick: jest.fn(),
    });
    const tr = container.querySelector('tr')!;
    expect(tr.className).toContain('tableRowSelected');
    expect(tr).toHaveAttribute('tabindex', '0');
  });
});
