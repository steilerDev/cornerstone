/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { BudgetBreakdown } from '@cornerstone/shared';
import { LocaleProvider } from '../../contexts/LocaleContext.js';
import { useBreakdownSettings } from '../../pages/BudgetOverviewPage/useBreakdownSettings.js';
import { installMatchMedia } from '../../test/matchMediaControl.js';
import type { MatchMediaControl } from '../../test/matchMediaControl.js';
import { findDuplicateTestIds } from '../../test/findDuplicateTestIds.js';
import { figures, makeBreakdown, makeEmptyBreakdown } from '../../test/breakdownFixtures.js';
import { CostBreakdownTable } from './CostBreakdownTable.js';
import type { CostBreakdownTableProps } from './CostBreakdownTable.js';

const WIDE = '(min-width: 768px)';

interface HarnessProps {
  breakdown: BudgetBreakdown | null;
  refetching?: boolean;
  announcement?: CostBreakdownTableProps['announcement'];
  loadError?: CostBreakdownTableProps['loadError'];
}

/** The real URL settings hook feeding the card, as the Money page does. */
function Harness({
  breakdown,
  refetching = false,
  announcement = null,
  loadError = null,
}: HarnessProps) {
  const api = useBreakdownSettings();
  const location = useLocation();
  return (
    <>
      <div data-testid="search">{location.search}</div>
      <CostBreakdownTable
        breakdown={breakdown}
        settings={api.settings}
        onViewChange={api.setView}
        onPaymentChange={api.setPayment}
        onEstimateChange={api.setEstimate}
        onGrantsChange={api.setGrants}
        onSourceToggle={api.toggleSource}
        onSelectAllSources={api.selectAllSources}
        onResetSettings={api.reset}
        refetching={refetching}
        announcement={announcement}
        loadError={loadError}
      />
    </>
  );
}

function renderCard(props: HarnessProps, url = '/budget/overview') {
  const tree = (p: HarnessProps) => (
    <LocaleProvider>
      <MemoryRouter initialEntries={[url]}>
        <Harness {...p} />
      </MemoryRouter>
    </LocaleProvider>
  );
  const view = render(tree(props));
  return { ...view, rerenderCard: (p: HarnessProps) => view.rerender(tree(p)) };
}

let media: MatchMediaControl;
beforeEach(() => {
  media = installMatchMedia({ [WIDE]: true });
});
afterEach(() => {
  media.restore();
});

const row = (key: string) => screen.getByTestId(`breakdown-row-${key}`);
const cell = (key: string, column: string) => screen.getByTestId(`breakdown-cell-${key}-${column}`);
const hasRow = (key: string) => screen.queryByTestId(`breakdown-row-${key}`) !== null;
const search = () => screen.getByTestId('search').textContent;
const headers = () =>
  within(screen.getByTestId('breakdown-table'))
    .getAllByRole('columnheader')
    .map((h) => h.textContent);

