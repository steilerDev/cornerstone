/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect } from '@jest/globals';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { LocaleProvider } from '../../contexts/LocaleContext.js';
import { OriginProbe, probedOrigin } from '../../test/originProbe.js';
import { findDuplicateTestIds } from '../../test/findDuplicateTestIds.js';
import { figures, makeBreakdown } from '../../test/breakdownFixtures.js';
import { BreakdownDrillList } from './BreakdownDrillList.js';
import type { BreakdownDrillListProps } from './BreakdownDrillList.js';
import { breakdownColumns, buildBreakdownTree } from './breakdownTree.js';
import type { BreakdownNode, ColumnLabels } from './breakdownTree.js';

const columnLabels: ColumnLabels = {
  expectedCost: 'Expected cost',
  grants: 'Grants',
  afterGrants: 'After grants',
  paid: 'Paid',
  stillToPay: 'Still to pay',
  notYetPaid: 'Not yet paid',
};

const tree = (): BreakdownNode[] =>
  buildBreakdownTree(makeBreakdown(), 'area', {
    noArea: 'No area',
    noCategory: 'No category',
    unassigned: 'Unassigned',
    tasks: 'Tasks',
    purchases: 'Purchases',
    withoutTask: 'Without a task',
    notYetSplit: 'Not yet split',
    untitledLine: 'No description',
    categoryName: (name) => name,
  });

const allColumns = breakdownColumns({ payment: 'all', grants: false }, columnLabels);

function Harness(props: BreakdownDrillListProps) {
  return (
    <LocaleProvider>
      <MemoryRouter initialEntries={['/budget/overview']}>
        <BreakdownDrillList {...props} />
        <OriginProbe />
      </MemoryRouter>
    </LocaleProvider>
  );
}

function setup(over: Partial<BreakdownDrillListProps> = {}) {
  const onAnnounce = jest.fn<(text: string) => void>();
  const props: BreakdownDrillListProps = {
    nodes: tree(),
    columns: allColumns,
    estimate: 'expected',
    onAnnounce,
    ...over,
  };
  const view = render(<Harness {...props} />);
  const again = (next: Partial<BreakdownDrillListProps>) =>
    view.rerender(<Harness {...props} {...next} />);
  return { ...view, onAnnounce, again };
}

const row = (key: string) => screen.getByTestId(`breakdown-list-row-${key}`);

