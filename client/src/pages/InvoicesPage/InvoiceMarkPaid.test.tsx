/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { useRef } from 'react';
import type { RefObject } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { InvoiceDeposit, InvoiceListRow } from '@cornerstone/shared';
import { ToastProvider } from '../../components/Toast/ToastContext.js';
import { ToastList } from '../../components/Toast/Toast.js';
import { ApiClientError } from '../../lib/apiClient.js';
import enErrors from '../../i18n/en/errors.json';
import { makeDeposit, makeRow } from '../../test/invoiceListFixtures.js';
import type * as StatusChangeApiTypes from '../../lib/statusChangeApi.js';
import type * as UndoApiTypes from '../../lib/undoApi.js';
import type * as MarkPaidModule from './InvoiceMarkPaid.js';
import type { InvoiceMarkPaidActions } from './InvoiceMarkPaid.js';

const mockChangeInvoiceStatus = jest.fn<typeof StatusChangeApiTypes.changeInvoiceStatus>();
const mockChangeDepositStatus = jest.fn<typeof StatusChangeApiTypes.changeDepositStatus>();
const mockUndoChange = jest.fn<typeof UndoApiTypes.undoChange>();

jest.unstable_mockModule('../../lib/statusChangeApi.js', () => ({
  changeInvoiceStatus: mockChangeInvoiceStatus,
  changeDepositStatus: mockChangeDepositStatus,
  invoiceStatusBody: (to: string) => ({ status: to }),
  depositStatusBody: (from: string, to: string, date: string | null) => ({ from, to, date }),
}));

jest.unstable_mockModule('../../lib/undoApi.js', () => ({
  undoChange: mockUndoChange,
}));

jest.unstable_mockModule('../../contexts/LocaleContext.js', () => ({
  useLocale: jest.fn(() => ({
    locale: 'en' as const,
    resolvedLocale: 'en' as const,
    vatRate: 0.19,
    currency: 'EUR',
    setLocale: jest.fn(),
    syncWithServer: jest.fn(),
  })),
  LocaleProvider: ({ children }: { children: React.ReactNode }) => children,
}));

let mod: typeof MarkPaidModule;

const refreshRows = jest.fn<(keys: readonly string[]) => Promise<void>>();
const refresh = jest.fn<() => void>();
const clear = jest.fn<() => void>();

let latestActions: InvoiceMarkPaidActions | null = null;
let headingRefOut: RefObject<HTMLHeadingElement | null> | null = null;

function token(value: string) {
  return { token: value, expiresAt: '2099-01-01T00:00:00.000Z' };
}

function changed<R>(record: R, undo: string | null = 'tok') {
  return { record, undo: undo ? token(undo) : null };
}

interface HostProps {
  invoices?: InvoiceListRow[];
  deposits?: Array<{ inv: InvoiceListRow; deposit: InvoiceDeposit; name: string }>;
  selected?: InvoiceListRow[];
}

function Host({ invoices = [], deposits = [], selected }: HostProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  headingRefOut = headingRef;
  const actions = mod.useInvoiceMarkPaid({ refreshRows, refresh, headingRef });
  latestActions = actions;
  return (
    <div>
      <h1 ref={headingRef} tabIndex={-1}>
        Invoices
      </h1>
      {invoices.map((inv) => (
        <mod.InvoiceMarkPaidCommand
          key={inv.id}
          inv={inv}
          title={inv.invoiceNumber ?? 'No number'}
          actions={actions}
          testId={`cmd-${inv.id}`}
        />
      ))}
      {deposits.map(({ inv, deposit, name }) => (
        <mod.ProgressPaymentMarkPaidCommand
          key={deposit.id}
          inv={inv}
          deposit={deposit}
          name={name}
          actions={actions}
          testId={`pp-${deposit.id}`}
        />
      ))}
      {selected ? (
        <mod.InvoiceBulkMarkPaid selected={selected} clear={clear} actions={actions} />
      ) : null}
    </div>
  );
}

function renderHost(props: HostProps = {}) {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <ToastList />
        <Host {...props} />
      </ToastProvider>
    </MemoryRouter>,
  );
}

const PENDING = makeRow({ id: 'inv-1', invoiceNumber: 'INV-T-001' });
const PENDING_2 = makeRow({ id: 'inv-2', invoiceNumber: 'INV-T-002', vendorId: 'v-2' });
const PENDING_3 = makeRow({ id: 'inv-3', invoiceNumber: 'INV-T-003' });
const PAID = makeRow({ id: 'inv-4', status: 'paid', invoiceNumber: 'INV-T-004' });
const OFFER = makeRow({ id: 'inv-5', status: 'quotation', invoiceNumber: 'OFF-T-001' });

