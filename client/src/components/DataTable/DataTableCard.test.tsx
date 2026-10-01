import { describe, it, expect, jest } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';
import { DataTableCard } from './DataTableCard.js';
import type { ColumnDef } from './DataTable.js';

interface Item {
  id: string;
  title: string;
}
const ITEM: Item = { id: 'i1', title: 'Alpha' };

function renderCard(
  columns: ColumnDef<Item>[],
  extra: Partial<Parameters<typeof DataTableCard<Item>>[0]> = {},
) {
  return render(
    <DataTableCard<Item>
      item={ITEM}
      columns={columns}
      visibleColumns={new Set(columns.map((c) => c.key))}
      {...extra}
    />,
  );
}

describe('DataTableCard', () => {
  it("calls render with the item and the 'card' surface when there is no renderCard", () => {
    const r = jest.fn<(item: Item, surface: 'table' | 'card') => ReactNode>((i) => i.title);
    renderCard([{ key: 'title', label: 'Title', render: r }]);
    expect(r).toHaveBeenCalledWith(ITEM, 'card');
    expect(r).not.toHaveBeenCalledWith(ITEM, 'table');
    expect(screen.getByText('Title')).toBeInTheDocument();
    expect(screen.getByText('Alpha')).toBeInTheDocument();
  });

  it('prefers renderCard over render when present', () => {
    const r = jest.fn<(item: Item) => ReactNode>(() => 'from-render');
    renderCard([{ key: 'title', label: 'Title', render: r, renderCard: () => 'from-card' }]);
    expect(r).not.toHaveBeenCalled();
    expect(screen.getByText('from-card')).toBeInTheDocument();
    expect(screen.queryByText('from-render')).not.toBeInTheDocument();
  });

  it('omits the row entirely when the content is null', () => {
    renderCard([
      { key: 'a', label: 'Shown', render: () => 'x' },
      { key: 'b', label: 'Omitted', render: () => null },
    ]);
    expect(screen.getByText('Shown')).toBeInTheDocument();
    expect(screen.queryByText('Omitted')).not.toBeInTheDocument();
  });

  it('renders an em-dash for undefined content', () => {
    renderCard([{ key: 'a', label: 'L', render: () => undefined }]);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('wraps content next to the expand button when one is given', () => {
    renderCard([{ key: 'a', label: 'L', render: () => 'v' }], {
      expandButton: <button type="button">exp</button>,
    });
    expect(screen.getByText('exp')).toBeInTheDocument();
    expect(screen.getByText('v')).toBeInTheDocument();
  });

  it('renders the children container hidden when collapsed and visible when expanded', () => {
    const cols: ColumnDef<Item>[] = [{ key: 'a', label: 'L', render: () => 'v' }];
    const { container, unmount } = renderCard(cols, {
      childrenContent: <span>kid</span>,
      childrenId: 'kids',
      childrenExpanded: false,
    });
    expect(container.querySelector('#kids')).toHaveAttribute('hidden');
    unmount();
    const { container: c2 } = renderCard(cols, {
      childrenContent: <span>kid</span>,
      childrenId: 'kids',
      childrenExpanded: true,
    });
    expect(c2.querySelector('#kids')).not.toHaveAttribute('hidden');
  });

  it('renders no children container without childrenContent', () => {
    const { container } = renderCard([{ key: 'a', label: 'L', render: () => 'v' }], {
      childrenId: 'kids',
    });
    expect(container.querySelector('#kids')).toBeNull();
  });

  it('stops action clicks from reaching the card onClick', () => {
    const onClick = jest.fn();
    renderCard([{ key: 'a', label: 'L', render: () => 'v' }], {
      onClick,
      renderActions: () => <button type="button">act</button>,
    });
    fireEvent.click(screen.getByText('act'));
    expect(onClick).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('v'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
