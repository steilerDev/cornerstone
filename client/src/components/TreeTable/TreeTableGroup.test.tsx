/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect } from '@jest/globals';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { TreeTableGroup } from './TreeTableGroup.js';
import type { TreeTableShared } from './TreeTableGroup.js';
import type { TreeTableLabels, TreeTableRow } from './TreeTable.js';

const LABELS: TreeTableLabels = {
  tree: 'Tree',
  nameHeader: 'Name',
  group: (parent) => `Parts of ${parent}`,
  toggle: (label) => `Toggle ${label}`,
  reorder: (label) => `Reorder ${label}`,
  reorderInstructions: 'Instructions',
  reorderDisabledHint: 'Hint',
  position: ({ name, position, total, parentLabel }) =>
    `${name} ${position}/${total} in ${parentLabel ?? 'root'}`,
};

function row(id: string, parentId: string | null, extra: Partial<TreeTableRow> = {}): TreeTableRow {
  return { id, parentId, label: id, cells: [{ content: `c-${id}` }], ...extra };
}

function sharedFor(
  rows: TreeTableRow[],
  overrides: Partial<TreeTableShared> = {},
): TreeTableShared {
  const childrenOf = new Map<string | null, TreeTableRow[]>();
  const byId = new Map<string, TreeTableRow>();
  for (const r of rows) {
    byId.set(r.id, r);
    childrenOf.set(r.parentId, [...(childrenOf.get(r.parentId) ?? []), r]);
  }
  return {
    columns: [{ id: 'one', label: 'One' }],
    labels: LABELS,
    isExpanded: () => true,
    onToggle: jest.fn(),
    reorderDisabled: false,
    onReorder: jest.fn(),
    onAnnounce: jest.fn(),
    renderActions: (r) => <span data-testid={`act-${r.id}`} />,
    testIdPrefix: 'g',
    childrenOf,
    byId,
    baseId: 'base',
    wide: true,
    instructionsId: 'base-instructions',
    hintId: 'base-hint',
    ...overrides,
  };
}

describe('TreeTableGroup', () => {
  it('renders the given id, hidden state and label on the list', () => {
    const shared = sharedFor([row('a', 'p')]);
    render(
      <TreeTableGroup parentId="p" depth={1} shared={shared} ariaLabel="Mine" id="gid" hidden />,
    );
    const list = document.getElementById('gid')!;
    expect(list).toHaveAttribute('hidden');
    expect(list).toHaveAttribute('aria-label', 'Mine');
  });

  it('exposes the depth of a row as a custom property and a data attribute', () => {
    const shared = sharedFor([row('a', null)]);
    render(<TreeTableGroup parentId={null} depth={3} shared={shared} ariaLabel="Mine" />);
    expect(screen.getByTestId('g-row-a').style.getPropertyValue('--depth')).toBe('3');
    expect(screen.getByTitle('a')).toHaveAttribute('data-depth', '3');
  });

  it('renders nothing for an id in the order that has no row in the lookup', () => {
    const shared = sharedFor([row('a', null), row('b', null)]);
    const byId = new Map(shared.byId);
    byId.delete('b');
    render(
      <TreeTableGroup parentId={null} depth={0} shared={{ ...shared, byId }} ariaLabel="Mine" />,
    );
    expect(screen.getByTestId('g-row-a')).toBeInTheDocument();
    expect(screen.queryByTestId('g-row-b')).toBeNull();
  });

  it('passes the parent label to the position announcement of a nested group', () => {
    const shared = sharedFor([row('p', null, { label: 'Parent' }), row('a', 'p'), row('b', 'p')]);
    render(<TreeTableGroup parentId="p" depth={1} shared={shared} ariaLabel="Mine" />);
    fireEvent.keyDown(screen.getByTestId('g-handle-a'), { key: ' ' });
    fireEvent.keyDown(screen.getByTestId('g-handle-a'), { key: 'ArrowDown' });
    expect(shared.onAnnounce).toHaveBeenLastCalledWith('a 2/2 in Parent');
  });

  it('passes no parent label when the parent row is unknown', () => {
    const shared = sharedFor([row('a', 'missing'), row('b', 'missing')]);
    render(<TreeTableGroup parentId="missing" depth={1} shared={shared} ariaLabel="Mine" />);
    fireEvent.keyDown(screen.getByTestId('g-handle-a'), { key: ' ' });
    fireEvent.keyDown(screen.getByTestId('g-handle-a'), { key: 'ArrowDown' });
    expect(shared.onAnnounce).toHaveBeenLastCalledWith('a 2/2 in root');
  });

  it('recurses into children with the next depth and the group label', () => {
    const shared = sharedFor([row('p', null), row('c', 'p')]);
    render(<TreeTableGroup parentId={null} depth={0} shared={shared} ariaLabel="Mine" />);
    const nested = screen.getByRole('list', { name: 'Parts of p' });
    expect(within(nested).getByTestId('g-row-c').style.getPropertyValue('--depth')).toBe('1');
  });

  it('styles the cell label differently on the phone and when wide', () => {
    const wide = sharedFor([row('a', null)], { wide: true });
    const { unmount } = render(
      <TreeTableGroup parentId={null} depth={0} shared={wide} ariaLabel="Mine" />,
    );
    const wideClass = (screen.getByTestId('g-cell-one-a').firstElementChild as HTMLElement)
      .className;
    unmount();
    const phone = sharedFor([row('a', null)], { wide: false });
    render(<TreeTableGroup parentId={null} depth={0} shared={phone} ariaLabel="Mine" />);
    const phoneLabel = screen.getByTestId('g-cell-one-a').firstElementChild as HTMLElement;
    expect(phoneLabel.className).not.toBe(wideClass);
    expect(phoneLabel).toHaveTextContent('One');
  });
});
