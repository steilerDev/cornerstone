/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, beforeAll, afterEach } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { routeUrl } from '@cornerstone/shared';
import type { BudgetBreakdown, BudgetOverviewResponse, MoneySummary } from '@cornerstone/shared';
import { LocaleProvider } from '../../contexts/LocaleContext.js';
import { RecordingRouter, createRouterLog } from '../../test/recordingRouter.js';
import type { RouterLog } from '../../test/recordingRouter.js';
import { installMatchMedia } from '../../test/matchMediaControl.js';
import type { MatchMediaControl } from '../../test/matchMediaControl.js';
import { findDuplicateTestIds } from '../../test/findDuplicateTestIds.js';
import {
  figures,
  makeBreakdown,
  makeEmptyBreakdown,
  makeMoney,
  range,
} from '../../test/breakdownFixtures.js';
import { ApiClientError } from '../../lib/apiClient.js';
import enErrors from '../../i18n/en/errors.json';
import type * as BudgetOverviewApiTypes from '../../lib/budgetOverviewApi.js';

const mockFetchOverview = jest.fn<typeof BudgetOverviewApiTypes.fetchBudgetOverviewResponse>();
const mockFetchBreakdown = jest.fn<typeof BudgetOverviewApiTypes.fetchBudgetBreakdown>();

jest.unstable_mockModule('../../lib/budgetOverviewApi.js', () => ({
  fetchBudgetOverviewResponse: mockFetchOverview,
  fetchBudgetBreakdown: mockFetchBreakdown,
  fetchBudgetOverview: jest.fn(),
}));

const WIDE = '(min-width: 768px)';
const OVERVIEW = { subsidySummary: makeSummary() };

function makeSummary(): BudgetOverviewResponse['overview']['subsidySummary'] {
  return {
    totalReductions: 0,
    activeSubsidyCount: 0,
    minTotalPayback: 0,
    maxTotalPayback: 0,
    oversubscribedSubsidies: [],
  };
}

const respOf = (money: MoneySummary = makeMoney()): BudgetOverviewResponse => ({
  overview: OVERVIEW,
  money,
});

let BudgetOverviewPage: React.ComponentType;
let log: RouterLog;
let media: MatchMediaControl;

beforeAll(async () => {
  ({ default: BudgetOverviewPage } = await import('./BudgetOverviewPage.js'));
});

beforeEach(() => {
  mockFetchOverview.mockReset();
  mockFetchBreakdown.mockReset();
  mockFetchOverview.mockResolvedValue(respOf());
  mockFetchBreakdown.mockResolvedValue(makeBreakdown());
  media = installMatchMedia({ [WIDE]: true });
});

afterEach(() => {
  media.restore();
  jest.restoreAllMocks();
});

function renderPage(url = '/budget/overview') {
  log = createRouterLog();
  return render(
    <LocaleProvider>
      <RecordingRouter entries={[url]} log={log}>
        <BudgetOverviewPage />
      </RecordingRouter>
    </LocaleProvider>,
  );
}

/** Renders and waits for the first load to finish. */
async function renderLoaded(url?: string) {
  const view = renderPage(url);
  await screen.findByTestId('money-headline');
  return view;
}

const currentUrl = () => log.entries[log.index];
const text = (id: string) => screen.getByTestId(id).textContent;

