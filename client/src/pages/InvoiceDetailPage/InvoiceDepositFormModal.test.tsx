/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { BudgetSource, InvoiceDeposit } from '@cornerstone/shared';
import i18n from '../../i18n/index.js';
import type * as DepositsApiTypes from '../../lib/invoiceDepositsApi.js';
import type * as ModalTypes from './InvoiceDepositFormModal.js';

const mockCreateDeposit = jest.fn<typeof DepositsApiTypes.createDeposit>();
const mockUpdateDeposit = jest.fn<typeof DepositsApiTypes.updateDeposit>();

jest.unstable_mockModule('../../lib/invoiceDepositsApi.js', () => ({
  createDeposit: mockCreateDeposit,
  updateDeposit: mockUpdateDeposit,
}));

jest.unstable_mockModule('../../lib/formatters.js', () => ({
  useFormatters: () => ({
    formatCurrency: (n: number) => `$${n.toFixed(2)}`,
  }),
}));

const { InvoiceDepositFormModal, getEmptyForm } =
  (await import('./InvoiceDepositFormModal.js')) as typeof ModalTypes;
const { ApiClientError } = await import('../../lib/apiClient.js');

const tr = (key: string, options?: Record<string, unknown>) => i18n.t(key, options) as string;

function makeDeposit(overrides: Partial<InvoiceDeposit> = {}): InvoiceDeposit {
  return {
    id: 'dep-1',
    invoiceId: 'inv-1',
    amount: 500,
    dueDate: '2026-02-01T00:00:00.000Z',
    paidDate: null,
    claimedDate: null,
    description: 'Initial',
    status: 'pending',
    entryType: 'deposit',
    budgetSourceId: 'src-1',
    createdBy: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const sources = [
  { id: 'src-1', name: 'Bank Loan' },
  { id: 'src-2', name: 'Savings' },
] as unknown as BudgetSource[];

type Props = React.ComponentProps<typeof ModalTypes.InvoiceDepositFormModal>;

function renderModal(props: Partial<Props> = {}) {
  const onSaved = jest.fn<(d: InvoiceDeposit) => void>();
  const onClose = jest.fn<() => void>();
  const utils = render(
    <InvoiceDepositFormModal
      invoiceId="inv-1"
      mode="add"
      budgetSources={sources}
      onSaved={onSaved}
      onClose={onClose}
      {...props}
    />,
  );
  return { onSaved, onClose, ...utils };
}

const refundPreset = {
  entryType: 'refund' as const,
  status: 'pending' as const,
  amount: '1000.00',
  dueDate: '2026-03-05',
  budgetSourceId: 'src-2',
  description: 'Refund for quotation conversion',
};

function submitForm() {
  fireEvent.submit(document.getElementById('deposit-form')!);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getEmptyForm', () => {
  it('returns a pending deposit with today as the default paid and claimed dates', () => {
    const today = new Date().toISOString().slice(0, 10);

    expect(getEmptyForm()).toEqual({
      amount: '',
      dueDate: '',
      status: 'pending',
      paidDate: today,
      claimedDate: today,
      description: '',
      entryType: 'deposit',
      budgetSourceId: null,
    });
  });
});

describe('InvoiceDepositFormModal', () => {
  describe('scenario 44: presets and lockEntryType', () => {
    it('renders refund presets from initialValues', () => {
      renderModal({ initialValues: refundPreset, lockEntryType: true });

      expect(
        screen.getByText(tr('budget:invoiceDetail.deposits.modal.addTitle')),
      ).toBeInTheDocument();
      expect(screen.getByLabelText(/Refund/)).toBeChecked();
      expect(document.getElementById('deposit-amount')).toHaveValue(1000);
      expect(document.getElementById('deposit-dueDate')).toHaveValue('2026-03-05');
      expect(document.getElementById('deposit-budgetSource')).toHaveValue('src-2');
      expect(document.getElementById('deposit-description')).toHaveValue(
        'Refund for quotation conversion',
      );
      expect(document.getElementById('deposit-status')).toHaveValue('pending');
    });

    it('disables both entry-type radios when lockEntryType is set', () => {
      renderModal({ initialValues: refundPreset, lockEntryType: true });

      const radios = screen.getAllByRole('radio');
      expect(radios).toHaveLength(2);
      expect(radios.every((r) => (r as HTMLInputElement).disabled)).toBe(true);
    });

    it('leaves the entry-type radios enabled in add mode without lockEntryType', () => {
      renderModal();

      const radios = screen.getAllByRole('radio');
      expect(radios.every((r) => !(r as HTMLInputElement).disabled)).toBe(true);
      fireEvent.click(radios[1]!);
      expect(radios[1]).toBeChecked();
    });

    it('shows the refund amount hint only for refunds', () => {
      const { unmount } = renderModal({ initialValues: refundPreset });
      expect(
        screen.getByText(tr('budget:invoiceDetail.deposits.form.refundAmountHint')),
      ).toBeInTheDocument();
      unmount();

      renderModal();
      expect(
        screen.queryByText(tr('budget:invoiceDetail.deposits.form.refundAmountHint')),
      ).not.toBeInTheDocument();
    });

    it('edit mode prefills from the deposit, disables the entry type and uses the edit title', () => {
      renderModal({
        mode: 'edit',
        deposit: makeDeposit({
          entryType: 'refund',
          status: 'claimed',
          paidDate: '2026-02-10T00:00:00.000Z',
          claimedDate: '2026-02-11T00:00:00.000Z',
        }),
      });

      expect(
        screen.getByText(tr('budget:invoiceDetail.deposits.modal.editTitle')),
      ).toBeInTheDocument();
      expect(document.getElementById('deposit-amount')).toHaveValue(500);
      expect(document.getElementById('deposit-dueDate')).toHaveValue('2026-02-01');
      expect(document.getElementById('deposit-paidDate')).toHaveValue('2026-02-10');
      expect(document.getElementById('deposit-claimedDate')).toHaveValue('2026-02-11');
      expect(document.getElementById('deposit-status')).toHaveValue('claimed');
      expect(document.getElementById('deposit-budgetSource')).toHaveValue('src-1');
      expect(document.getElementById('deposit-description')).toHaveValue('Initial');
      expect(screen.getAllByRole('radio').every((r) => (r as HTMLInputElement).disabled)).toBe(
        true,
      );
    });

    it('edit mode handles a deposit without optional fields', () => {
      renderModal({
        mode: 'edit',
        deposit: makeDeposit({ description: null, budgetSourceId: null }),
      });

      expect(document.getElementById('deposit-paidDate')).toHaveValue('');
      expect(document.getElementById('deposit-description')).toHaveValue('');
      expect(document.getElementById('deposit-budgetSource')).toHaveValue('');
    });

    it('edit mode without a deposit falls back to the empty form', () => {
      renderModal({ mode: 'edit', deposit: null });

      expect(document.getElementById('deposit-amount')).toHaveValue(null);
    });
  });

  describe('budget source hint', () => {
    it('is hidden when budgetLineSourceCount is undefined', () => {
      renderModal();

      expect(
        screen.queryByText(tr('budget:invoiceDetail.deposits.form.budgetSourceHintNone')),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText(
          tr('budget:invoiceDetail.deposits.form.budgetSourceHintSingle', { name: '—' }),
        ),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText(
          tr('budget:invoiceDetail.deposits.form.budgetSourceHintLargest', { name: '—' }),
        ),
      ).not.toBeInTheDocument();
    });

    it('shows the none hint for 0 sources', () => {
      renderModal({ budgetLineSourceCount: 0 });

      expect(
        screen.getByText(tr('budget:invoiceDetail.deposits.form.budgetSourceHintNone')),
      ).toBeInTheDocument();
    });

    it('shows the single-source hint with the selected source name', () => {
      renderModal({ budgetLineSourceCount: 1, initialValues: { budgetSourceId: 'src-1' } });

      expect(
        screen.getByText(
          tr('budget:invoiceDetail.deposits.form.budgetSourceHintSingle', { name: 'Bank Loan' }),
        ),
      ).toBeInTheDocument();
    });

    it('shows the largest-source hint for several sources, with a dash for an unknown id', () => {
      const { unmount } = renderModal({ budgetLineSourceCount: 3, largestBudgetSourceId: 'src-2' });
      expect(
        screen.getByText(
          tr('budget:invoiceDetail.deposits.form.budgetSourceHintLargest', { name: 'Savings' }),
        ),
      ).toBeInTheDocument();
      unmount();

      renderModal({ budgetLineSourceCount: 3, largestBudgetSourceId: 'missing' });
      expect(
        screen.getByText(
          tr('budget:invoiceDetail.deposits.form.budgetSourceHintLargest', { name: '—' }),
        ),
      ).toBeInTheDocument();
    });

    it('single-source hint shows a dash when no source is selected', () => {
      renderModal({ budgetLineSourceCount: 1 });

      expect(
        screen.getByText(
          tr('budget:invoiceDetail.deposits.form.budgetSourceHintSingle', { name: '—' }),
        ),
      ).toBeInTheDocument();
    });
  });

  describe('scenario 44: submit and onSaved payload', () => {
    it('creates a refund deposit and passes the saved deposit to onSaved', async () => {
      const saved = makeDeposit({ id: 'new', entryType: 'refund', amount: 1000 });
      mockCreateDeposit.mockResolvedValue({ deposit: saved });
      const { onSaved } = renderModal({ initialValues: refundPreset, lockEntryType: true });

      submitForm();

      await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
      expect(onSaved).toHaveBeenCalledWith(saved);
      expect(mockCreateDeposit).toHaveBeenCalledWith('inv-1', {
        amount: 1000,
        dueDate: '2026-03-05',
        status: 'pending',
        entryType: 'refund',
        description: 'Refund for quotation conversion',
        budgetSourceId: 'src-2',
      });
      expect(mockUpdateDeposit).not.toHaveBeenCalled();
    });

    it('sends paidDate for a paid status and claimedDate for a claimed status', async () => {
      mockCreateDeposit.mockResolvedValue({ deposit: makeDeposit() });
      renderModal({
        initialValues: {
          amount: '250',
          dueDate: '2026-03-01',
          status: 'claimed',
          paidDate: '2026-03-02',
          claimedDate: '2026-03-03',
        },
      });

      submitForm();

      await waitFor(() => expect(mockCreateDeposit).toHaveBeenCalledTimes(1));
      expect(mockCreateDeposit.mock.calls[0]![1]).toMatchObject({
        status: 'claimed',
        paidDate: '2026-03-02',
        claimedDate: '2026-03-03',
        description: null,
        budgetSourceId: null,
      });
    });

    it('sends a paid status with paidDate only', async () => {
      mockCreateDeposit.mockResolvedValue({ deposit: makeDeposit() });
      renderModal({
        initialValues: {
          amount: '250',
          dueDate: '2026-03-01',
          status: 'paid',
          paidDate: '2026-03-02',
        },
      });

      submitForm();

      await waitFor(() => expect(mockCreateDeposit).toHaveBeenCalledTimes(1));
      const body = mockCreateDeposit.mock.calls[0]![1];
      expect(body).toMatchObject({ status: 'paid', paidDate: '2026-03-02' });
      expect('claimedDate' in body).toBe(false);
    });

    it('edit mode calls updateDeposit with the deposit id and no entryType', async () => {
      const saved = makeDeposit({ amount: 600 });
      mockUpdateDeposit.mockResolvedValue({ deposit: saved });
      const { onSaved } = renderModal({ mode: 'edit', deposit: makeDeposit() });
      fireEvent.change(document.getElementById('deposit-amount')!, { target: { value: '600' } });

      submitForm();

      await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved));
      expect(mockUpdateDeposit).toHaveBeenCalledWith('inv-1', 'dep-1', {
        amount: 600,
        dueDate: '2026-02-01',
        status: 'pending',
        description: 'Initial',
        budgetSourceId: 'src-1',
      });
      expect(mockCreateDeposit).not.toHaveBeenCalled();
    });

    it('edit mode without a deposit submits nothing', async () => {
      const { onSaved } = renderModal({
        mode: 'edit',
        deposit: null,
        initialValues: { amount: '5', dueDate: '2026-01-01' },
      });
      fireEvent.change(document.getElementById('deposit-amount')!, { target: { value: '5' } });
      fireEvent.change(document.getElementById('deposit-dueDate')!, {
        target: { value: '2026-01-01' },
      });

      submitForm();

      await waitFor(() => expect(screen.getByTestId('deposit-modal-save')).toBeEnabled());
      expect(mockUpdateDeposit).not.toHaveBeenCalled();
      expect(mockCreateDeposit).not.toHaveBeenCalled();
      expect(onSaved).not.toHaveBeenCalled();
    });

    it('updates form fields from the inputs', async () => {
      mockCreateDeposit.mockResolvedValue({ deposit: makeDeposit() });
      const { onSaved } = renderModal();
      fireEvent.change(document.getElementById('deposit-amount')!, { target: { value: '75.5' } });
      fireEvent.change(document.getElementById('deposit-dueDate')!, {
        target: { value: '2026-04-04' },
      });
      fireEvent.change(document.getElementById('deposit-budgetSource')!, {
        target: { value: 'src-2' },
      });
      fireEvent.change(document.getElementById('deposit-description')!, {
        target: { value: 'x'.repeat(600) },
      });
      fireEvent.click(screen.getAllByRole('radio')[1]!);

      expect(
        (document.getElementById('deposit-description') as HTMLTextAreaElement).value,
      ).toHaveLength(500);
      fireEvent.change(document.getElementById('deposit-budgetSource')!, { target: { value: '' } });
      fireEvent.change(document.getElementById('deposit-budgetSource')!, {
        target: { value: 'src-2' },
      });
      submitForm();

      await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
      expect(mockCreateDeposit.mock.calls[0]![1]).toMatchObject({
        amount: 75.5,
        dueDate: '2026-04-04',
        entryType: 'refund',
        budgetSourceId: 'src-2',
      });
    });

    it('changing the status reveals the conditional dates and updates the form', async () => {
      mockCreateDeposit.mockResolvedValue({ deposit: makeDeposit() });
      renderModal({ initialValues: { amount: '10', dueDate: '2026-01-01' } });

      fireEvent.change(document.getElementById('deposit-status')!, {
        target: { value: 'claimed' },
      });
      fireEvent.change(document.getElementById('deposit-paidDate')!, {
        target: { value: '2026-01-05' },
      });
      fireEvent.change(document.getElementById('deposit-claimedDate')!, {
        target: { value: '2026-01-06' },
      });
      submitForm();

      await waitFor(() => expect(mockCreateDeposit).toHaveBeenCalledTimes(1));
      expect(mockCreateDeposit.mock.calls[0]![1]).toMatchObject({
        status: 'claimed',
        paidDate: '2026-01-05',
        claimedDate: '2026-01-06',
      });
    });
  });

  describe('client-side validation', () => {
    it('shows the amount error for a non-positive amount', () => {
      renderModal({ initialValues: { amount: '0', dueDate: '2026-01-01' } });

      submitForm();

      expect(
        screen.getByText(tr('budget:invoiceDetail.deposits.errors.amountRequired')),
      ).toBeInTheDocument();
      expect(mockCreateDeposit).not.toHaveBeenCalled();
    });

    it('shows a date error when the due date is missing', () => {
      renderModal({ initialValues: { amount: '10', dueDate: '' } });

      submitForm();

      expect(
        screen.getByText(tr('budget:invoiceDetail.deposits.errors.dueDateRequired')),
      ).toBeInTheDocument();
      expect(mockCreateDeposit).not.toHaveBeenCalled();
    });

    it('shows a date error when a non-pending deposit has no paid date', () => {
      renderModal({
        initialValues: { amount: '10', dueDate: '2026-01-01', status: 'paid', paidDate: '' },
      });

      submitForm();

      expect(
        screen.getByText(tr('budget:invoiceDetail.deposits.errors.paidDateRequired')),
      ).toBeInTheDocument();
      expect(mockCreateDeposit).not.toHaveBeenCalled();
    });

    it('shows a date error when a claimed deposit has no claimed date', () => {
      renderModal({
        initialValues: {
          amount: '10',
          dueDate: '2026-01-01',
          status: 'claimed',
          paidDate: '2026-01-02',
          claimedDate: '',
        },
      });

      submitForm();

      expect(
        screen.getByText(tr('budget:invoiceDetail.deposits.errors.claimedDateRequired')),
      ).toBeInTheDocument();
      expect(mockCreateDeposit).not.toHaveBeenCalled();
    });

    it('disables Save until amount and due date are set', () => {
      renderModal();
      const save = screen.getByTestId('deposit-modal-save');
      expect(save).toBeDisabled();

      fireEvent.change(document.getElementById('deposit-amount')!, { target: { value: '5' } });
      expect(save).toBeDisabled();
      fireEvent.change(document.getElementById('deposit-dueDate')!, {
        target: { value: '2026-01-01' },
      });
      expect(save).toBeEnabled();

      fireEvent.change(document.getElementById('deposit-status')!, { target: { value: 'paid' } });
      fireEvent.change(document.getElementById('deposit-paidDate')!, { target: { value: '' } });
      expect(save).toBeDisabled();
    });

    it('disables Save for a claimed deposit without a claimed date', () => {
      renderModal({
        initialValues: {
          amount: '10',
          dueDate: '2026-01-01',
          status: 'claimed',
          paidDate: '2026-01-02',
          claimedDate: '',
        },
      });

      expect(screen.getByTestId('deposit-modal-save')).toBeDisabled();
    });
  });

  describe('API error mapping', () => {
    async function submitWithError(err: unknown, props: Partial<Props> = {}) {
      mockCreateDeposit.mockRejectedValue(err);
      mockUpdateDeposit.mockRejectedValue(err);
      const ctx = renderModal({
        initialValues: { amount: '10', dueDate: '2026-01-01' },
        ...props,
      });
      submitForm();
      await waitFor(() => expect(screen.getByTestId('deposit-modal-save')).toBeEnabled());
      return ctx;
    }

    it('maps DEPOSITS_EXCEED_INVOICE_TOTAL with the available headroom', async () => {
      const { onSaved } = await submitWithError(
        new ApiClientError(400, {
          code: 'DEPOSITS_EXCEED_INVOICE_TOTAL',
          message: 'x',
          details: { availableHeadroom: 250 },
        }),
      );

      expect(
        screen.getByText(
          tr('budget:invoiceDetail.deposits.errors.exceedsTotal', { availableHeadroom: '$250.00' }),
        ),
      ).toBeInTheDocument();
      expect(onSaved).not.toHaveBeenCalled();
    });

    it('defaults the headroom to 0 when details are missing', async () => {
      await submitWithError(
        new ApiClientError(400, { code: 'DEPOSITS_EXCEED_INVOICE_TOTAL', message: 'x' }),
      );

      expect(
        screen.getByText(
          tr('budget:invoiceDetail.deposits.errors.exceedsTotal', { availableHeadroom: '$0.00' }),
        ),
      ).toBeInTheDocument();
    });

    it('#2127: editing a refund maps DEPOSITS_EXCEED_INVOICE_TOTAL to the minimum-refund message, not the headroom copy', async () => {
      const { onSaved } = await submitWithError(
        new ApiClientError(400, {
          code: 'DEPOSITS_EXCEED_INVOICE_TOTAL',
          message: 'x',
          details: { minimumRefundAmount: 300, availableHeadroom: 999 },
        }),
        { mode: 'edit', deposit: makeDeposit({ entryType: 'refund' }) },
      );

      expect(
        screen.getByText(
          tr('budget:invoiceDetail.deposits.errors.refundReductionExceedsTotal', {
            minimumRefundAmount: '$300.00',
          }),
        ),
      ).toBeInTheDocument();
      expect(screen.queryByText(/Available headroom/)).not.toBeInTheDocument();
      expect(onSaved).not.toHaveBeenCalled();
    });

    it('#2127: editing a refund defaults the minimum refund to 0 when details are missing', async () => {
      await submitWithError(
        new ApiClientError(400, { code: 'DEPOSITS_EXCEED_INVOICE_TOTAL', message: 'x' }),
        { mode: 'edit', deposit: makeDeposit({ entryType: 'refund' }) },
      );

      expect(
        screen.getByText(
          tr('budget:invoiceDetail.deposits.errors.refundReductionExceedsTotal', {
            minimumRefundAmount: '$0.00',
          }),
        ),
      ).toBeInTheDocument();
    });

    it('#2127: editing a deposit-type entry keeps the exceedsTotal headroom mapping', async () => {
      await submitWithError(
        new ApiClientError(400, {
          code: 'DEPOSITS_EXCEED_INVOICE_TOTAL',
          message: 'x',
          details: { availableHeadroom: 250, minimumRefundAmount: 300 },
        }),
        { mode: 'edit', deposit: makeDeposit({ entryType: 'deposit' }) },
      );

      expect(
        screen.getByText(
          tr('budget:invoiceDetail.deposits.errors.exceedsTotal', { availableHeadroom: '$250.00' }),
        ),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(
          tr('budget:invoiceDetail.deposits.errors.refundReductionExceedsTotal', {
            minimumRefundAmount: '$300.00',
          }),
        ),
      ).not.toBeInTheDocument();
    });

    it('scenario 44: maps REFUND_EXCEEDS_INVOICE with the available headroom', async () => {
      await submitWithError(
        new ApiClientError(400, {
          code: 'REFUND_EXCEEDS_INVOICE',
          message: 'x',
          details: { availableHeadroom: 75 },
        }),
        { initialValues: refundPreset, lockEntryType: true },
      );

      expect(
        screen.getByText(
          tr('budget:invoiceDetail.deposits.errors.refundExceedsTotal', {
            availableHeadroom: '$75.00',
          }),
        ),
      ).toBeInTheDocument();
    });

    it('defaults the refund headroom to 0 when details are missing', async () => {
      await submitWithError(
        new ApiClientError(400, { code: 'REFUND_EXCEEDS_INVOICE', message: 'x' }),
      );

      expect(
        screen.getByText(
          tr('budget:invoiceDetail.deposits.errors.refundExceedsTotal', {
            availableHeadroom: '$0.00',
          }),
        ),
      ).toBeInTheDocument();
    });

    it('maps INVALID_DEPOSIT_STATUS_TRANSITION using details.from/to', async () => {
      await submitWithError(
        new ApiClientError(400, {
          code: 'INVALID_DEPOSIT_STATUS_TRANSITION',
          message: 'x',
          details: { from: 'claimed', to: 'pending' },
        }),
      );

      expect(
        screen.getByText(
          tr('budget:invoiceDetail.deposits.errors.invalidTransition', {
            from: 'claimed',
            to: 'pending',
          }),
        ),
      ).toBeInTheDocument();
    });

    it('falls back to the form status and deposit status when transition details are empty', async () => {
      await submitWithError(
        new ApiClientError(400, {
          code: 'INVALID_DEPOSIT_STATUS_TRANSITION',
          message: 'x',
          details: {},
        }),
        { mode: 'edit', deposit: makeDeposit({ status: 'pending' }) },
      );

      expect(
        screen.getByText(
          tr('budget:invoiceDetail.deposits.errors.invalidTransition', {
            from: 'pending',
            to: 'pending',
          }),
        ),
      ).toBeInTheDocument();
    });

    it('maps INVALID_DEPOSIT_DATE_FOR_STATUS', async () => {
      await submitWithError(
        new ApiClientError(400, { code: 'INVALID_DEPOSIT_DATE_FOR_STATUS', message: 'x' }),
      );

      expect(
        screen.getByText(tr('budget:invoiceDetail.deposits.errors.invalidDate')),
      ).toBeInTheDocument();
    });

    it('translates other API error codes', async () => {
      await submitWithError(
        new ApiClientError(500, { code: 'LLM_UNREACHABLE', message: 'RAW-SERVER-SENTINEL' }),
      );

      expect(screen.getByText(tr('errors:LLM_UNREACHABLE'))).toBeInTheDocument();
      expect(screen.queryByText(/RAW-SERVER-SENTINEL/)).toBeNull();
    });

    it('shows the generic save error for non-API failures', async () => {
      await submitWithError(new Error('RAW-LOCAL'));

      expect(
        screen.getByText(tr('budget:invoiceDetail.deposits.errors.saveError')),
      ).toBeInTheDocument();
      expect(screen.queryByText(/RAW-LOCAL/)).toBeNull();
    });
  });

  describe('closing', () => {
    it('Cancel calls onClose', () => {
      const { onClose } = renderModal();

      fireEvent.click(screen.getByTestId('deposit-modal-cancel'));

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('ignores close requests while the save is in flight', async () => {
      let resolveCreate: (v: { deposit: InvoiceDeposit }) => void = () => undefined;
      mockCreateDeposit.mockReturnValue(
        new Promise((r) => {
          resolveCreate = r;
        }),
      );
      const { onClose, onSaved } = renderModal({
        initialValues: { amount: '10', dueDate: '2026-01-01' },
      });

      submitForm();

      await waitFor(() => expect(screen.getByTestId('deposit-modal-cancel')).toBeDisabled());
      expect(screen.getByTestId('deposit-modal-save')).toHaveTextContent(
        tr('budget:invoiceDetail.deposits.form.saving'),
      );
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onClose).not.toHaveBeenCalled();

      resolveCreate({ deposit: makeDeposit() });
      await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    });
  });
});
