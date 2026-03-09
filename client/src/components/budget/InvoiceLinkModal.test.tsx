/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import type * as InvoicesApiTypes from '../../lib/invoicesApi.js';
import type * as InvoiceBudgetLinesApiTypes from '../../lib/invoiceBudgetLinesApi.js';
import type { Invoice, InvoiceListPaginatedResponse } from '@cornerstone/shared';
import type { InvoiceLinkModalProps } from './InvoiceLinkModal.js';

// ─── Module-scope mock functions ─────────────────────────────────────────────

const mockFetchAllInvoices = jest.fn<typeof InvoicesApiTypes.fetchAllInvoices>();
const mockFetchInvoiceBudgetLines =
  jest.fn<typeof InvoiceBudgetLinesApiTypes.fetchInvoiceBudgetLines>();
const mockCreateInvoiceBudgetLine =
  jest.fn<typeof InvoiceBudgetLinesApiTypes.createInvoiceBudgetLine>();
const mockShowToast = jest.fn<(type: string, message: string) => void>();

// ─── Mock: invoicesApi ────────────────────────────────────────────────────────

jest.unstable_mockModule('../../lib/invoicesApi.js', () => ({
  fetchAllInvoices: mockFetchAllInvoices,
  fetchInvoices: jest.fn(),
  createInvoice: jest.fn(),
  updateInvoice: jest.fn(),
  deleteInvoice: jest.fn(),
  fetchInvoiceById: jest.fn(),
}));

// ─── Mock: invoiceBudgetLinesApi ──────────────────────────────────────────────

jest.unstable_mockModule('../../lib/invoiceBudgetLinesApi.js', () => ({
  fetchInvoiceBudgetLines: mockFetchInvoiceBudgetLines,
  createInvoiceBudgetLine: mockCreateInvoiceBudgetLine,
  updateInvoiceBudgetLine: jest.fn(),
  deleteInvoiceBudgetLine: jest.fn(),
}));

// ─── Mock: ToastContext ───────────────────────────────────────────────────────

jest.unstable_mockModule('../Toast/ToastContext.js', () => ({
  ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useToast: () => ({
    toasts: [],
    showToast: mockShowToast,
    dismissToast: jest.fn(),
  }),
}));

// ─── Import component after mocks ─────────────────────────────────────────────

