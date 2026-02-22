/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { screen, waitFor, render, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type * as BudgetSourcesApiTypes from '../../lib/budgetSourcesApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import type { BudgetSource, BudgetSourceListResponse } from '@cornerstone/shared';

// Mock the API module BEFORE importing the component
const mockFetchBudgetSources = jest.fn<typeof BudgetSourcesApiTypes.fetchBudgetSources>();
const mockFetchBudgetSource = jest.fn<typeof BudgetSourcesApiTypes.fetchBudgetSource>();
const mockCreateBudgetSource = jest.fn<typeof BudgetSourcesApiTypes.createBudgetSource>();
const mockUpdateBudgetSource = jest.fn<typeof BudgetSourcesApiTypes.updateBudgetSource>();
const mockDeleteBudgetSource = jest.fn<typeof BudgetSourcesApiTypes.deleteBudgetSource>();

jest.unstable_mockModule('../../lib/budgetSourcesApi.js', () => ({
  fetchBudgetSources: mockFetchBudgetSources,
  fetchBudgetSource: mockFetchBudgetSource,
  createBudgetSource: mockCreateBudgetSource,
  updateBudgetSource: mockUpdateBudgetSource,
  deleteBudgetSource: mockDeleteBudgetSource,
}));

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
    actualAvailableAmount: 200000,
    interestRate: 3.5,
    terms: '30-year fixed',
    notes: 'Primary financing',
    status: 'active',
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
    actualAvailableAmount: 50000,
    interestRate: null,
    terms: null,
    notes: null,
    status: 'active',
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
    it('renders the page heading "Budget" and section heading "Sources"', async () => {
      mockFetchBudgetSources.mockResolvedValueOnce(emptyResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /^budget$/i, level: 1 })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /^sources$/i, level: 2 })).toBeInTheDocument();
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
        // €200,000.00 formatted — appears for both Total and Available
        expect(screen.getAllByText('€200,000.00').length).toBeGreaterThanOrEqual(1);
      });
    });

    it('displays used and available amounts', async () => {
      mockFetchBudgetSources.mockResolvedValueOnce({
        budgetSources: [sampleSource1],
      });

      renderPage();

      await waitFor(() => {
        // usedAmount = 0 → €0.00; availableAmount = 200000 → €200,000.00
        expect(screen.getByText('€0.00')).toBeInTheDocument();
      });
    });

    it('displays interest rate when present', async () => {
      mockFetchBudgetSources.mockResolvedValueOnce({
        budgetSources: [sampleSource1],
      });

      renderPage();

      await waitFor(() => {
        // sampleSource1.interestRate = 3.5 → "3.50%"
        expect(screen.getByText('3.50%')).toBeInTheDocument();
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
});
