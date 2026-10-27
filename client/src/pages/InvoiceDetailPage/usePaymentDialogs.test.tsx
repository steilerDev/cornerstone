/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { InvoiceDeposit, InvoiceDepositEntryType, InvoiceDetail } from '@cornerstone/shared';
import type { UseInvoiceCostLinesResult } from '../../components/CostLineTable/useInvoiceCostLines.js';
import type * as HookModule from './usePaymentDialogs.js';
import {
  makeBudgetSource,
  makeCostLine,
  makeInvoiceDetail,
  makePayment,
} from '../../test/invoiceDetailFixtures.js';

interface ProbeProps {
  invoiceId: string;
  mode: 'add' | 'edit';
  deposit: InvoiceDeposit | null;
  name?: string;
  lockEntryType?: boolean;
  initialValues?: { entryType?: InvoiceDepositEntryType; budgetSourceId?: string | null };
  budgetSources: { id: string }[];
  budgetLineSourceCount?: number;
  largestBudgetSourceId?: string | null;
  invoiceAmount?: number;
  existingEntries?: InvoiceDeposit[];
  onSaved: (d: InvoiceDeposit) => void;
  onClose: () => void;
}
let lastProps: ProbeProps | null = null;
jest.unstable_mockModule('./InvoiceDepositFormModal.js', () => ({
  InvoiceDepositFormModal: (props: ProbeProps) => {
    lastProps = props;
    return (
      <div role="dialog" aria-label="payment-probe">
        <button type="button" onClick={() => props.onSaved(makePayment())}>
          probe-save
        </button>
        <button type="button" onClick={props.onClose}>
          probe-close
        </button>
      </div>
    );
  },
}));

let usePaymentDialogs: (typeof HookModule)['usePaymentDialogs'];

function costLines(over: Partial<UseInvoiceCostLinesResult> = {}): UseInvoiceCostLinesResult {
  return {
    lines: [],
    remainingAmount: 0,
    sources: new Map(),
    budgetSources: [],
    loading: false,
    error: null,
    reload: async () => undefined,
    ...over,
  };
}

const onSaved = jest.fn<() => Promise<unknown> | void>();

function Harness({
  invoice,
  lines,
  edit,
}: {
  invoice: InvoiceDetail;
  lines: UseInvoiceCostLinesResult;
  edit?: InvoiceDeposit;
}) {
  const payments = usePaymentDialogs({ invoice, costLines: lines, onSaved });
  return (
    <>
      <button type="button" onClick={(e) => payments.openAdd('deposit', e.currentTarget)}>
        add-payment
      </button>
      <button type="button" onClick={(e) => payments.openAdd('refund', e.currentTarget)}>
        add-refund
      </button>
      <button
        type="button"
        onClick={(e) =>
          payments.openEdit(edit ?? makePayment(), 'Progress payment 2', e.currentTarget)
        }
      >
        edit-payment
      </button>
      <button type="button" onClick={() => payments.openAdd('deposit', null)}>
        add-no-opener
      </button>
      <button
        type="button"
        onClick={() => payments.openAdd('deposit', document.createElement('button'))}
      >
        add-detached
      </button>
      {payments.dialog}
    </>
  );
}

const SOURCES = [
  makeBudgetSource({ id: 's1', name: 'Loan Alpha' }),
  makeBudgetSource({ id: 's2', name: 'Savings Beta' }),
];

beforeEach(async () => {
  lastProps = null;
  onSaved.mockReset().mockResolvedValue(undefined);
  ({ usePaymentDialogs } = (await import('./usePaymentDialogs.js')) as typeof HookModule);
});

