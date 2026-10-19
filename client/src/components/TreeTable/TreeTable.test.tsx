/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { installMatchMedia } from '../../test/matchMediaControl.js';
import type { MatchMediaControl } from '../../test/matchMediaControl.js';
import { TreeTable } from './TreeTable.js';
import type { TreeTableLabels, TreeTableProps, TreeTableRow } from './TreeTable.js';

const WIDE = '(min-width: 768px)';

const LABELS: TreeTableLabels = {
  tree: 'Sample tree',
  nameHeader: 'Thing',
  group: (parent) => `Parts of ${parent}`,
  toggle: (label) => `Sub-things of ${label}`,
  reorder: (label) => `Reorder ${label}`,
  reorderInstructions: 'Press space to pick up.',
  reorderDisabledHint: 'Clear the filter to reorder.',
  position: ({ name, position, total, parentLabel }) =>
    `${name} is ${position} of ${total} in ${parentLabel ?? 'top level'}`,
};

const COLUMNS = [
  { id: 'one', label: 'One' },
  { id: 'two', label: 'Two' },
];

function row(id: string, parentId: string | null, extra: Partial<TreeTableRow> = {}): TreeTableRow {
  return {
    id,
    parentId,
    label: id.toUpperCase(),
    cells: [{ content: `${id}-1` }, { content: `${id}-2` }],
    ...extra,
  };
}

const ROWS: TreeTableRow[] = [
  row('a', null, { color: '#112233' }),
  row('a1', 'a'),
  row('a2', 'a'),
  row('b', null),
];

