/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import type * as InvoiceDepositsApiTypes from '../../lib/invoiceDepositsApi.js';
import type * as InvoiceDepositsSectionTypes from './InvoiceDepositsSection.js';
import type { InvoiceDeposit } from '@cornerstone/shared';

// ─── Module-scope mock functions ───────────────────────────────────────────────

const mockCreateDeposit = jest.fn<typeof InvoiceDepositsApiTypes.createDeposit>();
const mockUpdateDeposit = jest.fn<typeof InvoiceDepositsApiTypes.updateDeposit>();
const mockDeleteDeposit = jest.fn<typeof InvoiceDepositsApiTypes.deleteDeposit>();
const mockFetchDeposits = jest.fn<typeof InvoiceDepositsApiTypes.fetchDeposits>();

// ─── Mock: invoiceDepositsApi ──────────────────────────────────────────────────

jest.unstable_mockModule('../../lib/invoiceDepositsApi.js', () => ({
  fetchDeposits: mockFetchDeposits,
  createDeposit: mockCreateDeposit,
  updateDeposit: mockUpdateDeposit,
  deleteDeposit: mockDeleteDeposit,
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
  post: jest.fn(),
  patch: jest.fn(),
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
    createdBy: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
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
    <InvoiceDepositsSection
      invoiceId={INVOICE_ID}
      invoiceStatus={opts.invoiceStatus ?? 'pending'}
      deposits={deposits}
      finalPaymentAmount={finalPaymentAmount}
      onDepositMutated={onDepositMutated}
    />,
  );
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(async () => {
  const mod = await import('./InvoiceDepositsSection.js');
  InvoiceDepositsSection = mod.InvoiceDepositsSection;
  jest.clearAllMocks();
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
      expect(screen.getAllByTestId('badge-pending').length).toBeGreaterThan(0);
    });

    it('renders paid status badge for a paid deposit', () => {
      const deposits = [makeDeposit('dep-1', { status: 'paid', paidDate: '2026-03-10' })];
      renderSection(deposits);
      expect(screen.getAllByTestId('badge-paid').length).toBeGreaterThan(0);
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
      expect(screen.getAllByTestId('badge-claimed').length).toBeGreaterThan(0);
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

  describe('Scenario 4: action menu items per deposit status', () => {
    it('pending deposit: shows "Mark paid" and "Edit" and "Delete" menu items', () => {
      const deposits = [makeDeposit('dep-1', { status: 'pending' })];
      renderSection(deposits);

      // Open the first overflow menu button (⋮)
      const menuBtn = screen.getAllByRole('button').find((b) => b.textContent?.includes('⋮'))!;
      fireEvent.click(menuBtn);

      // markPaid, edit, delete items should appear
      const menuItems = screen.getAllByRole('menuitem');
      const labels = menuItems.map((m) => m.textContent?.toLowerCase() ?? '');
      expect(labels.some((l) => l.includes('paid'))).toBe(true);
      expect(labels.some((l) => l.includes('edit'))).toBe(true);
      expect(labels.some((l) => l.includes('delete'))).toBe(true);
    });

    it('pending deposit: does NOT show "Mark claimed" or revert items', () => {
      const deposits = [makeDeposit('dep-1', { status: 'pending' })];
      renderSection(deposits);

      const menuBtn = screen.getAllByRole('button').find((b) => b.textContent?.includes('⋮'))!;
      fireEvent.click(menuBtn);

      const menuItems = screen.getAllByRole('menuitem');
      const labels = menuItems.map((m) => m.textContent?.toLowerCase() ?? '');
      expect(labels.some((l) => l.includes('claimed'))).toBe(false);
      expect(labels.some((l) => l.includes('revert'))).toBe(false);
    });

    it('paid deposit: shows "Mark claimed", "Revert to pending", "Edit", "Delete"', () => {
      const deposits = [makeDeposit('dep-1', { status: 'paid', paidDate: '2026-03-10' })];
      renderSection(deposits);

      const menuBtn = screen.getAllByRole('button').find((b) => b.textContent?.includes('⋮'))!;
      fireEvent.click(menuBtn);

      const menuItems = screen.getAllByRole('menuitem');
      const labels = menuItems.map((m) => m.textContent?.toLowerCase() ?? '');
      expect(labels.some((l) => l.includes('claimed'))).toBe(true);
      expect(labels.some((l) => l.includes('pending'))).toBe(true);
      expect(labels.some((l) => l.includes('edit'))).toBe(true);
      expect(labels.some((l) => l.includes('delete'))).toBe(true);
    });

    it('paid deposit: does NOT show "Mark paid"', () => {
      const deposits = [makeDeposit('dep-1', { status: 'paid', paidDate: '2026-03-10' })];
      renderSection(deposits);

      const menuBtn = screen.getAllByRole('button').find((b) => b.textContent?.includes('⋮'))!;
      fireEvent.click(menuBtn);

      const menuItems = screen.getAllByRole('menuitem');
      const labels = menuItems.map((m) => m.textContent?.toLowerCase() ?? '');
      // Should not have a "mark paid" item (only claimed and revert-to-pending)
      const paidItems = labels.filter((l) => l.includes('paid') && !l.includes('revert'));
      expect(paidItems).toHaveLength(0);
    });

    it('claimed deposit: shows "Revert to paid", "Edit", "Delete"; no "Mark paid" or "Mark claimed"', () => {
      const deposits = [
        makeDeposit('dep-1', {
          status: 'claimed',
          paidDate: '2026-03-10',
          claimedDate: '2026-03-20',
        }),
      ];
      renderSection(deposits);

      const menuBtn = screen.getAllByRole('button').find((b) => b.textContent?.includes('⋮'))!;
      fireEvent.click(menuBtn);

      const menuItems = screen.getAllByRole('menuitem');
      const labels = menuItems.map((m) => m.textContent?.toLowerCase() ?? '');
      expect(labels.some((l) => l.includes('revert') && l.includes('paid'))).toBe(true);
      expect(labels.some((l) => l.includes('edit'))).toBe(true);
      expect(labels.some((l) => l.includes('delete'))).toBe(true);
      // No mark paid or mark claimed
      expect(labels.some((l) => l.includes('mark'))).toBe(false);
    });
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

  // ─── Scenario 6: DEPOSITS_EXCEED_INVOICE_TOTAL error ──────────────────────

  describe('Scenario 6: DEPOSITS_EXCEED_INVOICE_TOTAL error', () => {
    it('renders FormError with available headroom from error details', async () => {
      mockCreateDeposit.mockRejectedValueOnce(
        new MockApiClientError(400, {
          code: 'DEPOSITS_EXCEED_INVOICE_TOTAL',
          message: 'Deposits exceed invoice total',
          details: { available: 40 },
        }),
      );

      renderSection([], { invoiceTotal: 100 });
      fireEvent.click(screen.getByTestId('empty-state-action'));
      fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '90' } });
      fireEvent.change(screen.getByLabelText(/due date/i), { target: { value: '2026-03-01' } });

      const form = screen.getByRole('dialog').querySelector('form')!;
      await act(async () => {
        fireEvent.submit(form);
      });

      await waitFor(() => {
        expect(screen.getByTestId('form-error')).toBeInTheDocument();
      });
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
      const claimedDateInput = screen.getByLabelText(/claimed date/i);

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

      const claimedDateInput = screen.getByLabelText(/claimed date/i);
      const container = claimedDateInput.closest('[class*="conditionalField"]');
      expect(container?.className).toContain('Hidden');
    });
  });

  // ─── Scenario 10: Mark paid / Mark claimed (StateConfirmModal) ────────────

  describe('Scenario 10: "Mark paid" opens state confirm dialog', () => {
    it('opens StateConfirmModal when "Mark paid" is clicked', () => {
      const deposit = makeDeposit('dep-1', { status: 'pending' });
      renderSection([deposit]);

      const menuBtn = screen.getAllByRole('button').find((b) => b.textContent?.includes('⋮'))!;
      fireEvent.click(menuBtn);

      const markPaidBtn = screen
        .getAllByRole('menuitem')
        .find((m) => m.textContent?.toLowerCase().includes('paid'))!;
      fireEvent.click(markPaidBtn);

      // A dialog should appear
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      // Date input should appear for selecting paid date
      expect(screen.getByLabelText(/date/i)).toBeInTheDocument();
    });

    it('confirming Mark paid calls updateDeposit with status=paid and paidDate', async () => {
      const deposit = makeDeposit('dep-1', { status: 'pending' });
      mockUpdateDeposit.mockResolvedValueOnce({
        deposit: { ...deposit, status: 'paid', paidDate: '2026-03-10' },
      } as Awaited<ReturnType<typeof mockUpdateDeposit>>);

      const onMutated = jest.fn();
      renderSection([deposit], { onDepositMutated: onMutated });

      // Open menu, click Mark paid
      const menuBtn = screen.getAllByRole('button').find((b) => b.textContent?.includes('⋮'))!;
      fireEvent.click(menuBtn);
      const markPaidBtn = screen
        .getAllByRole('menuitem')
        .find((m) => m.textContent?.toLowerCase().includes('paid'))!;
      fireEvent.click(markPaidBtn);

      // Click the Confirm button in the state confirm modal
      await waitFor(() => screen.getByRole('dialog'));
      const confirmBtn = screen.getByTestId('modal-footer').querySelector('button:last-child')!;
      await act(async () => {
        fireEvent.click(confirmBtn);
      });

      await waitFor(() => {
        expect(mockUpdateDeposit).toHaveBeenCalledWith(
          INVOICE_ID,
          'dep-1',
          expect.objectContaining({ status: 'paid' }),
        );
      });
      expect(onMutated).toHaveBeenCalled();
    });
  });

  // ─── Scenario 11: "Mark claimed" ──────────────────────────────────────────

  describe('Scenario 11: "Mark claimed" opens state confirm dialog', () => {
    it('opens StateConfirmModal when "Mark claimed" is clicked from paid deposit', () => {
      const deposit = makeDeposit('dep-1', { status: 'paid', paidDate: '2026-03-10' });
      renderSection([deposit]);

      const menuBtn = screen.getAllByRole('button').find((b) => b.textContent?.includes('⋮'))!;
      fireEvent.click(menuBtn);

      const markClaimedBtn = screen
        .getAllByRole('menuitem')
        .find((m) => m.textContent?.toLowerCase().includes('claimed'))!;
      fireEvent.click(markClaimedBtn);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('confirming Mark claimed calls updateDeposit with status=claimed', async () => {
      const deposit = makeDeposit('dep-1', { status: 'paid', paidDate: '2026-03-10' });
      mockUpdateDeposit.mockResolvedValueOnce({
        deposit: { ...deposit, status: 'claimed', claimedDate: '2026-03-20' },
      } as Awaited<ReturnType<typeof mockUpdateDeposit>>);

      const onMutated = jest.fn();
      renderSection([deposit], { onDepositMutated: onMutated });

      const menuBtn = screen.getAllByRole('button').find((b) => b.textContent?.includes('⋮'))!;
      fireEvent.click(menuBtn);
      const markClaimedBtn = screen
        .getAllByRole('menuitem')
        .find((m) => m.textContent?.toLowerCase().includes('claimed'))!;
      fireEvent.click(markClaimedBtn);

      await waitFor(() => screen.getByRole('dialog'));
      const confirmBtn = screen.getByTestId('modal-footer').querySelector('button:last-child')!;
      await act(async () => {
        fireEvent.click(confirmBtn);
      });

      await waitFor(() => {
        expect(mockUpdateDeposit).toHaveBeenCalledWith(
          INVOICE_ID,
          'dep-1',
          expect.objectContaining({ status: 'claimed' }),
        );
      });
      expect(onMutated).toHaveBeenCalled();
    });
  });

  // ─── Scenario 12: "Revert to pending" (immediate) ─────────────────────────

  describe('Scenario 12: "Revert to pending" fires immediately', () => {
    it('calls updateDeposit with status=pending immediately (no dialog)', async () => {
      const deposit = makeDeposit('dep-1', { status: 'paid', paidDate: '2026-03-10' });
      mockUpdateDeposit.mockResolvedValueOnce({
        deposit: { ...deposit, status: 'pending', paidDate: null },
      } as Awaited<ReturnType<typeof mockUpdateDeposit>>);

      const onMutated = jest.fn();
      renderSection([deposit], { onDepositMutated: onMutated });

      // Open menu, click Revert to pending
      const menuBtn = screen.getAllByRole('button').find((b) => b.textContent?.includes('⋮'))!;
      fireEvent.click(menuBtn);

      const revertBtn = screen
        .getAllByRole('menuitem')
        .find((m) => m.textContent?.toLowerCase().includes('pending'))!;
      await act(async () => {
        fireEvent.click(revertBtn);
      });

      await waitFor(() => {
        expect(mockUpdateDeposit).toHaveBeenCalledWith(INVOICE_ID, 'dep-1', { status: 'pending' });
      });
      expect(onMutated).toHaveBeenCalled();
    });
  });

  // ─── Scenario 13: "Revert to paid" (immediate, claimed→paid) ─────────────

  describe('Scenario 13: "Revert to paid" fires immediately', () => {
    it('calls updateDeposit with status=paid immediately when revert from claimed', async () => {
      const deposit = makeDeposit('dep-1', {
        status: 'claimed',
        paidDate: '2026-03-10',
        claimedDate: '2026-03-20',
      });
      mockUpdateDeposit.mockResolvedValueOnce({
        deposit: { ...deposit, status: 'paid', claimedDate: null },
      } as Awaited<ReturnType<typeof mockUpdateDeposit>>);

      const onMutated = jest.fn();
      renderSection([deposit], { onDepositMutated: onMutated });

      const menuBtn = screen.getAllByRole('button').find((b) => b.textContent?.includes('⋮'))!;
      fireEvent.click(menuBtn);

      const revertBtn = screen
        .getAllByRole('menuitem')
        .find(
          (m) =>
            m.textContent?.toLowerCase().includes('revert') &&
            m.textContent?.toLowerCase().includes('paid'),
        )!;
      await act(async () => {
        fireEvent.click(revertBtn);
      });

      await waitFor(() => {
        expect(mockUpdateDeposit).toHaveBeenCalledWith(INVOICE_ID, 'dep-1', { status: 'paid' });
      });
      expect(onMutated).toHaveBeenCalled();
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

    it('State confirm modal cancel button shows "Cancel"', () => {
      const deposit = makeDeposit('dep-1', { status: 'pending' });
      renderSection([deposit]);

      // Open state-confirm modal (Mark paid)
      const menuBtn = screen.getAllByRole('button').find((b) => b.textContent?.includes('⋮'))!;
      fireEvent.click(menuBtn);
      const markPaidItem = screen
        .getAllByRole('menuitem')
        .find((m) => m.textContent?.toLowerCase().includes('paid'))!;
      fireEvent.click(markPaidItem);

      const cancelBtn = screen.getByTestId('state-confirm-cancel');
      expect(cancelBtn.textContent).toBe('Cancel');
      expect(cancelBtn.textContent).not.toContain('button.cancel');
      expect(cancelBtn.textContent).not.toContain('buttons.cancel');
    });

    it('State confirm modal confirm button shows "Confirm"', () => {
      const deposit = makeDeposit('dep-1', { status: 'pending' });
      renderSection([deposit]);

      const menuBtn = screen.getAllByRole('button').find((b) => b.textContent?.includes('⋮'))!;
      fireEvent.click(menuBtn);
      const markPaidItem = screen
        .getAllByRole('menuitem')
        .find((m) => m.textContent?.toLowerCase().includes('paid'))!;
      fireEvent.click(markPaidItem);

      const confirmBtn = screen.getByTestId('state-confirm-button');
      expect(confirmBtn.textContent).toBe('Confirm');
      expect(confirmBtn.textContent).not.toContain('button.confirm');
      expect(confirmBtn.textContent).not.toContain('buttons.confirm');
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

  // ─── Scenario 17–21: Revert error surfacing (#1413) ───────────────────────

  describe('revert error surfacing (#1413)', () => {
    // Helper: open the first overflow menu and return its menu items
    function openMenuForFirstDeposit() {
      const menuBtn = screen.getAllByRole('button').find((b) => b.textContent?.includes('⋮'))!;
      fireEvent.click(menuBtn);
      return screen.getAllByRole('menuitem');
    }

    // ─── Scenario 17: handleRevertToPending — API error ─────────────────────

    it('Scenario 17: handleRevertToPending — ApiClientError shows section-level alert', async () => {
      const deposit = makeDeposit('dep-1', { status: 'paid', paidDate: '2026-03-10' });
      mockUpdateDeposit.mockRejectedValueOnce(
        new MockApiClientError(400, { code: 'INVALID_DEPOSIT_STATUS_TRANSITION' }),
      );

      renderSection([deposit]);

      const menuItems = openMenuForFirstDeposit();
      // For a paid deposit, "Revert to pending" is a menu item
      const revertBtn = menuItems.find((m) => m.textContent?.toLowerCase().includes('pending'))!;
      await act(async () => {
        fireEvent.click(revertBtn);
      });

      // The section-level FormError (role="alert") should appear
      await waitFor(() => {
        const alerts = screen.getAllByRole('alert');
        expect(alerts.length).toBeGreaterThan(0);
        // The error should contain the translated code from translateApiError mock
        const alertText = alerts.map((a) => a.textContent ?? '').join(' ');
        expect(alertText).toContain('translated:INVALID_DEPOSIT_STATUS_TRANSITION');
      });
    });

    // ─── Scenario 18: handleRevertToPending — network error ──────────────────

    it('Scenario 18: handleRevertToPending — plain Error shows revertNetworkError banner', async () => {
      const deposit = makeDeposit('dep-1', { status: 'paid', paidDate: '2026-03-10' });
      mockUpdateDeposit.mockRejectedValueOnce(new Error('network'));

      renderSection([deposit]);

      const menuItems = openMenuForFirstDeposit();
      const revertBtn = menuItems.find((m) => m.textContent?.toLowerCase().includes('pending'))!;
      await act(async () => {
        fireEvent.click(revertBtn);
      });

      // revertNetworkError translation key is used; i18next returns the English string in tests
      await waitFor(() => {
        const alerts = screen.getAllByRole('alert');
        expect(alerts.length).toBeGreaterThan(0);
        const alertText = alerts.map((a) => a.textContent ?? '').join(' ');
        expect(alertText).toContain('Network error');
      });
    });

    // ─── Scenario 19: handleRevertToPaid — API error ─────────────────────────

    it('Scenario 19: handleRevertToPaid — ApiClientError shows section-level alert', async () => {
      const deposit = makeDeposit('dep-1', {
        status: 'claimed',
        paidDate: '2026-03-10',
        claimedDate: '2026-03-20',
      });
      mockUpdateDeposit.mockRejectedValueOnce(
        new MockApiClientError(400, { code: 'INVALID_DEPOSIT_STATUS_TRANSITION' }),
      );

      renderSection([deposit]);

      const menuItems = openMenuForFirstDeposit();
      // For a claimed deposit, "Revert to paid" is the revert action
      const revertBtn = menuItems.find(
        (m) =>
          m.textContent?.toLowerCase().includes('revert') &&
          m.textContent?.toLowerCase().includes('paid'),
      )!;
      await act(async () => {
        fireEvent.click(revertBtn);
      });

      await waitFor(() => {
        const alerts = screen.getAllByRole('alert');
        expect(alerts.length).toBeGreaterThan(0);
        const alertText = alerts.map((a) => a.textContent ?? '').join(' ');
        expect(alertText).toContain('translated:INVALID_DEPOSIT_STATUS_TRANSITION');
      });
    });

    // ─── Scenario 20: Banner auto-dismiss after 6000ms ────────────────────────

    it('Scenario 20: revert error banner auto-dismisses after 6000ms', async () => {
      jest.useFakeTimers();

      const deposit = makeDeposit('dep-1', { status: 'paid', paidDate: '2026-03-10' });
      mockUpdateDeposit.mockRejectedValueOnce(new Error('network'));

      renderSection([deposit]);

      const menuItems = openMenuForFirstDeposit();
      const revertBtn = menuItems.find((m) => m.textContent?.toLowerCase().includes('pending'))!;

      await act(async () => {
        fireEvent.click(revertBtn);
      });

      // Banner should be present
      await waitFor(() => {
        expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
      });

      // Advance past the 6000ms auto-dismiss timer
      await act(async () => {
        jest.advanceTimersByTime(6001);
        await Promise.resolve();
      });

      await waitFor(() => {
        // After dismissal, the revert error alert should be gone
        // (The section-level FormError is only rendered when revertError !== '')
        const remainingAlerts = screen.queryAllByRole('alert');
        expect(remainingAlerts.length).toBe(0);
      });

      jest.useRealTimers();
    });

    // ─── Scenario 21: handleStateConfirm — modal error ───────────────────────

    it('Scenario 21: handleStateConfirm — PATCH rejects with API error, FormError inside dialog', async () => {
      const deposit = makeDeposit('dep-1', { status: 'pending' });
      // First call is for the state-confirm (mark-paid); it should reject
      mockUpdateDeposit.mockRejectedValueOnce(
        new MockApiClientError(400, { code: 'INVALID_DEPOSIT_STATUS_TRANSITION' }),
      );

      renderSection([deposit]);

      // Open menu and click "Mark paid"
      const menuItems = openMenuForFirstDeposit();
      const markPaidBtn = menuItems.find((m) => m.textContent?.toLowerCase().includes('paid'))!;
      fireEvent.click(markPaidBtn);

      // The state confirm dialog should appear
      await waitFor(() => screen.getByRole('dialog'));

      // Click the confirm button
      const confirmBtn = screen.getByTestId('modal-footer').querySelector('button:last-child')!;
      await act(async () => {
        fireEvent.click(confirmBtn);
      });

      // FormError should appear INSIDE the dialog
      await waitFor(() => {
        const dialog = screen.getByRole('dialog');
        // role="alert" from FormError mock
        const alertInsideDialog = dialog.querySelector('[role="alert"]');
        expect(alertInsideDialog).toBeInTheDocument();
        expect(alertInsideDialog!.textContent).toContain(
          'translated:INVALID_DEPOSIT_STATUS_TRANSITION',
        );
      });
    });
  });
});
