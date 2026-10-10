/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { findDuplicateTestIds } from '../../test/findDuplicateTestIds.js';
import i18n from '../../i18n/index.js';
import type * as InvoiceDepositsApiTypes from '../../lib/invoiceDepositsApi.js';
import type * as DeleteImpactApiTypes from '../../lib/deleteImpactApi.js';
import type * as BudgetSourcesApiTypes from '../../lib/budgetSourcesApi.js';
import type * as InvoiceBudgetLinesApiTypes from '../../lib/invoiceBudgetLinesApi.js';
import type * as InvoiceDepositsSectionTypes from './InvoiceDepositsSection.js';
import type {
  InvoiceDeposit,
  BudgetSource,
  InvoiceBudgetLineDetailResponse,
} from '@cornerstone/shared';

// ─── Module-scope mock functions ───────────────────────────────────────────────

const mockCreateDeposit = jest.fn<typeof InvoiceDepositsApiTypes.createDeposit>();
const mockUpdateDeposit = jest.fn<typeof InvoiceDepositsApiTypes.updateDeposit>();
const mockDeleteDeposit = jest.fn<typeof InvoiceDepositsApiTypes.deleteDeposit>();
const mockFetchDeposits = jest.fn<typeof InvoiceDepositsApiTypes.fetchDeposits>();

// ─── Mock: Toast + delete impact (#2209) ──────────────────────────────────────

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
const mockPatch = jest.fn() as jest.Mock<(...args: unknown[]) => Promise<unknown>>;
const mockPost = jest.fn() as jest.Mock<(...args: unknown[]) => Promise<unknown>>;
const mockFetchDeleteImpact = jest.fn<typeof DeleteImpactApiTypes.fetchDeleteImpact>();
jest.unstable_mockModule('../../lib/deleteImpactApi.js', () => ({
  fetchDeleteImpact: mockFetchDeleteImpact,
}));

// ─── Mock: invoiceDepositsApi ──────────────────────────────────────────────────

jest.unstable_mockModule('../../lib/invoiceDepositsApi.js', () => ({
  fetchDeposits: mockFetchDeposits,
  createDeposit: mockCreateDeposit,
  updateDeposit: mockUpdateDeposit,
  deleteDeposit: mockDeleteDeposit,
}));

// ─── Mock: budgetSourcesApi (Story #1891 — deposit budget-source picker) ──────

const mockFetchBudgetSources = jest.fn<typeof BudgetSourcesApiTypes.fetchBudgetSources>();
jest.unstable_mockModule('../../lib/budgetSourcesApi.js', () => ({
  fetchBudgetSources: mockFetchBudgetSources,
}));

// ─── Mock: invoiceBudgetLinesApi (Story #1891 — auto-default source logic) ────

const mockFetchInvoiceBudgetLines =
  jest.fn<typeof InvoiceBudgetLinesApiTypes.fetchInvoiceBudgetLines>();
jest.unstable_mockModule('../../lib/invoiceBudgetLinesApi.js', () => ({
  fetchInvoiceBudgetLines: mockFetchInvoiceBudgetLines,
}));

// ─── Mock: apiClient (provides ApiClientError class) ──────────────────────────

class MockApiClientError extends Error {
  statusCode: number;
  error: { code: string; message?: string; details?: unknown };
  constructor(statusCode: number, error: { code: string; message?: string; details?: unknown }) {
    super(error.message ?? 'API Error');
    this.name = 'ApiClientError';
    this.statusCode = statusCode;
    this.error = error;
  }
}

jest.unstable_mockModule('../../lib/apiClient.js', () => ({
  get: jest.fn(),
  post: mockPost,
  patch: mockPatch,
  del: jest.fn(),
  put: jest.fn(),
  setBaseUrl: jest.fn(),
  getBaseUrl: jest.fn().mockReturnValue('/api'),
  ApiClientError: MockApiClientError,
  NetworkError: class MockNetworkError extends Error {},
}));

// ─── Mock: formatters ─────────────────────────────────────────────────────────

jest.unstable_mockModule('../../lib/formatters.js', () => ({
  formatDate: (d: string | null | undefined) => d ?? '—',
  formatCurrency: (n: number) => `$${n.toFixed(2)}`,
  formatTime: (d: string | null | undefined) => d ?? '—',
  formatDateTime: (d: string | null | undefined) => d ?? '—',
  formatRelativeTime: (d: string) => d,
  formatPercent: (n: number) => `${n.toFixed(2)}%`,
  computeActualDuration: () => null,
  useFormatters: () => ({
    formatCurrency: (n: number) => `$${n.toFixed(2)}`,
    formatDate: (d: string | null | undefined) => d ?? '—',
    formatTime: (d: string | null | undefined) => d ?? '—',
    formatDateTime: (d: string | null | undefined) => d ?? '—',
    formatPercent: (n: number) => `${n.toFixed(2)}%`,
    formatDayMonth: (d: string | null | undefined) => d ?? '',
  }),
}));

// ─── Mock: errorTranslation ───────────────────────────────────────────────────

jest.unstable_mockModule('../../lib/errorTranslation.js', () => ({
  translateApiError: (code: string) => `translated:${code}`,
}));

// ─── Mock: Modal ───────────────────────────────────────────────────────────────
// Renders children and title inline so we can inspect them in tests

jest.unstable_mockModule('../../components/Modal/Modal.js', () => ({
  Modal: ({
    title,
    children,
    footer,
    onClose,
  }: {
    title: string;
    children: React.ReactNode;
    footer?: React.ReactNode;
    onClose: () => void;
  }) => (
    <div role="dialog" aria-label={title}>
      <div data-testid="modal-title">{title}</div>
      <div data-testid="modal-body">{children}</div>
      {footer && <div data-testid="modal-footer">{footer}</div>}
      <button data-testid="modal-close" onClick={onClose}>
        Close
      </button>
    </div>
  ),
}));

// ─── Mock: EmptyState ─────────────────────────────────────────────────────────