describe('TreeTable', () => {
  let media: MatchMediaControl;
  let onToggle: jest.Mock<(id: string) => void>;
  let onReorder: jest.Mock<TreeTableProps['onReorder']>;
  let onAnnounce: jest.Mock<(message: string) => void>;

  beforeEach(() => {
    media = installMatchMedia({ [WIDE]: true });
    onToggle = jest.fn<(id: string) => void>();
    onReorder = jest.fn<TreeTableProps['onReorder']>();
    onAnnounce = jest.fn<(message: string) => void>();
  });

  afterEach(() => {
    media.restore();
  });

  function renderTable(props: Partial<TreeTableProps> = {}) {
    return render(
      <TreeTable
        rows={ROWS}
        columns={COLUMNS}
        labels={LABELS}
        isExpanded={() => true}
        onToggle={onToggle}
        reorderDisabled={false}
        onReorder={onReorder}
        onAnnounce={onAnnounce}
        renderActions={(r) => (
          <button type="button" data-testid={`act-${r.id}`}>{`Act ${r.id}`}</button>
        )}
        testIdPrefix="tt"
        {...props}
      />,
    );
  }

  describe('structure', () => {
    it('renders a labelled root list with one nested labelled list per parent', () => {
      renderTable();
      expect(screen.getByRole('list', { name: 'Sample tree' })).toBeInTheDocument();
      const nested = screen.getByRole('list', { name: 'Parts of A' });
      expect(within(nested).getByTestId('tt-row-a1')).toBeInTheDocument();
      expect(within(nested).getByTestId('tt-row-a2')).toBeInTheDocument();
      expect(screen.queryByRole('list', { name: 'Parts of B' })).toBeNull();
    });

    it('shows each row name, falling back from `name` to `label`', () => {
      renderTable({ rows: [row('a', null, { name: <em>Custom A</em> }), row('b', null)] });
      expect(screen.getByText('Custom A').tagName).toBe('EM');
      expect(screen.getByTestId('tt-row-b')).toHaveTextContent('B');
    });

    it('gives the name a tooltip with the plain label', () => {
      renderTable();
      expect(within(screen.getByTestId('tt-row-a1')).getByTitle('A1')).toBeInTheDocument();
    });

    it('renders an empty root list when there are no rows', () => {
      renderTable({ rows: [] });
      expect(screen.getByRole('list', { name: 'Sample tree' })).toBeEmptyDOMElement();
    });

    it('renders the action cell of each normal row from renderActions', () => {
      renderTable();
      for (const id of ['a', 'a1', 'a2', 'b']) {
        expect(screen.getByTestId(`act-${id}`)).toBeInTheDocument();
      }
    });

    it('marks a muted row and sets the dot colour only when there is one', () => {
      renderTable({
        rows: [row('a', null, { muted: true, color: '#abcdef' }), row('b', null, { color: null })],
      });
      expect(screen.getByTestId('tt-row-a')).toHaveAttribute('data-muted', 'true');
      expect(screen.getByTestId('tt-row-b')).not.toHaveAttribute('data-muted');
      const dotA = screen.getByTestId('tt-row-a').querySelector('[data-color]') as HTMLElement;
      expect(dotA.style.getPropertyValue('--tree-color')).toBe('#abcdef');
      expect(screen.getByTestId('tt-row-b').querySelector('[data-color]')).toBeNull();
    });
  });

  describe('expand and collapse', () => {
    it('only parents get a toggle, wired to their group', () => {
      renderTable();
      const toggle = screen.getByTestId('tt-toggle-a');
      expect(toggle).toHaveAccessibleName('Sub-things of A');
      expect(toggle).toHaveAttribute('aria-expanded', 'true');
      const group = screen.getByRole('list', { name: 'Parts of A' });
      expect(toggle.getAttribute('aria-controls')).toBe(group.id);
      expect(screen.queryByTestId('tt-toggle-b')).toBeNull();
      expect(screen.queryByTestId('tt-toggle-a1')).toBeNull();
    });

    it('keeps a collapsed group mounted but hidden', () => {
      renderTable({ isExpanded: (id) => id !== 'a' });
      const toggle = screen.getByTestId('tt-toggle-a');
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      const group = document.getElementById(toggle.getAttribute('aria-controls')!)!;
      expect(group).toHaveAttribute('hidden');
      expect(within(group).getByTestId('tt-row-a1')).toBeInTheDocument();
      expect(screen.queryByRole('list', { name: 'Parts of A' })).toBeNull();
    });

    it('reports a toggle click with the row id', async () => {
      const user = userEvent.setup();
      renderTable();
      await user.click(screen.getByTestId('tt-toggle-a'));
      expect(onToggle).toHaveBeenCalledWith('a');
    });
  });

  describe('wide layout (from 768px)', () => {
    it('shows an aria-hidden header with the name and column labels', () => {
      renderTable();
      const header = screen.getByTestId('tt-header');
      expect(header).toHaveAttribute('aria-hidden', 'true');
      expect(header).toHaveTextContent('Thing');
      expect(header).toHaveTextContent('One');
      expect(header).toHaveTextContent('Two');
    });

    it('shows content with the detail line under it, not the phone text', () => {
      renderTable({
        rows: [
          row('a', null, {
            cells: [
              { content: 'Line 1', detail: 'Line 2', phoneContent: 'Phone text' },
              { content: 'x' },
            ],
          }),
        ],
      });
      const cell = screen.getByTestId('tt-cell-one-a');
      expect(cell).toHaveTextContent('Line 1');
      expect(cell).toHaveTextContent('Line 2');
      expect(cell).not.toHaveTextContent('Phone text');
    });

    it('omits the detail line when a cell has none', () => {
      renderTable();
      // label span + content span
      expect(screen.getByTestId('tt-cell-one-a').querySelectorAll('span')).toHaveLength(2);
    });

    it('marks a muted cell', () => {
      renderTable({
        rows: [row('a', null, { cells: [{ content: 'None', muted: true }, { content: 'x' }] })],
      });
      expect(screen.getByTestId('tt-cell-one-a')).toHaveAttribute('data-muted', 'true');
      expect(screen.getByTestId('tt-cell-two-a')).not.toHaveAttribute('data-muted');
    });

    it('renders no cell for a column the row has no cell for', () => {
      renderTable({ rows: [row('a', null, { cells: [{ content: 'only one' }] })] });
      expect(screen.getByTestId('tt-cell-one-a')).toBeInTheDocument();
      expect(screen.queryByTestId('tt-cell-two-a')).toBeNull();
    });

    it('renders a reorder handle per normal row', () => {
      renderTable();
      expect(screen.getByTestId('tt-handle-a1')).toHaveAccessibleName('Reorder A1');
    });
  });

  describe('phone layout (below 768px)', () => {
    beforeEach(() => {
      media.set(WIDE, false);
    });

    it('hides the header and the handles', () => {
      renderTable();
      expect(screen.queryByTestId('tt-header')).toBeNull();
      expect(screen.queryByTestId('tt-handle-a')).toBeNull();
    });

    it('shows phoneContent in place of content and detail', () => {
      renderTable({
        rows: [
          row('a', null, {
            cells: [
              { content: 'Line 1', detail: 'Line 2', phoneContent: 'Phone text' },
              { content: 'x' },
            ],
          }),
        ],
      });
      const cell = screen.getByTestId('tt-cell-one-a');
      expect(cell).toHaveTextContent('Phone text');
      expect(cell).not.toHaveTextContent('Line 1');
      expect(cell).not.toHaveTextContent('Line 2');
    });

    it('falls back to content when a cell has no phoneContent', () => {
      renderTable();
      expect(screen.getByTestId('tt-cell-one-a')).toHaveTextContent('a-1');
    });

    it('switches layout live when the viewport changes', () => {
      renderTable();
      expect(screen.queryByTestId('tt-header')).toBeNull();
      media.set(WIDE, true);
      expect(screen.getByTestId('tt-header')).toBeInTheDocument();
      expect(screen.getByTestId('tt-handle-a')).toBeInTheDocument();
    });
  });

  describe('quiet rows', () => {
    const QUIET_ROWS: TreeTableRow[] = [
      row('a', null),
      row('quiet:a', 'a', {
        quiet: true,
        label: 'Whole A',
        cells: [{ content: 'q-1' }, { content: 'q-2' }],
      }),
      row('a1', 'a'),
    ];

    it('renders the quiet row first in its group, with no toggle, handle or actions', () => {
      renderTable({ rows: QUIET_ROWS });
      const group = screen.getByRole('list', { name: 'Parts of A' });
      const items = within(group).getAllByRole('listitem');
      expect(items[0]).toContainElement(screen.getByTestId('tt-quiet-a'));
      expect(items[0]).toHaveAttribute('data-reorder-skip', 'true');
      const quiet = screen.getByTestId('tt-quiet-a');
      expect(quiet).toHaveTextContent('Whole A');
      expect(quiet.querySelector('button')).toBeNull();
      expect(screen.queryByTestId('act-quiet:a')).toBeNull();
      expect(screen.queryByTestId('tt-handle-quiet:a')).toBeNull();
      expect(screen.queryByTestId('tt-row-quiet:a')).toBeNull();
    });

    it('still shows the quiet row cells', () => {
      renderTable({ rows: QUIET_ROWS });
      expect(screen.getByTestId('tt-cell-one-quiet:a')).toHaveTextContent('q-1');
    });

    it('uses the root marker for a quiet row at the top level', () => {
      renderTable({ rows: [row('quiet:root', null, { quiet: true }), row('a', null)] });
      expect(screen.getByTestId('tt-quiet-root')).toBeInTheDocument();
    });

    it('prefers the quiet row name over its label', () => {
      renderTable({
        rows: [row('a', null), row('quiet:a', 'a', { quiet: true, name: <b>Bold quiet</b> })],
      });
      expect(screen.getByText('Bold quiet').tagName).toBe('B');
    });

    it('does not take part in keyboard reordering of its siblings', () => {
      renderTable({ rows: [...QUIET_ROWS, row('a2', 'a')] });
      fireEvent.keyDown(screen.getByTestId('tt-handle-a1'), { key: ' ' });
      fireEvent.keyDown(screen.getByTestId('tt-handle-a1'), { key: 'ArrowDown' });
      fireEvent.keyDown(screen.getByTestId('tt-handle-a1'), { key: ' ' });
      expect(onReorder).toHaveBeenCalledWith('a', ['a2', 'a1'], 'a1', 'keyboard');
    });
  });

  describe('reorder', () => {
    it('describes the handle by the instructions', () => {
      renderTable();
      const handle = screen.getByTestId('tt-handle-a1');
      const describedBy = handle.getAttribute('aria-describedby')!.split(' ');
      expect(describedBy).toHaveLength(1);
      expect(document.getElementById(describedBy[0]!)).toHaveTextContent('Press space to pick up.');
      expect(handle).not.toHaveAttribute('aria-disabled');
    });

    it('also points at the disabled hint while reorder is disabled', () => {
      renderTable({ reorderDisabled: true });
      const handle = screen.getByTestId('tt-handle-a1');
      const ids = handle.getAttribute('aria-describedby')!.split(' ');
      expect(ids).toHaveLength(2);
      expect(document.getElementById(ids[1]!)).toHaveTextContent('Clear the filter to reorder.');
      expect(handle).toHaveAttribute('aria-disabled', 'true');
    });

    it('does not pick up while disabled', () => {
      renderTable({ reorderDisabled: true });
      fireEvent.keyDown(screen.getByTestId('tt-handle-a1'), { key: ' ' });
      expect(onAnnounce).not.toHaveBeenCalled();
      expect(screen.getByTestId('tt-handle-a1')).toHaveAttribute('aria-pressed', 'false');
    });

    it('commits a keyboard move among siblings with the parent id', () => {
      renderTable();
      fireEvent.keyDown(screen.getByTestId('tt-handle-a1'), { key: ' ' });
      fireEvent.keyDown(screen.getByTestId('tt-handle-a1'), { key: 'ArrowDown' });
      fireEvent.keyDown(screen.getByTestId('tt-handle-a1'), { key: ' ' });
      expect(onReorder).toHaveBeenCalledTimes(1);
      expect(onReorder).toHaveBeenCalledWith('a', ['a2', 'a1'], 'a1', 'keyboard');
    });

    it('commits a top-level move with a null parent', () => {
      renderTable();
      fireEvent.keyDown(screen.getByTestId('tt-handle-b'), { key: ' ' });
      fireEvent.keyDown(screen.getByTestId('tt-handle-b'), { key: 'ArrowUp' });
      fireEvent.keyDown(screen.getByTestId('tt-handle-b'), { key: ' ' });
      expect(onReorder).toHaveBeenCalledWith(null, ['b', 'a'], 'b', 'keyboard');
    });

    it('shows the picked-up order in the DOM while moving', () => {
      renderTable();
      fireEvent.keyDown(screen.getByTestId('tt-handle-b'), { key: ' ' });
      fireEvent.keyDown(screen.getByTestId('tt-handle-b'), { key: 'ArrowUp' });
      const root = screen.getByRole('list', { name: 'Sample tree' });
      const order = Array.from(root.children).map((li) =>
        li.querySelector('[data-testid^="tt-row-"]')?.getAttribute('data-testid'),
      );
      expect(order).toEqual(['tt-row-b', 'tt-row-a']);
    });

    it('names the parent in step and drop announcements and keeps the common pick-up wording', () => {
      renderTable();
      fireEvent.keyDown(screen.getByTestId('tt-handle-a2'), { key: ' ' });
      fireEvent.keyDown(screen.getByTestId('tt-handle-a2'), { key: 'ArrowUp' });
      fireEvent.keyDown(screen.getByTestId('tt-handle-a2'), { key: ' ' });
      fireEvent.keyDown(screen.getByTestId('tt-handle-b'), { key: ' ' });
      fireEvent.keyDown(screen.getByTestId('tt-handle-b'), { key: 'ArrowUp' });
      expect(onAnnounce.mock.calls.map((c) => c[0])).toEqual([
        'A2 picked up. Position 2 of 2.',
        'A2 is 1 of 2 in A',
        'A2 is 1 of 2 in A',
        'B picked up. Position 2 of 2.',
        'B is 1 of 2 in top level',
      ]);
    });

    it('keeps the common wording for the canceled kind', () => {
      renderTable();
      fireEvent.keyDown(screen.getByTestId('tt-handle-a1'), { key: ' ' });
      fireEvent.keyDown(screen.getByTestId('tt-handle-a1'), { key: 'Escape' });
      expect(onAnnounce).toHaveBeenLastCalledWith('Reorder canceled. A1 is back at position 1.');
    });

    it('marks the picked row as lifted', () => {
      renderTable();
      fireEvent.keyDown(screen.getByTestId('tt-handle-a1'), { key: ' ' });
      expect(screen.getByTestId('tt-row-a1')).toHaveAttribute('data-dragging', 'true');
      expect(screen.getByTestId('tt-row-a2')).not.toHaveAttribute('data-dragging');
    });
  });

  describe('pointer drag', () => {
    beforeEach(() => {
      Object.defineProperty(window, 'PointerEvent', {
        configurable: true,
        writable: true,
        value: class extends MouseEvent {
          readonly pointerId: number;
          readonly pointerType: string;
          constructor(type: string, init: PointerEventInit = {}) {
            super(type, init);
            this.pointerId = init.pointerId ?? 1;
            this.pointerType = init.pointerType ?? 'mouse';
          }
        },
      });
      Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
        configurable: true,
        writable: true,
        value: () => {},
      });
      jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
        this: HTMLElement,
      ) {
        const index = this.parentElement
          ? Array.from(this.parentElement.children).indexOf(this)
          : 0;
        const top = index * 40;
        return {
          top,
          height: 40,
          bottom: top + 40,
          left: 0,
          right: 100,
          width: 100,
          x: 0,
          y: top,
          toJSON: () => ({}),
        };
      });
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('shows a drop line inside the dragging group only and commits on release', () => {
      renderTable();
      const handle = screen.getByTestId('tt-handle-a1');
      fireEvent.pointerDown(handle, { clientY: 20 });
      fireEvent.pointerMove(handle, { clientY: 100 });

      const dropItems = document.querySelectorAll('[data-drop]');
      expect(dropItems).toHaveLength(1);
      expect(dropItems[0]).toHaveAttribute('data-drop', 'after');
      expect(dropItems[0]).toContainElement(screen.getByTestId('tt-row-a2'));
      expect(screen.getByRole('list', { name: 'Parts of A' })).toHaveAttribute(
        'data-reordering',
        'true',
      );
      expect(screen.getByRole('list', { name: 'Sample tree' })).not.toHaveAttribute(
        'data-reordering',
      );

      fireEvent.pointerUp(handle, { clientY: 100 });
      expect(onReorder).toHaveBeenCalledWith('a', ['a2', 'a1'], 'a1', 'drag');
    });

    it('marks a drop before the first sibling as "before"', () => {
      renderTable();
      const handle = screen.getByTestId('tt-handle-a2');
      fireEvent.pointerDown(handle, { clientY: 60 });
      fireEvent.pointerMove(handle, { clientY: 0 });
      const target = document.querySelector('[data-drop]');
      expect(target).toHaveAttribute('data-drop', 'before');
      expect(target).toContainElement(screen.getByTestId('tt-row-a1'));
    });
  });
});