describe('CostBreakdownTable', () => {
  describe('structure', () => {
    it('is a region named Breakdown with the toolbar, a status region and both surfaces', () => {
      renderCard({ breakdown: makeBreakdown() });
      const card = screen.getByRole('region', { name: 'Breakdown' });
      expect(card).toBe(screen.getByTestId('breakdown-card'));
      expect(
        within(card).getByRole('heading', { level: 2, name: 'Breakdown' }),
      ).toBeInTheDocument();
      expect(within(card).getByTestId('breakdown-toolbar')).toBeInTheDocument();
      expect(within(card).getByTestId('breakdown-table')).toBeInTheDocument();
      expect(within(card).getByTestId('breakdown-list')).toBeInTheDocument();
    });

    it('has exactly one always-mounted status region without aria-live or aria-atomic', () => {
      renderCard({ breakdown: makeBreakdown() });
      const regions = screen.getAllByRole('status');
      expect(regions).toHaveLength(1);
      expect(regions[0]).toBe(screen.getByTestId('breakdown-status'));
      expect(regions[0]).not.toHaveAttribute('aria-live');
      expect(regions[0]).not.toHaveAttribute('aria-atomic');
      expect(regions[0]).toHaveTextContent('');
    });

    it('has neither duplicate test ids nor a data-figure marker', () => {
      const { container } = renderCard({ breakdown: makeBreakdown() });
      expect(findDuplicateTestIds(container)).toEqual([]);
      expect(container.querySelector('[data-figure]')).toBeNull();
    });

    it('is not busy while idle and busy while refetching', () => {
      const idle = renderCard({ breakdown: makeBreakdown() });
      expect(screen.getByTestId('breakdown-card')).toHaveAttribute('aria-busy', 'false');
      idle.rerenderCard({ breakdown: makeBreakdown(), refetching: true });
      expect(screen.getByTestId('breakdown-card')).toHaveAttribute('aria-busy', 'true');
    });
  });

  describe('views', () => {
    it('starts on By area with Expected cost, Paid and Still to pay', () => {
      renderCard({ breakdown: makeBreakdown() });
      expect(screen.getByTestId('breakdown-view-area')).toHaveAttribute('aria-pressed', 'true');
      expect(headers()).toEqual(['Name', 'Expected cost', 'Paid', 'Still to pay']);
      expect(hasRow('area:a-1')).toBe(true);
      expect(cell('area:a-1', 'expectedCost')).toHaveTextContent('€2,300.00');
    });

    it('switches to By type and writes ?by=type', async () => {
      const user = userEvent.setup();
      renderCard({ breakdown: makeBreakdown() });
      await user.click(screen.getByTestId('breakdown-view-type'));
      expect(search()).toBe('?by=type');
      expect(hasRow('type:work_items')).toBe(true);
      expect(hasRow('type:household_items')).toBe(true);
      expect(hasRow('area:a-1')).toBe(false);
      expect(cell('type:work_items', 'expectedCost')).toHaveTextContent('€1,900.00');
      expect(screen.getByRole('table')).toHaveAccessibleName('Breakdown of the project by Type');
    });

    it('switches to By cost category', async () => {
      const user = userEvent.setup();
      renderCard({ breakdown: makeBreakdown() });
      await user.click(screen.getByTestId('breakdown-view-category'));
      expect(search()).toBe('?by=category');
      expect(cell('category:cat-1', 'expectedCost')).toHaveTextContent('€1,800.00');
      expect(hasRow('category:none')).toBe(true);
    });

    it('switches to By funding source and puts Unassigned last', async () => {
      const user = userEvent.setup();
      renderCard({ breakdown: makeBreakdown() });
      await user.click(screen.getByTestId('breakdown-view-source'));
      expect(search()).toBe('?by=source');
      const keys = screen
        .getAllByTestId(/^breakdown-row-source:/)
        .map((r) => r.getAttribute('data-testid'));
      expect(keys).toEqual([
        'breakdown-row-source:bs-a',
        'breakdown-row-source:bs-b',
        'breakdown-row-source:none',
      ]);
      expect(cell('source:bs-a', 'expectedCost')).toHaveTextContent('€1,400.00');
    });

    it('ends every view with the Not yet split row', async () => {
      const user = userEvent.setup();
      renderCard({ breakdown: makeBreakdown() });
      for (const view of ['area', 'type', 'category', 'source']) {
        await user.click(screen.getByTestId(`breakdown-view-${view}`));
        const rows = screen.getAllByTestId(/^breakdown-row-/);
        expect(rows[rows.length - 1]).toHaveAttribute('data-testid', 'breakdown-row-not-yet-split');
      }
      expect(cell('not-yet-split', 'expectedCost')).toHaveTextContent('€200.00');
    });

    it('goes down to cost lines and the Without a task group', async () => {
      const user = userEvent.setup();
      renderCard({ breakdown: makeBreakdown() });
      expect(hasRow('line:l-1')).toBe(true);
      expect(hasRow('orphans')).toBe(true);
      expect(hasRow('line:l-5')).toBe(true);
      await user.click(screen.getByTestId('breakdown-view-type'));
      expect(hasRow('orphans')).toBe(true);
    });

    it('sums to the total in every view: the top-level rows plus Not yet split', async () => {
      const user = userEvent.setup();
      renderCard({ breakdown: makeBreakdown() });
      const total = 2900;
      for (const view of ['area', 'type', 'category', 'source']) {
        await user.click(screen.getByTestId(`breakdown-view-${view}`));
        const tops = screen
          .getAllByTestId(/^breakdown-row-/)
          .filter((r) => r.querySelector('th')?.getAttribute('data-depth') === '0');
        const sum = tops
          .map((r) => r.querySelector('td')!.textContent!)
          .map((t) => Number(t.replace(/[^0-9.]/g, '')))
          .reduce((a, b) => a + b, 0);
        expect(sum).toBe(total);
      }
    });
  });

  describe('payment basis', () => {
    it('shows only Paid under Paid and hides rows without Paid', async () => {
      const user = userEvent.setup();
      renderCard({ breakdown: makeBreakdown() });
      await user.click(screen.getByTestId('breakdown-payment-paid'));
      expect(search()).toBe('?paymentStatus=paid');
      expect(headers()).toEqual(['Name', 'Paid']);
      expect(hasRow('line:l-1')).toBe(true);
      expect(hasRow('line:l-2')).toBe(false);
      expect(hasRow('line:l-4')).toBe(false);
      expect(cell('area:a-1', 'paid')).toHaveTextContent('€1,200.00');
    });

    it('shows only Not yet paid under Not yet paid and hides fully paid rows', async () => {
      const user = userEvent.setup();
      renderCard({ breakdown: makeBreakdown() });
      await user.click(screen.getByTestId('breakdown-payment-outstanding'));
      expect(search()).toBe('?paymentStatus=outstanding');
      expect(headers()).toEqual(['Name', 'Not yet paid']);
      expect(hasRow('line:l-3')).toBe(false);
      expect(hasRow('line:l-5')).toBe(false);
      expect(cell('line:l-1', 'notYetPaid')).toHaveTextContent('€600.00');
    });

    it('shows a negative Not yet paid as it is', () => {
      const over = makeBreakdown({
        lines: [{ ...makeBreakdown().lines[0]!, figures: figures(100, { paid: 150 }) }],
        items: [],
        byArea: [],
        noArea: null,
        orphanLines: null,
        notYetSplit: null,
        byCategory: [
          {
            budgetCategoryId: 'cat-1',
            name: 'Materials',
            translationKey: null,
            figures: figures(100, { paid: 150 }),
          },
        ],
        total: figures(100, { paid: 150 }),
      });
      renderCard({ breakdown: over }, '/budget/overview?by=category&paymentStatus=outstanding');
      expect(cell('line:l-1', 'notYetPaid').textContent).toMatch(/^[-−]€50\.00$/);
    });

    it('opens on the basis from an old ?paymentStatus=outstanding link', () => {
      renderCard({ breakdown: makeBreakdown() }, '/budget/overview?paymentStatus=outstanding');
      expect(screen.getByTestId('breakdown-payment-outstanding')).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(headers()).toEqual(['Name', 'Not yet paid']);
    });
  });

  describe('Show grants', () => {
    it('adds Grants and After grants after Expected cost under All', async () => {
      const user = userEvent.setup();
      renderCard({ breakdown: makeBreakdown() });
      await user.click(screen.getByRole('button', { name: 'Grants' }));
      expect(search()).toBe('?grants=1');
      expect(headers()).toEqual([
        'Name',
        'Expected cost',
        'Grants',
        'After grants',
        'Paid',
        'Still to pay',
      ]);
      expect(cell('line:l-1', 'grants')).toHaveTextContent('€100.00');
      expect(cell('line:l-1', 'afterGrants')).toHaveTextContent('€900.00');
      await user.click(screen.getByRole('button', { name: 'Grants' }));
      expect(search()).toBe('');
      expect(headers()).toEqual(['Name', 'Expected cost', 'Paid', 'Still to pay']);
    });

    it('hides the toggle and the columns under Paid but keeps ?grants=1 in the URL', async () => {
      const user = userEvent.setup();
      renderCard({ breakdown: makeBreakdown() }, '/budget/overview?grants=1');
      expect(screen.getByRole('group', { name: 'Show' })).toBeInTheDocument();
      await user.click(screen.getByTestId('breakdown-payment-paid'));
      expect(screen.queryByTestId('breakdown-show-grants')).toBeNull();
      expect(headers()).toEqual(['Name', 'Paid']);
      expect(search()).toContain('grants=1');
      await user.click(screen.getByTestId('breakdown-payment-all'));
      expect(headers()).toContain('After grants');
    });
  });

  describe('estimates', () => {
    it('shows the best case under Low and the worst case under High', async () => {
      const user = userEvent.setup();
      renderCard({ breakdown: makeBreakdown() });
      expect(cell('line:l-2', 'expectedCost')).toHaveTextContent('€500.00');
      await user.click(screen.getByTestId('breakdown-estimate-low'));
      expect(search()).toBe('?estimate=low');
      expect(cell('line:l-2', 'expectedCost')).toHaveTextContent('€450.00');
      await user.click(screen.getByTestId('breakdown-estimate-high'));
      expect(search()).toBe('?estimate=high');
      expect(cell('line:l-2', 'expectedCost')).toHaveTextContent('€600.00');
      await user.click(screen.getByTestId('breakdown-estimate-expected'));
      expect(search()).toBe('');
    });

    it('does not change Paid and Still to pay between estimates', async () => {
      const user = userEvent.setup();
      renderCard({ breakdown: makeBreakdown() });
      await user.click(screen.getByTestId('breakdown-estimate-high'));
      expect(cell('line:l-1', 'paid')).toHaveTextContent('€400.00');
      expect(cell('line:l-1', 'stillToPay')).toHaveTextContent('€600.00');
    });
  });

  describe('total row', () => {
    const totalLabel = () =>
      within(screen.getByTestId('breakdown-total')).getAllByRole('rowheader')[0];

    it('reads Total for the whole project at expected estimates', () => {
      renderCard({ breakdown: makeBreakdown() });
      expect(totalLabel()).toHaveTextContent(/^Total$/);
      expect(screen.getByTestId('breakdown-total-expectedCost')).toHaveTextContent('€2,900.00');
    });

    it('reads "Total for the current settings" once the payment basis changes', async () => {
      const user = userEvent.setup();
      renderCard({ breakdown: makeBreakdown() });
      await user.click(screen.getByTestId('breakdown-payment-paid'));
      expect(totalLabel()).toHaveTextContent('Total for the current settings');
      await user.click(screen.getByTestId('breakdown-payment-all'));
      expect(totalLabel()).toHaveTextContent(/^Total$/);
    });

    it('reads "Total for the current settings" for an estimate other than Expected', async () => {
      const user = userEvent.setup();
      renderCard({ breakdown: makeBreakdown() });
      await user.click(screen.getByTestId('breakdown-estimate-low'));
      expect(totalLabel()).toHaveTextContent('Total for the current settings');
      expect(screen.getByTestId('breakdown-total-expectedCost')).toHaveTextContent('€2,850.00');
    });

    it('reads "Total for the current settings" when a funding source is deselected', () => {
      renderCard({ breakdown: makeBreakdown() }, '/budget/overview?deselectedSources=bs-b');
      expect(totalLabel()).toHaveTextContent('Total for the current settings');
    });

    it('does not change for the view or the Grants toggle', async () => {
      const user = userEvent.setup();
      renderCard({ breakdown: makeBreakdown() });
      await user.click(screen.getByTestId('breakdown-view-source'));
      await user.click(screen.getByRole('button', { name: 'Grants' }));
      expect(totalLabel()).toHaveTextContent(/^Total$/);
    });
  });

  describe('funding source filter', () => {
    it('shows "n of N" and writes the deselected source to the URL', async () => {
      const user = userEvent.setup();
      renderCard({ breakdown: makeBreakdown() });
      const chip = screen.getByTestId('breakdown-sources-button');
      expect(chip).toHaveTextContent('3 of 3');
      await user.click(chip);
      await user.click(screen.getByTestId('breakdown-source-bs-b'));
      expect(search()).toBe('?deselectedSources=bs-b');
      expect(chip).toHaveTextContent('2 of 3');
    });

    it('selects all again from the panel', async () => {
      const user = userEvent.setup();
      renderCard({ breakdown: makeBreakdown() }, '/budget/overview?deselectedSources=bs-b');
      await user.click(screen.getByTestId('breakdown-sources-button'));
      await user.click(screen.getByRole('button', { name: 'Select all' }));
      expect(search()).toBe('');
    });

    it('cannot deselect the last selected source', async () => {
      const user = userEvent.setup();
      renderCard(
        { breakdown: makeBreakdown() },
        '/budget/overview?deselectedSources=bs-b,unassigned',
      );
      await user.click(screen.getByTestId('breakdown-sources-button'));
      await user.click(screen.getByTestId('breakdown-source-bs-a'));
      expect(search()).toBe('?deselectedSources=bs-b,unassigned');
    });
  });

  describe('funding source of a line', () => {
    const open = async (user: ReturnType<typeof userEvent.setup>) => {
      await user.click(screen.getByTestId('breakdown-toggle-area:a-1'));
      await user.click(screen.getByTestId('breakdown-toggle-area:a-2'));
      await user.click(screen.getByTestId('breakdown-toggle-item:work_item:wi-1'));
    };

    it('shows the source name beside a line outside the source view', async () => {
      const user = userEvent.setup();
      renderCard({ breakdown: makeBreakdown() });
      await open(user);
      expect(within(row('line:l-1')).getByText('Savings')).toBeInTheDocument();
      expect(within(row('line:l-2')).getByText('Loan')).toBeInTheDocument();
    });

    it('shows Unassigned for a line without a source', async () => {
      const user = userEvent.setup();
      renderCard({ breakdown: makeBreakdown() });
      await user.click(screen.getByTestId('breakdown-toggle-area:a-1'));
      await user.click(screen.getByTestId('breakdown-toggle-item:household_item:hi-1'));
      expect(within(row('line:l-3')).getByText('Unassigned')).toBeInTheDocument();
    });

    it('shows no source name in the funding source view', async () => {
      const user = userEvent.setup();
      renderCard({ breakdown: makeBreakdown() }, '/budget/overview?by=source');
      await user.click(screen.getByTestId('breakdown-toggle-source:bs-a'));
      expect(within(row('line:l-1')).queryByText('Savings')).toBeNull();
    });

    it('shows no source name for a line whose source is not in the options', async () => {
      const user = userEvent.setup();
      const b = makeBreakdown();
      renderCard({
        breakdown: { ...b, lines: b.lines.map((l) => ({ ...l, budgetSourceId: 'gone' })) },
      });
      await open(user);
      expect(within(row('line:l-1')).queryByText('Savings')).toBeNull();
      expect(within(row('line:l-1')).queryByText('Unassigned')).toBeNull();
    });
  });

  describe('expanding rows', () => {
    it('opens and closes a group without unmounting its children', async () => {
      const user = userEvent.setup();
      renderCard({ breakdown: makeBreakdown() });
      expect(row('area:a-2')).toHaveAttribute('hidden');
      await user.click(screen.getByTestId('breakdown-toggle-area:a-1'));
      expect(row('area:a-2')).not.toHaveAttribute('hidden');
      await user.click(screen.getByTestId('breakdown-toggle-area:a-1'));
      expect(row('area:a-2')).toHaveAttribute('hidden');
      expect(hasRow('area:a-2')).toBe(true);
    });

    it('remembers open rows per view', async () => {
      const user = userEvent.setup();
      renderCard({ breakdown: makeBreakdown() });
      await user.click(screen.getByTestId('breakdown-toggle-area:a-1'));
      await user.click(screen.getByTestId('breakdown-view-type'));
      expect(row('item:work_item:wi-1')).toHaveAttribute('hidden');
      await user.click(screen.getByTestId('breakdown-view-area'));
      expect(row('area:a-2')).not.toHaveAttribute('hidden');
    });

    it('expands every row on beforeprint and restores the open rows on afterprint', async () => {
      const user = userEvent.setup();
      renderCard({ breakdown: makeBreakdown() });
      await user.click(screen.getByTestId('breakdown-toggle-area:a-1'));
      act(() => {
        window.dispatchEvent(new Event('beforeprint'));
      });
      for (const key of ['area:a-2', 'item:work_item:wi-1', 'line:l-1', 'orphans', 'line:l-5']) {
        expect(row(key)).not.toHaveAttribute('hidden');
      }
      act(() => {
        window.dispatchEvent(new Event('afterprint'));
      });
      expect(row('area:a-2')).not.toHaveAttribute('hidden');
      expect(row('line:l-1')).toHaveAttribute('hidden');
    });

    it('expands only the rows that are visible under the payment basis for print', () => {
      renderCard({ breakdown: makeBreakdown() }, '/budget/overview?paymentStatus=paid');
      act(() => {
        window.dispatchEvent(new Event('beforeprint'));
      });
      expect(row('line:l-1')).not.toHaveAttribute('hidden');
      expect(hasRow('line:l-2')).toBe(false);
    });
  });

  describe('announcements', () => {
    it('writes an announcement into the status region when it arrives', () => {
      const { rerenderCard } = renderCard({ breakdown: makeBreakdown() });
      rerenderCard({
        breakdown: makeBreakdown(),
        announcement: { id: 1, text: '2 of 3 funding sources shown. Expected cost €2,400.00.' },
      });
      expect(screen.getByTestId('breakdown-status')).toHaveTextContent(
        '2 of 3 funding sources shown. Expected cost €2,400.00.',
      );
    });

    it('does not announce a stale announcement that was already there when the card mounted', () => {
      renderCard({ breakdown: makeBreakdown(), announcement: { id: 1, text: 'Old news' } });
      expect(screen.getByTestId('breakdown-status')).toHaveTextContent('');
    });

    it('updates the region only when the announcement id changes', () => {
      const { rerenderCard } = renderCard({ breakdown: makeBreakdown() });
      rerenderCard({ breakdown: makeBreakdown(), announcement: { id: 1, text: 'First' } });
      expect(screen.getByTestId('breakdown-status')).toHaveTextContent('First');
      rerenderCard({ breakdown: makeBreakdown(), announcement: { id: 1, text: 'Edited text' } });
      expect(screen.getByTestId('breakdown-status')).toHaveTextContent('First');
      rerenderCard({ breakdown: makeBreakdown(), announcement: { id: 2, text: 'Second' } });
      expect(screen.getByTestId('breakdown-status')).toHaveTextContent('Second');
    });

    it('clears the region when the announcement goes away', () => {
      const { rerenderCard } = renderCard({ breakdown: makeBreakdown() });
      rerenderCard({ breakdown: makeBreakdown(), announcement: { id: 1, text: 'First' } });
      rerenderCard({ breakdown: makeBreakdown(), announcement: null });
      expect(screen.getByTestId('breakdown-status')).toHaveTextContent('');
    });

    it('announces a drill-down of the phone list in the same region', async () => {
      const user = userEvent.setup();
      renderCard({ breakdown: makeBreakdown() });
      await user.click(screen.getByTestId('breakdown-list-row-area:a-1'));
      expect(screen.getByTestId('breakdown-status')).toHaveTextContent('Showing Ground floor');
    });

    it('starts the phone list at the root again after a view change', async () => {
      const user = userEvent.setup();
      renderCard({ breakdown: makeBreakdown() });
      await user.click(screen.getByTestId('breakdown-list-row-area:a-1'));
      expect(screen.getByTestId('breakdown-list-heading')).toBeInTheDocument();
      await user.click(screen.getByTestId('breakdown-view-type'));
      expect(screen.queryByTestId('breakdown-list-heading')).toBeNull();
      expect(screen.getByTestId('breakdown-list-row-type:work_items')).toBeInTheDocument();
    });
  });

  describe('empty states', () => {
    it('says costs appear once there are cost lines, with no action', () => {
      renderCard({ breakdown: makeEmptyBreakdown() });
      expect(
        screen.getByText('Costs appear here once tasks or purchases have cost lines.'),
      ).toBeInTheDocument();
      expect(screen.queryByTestId('breakdown-table')).toBeNull();
      expect(
        within(screen.getByTestId('breakdown-card')).queryByRole('button', {
          name: /Reset|Select all/,
        }),
      ).toBeNull();
    });

    it('still shows the toolbar when there is nothing to list', () => {
      renderCard({ breakdown: makeEmptyBreakdown() });
      expect(screen.getByTestId('breakdown-toolbar')).toBeInTheDocument();
    });

    it('offers Select all when every funding source is deselected (an old URL)', async () => {
      const user = userEvent.setup();
      renderCard(
        { breakdown: makeBreakdown() },
        '/budget/overview?deselectedSources=bs-a,bs-b,unassigned',
      );
      expect(screen.getByText('Nothing matches these settings.')).toBeInTheDocument();
      expect(screen.queryByTestId('breakdown-table')).toBeNull();
      const card = screen.getByTestId('breakdown-card');
      await user.click(
        within(card).getAllByRole('button', { name: 'Select all' }).at(-1) as HTMLElement,
      );
      expect(search()).toBe('');
    });

    it('offers to reset the settings when nothing matches the payment basis', async () => {
      const user = userEvent.setup();
      const unpaid = makeBreakdown({
        lines: [makeBreakdown().lines[1]!],
        items: [],
        byArea: [],
        noArea: null,
        orphanLines: null,
        notYetSplit: null,
        byCategory: [],
        bySource: [],
        sourceOptions: [],
        hasUnassignedLines: false,
        total: figures(500),
        byType: makeEmptyBreakdown().byType,
      });
      renderCard(
        { breakdown: unpaid },
        '/budget/overview?paymentStatus=paid&estimate=low&grants=1',
      );
      expect(screen.getByText('Nothing matches these settings.')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Reset the breakdown settings' }));
      expect(search()).toBe('?grants=1');
    });

    it('does not offer Select all for a project without funding sources', () => {
      renderCard({ breakdown: makeEmptyBreakdown({ lines: [makeBreakdown().lines[3]!] }) });
      expect(
        screen.queryByText('Costs appear here once tasks or purchases have cost lines.'),
      ).toBeNull();
      expect(screen.getByText('Nothing matches these settings.')).toBeInTheDocument();
    });
  });

  describe('load failure', () => {
    it('shows only the heading when no breakdown and no error are given', () => {
      renderCard({ breakdown: null });
      const card = screen.getByRole('region', { name: 'Breakdown' });
      expect(within(card).getByRole('heading', { name: 'Breakdown' })).toBeInTheDocument();
      expect(screen.queryByTestId('breakdown-toolbar')).toBeNull();
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('shows the error and a Retry button that calls back', async () => {
      const user = userEvent.setup();
      const onRetry = jest.fn();
      renderCard({
        breakdown: null,
        loadError: { message: 'The breakdown could not be refreshed. Please try again.', onRetry },
      });
      expect(screen.getByRole('alert')).toHaveTextContent(
        'The breakdown could not be refreshed. Please try again.',
      );
      expect(screen.queryByTestId('breakdown-table')).toBeNull();
      await user.click(screen.getByRole('button', { name: 'Retry' }));
      expect(onRetry).toHaveBeenCalledTimes(1);
    });
  });
});