jest.unstable_mockModule('../../components/EmptyState/EmptyState.js', () => ({
  EmptyState: ({
    message,
    description,
    action,
  }: {
    icon?: string;
    message: string;
    description?: string;
    action?: { label: string; onClick: () => void };
  }) => (
    <div data-testid="empty-state">
      <span data-testid="empty-state-message">{message}</span>
      {description && <span data-testid="empty-state-description">{description}</span>}
      {action && (
        <button data-testid="empty-state-action" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  ),
}));

// ─── Mock: FormError ──────────────────────────────────────────────────────────

jest.unstable_mockModule('../../components/FormError/FormError.js', () => ({
  FormError: ({ message }: { message: string }) => (
    <div data-testid="form-error" role="alert">
      {message}
    </div>
  ),
}));

// ─── Mock: Badge ──────────────────────────────────────────────────────────────

jest.unstable_mockModule('../../components/Badge/Badge.js', () => ({
  Badge: ({
    variants,
    value,
  }: {
    variants: Record<string, { label: string; className?: string }>;
    value: string;
  }) => {
    const variant = variants[value];
    return <span data-testid={`badge-${value}`}>{variant?.label ?? value}</span>;
  },
}));

// ─── Deferred import ─────────────────────────────────────────────────────────

let InvoiceDepositsSection: (typeof InvoiceDepositsSectionTypes)['InvoiceDepositsSection'];

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const INVOICE_ID = 'inv-001';
const INVOICE_TOTAL = 1000;

function makeDeposit(id: string, overrides: Partial<InvoiceDeposit> = {}): InvoiceDeposit {
  return {
    id,
    invoiceId: INVOICE_ID,
    amount: 300,
    dueDate: '2026-03-01',
    paidDate: null,
    claimedDate: null,
    description: null,
    status: 'pending',
    entryType: 'deposit',
    budgetSourceId: null,
    createdBy: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeBudgetSource(id: string, overrides: Partial<BudgetSource> = {}): BudgetSource {
  return {
    id,
    name: `Source ${id}`,
    sourceType: 'bank_loan',
    totalAmount: 100000,
    usedAmount: 0,
    availableAmount: 100000,
    claimedAmount: 0,
    unclaimedAmount: 0,
    paidAmount: 0,
    actualAvailableAmount: 100000,
    projectedAmount: 0,
    projectedMinAmount: 0,
    projectedMaxAmount: 0,
    interestRate: null,
    terms: null,
    notes: null,
    reference: null,
    contactAddress: null,
    status: 'active',
    isDiscretionary: false,
    createdBy: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function renderSection(
  deposits: InvoiceDeposit[] = [],
  opts: {
    invoiceTotal?: number;
    invoiceStatus?: 'pending' | 'paid' | 'claimed' | 'quotation';
    finalPaymentAmount?: number;
    onDepositMutated?: () => void;
  } = {},
) {
  const onDepositMutated = opts.onDepositMutated ?? jest.fn();
  const finalPaymentAmount =
    opts.finalPaymentAmount ??
    Math.max(0, (opts.invoiceTotal ?? INVOICE_TOTAL) - deposits.reduce((s, d) => s + d.amount, 0));

  return render(
    <MemoryRouter>
      <InvoiceDepositsSection
        invoiceId={INVOICE_ID}
        invoiceStatus={opts.invoiceStatus ?? 'pending'}
        invoiceAmount={opts.invoiceTotal ?? INVOICE_TOTAL}
        deposits={deposits}
        finalPaymentAmount={finalPaymentAmount}
        onDepositMutated={onDepositMutated}
      />
    </MemoryRouter>,
  );
}

// ─── Setup ────────────────────────────────────────────────────────────────────

function makeInvoiceBudgetLine(
  id: string,
  overrides: Partial<InvoiceBudgetLineDetailResponse> = {},
): InvoiceBudgetLineDetailResponse {
  return {
    id,
    invoiceId: INVOICE_ID,
    workItemBudgetId: 'wib-1',
    householdItemBudgetId: null,
    itemizedAmount: 100,
    budgetLineDescription: null,
    plannedAmount: 100,
    confidence: 'own_estimate',
    categoryId: null,
    categoryName: null,
    categoryColor: null,
    categoryTranslationKey: null,
    parentItemId: null,
    parentItemTitle: null,
    parentItemType: 'work_item',
    parentItemArea: null,
    quantity: null,
    unit: null,
    unitPrice: null,
    includesVat: false,
    vendorId: null,
    budgetSourceId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(async () => {
  const mod = await import('./InvoiceDepositsSection.js');
  InvoiceDepositsSection = mod.InvoiceDepositsSection;
  jest.clearAllMocks();
  // Default: no budget sources / budget lines configured. Individual picker tests override this.
  mockFetchBudgetSources.mockResolvedValue({ budgetSources: [] });
  mockFetchInvoiceBudgetLines.mockResolvedValue({ budgetLines: [], remainingAmount: 0 });
  mockFetchDeleteImpact.mockResolvedValue({ entityType: 'invoice', id: 'x', effects: [] });
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('InvoiceDepositsSection', () => {
  // ─── Scenario 1: empty state ───────────────────────────────────────────────

  describe('Scenario 1: empty deposits array', () => {
    it('renders EmptyState component when deposits = []', () => {
      renderSection([]);
      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    });

    it('renders the "Add deposit" button in the header', () => {
      renderSection([]);
      // The primary "Add deposit" button exists in the section header
      const buttons = screen.getAllByRole('button');
      // At least one button with the add label exists
      expect(buttons.some((b) => b.getAttribute('aria-label')?.includes('deposit'))).toBe(true);
    });

    it('does NOT render the Final Payment row when deposits = []', () => {
      renderSection([]);
      // Final payment row should not be present
      expect(screen.queryByText(/final payment/i)).not.toBeInTheDocument();
    });
  });

  // ─── Scenario 2: deposit rows ──────────────────────────────────────────────

  describe('Scenario 2: non-empty deposits', () => {
    it('renders a table row for each deposit', () => {
      const deposits = [
        makeDeposit('dep-1', { amount: 300, dueDate: '2026-03-01' }),
        makeDeposit('dep-2', { amount: 200, dueDate: '2026-04-01', status: 'paid' }),
      ];
      renderSection(deposits);

      // Both amounts visible
      expect(screen.getAllByText('$300.00')).not.toHaveLength(0);
      expect(screen.getAllByText('$200.00')).not.toHaveLength(0);
    });

    it('renders the pending status badge for a pending deposit', () => {
      const deposits = [makeDeposit('dep-1', { status: 'pending' })];
      renderSection(deposits);
      expect(screen.getByTestId('deposit-status-dep-1')).toHaveTextContent('To pay');
    });

    it('renders paid status badge for a paid deposit', () => {
      const deposits = [makeDeposit('dep-1', { status: 'paid', paidDate: '2026-03-10' })];
      renderSection(deposits);
      expect(screen.getByTestId('deposit-status-dep-1')).toHaveTextContent('Paid');
    });

    it('renders claimed status badge for a claimed deposit', () => {
      const deposits = [
        makeDeposit('dep-1', {
          status: 'claimed',
          paidDate: '2026-03-10',
          claimedDate: '2026-03-20',
        }),
      ];
      renderSection(deposits);
      expect(screen.getByTestId('deposit-status-dep-1')).toHaveTextContent('Submitted');
    });

    it('renders em-dash for null paidDate', () => {
      const deposits = [makeDeposit('dep-1', { status: 'pending', paidDate: null })];
      renderSection(deposits);
      // null date is rendered as '—' by the mock formatter
      expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    });

    it('renders em-dash for null claimedDate', () => {
      const deposits = [
        makeDeposit('dep-1', { status: 'paid', paidDate: '2026-03-10', claimedDate: null }),
      ];
      renderSection(deposits);
      expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    });
  });

  // ─── Scenario 3: Final Payment row ────────────────────────────────────────

  describe('Scenario 3: Final Payment row', () => {
    it('renders Final Payment row when deposits.length > 0', () => {
      const deposits = [makeDeposit('dep-1', { amount: 300 })];
      renderSection(deposits, { finalPaymentAmount: 700 });
      // Final payment amount should be visible
      expect(screen.getByText('$700.00')).toBeInTheDocument();
    });

    it('shows the invoice status badge in the Final Payment row', () => {
      const deposits = [makeDeposit('dep-1', { amount: 300 })];
      renderSection(deposits, { invoiceStatus: 'paid', finalPaymentAmount: 700 });
      // The invoice status badge appears in the final payment area
      expect(screen.getAllByTestId('badge-paid').length).toBeGreaterThan(0);
    });

    it('renders finalPaymentAmount = 0 when deposits equal invoice total', () => {
      const deposits = [makeDeposit('dep-1', { amount: 1000 })];
      renderSection(deposits, { finalPaymentAmount: 0 });
      expect(screen.getByText('$0.00')).toBeInTheDocument();
    });
  });

  // ─── Scenario 4: action menu — pending deposit ─────────────────────────────

  describe('Scenario 4: row action menu holds only Edit and Delete (#2209)', () => {
    it.each(['pending', 'paid', 'claimed'] as const)(
      '%s deposit: the ⋮ menu lists Edit and Delete and no status items',
      (status) => {
        const deposits = [
          makeDeposit('dep-1', {
            status,
            paidDate: status === 'pending' ? null : '2026-03-10',
            claimedDate: status === 'claimed' ? '2026-03-20' : null,
          }),
        ];
        renderSection(deposits);

        const menuBtn = screen.getAllByRole('button').find((b) => b.textContent?.includes('⋮'))!;
        fireEvent.click(menuBtn);

        const labels = screen
          .getAllByRole('menuitem')
          .filter((m) => !m.closest('[inert]'))
          .map((m) => m.textContent?.toLowerCase());
        expect(labels.some((l) => l?.includes('edit'))).toBe(true);
        expect(labels.some((l) => l?.includes('delete'))).toBe(true);
        expect(labels.some((l) => l?.includes('mark') || l?.includes('revert'))).toBe(false);
      },
    );
  });

  // ─── Scenario 5: Add deposit modal ────────────────────────────────────────

  describe('Scenario 5: Add deposit modal', () => {
    it('opens Add modal when "Add deposit" header button is clicked', () => {
      renderSection([]);

      // Header button (aria-label includes "deposit")
      const addBtn = screen
        .getAllByRole('button')
        .find(
          (b) =>
            b.getAttribute('aria-label')?.includes('deposit') ?? b.textContent?.includes('deposit'),
        )!;
      fireEvent.click(addBtn);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('modal shows amount and dueDate inputs', () => {
      renderSection([]);
      // Open via empty-state action button
      const actionBtn = screen.getByTestId('empty-state-action');
      fireEvent.click(actionBtn);

      expect(screen.getByLabelText(/amount/i)).toBeInTheDocument();
      // Due date field
      expect(screen.getByLabelText(/due date/i)).toBeInTheDocument();
    });

    it('submit button disabled when amount is empty', () => {
      renderSection([]);
      fireEvent.click(screen.getByTestId('empty-state-action'));

      // amount input is empty by default; save button should be disabled
      const saveBtn = screen.getByTestId('modal-footer').querySelector('button[type="submit"]')!;
      expect(saveBtn).toBeDisabled();
    });

    it('form submit calls createDeposit with amount and dueDate', async () => {
      mockCreateDeposit.mockResolvedValueOnce({
        deposit: makeDeposit('new-dep'),
      } as Awaited<ReturnType<typeof mockCreateDeposit>>);

      const onMutated = jest.fn();
      renderSection([], { onDepositMutated: onMutated });

      fireEvent.click(screen.getByTestId('empty-state-action'));

      // Fill amount
      fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '300' } });
      // Fill dueDate
      fireEvent.change(screen.getByLabelText(/due date/i), {
        target: { value: '2026-03-01' },
      });

      // Submit
      const form = screen.getByRole('dialog').querySelector('form')!;
      await act(async () => {
        fireEvent.submit(form);
      });

      await waitFor(() => {
        expect(mockCreateDeposit).toHaveBeenCalledWith(
          INVOICE_ID,
          expect.objectContaining({ amount: 300, dueDate: '2026-03-01' }),
        );
      });
      expect(onMutated).toHaveBeenCalled();
    });

    it('calls onDepositMutated after successful create', async () => {
      mockCreateDeposit.mockResolvedValueOnce({
        deposit: makeDeposit('new-dep'),
      } as Awaited<ReturnType<typeof mockCreateDeposit>>);

      const onMutated = jest.fn();
      renderSection([], { onDepositMutated: onMutated });
      fireEvent.click(screen.getByTestId('empty-state-action'));
      fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '300' } });
      fireEvent.change(screen.getByLabelText(/due date/i), { target: { value: '2026-03-01' } });

      const form = screen.getByRole('dialog').querySelector('form')!;
      await act(async () => {
        fireEvent.submit(form);
      });

      await waitFor(() => expect(onMutated).toHaveBeenCalledTimes(1));
    });
  });

  // ─── Scenario 6: over-deposit is a non-blocking warning (#2188) ────────────

  describe('Scenario 6: over-deposit warning is non-blocking (#2188)', () => {
    it('passes invoiceAmount and existing entries to the modal: warns with the exact excess and still saves', async () => {
      mockCreateDeposit.mockResolvedValueOnce({
        deposit: makeDeposit('new', { amount: 60 }),
      } as Awaited<ReturnType<typeof mockCreateDeposit>>);
      const onMutated = jest.fn();

      renderSection([makeDeposit('dep-1', { amount: 60 })], {
        invoiceTotal: 100,
        onDepositMutated: onMutated,
      });
      fireEvent.click(screen.getByRole('button', { name: /add deposit/i }));
      fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '60' } });
      fireEvent.change(screen.getByLabelText(/due date/i), { target: { value: '2026-03-01' } });

      // existing 60 + entered 60 against an invoice of 100 -> excess 20
      expect(screen.getByTestId('deposit-exceeds-warning')).toHaveTextContent('$20.00');

      const form = screen.getByRole('dialog').querySelector('form')!;
      await act(async () => {
        fireEvent.submit(form);
      });

      await waitFor(() => expect(mockCreateDeposit).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(onMutated).toHaveBeenCalledTimes(1));
      expect(screen.queryByTestId('form-error')).not.toBeInTheDocument();
    });

    it('shows no warning when the new deposit fits within the invoice amount', () => {
      renderSection([makeDeposit('dep-1', { amount: 60 })], { invoiceTotal: 100 });
      fireEvent.click(screen.getByRole('button', { name: /add deposit/i }));
      fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '40' } });

      expect(screen.queryByTestId('deposit-exceeds-warning')).not.toBeInTheDocument();
    });
  });

  // ─── Scenario 7: Edit modal ────────────────────────────────────────────────

  describe('Scenario 7: Edit modal', () => {
    it('opens Edit modal from action menu and pre-populates form values', async () => {
      const deposit = makeDeposit('dep-1', {
        amount: 500,
        dueDate: '2026-03-15',
        status: 'pending',
        description: 'My deposit',
      });
      renderSection([deposit]);

      // Open menu, click Edit
      const menuBtn = screen.getAllByRole('button').find((b) => b.textContent?.includes('⋮'))!;
      fireEvent.click(menuBtn);

      const editBtn = screen
        .getAllByRole('menuitem')
        .find((m) => m.textContent?.toLowerCase().includes('edit'))!;
      fireEvent.click(editBtn);

      // Amount field should be pre-populated with 500
      await waitFor(() => {
        const amountInput = screen.getByLabelText(/amount/i) as HTMLInputElement;
        expect(amountInput.value).toBe('500');
      });
    });

    it('submit on edit modal calls updateDeposit', async () => {
      const deposit = makeDeposit('dep-1', { amount: 500, dueDate: '2026-03-15' });
      mockUpdateDeposit.mockResolvedValueOnce({
        deposit: { ...deposit, amount: 600 },
      } as Awaited<ReturnType<typeof mockUpdateDeposit>>);

      const onMutated = jest.fn();
      renderSection([deposit], { onDepositMutated: onMutated });

      // Open menu, click Edit
      const menuBtn = screen.getAllByRole('button').find((b) => b.textContent?.includes('⋮'))!;
      fireEvent.click(menuBtn);
      const editBtn = screen
        .getAllByRole('menuitem')
        .find((m) => m.textContent?.toLowerCase().includes('edit'))!;
      fireEvent.click(editBtn);

      // Change amount
      await waitFor(() => screen.getByLabelText(/amount/i));
      fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '600' } });

      const form = screen.getByRole('dialog').querySelector('form')!;
      await act(async () => {
        fireEvent.submit(form);
      });

      await waitFor(() => {
        expect(mockUpdateDeposit).toHaveBeenCalledWith(
          INVOICE_ID,
          'dep-1',
          expect.objectContaining({ amount: 600 }),
        );
      });
      expect(onMutated).toHaveBeenCalled();
    });
  });

  // ─── Scenario 8: INVALID_DEPOSIT_STATUS_TRANSITION ─────────────────────────

  describe('Scenario 8: INVALID_DEPOSIT_STATUS_TRANSITION error on edit', () => {
    it('renders FormError with translated transition message', async () => {
      const deposit = makeDeposit('dep-1', {
        status: 'pending',
        amount: 300,
        dueDate: '2026-03-01',
      });
      mockUpdateDeposit.mockRejectedValueOnce(
        new MockApiClientError(400, {
          code: 'INVALID_DEPOSIT_STATUS_TRANSITION',
          message: 'Invalid transition',
          details: { from: 'pending', to: 'claimed' },
        }),
      );

      renderSection([deposit]);

      // Open menu, click Edit
      const menuBtn = screen.getAllByRole('button').find((b) => b.textContent?.includes('⋮'))!;
      fireEvent.click(menuBtn);
      const editBtn = screen
        .getAllByRole('menuitem')
        .find((m) => m.textContent?.toLowerCase().includes('edit'))!;
      fireEvent.click(editBtn);

      await waitFor(() => screen.getByLabelText(/amount/i));

      const form = screen.getByRole('dialog').querySelector('form')!;
      await act(async () => {
        fireEvent.submit(form);
      });

      await waitFor(() => {
        expect(screen.getByTestId('form-error')).toBeInTheDocument();
      });
    });
  });

  // ─── Scenario 9: conditional date fields ──────────────────────────────────

  describe('Scenario 9: status change reveals/hides date fields', () => {
    it('paidDate field hidden when status = pending (initial state)', () => {
      renderSection([]);
      fireEvent.click(screen.getByTestId('empty-state-action'));

      // paidDate field exists in DOM but parent has hidden class
      const paidDateInput = screen.queryByLabelText(/paid date/i);
      if (paidDateInput) {
        // Field is in DOM; check that its container has hidden class
        const container = paidDateInput.closest('[class*="conditionalField"]');
        expect(container?.className).toContain('Hidden');
      }
      // status should be 'pending' by default - paidDate shouldn't be required/visible
    });

    it('changing status to paid reveals paidDate field', () => {
      renderSection([]);
      fireEvent.click(screen.getByTestId('empty-state-action'));

      const statusSelect = screen.getByLabelText(/status/i);
      fireEvent.change(statusSelect, { target: { value: 'paid' } });

      // After changing to paid, the paidDate container should have visible class
      const paidDateInput = screen.getByLabelText(/paid date/i);
      const container = paidDateInput.closest('[class*="conditionalField"]');
      expect(container?.className).toContain('Visible');
    });

    it('changing status to claimed reveals both paidDate and claimedDate fields', () => {
      renderSection([]);
      fireEvent.click(screen.getByTestId('empty-state-action'));

      const statusSelect = screen.getByLabelText(/status/i);
      fireEvent.change(statusSelect, { target: { value: 'claimed' } });

      const paidDateInput = screen.getByLabelText(/paid date/i);
      const claimedDateInput = screen.getByLabelText(/submitted date/i);

      const paidContainer = paidDateInput.closest('[class*="conditionalField"]');
      const claimedContainer = claimedDateInput.closest('[class*="conditionalField"]');
      expect(paidContainer?.className).toContain('Visible');
      expect(claimedContainer?.className).toContain('Visible');
    });

    it('claimedDate field hidden when status = paid', () => {
      renderSection([]);
      fireEvent.click(screen.getByTestId('empty-state-action'));

      const statusSelect = screen.getByLabelText(/status/i);
      fireEvent.change(statusSelect, { target: { value: 'paid' } });

      const claimedDateInput = screen.getByLabelText(/submitted date/i);
      const container = claimedDateInput.closest('[class*="conditionalField"]');
      expect(container?.className).toContain('Hidden');
    });
  });

  // ─── Scenario 14: Delete modal for pending deposit ─────────────────────────

  describe('Scenario 14: Delete modal', () => {
    it('opens delete confirmation modal from menu', () => {
      const deposit = makeDeposit('dep-1', { status: 'pending' });
      renderSection([deposit]);

      const menuBtn = screen.getAllByRole('button').find((b) => b.textContent?.includes('⋮'))!;
      fireEvent.click(menuBtn);

      const deleteBtn = screen
        .getAllByRole('menuitem')
        .find((m) => m.textContent?.toLowerCase().includes('delete'))!;
      fireEvent.click(deleteBtn);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('pending deposit delete modal: NO warning banner', () => {
      const deposit = makeDeposit('dep-1', { status: 'pending' });
      renderSection([deposit]);

      const menuBtn = screen.getAllByRole('button').find((b) => b.textContent?.includes('⋮'))!;
      fireEvent.click(menuBtn);

      const deleteBtn = screen
        .getAllByRole('menuitem')
        .find((m) => m.textContent?.toLowerCase().includes('delete'))!;
      fireEvent.click(deleteBtn);

      // Warning banner should not be present for pending
      const warningBanners = document.querySelectorAll('[class*="warningBanner"]');
      expect(warningBanners).toHaveLength(0);
    });

    it('paid deposit delete modal: shows warning banner', () => {
      const deposit = makeDeposit('dep-1', { status: 'paid', paidDate: '2026-03-10' });
      renderSection([deposit]);

      const menuBtn = screen.getAllByRole('button').find((b) => b.textContent?.includes('⋮'))!;
      fireEvent.click(menuBtn);

      const deleteBtn = screen
        .getAllByRole('menuitem')
        .find((m) => m.textContent?.toLowerCase().includes('delete'))!;
      fireEvent.click(deleteBtn);

      const warningBanners = document.querySelectorAll('[class*="warningBanner"]');
      expect(warningBanners.length).toBeGreaterThan(0);
    });

    it('claimed deposit delete modal: shows warning banner', () => {
      const deposit = makeDeposit('dep-1', {
        status: 'claimed',
        paidDate: '2026-03-10',
        claimedDate: '2026-03-20',
      });
      renderSection([deposit]);

      const menuBtn = screen.getAllByRole('button').find((b) => b.textContent?.includes('⋮'))!;
      fireEvent.click(menuBtn);

      const deleteBtn = screen
        .getAllByRole('menuitem')
        .find((m) => m.textContent?.toLowerCase().includes('delete'))!;
      fireEvent.click(deleteBtn);

      const warningBanners = document.querySelectorAll('[class*="warningBanner"]');
      expect(warningBanners.length).toBeGreaterThan(0);
    });

    it('confirming delete calls deleteDeposit then onDepositMutated', async () => {
      const deposit = makeDeposit('dep-1', { status: 'pending' });
      mockDeleteDeposit.mockResolvedValueOnce(undefined);

      const onMutated = jest.fn();
      renderSection([deposit], { onDepositMutated: onMutated });

      // Open menu → delete
      const menuBtn = screen.getAllByRole('button').find((b) => b.textContent?.includes('⋮'))!;
      fireEvent.click(menuBtn);
      const deleteMenuBtn = screen
        .getAllByRole('menuitem')
        .find((m) => m.textContent?.toLowerCase().includes('delete'))!;
      fireEvent.click(deleteMenuBtn);

      // Confirm in delete modal
      await waitFor(() => screen.getByRole('dialog'));
      // Click the confirm/delete button (last button in modal footer)
      const confirmDeleteBtn = screen
        .getByTestId('modal-footer')
        .querySelector('button:last-child')!;
      await act(async () => {
        fireEvent.click(confirmDeleteBtn);
      });

      await waitFor(() => {
        expect(mockDeleteDeposit).toHaveBeenCalledWith(INVOICE_ID, 'dep-1');
      });
      expect(onMutated).toHaveBeenCalled();
    });
  });

  describe('delete failures', () => {
    async function openAndConfirmDelete(
      deposit: InvoiceDeposit,
      opts?: Parameters<typeof renderSection>[1],
    ) {
      renderSection([deposit], opts);
      const menuBtn = screen.getAllByRole('button').find((b) => b.textContent?.includes('⋮'))!;
      fireEvent.click(menuBtn);
      const deleteMenuBtn = screen
        .getAllByRole('menuitem')
        .find((m) => m.textContent?.toLowerCase().includes('delete'))!;
      fireEvent.click(deleteMenuBtn);
      await waitFor(() => screen.getByRole('dialog'));
      const confirmDeleteBtn = screen
        .getByTestId('modal-footer')
        .querySelector('button:last-child')!;
      await act(async () => {
        fireEvent.click(confirmDeleteBtn);
      });
    }

    it('non-API failures show the generic delete error', async () => {
      mockDeleteDeposit.mockRejectedValueOnce(new Error('network'));
      await openAndConfirmDelete(makeDeposit('dep-1', { entryType: 'refund', amount: 300 }));

      await waitFor(() => {
        expect(screen.getByTestId('form-error').textContent).toBe(
          i18n.t('budget:invoiceDetail.deposits.errors.deleteError'),
        );
      });
    });

    it('a 409 hides the confirm button and keeps Cancel', async () => {
      mockDeleteDeposit.mockRejectedValueOnce(
        new MockApiClientError(409, { code: 'CONFLICT', message: 'x' }),
      );
      await openAndConfirmDelete(makeDeposit('dep-1'));
      await waitFor(() => expect(screen.queryByTestId('deposit-delete-confirm')).toBeNull());
      expect(screen.getByTestId('deposit-delete-cancel')).toBeInTheDocument();
    });

    it('a non-409 failure keeps the confirm button for a retry', async () => {
      mockDeleteDeposit.mockRejectedValueOnce(new Error('network'));
      await openAndConfirmDelete(makeDeposit('dep-1'));
      await waitFor(() => expect(screen.getByTestId('form-error')).toBeInTheDocument());
      expect(screen.getByTestId('deposit-delete-confirm')).toBeInTheDocument();
    });

    it('other ApiClientError codes still go through translateApiError', async () => {
      mockDeleteDeposit.mockRejectedValueOnce(new MockApiClientError(404, { code: 'NOT_FOUND' }));
      await openAndConfirmDelete(makeDeposit('dep-1', { entryType: 'refund', amount: 300 }));

      await waitFor(() => {
        expect(screen.getByTestId('form-error').textContent).toBe('translated:NOT_FOUND');
      });
    });
  });

  // ─── Scenario 15: i18n — no hardcoded text ────────────────────────────────

  describe('Scenario 15: i18n — all strings use t()', () => {
    it('section title is rendered via translation key (not hardcoded English)', () => {
      // If the component uses t(), JSDOM renders it; we can verify it's not just empty
      renderSection([]);
      // The section should render with the translated section title via i18next
      // In jsdom, i18next returns the key itself. The section uses 'budget:invoiceDetail.deposits.sectionTitle'
      // The heading should be present and non-empty.
      const heading = screen.getByRole('heading');
      expect(heading).toBeInTheDocument();
      expect(heading.textContent?.trim().length).toBeGreaterThan(0);
    });

    it('renders the deposits section landmark with correct aria-labelledby', () => {
      renderSection([]);
      const section = document.querySelector('[aria-labelledby="deposits-title"]');
      expect(section).toBeInTheDocument();
    });
  });

  // ─── Scenario 16 (i18n key fix #1424): common:button.* keys ─────────────────

  describe('Scenario 16: i18n key fix — common:button.* (#1424)', () => {
    it('Add modal cancel button shows "Cancel" (not raw key "buttons.cancel")', () => {
      renderSection([]);
      // Open add modal via the section header button
      const addBtn = screen
        .getAllByRole('button')
        .find((b) => b.getAttribute('aria-label')?.toLowerCase().includes('deposit'))!;
      fireEvent.click(addBtn);

      // The cancel button is rendered by the modal footer
      const cancelBtn = screen.getByTestId('deposit-modal-cancel');
      expect(cancelBtn.textContent).toBe('Cancel');
      // Must NOT show a raw key (keys contain dots)
      expect(cancelBtn.textContent).not.toContain('button.cancel');
      expect(cancelBtn.textContent).not.toContain('buttons.cancel');
    });

    it('Add modal save button shows "Save" (not raw key "buttons.save")', () => {
      renderSection([]);
      const addBtn = screen
        .getAllByRole('button')
        .find((b) => b.getAttribute('aria-label')?.toLowerCase().includes('deposit'))!;
      fireEvent.click(addBtn);

      const saveBtn = screen.getByTestId('deposit-modal-save');
      expect(saveBtn.textContent).toBe('Save');
      expect(saveBtn.textContent).not.toContain('button.save');
      expect(saveBtn.textContent).not.toContain('buttons.save');
    });

    it('Delete modal cancel button shows "Cancel" (not raw key)', () => {
      const deposit = makeDeposit('dep-1', { status: 'pending' });
      renderSection([deposit]);

      // Open delete modal
      const menuBtn = screen.getAllByRole('button').find((b) => b.textContent?.includes('⋮'))!;
      fireEvent.click(menuBtn);
      const deleteItem = screen
        .getAllByRole('menuitem')
        .find((m) => m.textContent?.toLowerCase().includes('delete'))!;
      fireEvent.click(deleteItem);

      const cancelBtn = screen.getByTestId('deposit-delete-cancel');
      expect(cancelBtn.textContent).toBe('Cancel');
      expect(cancelBtn.textContent).not.toContain('button.cancel');
      expect(cancelBtn.textContent).not.toContain('buttons.cancel');
    });

    it('OverflowMenu trigger buttons use usePortal (menu appears in document.body)', () => {
      const deposit = makeDeposit('dep-1', { status: 'pending' });
      renderSection([deposit]);

      // Find and click the kebab trigger (⋮)
      const menuBtn = screen.getAllByRole('button').find((b) => b.textContent?.includes('⋮'))!;
      menuBtn.getBoundingClientRect = jest.fn(() => ({
        top: 100,
        bottom: 120,
        left: 200,
        right: 300,
        width: 100,
        height: 20,
        x: 200,
        y: 100,
        toJSON: () => ({}),
      }));
      fireEvent.click(menuBtn);

      const menu = screen.getAllByRole('menu')[0]!;
      // When usePortal=true, the menu is portalled to document.body
      expect(document.body.contains(menu)).toBe(true);
    });
  });

  // ─── Scenario 17: count chip ──────────────────────────────────────────────

  describe('Scenario 17: count chip', () => {
    it('shows count chip with deposit count when deposits.length > 0', () => {
      const deposits = [makeDeposit('dep-1'), makeDeposit('dep-2')];
      renderSection(deposits);
      // Count chip contains the number 2
      const chip = document.querySelector('[aria-label*="2"]');
      expect(chip).toBeInTheDocument();
    });

    it('does NOT show count chip when deposits = []', () => {
      renderSection([]);
      // No aria-label containing a count should exist for the heading
      const chips = document.querySelectorAll('[class*="countChip"]');
      expect(chips).toHaveLength(0);
    });
  });

  // ─── Story #1876: entry type / refunds ─────────────────────────────────────

  describe('Story #1876: entry type radio group (add modal)', () => {
    it('defaults to "Deposit" checked when opening the Add modal', () => {
      renderSection([]);
      fireEvent.click(screen.getByTestId('empty-state-action'));

      const depositRadio = screen.getByRole('radio', { name: /deposit/i }) as HTMLInputElement;
      const refundRadio = screen.getByRole('radio', { name: /refund/i }) as HTMLInputElement;
      expect(depositRadio.checked).toBe(true);
      expect(refundRadio.checked).toBe(false);
    });

    it('both radios are enabled in Add mode', () => {
      renderSection([]);
      fireEvent.click(screen.getByTestId('empty-state-action'));

      const depositRadio = screen.getByRole('radio', { name: /deposit/i });
      const refundRadio = screen.getByRole('radio', { name: /refund/i });
      expect(depositRadio).not.toBeDisabled();
      expect(refundRadio).not.toBeDisabled();
    });

    it('selecting "Refund" shows the refund amount hint', () => {
      renderSection([]);
      fireEvent.click(screen.getByTestId('empty-state-action'));

      // Hint not shown while "Deposit" is selected
      expect(screen.queryByText(/positive number/i)).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('radio', { name: /refund/i }));

      expect(screen.getByText(/positive number/i)).toBeInTheDocument();
    });

    it('selecting "Deposit" after "Refund" hides the hint again', () => {
      renderSection([]);
      fireEvent.click(screen.getByTestId('empty-state-action'));

      fireEvent.click(screen.getByRole('radio', { name: /refund/i }));
      expect(screen.getByText(/positive number/i)).toBeInTheDocument();

      fireEvent.click(screen.getByRole('radio', { name: /deposit/i }));
      expect(screen.queryByText(/positive number/i)).not.toBeInTheDocument();
    });

    it('form submit sends entryType: "refund" in the create payload when Refund is selected', async () => {
      mockCreateDeposit.mockResolvedValueOnce({
        deposit: makeDeposit('new-dep', { entryType: 'refund' }),
      } as Awaited<ReturnType<typeof mockCreateDeposit>>);

      renderSection([]);
      fireEvent.click(screen.getByTestId('empty-state-action'));
      fireEvent.click(screen.getByRole('radio', { name: /refund/i }));
      fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '150' } });
      fireEvent.change(screen.getByLabelText(/due date/i), { target: { value: '2026-03-01' } });

      const form = screen.getByRole('dialog').querySelector('form')!;
      await act(async () => {
        fireEvent.submit(form);
      });

      await waitFor(() => {
        expect(mockCreateDeposit).toHaveBeenCalledWith(
          INVOICE_ID,
          expect.objectContaining({ entryType: 'refund' }),
        );
      });
    });

    it('form submit sends entryType: "deposit" in the create payload by default', async () => {
      mockCreateDeposit.mockResolvedValueOnce({
        deposit: makeDeposit('new-dep'),
      } as Awaited<ReturnType<typeof mockCreateDeposit>>);

      renderSection([]);
      fireEvent.click(screen.getByTestId('empty-state-action'));
      fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '150' } });
      fireEvent.change(screen.getByLabelText(/due date/i), { target: { value: '2026-03-01' } });

      const form = screen.getByRole('dialog').querySelector('form')!;
      await act(async () => {
        fireEvent.submit(form);
      });

      await waitFor(() => {
        expect(mockCreateDeposit).toHaveBeenCalledWith(
          INVOICE_ID,
          expect.objectContaining({ entryType: 'deposit' }),
        );
      });
    });
  });

  describe('Story #1876: entry type radio group (edit modal — immutability)', () => {
    it('shows both radios in the Edit modal but disabled, with the current entryType checked', async () => {
      const deposit = makeDeposit('dep-1', { entryType: 'refund' });
      renderSection([deposit]);

      const menuBtn = screen.getAllByRole('button').find((b) => b.textContent?.includes('⋮'))!;
      fireEvent.click(menuBtn);
      const editBtn = screen
        .getAllByRole('menuitem')
        .find((m) => m.textContent?.toLowerCase().includes('edit'))!;
      fireEvent.click(editBtn);

      await waitFor(() => {
        const depositRadio = screen.getByRole('radio', { name: /deposit/i }) as HTMLInputElement;
        const refundRadio = screen.getByRole('radio', { name: /refund/i }) as HTMLInputElement;
        expect(depositRadio).toBeDisabled();
        expect(refundRadio).toBeDisabled();
        expect(refundRadio.checked).toBe(true);
        expect(depositRadio.checked).toBe(false);
      });
    });

    it('edit submit does NOT include entryType in the update payload', async () => {
      const deposit = makeDeposit('dep-1', { amount: 500, entryType: 'refund' });
      mockUpdateDeposit.mockResolvedValueOnce({
        deposit: { ...deposit, amount: 600 },
      } as Awaited<ReturnType<typeof mockUpdateDeposit>>);

      renderSection([deposit]);
      const menuBtn = screen.getAllByRole('button').find((b) => b.textContent?.includes('⋮'))!;
      fireEvent.click(menuBtn);
      const editBtn = screen
        .getAllByRole('menuitem')
        .find((m) => m.textContent?.toLowerCase().includes('edit'))!;
      fireEvent.click(editBtn);

      await waitFor(() => screen.getByLabelText(/amount/i));
      fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '600' } });

      const form = screen.getByRole('dialog').querySelector('form')!;
      await act(async () => {
        fireEvent.submit(form);
      });

      await waitFor(() => {
        expect(mockUpdateDeposit).toHaveBeenCalled();
      });
      const payload = mockUpdateDeposit.mock.calls[0]![2];
      expect(payload).not.toHaveProperty('entryType');
    });
  });

  describe('Story #1876: REFUND_EXCEEDS_INVOICE error', () => {
    it('renders the refund-specific headroom message', async () => {
      mockCreateDeposit.mockRejectedValueOnce(
        new MockApiClientError(400, {
          code: 'REFUND_EXCEEDS_INVOICE',
          message: 'Refund exceeds invoice total',
          details: { availableHeadroom: 1000 },
        }),
      );

      renderSection([], { invoiceTotal: 10000 });
      fireEvent.click(screen.getByTestId('empty-state-action'));
      fireEvent.click(screen.getByRole('radio', { name: /refund/i }));
      fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '2000' } });
      fireEvent.change(screen.getByLabelText(/due date/i), { target: { value: '2026-03-01' } });

      const form = screen.getByRole('dialog').querySelector('form')!;
      await act(async () => {
        fireEvent.submit(form);
      });

      await waitFor(() => {
        const error = screen.getByTestId('form-error');
        expect(error).toBeInTheDocument();
        // formatCurrency mock renders as "$1000.00"
        expect(error.textContent).toContain('$1000.00');
      });
    });

    it('maps REFUND_EXCEEDS_INVOICE to the dedicated refund copy with the formatted headroom, not the generic fallback', async () => {
      mockCreateDeposit.mockRejectedValueOnce(
        new MockApiClientError(400, {
          code: 'REFUND_EXCEEDS_INVOICE',
          details: { availableHeadroom: 500 },
        }),
      );

      renderSection([], { invoiceTotal: 5000 });
      fireEvent.click(screen.getByTestId('empty-state-action'));
      fireEvent.click(screen.getByRole('radio', { name: /refund/i }));
      fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '1000' } });
      fireEvent.change(screen.getByLabelText(/due date/i), { target: { value: '2026-03-01' } });

      const form = screen.getByRole('dialog').querySelector('form')!;
      await act(async () => {
        fireEvent.submit(form);
      });

      await waitFor(() => {
        const error = screen.getByTestId('form-error');
        // The generic translateApiError fallback would render "translated:REFUND_EXCEEDS_INVOICE";
        // the specific branch must NOT fall through to that generic path.
        expect(error.textContent).not.toContain('translated:REFUND_EXCEEDS_INVOICE');
        expect(error.textContent).toBe(
          i18n.t('budget:invoiceDetail.deposits.errors.refundExceedsTotal', {
            availableHeadroom: '$500.00',
          }),
        );
      });
    });
  });

  describe('Story #1876: refund row rendering (table)', () => {
    it('renders a red "Refund" badge and the negative formatted amount for a refund deposit', () => {
      const deposits = [makeDeposit('dep-1', { amount: 400, entryType: 'refund' })];
      renderSection(deposits);

      expect(screen.getAllByTestId('badge-refund').length).toBeGreaterThan(0);
      // formatCurrency mock: `$${n.toFixed(2)}` — negative amount renders with a minus sign
      expect(screen.getAllByText('$-400.00').length).toBeGreaterThan(0);
    });

    it('does NOT render a "Refund" badge for a regular deposit', () => {
      const deposits = [makeDeposit('dep-1', { amount: 400, entryType: 'deposit' })];
      renderSection(deposits);

      expect(screen.queryByTestId('badge-refund')).not.toBeInTheDocument();
      expect(screen.getAllByText('$400.00').length).toBeGreaterThan(0);
    });

    it('the status badge is unaffected by entryType (refund row still shows its own status badge)', () => {
      const deposits = [
        makeDeposit('dep-1', {
          amount: 400,
          entryType: 'refund',
          status: 'paid',
          paidDate: '2026-03-10',
        }),
      ];
      renderSection(deposits);

      expect(screen.getAllByTestId('badge-refund').length).toBeGreaterThan(0);
      expect(screen.getByTestId('deposit-status-dep-1')).toHaveTextContent('Paid');
    });
  });

  describe('Story #1876: refund row rendering (mobile card)', () => {
    it('renders a red "Refund" badge and the negative formatted amount inside the card amount area', () => {
      // The mobile card list is always rendered alongside the table (CSS controls
      // visibility per viewport); assert on the card-specific DOM structure.
      const deposits = [makeDeposit('dep-1', { amount: 250, entryType: 'refund' })];
      renderSection(deposits);

      const cardList = document.querySelector('[role="list"]');
      expect(cardList).toBeInTheDocument();
      const cardAmount = cardList!.querySelector('[class*="cardAmount"]');
      expect(cardAmount).toBeInTheDocument();
      expect(cardAmount!.textContent).toContain('$-250.00');
    });
  });

  describe('Story #1876: OverflowMenu aria-label entry-type fallback', () => {
    it('table row: announces the entry type label when the refund deposit has no description', () => {
      const deposits = [makeDeposit('dep-1', { entryType: 'refund', description: null })];
      renderSection(deposits);

      // OverflowMenu's triggerAriaLabel is passed through; find the button with
      // an aria-label mentioning "Refund" (the entryTypeLabels.refund fallback).
      const buttons = screen.getAllByRole('button');
      const matched = buttons.some((b) => b.getAttribute('aria-label')?.includes('Refund'));
      expect(matched).toBe(true);
    });

    it('table row: uses the description when present, not the entry type fallback', () => {
      const deposits = [
        makeDeposit('dep-1', { entryType: 'refund', description: 'Overpayment correction' }),
      ];
      renderSection(deposits);

      const buttons = screen.getAllByRole('button');
      const matched = buttons.some((b) =>
        b.getAttribute('aria-label')?.includes('Overpayment correction'),
      );
      expect(matched).toBe(true);
    });

    it('deposit row: announces "Deposit" (not "Refund") when a description-less deposit has no description', () => {
      const deposits = [makeDeposit('dep-1', { entryType: 'deposit', description: null })];
      renderSection(deposits);

      const buttons = screen.getAllByRole('button');
      const matched = buttons.some((b) => b.getAttribute('aria-label')?.includes('Deposit'));
      expect(matched).toBe(true);
    });
  });

  // ─── #2209: StatusMenu replaces the mark/revert menu items and StateConfirmModal ───────

  describe('status menu (#2209)', () => {
    const TOKEN = { token: `u_${'f'.repeat(32)}`, expiresAt: '2026-08-07T10:00:30.000Z' };
    const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

    function openMenu(testId = 'deposit-status-dep-1') {
      fireEvent.click(screen.getByTestId(testId));
    }
    const rowLabels = () =>
      screen
        .getAllByRole('menuitem')
        .filter((r) => !r.closest('[inert]'))
        .map((r) => r.textContent);

    beforeEach(() => {
      mockPatch.mockReset();
      mockPost.mockReset();
      mockShowToast.mockReset();
      mockShowUndoToast.mockReset();
    });

    it('mounts the table and the mobile card without duplicate test ids', () => {
      const { container } = renderSection([makeDeposit('dep-1')]);
      expect(screen.getByTestId('deposit-status-dep-1')).toBeInTheDocument();
      expect(screen.getByTestId('deposit-status-mobile-dep-1')).toBeInTheDocument();
      expect(findDuplicateTestIds(container)).toEqual([]);
    });

    it('shows each status as a menu button with its canonical label', () => {
      renderSection([
        makeDeposit('dep-1', { status: 'pending' }),
        makeDeposit('dep-2', { status: 'paid', paidDate: '2026-03-10' }),
        makeDeposit('dep-3', {
          status: 'claimed',
          paidDate: '2026-03-10',
          claimedDate: '2026-03-20',
        }),
      ]);
      expect(screen.getByTestId('deposit-status-dep-1')).toHaveTextContent('To pay');
      expect(screen.getByTestId('deposit-status-dep-2')).toHaveTextContent('Paid');
      expect(screen.getByTestId('deposit-status-dep-3')).toHaveTextContent('Submitted');
      expect(screen.getByTestId('deposit-status-dep-1')).toHaveAttribute('aria-haspopup', 'menu');
    });

    it('a pending deposit offers Mark paid and Mark submitted, both with a date step', () => {
      renderSection([makeDeposit('dep-1', { status: 'pending' })]);
      openMenu();
      expect(rowLabels()).toEqual(['Mark paid›', 'Mark submitted›']);
    });

    it('a paid deposit offers Mark submitted and the way back to "To pay"', () => {
      renderSection([makeDeposit('dep-1', { status: 'paid', paidDate: '2026-03-10' })]);
      openMenu();
      expect(rowLabels()).toEqual(['Mark submitted›', 'Back to “To pay”']);
    });

    it('a submitted deposit offers only the way back to "Paid"', () => {
      renderSection([
        makeDeposit('dep-1', {
          status: 'claimed',
          paidDate: '2026-03-10',
          claimedDate: '2026-03-20',
        }),
      ]);
      openMenu();
      expect(rowLabels()).toEqual(['Back to “Paid”']);
    });

    it('Mark paid asks when the payment was made, offers only Today and Pick, and sends paidDate', async () => {
      const onMutated = jest.fn();
      mockPatch.mockResolvedValue({
        deposit: makeDeposit('dep-1', { status: 'paid', paidDate: '2026-03-10' }),
        undo: TOKEN,
      });
      renderSection([makeDeposit('dep-1', { status: 'pending' })], { onDepositMutated: onMutated });

      openMenu();
      fireEvent.click(screen.getByTestId('deposit-status-dep-1-option-paid'));
      expect(
        screen.getByRole('dialog', { name: 'When was this payment made?' }),
      ).toBeInTheDocument();
      expect(screen.queryByTestId('deposit-status-dep-1-date-planned')).toBeNull();
      expect(screen.getByTestId('deposit-status-dep-1-date-pick')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('deposit-status-dep-1-date-today'));

      await waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(1));
      expect(mockPatch).toHaveBeenCalledWith(
        `/invoices/${INVOICE_ID}/deposits/dep-1`,
        expect.objectContaining({ status: 'paid', paidDate: expect.stringMatching(DATE_RE) }),
      );
      await waitFor(() => expect(onMutated).toHaveBeenCalled());
      expect(mockShowUndoToast).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Deposit is now “Paid”.',
          dedupeKey: 'deposit:dep-1',
        }),
      );
    });

    it('Mark submitted from pending sets both the paid and the submitted date', async () => {
      mockPatch.mockResolvedValue({ deposit: makeDeposit('dep-1', { status: 'claimed' }) });
      renderSection([makeDeposit('dep-1', { status: 'pending' })]);
      openMenu();
      fireEvent.click(screen.getByTestId('deposit-status-dep-1-option-claimed'));
      expect(screen.getByRole('dialog', { name: 'When was it submitted?' })).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('deposit-status-dep-1-date-today'));

      await waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(1));
      const body = mockPatch.mock.calls[0]![1] as Record<string, string>;
      expect(body).toEqual({
        status: 'claimed',
        paidDate: expect.stringMatching(DATE_RE),
        claimedDate: expect.stringMatching(DATE_RE),
      });
      expect(body.paidDate).toBe(body.claimedDate);
    });

    it('Mark submitted from paid sets only the submitted date', async () => {
      mockPatch.mockResolvedValue({ deposit: makeDeposit('dep-1', { status: 'claimed' }) });
      renderSection([makeDeposit('dep-1', { status: 'paid', paidDate: '2026-03-10' })]);
      openMenu();
      fireEvent.click(screen.getByTestId('deposit-status-dep-1-option-claimed'));
      fireEvent.click(screen.getByTestId('deposit-status-dep-1-date-today'));

      await waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(1));
      expect(mockPatch.mock.calls[0]![1]).toEqual({
        status: 'claimed',
        claimedDate: expect.stringMatching(DATE_RE),
      });
    });

    it.each([
      ['paid', 'pending', 'deposit-status-dep-1-option-pending'],
      ['claimed', 'paid', 'deposit-status-dep-1-option-paid'],
    ] as const)(
      'going back from %s to %s applies at once with only the status',
      async (from, to, option) => {
        mockPatch.mockResolvedValue({ deposit: makeDeposit('dep-1', { status: to }), undo: TOKEN });
        renderSection([
          makeDeposit('dep-1', {
            status: from,
            paidDate: '2026-03-10',
            claimedDate: from === 'claimed' ? '2026-03-20' : null,
          }),
        ]);
        openMenu();
        fireEvent.click(screen.getByTestId(option));

        await waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(1));
        expect(mockPatch.mock.calls[0]![1]).toEqual({ status: to });
        expect(screen.queryByRole('dialog', { name: /when/i })).toBeNull();
      },
    );

    it('the mobile card hosts the same menu with its own test ids', async () => {
      mockPatch.mockResolvedValue({ deposit: makeDeposit('dep-1', { status: 'pending' }) });
      renderSection([makeDeposit('dep-1', { status: 'paid', paidDate: '2026-03-10' })]);
      openMenu('deposit-status-mobile-dep-1');
      fireEvent.click(screen.getByTestId('deposit-status-mobile-dep-1-option-pending'));
      await waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(1));
    });

    it('a failed change toasts the generic copy and shows no Undo', async () => {
      mockPatch.mockRejectedValue(new Error('RAW-LOCAL'));
      renderSection([makeDeposit('dep-1', { status: 'paid', paidDate: '2026-03-10' })]);
      openMenu();
      fireEvent.click(screen.getByTestId('deposit-status-dep-1-option-pending'));

      await waitFor(() =>
        expect(mockShowToast).toHaveBeenCalledWith('error', 'The status could not be changed.'),
      );
      expect(mockShowUndoToast).not.toHaveBeenCalled();
      expect(screen.queryByText(/RAW-LOCAL/)).toBeNull();
    });

    it('an API error toasts the translated copy', async () => {
      mockPatch.mockRejectedValue(new MockApiClientError(404, { code: 'NOT_FOUND' }));
      renderSection([makeDeposit('dep-1', { status: 'paid', paidDate: '2026-03-10' })]);
      openMenu();
      fireEvent.click(screen.getByTestId('deposit-status-dep-1-option-pending'));
      await waitFor(() =>
        expect(mockShowToast).toHaveBeenCalledWith('error', 'translated:NOT_FOUND'),
      );
    });

    it('Undo posts the token and refreshes the deposits', async () => {
      const onMutated = jest.fn();
      mockPatch.mockResolvedValue({
        deposit: makeDeposit('dep-1', { status: 'pending' }),
        undo: TOKEN,
      });
      mockPost.mockResolvedValue({ restored: [], retractedEventIds: [] });
      renderSection([makeDeposit('dep-1', { status: 'paid', paidDate: '2026-03-10' })], {
        onDepositMutated: onMutated,
      });
      openMenu();
      fireEvent.click(screen.getByTestId('deposit-status-dep-1-option-pending'));
      await waitFor(() => expect(mockShowUndoToast).toHaveBeenCalled());

      onMutated.mockClear();
      const options = mockShowUndoToast.mock.calls[0]![0] as { onUndo: () => Promise<void> };
      await act(async () => {
        await options.onUndo();
      });
      expect(mockPost).toHaveBeenCalledWith(`/undo/${TOKEN.token}`);
      expect(onMutated).toHaveBeenCalledTimes(1);
    });

    it('names an unnamed deposit by its entry type in the toast', async () => {
      mockPatch.mockResolvedValue({
        deposit: makeDeposit('dep-1', { status: 'pending', entryType: 'refund' }),
        undo: TOKEN,
      });
      renderSection([
        makeDeposit('dep-1', { status: 'paid', paidDate: '2026-03-10', entryType: 'refund' }),
      ]);
      openMenu();
      fireEvent.click(screen.getByTestId('deposit-status-dep-1-option-pending'));
      await waitFor(() => expect(mockShowUndoToast).toHaveBeenCalled());
      expect((mockShowUndoToast.mock.calls[0]![0] as { message: string }).message).toMatch(
        /^Refund is now/,
      );
    });
  });

  // ─── Story #1891: budget-source picker + auto-default logic ────────────────

  describe('budget-source picker (Story #1891)', () => {
    async function flushBudgetDataLoad() {
      // Both fetchBudgetSources and fetchInvoiceBudgetLines resolve on the microtask queue;
      // waiting only for "has been called" can race ahead of the state updates that follow
      // (setBudgetSources/setBudgetLines), which openAddModal's auto-default logic reads
      // synchronously at click time. Flush pending microtasks/effects inside act() so the
      // component has fully settled before any test opens the Add modal.
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });
    }

    function openAddModalAfterLoad() {
      const addBtn = screen
        .getAllByRole('button')
        .find(
          (b) =>
            b.getAttribute('aria-label')?.includes('deposit') ?? b.textContent?.includes('deposit'),
        )!;
      fireEvent.click(addBtn);
    }

    it('fetches budget sources and budget lines on mount', async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeBudgetSource('src-1')] });
      mockFetchInvoiceBudgetLines.mockResolvedValue({ budgetLines: [], remainingAmount: 1000 });

      renderSection([]);

      await waitFor(() => {
        expect(mockFetchBudgetSources).toHaveBeenCalledTimes(1);
        expect(mockFetchInvoiceBudgetLines).toHaveBeenCalledWith(INVOICE_ID);
      });
    });

    it('populates the picker <select> with every fetched budget source, plus a "None" option', async () => {
      mockFetchBudgetSources.mockResolvedValue({
        budgetSources: [
          makeBudgetSource('src-1', { name: 'Bank Loan' }),
          makeBudgetSource('src-2', { name: 'Savings' }),
        ],
      });
      renderSection([]);
      await flushBudgetDataLoad();

      openAddModalAfterLoad();

      const select = screen.getByLabelText('Budget source') as HTMLSelectElement;
      const optionLabels = Array.from(select.options).map((o) => o.textContent);
      expect(optionLabels).toEqual(['None (pro-rated)', 'Bank Loan', 'Savings']);
    });

    describe('default case 1: zero sources (no budget lines) → null default + HintNone', () => {
      it('defaults budgetSourceId to null and shows the "no budget lines" hint', async () => {
        mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeBudgetSource('src-1')] });
        mockFetchInvoiceBudgetLines.mockResolvedValue({ budgetLines: [], remainingAmount: 1000 });

        renderSection([]);
        await flushBudgetDataLoad();

        openAddModalAfterLoad();

        const select = screen.getByLabelText('Budget source') as HTMLSelectElement;
        expect(select.value).toBe('');
        expect(
          screen.getByText(
            'This invoice has no budget lines — pick a source, or leave blank to keep this deposit pro-rated.',
          ),
        ).toBeInTheDocument();
      });

      it('all-unassigned budget lines (no real source on any line) also default to null (treated as zero real sources)', async () => {
        mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeBudgetSource('src-1')] });
        mockFetchInvoiceBudgetLines.mockResolvedValue({
          budgetLines: [
            makeInvoiceBudgetLine('ibl-1', { budgetSourceId: null, itemizedAmount: 500 }),
          ],
          remainingAmount: 500,
        });

        renderSection([]);
        await flushBudgetDataLoad();

        openAddModalAfterLoad();

        const select = screen.getByLabelText('Budget source') as HTMLSelectElement;
        expect(select.value).toBe('');
      });
    });

    describe('default case 2: exactly one real source → defaults to it + HintSingle{name}', () => {
      it("defaults budgetSourceId to the invoice's single budget-line source", async () => {
        mockFetchBudgetSources.mockResolvedValue({
          budgetSources: [makeBudgetSource('src-1', { name: 'Bank Loan' })],
        });
        mockFetchInvoiceBudgetLines.mockResolvedValue({
          budgetLines: [
            makeInvoiceBudgetLine('ibl-1', { budgetSourceId: 'src-1', itemizedAmount: 700 }),
          ],
          remainingAmount: 300,
        });

        renderSection([]);
        await flushBudgetDataLoad();

        openAddModalAfterLoad();

        const select = screen.getByLabelText('Budget source') as HTMLSelectElement;
        expect(select.value).toBe('src-1');
        expect(
          screen.getByText("Defaulted to Bank Loan — this invoice's only budget source."),
        ).toBeInTheDocument();
      });

      it('a single real source PLUS an unassigned (null) line still counts as exactly one real source', async () => {
        mockFetchBudgetSources.mockResolvedValue({
          budgetSources: [makeBudgetSource('src-1', { name: 'Bank Loan' })],
        });
        mockFetchInvoiceBudgetLines.mockResolvedValue({
          budgetLines: [
            makeInvoiceBudgetLine('ibl-1', { budgetSourceId: 'src-1', itemizedAmount: 500 }),
            makeInvoiceBudgetLine('ibl-2', { budgetSourceId: null, itemizedAmount: 200 }),
          ],
          remainingAmount: 300,
        });

        renderSection([]);
        await flushBudgetDataLoad();

        openAddModalAfterLoad();

        const select = screen.getByLabelText('Budget source') as HTMLSelectElement;
        expect(select.value).toBe('src-1');
      });
    });

    describe('default case 3: multiple real sources → defaults to the largest-sum one + HintLargest{name}', () => {
      it('defaults budgetSourceId to the source with the largest summed itemizedAmount', async () => {
        mockFetchBudgetSources.mockResolvedValue({
          budgetSources: [
            makeBudgetSource('src-1', { name: 'Bank Loan' }),
            makeBudgetSource('src-2', { name: 'Savings' }),
          ],
        });
        mockFetchInvoiceBudgetLines.mockResolvedValue({
          budgetLines: [
            makeInvoiceBudgetLine('ibl-1', { budgetSourceId: 'src-1', itemizedAmount: 300 }),
            makeInvoiceBudgetLine('ibl-2', { budgetSourceId: 'src-2', itemizedAmount: 700 }),
          ],
          remainingAmount: 0,
        });

        renderSection([]);
        await flushBudgetDataLoad();

        openAddModalAfterLoad();

        const select = screen.getByLabelText('Budget source') as HTMLSelectElement;
        expect(select.value).toBe('src-2'); // 700 > 300
        expect(
          screen.getByText("Defaulted to Savings, this invoice's largest allocated source."),
        ).toBeInTheDocument();
      });

      it('sums MULTIPLE lines under the same source before comparing (largest-SUM, not largest single line)', async () => {
        mockFetchBudgetSources.mockResolvedValue({
          budgetSources: [
            makeBudgetSource('src-1', { name: 'Bank Loan' }),
            makeBudgetSource('src-2', { name: 'Savings' }),
          ],
        });
        mockFetchInvoiceBudgetLines.mockResolvedValue({
          budgetLines: [
            // src-1: two small lines summing to 600
            makeInvoiceBudgetLine('ibl-1', { budgetSourceId: 'src-1', itemizedAmount: 300 }),
            makeInvoiceBudgetLine('ibl-2', { budgetSourceId: 'src-1', itemizedAmount: 300 }),
            // src-2: one line of 500 (individually larger than either src-1 line, but the SUM
            // for src-1 (600) exceeds src-2's single line (500))
            makeInvoiceBudgetLine('ibl-3', { budgetSourceId: 'src-2', itemizedAmount: 500 }),
          ],
          remainingAmount: 0,
        });

        renderSection([]);
        await flushBudgetDataLoad();

        openAddModalAfterLoad();

        const select = screen.getByLabelText('Budget source') as HTMLSelectElement;
        expect(select.value).toBe('src-1'); // 600 > 500
      });
    });

    describe('mixed real+unassigned sources where the UNASSIGNED sum is largest (Story #1891 follow-up fix)', () => {
      it('single real source + a larger unassigned sum: still defaults to the real source and shows HintSingle with its real name (never "—")', async () => {
        mockFetchBudgetSources.mockResolvedValue({
          budgetSources: [makeBudgetSource('src-1', { name: 'Bank Loan' })],
        });
        mockFetchInvoiceBudgetLines.mockResolvedValue({
          budgetLines: [
            makeInvoiceBudgetLine('ibl-1', { budgetSourceId: 'src-1', itemizedAmount: 200 }),
            // Unassigned line sum (800) is larger than the real source's sum (200), but
            // unassigned lines must never compete for — or win — the "largest" default.
            makeInvoiceBudgetLine('ibl-2', { budgetSourceId: null, itemizedAmount: 800 }),
          ],
          remainingAmount: 0,
        });

        renderSection([]);
        await flushBudgetDataLoad();
        openAddModalAfterLoad();

        const select = screen.getByLabelText('Budget source') as HTMLSelectElement;
        expect(select.value).toBe('src-1');
        expect(
          screen.getByText("Defaulted to Bank Loan — this invoice's only budget source."),
        ).toBeInTheDocument();
        expect(screen.queryByText('—')).not.toBeInTheDocument();
      });

      it('multiple real sources + a much larger unassigned sum: defaults to the largest REAL source and shows HintLargest with its real name (never "—")', async () => {
        mockFetchBudgetSources.mockResolvedValue({
          budgetSources: [
            makeBudgetSource('src-1', { name: 'Bank Loan' }),
            makeBudgetSource('src-2', { name: 'Savings' }),
          ],
        });
        mockFetchInvoiceBudgetLines.mockResolvedValue({
          budgetLines: [
            makeInvoiceBudgetLine('ibl-1', { budgetSourceId: 'src-1', itemizedAmount: 200 }),
            makeInvoiceBudgetLine('ibl-2', { budgetSourceId: 'src-2', itemizedAmount: 300 }),
            // Unassigned sum (1000) dwarfs both real sources but must be excluded entirely
            // from the "largest source" comparison.
            makeInvoiceBudgetLine('ibl-3', { budgetSourceId: null, itemizedAmount: 1000 }),
          ],
          remainingAmount: 0,
        });

        renderSection([]);
        await flushBudgetDataLoad();
        openAddModalAfterLoad();

        const select = screen.getByLabelText('Budget source') as HTMLSelectElement;
        expect(select.value).toBe('src-2'); // 300 > 200 among REAL sources only
        expect(
          screen.getByText("Defaulted to Savings, this invoice's largest allocated source."),
        ).toBeInTheDocument();
        expect(screen.queryByText('—')).not.toBeInTheDocument();
      });
    });

    describe('all-unassigned budget lines → HintNone + null default', () => {
      it('every budget line is unassigned (no real source anywhere on the invoice): defaults budgetSourceId to null and shows the HintNone text', async () => {
        mockFetchBudgetSources.mockResolvedValue({
          budgetSources: [makeBudgetSource('src-1', { name: 'Bank Loan' })],
        });
        mockFetchInvoiceBudgetLines.mockResolvedValue({
          budgetLines: [
            makeInvoiceBudgetLine('ibl-1', { budgetSourceId: null, itemizedAmount: 400 }),
            makeInvoiceBudgetLine('ibl-2', { budgetSourceId: null, itemizedAmount: 600 }),
          ],
          remainingAmount: 0,
        });

        renderSection([]);
        await flushBudgetDataLoad();
        openAddModalAfterLoad();

        const select = screen.getByLabelText('Budget source') as HTMLSelectElement;
        expect(select.value).toBe('');
        expect(
          screen.getByText(
            'This invoice has no budget lines — pick a source, or leave blank to keep this deposit pro-rated.',
          ),
        ).toBeInTheDocument();
      });
    });

    describe('edit mode: populates from the existing deposit, not the auto-default', () => {
      it('openEditModal sets budgetSourceId from the deposit being edited, ignoring the auto-default logic entirely', async () => {
        mockFetchBudgetSources.mockResolvedValue({
          budgetSources: [
            makeBudgetSource('src-1', { name: 'Bank Loan' }),
            makeBudgetSource('src-2', { name: 'Savings' }),
          ],
        });
        // The auto-default would pick src-2 (largest sum) if this were an ADD — but this is
        // an EDIT of a deposit that's tagged to src-1, which must win instead.
        mockFetchInvoiceBudgetLines.mockResolvedValue({
          budgetLines: [
            makeInvoiceBudgetLine('ibl-1', { budgetSourceId: 'src-2', itemizedAmount: 900 }),
          ],
          remainingAmount: 100,
        });

        const deposits = [makeDeposit('dep-1', { budgetSourceId: 'src-1' })];
        renderSection(deposits);
        await flushBudgetDataLoad();

        // Open the edit modal via the row's overflow menu.
        const menuTriggers = screen.getAllByRole('button', { name: /Deposit actions/i });
        fireEvent.click(menuTriggers[0]!);
        const editItem = screen.getByText(/^Edit$/);
        fireEvent.click(editItem);

        const select = screen.getByLabelText('Budget source') as HTMLSelectElement;
        expect(select.value).toBe('src-1');
      });

      it('the picker remains editable (not disabled) while editing a claimed deposit', async () => {
        mockFetchBudgetSources.mockResolvedValue({
          budgetSources: [makeBudgetSource('src-1', { name: 'Bank Loan' })],
        });
        const deposits = [
          makeDeposit('dep-1', {
            status: 'claimed',
            paidDate: '2026-01-10',
            claimedDate: '2026-01-15',
            budgetSourceId: null,
          }),
        ];
        renderSection(deposits);
        await flushBudgetDataLoad();

        const menuTriggers = screen.getAllByRole('button', { name: /Deposit actions/i });
        fireEvent.click(menuTriggers[0]!);
        const editItem = screen.getByText(/^Edit$/);
        fireEvent.click(editItem);

        const select = screen.getByLabelText('Budget source') as HTMLSelectElement;
        expect(select).not.toBeDisabled();

        fireEvent.change(select, { target: { value: 'src-1' } });
        expect(select.value).toBe('src-1');
      });
    });

    describe('clearing back to null', () => {
      it('selecting the "None" option sets budgetSourceId back to null', async () => {
        mockFetchBudgetSources.mockResolvedValue({
          budgetSources: [makeBudgetSource('src-1', { name: 'Bank Loan' })],
        });
        mockFetchInvoiceBudgetLines.mockResolvedValue({
          budgetLines: [
            makeInvoiceBudgetLine('ibl-1', { budgetSourceId: 'src-1', itemizedAmount: 500 }),
          ],
          remainingAmount: 0,
        });

        renderSection([]);
        await flushBudgetDataLoad();
        openAddModalAfterLoad();

        const select = screen.getByLabelText('Budget source') as HTMLSelectElement;
        expect(select.value).toBe('src-1'); // auto-defaulted

        fireEvent.change(select, { target: { value: '' } });
        expect(select.value).toBe('');
      });

      it('submitting with a cleared (null) budgetSourceId sends budgetSourceId: null to createDeposit', async () => {
        mockFetchBudgetSources.mockResolvedValue({
          budgetSources: [makeBudgetSource('src-1', { name: 'Bank Loan' })],
        });
        mockFetchInvoiceBudgetLines.mockResolvedValue({
          budgetLines: [
            makeInvoiceBudgetLine('ibl-1', { budgetSourceId: 'src-1', itemizedAmount: 500 }),
          ],
          remainingAmount: 0,
        });
        mockCreateDeposit.mockResolvedValueOnce({
          deposit: makeDeposit('new-dep'),
        } as Awaited<ReturnType<typeof mockCreateDeposit>>);

        renderSection([]);
        await flushBudgetDataLoad();
        openAddModalAfterLoad();

        const select = screen.getByLabelText('Budget source') as HTMLSelectElement;
        fireEvent.change(select, { target: { value: '' } });

        fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '300' } });
        fireEvent.change(screen.getByLabelText(/due date/i), { target: { value: '2026-03-01' } });

        const form = screen.getByRole('dialog').querySelector('form')!;
        await act(async () => {
          fireEvent.submit(form);
        });

        await waitFor(() => {
          expect(mockCreateDeposit).toHaveBeenCalledWith(
            INVOICE_ID,
            expect.objectContaining({ budgetSourceId: null }),
          );
        });
      });

      it('submitting with the auto-defaulted budgetSourceId still set sends the real source id to createDeposit', async () => {
        mockFetchBudgetSources.mockResolvedValue({
          budgetSources: [makeBudgetSource('src-1', { name: 'Bank Loan' })],
        });
        mockFetchInvoiceBudgetLines.mockResolvedValue({
          budgetLines: [
            makeInvoiceBudgetLine('ibl-1', { budgetSourceId: 'src-1', itemizedAmount: 500 }),
          ],
          remainingAmount: 0,
        });
        mockCreateDeposit.mockResolvedValueOnce({
          deposit: makeDeposit('new-dep'),
        } as Awaited<ReturnType<typeof mockCreateDeposit>>);

        renderSection([]);
        await flushBudgetDataLoad();
        openAddModalAfterLoad();

        fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '300' } });
        fireEvent.change(screen.getByLabelText(/due date/i), { target: { value: '2026-03-01' } });

        const form = screen.getByRole('dialog').querySelector('form')!;
        await act(async () => {
          fireEvent.submit(form);
        });

        await waitFor(() => {
          expect(mockCreateDeposit).toHaveBeenCalledWith(
            INVOICE_ID,
            expect.objectContaining({ budgetSourceId: 'src-1' }),
          );
        });
      });
    });

    it('a network failure fetching budget sources/lines silently falls back to empty (no crash, no error banner)', async () => {
      mockFetchBudgetSources.mockRejectedValue(new Error('network down'));
      mockFetchInvoiceBudgetLines.mockRejectedValue(new Error('network down'));

      expect(() => renderSection([])).not.toThrow();

      await flushBudgetDataLoad();
      openAddModalAfterLoad();

      const select = screen.getByLabelText('Budget source') as HTMLSelectElement;
      expect(select.value).toBe('');
      expect(select.options).toHaveLength(1); // just "None"
    });
  });
});
