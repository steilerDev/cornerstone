/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { MemoryRouter } from 'react-router-dom';
import type { InvoiceDetail, UndoToken } from '@cornerstone/shared';
import { findDuplicateTestIds } from '../../test/findDuplicateTestIds.js';
import { OriginProbe, probedOrigin, probedPath } from '../../test/originProbe.js';
import { LocaleProvider } from '../../contexts/LocaleContext.js';
import { ToastProvider, useToast } from '../../components/Toast/ToastContext.js';
import * as statusChangeActual from '../../lib/statusChangeApi.js';
import { makeInvoiceDetail, makePayment } from '../../test/invoiceDetailFixtures.js';
import type * as PanelModule from './InvoicePaymentsPanel.js';

const TOKEN: UndoToken = { token: `u_${'a'.repeat(32)}`, expiresAt: '2026-01-01T00:00:30Z' };

const mockDeleteDeposit =
  jest.fn<(invoiceId: string, id: string) => Promise<{ undo: UndoToken }>>();
const mockChangeDepositStatus =
  jest.fn<(invoiceId: string, id: string, body: unknown) => Promise<unknown>>();
const mockUndoChange = jest.fn<(token: string) => Promise<unknown>>();

jest.unstable_mockModule('../../lib/invoiceDepositsApi.js', () => ({
  deleteDeposit: mockDeleteDeposit,
}));
jest.unstable_mockModule('../../lib/statusChangeApi.js', () => ({
  ...statusChangeActual,
  changeDepositStatus: mockChangeDepositStatus,
}));
jest.unstable_mockModule('../../lib/undoApi.js', () => ({ undoChange: mockUndoChange }));
jest.unstable_mockModule('../../contexts/HouseNameContext.js', () => ({
  useEntriesLanguage: () => 'en',
}));

let InvoicePaymentsPanel: (typeof PanelModule)['InvoicePaymentsPanel'];

const openAdd = jest.fn();
const openEdit = jest.fn();
const onChanged = jest.fn<() => Promise<unknown>>();

