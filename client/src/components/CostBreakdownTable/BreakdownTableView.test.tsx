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
import { BreakdownTableView } from './BreakdownTableView.js';
import type { BreakdownTableViewProps } from './BreakdownTableView.js';
import { breakdownColumns, buildBreakdownTree } from './breakdownTree.js';
import type { BreakdownNode, ColumnLabels } from './breakdownTree.js';
import type { BreakdownView } from './breakdownSettings.js';

const columnLabels: ColumnLabels = {
  expectedCost: 'Expected cost',
  grants: 'Grants',
  afterGrants: 'After grants',
  paid: 'Paid',
  stillToPay: 'Still to pay',
  notYetPaid: 'Not yet paid',
};

function treeFor(view: BreakdownView): BreakdownNode[] {
  return buildBreakdownTree(makeBreakdown(), view, {
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
}

function renderTable(over: Partial<BreakdownTableViewProps> = {}) {
  const props: BreakdownTableViewProps = {
    nodes: treeFor('area'),
    columns: breakdownColumns({ payment: 'all', grants: false }, columnLabels),
    estimate: 'expected',
    view: 'area',
    total: makeBreakdown().total,
    totalLabel: 'Total',
    expanded: new Set(),
    onToggle: jest.fn(),
    lineSourceName: () => null,
    ...over,
  };
  const view = render(
    <LocaleProvider>
      <MemoryRouter initialEntries={['/budget/overview']}>
        <BreakdownTableView {...props} />
        <OriginProbe />
      </MemoryRouter>
    </LocaleProvider>,
  );
  return { ...view, props };
}

const row = (key: string) => screen.getByTestId(`breakdown-row-${key}`);
const cell = (key: string, column: string) => screen.getByTestId(`breakdown-cell-${key}-${column}`);

describe('BreakdownTableView', () => {
  it('has a caption naming the view and a header row with Name and each column', () => {
    renderTable({ view: 'type' });
    const table = screen.getByRole('table', { name: 'Breakdown of the project by Type' });
    const headers = within(table.querySelector('thead')!).getAllByRole('columnheader');
    expect(headers.map((h) => h.textContent)).toEqual([
      'Name',
      'Expected cost',
      'Paid',
      'Still to pay',
    ]);
  });

  it('follows the given columns, including Grants and After grants', () => {
    renderTable({ columns: breakdownColumns({ payment: 'all', grants: true }, columnLabels) });
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual([
      'Name',
      'Expected cost',
      'Grants',
      'After grants',
      'Paid',
      'Still to pay',
    ]);
    expect(cell('line:l-1', 'grants')).toHaveTextContent('€100.00');
    expect(cell('line:l-1', 'afterGrants')).toHaveTextContent('€900.00');
  });

  it('formats every figure as currency, as given, in the chosen estimate', () => {
    const { unmount } = renderTable();
    expect(cell('line:l-2', 'expectedCost')).toHaveTextContent('€500.00');
    expect(cell('line:l-1', 'paid')).toHaveTextContent('€400.00');
    expect(cell('line:l-1', 'stillToPay')).toHaveTextContent('€600.00');
    unmount();
    renderTable({ estimate: 'low' });
    expect(cell('line:l-2', 'expectedCost')).toHaveTextContent('€450.00');
  });

  it('shows a negative Not yet paid as it is, with its minus sign', () => {
    const over: BreakdownNode = {
      key: 'line:over',
      kind: 'line',
      label: { text: 'Overpaid line', userText: true },
      figures: figures(100, { paid: 150 }),
      children: [],
    };
    renderTable({
      nodes: [over],
      columns: breakdownColumns({ payment: 'outstanding', grants: false }, columnLabels),
    });
    expect(cell('line:over', 'notYetPaid').textContent).toMatch(/^[-\u2212]€50\.00$/);
  });

  it('never prefixes a cost with a minus sign', () => {
    renderTable({ columns: breakdownColumns({ payment: 'all', grants: true }, columnLabels) });
    for (const td of screen.getAllByRole('cell')) {
      expect(td.textContent).not.toMatch(/^[-−]/);
    }
  });

  describe('expansion', () => {
    it('keeps collapsed children in the DOM, hidden, and shows only the roots', () => {
      renderTable();
      expect(row('area:a-1')).not.toHaveAttribute('hidden');
      expect(row('area:none')).not.toHaveAttribute('hidden');
      expect(row('not-yet-split')).not.toHaveAttribute('hidden');
      for (const key of [
        'area:a-2',
        'item:household_item:hi-1',
        'item:work_item:wi-1',
        'line:l-1',
        'orphans',
        'line:l-5',
      ]) {
        expect(row(key)).toHaveAttribute('hidden');
      }
    });

    it('shows a child as soon as its parent is expanded, but not the grandchildren', () => {
      renderTable({ expanded: new Set(['area:area:a-1']) });
      expect(row('area:a-2')).not.toHaveAttribute('hidden');
      expect(row('item:household_item:hi-1')).not.toHaveAttribute('hidden');
      expect(row('item:work_item:wi-1')).toHaveAttribute('hidden');
      expect(row('line:l-1')).toHaveAttribute('hidden');
    });

    it('keeps a row hidden when only its own node is open but an ancestor is closed', () => {
      renderTable({ expanded: new Set(['area:area:a-2', 'area:item:work_item:wi-1']) });
      expect(row('line:l-1')).toHaveAttribute('hidden');
    });

    it('shows a deep line when every ancestor is expanded', () => {
      renderTable({
        expanded: new Set(['area:area:a-1', 'area:area:a-2', 'area:item:work_item:wi-1']),
      });
      expect(row('line:l-1')).not.toHaveAttribute('hidden');
      expect(row('line:l-2')).not.toHaveAttribute('hidden');
    });

    it('gives a chevron button to rows with children only, with expanded state and a name', () => {
      renderTable({ expanded: new Set(['area:area:a-1']) });
      const open = screen.getByTestId('breakdown-toggle-area:a-1');
      expect(open).toHaveAttribute('aria-expanded', 'true');
      expect(open).toHaveAccessibleName('Hide Ground floor');
      const closed = screen.getByTestId('breakdown-toggle-area:a-2');
      expect(closed).toHaveAttribute('aria-expanded', 'false');
      expect(closed).toHaveAccessibleName('Show Kitchen');
      expect(screen.queryByTestId('breakdown-toggle-not-yet-split')).toBeNull();
      expect(screen.queryByTestId('breakdown-toggle-line:l-1')).toBeNull();
    });

    it('reports the view-scoped key when a chevron is clicked', async () => {
      const user = userEvent.setup();
      const { props } = renderTable({ view: 'source', nodes: treeFor('source') });
      await user.click(screen.getByTestId('breakdown-toggle-source:bs-a'));
      expect(props.onToggle).toHaveBeenCalledWith('source:source:bs-a');
    });
  });

  describe('names', () => {
    it('links a task to its page and a purchase to its page, carrying the origin', async () => {
      const user = userEvent.setup();
      renderTable({
        expanded: new Set(['area:area:a-1', 'area:area:a-2']),
      });
      const task = screen.getByRole('link', { name: 'Install cabinets' });
      expect(task).toHaveAttribute('href', '/project/work-items/wi-1');
      const purchase = screen.getByRole('link', { name: 'Oven' });
      expect(purchase).toHaveAttribute('href', '/project/household-items/hi-1');
      await user.click(task);
      expect(screen.getByTestId('probe-path')).toHaveTextContent('/project/work-items/wi-1');
      expect(probedOrigin()?.to).toContain('/budget/overview');
    });

    it('marks task names as user text', () => {
      renderTable({ expanded: new Set(['area:area:a-1', 'area:area:a-2']) });
      expect(screen.getByRole('link', { name: 'Install cabinets' }).className).toContain(
        'userText',
      );
    });

    it('shows a cost line with its description, its state chip and its funding source', () => {
      renderTable({
        expanded: new Set(['area:area:a-1', 'area:area:a-2', 'area:item:work_item:wi-1']),
        lineSourceName: (line) =>
          line.budgetSourceId === 'bs-a' ? { text: 'Savings', userText: true } : null,
      });
      const line1 = row('line:l-1');
      expect(within(line1).getByText('Cabinet supply')).toBeInTheDocument();
      expect(within(line1).getByText('Invoiced')).toBeInTheDocument();
      expect(within(line1).getByText('Savings').className).toContain('userText');
      const line2 = row('line:l-2');
      expect(within(line2).getByText('Estimate')).toBeInTheDocument();
      expect(within(line2).queryByText('Savings')).toBeNull();
    });

    it('shows a plain (non user text) funding source fallback', () => {
      renderTable({
        expanded: new Set(['area:area:a-1', 'area:area:a-2', 'area:item:work_item:wi-1']),
        lineSourceName: () => ({ text: 'Unassigned', userText: false }),
      });
      expect(within(row('line:l-1')).getByText('Unassigned').className).not.toContain('userText');
    });

    it('derives each line state from its link status', () => {
      renderTable({ view: 'category', nodes: treeFor('category') });
      expect(within(row('line:l-3')).getByText('Paid')).toBeInTheDocument();
      expect(within(row('line:l-5')).getByText('Submitted')).toBeInTheDocument();
    });

    it('renders group names and the Not yet split row as plain text without a link', () => {
      renderTable();
      expect(within(row('not-yet-split')).getByText('Not yet split')).toBeInTheDocument();
      expect(within(row('not-yet-split')).queryByRole('link')).toBeNull();
      expect(within(row('area:none')).getByText('No area').className).not.toContain('userText');
      expect(within(row('area:a-1')).getByText('Ground floor').className).toContain('userText');
    });

    it('caps the indent depth at 6', () => {
      const leaf = (key: string, children: BreakdownNode[] = []): BreakdownNode => ({
        key,
        kind: 'group',
        label: { text: key, userText: false },
        figures: figures(1),
        children,
      });
      const deep = leaf('d0', [
        leaf('d1', [
          leaf('d2', [leaf('d3', [leaf('d4', [leaf('d5', [leaf('d6', [leaf('d7')])])])])]),
        ]),
      ]);
      renderTable({ nodes: [deep] });
      expect(row('d0').querySelector('th')).toHaveAttribute('data-depth', '0');
      expect(row('d6').querySelector('th')).toHaveAttribute('data-depth', '6');
      expect(row('d7').querySelector('th')).toHaveAttribute('data-depth', '6');
    });
  });

  describe('total row', () => {
    it('shows the given label and the total figures', () => {
      renderTable({ totalLabel: 'Total for the current settings' });
      const footer = screen.getByTestId('breakdown-total');
      expect(within(footer).getByText('Total for the current settings')).toBeInTheDocument();
      expect(screen.getByTestId('breakdown-total-expectedCost')).toHaveTextContent('€2,900.00');
      expect(screen.getByTestId('breakdown-total-paid')).toHaveTextContent('€1,350.00');
      expect(screen.getByTestId('breakdown-total-stillToPay')).toHaveTextContent('€700.00');
    });

    it('reads the total in the chosen estimate and column set', () => {
      renderTable({
        estimate: 'high',
        columns: breakdownColumns({ payment: 'outstanding', grants: false }, columnLabels),
      });
      expect(screen.getByTestId('breakdown-total-notYetPaid')).toHaveTextContent('€1,650.00');
      expect(screen.queryByTestId('breakdown-total-paid')).toBeNull();
    });
  });

  it('carries no data-figure: breakdown rows are parts of a figure, not figure answers', () => {
    const { container } = renderTable({
      expanded: new Set(['area:area:a-1', 'area:area:a-2', 'area:item:work_item:wi-1']),
    });
    expect(container.querySelector('[data-figure]')).toBeNull();
  });

  it('has no duplicate test ids even with every row rendered', () => {
    const { container } = renderTable({
      expanded: new Set(['area:area:a-1', 'area:area:a-2', 'area:item:work_item:wi-1']),
    });
    expect(findDuplicateTestIds(container)).toEqual([]);
  });
});