let InvoiceLinkModal: (typeof import('./InvoiceLinkModal.js'))['InvoiceLinkModal'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildInvoice(id: string, invoiceNumber: string | null = `INV-${id}`): Invoice {
  return {
    id,
    vendorId: 'vendor-1',
    vendorName: 'Acme Corp',
    invoiceNumber,
    amount: 1000,
    date: '2025-01-15',
    dueDate: null,
    status: 'pending',
    notes: null,
    budgetLines: [],
    remainingAmount: 1000,
    createdBy: null,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  };
}

function buildPaginatedResponse(invoices: Invoice[]): InvoiceListPaginatedResponse {
  return {
    invoices,
    pagination: { page: 1, pageSize: 1000, totalItems: invoices.length, totalPages: 1 },
    summary: {
      pending: { count: invoices.length, totalAmount: 1000 },
      paid: { count: 0, totalAmount: 0 },
      claimed: { count: 0, totalAmount: 0 },
    },
  };
}

function buildProps(overrides?: Partial<InvoiceLinkModalProps>): InvoiceLinkModalProps {
  return {
    budgetLineId: 'budget-line-1',
    budgetLineType: 'work_item',
    defaultAmount: 500,
    onSuccess: jest.fn(),
    onClose: jest.fn(),
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('InvoiceLinkModal', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    // Default: remaining amount covers typical test amounts
    mockFetchInvoiceBudgetLines.mockResolvedValue({
      budgetLines: [],
      remainingAmount: 1000,
    });
    const module = await import('./InvoiceLinkModal.js');
    InvoiceLinkModal = module.InvoiceLinkModal;
  });

  it('calls fetchAllInvoices with vendorId when provided', async () => {
    mockFetchAllInvoices.mockResolvedValue(buildPaginatedResponse([]));

    render(<InvoiceLinkModal {...buildProps({ vendorId: 'vendor-42' })} />);

    await waitFor(() => {
      expect(mockFetchAllInvoices).toHaveBeenCalledWith(
        expect.objectContaining({ pageSize: 100, vendorId: 'vendor-42' }),
      );
    });
  });

  it('calls fetchAllInvoices without vendorId when not provided', async () => {
    mockFetchAllInvoices.mockResolvedValue(buildPaginatedResponse([]));

    render(<InvoiceLinkModal {...buildProps()} />);

    await waitFor(() => {
      expect(mockFetchAllInvoices).toHaveBeenCalledWith(expect.objectContaining({ pageSize: 100 }));
      // vendorId should NOT be in the call
      const callArg = mockFetchAllInvoices.mock.calls[0]?.[0];
      expect(callArg).not.toHaveProperty('vendorId');
    });
  });

  it('auto-selects first invoice and shows it in search input', async () => {
    const invoices = [buildInvoice('inv-1', 'INV-001'), buildInvoice('inv-2', 'INV-002')];
    mockFetchAllInvoices.mockResolvedValue(buildPaginatedResponse(invoices));

    render(<InvoiceLinkModal {...buildProps()} />);

    await waitFor(() => {
      const searchInput = screen.getByLabelText(/invoice/i) as HTMLInputElement;
      expect(searchInput.value).toContain('#INV-001');
      expect(searchInput.value).toContain('€1,000.00');
    });
  });

  it('amount input defaults to defaultAmount', async () => {
    mockFetchAllInvoices.mockResolvedValue(buildPaginatedResponse([buildInvoice('inv-1')]));

    render(<InvoiceLinkModal {...buildProps({ defaultAmount: 750 })} />);

    await waitFor(() => {
      expect(screen.queryByText('Loading invoices...')).toBeNull();
    });

    const amountInput = screen.getByLabelText(/itemized amount/i) as HTMLInputElement;
    expect(amountInput.value).toBe('750');
  });

  it('work item submit calls createInvoiceBudgetLine with workItemBudgetId', async () => {
    const invoices = [buildInvoice('inv-1', 'INV-001')];
    mockFetchAllInvoices.mockResolvedValue(buildPaginatedResponse(invoices));
    mockCreateInvoiceBudgetLine.mockResolvedValue({
      budgetLine: {
        id: 'ibl-1',
        invoiceId: 'inv-1',
        workItemBudgetId: 'budget-line-1',
        householdItemBudgetId: null,
        itemizedAmount: 500,
        budgetLineDescription: null,
        plannedAmount: 1000,
        confidence: 'own_estimate',
        categoryId: null,
        categoryName: null,
        categoryColor: null,
        parentItemId: 'wi-1',
        parentItemTitle: 'Test Item',
        parentItemType: 'work_item',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      },
      remainingAmount: 500,
    });
    const onSuccess = jest.fn();
    const onClose = jest.fn();

    render(
      <InvoiceLinkModal
        {...buildProps({
          budgetLineId: 'budget-line-1',
          budgetLineType: 'work_item',
          defaultAmount: 500,
          onSuccess,
          onClose,
        })}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByText('Loading invoices...')).toBeNull();
    });

    const submitBtn = screen.getByRole('button', { name: /link to invoice/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockCreateInvoiceBudgetLine).toHaveBeenCalledWith(
        'inv-1',
        expect.objectContaining({
          invoiceId: 'inv-1',
          workItemBudgetId: 'budget-line-1',
          itemizedAmount: 500,
        }),
      );
    });
  });

  it('household item submit calls createInvoiceBudgetLine with householdItemBudgetId', async () => {
    const invoices = [buildInvoice('inv-1', 'INV-001')];
    mockFetchAllInvoices.mockResolvedValue(buildPaginatedResponse(invoices));
    mockCreateInvoiceBudgetLine.mockResolvedValue({
      budgetLine: {
        id: 'ibl-1',
        invoiceId: 'inv-1',
        workItemBudgetId: null,
        householdItemBudgetId: 'hi-budget-1',
        itemizedAmount: 300,
        budgetLineDescription: null,
        plannedAmount: 800,
        confidence: 'own_estimate',
        categoryId: null,
        categoryName: null,
        categoryColor: null,
        parentItemId: 'hi-1',
        parentItemTitle: 'Test HI',
        parentItemType: 'household_item',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      },
      remainingAmount: 700,
    });

    render(
      <InvoiceLinkModal
        {...buildProps({
          budgetLineId: 'hi-budget-1',
          budgetLineType: 'household_item',
          defaultAmount: 300,
        })}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByText('Loading invoices...')).toBeNull();
    });

    const submitBtn = screen.getByRole('button', { name: /link to invoice/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockCreateInvoiceBudgetLine).toHaveBeenCalledWith(
        'inv-1',
        expect.objectContaining({
          invoiceId: 'inv-1',
          householdItemBudgetId: 'hi-budget-1',
          itemizedAmount: 300,
        }),
      );
    });
  });

  it('on success calls onSuccess and closes modal', async () => {
    const invoices = [buildInvoice('inv-1', 'INV-001')];
    mockFetchAllInvoices.mockResolvedValue(buildPaginatedResponse(invoices));
    mockCreateInvoiceBudgetLine.mockResolvedValue({
      budgetLine: {
        id: 'ibl-1',
        invoiceId: 'inv-1',
        workItemBudgetId: 'budget-line-1',
        householdItemBudgetId: null,
        itemizedAmount: 500,
        budgetLineDescription: null,
        plannedAmount: 1000,
        confidence: 'own_estimate',
        categoryId: null,
        categoryName: null,
        categoryColor: null,
        parentItemId: 'wi-1',
        parentItemTitle: 'Test Item',
        parentItemType: 'work_item',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      },
      remainingAmount: 500,
    });
    const onSuccess = jest.fn();
    const onClose = jest.fn();

    render(<InvoiceLinkModal {...buildProps({ onSuccess, onClose })} />);

    await waitFor(() => {
      expect(screen.queryByText('Loading invoices...')).toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: /link to invoice/i }));

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled();
    });
  });

  it('BUDGET_LINE_ALREADY_LINKED error is shown inline', async () => {
    const invoices = [buildInvoice('inv-1', 'INV-001')];
    mockFetchAllInvoices.mockResolvedValue(buildPaginatedResponse(invoices));
    mockCreateInvoiceBudgetLine.mockRejectedValue(
      new Error('BUDGET_LINE_ALREADY_LINKED: budget line is already linked'),
    );

    render(<InvoiceLinkModal {...buildProps()} />);

    await waitFor(() => {
      expect(screen.queryByText('Loading invoices...')).toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: /link to invoice/i }));

    await waitFor(() => {
      expect(screen.getByText('This budget line is already linked to an invoice')).toBeTruthy();
    });
  });

  it('ITEMIZED_SUM_EXCEEDS_INVOICE error is shown inline', async () => {
    const invoices = [buildInvoice('inv-1', 'INV-001')];
    mockFetchAllInvoices.mockResolvedValue(buildPaginatedResponse(invoices));
    mockCreateInvoiceBudgetLine.mockRejectedValue(
      new Error('ITEMIZED_SUM_EXCEEDS_INVOICE: itemized amount exceeds invoice total'),
    );

    render(<InvoiceLinkModal {...buildProps()} />);

    await waitFor(() => {
      expect(screen.queryByText('Loading invoices...')).toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: /link to invoice/i }));

    await waitFor(() => {
      expect(screen.getByText('The itemized amount exceeds the invoice total')).toBeTruthy();
    });
  });

  it('Escape key closes the modal', async () => {
    mockFetchAllInvoices.mockResolvedValue(buildPaginatedResponse([]));
    const onClose = jest.fn();

    render(<InvoiceLinkModal {...buildProps({ onClose })} />);

    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });

    expect(onClose).toHaveBeenCalled();
  });

  it('shows empty state when no invoices available', async () => {
    mockFetchAllInvoices.mockResolvedValue(buildPaginatedResponse([]));

    render(<InvoiceLinkModal {...buildProps()} />);

    await waitFor(() => {
      expect(screen.getByText('No invoices available')).toBeTruthy();
    });
  });

  it('submit is disabled when no invoices available', async () => {
    mockFetchAllInvoices.mockResolvedValue(buildPaginatedResponse([]));

    render(<InvoiceLinkModal {...buildProps()} />);

    await waitFor(() => {
      expect(screen.queryByText('Loading invoices...')).toBeNull();
    });

    const submitBtn = screen.getByRole('button', { name: /link to invoice/i });
    expect(submitBtn).toBeDisabled();
  });

  it('shows error banner on load failure', async () => {
    mockFetchAllInvoices.mockRejectedValue(new Error('Network error'));

    render(<InvoiceLinkModal {...buildProps()} />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load invoices. Please try again.')).toBeTruthy();
    });
  });
});
