/**
 * @jest-environment jsdom
 *
 * ConvertPaymentsCard (#2240): what the progress payments mean for the final amount, the Refund
 * due block and its one-step "Add refund". The hook state is a plain object (wrapped in a small
 * stateful harness where the shortfall must change); the deposit modal is a probe.
 *
 * Mutations these tests catch:
 *  - the Refund due block showing without a shortfall, or hiding while one is due (D1/AC2);
 *  - the refund modal opening without the preset (amount, date, source) or not locked to refunds;
 *  - saving not forwarding the deposit to the hook, or focus landing in the wrong place after
 *    save (recorded message when settled, Add refund while still due) and after cancel;
 *  - the recorded message showing while a refund is still due.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { useState } from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import type { BudgetSource, InvoiceDeposit } from '@cornerstone/shared';
import { LocaleProvider } from '../../contexts/LocaleContext.js';
import { makeConvert } from '../../test/convertFixtures.js';
import { makePayment } from '../../test/invoiceDetailFixtures.js';
import type { UseConvertOffer } from './useConvertOffer.js';
import type * as CardModule from './ConvertPaymentsCard.js';

interface ModalProps {
  invoiceId: string;
  mode: string;
  lockEntryType?: boolean;
  initialValues?: Record<string, unknown>;
  budgetSources: readonly BudgetSource[];
  onSaved: (deposit: InvoiceDeposit) => void;
  onClose: () => void;
}
const REFUND = makePayment({ id: 'r1', amount: 2000, entryType: 'refund' });
jest.unstable_mockModule('./InvoiceDepositFormModal.js', () => ({
  InvoiceDepositFormModal: (props: ModalProps) => (
    <div
      role="dialog"
      aria-label="refund-probe"
      data-invoice={props.invoiceId}
      data-mode={props.mode}
      data-locked={String(props.lockEntryType)}
      data-initial={JSON.stringify(props.initialValues)}
      data-sources={props.budgetSources.map((s) => s.id).join(',')}
    >
      <button type="button" onClick={() => props.onSaved(REFUND)}>
        probe-save
      </button>
      <button type="button" onClick={props.onClose}>
        probe-close
      </button>
    </div>
  ),
}));

let Card: (typeof CardModule)['ConvertPaymentsCard'];
beforeEach(async () => {
  ({ ConvertPaymentsCard: Card } = (await import('./ConvertPaymentsCard.js')) as typeof CardModule);
});

const SOURCES = [
  { id: 'src-1', name: 'Savings account' },
  { id: 'src-2', name: 'Bank loan' },
] as unknown as BudgetSource[];

const due = (over: Partial<UseConvertOffer> = {}): Partial<UseConvertOffer> => ({
  shortfall: 2000,
  finalAmount: 10000,
  finalPayment: 0,
  depositTotals: {
    depositTotal: 12000,
    refundTotal: 0,
    receivedRefundTotal: 0,
    netDeposits: 12000,
  },
  refundPreset: {
    entryType: 'refund',
    status: 'pending',
    amount: '2000.00',
    dueDate: '2026-03-10',
    budgetSourceId: 'src-1',
    description: 'Refund for the offer conversion',
  },
  ...over,
});

function ui(convert: UseConvertOffer, sources = SOURCES) {
  return (
    <LocaleProvider>
      <Card invoiceId="off-1" convert={convert} budgetSources={sources} refundDueId="refund-due" />
    </LocaleProvider>
  );
}

/** Keeps the hook-state overrides in state so that a save can settle the refund. */
function Harness({ initial }: { initial: Partial<UseConvertOffer> }) {
  const [state, setState] = useState(initial);
  const convert = makeConvert({
    ...state,
    onRefundSaved: async (deposit) => {
      setState((prev) => ({ ...prev, recordedRefund: deposit.amount, shortfall: 0 }));
    },
  });
  return ui(convert);
}

describe('summary', () => {
  it('shows the progress payments, the final amount and the final payment', () => {
    render(
      ui(
        makeConvert({
          finalAmount: 10000,
          finalPayment: 7500,
          depositTotals: {
            depositTotal: 2500,
            refundTotal: 0,
            receivedRefundTotal: 0,
            netDeposits: 2500,
          },
        }),
      ),
    );
    expect(screen.getByRole('heading', { name: 'Progress payments' })).toBeInTheDocument();
    expect(screen.getByTestId('convert-progress-payments')).toHaveTextContent('€2,500.00');
    expect(screen.getByTestId('convert-final-payment')).toHaveTextContent('€7,500.00');
    expect(screen.getByText('Final amount').nextElementSibling).toHaveTextContent('€10,000.00');
    expect(screen.getByText('Final payment')).toBeInTheDocument();
    expect(screen.getByText('Progress payments stay as they are.')).toBeVisible();
  });

  it('shows €0.00 as the final amount while it cannot be read', () => {
    render(ui(makeConvert({ finalAmount: null, finalPayment: 0 })));
    expect(screen.getByText('Final amount').nextElementSibling).toHaveTextContent('€0.00');
  });

  it('has no "Left to pay" figure (D8)', () => {
    render(ui(makeConvert()));
    expect(screen.queryByText(/Left to pay/i)).toBeNull();
    expect(document.querySelector('[data-figure]')).toBeNull();
  });
});

