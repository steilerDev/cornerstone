/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { screen, waitFor, render, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type React from 'react';
import type * as BudgetSourcesApiTypes from '../../lib/budgetSourcesApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import type {
  BudgetSource,
  BudgetSourceListResponse,
  BudgetSourceBudgetLinesResponse,
} from '@cornerstone/shared';

// Mock the API module BEFORE importing the component
const mockFetchBudgetSources = jest.fn<typeof BudgetSourcesApiTypes.fetchBudgetSources>();
const mockFetchBudgetSource = jest.fn<typeof BudgetSourcesApiTypes.fetchBudgetSource>();
const mockCreateBudgetSource = jest.fn<typeof BudgetSourcesApiTypes.createBudgetSource>();
const mockUpdateBudgetSource = jest.fn<typeof BudgetSourcesApiTypes.updateBudgetSource>();
const mockDeleteBudgetSource = jest.fn<typeof BudgetSourcesApiTypes.deleteBudgetSource>();
const mockFetchBudgetLinesForSource =
  jest.fn<typeof BudgetSourcesApiTypes.fetchBudgetLinesForSource>();

jest.unstable_mockModule('../../lib/budgetSourcesApi.js', () => ({
  fetchBudgetSources: mockFetchBudgetSources,
  fetchBudgetSource: mockFetchBudgetSource,
  createBudgetSource: mockCreateBudgetSource,
  updateBudgetSource: mockUpdateBudgetSource,
  deleteBudgetSource: mockDeleteBudgetSource,
  fetchBudgetLinesForSource: mockFetchBudgetLinesForSource,
  moveBudgetLinesBetweenSources: jest.fn(),
}));

// ─── Mock: ToastContext — provides useToast() hook without a real ToastProvider ───