/** A promise the test settles by hand. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('BudgetOverviewPage', () => {
  describe('structure', () => {
    it('has the h1 "Money", the document title, and no primary action', async () => {
      await renderLoaded();
      expect(screen.getByRole('heading', { level: 1, name: 'Money' })).toBeInTheDocument();
      expect(document.title).toContain('Money');
      expect(screen.queryByTestId('budget-overview-add-button')).toBeNull();
      expect(screen.queryByRole('button', { name: /^(add|new)\b/i })).toBeNull();
    });

    it('fetches the overview and the breakdown once, in parallel, on load', async () => {
      const overview = deferred<BudgetOverviewResponse>();
      mockFetchOverview.mockReturnValueOnce(overview.promise);
      renderPage();
      expect(mockFetchOverview).toHaveBeenCalledTimes(1);
      expect(mockFetchBreakdown).toHaveBeenCalledTimes(1);
      expect(mockFetchBreakdown).toHaveBeenCalledWith(undefined);
      overview.resolve(respOf());
      await screen.findByTestId('money-headline');
      expect(mockFetchOverview).toHaveBeenCalledTimes(1);
    });

    it('lays out headline, facts, funding and breakdown in that order', async () => {
      await renderLoaded();
      const order = ['money-headline', 'money-summary', 'money-funding', 'breakdown-card'].map(
        (id) => screen.getByTestId(id),
      );
      for (let i = 1; i < order.length; i += 1) {
        expect(
          order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
      }
    });

    it('has no duplicate test ids', async () => {
      const { container } = await renderLoaded();
      expect(findDuplicateTestIds(container)).toEqual([]);
    });

    it('mounts the phone drill-down list next to the table and a five-column fact strip', async () => {
      await renderLoaded();
      expect(screen.getByTestId('breakdown-table')).toBeInTheDocument();
      expect(screen.getByTestId('breakdown-list')).toBeInTheDocument();
      expect(screen.getByTestId('money-summary').querySelector('dl')).toHaveAttribute(
        'data-columns',
        '5',
      );
    });

    it('uses none of the retired words, even with every row expanded', async () => {
      await renderLoaded();
      act(() => {
        window.dispatchEvent(new Event('beforeprint'));
      });
      const content = document.body.textContent ?? '';
      for (const word of [
        /Remaining budget/,
        /Headroom/,
        /Available funds/,
        /Cost Basis/,
        /Outstanding/,
        /\bMin\b/,
        /\bAvg\b/,
        /\bMax\b/,
        /Payback/,
        /\bNet\b/,
        /Subsidies/,
        /Work Items/,
        /Household Items/,
        /Quoted/,
        /invoiced/,
        /Untitled/,
      ]) {
        expect(content).not.toMatch(word);
      }
    });
  });

  describe('page actions menu', () => {
    it('lists Print and the bank overview', async () => {
      const user = userEvent.setup();
      await renderLoaded();
      await user.click(screen.getByRole('button', { name: 'Page actions' }));
      const menu = screen.getByRole('menu');
      expect(
        within(menu)
          .getAllByRole('menuitem')
          .map((i) => i.textContent),
      ).toEqual(['Print', 'Budget overview for the bank']);
    });

    it('prints with the browser dialog', async () => {
      const user = userEvent.setup();
      const print = jest.spyOn(window, 'print').mockImplementation(() => undefined);
      await renderLoaded();
      await user.click(screen.getByRole('button', { name: 'Page actions' }));
      await user.click(screen.getByTestId('money-action-print'));
      expect(print).toHaveBeenCalledTimes(1);
    });

    it('opens the bank report with the budget overview preset', async () => {
      const user = userEvent.setup();
      await renderLoaded();
      await user.click(screen.getByRole('button', { name: 'Page actions' }));
      const link = screen.getByTestId('money-action-bank-overview');
      expect(link).toHaveAttribute('href', '/budget/reports?type=budget-overview');
      expect(link).toHaveAttribute(
        'href',
        routeUrl('bankReport', undefined, { type: 'budget-overview' }),
      );
      await user.click(link);
      expect(currentUrl()).toBe('/budget/reports?type=budget-overview');
      expect(log.actions[log.actions.length - 1]).toMatch(/^PUSH /);
    });
  });

  describe('loading and errors', () => {
    it('shows a Loading Money skeleton and keeps the actions menu', () => {
      mockFetchOverview.mockReturnValue(new Promise(() => {}));
      renderPage();
      expect(screen.getByRole('status')).toHaveAccessibleName('Loading Money');
      expect(screen.getByRole('heading', { level: 1, name: 'Money' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Page actions' })).toBeInTheDocument();
      expect(screen.queryByTestId('money-headline')).toBeNull();
    });

    it('is page-shaped: one named status, with every inner skeleton hidden from assistive tech', () => {
      mockFetchOverview.mockReturnValue(new Promise(() => {}));
      renderPage();
      const status = screen.getByRole('status', { name: 'Loading Money' });
      expect(screen.getAllByRole('status')).toHaveLength(1);
      expect(status).toHaveAttribute('aria-busy', 'true');
      const hidden = status.querySelectorAll(':scope > [aria-hidden="true"]');
      // headline card, 5 facts (one wrapper), funding card, breakdown card
      expect(hidden).toHaveLength(4);
      const factsWrap = hidden[1]!;
      expect(factsWrap.children).toHaveLength(5);
      expect(hidden[0]!.children).toHaveLength(1);
      // every skeleton lives inside an aria-hidden wrapper
      status.querySelectorAll('[role="status"]').forEach((el) => {
        expect(el.closest('[aria-hidden="true"]')).not.toBeNull();
      });
    });

    it('shows a translated message for an API error and never the raw server text', async () => {
      mockFetchOverview.mockRejectedValue(
        new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'RAW-SERVER-SENTINEL' }),
      );
      renderPage();
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(enErrors.INTERNAL_ERROR);
      expect(alert.textContent).not.toContain('RAW-SERVER-SENTINEL');
      expect(screen.getByRole('button', { name: 'Page actions' })).toBeInTheDocument();
    });

    it('shows the generic message for any other failure, not the thrown text', async () => {
      mockFetchOverview.mockRejectedValue(new Error('socket hang up'));
      renderPage();
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('Money could not be loaded. Please try again.');
      expect(alert.textContent).not.toContain('socket hang up');
    });

    it('retries both fetches from the error card', async () => {
      const user = userEvent.setup();
      mockFetchOverview.mockRejectedValueOnce(new Error('down'));
      renderPage();
      await screen.findByRole('alert');
      await user.click(screen.getByRole('button', { name: 'Retry' }));
      await screen.findByTestId('money-headline');
      expect(mockFetchOverview).toHaveBeenCalledTimes(2);
      expect(mockFetchBreakdown).toHaveBeenCalledTimes(2);
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('still shows the overview when only the breakdown fails, with an error and Retry in its card', async () => {
      const user = userEvent.setup();
      mockFetchBreakdown.mockRejectedValueOnce(new Error('down'));
      renderPage();
      await screen.findByTestId('money-headline');
      const card = screen.getByTestId('breakdown-card');
      expect(within(card).getByRole('alert')).toHaveTextContent(
        'The breakdown could not be refreshed. Please try again.',
      );
      expect(within(card).queryByTestId('breakdown-table')).toBeNull();
      await user.click(within(card).getByRole('button', { name: 'Retry' }));
      await waitFor(() => expect(screen.getByTestId('breakdown-table')).toBeInTheDocument());
      expect(mockFetchBreakdown).toHaveBeenCalledTimes(2);
      expect(mockFetchOverview).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('keeps the error in the breakdown card when its retry fails too', async () => {
      const user = userEvent.setup();
      mockFetchBreakdown.mockRejectedValue(new Error('down'));
      renderPage();
      await screen.findByTestId('money-headline');
      await user.click(
        within(screen.getByTestId('breakdown-card')).getByRole('button', { name: 'Retry' }),
      );
      await waitFor(() => expect(mockFetchBreakdown).toHaveBeenCalledTimes(2));
      expect(within(screen.getByTestId('breakdown-card')).getByRole('alert')).toBeInTheDocument();
      expect(screen.queryByTestId('breakdown-table')).toBeNull();
    });

    it('fails the whole page when the overview fails even if the breakdown loaded', async () => {
      mockFetchOverview.mockRejectedValue(new Error('down'));
      renderPage();
      await screen.findByRole('alert');
      expect(screen.queryByTestId('breakdown-card')).toBeNull();
    });
  });

  describe('headline', () => {
    it('shows the Left to spend figure alone in its element, with the verdict and range', async () => {
      await renderLoaded();
      expect(text('money-headline-figure')).toBe('€1,200.00');
      expect(screen.getByTestId('money-headline-figure')).toHaveAttribute(
        'data-figure',
        'left-to-spend',
      );
      expect(screen.getByTestId('money-headline-verdict-badge')).toHaveTextContent(/on budget/i);
      expect(text('money-headline-range')).toBe('Range +€900.00 to +€1,500.00');
      expect(screen.getByRole('heading', { level: 2, name: 'Left to spend' })).toBeInTheDocument();
    });

    it('carries exactly one left-to-spend figure on the page', async () => {
      const { container } = await renderLoaded();
      expect(container.querySelectorAll('[data-figure="left-to-spend"]')).toHaveLength(1);
    });

    it('marks a negative figure and shows its sign', async () => {
      mockFetchOverview.mockResolvedValue(
        respOf(
          makeMoney({
            leftToSpend: { expected: -300, best: 100, worst: -800, verdict: 'over_budget' },
          }),
        ),
      );
      await renderLoaded();
      expect(screen.getByTestId('money-headline-figure')).toHaveAttribute('data-negative', 'true');
      expect(text('money-headline-figure')).toMatch(/^[-−]€300\.00$/);
      expect(text('money-headline-range')).toMatch(/to \+€100\.00$/);
    });

    it('does not mark a positive or zero figure as negative', async () => {
      mockFetchOverview.mockResolvedValue(
        respOf(
          makeMoney({ leftToSpend: { expected: 0, best: 0, worst: 0, verdict: 'on_budget' } }),
        ),
      );
      await renderLoaded();
      expect(screen.getByTestId('money-headline-figure')).not.toHaveAttribute('data-negative');
    });

    it('shows an en dash named "No figure yet" and the setup hint when there is no verdict', async () => {
      mockFetchOverview.mockResolvedValue(
        respOf(makeMoney({ leftToSpend: { expected: 0, best: 0, worst: 0, verdict: null } })),
      );
      await renderLoaded();
      const figure = screen.getByTestId('money-headline-figure');
      expect(figure).toHaveAttribute('role', 'img');
      expect(figure).toHaveAccessibleName('No figure yet');
      expect(screen.getByText('Add a funding source and a cost to see this.')).toBeInTheDocument();
      expect(screen.queryByTestId('money-headline-range')).toBeNull();
      expect(screen.queryByTestId('money-headline-verdict')).toBeNull();
    });

    it('adds "Whole project" to the label only while the breakdown settings are not the default', async () => {
      await renderLoaded();
      expect(screen.getByRole('heading', { name: 'Left to spend' })).not.toHaveTextContent(
        'Whole project',
      );
      const user = userEvent.setup();
      await user.click(screen.getByTestId('breakdown-payment-paid'));
      expect(screen.getByRole('heading', { name: /Left to spend/ })).toHaveTextContent(
        'Left to spend Whole project',
      );
      await user.click(screen.getByTestId('breakdown-payment-all'));
      expect(screen.getByRole('heading', { name: 'Left to spend' })).not.toHaveTextContent(
        'Whole project',
      );
    });

    it('does not change the figure when the breakdown settings change', async () => {
      const user = userEvent.setup();
      await renderLoaded();
      await user.click(screen.getByTestId('breakdown-estimate-low'));
      expect(text('money-headline-figure')).toBe('€1,200.00');
    });

    it('opens "How is this calculated?" and keeps focus on the toggle', async () => {
      const user = userEvent.setup();
      await renderLoaded();
      const toggle = screen.getByRole('button', { name: 'How is this calculated?' });
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      expect(screen.getByTestId('money-headline-explain')).toHaveAttribute('hidden');
      await user.click(toggle);
      expect(toggle).toHaveAttribute('aria-expanded', 'true');
      expect(toggle).toHaveFocus();
      const panel = screen.getByTestId('money-headline-explain');
      expect(panel).not.toHaveAttribute('hidden');
      expect(panel).toHaveTextContent('Funding total plus Expected grants minus Expected cost.');
      expect(panel).toHaveTextContent('The range runs from the lowest to the highest estimate.');
    });

    it('names the grants that count only up to their cap, and only those', async () => {
      const grant = (id: string, name: string, counted: boolean, capped: boolean) =>
        ({
          id,
          name,
          status: 'approved',
          reductionType: 'percentage',
          rate: 10,
          eligibleCostCap: 500,
          eligibleItemCount: 1,
          eligibleCost: range(100),
          uncappedPayout: range(100),
          expected: range(50),
          capped,
          counted,
        }) as MoneySummary['grants'][number];
      mockFetchOverview.mockResolvedValue(
        respOf(
          makeMoney({
            grants: [
              grant('g1', 'Sample energy grant', true, true),
              grant('g2', 'Sample roof grant', true, false),
              grant('g3', 'Sample pending grant', false, true),
            ],
          }),
        ),
      );
      await renderLoaded();
      const panel = screen.getByTestId('money-headline-explain');
      expect(panel).toHaveTextContent('These grants count only up to their eligible-costs cap:');
      const items = within(panel).getAllByRole('listitem', { hidden: true });
      expect(items.map((i) => i.textContent)).toEqual(['Sample energy grant']);
      expect(items[0]!.className).toContain('userText');
    });

    it('omits the cap note when no counted grant is capped', async () => {
      await renderLoaded();
      expect(screen.getByTestId('money-headline-explain')).not.toHaveTextContent(
        'eligible-costs cap',
      );
    });
  });

  describe('facts', () => {
    it('shows Funding total, Expected cost and Expected grants as static values', async () => {
      await renderLoaded();
      expect(text('money-fact-funding-total')).toContain('€10,000.00');
      expect(text('money-fact-expected-cost')).toContain('€2,900.00');
      expect(text('money-fact-expected-grants')).toContain('€150.00');
      for (const id of ['funding-total', 'expected-cost', 'expected-grants']) {
        const fact = screen.getByTestId(`money-fact-${id}`);
        expect(fact.closest('a')).toBeNull();
        expect(fact.closest('button')).toBeNull();
        expect(fact.querySelector('a, button')).toBeNull();
      }
    });

    it('links Paid to the invoices page and marks it as a Paid figure', async () => {
      const user = userEvent.setup();
      await renderLoaded();
      const strip = screen.getByTestId('money-summary');
      expect(strip.querySelector('[data-figure="paid"]')).toHaveTextContent('€1,350.00');
      const link = screen.getByTestId('money-fact-paid');
      expect(link).toHaveAttribute('href', '/budget/invoices');
      await user.click(link);
      expect(currentUrl()).toBe('/budget/invoices');
    });

    it('links Still to pay to the open invoices and marks it as a Still to pay figure', async () => {
      const user = userEvent.setup();
      await renderLoaded();
      const strip = screen.getByTestId('money-summary');
      expect(strip.querySelector('[data-figure="still-to-pay"]')).toHaveTextContent('€700.00');
      const link = screen.getByTestId('money-fact-still-to-pay');
      expect(link).toHaveAttribute('href', '/budget/invoices?openOnly=true');
      await user.click(link);
      expect(currentUrl()).toBe('/budget/invoices?openOnly=true');
    });

    it('carries the page as the origin of a fact link', async () => {
      const user = userEvent.setup();
      await renderLoaded();
      await user.click(screen.getByTestId('money-fact-paid'));
      const state = log.states[log.states.length - 1] as { origin?: { to: string } } | null;
      expect(state?.origin?.to).toContain('/budget/overview');
    });

    it('shows formatted zeros as zeros, never as a dash', async () => {
      mockFetchOverview.mockResolvedValue(
        respOf(
          makeMoney({
            fundingTotal: 0,
            expectedCost: range(0),
            expectedGrants: range(0),
            paid: 0,
            stillToPay: 0,
            sources: [],
          }),
        ),
      );
      await renderLoaded();
      expect(text('money-fact-paid')).toContain('€0.00');
      expect(text('money-fact-still-to-pay')).toContain('€0.00');
      expect(text('money-fact-funding-total')).toContain('€0.00');
    });

    it('stays whole-project when the breakdown settings change', async () => {
      const user = userEvent.setup();
      await renderLoaded();
      await user.click(screen.getByTestId('breakdown-payment-paid'));
      await user.click(screen.getByTestId('breakdown-estimate-high'));
      expect(text('money-fact-expected-cost')).toContain('€2,900.00');
      expect(text('money-fact-paid')).toContain('€1,350.00');
    });
  });

  describe('funding', () => {
    it('shows Allocated x of y for each source and the over-allocation only where there is one', async () => {
      await renderLoaded();
      const savings = screen.getByTestId('money-funding-row-bs-a');
      expect(savings).toHaveTextContent('Savings');
      expect(savings).toHaveTextContent('Allocated €1,400.00 of €6,000.00');
      expect(within(savings).queryByTestId('budget-bar-overflow-note')).toBeNull();
      const loan = screen.getByTestId('money-funding-row-bs-b');
      expect(loan).toHaveTextContent('€500.00 of €400.00');
      expect(within(loan).getByTestId('budget-bar-overflow-note')).toHaveTextContent(
        'Over-allocated by €100.00',
      );
    });

    it('offers to add the first funding source when there are none', async () => {
      mockFetchOverview.mockResolvedValue(respOf(makeMoney({ sources: [] })));
      await renderLoaded();
      expect(screen.getByText('No funding sources added yet')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Add your first funding source' })).toHaveAttribute(
        'href',
        routeUrl('budgetSources'),
      );
    });
  });

  describe('URL settings', () => {
    it('opens on the settings in the URL', async () => {
      await renderLoaded('/budget/overview?by=source&paymentStatus=paid&estimate=high&grants=1');
      expect(screen.getByTestId('breakdown-view-source')).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByTestId('breakdown-payment-paid')).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByTestId('breakdown-estimate-high')).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('heading', { level: 2, name: /Left to spend/ })).toHaveTextContent(
        'Whole project',
      );
    });

    it('treats an absent param as the default and does not touch the URL', async () => {
      await renderLoaded();
      expect(screen.getByTestId('breakdown-view-area')).toHaveAttribute('aria-pressed', 'true');
      expect(log.actions).toEqual([]);
    });

    it('drops unknown values with a replace', async () => {
      await renderLoaded('/budget/overview?by=nope&paymentStatus=nope&estimate=nope&grants=nope');
      expect(currentUrl()).toBe('/budget/overview');
      expect(log.actions.every((a) => a.startsWith('REPLACE '))).toBe(true);
      expect(screen.getByTestId('breakdown-view-area')).toHaveAttribute('aria-pressed', 'true');
    });

    it('writes every setting with a replace and keeps the other params', async () => {
      const user = userEvent.setup();
      await renderLoaded('/budget/overview?keep=1');
      await user.click(screen.getByTestId('breakdown-view-type'));
      await user.click(screen.getByTestId('breakdown-payment-outstanding'));
      await user.click(screen.getByTestId('breakdown-estimate-low'));
      expect(currentUrl()).toBe(
        '/budget/overview?keep=1&by=type&paymentStatus=outstanding&estimate=low',
      );
      expect(log.actions.every((a) => a.startsWith('REPLACE '))).toBe(true);
      expect(log.entries).toHaveLength(1);
    });

    it('does not refetch the breakdown when view, payment, estimate or grants change', async () => {
      const user = userEvent.setup();
      await renderLoaded();
      await user.click(screen.getByTestId('breakdown-view-category'));
      await user.click(screen.getByTestId('breakdown-payment-paid'));
      await user.click(screen.getByTestId('breakdown-payment-all'));
      await user.click(screen.getByTestId('breakdown-estimate-high'));
      await user.click(screen.getByRole('button', { name: 'Grants' }));
      await act(async () => {
        await new Promise((r) => setTimeout(r, 120));
      });
      expect(mockFetchBreakdown).toHaveBeenCalledTimes(1);
      expect(mockFetchOverview).toHaveBeenCalledTimes(1);
    });

    it('loads the first breakdown with the deselected sources from the URL and does not refetch', async () => {
      await renderLoaded('/budget/overview?deselectedSources=unassigned,bs-b');
      expect(mockFetchBreakdown).toHaveBeenCalledWith(['bs-b', 'unassigned']);
      await act(async () => {
        await new Promise((r) => setTimeout(r, 120));
      });
      expect(mockFetchBreakdown).toHaveBeenCalledTimes(1);
    });
  });

  describe('funding source filter', () => {
    const deselect = async (user: ReturnType<typeof userEvent.setup>, key: string) => {
      await user.click(screen.getByTestId('breakdown-sources-button'));
      await user.click(screen.getByTestId(`breakdown-source-${key}`));
    };

    it('shows the chip with "n of N" and refetches with deselectedSources after a deselect', async () => {
      const user = userEvent.setup();
      await renderLoaded();
      expect(screen.getByTestId('breakdown-sources-button')).toHaveTextContent('3 of 3');
      await deselect(user, 'bs-b');
      expect(currentUrl()).toBe('/budget/overview?deselectedSources=bs-b');
      await waitFor(() => expect(mockFetchBreakdown).toHaveBeenCalledTimes(2));
      expect(mockFetchBreakdown).toHaveBeenLastCalledWith(['bs-b']);
      expect(screen.getByTestId('breakdown-sources-button')).toHaveTextContent('2 of 3');
    });

    it('marks the card busy while refetching and announces the result afterwards', async () => {
      const user = userEvent.setup();
      await renderLoaded();
      const pending = deferred<BudgetBreakdown>();
      mockFetchBreakdown.mockReturnValueOnce(pending.promise);
      await deselect(user, 'bs-b');
      await waitFor(() =>
        expect(screen.getByTestId('breakdown-card')).toHaveAttribute('aria-busy', 'true'),
      );
      expect(screen.getByTestId('breakdown-status')).toHaveTextContent('');
      const filtered = makeBreakdown({ total: figures(2400) });
      await act(async () => {
        pending.resolve(filtered);
      });
      await waitFor(() =>
        expect(screen.getByTestId('breakdown-card')).toHaveAttribute('aria-busy', 'false'),
      );
      expect(screen.getByTestId('breakdown-status')).toHaveTextContent(
        '2 of 3 funding sources shown. Expected cost €2,400.00.',
      );
      expect(screen.getByTestId('breakdown-total-expectedCost')).toHaveTextContent('€2,400.00');
    });

    it('announces in the chosen estimate', async () => {
      const user = userEvent.setup();
      await renderLoaded('/budget/overview?estimate=high');
      mockFetchBreakdown.mockResolvedValueOnce(
        makeBreakdown({ total: figures(2400, { worst: 2600 }) }),
      );
      await deselect(user, 'bs-b');
      await waitFor(() =>
        expect(screen.getByTestId('breakdown-status')).toHaveTextContent('Expected cost €2,600.00'),
      );
    });

    it('announces "All funding sources shown" after selecting all again', async () => {
      const user = userEvent.setup();
      await renderLoaded('/budget/overview?deselectedSources=bs-b');
      mockFetchBreakdown.mockResolvedValueOnce(makeBreakdown());
      await user.click(screen.getByTestId('breakdown-sources-button'));
      await user.click(screen.getByRole('button', { name: 'Select all' }));
      await waitFor(() =>
        expect(screen.getByTestId('breakdown-status')).toHaveTextContent(
          'All funding sources shown. Expected cost €2,900.00.',
        ),
      );
      expect(mockFetchBreakdown).toHaveBeenLastCalledWith(undefined);
    });

    it('keeps the previous data and shows a dismissible banner when the refetch fails', async () => {
      const user = userEvent.setup();
      await renderLoaded();
      mockFetchBreakdown.mockRejectedValueOnce(new Error('down'));
      await deselect(user, 'bs-b');
      const banner = await screen.findByRole('alert');
      expect(banner).toHaveTextContent('The breakdown could not be refreshed. Please try again.');
      expect(screen.getByTestId('breakdown-total-expectedCost')).toHaveTextContent('€2,900.00');
      expect(screen.getByTestId('breakdown-card')).toHaveAttribute('aria-busy', 'false');
      await user.click(within(banner).getByRole('button', { name: 'Dismiss' }));
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('clears the banner after a later refetch succeeds', async () => {
      const user = userEvent.setup();
      await renderLoaded();
      mockFetchBreakdown.mockRejectedValueOnce(new Error('down'));
      await deselect(user, 'bs-b');
      await screen.findByRole('alert');
      mockFetchBreakdown.mockResolvedValueOnce(makeBreakdown());
      await user.click(screen.getByTestId('breakdown-source-unassigned'));
      await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    });

    it('ignores the answer of a request that a newer deselect replaced', async () => {
      const user = userEvent.setup();
      await renderLoaded();
      const first = deferred<BudgetBreakdown>();
      const second = deferred<BudgetBreakdown>();
      mockFetchBreakdown.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
      await deselect(user, 'bs-b');
      await waitFor(() => expect(mockFetchBreakdown).toHaveBeenCalledTimes(2));
      await user.click(screen.getByTestId('breakdown-source-unassigned'));
      await waitFor(() => expect(mockFetchBreakdown).toHaveBeenCalledTimes(3));
      expect(mockFetchBreakdown).toHaveBeenLastCalledWith(['bs-b', 'unassigned']);
      await act(async () => {
        second.resolve(makeBreakdown({ total: figures(1111) }));
      });
      await act(async () => {
        first.resolve(makeBreakdown({ total: figures(9999) }));
      });
      expect(screen.getByTestId('breakdown-total-expectedCost')).toHaveTextContent('€1,111.00');
      expect(screen.getByTestId('breakdown-status')).toHaveTextContent(
        '1 of 3 funding sources shown. Expected cost €1,111.00.',
      );
    });

    it('sends one request for two deselects made within the debounce window', async () => {
      await renderLoaded();
      fireEvent.click(screen.getByTestId('breakdown-sources-button'));
      fireEvent.click(await screen.findByTestId('breakdown-source-bs-b'));
      fireEvent.click(screen.getByTestId('breakdown-source-unassigned'));
      await waitFor(() => expect(mockFetchBreakdown).toHaveBeenCalledTimes(2));
      await act(async () => {
        await new Promise((r) => setTimeout(r, 120));
      });
      expect(mockFetchBreakdown).toHaveBeenCalledTimes(2);
      expect(mockFetchBreakdown).toHaveBeenLastCalledWith(['bs-b', 'unassigned']);
    });

    it('does not fetch a stale key when a source is switched off and on again within the debounce window', async () => {
      await renderLoaded();
      fireEvent.click(screen.getByTestId('breakdown-sources-button'));
      fireEvent.click(await screen.findByTestId('breakdown-source-bs-b'));
      fireEvent.click(screen.getByTestId('breakdown-source-bs-b'));
      expect(currentUrl()).toBe('/budget/overview');
      await act(async () => {
        await new Promise((r) => setTimeout(r, 150));
      });
      expect(mockFetchBreakdown).toHaveBeenCalledTimes(1);
    });
  });

  describe('print', () => {
    it('summarises the settings in one line for the printout', async () => {
      await renderLoaded();
      expect(text('money-print-summary')).toBe(
        'View: Area · Payment: All · Estimates: Expected · Funding sources: 3 of 3',
      );
    });

    it('names the chosen settings, the Grants column and the selected sources', async () => {
      await renderLoaded('/budget/overview?by=source&estimate=low&grants=1&deselectedSources=bs-b');
      expect(text('money-print-summary')).toBe(
        'View: Funding source · Payment: All · Estimates: Low · Columns: Grants · Funding sources: 2 of 3',
      );
    });

    it('leaves out the Grants column under a payment basis that has none', async () => {
      await renderLoaded('/budget/overview?paymentStatus=outstanding&grants=1');
      expect(text('money-print-summary')).toBe(
        'View: Area · Payment: Not yet paid · Estimates: Expected · Funding sources: 3 of 3',
      );
    });

    it('expands every breakdown row when the browser prints', async () => {
      await renderLoaded();
      expect(screen.getByTestId('breakdown-row-line:l-1')).toHaveAttribute('hidden');
      act(() => {
        window.dispatchEvent(new Event('beforeprint'));
      });
      expect(screen.getByTestId('breakdown-row-line:l-1')).not.toHaveAttribute('hidden');
    });

    it('shows a zero source count while the breakdown is still missing', async () => {
      mockFetchBreakdown.mockRejectedValue(new Error('down'));
      await renderLoaded();
      expect(text('money-print-summary')).toContain('Funding sources: 0 of 0');
    });
  });

  describe('empty project', () => {
    it('always shows the headline, facts, funding and breakdown, with a breakdown empty state', async () => {
      mockFetchOverview.mockResolvedValue(
        respOf(
          makeMoney({
            leftToSpend: { expected: 0, best: 0, worst: 0, verdict: null },
            sources: [],
          }),
        ),
      );
      mockFetchBreakdown.mockResolvedValue(makeEmptyBreakdown());
      const { container } = await renderLoaded();
      expect(screen.getByTestId('money-summary')).toBeInTheDocument();
      expect(screen.getByTestId('money-funding')).toBeInTheDocument();
      expect(
        screen.getByText('Costs appear here once tasks or purchases have cost lines.'),
      ).toBeInTheDocument();
      expect(container.querySelectorAll('[data-figure="left-to-spend"]')).toHaveLength(1);
    });
  });
});
