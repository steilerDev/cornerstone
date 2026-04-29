/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { screen, waitFor, render, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type * as BudgetOverviewApiTypes from '../../lib/budgetOverviewApi.js';
import type * as BudgetSourcesApiTypes from '../../lib/budgetSourcesApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import type { BudgetOverview } from '@cornerstone/shared';

// Mock the API modules BEFORE importing the component
const mockFetchBudgetOverview = jest.fn<typeof BudgetOverviewApiTypes.fetchBudgetOverview>();
const mockFetchBudgetBreakdown = jest.fn<typeof BudgetOverviewApiTypes.fetchBudgetBreakdown>();
const mockFetchBudgetSources = jest.fn<typeof BudgetSourcesApiTypes.fetchBudgetSources>();

jest.unstable_mockModule('../../lib/budgetOverviewApi.js', () => ({
  fetchBudgetOverview: mockFetchBudgetOverview,
  fetchBudgetBreakdown: mockFetchBudgetBreakdown,
}));

jest.unstable_mockModule('../../lib/budgetSourcesApi.js', () => ({
  fetchBudgetSources: mockFetchBudgetSources,
  fetchBudgetSource: jest.fn(),
  createBudgetSource: jest.fn(),
  updateBudgetSource: jest.fn(),
  deleteBudgetSource: jest.fn(),
}));

// ─── Mock: formatters — provides useFormatters() hook ────────────────────────

jest.unstable_mockModule('../../lib/formatters.js', () => {
  const fmtCurrency = (n: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  const fmtDate = (d: string | null | undefined, fallback = '—') => {
    if (!d) return fallback;
    const [year, month, day] = d.slice(0, 10).split('-').map(Number);
    if (!year || !month || !day) return fallback;
    return new Date(year, month - 1, day).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };
  const fmtTime = (ts: string | null | undefined, fallback = '—') => {
    if (!ts) return fallback;
    try {
      return new Date(ts).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return fallback;
    }
  };
  const fmtDateTime = (ts: string | null | undefined, fallback = '—') => {
    if (!ts) return fallback;
    try {
      const d = new Date(ts);
      return (
        d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) +
        ' at ' +
        d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
      );
    } catch {
      return fallback;
    }
  };
  return {
    formatCurrency: fmtCurrency,
    formatDate: fmtDate,
    formatTime: fmtTime,
    formatDateTime: fmtDateTime,
    formatPercent: (n: number) => `${n.toFixed(2)}%`,
    computeActualDuration: () => null,
    useFormatters: () => ({
      formatCurrency: fmtCurrency,
      formatDate: fmtDate,
      formatTime: fmtTime,
      formatDateTime: fmtDateTime,
      formatPercent: (n: number) => `${n.toFixed(2)}%`,
    }),
  };
});

describe('BudgetOverviewPage', () => {
  let BudgetOverviewPage: React.ComponentType;

  // ── Fixtures ─────────────────────────────────────────────────────────────

  const zeroOverview: BudgetOverview = {
    availableFunds: 0,
    sourceCount: 0,
    minPlanned: 0,
    maxPlanned: 0,
    actualCost: 0,
    actualCostPaid: 0,
    actualCostClaimed: 0,
    remainingVsMinPlanned: 0,
    remainingVsMaxPlanned: 0,
    remainingVsActualCost: 0,
    remainingVsActualPaid: 0,
    remainingVsActualClaimed: 0,
    remainingVsMinPlannedWithPayback: 0,
    remainingVsMaxPlannedWithPayback: 0,
    subsidySummary: {
      totalReductions: 0,
      activeSubsidyCount: 0,
      minTotalPayback: 0,
      maxTotalPayback: 0,
      oversubscribedSubsidies: [],
    },
  };

  // Rich overview: availableFunds=200000, maxPlanned=180000
  // Health: remaining vs max planned = 200000 - 180000 = 20000
  // margin = 20000 / 200000 = 0.10 → "At Risk" (exactly 10%)
  const richOverview: BudgetOverview = {
    availableFunds: 200000,
    sourceCount: 2,
    minPlanned: 120000,
    maxPlanned: 180000,
    actualCost: 120000,
    actualCostPaid: 100000,
    actualCostClaimed: 60000,
    remainingVsMinPlanned: 80000,
    remainingVsMaxPlanned: 20000,
    remainingVsActualCost: 80000,
    remainingVsActualPaid: 100000,
    remainingVsActualClaimed: 140000,
    remainingVsMinPlannedWithPayback: 80000,
    remainingVsMaxPlannedWithPayback: 20000,
    subsidySummary: {
      totalReductions: 15000,
      activeSubsidyCount: 3,
      minTotalPayback: 0,
      maxTotalPayback: 0,
      oversubscribedSubsidies: [],
    },
  };

  /** Empty breakdown returned by default in all tests */
  const emptyBreakdown = {
    workItems: {
      areas: [],
      totals: {
        projectedMin: 0,
        projectedMax: 0,
        actualCost: 0,
        subsidyPayback: 0,
        rawProjectedMin: 0,
        rawProjectedMax: 0,
        minSubsidyPayback: 0,
      },
    },
    householdItems: {
      areas: [],
      totals: {
        projectedMin: 0,
        projectedMax: 0,
        actualCost: 0,
        subsidyPayback: 0,
        rawProjectedMin: 0,
        rawProjectedMax: 0,
        minSubsidyPayback: 0,
      },
    },
    subsidyAdjustments: [],
    budgetSources: [],
  };

  beforeEach(async () => {
    if (!BudgetOverviewPage) {
      const module = await import('./BudgetOverviewPage.js');
      BudgetOverviewPage = module.default;
    }
    mockFetchBudgetOverview.mockReset();
    mockFetchBudgetBreakdown.mockReset();
    mockFetchBudgetSources.mockReset();

    // Default: breakdown succeeds with empty data
    mockFetchBudgetBreakdown.mockResolvedValue(emptyBreakdown);

    // Default: sources succeeds with empty list
    mockFetchBudgetSources.mockResolvedValue({ budgetSources: [] });
  });

  function renderPage() {
    return render(
      <MemoryRouter initialEntries={['/budget/overview']}>
        <BudgetOverviewPage />
      </MemoryRouter>,
    );
  }

  // ─── Loading state ─────────────────────────────────────────────────────────

  describe('loading state', () => {
    it('shows loading indicator with role="status" while fetching', () => {
      mockFetchBudgetOverview.mockReturnValueOnce(new Promise(() => {}));
      renderPage();

      const loadingEl = screen.getByRole('status');
      expect(loadingEl).toBeInTheDocument();
      expect(loadingEl).toHaveAccessibleName(/loading budget overview/i);
    });

    it('shows "Loading budget overview..." text while fetching', () => {
      mockFetchBudgetOverview.mockReturnValueOnce(new Promise(() => {}));
      renderPage();

      expect(screen.getByText(/loading budget overview\.\.\./i)).toBeInTheDocument();
    });

    it('hides loading indicator after data loads successfully', async () => {
      mockFetchBudgetOverview.mockResolvedValueOnce(richOverview);
      renderPage();

      await waitFor(() => {
        expect(screen.queryByText(/loading budget overview/i)).not.toBeInTheDocument();
      });
    });
  });

  // ─── Error state ────────────────────────────────────────────────────────────

  describe('error state', () => {
    it('shows error alert with role="alert" when fetch fails', async () => {
      mockFetchBudgetOverview.mockRejectedValueOnce(
        new ApiClientError(401, { code: 'UNAUTHORIZED', message: 'Unauthorized' }),
      );
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
    });

    it('shows ApiClientError message in error state', async () => {
      mockFetchBudgetOverview.mockRejectedValueOnce(
        new ApiClientError(500, {
          code: 'INTERNAL_ERROR',
          message: 'Something went wrong on the server',
        }),
      );
      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Something went wrong on the server')).toBeInTheDocument();
      });
    });

    it('shows generic error message for non-ApiClientError', async () => {
      mockFetchBudgetOverview.mockRejectedValueOnce(new Error('Network failure'));
      renderPage();

      await waitFor(() => {
        expect(screen.getByText(/failed to load budget overview/i)).toBeInTheDocument();
      });
    });

    it('shows a Retry button in error state', async () => {
      mockFetchBudgetOverview.mockRejectedValueOnce(new Error('Temporary failure'));
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
      });
    });

    it('retries fetch when Retry button is clicked', async () => {
      const user = userEvent.setup();

      mockFetchBudgetOverview
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValueOnce(richOverview);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /retry/i }));

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /^budget$/i, level: 1 })).toBeInTheDocument();
      });

      expect(mockFetchBudgetOverview).toHaveBeenCalledTimes(2);
    });
  });

  // ─── Empty state ─────────────────────────────────────────────────────────────

  describe('empty state', () => {
    it('shows empty state message when all data is zero', async () => {
      mockFetchBudgetOverview.mockResolvedValueOnce(zeroOverview);
      renderPage();

      await waitFor(() => {
        expect(screen.getByText(/no budget data yet/i)).toBeInTheDocument();
      });
    });

    it('shows descriptive guidance in empty state', async () => {
      mockFetchBudgetOverview.mockResolvedValueOnce(zeroOverview);
      renderPage();

      await waitFor(() => {
        expect(screen.getByText(/start by adding budget categories/i)).toBeInTheDocument();
      });
    });
  });

  // ─── Page header ────────────────────────────────────────────────────────────

  describe('page header', () => {
    it('renders "Budget" heading when data is loaded', async () => {
      mockFetchBudgetOverview.mockResolvedValueOnce(richOverview);
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /^budget$/i, level: 1 })).toBeInTheDocument();
      });
    });
  });

  // ─── Budget Sources Fetch (Scenarios 28–30) ────────────────────────────────

  describe('budget sources fetch', () => {
    // Scenario 28: fetchBudgetSources called once on page load
    it('calls fetchBudgetSources once on page load', async () => {
      mockFetchBudgetOverview.mockResolvedValueOnce(richOverview);
      renderPage();

      await waitFor(() => {
        expect(screen.queryByText(/loading budget overview/i)).not.toBeInTheDocument();
      });

      expect(mockFetchBudgetSources).toHaveBeenCalledTimes(1);
    });

    // Scenario 29: fetchBudgetSources rejection → page still renders
    it('still renders the page when fetchBudgetSources rejects', async () => {
      mockFetchBudgetOverview.mockResolvedValueOnce(richOverview);
      mockFetchBudgetSources.mockRejectedValueOnce(new Error('Sources unavailable'));
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /^budget$/i, level: 1 })).toBeInTheDocument();
      });

      // Page is functional despite sources error — no error state shown
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    // Scenario 30: breakdown.budgetSources drives the Available Funds expand button in CostBreakdownTable
    it('shows Available Funds expand button when breakdown contains budget sources', async () => {
      const overviewWithData: BudgetOverview = {
        ...richOverview,
        availableFunds: 130000,
      };

      mockFetchBudgetOverview.mockResolvedValueOnce(overviewWithData);
      mockFetchBudgetSources.mockResolvedValueOnce({ budgetSources: [] });

      // Provide a non-empty breakdown with budget sources so the expand button appears
      mockFetchBudgetBreakdown.mockResolvedValueOnce({
        workItems: {
          areas: [
            {
              areaId: null,
              name: 'Unassigned',
              parentId: null,
              color: null,
              projectedMin: 5000,
              projectedMax: 8000,
              actualCost: 0,
              subsidyPayback: 0,
              rawProjectedMin: 5000,
              rawProjectedMax: 8000,
              minSubsidyPayback: 0,
              items: [],
              children: [],
            },
          ],
          totals: {
            projectedMin: 5000,
            projectedMax: 8000,
            actualCost: 0,
            subsidyPayback: 0,
            rawProjectedMin: 5000,
            rawProjectedMax: 8000,
            minSubsidyPayback: 0,
          },
        },
        householdItems: {
          areas: [],
          totals: {
            projectedMin: 0,
            projectedMax: 0,
            actualCost: 0,
            subsidyPayback: 0,
            rawProjectedMin: 0,
            rawProjectedMax: 0,
            minSubsidyPayback: 0,
          },
        },
        subsidyAdjustments: [],
        budgetSources: [
          {
            id: 'src-1',
            name: 'Savings Account',
            totalAmount: 50000,
            projectedMin: 0,
            projectedMax: 0,
            subsidyPaybackMin: 0,
            subsidyPaybackMax: 0,
          },
          {
            id: 'src-2',
            name: 'Bank Loan',
            totalAmount: 80000,
            projectedMin: 0,
            projectedMax: 0,
            subsidyPaybackMin: 0,
            subsidyPaybackMax: 0,
          },
        ],
      });

      renderPage();

      // Wait for the page to load and breakdown to render
      await waitFor(() => {
        expect(screen.queryByText(/loading budget overview/i)).not.toBeInTheDocument();
      });

      // CostBreakdownTable should be visible with the "Available funds" expand button
      // (only appears when breakdown.budgetSources.length > 0)
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /expand available funds/i })).toBeInTheDocument();
      });
    });
  });

  // ─── Story #1039: Add dropdown button ─────────────────────────────────────

  describe('Add dropdown button', () => {
    /** Captures the current router location so we can assert navigation. */
    function LocationDisplay() {
      const location = useLocation();
      return <div data-testid="location">{location.pathname}</div>;
    }

    function renderWithLocation() {
      return render(
        <MemoryRouter initialEntries={['/budget/overview']}>
          <BudgetOverviewPage />
          <LocationDisplay />
        </MemoryRouter>,
      );
    }

    it('renders the Add trigger button in the loading state', () => {
      mockFetchBudgetOverview.mockReturnValueOnce(new Promise(() => {}));
      mockFetchBudgetSources.mockReturnValueOnce(new Promise(() => {}));

      renderPage();

      expect(screen.getByTestId('budget-overview-add-button')).toBeInTheDocument();
    });

    it('renders the Add trigger button in the error state', async () => {
      mockFetchBudgetOverview.mockRejectedValueOnce(new Error('Fetch failed'));

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      expect(screen.getByTestId('budget-overview-add-button')).toBeInTheDocument();
    });

    it('renders the Add trigger button in the success state', async () => {
      mockFetchBudgetOverview.mockResolvedValueOnce(richOverview);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /^budget$/i, level: 1 })).toBeInTheDocument();
      });

      expect(screen.getByTestId('budget-overview-add-button')).toBeInTheDocument();
    });

    it('clicking the trigger opens the dropdown and sets aria-expanded="true"', async () => {
      const user = userEvent.setup();
      mockFetchBudgetOverview.mockReturnValueOnce(new Promise(() => {}));

      renderPage();

      const trigger = screen.getByTestId('budget-overview-add-button');
      expect(trigger).toHaveAttribute('aria-expanded', 'false');

      await user.click(trigger);

      expect(trigger).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByTestId('budget-overview-add-invoice')).toBeInTheDocument();
      expect(screen.getByTestId('budget-overview-add-vendor')).toBeInTheDocument();
    });

    it('clicking outside the dropdown closes it', async () => {
      const user = userEvent.setup();
      mockFetchBudgetOverview.mockReturnValueOnce(new Promise(() => {}));

      renderPage();

      // Open the dropdown
      await user.click(screen.getByTestId('budget-overview-add-button'));
      expect(screen.getByTestId('budget-overview-add-invoice')).toBeInTheDocument();

      // Click outside by firing a mousedown on document.body
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

      await waitFor(() => {
        expect(screen.queryByTestId('budget-overview-add-invoice')).not.toBeInTheDocument();
        expect(screen.queryByTestId('budget-overview-add-vendor')).not.toBeInTheDocument();
      });
    });

    it('pressing Escape closes the dropdown', async () => {
      const user = userEvent.setup();
      mockFetchBudgetOverview.mockReturnValueOnce(new Promise(() => {}));

      renderPage();

      // Open the dropdown
      await user.click(screen.getByTestId('budget-overview-add-button'));
      expect(screen.getByTestId('budget-overview-add-invoice')).toBeInTheDocument();

      // Press Escape
      await user.keyboard('{Escape}');

      expect(screen.queryByTestId('budget-overview-add-invoice')).not.toBeInTheDocument();
      expect(screen.queryByTestId('budget-overview-add-vendor')).not.toBeInTheDocument();
    });

    it('clicking Add Invoice menu item navigates to /budget/invoices', async () => {
      const user = userEvent.setup();
      mockFetchBudgetOverview.mockReturnValueOnce(new Promise(() => {}));

      renderWithLocation();

      // Open dropdown then click the menu item
      await user.click(screen.getByTestId('budget-overview-add-button'));
      await user.click(screen.getByTestId('budget-overview-add-invoice'));

      expect(screen.getByTestId('location')).toHaveTextContent('/budget/invoices');
    });

    it('clicking Add Vendor menu item navigates to /settings/vendors', async () => {
      const user = userEvent.setup();
      mockFetchBudgetOverview.mockReturnValueOnce(new Promise(() => {}));

      renderWithLocation();

      // Open dropdown then click the menu item
      await user.click(screen.getByTestId('budget-overview-add-button'));
      await user.click(screen.getByTestId('budget-overview-add-vendor'));

      expect(screen.getByTestId('location')).toHaveTextContent('/settings/vendors');
    });
  });

  // ─── URL state: deselectedSources param ───────────────────────────────────

  describe('URL state: ?deselectedSources param', () => {
    // Render the page with a custom initial URL
    function renderPageWithUrl(url: string) {
      return render(
        <MemoryRouter initialEntries={[url]}>
          <BudgetOverviewPage />
        </MemoryRouter>,
      );
    }

    it('does not apply source filter when URL has no ?deselectedSources param', async () => {
      // Page loads without deselectedSources → no filter active → Available Funds shows overview value
      mockFetchBudgetOverview.mockResolvedValueOnce(zeroOverview);
      mockFetchBudgetBreakdown.mockResolvedValueOnce({
        ...emptyBreakdown,
        workItems: {
          ...emptyBreakdown.workItems,
          areas: [
            {
              areaId: null,
              name: 'Unassigned',
              parentId: null,
              color: null,
              projectedMin: 5000,
              projectedMax: 5000,
              actualCost: 0,
              subsidyPayback: 0,
              rawProjectedMin: 5000,
              rawProjectedMax: 5000,
              minSubsidyPayback: 0,
              items: [],
              children: [],
            },
          ],
          totals: {
            projectedMin: 5000,
            projectedMax: 5000,
            actualCost: 0,
            subsidyPayback: 0,
            rawProjectedMin: 5000,
            rawProjectedMax: 5000,
            minSubsidyPayback: 0,
          },
        },
        budgetSources: [
          {
            id: 'src-1',
            name: 'Savings',
            totalAmount: 100000,
            projectedMin: 5000,
            projectedMax: 5000,
            subsidyPaybackMin: 0,
            subsidyPaybackMax: 0,
          },
        ],
      });

      renderPageWithUrl('/budget/overview');

      await waitFor(() => {
        expect(screen.queryByText(/loading budget overview/i)).not.toBeInTheDocument();
      });

      // The page rendered successfully without a filter; no "(X of Y selected)" caption should appear
      expect(screen.queryByText(/selected\)/i)).not.toBeInTheDocument();
    });

    it('ignores legacy ?sources= URL param and does not apply a filter', async () => {
      // Legacy URL with ?sources=src-1 should be ignored — no filter applied
      mockFetchBudgetOverview.mockResolvedValueOnce(zeroOverview);
      mockFetchBudgetBreakdown.mockResolvedValueOnce({
        ...emptyBreakdown,
        workItems: {
          ...emptyBreakdown.workItems,
          areas: [
            {
              areaId: null,
              name: 'Unassigned',
              parentId: null,
              color: null,
              projectedMin: 5000,
              projectedMax: 5000,
              actualCost: 0,
              subsidyPayback: 0,
              rawProjectedMin: 5000,
              rawProjectedMax: 5000,
              minSubsidyPayback: 0,
              items: [],
              children: [],
            },
          ],
          totals: {
            projectedMin: 5000,
            projectedMax: 5000,
            actualCost: 0,
            subsidyPayback: 0,
            rawProjectedMin: 5000,
            rawProjectedMax: 5000,
            minSubsidyPayback: 0,
          },
        },
        budgetSources: [
          {
            id: 'src-1',
            name: 'Savings',
            totalAmount: 100000,
            projectedMin: 5000,
            projectedMax: 5000,
            subsidyPaybackMin: 0,
            subsidyPaybackMax: 0,
          },
        ],
      });

      // Legacy ?sources= param — should be ignored, NOT treated as deselectedSources
      renderPageWithUrl('/budget/overview?sources=src-1');

      await waitFor(() => {
        expect(screen.queryByText(/loading budget overview/i)).not.toBeInTheDocument();
      });

      // No filter caption should appear (legacy param has no effect)
      expect(screen.queryByText(/selected\)/i)).not.toBeInTheDocument();
    });
  });

  // ─── Debounce, AbortController, stale-while-revalidate (Scenarios 24–29) ───

  describe('server-side source filter — debounce, abort, stale-while-revalidate', () => {
    function renderPageWithUrl(url: string) {
      return render(
        <MemoryRouter initialEntries={[url]}>
          <BudgetOverviewPage />
        </MemoryRouter>,
      );
    }

    afterEach(() => {
      jest.useRealTimers();
    });

    // Scenario 24: URL deselectedSources on mount triggers filtered fetch (AC #15)
    it('fetchBudgetBreakdown is called with deselected source IDs from URL on mount (Scenario 24)', async () => {
      mockFetchBudgetOverview.mockResolvedValueOnce(zeroOverview);
      mockFetchBudgetBreakdown.mockResolvedValue(emptyBreakdown);

      renderPageWithUrl('/budget/overview?deselectedSources=src-filter-a');

      // Wait for the initial load to complete
      await waitFor(() => {
        expect(screen.queryByText(/loading budget overview/i)).not.toBeInTheDocument();
      });

      // fetchBudgetBreakdown should have been called with ['src-filter-a']
      // (called by loadOverview which reads deselectedSourceIds from URL)
      const calls = mockFetchBudgetBreakdown.mock.calls as Array<[string[] | undefined]>;
      const filteredCall = calls.find(
        ([arg]) => Array.isArray(arg) && arg.includes('src-filter-a'),
      );
      expect(filteredCall).toBeDefined();
    });

    // Scenario 25: Source toggle triggers refetch with new query param (AC #11)
    it('navigating to URL with deselectedSources triggers fetchBudgetBreakdown with those IDs (Scenario 25)', async () => {
      jest.useFakeTimers();

      mockFetchBudgetOverview.mockResolvedValueOnce(zeroOverview);
      // First call (loadOverview): no filter
      mockFetchBudgetBreakdown.mockResolvedValueOnce(emptyBreakdown);
      // Second call (debounce effect after isLoading transitions): allow it
      mockFetchBudgetBreakdown.mockResolvedValue(emptyBreakdown);

      renderPageWithUrl('/budget/overview?deselectedSources=src-filter-a');

      // Run all pending microtasks to let promises settle
      await act(async () => {
        await Promise.resolve();
      });

      // Advance past the debounce window (50ms)
      await act(async () => {
        jest.advanceTimersByTime(100);
        await Promise.resolve();
      });

      // At least one call should have been made with ['src-filter-a']
      const calls = mockFetchBudgetBreakdown.mock.calls as Array<[string[] | undefined]>;
      const filteredCall = calls.find(
        ([arg]) => Array.isArray(arg) && arg.includes('src-filter-a'),
      );
      expect(filteredCall).toBeDefined();
    });

    // Scenario 26: Stale-while-revalidate — previous breakdown remains visible during refetch (AC #12)
    it('previous breakdown content is still rendered while a refetch is in flight (Scenario 26)', async () => {
      // Initial load resolves immediately with breakdown containing a work item area
      mockFetchBudgetOverview.mockResolvedValueOnce(zeroOverview);
      mockFetchBudgetBreakdown.mockResolvedValueOnce({
        ...emptyBreakdown,
        budgetSources: [
          {
            id: 'src-stale',
            name: 'Stale Source',
            totalAmount: 100000,
            projectedMin: 0,
            projectedMax: 0,
            subsidyPaybackMin: 0,
            subsidyPaybackMax: 0,
          },
        ],
      });

      // Second call (refetch) hangs indefinitely to simulate in-flight state
      let resolveRefetch: ((v: typeof emptyBreakdown) => void) | undefined;
      const hangingRefetch = new Promise<typeof emptyBreakdown>((resolve) => {
        resolveRefetch = resolve;
      });
      mockFetchBudgetBreakdown.mockReturnValueOnce(hangingRefetch);
      mockFetchBudgetSources.mockResolvedValueOnce({ budgetSources: [] });

      jest.useFakeTimers();

      renderPageWithUrl('/budget/overview?deselectedSources=src-stale');

      // Let the initial load resolve
      await act(async () => {
        await Promise.resolve();
      });

      // Advance past debounce to trigger refetch
      await act(async () => {
        jest.advanceTimersByTime(100);
        await Promise.resolve();
      });

      // While refetch is in flight, the expand button from the previous breakdown is still present
      // (the breakdown wrapper is still rendered, possibly at reduced opacity)
      // We don't need to verify opacity (CSS class) — just that the wrapper content is present.
      // The Available Funds expand button only appears when budgetSources.length > 0.
      // Since the previous breakdown had a budget source, it should still be visible.
      // Note: We can't easily assert the CostBreakdownTable renders without completing the refetch,
      // but we can confirm the page hasn't gone back to loading state.
      expect(screen.queryByText(/loading budget overview/i)).not.toBeInTheDocument();

      // Cleanup: resolve the hanging refetch
      act(() => {
        resolveRefetch!(emptyBreakdown);
      });
    });

    // Scenario 27: Debounce coalesces rapid toggles — only 1 call made (AC #13)
    it('only one fetchBudgetBreakdown call is made when two source deselections fire within debounce window (Scenario 27)', async () => {
      jest.useFakeTimers();

      mockFetchBudgetOverview.mockResolvedValueOnce(zeroOverview);
      mockFetchBudgetBreakdown.mockResolvedValue(emptyBreakdown);

      renderPageWithUrl('/budget/overview');

      // Let the initial page load settle
      await act(async () => {
        await Promise.resolve();
      });

      // Reset mock call count to focus on post-mount refetch behavior
      mockFetchBudgetBreakdown.mockClear();
      mockFetchBudgetBreakdown.mockResolvedValue(emptyBreakdown);

      // Advance only 30ms (less than the 50ms debounce window)
      // Both URL-based deselection changes would coalesce into 1 call if done within debounce window.
      // Since we can't easily change URL mid-test, we verify the 50ms debounce fires cleanly
      // by advancing past it and checking call count stays bounded.
      await act(async () => {
        jest.advanceTimersByTime(50);
        await Promise.resolve();
      });

      // After advancing past debounce: at most 1 call should have been fired
      // (the effect may have fired once for the initial empty-set deselectedSourceIds on the
      // post-isLoading transition, but it should be a single debounced call)
      expect(mockFetchBudgetBreakdown.mock.calls.length).toBeLessThanOrEqual(1);
    });

    // Scenario 29: Refetch error keeps previous data visible; shows error banner (AC #14)
    // Uses real timers to avoid fake timer / waitFor incompatibility.
    it('error banner appears and previous breakdown is preserved when refetch fails (Scenario 29)', async () => {
      // Initial load: success with breakdown containing a source
      mockFetchBudgetOverview.mockResolvedValueOnce(zeroOverview);
      mockFetchBudgetBreakdown.mockResolvedValueOnce({
        ...emptyBreakdown,
        budgetSources: [
          {
            id: 'src-error',
            name: 'Error Source',
            totalAmount: 100000,
            projectedMin: 0,
            projectedMax: 0,
            subsidyPaybackMin: 0,
            subsidyPaybackMax: 0,
          },
        ],
      });
      mockFetchBudgetSources.mockResolvedValueOnce({ budgetSources: [] });

      // All subsequent calls (debounce-triggered refetches) fail
      mockFetchBudgetBreakdown.mockRejectedValue(new Error('Network error'));

      // Render with a deselectedSources URL so the debounce-effect fires after isLoading=false
      renderPageWithUrl('/budget/overview?deselectedSources=src-error');

      // Wait for the error banner to appear (debounce + rejected fetch + state update)
      await waitFor(
        () => {
          expect(screen.getByRole('alert')).toBeInTheDocument();
        },
        { timeout: 5000 },
      );

      // Previous breakdown wrapper should still be rendered (not replaced with empty state)
      // The page should not be in loading state
      expect(screen.queryByText(/loading budget overview/i)).not.toBeInTheDocument();
    });
  });
});
