/**
 * @jest-environment jsdom
 *
 * The funding source page (#2242, S10, AC8). Module boundaries: the API functions, the Documents
 * host, the Details section (own test) and the move dialog. Header, strip, tabs, bar, cost panel,
 * History and the delete dialog are real.
 *
 * Mutations these tests catch:
 *  - D2: the wrong primary for a type or status (a loan not leading with Prepare bank report; a
 *    savings source without Log once closed);
 *  - Own funds offering Delete, or showing a rate fact;
 *  - the warning shown without an over-allocation, or "Move lines..." selecting nothing / pre-selecting lines;
 *  - Delete treating a 409 as retryable, or success not replacing to Financing with a toast;
 *  - a move not clearing the selection and refreshing the lines and the record;
 *  - History asking for another object than budget_source:<id>.
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import type {
  BudgetSource,
  BudgetSourceBudgetLinesResponse,
  BudgetSourceDetailResponse,
  BudgetSourceStatus,
  BudgetSourceType,
  MoneySourceFigures,
} from '@cornerstone/shared';
import { ApiClientError } from '../../lib/apiClient.js';
import i18n from '../../i18n/index.js';
import * as statusChangeActual from '../../lib/statusChangeApi.js';
import { installMatchMedia } from '../../test/matchMediaControl.js';
import type { MatchMediaControl } from '../../test/matchMediaControl.js';
import type * as PageModule from './FundingSourcePage.js';

// ─── Module boundaries ───────────────────────────────────────────────────────

// A static locale: the real provider re-syncs the language after mount, which re-creates `t` and
// makes the record load again.
jest.unstable_mockModule('../../contexts/LocaleContext.js', () => {
  const localeValue = {
    locale: 'en',
    resolvedLocale: 'en',
    currency: 'EUR',
    vatRate: 0.19,
    setLocale: jest.fn(),
    syncWithServer: jest.fn(),
  };
  return {
    LocaleProvider: ({ children }: { children: unknown }) => children,
    useLocale: () => localeValue,
  };
});

const mockFetchBudgetSource = jest.fn<(id: string) => Promise<BudgetSourceDetailResponse>>();
const mockFetchLines = jest.fn<(id: string) => Promise<BudgetSourceBudgetLinesResponse>>();
const mockDeleteSource = jest.fn<(id: string) => Promise<void>>();
jest.unstable_mockModule('../../lib/budgetSourcesApi.js', () => ({
  fetchBudgetSource: mockFetchBudgetSource,
  fetchBudgetLinesForSource: mockFetchLines,
  deleteBudgetSource: mockDeleteSource,
  updateBudgetSource: jest.fn(),
  fetchBudgetSources: jest.fn(async () => ({ budgetSources: [] })),
}));

const mockChangeStatus = jest.fn<(id: string, to: string) => Promise<unknown>>();
jest.unstable_mockModule('../../lib/statusChangeApi.js', () => ({
  ...statusChangeActual,
  changeFundingSourceStatus: mockChangeStatus,
}));
jest.unstable_mockModule('../../lib/undoApi.js', () => ({ undoChange: jest.fn() }));

const mockListHistory = jest.fn<(...a: unknown[]) => Promise<unknown>>();
jest.unstable_mockModule('../../lib/historyApi.js', () => ({ listHistory: mockListHistory }));
const mockFetchDeleteImpact = jest.fn<(...a: unknown[]) => Promise<unknown>>();
jest.unstable_mockModule('../../lib/deleteImpactApi.js', () => ({
  fetchDeleteImpact: mockFetchDeleteImpact,
}));

const mockRevertSubmission = jest.fn<(batchId: string) => Promise<unknown>>();
jest.unstable_mockModule('../../lib/sourceReportsApi.js', () => ({
  revertSubmission: mockRevertSubmission,
}));

const mockShowToast = jest.fn();
const mockShowUndoToast = jest.fn();
jest.unstable_mockModule('../../components/Toast/ToastContext.js', () => ({
  ToastProvider: ({ children }: { children: unknown }) => children,
  useToast: () => ({
    toasts: [],
    showToast: mockShowToast,
    showUndoToast: mockShowUndoToast,
    dismissToast: jest.fn(),
  }),
}));

const mockFocusHeading = jest.fn<() => () => void>(() => () => {});
jest.unstable_mockModule('../../lib/focusPageHeading.js', () => ({
  focusPageHeading: jest.fn(),
  focusPageHeadingWhenReady: mockFocusHeading,
}));

let documentsFact: unknown = null;
jest.unstable_mockModule('../../components/DocumentsPanel/index.js', () => ({
  useDocumentsPanel: (entityType: string, entityId: string) => ({
    fact: documentsFact,
    panel: <div data-testid="documents-panel" data-type={entityType} data-id={entityId} />,
  }),
}));

let detailsProps: { source: BudgetSource; onSaved: () => Promise<unknown> } | null = null;
jest.unstable_mockModule('./FundingSourceDetailsSection.js', () => ({
  FundingSourceDetailsSection: (props: NonNullable<typeof detailsProps>) => {
    detailsProps = props;
    return (
      <div data-testid="source-details" data-source={props.source.id}>
        <button type="button" onClick={() => void props.onSaved()}>
          details-saved
        </button>
      </div>
    );
  },
}));

interface MoveProps {
  sourceId: string;
  sourceName: string;
  claimedCount: number;
  workItemBudgetIds: string[];
  householdItemBudgetIds: string[];
  selectedLineIds: Set<string>;
  onClose: () => void;
  onSuccess: (count: number, targetName: string) => void;
}
jest.unstable_mockModule('../../components/MassMoveModal/MassMoveModal.js', () => ({
  MassMoveModal: (props: MoveProps) => (
    <div
      role="dialog"
      aria-label="move-probe"
      data-claimed={props.claimedCount}
      data-work={props.workItemBudgetIds.join(',')}
      data-household={props.householdItemBudgetIds.join(',')}
    >
      <button type="button" onClick={props.onClose}>
        move-close
      </button>
      <button
        type="button"
        onClick={() => props.onSuccess(props.selectedLineIds.size, 'Savings Beta')}
      >
        move-done
      </button>
    </div>
  ),
}));

let FundingSourcePage: (typeof PageModule)['FundingSourcePage'];

// ─── Fixtures ────────────────────────────────────────────────────────────────

const ID = 'bs-1';

function money(over: Partial<MoneySourceFigures> = {}): MoneySourceFigures {
  return {
    id: ID,
    name: 'Loan Alpha',
    sourceType: 'bank_loan',
    status: 'active',
    isDiscretionary: false,
    amount: 50000,
    allocated: 30000,
    unallocated: 20000,
    overAllocated: 0,
    paid: 12000,
    submitted: 4000,
    readyToSubmit: { count: 2, amount: 6000 },
    ...over,
  } as MoneySourceFigures;
}

function record(
  over: Partial<BudgetSource> = {},
  figures: Partial<MoneySourceFigures> = {},
): BudgetSourceDetailResponse {
  return {
    budgetSource: {
      id: ID,
      name: 'Loan Alpha',
      sourceType: 'bank_loan' as BudgetSourceType,
      status: 'active' as BudgetSourceStatus,
      isDiscretionary: false,
      interestRate: 3.5,
      totalAmount: 50000,
      ...over,
    } as BudgetSource,
    money: money(figures),
  };
}

const line = (id: string, over: Record<string, unknown> = {}) =>
  ({
    id,
    parentId: `p-${id}`,
    parentName: `Item ${id}`,
    area: null,
    description: `Line ${id}`,
    plannedAmount: 100,
    confidence: 'own_estimate',
    actualCost: 0,
    invoiceCount: 0,
    invoiceLink: null,
    hasClaimedInvoice: false,
    createdAt: '2026-01-01T00:00:00Z',
    ...over,
  }) as never;

const lines = (
  work: unknown[] = [line('w1'), line('w2', { hasClaimedInvoice: true })],
  household: unknown[] = [line('h1')],
): BudgetSourceBudgetLinesResponse =>
  ({ workItemLines: work, householdItemLines: household }) as BudgetSourceBudgetLinesResponse;

let media: MatchMediaControl;

beforeEach(async () => {
  mockFetchBudgetSource.mockReset().mockResolvedValue(record());
  mockFetchLines.mockReset().mockResolvedValue(lines());
  mockDeleteSource.mockReset().mockResolvedValue(undefined);
  mockChangeStatus.mockReset().mockResolvedValue({ record: {}, undo: null });
  mockListHistory.mockReset().mockResolvedValue({
    items: [],
    pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 1 },
  });
  mockFetchDeleteImpact
    .mockReset()
    .mockResolvedValue({ entityType: 'budget_source', id: ID, effects: [] });
  mockRevertSubmission.mockReset();
  mockShowToast.mockReset();
  mockShowUndoToast.mockReset();
  mockFocusHeading.mockClear();
  documentsFact = null;
  detailsProps = null;
  media = installMatchMedia({ '(min-width: 768px)': true });
  ({ FundingSourcePage } = (await import('./FundingSourcePage.js')) as typeof PageModule);
});

afterEach(() => {
  media.restore();
});

function Where() {
  const location = useLocation();
  return <output data-testid="where">{`${location.pathname}${location.search}`}</output>;
}

function renderPage(entry = `/budget/financing/sources/${ID}`) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/budget/financing/sources/:id" element={<FundingSourcePage />} />
        <Route path="/budget/financing" element={<div>Financing Page</div>} />
        <Route path="*" element={<div>Elsewhere</div>} />
      </Routes>
      <Where />
    </MemoryRouter>,
  );
}

const loaded = () => screen.findByTestId('source-header');

describe('FundingSourcePage', () => {
  describe('states', () => {
    it('shows a skeleton under the generic title while loading', () => {
      mockFetchBudgetSource.mockReturnValue(new Promise(() => {}));
      renderPage();
      expect(screen.getByRole('heading', { level: 1, name: 'Funding source' })).toBeInTheDocument();
      expect(screen.queryByTestId('source-header')).toBeNull();
    });

    it('titles the page with the source name once loaded', async () => {
      renderPage();
      await loaded();
      expect(screen.getByRole('heading', { level: 1, name: 'Loan Alpha' })).toBeInTheDocument();
    });

    it('404 shows the not-found copy with Back to Financing and Try again', async () => {
      mockFetchBudgetSource.mockRejectedValue(
        new ApiClientError(404, { code: 'NOT_FOUND', message: 'x' }),
      );
      renderPage();

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'This funding source could not be found.',
      );
      await userEvent.click(screen.getByRole('button', { name: /Back to Financing/ }));
      expect(screen.getByTestId('where')).toHaveTextContent('/budget/financing');
    });

    it('a translated API error and a plain failure each show an alert; Try again loads again', async () => {
      mockFetchBudgetSource.mockRejectedValueOnce(
        new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'raw prose' }),
      );
      renderPage();
      expect(await screen.findByRole('alert')).not.toHaveTextContent('raw prose');

      await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

      await loaded();
      expect(mockFetchBudgetSource).toHaveBeenCalledTimes(2);
    });

    it('a failure that is not an API error shows the fixed copy', async () => {
      mockFetchBudgetSource.mockRejectedValueOnce(new Error('offline'));
      renderPage();
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'The funding source could not be loaded.',
      );
    });

    it('redirects to Financing when the route has no id', async () => {
      render(
        <MemoryRouter initialEntries={['/x']}>
          <Routes>
            <Route path="/x" element={<FundingSourcePage />} />
            <Route path="/budget/financing" element={<div>Financing Page</div>} />
          </Routes>
        </MemoryRouter>,
      );
      expect(await screen.findByText('Financing Page')).toBeInTheDocument();
    });
  });

  describe('a language change (#2242)', () => {
    afterEach(async () => {
      await act(async () => {
        await i18n.changeLanguage('en');
      });
    });

    it('re-renders without loading the record or the lines again', async () => {
      renderPage();
      await loaded();
      await waitFor(() => expect(mockFetchLines).toHaveBeenCalled());
      const record = mockFetchBudgetSource.mock.calls.length;
      const linesCalls = mockFetchLines.mock.calls.length;

      await act(async () => {
        await i18n.changeLanguage('de');
      });

      expect(mockFetchBudgetSource).toHaveBeenCalledTimes(record);
      expect(mockFetchLines).toHaveBeenCalledTimes(linesCalls);
      expect(screen.getByRole('tab', { name: 'Verlauf' })).toBeInTheDocument();
    });

    it('the not-found copy follows the language, without a new request', async () => {
      mockFetchBudgetSource.mockRejectedValue(
        new ApiClientError(404, { code: 'NOT_FOUND', message: 'x' }),
      );
      renderPage();
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'This funding source could not be found.',
      );
      const calls = mockFetchBudgetSource.mock.calls.length;

      await act(async () => {
        await i18n.changeLanguage('de');
      });

      expect(screen.getByRole('alert')).toHaveTextContent(
        'Diese Finanzierungsquelle konnte nicht gefunden werden.',
      );
      expect(mockFetchBudgetSource).toHaveBeenCalledTimes(calls);
    });

    it('an API error is translated again and a plain failure uses the fixed copy of the new language', async () => {
      mockFetchBudgetSource.mockRejectedValue(new Error('offline'));
      renderPage();
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'The funding source could not be loaded.',
      );

      await act(async () => {
        await i18n.changeLanguage('de');
      });

      expect(screen.getByRole('alert')).not.toHaveTextContent('could not be loaded');
    });
  });

  describe('header (D2): the one primary per type and status', () => {
    it.each([
      ['bank_loan', 'active'],
      ['bank_loan', 'closed'],
      ['credit_line', 'active'],
      ['credit_line', 'exhausted'],
    ] as const)('%s / %s leads with Prepare bank report for this source', async (type, status) => {
      mockFetchBudgetSource.mockResolvedValue(record({ sourceType: type, status }));
      renderPage();
      await loaded();

      const primary = screen.getByTestId('source-primary-bank-report');
      expect(primary).toHaveTextContent('Prepare bank report');
      expect(primary).toHaveAttribute('href', `/budget/reports?type=claim&sourceId=${ID}`);
      expect(screen.queryByTestId('source-primary-status')).toBeNull();
      expect(screen.queryByTestId('source-primary-log')).toBeNull();
    });

    it.each([
      ['savings', 'active', 'Mark used up'],
      ['other', 'active', 'Mark used up'],
      ['savings', 'exhausted', 'Mark closed'],
      ['discretionary', 'active', 'Mark used up'],
    ] as const)('%s / %s leads with the forward status move "%s"', async (type, status, label) => {
      mockFetchBudgetSource.mockResolvedValue(
        record({ sourceType: type, status, isDiscretionary: type === 'discretionary' }),
      );
      renderPage();
      await loaded();

      expect(screen.getByTestId('source-primary-status')).toHaveTextContent(label);
      expect(screen.queryByTestId('source-primary-bank-report')).toBeNull();
    });

    it.each(['savings', 'other', 'discretionary'] as const)(
      '%s / closed has no forward move left and leads with Log',
      async (type) => {
        mockFetchBudgetSource.mockResolvedValue(
          record({ sourceType: type, status: 'closed', isDiscretionary: type === 'discretionary' }),
        );
        renderPage();
        await loaded();

        const log = screen.getByTestId('source-primary-log');
        expect(log).toHaveTextContent('Log');
        expect(screen.queryByTestId('source-primary-status')).toBeNull();
      },
    );

    it('shows the status chip, and the primary applies the status, refreshes the record and offers Undo', async () => {
      mockFetchBudgetSource.mockResolvedValue(record({ sourceType: 'savings' }));
      mockChangeStatus.mockResolvedValue({
        record: {},
        undo: { token: 'u_x', expiresAt: '2026-01-01T00:00:30Z' },
      });
      const user = userEvent.setup();
      renderPage();
      await loaded();
      expect(screen.getByTestId('source-status-badge')).toHaveTextContent('Active');

      mockFetchBudgetSource.mockResolvedValue(
        record({ sourceType: 'savings', status: 'exhausted' }),
      );
      await user.click(screen.getByTestId('source-primary-status'));

      await waitFor(() => expect(mockChangeStatus).toHaveBeenCalledWith(ID, 'exhausted'));
      await waitFor(() => expect(mockFetchBudgetSource).toHaveBeenCalledTimes(2));
      expect(mockShowUndoToast).toHaveBeenCalledWith(
        expect.objectContaining({ dedupeKey: `budget_source:${ID}` }),
      );
      await waitFor(() =>
        expect(screen.getByTestId('source-status-badge')).toHaveTextContent('Used up'),
      );
    });

    it('a failed status change toasts an error and shows no Undo', async () => {
      mockFetchBudgetSource.mockResolvedValue(record({ sourceType: 'savings' }));
      mockChangeStatus.mockRejectedValue(new Error('boom'));
      renderPage();
      await loaded();

      await userEvent.click(screen.getByTestId('source-primary-status'));

      await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('error', expect.any(String)));
      expect(mockShowUndoToast).not.toHaveBeenCalled();
    });
  });

  describe('summary strip', () => {
    it('shows Amount, Allocated, Paid, Submitted, Unallocated and Rate for a loan', async () => {
      renderPage();
      await loaded();
      const strip = within(screen.getByTestId('source-summary'));

      for (const [label, value] of [
        ['Amount', '€50,000.00'],
        ['Allocated', '€30,000.00'],
        ['Paid', '€12,000.00'],
        ['Submitted', '€4,000.00'],
        ['Unallocated', '€20,000.00'],
        ['Rate', '3.50%'],
      ]) {
        expect(strip.getByText(label as string).closest('div')).toHaveTextContent(value as string);
      }
    });

    it('Paid and Submitted link to the Cost tab; Paid is the paid figure', async () => {
      const user = userEvent.setup();
      renderPage();
      await loaded();
      const strip = screen.getByTestId('source-summary');

      expect(strip.querySelector('[data-figure="paid"]')).toHaveTextContent('€12,000.00');
      await user.click(within(strip).getByRole('link', { name: /Paid/ }));

      await waitFor(() =>
        expect(screen.getByRole('tab', { name: /Cost/ })).toHaveAttribute('aria-selected', 'true'),
      );
    });

    it('Own funds shows no Rate fact, a loan without a rate shows none either', async () => {
      mockFetchBudgetSource.mockResolvedValue(
        record({ sourceType: 'discretionary', isDiscretionary: true, interestRate: 2 }),
      );
      const { unmount } = renderPage();
      await loaded();
      expect(within(screen.getByTestId('source-summary')).queryByText('Rate')).toBeNull();
      unmount();

      mockFetchBudgetSource.mockResolvedValue(record({ interestRate: null }));
      renderPage();
      await loaded();
      expect(within(screen.getByTestId('source-summary')).queryByText('Rate')).toBeNull();
    });

    it('shows a signed negative Unallocated in the danger style when over-allocated', async () => {
      mockFetchBudgetSource.mockResolvedValue(
        record({}, { allocated: 62000, unallocated: 0, overAllocated: 12000 }),
      );
      renderPage();
      await loaded();

      const value = within(screen.getByTestId('source-summary')).getByText(/12,000\.00/, {
        selector: '[class*="danger"]',
      });
      expect(value.textContent).toMatch(/^[-−]\s?€12,000\.00$/);
    });

    it('appends the Documents fact the host provides', async () => {
      documentsFact = { id: 'documents', kind: 'static', label: 'Documents', value: '3' };
      renderPage();
      await loaded();
      expect(
        within(screen.getByTestId('source-summary')).getByText('Documents'),
      ).toBeInTheDocument();
      expect(screen.getByTestId('documents-panel')).toHaveAttribute('data-type', 'budget_source');
      expect(screen.getByTestId('documents-panel')).toHaveAttribute('data-id', ID);
    });
  });

  describe('tabs', () => {
    it('offers Overview, Cost (with the line count, none while loading) and History', async () => {
      mockFetchLines.mockReturnValue(new Promise(() => {}));
      renderPage();
      await loaded();
      expect(screen.getByRole('tab', { name: 'Cost' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      expect(screen.getByRole('tab', { name: 'History' })).toBeInTheDocument();
    });

    it('counts the lines of tasks and purchases on the Cost tab', async () => {
      renderPage();
      await loaded();
      await waitFor(() => expect(screen.getByRole('tab', { name: /Cost.*3/ })).toBeInTheDocument());
    });
  });

  describe('overview', () => {
    it('shows the Allocation bar with a legend of Submitted, Paid and Allocated amounts, and the details section', async () => {
      renderPage();
      await loaded();

      const legend = within(screen.getByTestId('source-allocation-legend'));
      expect(legend.getByText('Submitted').closest('li')).toHaveTextContent('€4,000.00');
      expect(legend.getByText('Paid').closest('li')).toHaveTextContent('€12,000.00');
      expect(legend.getByText('Allocated').closest('li')).toHaveTextContent('€30,000.00');
      const swatches = Array.from(
        screen.getByTestId('source-allocation-legend').querySelectorAll('[data-segment]'),
      ).map((el) => el.getAttribute('data-segment'));
      expect(swatches).toEqual(['submitted', 'paid', 'allocated']);
      expect(screen.getByTestId('source-details')).toHaveAttribute('data-source', ID);
      expect(screen.queryByTestId('source-over-allocated')).toBeNull();
    });

    it('saving the details refreshes the record', async () => {
      renderPage();
      await loaded();
      await userEvent.click(screen.getByRole('button', { name: 'details-saved' }));
      await waitFor(() => expect(mockFetchBudgetSource).toHaveBeenCalledTimes(2));
      expect(detailsProps?.source.id).toBe(ID);
    });

    it('shows the over-allocation warning only when over-allocated, with the bar note', async () => {
      mockFetchBudgetSource.mockResolvedValue(
        record({}, { allocated: 62000, unallocated: 0, overAllocated: 12000 }),
      );
      renderPage();
      await loaded();

      expect(screen.getByTestId('source-over-allocated')).toHaveTextContent(
        'Over-allocated by €12,000.00. This source is used beyond its amount.',
      );
      expect(screen.getByTestId('budget-bar-overflow-note')).toHaveTextContent(
        'Over-allocated by €12,000.00',
      );
    });

    it('Move lines... selects the Cost tab, focuses the first checkbox and pre-selects nothing', async () => {
      mockFetchBudgetSource.mockResolvedValue(
        record({}, { allocated: 62000, unallocated: 0, overAllocated: 12000 }),
      );
      renderPage();
      await loaded();

      await userEvent.click(screen.getByTestId('source-move-lines'));

      await waitFor(() =>
        expect(screen.getByRole('tab', { name: /Cost/ })).toHaveAttribute('aria-selected', 'true'),
      );
      const first = (await screen.findAllByRole('checkbox'))[0]!;
      await waitFor(() => expect(first).toHaveFocus());
      expect(screen.queryByTestId('source-lines-bs-1-selection-bar')).toBeNull();
      for (const box of screen.getAllByRole('checkbox')) expect(box).not.toBeChecked();
    });
  });

  describe('cost tab and moving lines', () => {
    async function openCost() {
      const user = userEvent.setup();
      renderPage(`/budget/financing/sources/${ID}?tab=cost`);
      await loaded();
      await screen.findByRole('region', { name: 'Budget lines for Loan Alpha' });
      return user;
    }

    it('shows the lines of the source in one tree', async () => {
      await openCost();
      expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(3);
    });

    it('a failed lines load shows the error with Retry that loads again', async () => {
      mockFetchLines.mockRejectedValueOnce(
        new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'x' }),
      );
      renderPage(`/budget/financing/sources/${ID}?tab=cost`);
      await loaded();
      await userEvent.click(await screen.findByRole('button', { name: 'Retry' }));
      await screen.findByRole('region', { name: 'Budget lines for Loan Alpha' });
      expect(mockFetchLines).toHaveBeenCalledTimes(2);
    });

    it('a non-API failure of the lines load shows the fixed copy', async () => {
      mockFetchLines.mockRejectedValueOnce(new Error('offline'));
      renderPage(`/budget/financing/sources/${ID}?tab=cost`);
      expect(
        await screen.findByText('The funding source could not be loaded.'),
      ).toBeInTheDocument();
    });

    it('Move to another source opens the dialog with the selected task and purchase lines and the claimed count', async () => {
      const user = await openCost();

      await user.click(screen.getByRole('checkbox', { name: 'Select Line w2' }));
      await user.click(screen.getByRole('checkbox', { name: 'Select Line h1' }));
      await user.click(screen.getByTestId('source-lines-bs-1-move'));

      const dialog = screen.getByRole('dialog', { name: 'move-probe' });
      expect(dialog).toHaveAttribute('data-work', 'w2');
      expect(dialog).toHaveAttribute('data-household', 'h1');
      expect(dialog).toHaveAttribute('data-claimed', '1');
    });

    it('closing the dialog keeps the selection', async () => {
      const user = await openCost();
      await user.click(screen.getByRole('checkbox', { name: 'Select Line w1' }));
      await user.click(screen.getByTestId('source-lines-bs-1-move'));

      await user.click(screen.getByRole('button', { name: 'move-close' }));

      expect(screen.queryByRole('dialog', { name: 'move-probe' })).toBeNull();
      expect(screen.getByTestId('source-lines-bs-1-selection-bar')).toBeInTheDocument();
    });

    it('a successful move toasts, clears the selection and reloads the lines and the record', async () => {
      const user = await openCost();
      await user.click(screen.getByRole('checkbox', { name: 'Select Line w1' }));
      await user.click(screen.getByTestId('source-lines-bs-1-move'));
      const linesBefore = mockFetchLines.mock.calls.length;
      const recordBefore = mockFetchBudgetSource.mock.calls.length;

      await user.click(screen.getByRole('button', { name: 'move-done' }));

      expect(mockShowToast).toHaveBeenCalledWith('success', 'Moved 1 line to Savings Beta.');
      expect(screen.queryByRole('dialog', { name: 'move-probe' })).toBeNull();
      expect(screen.queryByTestId('source-lines-bs-1-selection-bar')).toBeNull();
      await waitFor(() => expect(mockFetchLines.mock.calls.length).toBe(linesBefore + 1));
      await waitFor(() => expect(mockFetchBudgetSource.mock.calls.length).toBe(recordBefore + 1));
    });
  });

  describe('history tab', () => {
    it('asks for the budget_source history of this source', async () => {
      const user = userEvent.setup();
      renderPage();
      await loaded();

      await user.click(screen.getByRole('tab', { name: 'History' }));

      await waitFor(() =>
        expect(mockListHistory).toHaveBeenCalledWith(
          { entityType: 'budget_source', entityId: ID, pageSize: 20 },
          expect.any(AbortSignal),
        ),
      );
      expect(await screen.findByText('No history yet.')).toBeInTheDocument();
    });

    function submissionEntry(over: Record<string, unknown> = {}) {
      return {
        id: 'ev-1',
        entryType: 'invoice_status',
        entryDate: '2026-03-10',
        title: null,
        body: '',
        metadata: {
          v: 1,
          event: 'status_changed',
          from: 'pending',
          to: 'claimed',
          subjectLabel: 'T-001',
          batchId: 'batch-1',
        },
        isAutomatic: true,
        isSigned: false,
        status: 'saved',
        sourceEntityType: 'invoice',
        sourceEntityId: 'inv-1',
        sourceEntityArea: null,
        sourceEntityTitle: 'T-001',
        sourceEntityExists: true,
        photoCount: 0,
        createdBy: null,
        createdAt: '2026-03-10T10:00:00.000Z',
        updatedAt: '2026-03-10T10:00:00.000Z',
        batch: {
          batchId: 'batch-1',
          invoiceCount: 2,
          amount: 300,
          invoiceLabels: ['T-001', 'T-002'],
          budgetSourceId: ID,
          budgetSourceName: 'Loan Alpha',
          budgetSourceExists: true,
          kind: 'submission',
          reverted: false,
          invoicesFrom: { pending: 2, paid: 0 },
          progressPaymentCount: 0,
          ...over,
        },
      };
    }

    function historyWith(...items: unknown[]) {
      mockListHistory.mockResolvedValue({
        items,
        pagination: { page: 1, pageSize: 20, totalItems: items.length, totalPages: 1 },
      });
    }

    it('offers Revert submission on an unreverted submission row only', async () => {
      const user = userEvent.setup();
      historyWith(
        submissionEntry(),
        { ...submissionEntry({ batchId: 'batch-2', reverted: true }), id: 'ev-2' },
        { ...submissionEntry({ batchId: 'batch-3', kind: 'revert' }), id: 'ev-3' },
      );
      renderPage();
      await loaded();
      await user.click(screen.getByRole('tab', { name: 'History' }));

      expect(await screen.findByTestId('revert-submission-batch-1')).toBeInTheDocument();
      expect(screen.queryByTestId('revert-submission-batch-2')).toBeNull();
      expect(screen.queryByTestId('revert-submission-batch-3')).toBeNull();
    });

    it('a revert refreshes the record, the cost lines and the history, and toasts', async () => {
      const user = userEvent.setup();
      historyWith(submissionEntry());
      mockRevertSubmission.mockResolvedValue({
        batchId: 'r',
        restoredInvoiceIds: ['inv-1', 'inv-2'],
        restoredDepositIds: [],
      });
      renderPage();
      await loaded();
      await user.click(screen.getByRole('tab', { name: 'History' }));
      await user.click(await screen.findByTestId('revert-submission-batch-1'));
      const recordBefore = mockFetchBudgetSource.mock.calls.length;
      const linesBefore = mockFetchLines.mock.calls.length;
      const historyBefore = mockListHistory.mock.calls.length;

      await user.click(await screen.findByTestId('revert-submission-confirm'));

      await waitFor(() => expect(mockRevertSubmission).toHaveBeenCalledWith('batch-1'));
      expect(mockShowToast).toHaveBeenCalledWith(
        'info',
        'Submission reverted. 2 invoices are back to To pay or Paid.',
      );
      await waitFor(() =>
        expect(mockFetchBudgetSource.mock.calls.length).toBeGreaterThan(recordBefore),
      );
      await waitFor(() => expect(mockFetchLines.mock.calls.length).toBeGreaterThan(linesBefore));
      await waitFor(() => expect(mockListHistory.mock.calls.length).toBeGreaterThan(historyBefore));
    });
  });

  describe('delete', () => {
    async function openMenu(user: ReturnType<typeof userEvent.setup>) {
      await user.click(await screen.findByRole('button', { name: /actions/i }));
    }

    it('Own funds has no Delete in the menu', async () => {
      mockFetchBudgetSource.mockResolvedValue(
        record({ sourceType: 'discretionary', isDiscretionary: true }),
      );
      renderPage();
      await loaded();
      expect(screen.queryByTestId('source-header-menu')).toBeNull();
      expect(screen.queryByRole('menuitem', { name: /Delete/ })).toBeNull();
    });

    it('asks first, lists what the delete changes, and cancelling deletes nothing', async () => {
      const user = userEvent.setup();
      renderPage();
      await loaded();
      await openMenu(user);
      await user.click(await screen.findByRole('menuitem', { name: /Delete/ }));

      expect(await screen.findByText('Delete funding source?')).toBeInTheDocument();
      expect(mockFetchDeleteImpact).toHaveBeenCalledWith('budget_source', ID);
      await user.click(screen.getByTestId('source-delete-cancel'));

      expect(screen.queryByRole('dialog')).toBeNull();
      expect(mockDeleteSource).not.toHaveBeenCalled();
    });

    it('success deletes, toasts, replaces to Financing and focuses its heading', async () => {
      const user = userEvent.setup();
      renderPage();
      await loaded();
      await openMenu(user);
      await user.click(await screen.findByRole('menuitem', { name: /Delete/ }));

      await user.click(await screen.findByTestId('source-delete-confirm'));

      await waitFor(() => expect(mockDeleteSource).toHaveBeenCalledWith(ID));
      expect(mockShowToast).toHaveBeenCalledWith('success', 'Loan Alpha deleted.');
      await waitFor(() =>
        expect(screen.getByTestId('where')).toHaveTextContent('/budget/financing'),
      );
      expect(mockFocusHeading).toHaveBeenCalledTimes(1);
    });

    it('a 409 shows the translated error and blocks the action', async () => {
      mockDeleteSource.mockRejectedValue(
        new ApiClientError(409, { code: 'BUDGET_SOURCE_IN_USE', message: 'raw' }),
      );
      const user = userEvent.setup();
      renderPage();
      await loaded();
      await openMenu(user);
      await user.click(await screen.findByRole('menuitem', { name: /Delete/ }));
      await user.click(await screen.findByTestId('source-delete-confirm'));

      const alert = await screen.findByRole('alert');
      expect(alert).not.toHaveTextContent('raw');
      expect(screen.queryByTestId('source-delete-confirm')).toBeNull();
      expect(screen.getByTestId('where')).toHaveTextContent(`/budget/financing/sources/${ID}`);
    });

    it('another API error and a plain failure keep the dialog open with an error and the action available', async () => {
      mockDeleteSource.mockRejectedValueOnce(
        new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'raw' }),
      );
      const user = userEvent.setup();
      renderPage();
      await loaded();
      await openMenu(user);
      await user.click(await screen.findByRole('menuitem', { name: /Delete/ }));
      await user.click(await screen.findByTestId('source-delete-confirm'));
      expect(await screen.findByRole('alert')).toBeInTheDocument();
      expect(screen.getByTestId('source-delete-confirm')).toBeInTheDocument();

      mockDeleteSource.mockRejectedValueOnce(new Error('offline'));
      await user.click(screen.getByTestId('source-delete-confirm'));
      expect(
        await screen.findByText('The funding source could not be deleted. Please try again.'),
      ).toBeInTheDocument();
    });

    it('closing the dialog resets its error', async () => {
      mockDeleteSource.mockRejectedValueOnce(new Error('offline'));
      const user = userEvent.setup();
      renderPage();
      await loaded();
      await openMenu(user);
      await user.click(await screen.findByRole('menuitem', { name: /Delete/ }));
      await user.click(await screen.findByTestId('source-delete-confirm'));
      await screen.findByRole('alert');
      await user.click(screen.getByTestId('source-delete-cancel'));

      await openMenu(user);
      await user.click(await screen.findByRole('menuitem', { name: /Delete/ }));
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });
});