function ToastView() {
  const { toasts, undoToast } = useToast();
  return (
    <ul data-testid="toasts">
      {toasts.map((toast) => (
        <li key={toast.id}>
          <span>{toast.message}</span>
          {toast.variant === 'undo' && (
            <button type="button" data-testid="toast-undo" onClick={() => void undoToast(toast.id)}>
              Undo
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

const ORIGIN = { origin: { to: '/budget/invoices/inv-1', name: 'Roofing invoice' } } as never;

function renderPanel(invoice: InvoiceDetail) {
  const headingRef = createRef<HTMLElement>();
  return render(
    <LocaleProvider>
      <ToastProvider>
        <MemoryRouter initialEntries={['/budget/invoices/inv-1']}>
          <InvoicePaymentsPanel
            invoice={invoice}
            payments={{ openAdd, openEdit }}
            onChanged={onChanged}
            headingRef={headingRef}
            originState={ORIGIN}
          />
          <OriginProbe />
          <ToastView />
        </MemoryRouter>
      </ToastProvider>
    </LocaleProvider>,
  );
}

const TWO_PAYMENTS = [
  makePayment({ id: 'p1', amount: 300, status: 'paid', paidDate: '2026-07-22' }),
  makePayment({ id: 'p2', amount: 200, status: 'pending' }),
];
const REFUND = makePayment({ id: 'r1', entryType: 'refund', amount: 50, status: 'pending' });

beforeEach(async () => {
  openAdd.mockReset();
  openEdit.mockReset();
  onChanged.mockReset().mockResolvedValue(undefined);
  mockDeleteDeposit.mockReset().mockResolvedValue({ undo: TOKEN });
  mockChangeDepositStatus.mockReset();
  mockUndoChange.mockReset().mockResolvedValue({ restored: [] });
  ({ InvoicePaymentsPanel } = (await import('./InvoicePaymentsPanel.js')) as typeof PanelModule);
});

describe('InvoicePaymentsPanel (S13)', () => {
  it('shows the two lists with the progress count excluding the final-payment row', () => {
    renderPanel(makeInvoiceDetail({ deposits: [...TWO_PAYMENTS, REFUND] }));
    expect(screen.getByRole('heading', { level: 2, name: 'Progress payments (2)' })).toBeVisible();
    expect(screen.getByRole('heading', { level: 2, name: 'Refunds (1)' })).toBeVisible();
    const progress = screen.getByTestId('invoice-progress-payments');
    expect(within(progress).getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByTestId('invoice-progress-payments-row-final-payment')).toHaveTextContent(
      'Final payment',
    );
    expect(screen.getByTestId('invoice-refunds-row-r1')).toHaveTextContent('Refund 1');
  });

  it('the final-payment row has no link, no edit and no menu', () => {
    renderPanel(makeInvoiceDetail({ deposits: TWO_PAYMENTS }));
    expect(screen.queryByTestId('invoice-progress-payments-link-final-payment')).toBeNull();
    expect(screen.queryByTestId('invoice-progress-payments-edit-final-payment')).toBeNull();
    expect(screen.queryByTestId('invoice-progress-payments-actions-final-payment')).toBeNull();
    expect(screen.getByTestId('invoice-progress-payments-edit-p1')).toBeInTheDocument();
  });

  it('empty lists repeat their action in the empty message and keep the add buttons', () => {
    renderPanel(makeInvoiceDetail({ deposits: [] }));
    expect(screen.getByText('No progress payments yet. Add a progress payment.')).toBeVisible();
    expect(screen.getByText('No refunds yet. Add a refund.')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Progress payments (0)' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Add progress payment' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Add refund' })).toBeVisible();
  });

  it('Add progress payment and Add refund open the dialog with their entry type and opener', async () => {
    renderPanel(makeInvoiceDetail());
    const addPayment = screen.getByRole('button', { name: 'Add progress payment' });
    await userEvent.click(addPayment);
    expect(openAdd).toHaveBeenLastCalledWith('deposit', addPayment);
    const addRefund = screen.getByRole('button', { name: 'Add refund' });
    await userEvent.click(addRefund);
    expect(openAdd).toHaveBeenLastCalledWith('refund', addRefund);
  });

  it('the row link goes to the payment on this page and carries the origin', async () => {
    renderPanel(makeInvoiceDetail({ deposits: TWO_PAYMENTS }));
    const link = screen.getByTestId('invoice-progress-payments-link-p2');
    expect(link).toHaveAttribute('href', '/budget/invoices/inv-1?tab=payments&payment=p2');
    await userEvent.click(link);
    expect(probedPath()).toBe('/budget/invoices/inv-1');
    expect(probedOrigin()).toEqual({ to: '/budget/invoices/inv-1', name: 'Roofing invoice' });
  });

  it('the edit pencil opens the dialog for that entry with its row title', async () => {
    renderPanel(makeInvoiceDetail({ deposits: [...TWO_PAYMENTS, REFUND] }));
    const edit = screen.getByTestId('invoice-progress-payments-edit-p2');
    await userEvent.click(edit);
    expect(openEdit).toHaveBeenCalledWith(TWO_PAYMENTS[1], 'Progress payment 2', edit);
    await userEvent.click(screen.getByTestId('invoice-refunds-edit-r1'));
    expect(openEdit).toHaveBeenLastCalledWith(REFUND, 'Refund 1', expect.anything());
  });

  it('a description is the row title and the name given to the edit dialog', async () => {
    renderPanel(
      makeInvoiceDetail({ deposits: [makePayment({ id: 'p1', description: 'Scaffolding' })] }),
    );
    await userEvent.click(screen.getByTestId('invoice-progress-payments-edit-p1'));
    expect(openEdit).toHaveBeenCalledWith(expect.anything(), 'Scaffolding', expect.anything());
  });

  it('mounts every status chip once, with payment-status-<id>, and no duplicate test ids', () => {
    const { container } = renderPanel(makeInvoiceDetail({ deposits: [...TWO_PAYMENTS, REFUND] }));
    expect(screen.getByTestId('payment-status-p1')).toHaveTextContent('Paid');
    expect(screen.getByTestId('payment-status-p2')).toHaveTextContent('To pay');
    expect(screen.getByTestId('payment-status-r1')).toHaveTextContent('To pay');
    expect(findDuplicateTestIds(container)).toEqual([]);
    // the chip sits inside the row's facts, not in its badges
    expect(
      within(screen.getByTestId('invoice-progress-payments-row-p2')).getByTestId(
        'payment-status-p2',
      ),
    ).toBeInTheDocument();
  });

  it('the Refund badge shows on refunds only', () => {
    renderPanel(makeInvoiceDetail({ deposits: [...TWO_PAYMENTS, REFUND] }));
    expect(within(screen.getByTestId('invoice-refunds-row-r1')).getByText('Refund')).toBeVisible();
    expect(
      within(screen.getByTestId('invoice-progress-payments-row-p1')).queryByText('Refund'),
    ).toBeNull();
    expect(screen.getByTestId('invoice-refunds-row-r1')).toHaveTextContent('-€50.00');
  });

  describe('status change', () => {
    it('Mark paid asks for a date, sends it, refreshes the page and offers Undo', async () => {
      mockChangeDepositStatus.mockResolvedValue({
        record: makePayment({ id: 'p2', status: 'paid' }),
        undo: TOKEN,
      });
      renderPanel(makeInvoiceDetail({ id: 'inv-1', deposits: TWO_PAYMENTS }));
      fireEvent.click(screen.getByTestId('payment-status-p2'));
      fireEvent.click(screen.getByTestId('payment-status-p2-option-paid'));
      fireEvent.click(screen.getByTestId('payment-status-p2-date-today'));
      await waitFor(() => expect(mockChangeDepositStatus).toHaveBeenCalledTimes(1));
      expect(mockChangeDepositStatus).toHaveBeenCalledWith('inv-1', 'p2', {
        status: 'paid',
        paidDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      });
      await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
      expect(screen.getByTestId('toasts')).toHaveTextContent('Progress payment 2 is now “Paid”.');
      await act(async () => {
        fireEvent.click(await screen.findByTestId('toast-undo'));
      });
      expect(mockUndoChange).toHaveBeenCalledWith(TOKEN.token);
      await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(2));
    });

    it('going back applies at once with only the status', async () => {
      mockChangeDepositStatus.mockResolvedValue({
        record: makePayment({ id: 'p1', status: 'pending' }),
        undo: TOKEN,
      });
      renderPanel(makeInvoiceDetail({ deposits: TWO_PAYMENTS }));
      fireEvent.click(screen.getByTestId('payment-status-p1'));
      fireEvent.click(screen.getByTestId('payment-status-p1-option-pending'));
      await waitFor(() => expect(mockChangeDepositStatus).toHaveBeenCalledTimes(1));
      expect(mockChangeDepositStatus.mock.calls[0]![2]).toEqual({ status: 'pending' });
    });

    it('names the refund in the Undo toast', async () => {
      mockChangeDepositStatus.mockResolvedValue({ record: REFUND, undo: TOKEN });
      renderPanel(makeInvoiceDetail({ deposits: [REFUND] }));
      fireEvent.click(screen.getByTestId('payment-status-r1'));
      fireEvent.click(screen.getByTestId('payment-status-r1-option-paid'));
      fireEvent.click(screen.getByTestId('payment-status-r1-date-today'));
      await waitFor(() =>
        expect(screen.getByTestId('toasts')).toHaveTextContent('Refund 1 is now “Paid”.'),
      );
    });

    it('a failed change toasts an error, offers no Undo and does not refresh', async () => {
      mockChangeDepositStatus.mockRejectedValue(new Error('RAW'));
      renderPanel(makeInvoiceDetail({ deposits: TWO_PAYMENTS }));
      fireEvent.click(screen.getByTestId('payment-status-p1'));
      fireEvent.click(screen.getByTestId('payment-status-p1-option-pending'));
      await waitFor(() =>
        expect(screen.getByTestId('toasts')).toHaveTextContent('The status could not be changed.'),
      );
      expect(screen.queryByTestId('toast-undo')).toBeNull();
      expect(onChanged).not.toHaveBeenCalled();
    });
  });

  describe('Remove', () => {
    async function removeRow(listTestId: string, id: string) {
      await userEvent.click(screen.getByTestId(`${listTestId}-actions-${id}`));
      await act(async () => {
        fireEvent.click(await screen.findByTestId(`${listTestId}-remove-${id}`));
      });
    }

    it('deletes the entry, refreshes the page and offers Undo with the returned token', async () => {
      renderPanel(makeInvoiceDetail({ id: 'inv-1', deposits: TWO_PAYMENTS }));
      await removeRow('invoice-progress-payments', 'p2');
      expect(mockDeleteDeposit).toHaveBeenCalledWith('inv-1', 'p2');
      expect(onChanged).toHaveBeenCalledTimes(1);
      await act(async () => {
        fireEvent.click(await screen.findByTestId('toast-undo'));
      });
      expect(mockUndoChange).toHaveBeenCalledWith(TOKEN.token);
    });

    it('Undo refreshes the page again (onRestored)', async () => {
      renderPanel(makeInvoiceDetail({ deposits: [REFUND] }));
      await removeRow('invoice-refunds', 'r1');
      expect(mockDeleteDeposit).toHaveBeenCalledWith('inv-1', 'r1');
      onChanged.mockClear();
      await act(async () => {
        fireEvent.click(await screen.findByTestId('toast-undo'));
      });
      await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    });

    it('a failed delete shows the remove error and does not refresh', async () => {
      mockDeleteDeposit.mockRejectedValue(new Error('boom'));
      renderPanel(makeInvoiceDetail({ deposits: TWO_PAYMENTS }));
      await removeRow('invoice-progress-payments', 'p1');
      expect(onChanged).not.toHaveBeenCalled();
      expect(screen.queryByTestId('toast-undo')).toBeNull();
      expect(await screen.findByText(/could not be removed|Couldn.t remove|remove/i)).toBeVisible();
    });
  });
});