describe('Refund due', () => {
  it('is absent without a shortfall', () => {
    render(ui(makeConvert()));
    expect(screen.queryByTestId('convert-refund-due')).toBeNull();
    expect(screen.queryByTestId('convert-add-refund')).toBeNull();
  });

  it('shows the heading, the advice, and the proposed refund with its source', () => {
    render(ui(makeConvert(due())));
    const block = screen.getByTestId('convert-refund-due');
    expect(block).toHaveAttribute('id', 'refund-due');
    expect(
      within(block).getByRole('heading', { name: 'Refund due: €2,000.00' }),
    ).toBeInTheDocument();
    expect(block).toHaveTextContent('You can still convert.');
    expect(block).toHaveTextContent('-€2,000.00');
    expect(block).toHaveTextContent('Savings account');
    expect(block).toHaveTextContent('Funding source');
    expect(within(block).getByRole('button', { name: 'Add refund' })).toBeEnabled();
  });

  it('shows Not set when the proposed source is unknown or missing', () => {
    const { rerender } = render(
      ui(makeConvert(due({ refundPreset: { ...due().refundPreset!, budgetSourceId: null } }))),
    );
    expect(screen.getByTestId('convert-refund-due')).toHaveTextContent('Not set');
    rerender(
      ui(makeConvert(due({ refundPreset: { ...due().refundPreset!, budgetSourceId: 'gone' } }))),
    );
    expect(screen.getByTestId('convert-refund-due')).toHaveTextContent('Not set');
  });

  it('Add refund is disabled while the page is saving', () => {
    render(ui(makeConvert(due({ isSaving: true }))));
    expect(screen.getByTestId('convert-add-refund')).toBeDisabled();
  });
});

describe('Add refund', () => {
  it('opens one refund modal prefilled with the proposal and locked to refunds', () => {
    render(ui(makeConvert(due())));
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByTestId('convert-add-refund'));
    const dialog = screen.getByRole('dialog', { name: 'refund-probe' });
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(dialog).toHaveAttribute('data-invoice', 'off-1');
    expect(dialog).toHaveAttribute('data-mode', 'add');
    expect(dialog).toHaveAttribute('data-locked', 'true');
    expect(dialog).toHaveAttribute('data-sources', 'src-1,src-2');
    expect(JSON.parse(dialog.getAttribute('data-initial')!)).toEqual(due().refundPreset);
  });

  it('cancelling closes the modal and returns focus to Add refund', async () => {
    render(ui(makeConvert(due())));
    fireEvent.click(screen.getByTestId('convert-add-refund'));
    fireEvent.click(screen.getByText('probe-close'));
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(screen.getByTestId('convert-add-refund')).toHaveFocus());
  });

  it('saving hands the deposit to the form hook and closes the modal', async () => {
    const convert = makeConvert(due());
    render(ui(convert));
    fireEvent.click(screen.getByTestId('convert-add-refund'));
    fireEvent.click(screen.getByText('probe-save'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(convert.onRefundSaved).toHaveBeenCalledWith(REFUND);
  });

  it('after a save that settles the refund, focus goes to the recorded message', async () => {
    render(<Harness initial={due()} />);
    fireEvent.click(screen.getByTestId('convert-add-refund'));
    fireEvent.click(screen.getByText('probe-save'));
    const recorded = await screen.findByTestId('convert-refund-recorded');
    expect(recorded).toHaveTextContent('The refund of €2,000.00 is recorded.');
    await waitFor(() => expect(recorded).toHaveFocus());
    expect(screen.queryByTestId('convert-refund-due')).toBeNull();
    expect(recorded.parentElement).toHaveAttribute('role', 'status');
  });

  it('after a save that leaves a refund due, focus returns to Add refund', async () => {
    const convert = makeConvert(due({ recordedRefund: 500 }));
    render(ui(convert));
    fireEvent.click(screen.getByTestId('convert-add-refund'));
    fireEvent.click(screen.getByText('probe-save'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(screen.getByTestId('convert-add-refund')).toHaveFocus());
    expect(screen.queryByTestId('convert-refund-recorded')).toBeNull();
  });
});

describe('recorded message', () => {
  it('is absent before any refund was recorded', () => {
    render(ui(makeConvert()));
    expect(screen.queryByTestId('convert-refund-recorded')).toBeNull();
    for (const region of screen.getAllByRole('status')) expect(region).toBeEmptyDOMElement();
  });

  it('is hidden while a refund is still due', () => {
    render(ui(makeConvert(due({ recordedRefund: 500 }))));
    expect(screen.queryByTestId('convert-refund-recorded')).toBeNull();
  });
});
