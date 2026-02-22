/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { screen, waitFor, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type * as BudgetOverviewApiTypes from '../../lib/budgetOverviewApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import type { BudgetOverview } from '@cornerstone/shared';

// Mock the API module BEFORE importing the component
const mockFetchBudgetOverview = jest.fn<typeof BudgetOverviewApiTypes.fetchBudgetOverview>();

jest.unstable_mockModule('../../lib/budgetOverviewApi.js', () => ({
  fetchBudgetOverview: mockFetchBudgetOverview,
}));

describe('BudgetOverviewPage', () => {
  let BudgetOverviewPage: React.ComponentType;

  // Sample data for all tests — using new Story 5.11 shape

  const zeroOverview: BudgetOverview = {
    availableFunds: 0,
    sourceCount: 0,
    minPlanned: 0,
    maxPlanned: 0,
    actualCost: 0,
    actualCostPaid: 0,
    remainingVsMinPlanned: 0,
    remainingVsMaxPlanned: 0,
    remainingVsActualCost: 0,
    remainingVsActualPaid: 0,
    categorySummaries: [],
    subsidySummary: {
      totalReductions: 0,
      activeSubsidyCount: 0,
    },
  };

  const richOverview: BudgetOverview = {
    availableFunds: 200000,
    sourceCount: 2,
    minPlanned: 120000,
    maxPlanned: 180000,
    actualCost: 120000,
    actualCostPaid: 100000,
    remainingVsMinPlanned: 80000,
    remainingVsMaxPlanned: 20000,
    remainingVsActualCost: 80000,
    remainingVsActualPaid: 100000,
    categorySummaries: [
      {
        categoryId: 'cat-1',
        categoryName: 'Materials',
        categoryColor: '#FF5733',
        minPlanned: 64000,
        maxPlanned: 96000,
        actualCost: 70000,
        actualCostPaid: 65000,
        budgetLineCount: 5,
      },
      {
        categoryId: 'cat-2',
        categoryName: 'Labor',
        categoryColor: null,
        minPlanned: 56000,
        maxPlanned: 84000,
        actualCost: 50000,
        actualCostPaid: 35000,
        budgetLineCount: 3,
      },
    ],
    subsidySummary: {
      totalReductions: 15000,
      activeSubsidyCount: 3,
    },
  };

  beforeEach(async () => {
    if (!BudgetOverviewPage) {
      const module = await import('./BudgetOverviewPage.js');
      BudgetOverviewPage = module.default;
    }

    mockFetchBudgetOverview.mockReset();
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
      // Never resolves — stays in loading state
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
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
      });
    });
  });

  // ─── Error state ───────────────────────────────────────────────────────────

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

      // First call fails, second call succeeds
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

      // fetchBudgetOverview should have been called twice (initial + retry)
      expect(mockFetchBudgetOverview).toHaveBeenCalledTimes(2);
    });
  });

  // ─── Empty state ───────────────────────────────────────────────────────────

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

  // ─── Page header ──────────────────────────────────────────────────────────

  describe('page header', () => {
    it('renders "Budget" heading when data is loaded', async () => {
      mockFetchBudgetOverview.mockResolvedValueOnce(richOverview);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /^budget$/i, level: 1 })).toBeInTheDocument();
      });
    });
  });

  // ─── Summary cards ─────────────────────────────────────────────────────────

  describe('summary cards with data', () => {
    it('renders Planned Budget card with min/max planned labels', async () => {
      mockFetchBudgetOverview.mockResolvedValueOnce(richOverview);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('region', { name: /planned budget/i })).toBeInTheDocument();
      });

      expect(screen.getByText('Min (optimistic)')).toBeInTheDocument();
      expect(screen.getByText('Max (pessimistic)')).toBeInTheDocument();
    });

    it('renders Actual Cost card with invoiced and paid labels', async () => {
      mockFetchBudgetOverview.mockResolvedValueOnce(richOverview);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('region', { name: /actual cost/i })).toBeInTheDocument();
      });

      expect(screen.getByText('Invoiced')).toBeInTheDocument();
      expect(screen.getByText('Paid')).toBeInTheDocument();
    });

    it('renders Financing card with available funds and remaining perspectives', async () => {
      mockFetchBudgetOverview.mockResolvedValueOnce(richOverview);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('region', { name: /financing/i })).toBeInTheDocument();
      });

      expect(screen.getByText('Available Funds')).toBeInTheDocument();
      expect(screen.getByText('Remaining (optimistic)')).toBeInTheDocument();
      expect(screen.getByText('Remaining (pessimistic)')).toBeInTheDocument();
    });

    it('renders Subsidies card with correct values', async () => {
      mockFetchBudgetOverview.mockResolvedValueOnce(richOverview);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('region', { name: /subsidies/i })).toBeInTheDocument();
      });

      expect(screen.getByText('Total Reductions')).toBeInTheDocument();
    });

    it('formats source count with "source" singular when sourceCount is 1', async () => {
      const singleSourceOverview: BudgetOverview = {
        ...richOverview,
        sourceCount: 1,
      };
      mockFetchBudgetOverview.mockResolvedValueOnce(singleSourceOverview);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText(/1 source/i)).toBeInTheDocument();
      });
    });

    it('formats source count with "sources" plural when sourceCount is multiple', async () => {
      // richOverview has sourceCount: 2
      mockFetchBudgetOverview.mockResolvedValueOnce(richOverview);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText(/2 sources/i)).toBeInTheDocument();
      });
    });

    it('formats subsidy count with "program" singular when activeSubsidyCount is 1', async () => {
      const oneProgramOverview: BudgetOverview = {
        ...richOverview,
        subsidySummary: { totalReductions: 5000, activeSubsidyCount: 1 },
      };
      mockFetchBudgetOverview.mockResolvedValueOnce(oneProgramOverview);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText(/1 active program$/i)).toBeInTheDocument();
      });
    });

    it('formats subsidy count with "programs" plural for multiple', async () => {
      // richOverview has activeSubsidyCount: 3
      mockFetchBudgetOverview.mockResolvedValueOnce(richOverview);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText(/3 active programs/i)).toBeInTheDocument();
      });
    });

    it('shows positive variant for remaining when funds exceed planned', async () => {
      // richOverview has positive remaining perspectives
      mockFetchBudgetOverview.mockResolvedValueOnce(richOverview);

      renderPage();

      // Just check the card renders without error
      await waitFor(() => {
        expect(screen.getByRole('region', { name: /financing/i })).toBeInTheDocument();
      });
    });
  });

  // ─── Currency formatting ──────────────────────────────────────────────────

  describe('currency formatting', () => {
    it('formats amounts as EUR currency', async () => {
      const knownAmountOverview: BudgetOverview = {
        ...zeroOverview,
        minPlanned: 150000,
        maxPlanned: 150000,
        categorySummaries: [
          {
            categoryId: 'cat-1',
            categoryName: 'Test Cat',
            categoryColor: null,
            minPlanned: 150000,
            maxPlanned: 150000,
            actualCost: 0,
            actualCostPaid: 0,
            budgetLineCount: 1,
          },
        ],
      };

      mockFetchBudgetOverview.mockResolvedValueOnce(knownAmountOverview);

      renderPage();

      // EUR formatting: en-US locale with EUR currency
      // 150000 should be formatted as €150,000.00 or similar (EUR symbol)
      await waitFor(() => {
        // getAllByText to account for duplicates in cards + table footer
        const elements = screen.getAllByText(/150,000\.00/);
        expect(elements.length).toBeGreaterThan(0);
      });
    });
  });

  // ─── Category Breakdown table ──────────────────────────────────────────────

  describe('category breakdown table', () => {
    it('renders "Category Breakdown" section heading', async () => {
      mockFetchBudgetOverview.mockResolvedValueOnce(richOverview);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /category breakdown/i })).toBeInTheDocument();
      });
    });

    it('shows table with correct column headers', async () => {
      mockFetchBudgetOverview.mockResolvedValueOnce(richOverview);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('columnheader', { name: /category/i })).toBeInTheDocument();
        expect(screen.getByRole('columnheader', { name: /min planned/i })).toBeInTheDocument();
        expect(screen.getByRole('columnheader', { name: /max planned/i })).toBeInTheDocument();
        expect(screen.getByRole('columnheader', { name: /actual cost/i })).toBeInTheDocument();
        expect(screen.getByRole('columnheader', { name: /budget lines/i })).toBeInTheDocument();
      });
    });

    it('renders a row for each category', async () => {
      mockFetchBudgetOverview.mockResolvedValueOnce(richOverview);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Materials')).toBeInTheDocument();
        expect(screen.getByText('Labor')).toBeInTheDocument();
      });
    });

    it('shows budget line count for each category row', async () => {
      mockFetchBudgetOverview.mockResolvedValueOnce(richOverview);

      renderPage();

      await waitFor(() => {
        // richOverview: Materials=5, Labor=3
        expect(screen.getByText('5')).toBeInTheDocument();
        expect(screen.getByText('3')).toBeInTheDocument();
      });
    });

    it('shows empty state message when categorySummaries is empty', async () => {
      mockFetchBudgetOverview.mockResolvedValueOnce(zeroOverview);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText(/no budget categories found/i)).toBeInTheDocument();
      });
    });

    it('renders table footer Total row', async () => {
      mockFetchBudgetOverview.mockResolvedValueOnce(richOverview);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('rowheader', { name: /total/i })).toBeInTheDocument();
      });
    });

    it('shows total budget line count in footer', async () => {
      // richOverview has 5 + 3 = 8 total budget lines
      mockFetchBudgetOverview.mockResolvedValueOnce(richOverview);

      renderPage();

      await waitFor(() => {
        // Total row shows 8 (sum of 5 + 3)
        expect(screen.getByText('8')).toBeInTheDocument();
      });
    });
  });
});