describe('usePaymentDialogs (S14)', () => {
  it('renders no dialog until opened', () => {
    render(<Harness invoice={makeInvoiceDetail()} lines={costLines()} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens Add progress payment with the entry type locked and the invoice context', async () => {
    const invoice = makeInvoiceDetail({ id: 'inv-4', amount: 1500, deposits: [makePayment()] });
    render(<Harness invoice={invoice} lines={costLines({ budgetSources: SOURCES })} />);
    await userEvent.click(screen.getByText('add-payment'));
    expect(lastProps).toMatchObject({
      invoiceId: 'inv-4',
      mode: 'add',
      deposit: null,
      name: undefined,
      lockEntryType: true,
      invoiceAmount: 1500,
      existingEntries: invoice.deposits,
    });
    expect(lastProps?.initialValues).toMatchObject({ entryType: 'deposit' });
    expect(lastProps?.budgetSources.map((s) => s.id)).toEqual(['s1', 's2']);
  });

  it('opens Add refund with the refund entry type', async () => {
    render(<Harness invoice={makeInvoiceDetail()} lines={costLines()} />);
    await userEvent.click(screen.getByText('add-refund'));
    expect(lastProps?.initialValues?.entryType).toBe('refund');
    expect(lastProps?.lockEntryType).toBe(true);
  });

  it('defaults the source to the single source of the cost lines', async () => {
    render(
      <Harness
        invoice={makeInvoiceDetail()}
        lines={costLines({
          budgetSources: SOURCES,
          lines: [
            makeCostLine({ budgetSourceId: 's2' }),
            makeCostLine({ id: 'b', budgetSourceId: 's2' }),
          ],
        })}
      />,
    );
    await userEvent.click(screen.getByText('add-payment'));
    expect(lastProps?.initialValues?.budgetSourceId).toBe('s2');
    expect(lastProps?.budgetLineSourceCount).toBe(1);
    expect(lastProps?.largestBudgetSourceId).toBe('s2');
  });

  it('defaults the source to the largest of several and reports their count', async () => {
    render(
      <Harness
        invoice={makeInvoiceDetail()}
        lines={costLines({
          budgetSources: SOURCES,
          lines: [
            makeCostLine({ id: 'a', budgetSourceId: 's1', itemizedAmount: 100 }),
            makeCostLine({ id: 'b', budgetSourceId: 's2', itemizedAmount: 900 }),
          ],
        })}
      />,
    );
    await userEvent.click(screen.getByText('add-payment'));
    expect(lastProps?.initialValues?.budgetSourceId).toBe('s2');
    expect(lastProps?.budgetLineSourceCount).toBe(2);
    expect(lastProps?.largestBudgetSourceId).toBe('s2');
  });

  it('has no default source when no cost line names one', async () => {
    render(<Harness invoice={makeInvoiceDetail()} lines={costLines({ budgetSources: SOURCES })} />);
    await userEvent.click(screen.getByText('add-payment'));
    expect(lastProps?.initialValues?.budgetSourceId).toBeNull();
    expect(lastProps?.budgetLineSourceCount).toBe(0);
    expect(lastProps?.largestBudgetSourceId).toBeNull();
  });

  it('edit passes the entry, its name and no initial values', async () => {
    const deposit = makePayment({ id: 'p-edit', amount: 75 });
    render(<Harness invoice={makeInvoiceDetail()} lines={costLines()} edit={deposit} />);
    await userEvent.click(screen.getByText('edit-payment'));
    expect(lastProps).toMatchObject({
      mode: 'edit',
      deposit,
      name: 'Progress payment 2',
      lockEntryType: true,
    });
    expect(lastProps?.initialValues).toBeUndefined();
  });

  it('save closes the dialog, refreshes the page, then focuses the opener', async () => {
    let finishRefresh: () => void = () => undefined;
    onSaved.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishRefresh = resolve;
        }),
    );
    render(<Harness invoice={makeInvoiceDetail()} lines={costLines()} />);
    const opener = screen.getByText('add-payment');
    await userEvent.click(opener);
    await userEvent.click(screen.getByText('probe-save'));
    // the refresh is running: the dialog is already closed and focus has not moved yet
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(opener).not.toHaveFocus();
    await act(async () => {
      finishRefresh();
    });
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('close does not refresh and returns focus to the opener once the dialog is gone', async () => {
    render(<Harness invoice={makeInvoiceDetail()} lines={costLines()} />);
    const opener = screen.getByText('add-refund');
    await userEvent.click(opener);
    await userEvent.click(screen.getByText('probe-close'));
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(opener).toHaveFocus());
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('does not touch focus when the opener is not on the page or was never given', async () => {
    render(<Harness invoice={makeInvoiceDetail()} lines={costLines()} />);
    await userEvent.click(screen.getByText('add-no-opener'));
    await userEvent.click(screen.getByText('probe-close'));
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(document.body).toHaveFocus();

    await userEvent.click(screen.getByText('add-detached'));
    await userEvent.click(screen.getByText('probe-save'));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(document.body).toHaveFocus();
  });
});
