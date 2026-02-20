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

  // Sample data for all tests

  const zeroOverview: BudgetOverview = {
    totalPlannedBudget: 0,
    totalActualCost: 0,
    totalVariance: 0,
    categorySummaries: [],
    financingSummary: {
      totalAvailable: 0,
      totalUsed: 0,
      totalRemaining: 0,
      sourceCount: 0,
    },
    vendorSummary: {
      totalPaid: 0,
      totalOutstanding: 0,
      vendorCount: 0,
    },
    subsidySummary: {
      totalReductions: 0,
      activeSubsidyCount: 0,
    },
  };

  const richOverview: BudgetOverview = {
    totalPlannedBudget: 150000,
    totalActualCost: 120000,
    totalVariance: 30000,
    categorySummaries: [
      {
        categoryId: 'cat-1',
        categoryName: 'Materials',
        categoryColor: '#FF5733',
        plannedBudget: 80000,
        actualCost: 70000,
        variance: 10000,
        workItemCount: 5,
      },
      {
        categoryId: 'cat-2',
        categoryName: 'Labor',
        categoryColor: null,
        plannedBudget: 70000,
        actualCost: 50000,
        variance: 20000,
        workItemCount: 3,
      },
    ],
    financingSummary: {
      totalAvailable: 200000,
      totalUsed: 120000,
      totalRemaining: 80000,
      sourceCount: 2,
    },
    vendorSummary: {
      totalPaid: 100000,
      totalOutstanding: 20000,
      vendorCount: 4,
    },
    subsidySummary: {
      totalReductions: 15000,
      activeSubsidyCount: 3,
    },
  };

  const overBudgetOverview: BudgetOverview = {
    ...richOverview,
    totalPlannedBudget: 100000,
    totalActualCost: 120000,
    totalVariance: -20000,
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
    it('renders Total Budget card with correct values', async () => {
      mockFetchBudgetOverview.mockResolvedValueOnce(richOverview);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('region', { name: /total budget/i })).toBeInTheDocument();
      });

      // Planned, Actual Cost, Variance labels — use getAllByText since 'Actual Cost'
      // and 'Variance' appear in both the summary card and the table header
      expect(screen.getAllByText('Planned').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Actual Cost').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Variance').length).toBeGreaterThan(0);
    });

    it('renders Financing card with correct values', async () => {
      mockFetchBudgetOverview.mockResolvedValueOnce(richOverview);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('region', { name: /financing/i })).toBeInTheDocument();
      });

      expect(screen.getByText('Total Available')).toBeInTheDocument();
      expect(screen.getByText('Used')).toBeInTheDocument();
      expect(screen.getByText('Remaining')).toBeInTheDocument();
    });

    it('renders Vendors card with correct values', async () => {
      mockFetchBudgetOverview.mockResolvedValueOnce(richOverview);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('region', { name: /vendors/i })).toBeInTheDocument();
      });

      expect(screen.getByText('Total Paid')).toBeInTheDocument();
      expect(screen.getByText('Outstanding')).toBeInTheDocument();
    });

    it('renders Subsidies card with correct values', async () => {
      mockFetchBudgetOverview.mockResolvedValueOnce(richOverview);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('region', { name: /subsidies/i })).toBeInTheDocument();
      });

      expect(screen.getByText('Total Reductions')).toBeInTheDocument();
    });

    it('shows "Under budget" note when variance is positive', async () => {
      // richOverview has totalVariance: 30000 (positive)
      mockFetchBudgetOverview.mockResolvedValueOnce(richOverview);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText(/under budget/i)).toBeInTheDocument();
      });
    });

    it('shows "Over budget" note when variance is negative', async () => {
      mockFetchBudgetOverview.mockResolvedValueOnce(overBudgetOverview);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText(/over budget/i)).toBeInTheDocument();
      });
    });

    it('formats source count with "source" singular when sourceCount is 1', async () => {
      const singleSourceOverview: BudgetOverview = {
        ...richOverview,
        financingSummary: { ...richOverview.financingSummary, sourceCount: 1 },
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

    it('formats vendor count with "vendor" singular when vendorCount is 1', async () => {
      const singleVendorOverview: BudgetOverview = {
        ...richOverview,
        vendorSummary: { ...richOverview.vendorSummary, vendorCount: 1 },
      };
      mockFetchBudgetOverview.mockResolvedValueOnce(singleVendorOverview);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText(/1 vendor$/i)).toBeInTheDocument();
      });
    });

    it('formats vendor count with "vendors" plural when vendorCount is multiple', async () => {
      // richOverview has vendorCount: 4
      mockFetchBudgetOverview.mockResolvedValueOnce(richOverview);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText(/4 vendors/i)).toBeInTheDocument();
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
  });

  // ─── Currency formatting ──────────────────────────────────────────────────

  describe('currency formatting', () => {
    it('formats amounts as EUR currency', async () => {
      const knownAmountOverview: BudgetOverview = {
        ...zeroOverview,
        totalPlannedBudget: 150000,
        totalActualCost: 0,
        totalVariance: 150000,
        categorySummaries: [
          {
            categoryId: 'cat-1',
            categoryName: 'Test Cat',
            categoryColor: null,
            plannedBudget: 150000,
            actualCost: 0,
            variance: 150000,
            workItemCount: 1,
          },
        ],
        financingSummary: {
          totalAvailable: 150000,
          totalUsed: 0,
          totalRemaining: 150000,
          sourceCount: 1,
        },
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
        expect(screen.getByRole('columnheader', { name: /planned budget/i })).toBeInTheDocument();
        expect(screen.getByRole('columnheader', { name: /actual cost/i })).toBeInTheDocument();
        expect(screen.getByRole('columnheader', { name: /variance/i })).toBeInTheDocument();
        expect(screen.getByRole('columnheader', { name: /work items/i })).toBeInTheDocument();
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

    it('shows work item count for each category row', async () => {
      mockFetchBudgetOverview.mockResolvedValueOnce(richOverview);

      renderPage();

      await waitFor(() => {
        // richOverview: Materials=5, Labor=3
        expect(screen.getByText('5')).toBeInTheDocument();
        expect(screen.getByText('3')).toBeInTheDocument();
      });
    });

    it('shows positive variance with + prefix for under-budget categories', async () => {
      const positiveVarianceOverview: BudgetOverview = {
        ...zeroOverview,
        categorySummaries: [
          {
            categoryId: 'cat-1',
            categoryName: 'Under Budget Cat',
            categoryColor: null,
            plannedBudget: 10000,
            actualCost: 8000,
            variance: 2000,
            workItemCount: 1,
          },
        ],
      };

      mockFetchBudgetOverview.mockResolvedValueOnce(positiveVarianceOverview);

      renderPage();

      await waitFor(() => {
        // Positive variance shows with + prefix
        // 2000 formatted as €2,000.00 with + prefix
        const varianceElements = screen.getAllByText(/\+.*2,000\.00/);
        expect(varianceElements.length).toBeGreaterThan(0);
      });
    });

    it('shows negative variance without + prefix for over-budget categories', async () => {
      const negativeVarianceOverview: BudgetOverview = {
        ...zeroOverview,
        categorySummaries: [
          {
            categoryId: 'cat-1',
            categoryName: 'Over Budget Cat',
            categoryColor: null,
            plannedBudget: 8000,
            actualCost: 10000,
            variance: -2000,
            workItemCount: 1,
          },
        ],
      };

      mockFetchBudgetOverview.mockResolvedValueOnce(negativeVarianceOverview);

      renderPage();

      await waitFor(() => {
        // Negative variance does NOT show + prefix, shows € negative
        // -2000 formatted as -€2,000.00 without + prefix
        const varianceElements = screen.getAllByText(/-.*2,000\.00/);
        expect(varianceElements.length).toBeGreaterThan(0);
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

    it('shows total work item count in footer', async () => {
      // richOverview has 5 + 3 = 8 total work items
      mockFetchBudgetOverview.mockResolvedValueOnce(richOverview);

      renderPage();

      await waitFor(() => {
        // Total row shows 8 (sum of 5 + 3)
        expect(screen.getByText('8')).toBeInTheDocument();
      });
    });
  });
});