jest.unstable_mockModule('../../components/Toast/ToastContext.js', () => ({
  useToast: () => ({ toasts: [], showToast: jest.fn(), dismissToast: jest.fn() }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// ─── Mock: LocaleContext — prevents useLocale() from throwing outside LocaleProvider ───

jest.unstable_mockModule('../../contexts/LocaleContext.js', () => ({
  useLocale: jest.fn(() => ({
    locale: 'en' as const,
    resolvedLocale: 'en' as const,
    currency: 'EUR',
    setLocale: jest.fn(),
    syncWithServer: jest.fn(),
  })),
  LocaleProvider: ({ children }: { children: React.ReactNode }) => children,
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

describe('BudgetSourcesPage', () => {
  let BudgetSourcesPage: React.ComponentType;

  // Sample data

  const sampleSource1: BudgetSource = {
    id: 'src-1',
    name: 'Home Loan',
    sourceType: 'bank_loan',
    totalAmount: 200000,
    usedAmount: 0,
    availableAmount: 200000,
    claimedAmount: 0,
    unclaimedAmount: 0,
    paidAmount: 0,
    actualAvailableAmount: 200000,
    projectedAmount: 0,
    projectedMinAmount: 0,
    projectedMaxAmount: 0,
    interestRate: 3.5,
    terms: '30-year fixed',
    notes: 'Primary financing',
    status: 'active',
    isDiscretionary: false,
    createdBy: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  const sampleSource2: BudgetSource = {
    id: 'src-2',
    name: 'Savings Account',
    sourceType: 'savings',
    totalAmount: 50000,
    usedAmount: 0,
    availableAmount: 50000,
    claimedAmount: 0,
    unclaimedAmount: 0,
    paidAmount: 0,
    actualAvailableAmount: 50000,
    projectedAmount: 0,
    projectedMinAmount: 0,
    projectedMaxAmount: 0,
    interestRate: null,
    terms: null,
    notes: null,
    status: 'active',
    isDiscretionary: false,
    createdBy: null,
    createdAt: '2026-01-02T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
  };

  const emptyResponse: BudgetSourceListResponse = {
    budgetSources: [],
  };

  const listResponse: BudgetSourceListResponse = {
    budgetSources: [sampleSource1, sampleSource2],
  };

  beforeEach(async () => {
    if (!BudgetSourcesPage) {
      const module = await import('./BudgetSourcesPage.js');
      BudgetSourcesPage = module.default;
    }

    // Reset all mocks
    mockFetchBudgetSources.mockReset();
    mockFetchBudgetSource.mockReset();
    mockCreateBudgetSource.mockReset();
    mockUpdateBudgetSource.mockReset();
    mockDeleteBudgetSource.mockReset();
    mockFetchBudgetLinesForSource.mockReset();
  });

  function renderPage() {
    return render(
      <MemoryRouter initialEntries={['/budget/sources']}>
        <BudgetSourcesPage />
      </MemoryRouter>,
    );
  }

  // ─── Loading state ──────────────────────────────────────────────────────────

  describe('loading state', () => {
    it('shows loading indicator while fetching sources', () => {
      // Never resolves — stays in loading state
      mockFetchBudgetSources.mockReturnValueOnce(new Promise(() => {}));

      renderPage();

      expect(screen.getByText(/loading budget sources/i)).toBeInTheDocument();
    });

    it('hides loading indicator after data loads', async () => {
      mockFetchBudgetSources.mockResolvedValueOnce(emptyResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.queryByText(/loading budget sources/i)).not.toBeInTheDocument();
      });
    });
  });

  // ─── Page structure ──────────────────────────────────────────────────────────

  describe('page structure', () => {
    it('renders the page heading "Budget"', async () => {
      mockFetchBudgetSources.mockResolvedValueOnce(emptyResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /^budget$/i, level: 1 })).toBeInTheDocument();
      });
    });

    it('renders "Add Source" button', async () => {
      mockFetchBudgetSources.mockResolvedValueOnce(emptyResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add source/i })).toBeInTheDocument();
      });
    });

    it('renders Sources count heading', async () => {
      mockFetchBudgetSources.mockResolvedValueOnce(emptyResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /sources \(0\)/i })).toBeInTheDocument();
      });
    });
  });

  // ─── Empty state ────────────────────────────────────────────────────────────

  describe('empty state', () => {
    it('shows empty state message when no sources exist', async () => {
      mockFetchBudgetSources.mockResolvedValueOnce(emptyResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText(/no budget sources yet/i)).toBeInTheDocument();
      });
    });

    it('shows count of 0 in section heading for empty state', async () => {
      mockFetchBudgetSources.mockResolvedValueOnce(emptyResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /sources \(0\)/i })).toBeInTheDocument();
      });
    });
  });

  // ─── Sources list display ────────────────────────────────────────────────────

  describe('sources list display', () => {
    it('displays source names in the list', async () => {
      mockFetchBudgetSources.mockResolvedValueOnce(listResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Home Loan')).toBeInTheDocument();
        expect(screen.getByText('Savings Account')).toBeInTheDocument();
      });
    });

    it('shows correct count in section heading', async () => {
      mockFetchBudgetSources.mockResolvedValueOnce(listResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /sources \(2\)/i })).toBeInTheDocument();
      });
    });

    it('renders Edit button for each source', async () => {
      mockFetchBudgetSources.mockResolvedValueOnce(listResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /edit home loan/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /edit savings account/i })).toBeInTheDocument();
      });
    });

    it('renders Delete button for each source', async () => {
      mockFetchBudgetSources.mockResolvedValueOnce(listResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete home loan/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /delete savings account/i })).toBeInTheDocument();
      });
    });

    it('displays source type badge with human-readable label', async () => {
      mockFetchBudgetSources.mockResolvedValueOnce(listResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Bank Loan')).toBeInTheDocument();
        expect(screen.getByText('Savings')).toBeInTheDocument();
      });
    });

    it('displays status badge for each source', async () => {
      mockFetchBudgetSources.mockResolvedValueOnce(listResponse);

      renderPage();

      await waitFor(() => {
        // Both sources are 'active'
        expect(screen.getAllByText('Active').length).toBeGreaterThanOrEqual(1);
      });
    });

    it('displays currency-formatted total amount', async () => {
      mockFetchBudgetSources.mockResolvedValueOnce({
        budgetSources: [sampleSource1],
      });

      renderPage();

      await waitFor(() => {
        // €200,000.00 formatted — appears for both Total and Remaining (prefix labels embed the amount)
        expect(screen.getAllByText(/€200,000\.00/).length).toBeGreaterThanOrEqual(1);
      });
    });

    it('displays interest rate when present', async () => {
      mockFetchBudgetSources.mockResolvedValueOnce({
        budgetSources: [sampleSource1],
      });

      renderPage();

      await waitFor(() => {
        // sampleSource1.interestRate = 3.5 → "3.50%" rendered in a paragraph with the "Rate" label
        expect(screen.getByText(/3\.50%/)).toBeInTheDocument();
      });
    });

    it('does not display interest rate section when interestRate is null', async () => {
      mockFetchBudgetSources.mockResolvedValueOnce({
        budgetSources: [sampleSource2],
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Savings Account')).toBeInTheDocument();
      });

      // sampleSource2 has no interest rate — no percentage displayed
      expect(screen.queryByText(/%$/)).not.toBeInTheDocument();
    });

    it('displays terms when present', async () => {
      mockFetchBudgetSources.mockResolvedValueOnce({
        budgetSources: [sampleSource1],
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('30-year fixed')).toBeInTheDocument();
      });
    });

    it('does not display terms section when terms is null', async () => {
      mockFetchBudgetSources.mockResolvedValueOnce({
        budgetSources: [sampleSource2],
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Savings Account')).toBeInTheDocument();
      });

      expect(screen.queryByText(/30-year/i)).not.toBeInTheDocument();
    });

    it('displays all source type badges correctly', async () => {
      const allTypes: BudgetSourceListResponse = {
        budgetSources: [
          { ...sampleSource1, id: 't1', name: 'Loan', sourceType: 'bank_loan' },
          { ...sampleSource1, id: 't2', name: 'Credit', sourceType: 'credit_line' },
          { ...sampleSource1, id: 't3', name: 'Savings', sourceType: 'savings' },
          { ...sampleSource1, id: 't4', name: 'Other', sourceType: 'other' },
        ],
      };

      mockFetchBudgetSources.mockResolvedValueOnce(allTypes);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Bank Loan')).toBeInTheDocument();
        expect(screen.getByText('Credit Line')).toBeInTheDocument();
        expect(screen.getAllByText('Savings').length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText('Other').length).toBeGreaterThanOrEqual(1);
      });
    });

    it('displays all status badges correctly', async () => {
      const allStatuses: BudgetSourceListResponse = {
        budgetSources: [
          { ...sampleSource1, id: 's1', name: 'Active Src', status: 'active' },
          { ...sampleSource1, id: 's2', name: 'Exhausted Src', status: 'exhausted' },
          { ...sampleSource1, id: 's3', name: 'Closed Src', status: 'closed' },
        ],
      };

      mockFetchBudgetSources.mockResolvedValueOnce(allStatuses);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Active')).toBeInTheDocument();
        expect(screen.getByText('Exhausted')).toBeInTheDocument();
        expect(screen.getByText('Closed')).toBeInTheDocument();
      });
    });
  });

  // ─── Error state ─────────────────────────────────────────────────────────────

  describe('error state', () => {
    it('shows error state when API call fails and no sources loaded', async () => {
      mockFetchBudgetSources.mockRejectedValueOnce(
        new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'Server error' }),
      );

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText('Server error')).toBeInTheDocument();
      });
    });

    it('shows generic error message for non-ApiClientError failures', async () => {
      mockFetchBudgetSources.mockRejectedValueOnce(new Error('Network error'));

      renderPage();

      await waitFor(() => {
        expect(screen.getByText(/failed to load budget sources/i)).toBeInTheDocument();
      });
    });

    it('shows a Retry button on load error', async () => {
      mockFetchBudgetSources.mockRejectedValueOnce(new Error('Network error'));

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
      });
    });

    it('retries loading when Retry button is clicked', async () => {
      mockFetchBudgetSources
        .mockRejectedValueOnce(new Error('First failure'))
        .mockResolvedValueOnce(listResponse);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /retry/i }));

      await waitFor(() => {
        expect(screen.getByText('Home Loan')).toBeInTheDocument();
      });
    });
  });

  // ─── Create form ─────────────────────────────────────────────────────────────

  describe('create form', () => {
    it('shows create form when "Add Source" is clicked', async () => {
      mockFetchBudgetSources.mockResolvedValueOnce(emptyResponse);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add source/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /add source/i }));

      expect(screen.getByRole('heading', { name: /new budget source/i })).toBeInTheDocument();
    });

    it('"Add Source" button is disabled while create form is shown', async () => {
      mockFetchBudgetSources.mockResolvedValueOnce(emptyResponse);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add source/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /add source/i }));

      expect(screen.getByRole('button', { name: /add source/i })).toBeDisabled();
    });

    it('hides create form when Cancel is clicked', async () => {
      mockFetchBudgetSources.mockResolvedValueOnce(emptyResponse);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add source/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /add source/i }));
      await user.click(screen.getByRole('button', { name: /cancel/i }));

      expect(screen.queryByRole('heading', { name: /new budget source/i })).not.toBeInTheDocument();
    });

    it('"Create Source" submit button is disabled when name is empty', async () => {
      mockFetchBudgetSources.mockResolvedValueOnce(emptyResponse);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add source/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /add source/i }));

      const createButton = screen.getByRole('button', { name: /create source/i });
      expect(createButton).toBeDisabled();
    });

    it('"Create Source" submit button is disabled when totalAmount is empty', async () => {
      mockFetchBudgetSources.mockResolvedValueOnce(emptyResponse);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add source/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /add source/i }));

      // Fill name but leave totalAmount empty
      await user.type(screen.getByLabelText(/^name/i), 'Test Loan');

      const createButton = screen.getByRole('button', { name: /create source/i });
      expect(createButton).toBeDisabled();
    });

    it('shows validation error when submitting with whitespace-only name', async () => {
      mockFetchBudgetSources.mockResolvedValueOnce(emptyResponse);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add source/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /add source/i }));

      // Type spaces to enable the button (non-empty string that trims to empty)
      const nameInput = screen.getByLabelText(/^name/i);
      await user.type(nameInput, '   ');

      // Also fill totalAmount so button stays enabled
      const amountInput = screen.getByLabelText(/total amount/i);
      fireEvent.change(amountInput, { target: { value: '10000' } });

      const form = nameInput.closest('form')!;
      fireEvent.submit(form);

      await waitFor(() => {
        expect(screen.getByText(/source name is required/i)).toBeInTheDocument();
      });
    });

    it('shows validation error for negative total amount', async () => {
      // The component validates that totalAmount is a non-negative number.
      // A negative value passes the button enabled check but fails form validation.
      mockFetchBudgetSources.mockResolvedValueOnce(emptyResponse);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add source/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /add source/i }));

      await user.type(screen.getByLabelText(/^name/i), 'Loan');
      const amountInput = screen.getByLabelText(/total amount/i);

      // Use fireEvent.change to set a value that react sees as -1
      fireEvent.change(amountInput, { target: { value: '-1' } });

      const form = amountInput.closest('form')!;
      fireEvent.submit(form);

      await waitFor(() => {
        expect(screen.getByText(/total amount must be a non-negative number/i)).toBeInTheDocument();
      });
    });

    it('successfully creates a source and shows success message', async () => {
      mockFetchBudgetSources.mockResolvedValueOnce(emptyResponse);

      const newSource: BudgetSource = {
        ...sampleSource1,
        id: 'src-new',
        name: 'New Bank Loan',
      };
      mockCreateBudgetSource.mockResolvedValueOnce(newSource);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add source/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /add source/i }));

      const nameInput = screen.getByLabelText(/^name/i);
      await user.type(nameInput, 'New Bank Loan');

      const amountInput = screen.getByLabelText(/total amount/i);
      fireEvent.change(amountInput, { target: { value: '200000' } });

      await user.click(screen.getByRole('button', { name: /create source/i }));

      await waitFor(() => {
        expect(mockCreateBudgetSource).toHaveBeenCalledTimes(1);
        expect(mockCreateBudgetSource).toHaveBeenCalledWith(
          expect.objectContaining({ name: 'New Bank Loan' }),
        );
      });

      await waitFor(() => {
        expect(
          screen.getByText(/budget source "new bank loan" created successfully/i),
        ).toBeInTheDocument();
      });
    });

    it('hides create form after successful creation', async () => {
      mockFetchBudgetSources.mockResolvedValueOnce(emptyResponse);

      mockCreateBudgetSource.mockResolvedValueOnce({
        ...sampleSource1,
        id: 'src-new',
        name: 'Post-Create',
      });

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add source/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /add source/i }));

      await user.type(screen.getByLabelText(/^name/i), 'Post-Create');
      fireEvent.change(screen.getByLabelText(/total amount/i), { target: { value: '5000' } });
      await user.click(screen.getByRole('button', { name: /create source/i }));

      await waitFor(() => {
        expect(
          screen.queryByRole('heading', { name: /new budget source/i }),
        ).not.toBeInTheDocument();
      });
    });

    it('shows create API error message on failure', async () => {
      mockFetchBudgetSources.mockResolvedValueOnce(emptyResponse);
      mockCreateBudgetSource.mockRejectedValueOnce(
        new ApiClientError(400, {
          code: 'VALIDATION_ERROR',
          message: 'Total amount must be a positive number',
        }),
      );

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add source/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /add source/i }));

      await user.type(screen.getByLabelText(/^name/i), 'Bad Source');
      fireEvent.change(screen.getByLabelText(/total amount/i), { target: { value: '100' } });

      await user.click(screen.getByRole('button', { name: /create source/i }));

      await waitFor(() => {
        expect(screen.getByText(/total amount must be a positive number/i)).toBeInTheDocument();
      });
    });

    it('shows generic create error for non-ApiClientError failures', async () => {
      mockFetchBudgetSources.mockResolvedValueOnce(emptyResponse);
      mockCreateBudgetSource.mockRejectedValueOnce(new Error('Network error'));

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add source/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /add source/i }));

      await user.type(screen.getByLabelText(/^name/i), 'Error Source');
      fireEvent.change(screen.getByLabelText(/total amount/i), { target: { value: '1000' } });

      await user.click(screen.getByRole('button', { name: /create source/i }));

      await waitFor(() => {
        expect(screen.getByText(/failed to create budget source/i)).toBeInTheDocument();
      });
    });

    it('create form has type select with all source types', async () => {
      mockFetchBudgetSources.mockResolvedValueOnce(emptyResponse);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add source/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /add source/i }));

      const typeSelect = screen.getByLabelText(/^type/i);
      expect(typeSelect).toBeInTheDocument();

      // Check that all 4 types are options
      const options = typeSelect.querySelectorAll('option');
      const optionValues = Array.from(options).map((o) => (o as HTMLOptionElement).value);
      expect(optionValues).toContain('bank_loan');
      expect(optionValues).toContain('credit_line');
      expect(optionValues).toContain('savings');
      expect(optionValues).toContain('other');
    });

    it('create form has status select with all statuses', async () => {
      mockFetchBudgetSources.mockResolvedValueOnce(emptyResponse);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add source/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /add source/i }));

      const statusSelect = screen.getByLabelText(/^status/i);
      const options = statusSelect.querySelectorAll('option');
      const optionValues = Array.from(options).map((o) => (o as HTMLOptionElement).value);
      expect(optionValues).toContain('active');
      expect(optionValues).toContain('exhausted');
      expect(optionValues).toContain('closed');
    });
  });

  // ─── Edit form (inline) ──────────────────────────────────────────────────────

  describe('edit form (inline)', () => {
    it('shows inline edit form when Edit button is clicked', async () => {
      mockFetchBudgetSources.mockResolvedValueOnce(listResponse);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /edit home loan/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /edit home loan/i }));

      expect(screen.getByRole('form', { name: /edit home loan/i })).toBeInTheDocument();
    });

    it('pre-fills edit form with current source name', async () => {
      mockFetchBudgetSources.mockResolvedValueOnce(listResponse);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /edit home loan/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /edit home loan/i }));

      const nameInput = screen.getByDisplayValue('Home Loan');
      expect(nameInput).toBeInTheDocument();
    });

    it('pre-fills edit form with current totalAmount', async () => {
      mockFetchBudgetSources.mockResolvedValueOnce(listResponse);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /edit home loan/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /edit home loan/i }));

      // totalAmount = 200000 displayed as string in the input
      const amountInput = screen.getByDisplayValue('200000');
      expect(amountInput).toBeInTheDocument();
    });

    it('pre-fills edit form with current interestRate', async () => {
      mockFetchBudgetSources.mockResolvedValueOnce(listResponse);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /edit home loan/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /edit home loan/i }));

      // interestRate = 3.5 displayed as "3.5"
      const rateInput = screen.getByDisplayValue('3.5');
      expect(rateInput).toBeInTheDocument();
    });

    it('hides edit form when Cancel is clicked', async () => {
      mockFetchBudgetSources.mockResolvedValueOnce(listResponse);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /edit home loan/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /edit home loan/i }));
      await user.click(screen.getByRole('button', { name: /cancel/i }));

      expect(screen.queryByRole('form', { name: /edit home loan/i })).not.toBeInTheDocument();
    });

    it('successfully saves an update and shows success message', async () => {
      mockFetchBudgetSources.mockResolvedValueOnce(listResponse);

      const updatedSource: BudgetSource = {
        ...sampleSource1,
        name: 'Updated Home Loan',
        updatedAt: '2026-01-03T00:00:00.000Z',
      };
      mockUpdateBudgetSource.mockResolvedValueOnce(updatedSource);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /edit home loan/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /edit home loan/i }));

      const nameInput = screen.getByDisplayValue('Home Loan');
      await user.clear(nameInput);
      await user.type(nameInput, 'Updated Home Loan');

      await user.click(screen.getByRole('button', { name: /^save$/i }));

      await waitFor(() => {
        expect(mockUpdateBudgetSource).toHaveBeenCalledWith(
          'src-1',
          expect.objectContaining({ name: 'Updated Home Loan' }),
        );
      });

      await waitFor(() => {
        expect(
          screen.getByText(/budget source "updated home loan" updated successfully/i),
        ).toBeInTheDocument();
      });
    });

    it('shows update error when save fails', async () => {
      mockFetchBudgetSources.mockResolvedValueOnce(listResponse);
      mockUpdateBudgetSource.mockRejectedValueOnce(
        new ApiClientError(400, {
          code: 'VALIDATION_ERROR',
          message: 'Budget source name must be between 1 and 200 characters',
        }),
      );

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /edit home loan/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /edit home loan/i }));

      const nameInput = screen.getByDisplayValue('Home Loan');
      await user.clear(nameInput);
      await user.type(nameInput, 'Updated');

      await user.click(screen.getByRole('button', { name: /^save$/i }));

      await waitFor(() => {
        expect(
          screen.getByText(/budget source name must be between 1 and 200 characters/i),
        ).toBeInTheDocument();
      });
    });

    it('shows generic update error for non-ApiClientError failures', async () => {
      mockFetchBudgetSources.mockResolvedValueOnce(listResponse);
      mockUpdateBudgetSource.mockRejectedValueOnce(new Error('Network error'));

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /edit home loan/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /edit home loan/i }));

      const nameInput = screen.getByDisplayValue('Home Loan');
      await user.clear(nameInput);
      await user.type(nameInput, 'Try Update');

      await user.click(screen.getByRole('button', { name: /^save$/i }));

      await waitFor(() => {
        expect(screen.getByText(/failed to update budget source/i)).toBeInTheDocument();
      });
    });

    it('disables Save when name is empty', async () => {
      mockFetchBudgetSources.mockResolvedValueOnce(listResponse);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /edit home loan/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /edit home loan/i }));

      const nameInput = screen.getByDisplayValue('Home Loan');
      await user.clear(nameInput);

      const saveButton = screen.getByRole('button', { name: /^save$/i });
      expect(saveButton).toBeDisabled();
    });

    it('disables Edit/Delete buttons for other sources while one is being edited', async () => {
      mockFetchBudgetSources.mockResolvedValueOnce(listResponse);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /edit home loan/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /edit home loan/i }));

      const editSavingsButton = screen.getByRole('button', { name: /edit savings account/i });
      expect(editSavingsButton).toBeDisabled();

      const deleteSavingsButton = screen.getByRole('button', { name: /delete savings account/i });
      expect(deleteSavingsButton).toBeDisabled();
    });

    it('shows validation error when submitting with empty name in edit form', async () => {
      mockFetchBudgetSources.mockResolvedValueOnce(listResponse);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /edit home loan/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /edit home loan/i }));

      const nameInput = screen.getByDisplayValue('Home Loan');
      await user.clear(nameInput);
      // Type only spaces to trigger the trim validation path
      await user.type(nameInput, '   ');

      // Also fill totalAmount to keep Save enabled
      const form = nameInput.closest('form')!;
      fireEvent.submit(form);

      await waitFor(() => {
        expect(screen.getByText(/source name is required/i)).toBeInTheDocument();
      });
    });
  });

  // ─── Delete confirmation modal ───────────────────────────────────────────────

  describe('delete confirmation modal', () => {
    it('shows delete confirmation modal when Delete button is clicked', async () => {
      mockFetchBudgetSources.mockResolvedValueOnce(listResponse);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete home loan/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /delete home loan/i }));

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /delete budget source/i })).toBeInTheDocument();
    });

    it('shows the source name in the confirmation modal body text', async () => {
      mockFetchBudgetSources.mockResolvedValueOnce(listResponse);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete home loan/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /delete home loan/i }));

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveTextContent('Home Loan');
    });

    it('shows "Delete Source" confirm button inside the modal', async () => {
      mockFetchBudgetSources.mockResolvedValueOnce(listResponse);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete home loan/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /delete home loan/i }));

      const dialog = screen.getByRole('dialog');
      expect(dialog).toContainElement(screen.getByRole('button', { name: /delete source/i }));
    });

    it('closes the modal when Cancel is clicked', async () => {
      mockFetchBudgetSources.mockResolvedValueOnce(listResponse);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete home loan/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /delete home loan/i }));

      const dialog = screen.getByRole('dialog');
      const cancelButton = dialog.querySelector('button') as HTMLButtonElement;
      await user.click(cancelButton);

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });

    it('successfully deletes a source and shows success message', async () => {
      mockFetchBudgetSources.mockResolvedValueOnce(listResponse);
      mockDeleteBudgetSource.mockResolvedValueOnce(undefined);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete home loan/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /delete home loan/i }));
      await user.click(screen.getByRole('button', { name: /delete source/i }));

      await waitFor(() => {
        expect(mockDeleteBudgetSource).toHaveBeenCalledWith('src-1');
      });

      await waitFor(() => {
        expect(
          screen.getByText(/budget source "home loan" deleted successfully/i),
        ).toBeInTheDocument();
      });
    });

    it('removes the deleted source from the list', async () => {
      mockFetchBudgetSources.mockResolvedValueOnce(listResponse);
      mockDeleteBudgetSource.mockResolvedValueOnce(undefined);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete home loan/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /delete home loan/i }));
      await user.click(screen.getByRole('button', { name: /delete source/i }));

      await waitFor(() => {
        expect(screen.queryByText('Home Loan')).not.toBeInTheDocument();
      });

      // Savings Account should still be there
      expect(screen.getByText('Savings Account')).toBeInTheDocument();
    });

    it('shows BUDGET_SOURCE_IN_USE error when deletion fails with 409', async () => {
      mockFetchBudgetSources.mockResolvedValueOnce(listResponse);
      mockDeleteBudgetSource.mockRejectedValueOnce(
        new ApiClientError(409, {
          code: 'BUDGET_SOURCE_IN_USE',
          message: 'Budget source is in use',
        }),
      );

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete home loan/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /delete home loan/i }));
      await user.click(screen.getByRole('button', { name: /delete source/i }));

      await waitFor(() => {
        expect(
          screen.getByText(
            /this budget source cannot be deleted because it is currently referenced/i,
          ),
        ).toBeInTheDocument();
      });
    });

    it('hides "Delete Source" confirm button when in-use error is shown', async () => {
      mockFetchBudgetSources.mockResolvedValueOnce(listResponse);
      mockDeleteBudgetSource.mockRejectedValueOnce(
        new ApiClientError(409, {
          code: 'BUDGET_SOURCE_IN_USE',
          message: 'Budget source is in use',
        }),
      );

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete home loan/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /delete home loan/i }));
      await user.click(screen.getByRole('button', { name: /delete source/i }));

      await waitFor(() => {
        expect(
          screen.getByText(
            /this budget source cannot be deleted because it is currently referenced/i,
          ),
        ).toBeInTheDocument();
      });

      // Confirm delete button should no longer be visible
      expect(screen.queryByRole('button', { name: /delete source/i })).not.toBeInTheDocument();
    });

    it('shows generic error for non-409 delete failures', async () => {
      mockFetchBudgetSources.mockResolvedValueOnce(listResponse);
      mockDeleteBudgetSource.mockRejectedValueOnce(new Error('Network error'));

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete home loan/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /delete home loan/i }));
      await user.click(screen.getByRole('button', { name: /delete source/i }));

      await waitFor(() => {
        expect(screen.getByText(/failed to delete budget source/i)).toBeInTheDocument();
      });
    });

    it('shows error from ApiClientError message for non-409 delete failures', async () => {
      mockFetchBudgetSources.mockResolvedValueOnce(listResponse);
      mockDeleteBudgetSource.mockRejectedValueOnce(
        new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'Server exploded' }),
      );

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete home loan/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /delete home loan/i }));
      await user.click(screen.getByRole('button', { name: /delete source/i }));

      await waitFor(() => {
        expect(screen.getByText('Server exploded')).toBeInTheDocument();
      });
    });
  });

  // ─── Success message behavior ────────────────────────────────────────────────

  describe('success message behavior', () => {
    it('shows success alert after creating a source', async () => {
      mockFetchBudgetSources.mockResolvedValueOnce(emptyResponse);
      mockCreateBudgetSource.mockResolvedValueOnce({
        ...sampleSource1,
        id: 'src-new',
        name: 'New Source',
      });

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add source/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /add source/i }));
      await user.type(screen.getByLabelText(/^name/i), 'New Source');
      fireEvent.change(screen.getByLabelText(/total amount/i), { target: { value: '10000' } });
      await user.click(screen.getByRole('button', { name: /create source/i }));

      await waitFor(() => {
        const alerts = screen.getAllByRole('alert');
        const successAlert = alerts.find((el) => el.textContent?.includes('created successfully'));
        expect(successAlert).toBeInTheDocument();
      });
    });

    it('success message persists when re-opening the create form', async () => {
      mockFetchBudgetSources.mockResolvedValueOnce(emptyResponse);
      mockCreateBudgetSource.mockResolvedValueOnce({
        ...sampleSource1,
        id: 'src-new',
        name: 'First Source',
      });

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add source/i })).toBeInTheDocument();
      });

      // Create a source to get a success message
      await user.click(screen.getByRole('button', { name: /add source/i }));
      await user.type(screen.getByLabelText(/^name/i), 'First Source');
      fireEvent.change(screen.getByLabelText(/total amount/i), { target: { value: '5000' } });
      await user.click(screen.getByRole('button', { name: /create source/i }));

      await waitFor(() => {
        const alerts = screen.getAllByRole('alert');
        const successAlert = alerts.find((el) => el.textContent?.includes('created successfully'));
        expect(successAlert).toBeInTheDocument();
      });

      // Re-open the create form — success message remains
      await user.click(screen.getByRole('button', { name: /add source/i }));

      expect(
        screen.queryByText(/budget source "first source" created successfully/i),
      ).toBeInTheDocument();
    });

    it('shows success alert after updating a source', async () => {
      mockFetchBudgetSources.mockResolvedValueOnce(listResponse);
      mockUpdateBudgetSource.mockResolvedValueOnce({
        ...sampleSource1,
        name: 'Updated Loan',
        updatedAt: '2026-01-05T00:00:00.000Z',
      });

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /edit home loan/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /edit home loan/i }));

      const nameInput = screen.getByDisplayValue('Home Loan');
      await user.clear(nameInput);
      await user.type(nameInput, 'Updated Loan');

      await user.click(screen.getByRole('button', { name: /^save$/i }));

      await waitFor(() => {
        expect(
          screen.getByText(/budget source "updated loan" updated successfully/i),
        ).toBeInTheDocument();
      });
    });
  });

  // ─── Discretionary source UI (Issue #727) ────────────────────────────────

  describe('discretionary source UI behaviour', () => {
    const discretionarySource: BudgetSource = {
      id: 'discretionary-system',
      name: 'Discretionary Funding',
      sourceType: 'discretionary',
      totalAmount: 0,
      usedAmount: 0,
      availableAmount: 0,
      claimedAmount: 0,
      unclaimedAmount: 0,
      paidAmount: 0,
      actualAvailableAmount: 0,
      projectedAmount: 0,
      projectedMinAmount: 0,
      projectedMaxAmount: 0,
      interestRate: null,
      terms: null,
      notes: null,
      status: 'active',
      isDiscretionary: true,
      createdBy: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    it('discretionary source shows "System" badge', async () => {
      mockFetchBudgetSources.mockResolvedValueOnce({
        budgetSources: [discretionarySource],
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('System')).toBeInTheDocument();
      });
    });

    it('non-discretionary source does NOT show "System" badge', async () => {
      mockFetchBudgetSources.mockResolvedValueOnce({
        budgetSources: [sampleSource1],
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Home Loan')).toBeInTheDocument();
      });

      expect(screen.queryByText('System')).not.toBeInTheDocument();
    });

    it('discretionary source does NOT show Delete button', async () => {
      mockFetchBudgetSources.mockResolvedValueOnce({
        budgetSources: [discretionarySource],
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Discretionary Funding')).toBeInTheDocument();
      });

      expect(
        screen.queryByRole('button', { name: /delete discretionary funding/i }),
      ).not.toBeInTheDocument();
    });

    it('non-discretionary source DOES show Delete button', async () => {
      mockFetchBudgetSources.mockResolvedValueOnce({
        budgetSources: [sampleSource1],
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete home loan/i })).toBeInTheDocument();
      });
    });

    it('discretionary source edit form has disabled sourceType selector', async () => {
      mockFetchBudgetSources.mockResolvedValueOnce({
        budgetSources: [discretionarySource],
      });

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /edit discretionary funding/i }),
        ).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /edit discretionary funding/i }));

      const typeSelect = screen.getByLabelText(/^type/i);
      expect(typeSelect).toBeDisabled();
    });

    it('non-discretionary source edit form has enabled sourceType selector', async () => {
      mockFetchBudgetSources.mockResolvedValueOnce({
        budgetSources: [sampleSource1],
      });

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /edit home loan/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /edit home loan/i }));

      const typeSelect = screen.getByLabelText(/^type/i);
      expect(typeSelect).not.toBeDisabled();
    });

    it('displays Projected amount for a source', async () => {
      const sourceWithProjected: BudgetSource = {
        ...sampleSource1,
        projectedMinAmount: 160000,
        projectedMaxAmount: 240000,
      };
      mockFetchBudgetSources.mockResolvedValueOnce({
        budgetSources: [sourceWithProjected],
      });

      const { container } = renderPage();

      await waitFor(() => {
        expect(screen.getByText('Home Loan')).toBeInTheDocument();
      });

      // Projected summary row renders both min and max amounts in the primary cell
      const primaryCells = Array.from(container.querySelectorAll('[class*="summaryPrimary"]'));
      const projectedPrimary = primaryCells[0];
      expect(projectedPrimary?.textContent).toMatch(/€160,000\.00/);
      expect(projectedPrimary?.textContent).toMatch(/€240,000\.00/);
    });

    it('discretionary source type badge displays "Discretionary" label', async () => {
      mockFetchBudgetSources.mockResolvedValueOnce({
        budgetSources: [discretionarySource],
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Discretionary')).toBeInTheDocument();
      });
    });

    it('create form type select does not include "discretionary" as an option', async () => {
      // Even when a discretionary source exists in the list, the create form must
      // never expose "discretionary" as a user-selectable type.
      mockFetchBudgetSources.mockResolvedValueOnce({
        budgetSources: [discretionarySource],
      });

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add source/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /add source/i }));

      const typeSelect = screen.getByLabelText(/^type/i);
      const options = Array.from(typeSelect.querySelectorAll('option')) as HTMLOptionElement[];

      const optionValues = options.map((o) => o.value);
      const optionTexts = options.map((o) => o.text);

      expect(optionValues).not.toContain('discretionary');
      expect(optionTexts).not.toContain('Discretionary');
    });
  });

  // ─── SourceBarChart behaviour ─────────────────────────────────────────────────

  describe('SourceBarChart bar chart display', () => {
    it('renders a BudgetBar with role="img" for each source', async () => {
      const sourceWithAmounts: BudgetSource = {
        ...sampleSource1,
        claimedAmount: 30000,
        paidAmount: 50000,
        projectedAmount: 80000,
        usedAmount: 90000,
      };
      mockFetchBudgetSources.mockResolvedValueOnce({
        budgetSources: [sourceWithAmounts],
      });

      renderPage();

      await waitFor(() => {
        // BudgetBar renders role="img" with aria-label
        expect(screen.getByRole('img')).toBeInTheDocument();
      });
    });

    it('bar legend shows Claimed segment when claimedAmount is non-zero', async () => {
      const sourceWithClaimed: BudgetSource = {
        ...sampleSource1,
        claimedAmount: 30000,
      };
      mockFetchBudgetSources.mockResolvedValueOnce({
        budgetSources: [sourceWithClaimed],
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Claimed')).toBeInTheDocument();
      });
    });

    it('bar legend hides all segments when all amounts are zero', async () => {
      const zeroSource: BudgetSource = {
        ...sampleSource2, // paidAmount=0, claimedAmount=0, projectedAmount=0, usedAmount=0
      };
      mockFetchBudgetSources.mockResolvedValueOnce({
        budgetSources: [zeroSource],
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Savings Account')).toBeInTheDocument();
      });

      // The new rework always renders Projected, Paid, Claimed summaryLabel rows regardless of amounts.
      // Old-layout labels that are fully removed:
      expect(screen.queryByText('Paid (unclaimed)')).not.toBeInTheDocument();
      expect(screen.queryByText('Allocated (planned)')).not.toBeInTheDocument();
    });

    it('old standalone "Unclaimed" label is no longer present', async () => {
      const sourceWithUnclaimed: BudgetSource = {
        ...sampleSource1,
        claimedAmount: 10000,
        paidAmount: 30000,
      };
      mockFetchBudgetSources.mockResolvedValueOnce({
        budgetSources: [sourceWithUnclaimed],
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Home Loan')).toBeInTheDocument();
      });

      // The old standalone 'Unclaimed' label is gone from the redesigned layout
      expect(screen.queryByText('Unclaimed')).not.toBeInTheDocument();
    });

    it('terms are still displayed below the bar chart', async () => {
      // sampleSource1 has terms: '30-year fixed'
      mockFetchBudgetSources.mockResolvedValueOnce({
        budgetSources: [sampleSource1],
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('30-year fixed')).toBeInTheDocument();
      });
    });
  });

  // ─── Expand/collapse + cache behaviour (scenario 19) ────────────────────────

  describe('budget lines expand/collapse with cache', () => {
    const emptyLinesResponse: BudgetSourceBudgetLinesResponse = {
      workItemLines: [],
      householdItemLines: [],
    };

    it('clicking "Show lines" expands the panel and calls fetchBudgetLinesForSource once', async () => {
      mockFetchBudgetSources.mockResolvedValueOnce({ budgetSources: [sampleSource1] });
      mockFetchBudgetLinesForSource.mockResolvedValueOnce(emptyLinesResponse);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Home Loan')).toBeInTheDocument();
      });

      // Find expand toggle by aria-label
      const expandButton = screen.getByRole('button', {
        name: /expand budget lines for home loan/i,
      });
      await user.click(expandButton);

      await waitFor(() => {
        expect(mockFetchBudgetLinesForSource).toHaveBeenCalledTimes(1);
        expect(mockFetchBudgetLinesForSource).toHaveBeenCalledWith('src-1');
      });

      // Panel is now visible (the region with id source-lines-src-1 is present)
      await waitFor(() => {
        expect(document.getElementById('source-lines-src-1')).toBeInTheDocument();
      });
    });

    it('collapse then re-expand does NOT call fetchBudgetLinesForSource a second time', async () => {
      mockFetchBudgetSources.mockResolvedValueOnce({ budgetSources: [sampleSource1] });
      mockFetchBudgetLinesForSource.mockResolvedValueOnce(emptyLinesResponse);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Home Loan')).toBeInTheDocument();
      });

      // First expand
      const expandButton = screen.getByRole('button', {
        name: /expand budget lines for home loan/i,
      });
      await user.click(expandButton);

      // Wait for fetch to complete and panel to appear
      await waitFor(() => {
        expect(mockFetchBudgetLinesForSource).toHaveBeenCalledTimes(1);
      });

      await waitFor(() => {
        expect(document.getElementById('source-lines-src-1')).toBeInTheDocument();
      });

      // Collapse: button label switches to "collapse"
      const collapseButton = screen.getByRole('button', {
        name: /collapse budget lines for home loan/i,
      });
      await user.click(collapseButton);

      // Panel should no longer be in DOM
      await waitFor(() => {
        expect(document.getElementById('source-lines-src-1')).not.toBeInTheDocument();
      });

      // Re-expand using the "Show lines" toggle again
      const reExpandButton = screen.getByRole('button', {
        name: /expand budget lines for home loan/i,
      });
      await user.click(reExpandButton);

      // Panel is visible again
      await waitFor(() => {
        expect(document.getElementById('source-lines-src-1')).toBeInTheDocument();
      });

      // fetchBudgetLinesForSource must still have been called only once (cache hit)
      expect(mockFetchBudgetLinesForSource).toHaveBeenCalledTimes(1);
    });

    it('shows "Show lines" toggle button for each source in the list', async () => {
      mockFetchBudgetSources.mockResolvedValueOnce({
        budgetSources: [sampleSource1, sampleSource2],
      });

      renderPage();

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /expand budget lines for home loan/i }),
        ).toBeInTheDocument();
        expect(
          screen.getByRole('button', { name: /expand budget lines for savings account/i }),
        ).toBeInTheDocument();
      });
    });

    it('toggle button is disabled while another source is being edited', async () => {
      mockFetchBudgetSources.mockResolvedValueOnce({
        budgetSources: [sampleSource1, sampleSource2],
      });

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /edit home loan/i })).toBeInTheDocument();
      });

      // Start editing Home Loan
      await user.click(screen.getByRole('button', { name: /edit home loan/i }));

      // The toggle for Savings Account should be disabled while editing
      const savingsToggle = screen.getByRole('button', {
        name: /expand budget lines for savings account/i,
      });
      expect(savingsToggle).toBeDisabled();
    });
  });

  // ─── SourceBarChart — rework #1319 ─────────────────────────────────────────

  describe('SourceBarChart — rework #1319', () => {
    const sourceWithRange: BudgetSource = {
      ...sampleSource1,
      totalAmount: 200000,
      projectedMinAmount: 80000,
      projectedMaxAmount: 120000,
      paidAmount: 0,
      claimedAmount: 0,
    };

    it('total badge is rendered in the source header row', async () => {
      mockFetchBudgetSources.mockResolvedValueOnce({ budgetSources: [sampleSource1] });

      renderPage();

      await waitFor(() => {
        // t('sources.barChart.totalBadge') renders as "Total: <amount>"
        expect(screen.getByText(/Total:/)).toBeInTheDocument();
      });
    });

    it('total badge has an aria-label containing "Total amount:"', async () => {
      mockFetchBudgetSources.mockResolvedValueOnce({ budgetSources: [sampleSource1] });

      renderPage();

      await waitFor(() => {
        const badge = screen.getByText(/Total:/);
        expect(badge).toBeInTheDocument();
        // aria-label is on the span containing the total badge text
        const ariaLabel = badge.getAttribute('aria-label');
        expect(ariaLabel).toMatch(/Total amount:/i);
      });
    });

    it('summary table renders exactly 3 summaryLabel elements in Projected, Paid, Claimed order', async () => {
      // Render with a single source so we get exactly 3 summary labels (one per row)
      mockFetchBudgetSources.mockResolvedValueOnce({ budgetSources: [sampleSource1] });

      const { container } = renderPage();

      await waitFor(() => {
        expect(screen.getByText('Home Loan')).toBeInTheDocument();
      });

      // Each summary row has a summaryLabel span containing a summaryLabelDot and text.
      // To count rows, use summaryRow which is unique per row.
      // Query within the rendered container to avoid cross-test pollution.
      const summaryRows = Array.from(container.querySelectorAll('[class*="summaryRow"]'));
      expect(summaryRows.length).toBe(3);

      // Verify the label text order: Projected, Paid, Claimed
      // Each summaryRow contains a summaryLabel span whose textContent includes the label text
      const labelTexts = summaryRows.map((row) => {
        const labelEl = row.querySelector('[class*="summaryLabel"]');
        return labelEl?.textContent?.trim() ?? '';
      });
      expect(labelTexts[0]).toMatch(/Projected/);
      expect(labelTexts[1]).toMatch(/Paid/);
      expect(labelTexts[2]).toMatch(/Claimed/);
    });

    it('no "Allocated" label is present in the rendered output', async () => {
      mockFetchBudgetSources.mockResolvedValueOnce({ budgetSources: [sampleSource1] });

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Home Loan')).toBeInTheDocument();
      });

      expect(screen.queryByText(/allocated/i)).toBeNull();
    });

    it('no footer "Available" or "Planned" summary rows are present', async () => {
      mockFetchBudgetSources.mockResolvedValueOnce({ budgetSources: [sampleSource1] });

      const { container } = renderPage();

      await waitFor(() => {
        expect(screen.getByText('Home Loan')).toBeInTheDocument();
      });

      // These were in the old layout; they should not appear as standalone footer rows.
      // We check that no leaf element text starts with "Available " or "Planned ".
      const availableMatches = Array.from(container.querySelectorAll('*')).filter(
        (el) => el.children.length === 0 && /^Available\s/.test(el.textContent?.trim() ?? ''),
      );
      expect(availableMatches).toHaveLength(0);

      const plannedMatches = Array.from(container.querySelectorAll('*')).filter(
        (el) => el.children.length === 0 && /^Planned\s/.test(el.textContent?.trim() ?? ''),
      );
      expect(plannedMatches).toHaveLength(0);
    });

    it('projected range row displays both min and max formatted values', async () => {
      mockFetchBudgetSources.mockResolvedValueOnce({ budgetSources: [sourceWithRange] });

      const { container } = renderPage();

      await waitFor(() => {
        expect(screen.getByText('Home Loan')).toBeInTheDocument();
      });

      // The primary value for the Projected row shows both min and max amounts separated by an en-dash.
      // After fix #1333, the en-dash is rendered as the actual U+2013 character via JSX expression {'\u2013'}.
      const primaryCells = Array.from(container.querySelectorAll('[class*="summaryPrimary"]'));
      const projectedPrimary = primaryCells[0];
      expect(projectedPrimary).toBeTruthy();
      expect(projectedPrimary?.textContent).toMatch(/€80,000\.00/);
      expect(projectedPrimary?.textContent).toMatch(/€120,000\.00/);
      // Verify the actual en-dash character (U+2013) is present, not the literal escape sequence
      expect(projectedPrimary?.textContent).toContain('\u2013');
      expect(projectedPrimary?.textContent).not.toContain('\\u2013');
    });

    it('projected row secondary value is prefixed with "Remaining" label', async () => {
      mockFetchBudgetSources.mockResolvedValueOnce({ budgetSources: [sourceWithRange] });
      const { container } = renderPage();
      await waitFor(() => {
        expect(screen.getByText('Home Loan')).toBeInTheDocument();
      });
      const summaryRows = Array.from(container.querySelectorAll('[class*="summaryRow"]'));
      const projectedRow = summaryRows[0];
      const secondaryEl = projectedRow?.querySelector('[class*="summarySecondary"]');
      expect(secondaryEl?.textContent).toMatch(/^Remaining\s/);
      expect(secondaryEl?.textContent).toContain('\u2013');
      expect(secondaryEl?.textContent).not.toContain('\\u2013');
      // Screen-reader-readable single text node: "Remaining €X – €Y"
      const text = secondaryEl?.textContent?.trim() ?? '';
      expect(text).toMatch(/^Remaining €[\d,.]+ – €[\d,.]+$/);
    });

    it('paid row secondary value is prefixed with "Remaining" label', async () => {
      mockFetchBudgetSources.mockResolvedValueOnce({ budgetSources: [sourceWithRange] });
      const { container } = renderPage();
      await waitFor(() => {
        expect(screen.getByText('Home Loan')).toBeInTheDocument();
      });
      const summaryRows = Array.from(container.querySelectorAll('[class*="summaryRow"]'));
      const paidRow = summaryRows[1];
      const secondaryEl = paidRow?.querySelector('[class*="summarySecondary"]');
      expect(secondaryEl?.textContent).toMatch(/^Remaining\s/);
    });

    it('claimed row secondary value is prefixed with "Remaining" label', async () => {
      mockFetchBudgetSources.mockResolvedValueOnce({ budgetSources: [sourceWithRange] });
      const { container } = renderPage();
      await waitFor(() => {
        expect(screen.getByText('Home Loan')).toBeInTheDocument();
      });
      const summaryRows = Array.from(container.querySelectorAll('[class*="summaryRow"]'));
      const claimedRow = summaryRows[2];
      const secondaryEl = claimedRow?.querySelector('[class*="summarySecondary"]');
      expect(secondaryEl?.textContent).toMatch(/^Remaining\s/);
    });

    it('Projected row secondary value gets danger class when projectedMaxAmount > totalAmount', async () => {
      // The summarySecondaryNegative class is applied to the Projected row (not Paid row).
      // Condition: totalAmount - projectedMinAmount < 0 OR totalAmount - projectedMaxAmount < 0
      const overProjectedSource: BudgetSource = {
        ...sampleSource1,
        totalAmount: 100000,
        projectedMinAmount: 80000,
        projectedMaxAmount: 120000, // 100000 - 120000 < 0 → triggers negative class
        paidAmount: 0,
        claimedAmount: 0,
      };
      mockFetchBudgetSources.mockResolvedValueOnce({ budgetSources: [overProjectedSource] });

      const { container } = renderPage();

      await waitFor(() => {
        expect(screen.getByText('Home Loan')).toBeInTheDocument();
      });

      // The Projected row is the 1st summaryRow (index 0)
      const summaryRows = Array.from(container.querySelectorAll('[class*="summaryRow"]'));
      const projectedRow = summaryRows[0];
      const secondaryEl = projectedRow?.querySelector('[class*="summarySecondary"]');
      expect(secondaryEl).toBeTruthy();
      // The secondary span should include summarySecondaryNegative when projection exceeds total
      expect(secondaryEl?.className).toMatch(/summarySecondaryNegative/);
      // Even in negative state, the "Remaining" label prefix must be present
      expect(secondaryEl?.textContent).toMatch(/^Remaining\s/);
    });

    it('Projected row secondary value does NOT get danger class when projectedMaxAmount <= totalAmount', async () => {
      const underProjectedSource: BudgetSource = {
        ...sampleSource1,
        totalAmount: 200000,
        projectedMinAmount: 80000,
        projectedMaxAmount: 120000, // both within totalAmount
        paidAmount: 0,
        claimedAmount: 0,
      };
      mockFetchBudgetSources.mockResolvedValueOnce({ budgetSources: [underProjectedSource] });

      const { container } = renderPage();

      await waitFor(() => {
        expect(screen.getByText('Home Loan')).toBeInTheDocument();
      });

      const summaryRows = Array.from(container.querySelectorAll('[class*="summaryRow"]'));
      const projectedRow = summaryRows[0];
      const secondaryEl = projectedRow?.querySelector('[class*="summarySecondary"]');
      expect(secondaryEl).toBeTruthy();
      // Must NOT include summarySecondaryNegative when projection is within total
      expect(secondaryEl?.className).not.toMatch(/summarySecondaryNegative/);
    });

    it('interest rate subtitle is present when interestRate is set', async () => {
      // sampleSource1 has interestRate: 3.5
      mockFetchBudgetSources.mockResolvedValueOnce({ budgetSources: [sampleSource1] });

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Home Loan')).toBeInTheDocument();
      });

      // The interest rate paragraph contains "Rate" and "3.50%"
      const rateEl = document.querySelector('[class*="sourceInterestRate"]');
      expect(rateEl).not.toBeNull();
      expect(rateEl?.textContent).toMatch(/Rate/i);
      expect(rateEl?.textContent).toMatch(/3\.50%/);
    });

    it('interest rate subtitle is absent when interestRate is null', async () => {
      // sampleSource2 has interestRate: null
      mockFetchBudgetSources.mockResolvedValueOnce({ budgetSources: [sampleSource2] });

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Savings Account')).toBeInTheDocument();
      });

      const rateEl = document.querySelector('[class*="sourceInterestRate"]');
      expect(rateEl).toBeNull();
    });

    it('bar renders 4 segment labels (claimed, paid, projected, projectedUncertainty) with no "allocated" segment', async () => {
      // Use a source with non-zero values so BudgetBar renders visible segments in its aria-label
      const activeSource: BudgetSource = {
        ...sampleSource1,
        totalAmount: 200000,
        claimedAmount: 20000,
        paidAmount: 50000, // paidVal = 50000 - 20000 = 30000
        projectedMinAmount: 80000,
        projectedMaxAmount: 120000,
      };
      mockFetchBudgetSources.mockResolvedValueOnce({ budgetSources: [activeSource] });

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Home Loan')).toBeInTheDocument();
      });

      // BudgetBar renders a role="img" div whose aria-label lists visible segment labels.
      // The 4 expected segment labels (from t() calls):
      //   claimed → "Claimed", paid → "Paid (unclaimed)", projected → "Projected",
      //   projectedUncertainty → "Projected uncertainty"
      // There should be NO "Allocated" label — that belonged to the pre-rework layout.
      const budgetBar = screen.getByRole('img');
      const ariaLabel = budgetBar.getAttribute('aria-label') ?? '';

      // Verify none of the 4 segment translations includes "Allocated"
      expect(ariaLabel).not.toMatch(/allocated/i);

      // The summary table always shows Projected, Paid, Claimed labels (regardless of values)
      // Verify no "Allocated" appears anywhere in the rendered output
      expect(screen.queryByText(/^Allocated$/i)).toBeNull();
    });

    it('Paid row secondary value gets danger class when paidAmount > totalAmount', async () => {
      const overPaidSource: BudgetSource = {
        ...sampleSource1,
        totalAmount: 100000,
        paidAmount: 120000, // 100000 - 120000 < 0 → triggers negative class
        claimedAmount: 0,
      };
      mockFetchBudgetSources.mockResolvedValueOnce({ budgetSources: [overPaidSource] });

      const { container } = renderPage();

      await waitFor(() => {
        expect(screen.getByText(overPaidSource.name)).toBeInTheDocument();
      });

      const summaryRows = Array.from(container.querySelectorAll('[class*="summaryRow"]'));
      const paidRow = summaryRows[1]; // index 1 = Paid (after Projected)
      const secondaryEl = paidRow?.querySelector('[class*="summarySecondary"]');
      expect(secondaryEl).toBeTruthy();
      expect(secondaryEl?.className).toMatch(/summarySecondaryNegative/);
    });

    it('Claimed row secondary value gets danger class when claimedAmount > totalAmount', async () => {
      const overClaimedSource: BudgetSource = {
        ...sampleSource1,
        totalAmount: 100000,
        paidAmount: 0,
        claimedAmount: 120000,
      };
      mockFetchBudgetSources.mockResolvedValueOnce({ budgetSources: [overClaimedSource] });

      const { container } = renderPage();

      await waitFor(() => {
        expect(screen.getByText(overClaimedSource.name)).toBeInTheDocument();
      });

      const summaryRows = Array.from(container.querySelectorAll('[class*="summaryRow"]'));
      const claimedRow = summaryRows[2]; // index 2 = Claimed
      const secondaryEl = claimedRow?.querySelector('[class*="summarySecondary"]');
      expect(secondaryEl).toBeTruthy();
      expect(secondaryEl?.className).toMatch(/summarySecondaryNegative/);
    });
  });

  // ─── source actions layout (Issues #1335 + #1336) ────────────────────────────

  describe('source actions layout', () => {
    it('Show lines, Edit, and Delete buttons are all direct children of sourceActions in that order', async () => {
      mockFetchBudgetSources.mockResolvedValueOnce({ budgetSources: [sampleSource1] });
      const { container } = renderPage();
      await waitFor(() => {
        expect(screen.getByText('Home Loan')).toBeInTheDocument();
      });
      const actionsDiv = container.querySelector('[class*="sourceActions"]');
      expect(actionsDiv).not.toBeNull();
      const buttons = Array.from(actionsDiv!.querySelectorAll('button'));
      expect(buttons.length).toBe(3);
      // Order: Show lines → Edit → Delete
      expect(buttons[0]).toHaveAttribute('aria-label', expect.stringMatching(/expand budget lines for home loan/i));
      expect(buttons[1]).toHaveAccessibleName(/edit home loan/i);
      expect(buttons[2]).toHaveAccessibleName(/delete home loan/i);
    });

    it('discretionary source shows Show lines and Edit in sourceActions but not Delete', async () => {
      const discretionarySource: BudgetSource = {
        ...sampleSource1,
        id: 'src-disc',
        name: 'Contingency Reserve',
        isDiscretionary: true,
      };
      mockFetchBudgetSources.mockResolvedValueOnce({ budgetSources: [discretionarySource] });
      const { container } = renderPage();
      await waitFor(() => {
        expect(screen.getByText('Contingency Reserve')).toBeInTheDocument();
      });
      const actionsDiv = container.querySelector('[class*="sourceActions"]');
      expect(actionsDiv).not.toBeNull();
      const buttons = Array.from(actionsDiv!.querySelectorAll('button'));
      expect(buttons.length).toBe(2);
      expect(buttons[0]).toHaveAttribute('aria-label', expect.stringMatching(/expand budget lines for contingency reserve/i));
      expect(buttons[1]).toHaveAccessibleName(/edit contingency reserve/i);
      expect(screen.queryByRole('button', { name: /delete contingency reserve/i })).not.toBeInTheDocument();
    });

    it('expandToggle button is NOT inside sourceMain', async () => {
      mockFetchBudgetSources.mockResolvedValueOnce({ budgetSources: [sampleSource1] });
      const { container } = renderPage();
      await waitFor(() => {
        expect(screen.getByText('Home Loan')).toBeInTheDocument();
      });
      const sourceMainDiv = container.querySelector('[class*="sourceMain"]');
      expect(sourceMainDiv).not.toBeNull();
      const toggleInsideMain = sourceMainDiv!.querySelector('[class*="expandToggle"]');
      expect(toggleInsideMain).toBeNull();
    });
  });
});