beforeEach(async () => {
  if (!mod) mod = await import('./InvoiceMarkPaid.js');
  mockChangeInvoiceStatus.mockReset();
  mockChangeDepositStatus.mockReset();
  mockUndoChange.mockReset();
  refreshRows.mockReset();
  refreshRows.mockResolvedValue(undefined);
  refresh.mockReset();
  clear.mockReset();
  mockUndoChange.mockResolvedValue({} as never);
  latestActions = null;
  headingRefOut = null;
});

describe('InvoiceMarkPaidCommand', () => {
  it('renders only for a pending invoice, never for paid, submitted or offers', () => {
    renderHost({
      invoices: [PENDING, PAID, OFFER, makeRow({ id: 'inv-6', status: 'claimed' })],
    });
    expect(screen.getByTestId('cmd-inv-1')).toBeInTheDocument();
    expect(screen.queryByTestId('cmd-inv-4')).toBeNull();
    expect(screen.queryByTestId('cmd-inv-5')).toBeNull();
    expect(screen.queryByTestId('cmd-inv-6')).toBeNull();
  });

  it('starts its accessible name with the visible text and adds title and company', () => {
    renderHost({ invoices: [PENDING] });
    const button = screen.getByTestId('cmd-inv-1');
    expect(button).toHaveTextContent('Mark paid');
    expect(screen.getByRole('button', { name: /^Mark paid/ })).toBe(button);
    expect(button).toHaveAccessibleName(/^Mark paid\s*, INV-T-001, Example Roofing Ltd$/);
  });

  it('marks the invoice paid, refreshes that row and offers Undo', async () => {
    mockChangeInvoiceStatus.mockResolvedValue(changed(PENDING, 'tok-1'));
    renderHost({ invoices: [PENDING] });

    fireEvent.click(screen.getByTestId('cmd-inv-1'));

    await waitFor(() => expect(refreshRows).toHaveBeenCalledWith(['inv-1']));
    expect(mockChangeInvoiceStatus).toHaveBeenCalledWith('v-1', 'inv-1', { status: 'paid' });
    expect(await screen.findByTestId('toast-undo')).toHaveTextContent('INV-T-001 is now “Paid”.');

    screen.getByTestId('toast-undo-button').focus();
    fireEvent.click(screen.getByTestId('toast-undo-button'));
    await waitFor(() => expect(mockUndoChange).toHaveBeenCalledWith('tok-1'));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it('shows no Undo toast when the server issued no token', async () => {
    mockChangeInvoiceStatus.mockResolvedValue(changed(PENDING, null));
    renderHost({ invoices: [PENDING] });
    fireEvent.click(screen.getByTestId('cmd-inv-1'));
    await waitFor(() => expect(refreshRows).toHaveBeenCalled());
    expect(screen.queryByTestId('toast-undo')).toBeNull();
  });

  it('shows the translated error and refreshes nothing when the request fails', async () => {
    mockChangeInvoiceStatus.mockRejectedValue(
      new ApiClientError(409, { code: 'INTERNAL_ERROR', message: 'RAW-SENTINEL' }),
    );
    renderHost({ invoices: [PENDING] });
    fireEvent.click(screen.getByTestId('cmd-inv-1'));

    expect(await screen.findByTestId('toast-error')).toHaveTextContent(enErrors.INTERNAL_ERROR);
    expect(screen.queryByText(/RAW-SENTINEL/)).toBeNull();
    expect(refreshRows).not.toHaveBeenCalled();
  });
});

describe('ProgressPaymentMarkPaidCommand', () => {
  const inv = makeRow({ id: 'inv-1', status: 'quotation', invoiceNumber: 'OFF-T-001' });
  const pending = makeDeposit({ id: 'dep-1' });

  it('renders only for a pending progress payment, never for paid or a refund', () => {
    renderHost({
      deposits: [
        { inv, deposit: pending, name: 'Progress payment 1 of 2' },
        { inv, deposit: makeDeposit({ id: 'dep-2', status: 'paid' }), name: 'x' },
        { inv, deposit: makeDeposit({ id: 'dep-3', entryType: 'refund' }), name: 'y' },
      ],
    });
    expect(screen.getByTestId('pp-dep-1')).toBeInTheDocument();
    expect(screen.queryByTestId('pp-dep-2')).toBeNull();
    expect(screen.queryByTestId('pp-dep-3')).toBeNull();
    expect(screen.getByTestId('pp-dep-1')).toHaveAccessibleName(
      /^Mark paid\s*, Progress payment 1 of 2, Example Roofing Ltd$/,
    );
  });

  it('asks for the date, then marks it paid with that date and refreshes the invoice row', async () => {
    mockChangeDepositStatus.mockResolvedValue(changed(pending, 'tok-d'));
    renderHost({ deposits: [{ inv, deposit: pending, name: 'Progress payment 1 of 2' }] });

    fireEvent.click(screen.getByTestId('pp-dep-1'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('pp-dep-1-date-today'));

    await waitFor(() => expect(refreshRows).toHaveBeenCalledWith(['inv-1']));
    expect(mockChangeDepositStatus).toHaveBeenCalledTimes(1);
    const [invoiceId, depositId, body] = mockChangeDepositStatus.mock.calls[0]!;
    expect(invoiceId).toBe('inv-1');
    expect(depositId).toBe('dep-1');
    expect(body).toMatchObject({ from: 'pending', to: 'paid' });
    expect((body as unknown as { date: string }).date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(await screen.findByTestId('toast-undo')).toHaveTextContent(
      'Progress payment 1 of 2 is now “Paid”.',
    );

    screen.getByTestId('toast-undo-button').focus();
    fireEvent.click(screen.getByTestId('toast-undo-button'));
    await waitFor(() => expect(mockUndoChange).toHaveBeenCalledWith('tok-d'));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
});

describe('InvoiceBulkMarkPaid', () => {
  it('counts only the pending invoices in the label', () => {
    renderHost({ selected: [PENDING, PENDING_2, PAID, OFFER] });
    expect(screen.getByTestId('invoices-bulk-mark-paid')).toHaveTextContent('Mark paid (2)');
  });

  it('names the skipped rows as the button description when some are not eligible', () => {
    renderHost({ selected: [PENDING, OFFER] });
    const button = screen.getByTestId('invoices-bulk-mark-paid');
    expect(button).not.toHaveAttribute('aria-disabled');
    expect(button).toHaveAccessibleDescription("1 selected row can't be marked paid");
  });

  it('uses the plural reason for several skipped rows', () => {
    renderHost({ selected: [PENDING, OFFER, PAID] });
    expect(screen.getByTestId('invoices-bulk-mark-paid')).toHaveAccessibleDescription(
      "2 selected rows can't be marked paid",
    );
  });

  it('has no description when every selected row is eligible', () => {
    renderHost({ selected: [PENDING, PENDING_2] });
    const button = screen.getByTestId('invoices-bulk-mark-paid');
    expect(button).not.toHaveAttribute('aria-describedby');
  });

  it('with none eligible it is aria-disabled with the reason, never native disabled, and does nothing', () => {
    renderHost({ selected: [PAID, OFFER] });
    const button = screen.getByTestId('invoices-bulk-mark-paid');
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).not.toBeDisabled();
    expect(button).toHaveTextContent('Mark paid (0)');
    expect(button).toHaveAccessibleDescription('None of the selected rows can be marked paid');
    fireEvent.click(button);
    expect(mockChangeInvoiceStatus).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
  });

  it('marks the eligible ones one after the other and ignores a second press while running', async () => {
    let resolveFirst: (v: ReturnType<typeof changed>) => void = () => undefined;
    mockChangeInvoiceStatus
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve as never;
          }),
      )
      .mockResolvedValue(changed(PENDING_2, 't2') as never);
    renderHost({ selected: [PENDING, PENDING_2, OFFER] });

    const button = screen.getByTestId('invoices-bulk-mark-paid');
    fireEvent.click(button);
    fireEvent.click(button);
    expect(mockChangeInvoiceStatus).toHaveBeenCalledTimes(1);
    expect(mockChangeInvoiceStatus).toHaveBeenLastCalledWith('v-1', 'inv-1', { status: 'paid' });

    await act(async () => {
      resolveFirst(changed(PENDING, 't1'));
    });
    await waitFor(() => expect(mockChangeInvoiceStatus).toHaveBeenCalledTimes(2));
    expect(mockChangeInvoiceStatus).toHaveBeenLastCalledWith('v-2', 'inv-2', { status: 'paid' });
    await waitFor(() => expect(refreshRows).toHaveBeenCalledWith(['inv-1', 'inv-2']));
    expect(mockChangeInvoiceStatus).toHaveBeenCalledTimes(2);
  });

  it('clears the selection, moves focus to the heading and shows one Undo that undoes newest first', async () => {
    mockChangeInvoiceStatus
      .mockResolvedValueOnce(changed(PENDING, 't1') as never)
      .mockResolvedValueOnce(changed(PENDING_2, 't2') as never)
      .mockResolvedValueOnce(changed(PENDING_3, 't3') as never);
    renderHost({ selected: [PENDING, PENDING_2, PENDING_3] });

    fireEvent.click(screen.getByTestId('invoices-bulk-mark-paid'));

    const toast = await screen.findByTestId('toast-undo');
    expect(toast).toHaveTextContent('3 invoices are now “Paid”.');
    expect(clear).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus();
    expect(screen.getAllByTestId('toast-undo')).toHaveLength(1);

    screen.getByTestId('toast-undo-button').focus();
    fireEvent.click(screen.getByTestId('toast-undo-button'));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveFocus());
    expect(mockUndoChange.mock.calls.map((c) => c[0])).toEqual(['t3', 't2', 't1']);
  });

  it('uses the singular wording for a single invoice', async () => {
    mockChangeInvoiceStatus.mockResolvedValueOnce(changed(PENDING, 't1') as never);
    renderHost({ selected: [PENDING] });
    fireEvent.click(screen.getByTestId('invoices-bulk-mark-paid'));
    expect(await screen.findByTestId('toast-undo')).toHaveTextContent('1 invoice is now “Paid”.');
  });

  it('shows no Undo when no request returned a token, but still refreshes the rows', async () => {
    mockChangeInvoiceStatus.mockResolvedValue(changed(PENDING, null) as never);
    renderHost({ selected: [PENDING] });
    fireEvent.click(screen.getByTestId('invoices-bulk-mark-paid'));
    await waitFor(() => expect(refreshRows).toHaveBeenCalledWith(['inv-1']));
    expect(screen.queryByTestId('toast-undo')).toBeNull();
  });

  it('on a partial failure refreshes the done rows, offers Undo for them and shows the translated error', async () => {
    mockChangeInvoiceStatus
      .mockResolvedValueOnce(changed(PENDING, 't1') as never)
      .mockRejectedValueOnce(
        new ApiClientError(409, { code: 'INTERNAL_ERROR', message: 'RAW-SENTINEL' }),
      );
    renderHost({ selected: [PENDING, PENDING_2] });
    fireEvent.click(screen.getByTestId('invoices-bulk-mark-paid'));

    expect(await screen.findByTestId('toast-error')).toHaveTextContent(enErrors.INTERNAL_ERROR);
    expect(screen.queryByText(/RAW-SENTINEL/)).toBeNull();
    expect(refreshRows).toHaveBeenCalledWith(['inv-1']);
    expect(screen.getByTestId('toast-undo')).toHaveTextContent('1 invoice is now “Paid”.');
  });

  it('with different failure codes shows the count instead of one code', async () => {
    mockChangeInvoiceStatus
      .mockRejectedValueOnce(new ApiClientError(409, { code: 'INTERNAL_ERROR', message: 'x' }))
      .mockRejectedValueOnce(new ApiClientError(404, { code: 'NOT_FOUND', message: 'x' }));
    renderHost({ selected: [PENDING, PENDING_2] });
    fireEvent.click(screen.getByTestId('invoices-bulk-mark-paid'));

    expect(await screen.findByTestId('toast-error')).toHaveTextContent(
      '2 invoices could not be marked paid',
    );
    expect(refreshRows).not.toHaveBeenCalled();
    expect(screen.queryByTestId('toast-undo')).toBeNull();
  });

  it('shows the count for a failure that is not an API error', async () => {
    mockChangeInvoiceStatus.mockRejectedValueOnce(new Error('network down'));
    renderHost({ selected: [PENDING] });
    fireEvent.click(screen.getByTestId('invoices-bulk-mark-paid'));
    expect(await screen.findByTestId('toast-error')).toHaveTextContent(
      '1 invoice could not be marked paid',
    );
  });

  it('can run again after a run finished', async () => {
    mockChangeInvoiceStatus.mockResolvedValue(changed(PENDING, 't1') as never);
    renderHost({ selected: [PENDING] });
    const button = screen.getByTestId('invoices-bulk-mark-paid');
    fireEvent.click(button);
    await waitFor(() => expect(refreshRows).toHaveBeenCalledTimes(1));
    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.click(button);
    await waitFor(() => expect(refreshRows).toHaveBeenCalledTimes(2));
  });

  it('does not throw when the heading is gone at focus time', async () => {
    mockChangeInvoiceStatus.mockResolvedValue(changed(PENDING, 't1') as never);
    renderHost({ selected: [PENDING] });
    await act(async () => {
      (headingRefOut as { current: HTMLHeadingElement | null }).current = null;
      await latestActions!.markManyPaid([PENDING], clear);
    });
    expect(clear).toHaveBeenCalled();
  });
});