describe('BreakdownDrillList', () => {
  describe('root level', () => {
    it('lists the top-level rows with the first column as the figure on the right', () => {
      setup();
      const list = screen.getByTestId('breakdown-list');
      const rows = within(list).getAllByRole('listitem');
      expect(rows).toHaveLength(3);
      expect(row('area:a-1')).toHaveTextContent('Ground floor');
      expect(row('area:a-1')).toHaveTextContent('€2,300.00');
      expect(screen.queryByTestId('breakdown-list-heading')).toBeNull();
      expect(screen.queryByTestId('breakdown-list-back')).toBeNull();
    });

    it('puts the other columns on a muted second line as "Label: value" pairs joined by a dot', () => {
      setup();
      expect(row('area:a-1')).toHaveTextContent('Paid: €1,200.00 · Still to pay: €600.00');
    });

    it('shows a single column without a second line', () => {
      setup({ columns: breakdownColumns({ payment: 'paid', grants: false }, columnLabels) });
      expect(row('area:a-1')).toHaveTextContent('€1,200.00');
      expect(row('area:a-1').textContent).not.toContain('·');
      expect(row('area:a-1').textContent).not.toContain(':');
    });

    it('shows no figure when there are no columns', () => {
      setup({ columns: [] });
      expect(row('area:a-1')).toHaveTextContent('Ground floor');
      expect(row('area:a-1').textContent).not.toContain('€');
    });

    it('reads the figure in the chosen estimate', () => {
      setup({ estimate: 'high' });
      expect(row('area:a-1')).toHaveTextContent('€2,400.00');
    });

    it('renders a row with children as a button, a leaf as plain text', () => {
      setup();
      expect(row('area:a-1').tagName).toBe('BUTTON');
      expect(row('not-yet-split').tagName).toBe('DIV');
      expect(within(row('not-yet-split')).queryByRole('link')).toBeNull();
    });

    it('renders an item without lines as a link to its page with the origin', async () => {
      const user = userEvent.setup();
      const item: BreakdownNode = {
        key: 'item:work_item:wi-9',
        kind: 'item',
        label: { text: 'Hang door', userText: true },
        item: { kind: 'work_item', id: 'wi-9' },
        figures: figures(100),
        children: [],
      };
      const purchase: BreakdownNode = {
        ...item,
        key: 'item:household_item:hi-9',
        label: { text: 'Lamp', userText: true },
        item: { kind: 'household_item', id: 'hi-9' },
      };
      setup({ nodes: [item, purchase] });
      expect(screen.getByRole('link', { name: /Lamp/ })).toHaveAttribute(
        'href',
        '/project/household-items/hi-9',
      );
      const task = screen.getByRole('link', { name: /Hang door/ });
      expect(task).toHaveAttribute('href', '/project/work-items/wi-9');
      await user.click(task);
      expect(probedOrigin()?.to).toContain('/budget/overview');
    });

    it('marks user text names and keeps fallback names plain', () => {
      setup();
      expect(within(row('area:a-1')).getByText('Ground floor').className).toContain('userText');
      expect(within(row('area:none')).getByText('No area').className).not.toContain('userText');
    });
  });

  describe('drilling in', () => {
    it('shows the children of a tapped row under its name, focuses the heading and announces it', async () => {
      const user = userEvent.setup();
      const { onAnnounce } = setup();
      await user.click(row('area:a-1'));
      const heading = screen.getByTestId('breakdown-list-heading');
      expect(heading).toHaveTextContent('Ground floor');
      expect(heading.tagName).toBe('H3');
      expect(heading).toHaveFocus();
      expect(heading.className).toContain('userText');
      expect(onAnnounce).toHaveBeenLastCalledWith('Showing Ground floor');
      expect(screen.queryByTestId('breakdown-list-row-area:none')).toBeNull();
      expect(row('item:household_item:hi-1')).toBeInTheDocument();
      expect(row('area:a-2')).toBeInTheDocument();
    });

    it('offers a Back button named for the breakdown at the first level', async () => {
      const user = userEvent.setup();
      setup();
      await user.click(row('area:a-1'));
      expect(screen.getByTestId('breakdown-list-back')).toHaveTextContent(
        '‹ Back to the breakdown',
      );
    });

    it('names the parent on the Back button two levels down and goes up one level', async () => {
      const user = userEvent.setup();
      const { onAnnounce } = setup();
      await user.click(row('area:a-1'));
      await user.click(row('area:a-2'));
      expect(screen.getByTestId('breakdown-list-heading')).toHaveTextContent('Kitchen');
      const back = screen.getByTestId('breakdown-list-back');
      expect(back).toHaveTextContent('Back to Ground floor');
      await user.click(back);
      expect(screen.getByTestId('breakdown-list-heading')).toHaveTextContent('Ground floor');
      expect(onAnnounce).toHaveBeenLastCalledWith('Showing Ground floor');
    });

    it('goes back to the root, announces the breakdown and focuses the first row', async () => {
      const user = userEvent.setup();
      const { onAnnounce } = setup();
      await user.click(row('area:a-1'));
      await user.click(screen.getByTestId('breakdown-list-back'));
      expect(screen.queryByTestId('breakdown-list-heading')).toBeNull();
      expect(onAnnounce).toHaveBeenLastCalledWith('Showing the breakdown');
      expect(row('area:a-1')).toHaveFocus();
    });

    it('drills down to cost lines and shows them as plain rows', async () => {
      const user = userEvent.setup();
      setup();
      await user.click(row('area:a-1'));
      await user.click(row('area:a-2'));
      const taskRow = row('item:work_item:wi-1');
      expect(taskRow.tagName).toBe('BUTTON');
      await user.click(taskRow);
      expect(screen.getByTestId('breakdown-list-heading')).toHaveTextContent('Install cabinets');
      expect(row('line:l-1').tagName).toBe('DIV');
      expect(row('line:l-1')).toHaveTextContent('Cabinet supply');
      expect(row('line:l-1')).toHaveTextContent('€1,000.00');
      expect(row('line:l-2')).toHaveTextContent('Cabinet fitting');
    });

    it('links the heading of a drilled-in task to its page and names it by the item', async () => {
      const user = userEvent.setup();
      setup();
      await user.click(row('area:a-1'));
      await user.click(row('area:a-2'));
      await user.click(row('item:work_item:wi-1'));
      const heading = screen.getByTestId('breakdown-list-heading');
      expect(heading.tagName).toBe('H3');
      expect(heading).toHaveFocus();
      expect(heading).toHaveAttribute('tabindex', '-1');
      const link = within(heading).getByTestId('breakdown-list-heading-link');
      expect(link).toHaveAttribute('href', '/project/work-items/wi-1');
      expect(link.className).toContain('userText');
      expect(screen.getByRole('link', { name: 'Install cabinets' })).toBe(link);
    });

    it('links the heading of a drilled-in purchase to the purchase page', async () => {
      const user = userEvent.setup();
      const purchase: BreakdownNode = {
        key: 'item:household_item:hi-7',
        kind: 'item',
        label: { text: 'Lamp', userText: true },
        item: { kind: 'household_item', id: 'hi-7' },
        figures: figures(100),
        children: [
          {
            key: 'line:l-9',
            kind: 'line',
            label: { text: 'Bulb', userText: true },
            figures: figures(100),
            children: [],
          },
        ],
      };
      setup({ nodes: [purchase] });
      await user.click(row('item:household_item:hi-7'));
      const link = screen.getByTestId('breakdown-list-heading-link');
      expect(link).toHaveAttribute('href', '/project/household-items/hi-7');
      expect(link).toHaveAccessibleName('Lamp');
    });

    it('keeps the heading of a drilled-in group as plain text without a link', async () => {
      const user = userEvent.setup();
      setup();
      await user.click(row('area:a-1'));
      expect(screen.getByTestId('breakdown-list-heading')).toHaveTextContent('Ground floor');
      expect(screen.queryByTestId('breakdown-list-heading-link')).toBeNull();
    });

    it('uses a plain heading for a fallback-named group', async () => {
      const user = userEvent.setup();
      setup();
      await user.click(row('area:none'));
      const heading = screen.getByTestId('breakdown-list-heading');
      expect(heading).toHaveTextContent('No area');
      expect(heading.className).not.toContain('userText');
    });
  });

  describe('when the data changes under the path', () => {
    it('returns to the root when the drilled node no longer exists', async () => {
      const user = userEvent.setup();
      const { again } = setup();
      await user.click(row('area:a-1'));
      expect(screen.getByTestId('breakdown-list-heading')).toBeInTheDocument();
      again({ nodes: tree().filter((n) => n.key !== 'area:a-1') });
      expect(screen.queryByTestId('breakdown-list-heading')).toBeNull();
      expect(row('area:none')).toBeInTheDocument();
    });

    it('stays on the drilled node when it is still there after a settings change', async () => {
      const user = userEvent.setup();
      const { again } = setup();
      await user.click(row('area:a-1'));
      again({ estimate: 'low' });
      expect(screen.getByTestId('breakdown-list-heading')).toHaveTextContent('Ground floor');
    });
  });

  it('has no duplicate test ids', async () => {
    const user = userEvent.setup();
    const { container } = setup();
    await user.click(row('area:a-1'));
    expect(findDuplicateTestIds(container)).toEqual([]);
  });

  it('carries no data-figure', () => {
    const { container } = setup();
    expect(container.querySelector('[data-figure]')).toBeNull();
  });
});
