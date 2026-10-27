/**
 * @jest-environment jsdom
 *
 * The Convert page's form hook (#2240): seeds, per-line proposals, field errors and problems,
 * AI apply/suggest, the refund bookkeeping, the submit body and its four results.
 * Boundaries mocked: the invoices API client and the formatters; i18n is real.
 *
 * Mutations these tests catch:
 *  - a Refund due (net deposits above the final amount) becoming a problem (D1);
 *  - the payload addressing lines by `row.id` instead of `invoiceBudgetLineId` (D4);
 *  - an AI value overwriting a touched or saved field instead of being suggested (D12);
 *  - Keep all / reset / un-keep not recomputing the pro rata proposal;
 *  - `INVOICE_NOT_QUOTATION` showing an error instead of returning 'notOffer';
 *  - a failed deposits refresh dropping the old deposits after a refund;
 *  - the announcement timer firing after unmount or without a debounce.
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { renderHook, act } from '@testing-library/react';
import type { ConvertQuotationRequest, InvoiceDetail } from '@cornerstone/shared';
import i18n from '../../i18n/index.js';
import type * as InvoicesApiTypes from '../../lib/invoicesApi.js';
import { groupForDocument } from '../../components/CostLineTable/costLineRows.js';
import type { CostLineRow } from '../../components/CostLineTable/types.js';
import { makeLinkedRow } from '../../test/costLineFixtures.js';
import { makeInvoiceDetail, makePayment } from '../../test/invoiceDetailFixtures.js';

const mockConvertQuotation = jest.fn<typeof InvoicesApiTypes.convertQuotation>();
const mockFetchInvoiceById = jest.fn<typeof InvoicesApiTypes.fetchInvoiceById>();
jest.unstable_mockModule('../../lib/invoicesApi.js', () => ({
  convertQuotation: mockConvertQuotation,
  fetchInvoiceById: mockFetchInvoiceById,
}));
jest.unstable_mockModule('../../lib/formatters.js', () => ({
  useFormatters: () => ({
    formatCurrency: (n: number) => `$${n.toFixed(2)}`,
    formatDate: (d: string | null | undefined) => d ?? '—',
    formatPercent: (n: number) => `${n}%`,
  }),
}));
jest.unstable_mockModule('../../lib/localDate.js', () => ({
  todayLocalIsoDate: () => '2026-03-10',
}));

const { ApiClientError } = await import('../../lib/apiClient.js');
const { useConvertOffer } = await import('./useConvertOffer.js');

const TODAY = '2026-03-10';
const tBudget = (key: string, options?: Record<string, unknown>) =>
  i18n.t(key, { ns: 'budget', ...options }) as string;

function makeRows(): CostLineRow[] {
  return [
    makeLinkedRow({
      id: 'wb-1',
      invoiceBudgetLineId: 'ibl-1',
      gross: 6000,
      target: { type: 'work_item', id: 'w1', label: 'Roof' },
    }),
    makeLinkedRow({
      id: 'wb-2',
      invoiceBudgetLineId: 'ibl-2',
      gross: 3000,
      target: { type: 'work_item', id: 'w1', label: 'Roof' },
    }),
  ];
}

function makeOffer(over: Partial<InvoiceDetail> = {}): InvoiceDetail {
  return makeInvoiceDetail({
    id: 'off-1',
    status: 'quotation',
    amount: 10000,
    invoiceNumber: 'Q-1',
    dueDate: '2099-02-01T00:00:00.000Z',
    notes: 'Saved notes',
    ...over,
  });
}

function setup(invoice: InvoiceDetail = makeOffer(), rows: CostLineRow[] = makeRows()) {
  const groups = groupForDocument(rows);
  return renderHook(() => useConvertOffer({ invoice, rows, groups }));
}

type Hook = ReturnType<typeof setup>['result'];

/** A form with valid defaults but no saved notes or number, so AI values apply directly. */
const bareOffer = () => makeOffer({ invoiceNumber: null, notes: null, dueDate: null });

beforeEach(() => {
  mockConvertQuotation.mockReset().mockResolvedValue({} as never);
  mockFetchInvoiceById.mockReset();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('initial seed', () => {
  it('starts with the offer amount, today, the saved fields and a pending status', () => {
    const { result } = setup();
    expect(result.current.form).toEqual({
      amount: '10000.00',
      date: TODAY,
      invoiceNumber: 'Q-1',
      dueDate: '2099-02-01',
      notes: 'Saved notes',
      status: 'pending',
    });
    expect(result.current.today).toBe(TODAY);
    expect(result.current.offerAmount).toBe(10000);
    expect(result.current.finalAmount).toBe(10000);
    expect(result.current.isFormDirty).toBe(false);
    expect(result.current.problems).toEqual([]);
  });

  it('seeds each line at its offered amount, keyed by the invoice budget line id (D4)', () => {
    const { result } = setup();
    expect([...result.current.lines.keys()]).toEqual(['ibl-1', 'ibl-2']);
    expect(result.current.lines.get('ibl-1')).toEqual({
      offered: 6000,
      proposed: '6000.00',
      edited: false,
      keep: false,
    });
  });

  it('uses blank strings for a missing number, due date and notes', () => {
    const { result } = setup(bareOffer());
    expect(result.current.form).toMatchObject({ invoiceNumber: '', dueDate: '', notes: '' });
  });

  it('derives totals: offered, proposed, remainder and the per-group sums', () => {
    const { result } = setup();
    expect(result.current.offeredTotal).toBe(9000);
    expect(result.current.proposedTotal).toBe(9000);
    // The final amount (10,000) exceeds the lines (9,000): 1,000 is not yet split.
    expect(result.current.remainder).toBe(1000);
    expect(result.current.remainderState).toBe('notYetSplit');
    const [group] = groupForDocument(makeRows());
    expect(result.current.groupProposedTotals.get(group!.id)).toBe(9000);
  });

  it('shows the delta against the offer', () => {
    const { result } = setup();
    act(() => result.current.setField('amount', '10500'));
    expect(result.current.delta).toEqual({ absolute: 500, percent: 5, direction: 'increase' });
  });
});

describe('proposals', () => {
  it('editing the final amount rescales untouched lines pro rata (10,000 -> 10,500)', () => {
    const { result } = setup();
    act(() => result.current.setField('amount', '10500'));
    expect(result.current.lines.get('ibl-1')!.proposed).toBe('6300.00');
    expect(result.current.lines.get('ibl-2')!.proposed).toBe('3150.00');
    expect(result.current.proposedTotal).toBe(9450);
  });

  it('keeps an edited line and a kept line out of the rescale', () => {
    const { result } = setup();
    act(() => result.current.setLineProposed('ibl-1', '1234'));
    act(() => result.current.setLineKeep('ibl-2', true));
    act(() => result.current.setField('amount', '20000'));
    expect(result.current.lines.get('ibl-1')!.proposed).toBe('1234');
    expect(result.current.lines.get('ibl-2')).toMatchObject({ proposed: '3000.00', keep: true });
  });

  it.each([[''], ['0'], ['-3'], ['abc']])(
    'does not rescale for the unusable final amount %j',
    (value) => {
      const { result } = setup();
      act(() => result.current.setField('amount', value));
      expect(result.current.lines.get('ibl-1')!.proposed).toBe('6000.00');
      expect(result.current.finalAmount).toBeNull();
    },
  );

  it('Keep all checks every line, shows mixed state, and unchecking recomputes the proposal', () => {
    const { result } = setup();
    act(() => result.current.setLineKeep('ibl-1', true));
    expect(result.current.someKept).toBe(true);
    expect(result.current.allKept).toBe(false);
    act(() => result.current.setAllKept(true));
    expect(result.current.allKept).toBe(true);
    expect(result.current.someKept).toBe(false);
    act(() => result.current.setField('amount', '10500'));
    // Kept lines are not rescaled.
    expect(result.current.lines.get('ibl-1')!.proposed).toBe('6000.00');
    act(() => result.current.setAllKept(false));
    expect(result.current.allKept).toBe(false);
    expect(result.current.someKept).toBe(false);
    expect(result.current.lines.get('ibl-1')).toMatchObject({
      proposed: '6300.00',
      keep: false,
      edited: false,
    });
  });

  it('un-keeping one line recomputes its proposal and clears its edited flag', () => {
    const { result } = setup();
    act(() => result.current.setLineProposed('ibl-1', '5'));
    act(() => result.current.setLineKeep('ibl-1', true));
    // Keeping does not drop the typed value's edited flag.
    expect(result.current.lines.get('ibl-1')!.edited).toBe(true);
    act(() => result.current.setField('amount', '10500'));
    act(() => result.current.setLineKeep('ibl-1', false));
    expect(result.current.lines.get('ibl-1')).toMatchObject({ proposed: '6300.00', edited: false });
  });

  it('Reset to proposal recomputes edited lines but leaves kept lines alone', () => {
    const { result } = setup();
    act(() => result.current.setField('amount', '10500'));
    act(() => result.current.setLineProposed('ibl-1', '1'));
    act(() => result.current.setLineKeep('ibl-2', true));
    act(() => result.current.resetProposal());
    expect(result.current.lines.get('ibl-1')).toMatchObject({ proposed: '6300.00', edited: false });
    expect(result.current.lines.get('ibl-2')).toMatchObject({ proposed: '3150.00', keep: true });
  });

  it('reports a line typed to 0 as invalid and over-allocation as the over remainder', () => {
    const { result } = setup();
    act(() => result.current.setLineProposed('ibl-1', '0'));
    expect([...result.current.invalidKeys]).toEqual(['ibl-1']);
    act(() => result.current.setLineProposed('ibl-1', '9000'));
    expect(result.current.invalidKeys.size).toBe(0);
    expect(result.current.remainder).toBe(-2000);
    expect(result.current.remainderState).toBe('over');
  });
});

describe('field errors and problems', () => {
  it('hides the amount error until the field is touched, then shows it', () => {
    const { result } = setup();
    act(() => result.current.setField('amount', ''));
    expect(result.current.visibleFieldErrors.amount).toBeUndefined();
    expect(result.current.problems.map((p) => p.id)).toEqual(['amount']);
    act(() => result.current.markTouched('amount'));
    expect(result.current.visibleFieldErrors.amount).toBe(
      tBudget('convertPage.details.errors.amountRequired'),
    );
  });

  it('marking an already touched field again changes nothing', () => {
    const { result } = setup();
    act(() => result.current.markTouched('amount'));
    const before = result.current.visibleFieldErrors;
    act(() => result.current.markTouched('amount'));
    expect(result.current.visibleFieldErrors).toEqual(before);
  });

  it('distinguishes a missing amount from a non-positive one', () => {
    const { result } = setup();
    act(() => result.current.markTouched('amount'));
    act(() => result.current.setField('amount', '0'));
    expect(result.current.visibleFieldErrors.amount).toBe(
      tBudget('convertPage.details.errors.amountPositive'),
    );
    act(() => result.current.setField('amount', ''));
    expect(result.current.visibleFieldErrors.amount).toBe(
      tBudget('convertPage.details.errors.amountRequired'),
    );
  });

  it('requires a date', () => {
    const { result } = setup();
    act(() => result.current.setField('date', ''));
    act(() => result.current.markTouched('date'));
    expect(result.current.visibleFieldErrors.date).toBe(
      tBudget('convertPage.details.errors.dateRequired'),
    );
    expect(result.current.problems.map((p) => p.id)).toEqual(['date']);
  });

  it('shows a due date before the invoice date at once, without a blur or submit', () => {
    const { result } = setup();
    act(() => result.current.setField('dueDate', '2020-01-01'));
    expect(result.current.visibleFieldErrors.dueDate).toBe(
      tBudget('convertPage.details.errors.dueDateBeforeDate'),
    );
    act(() => result.current.setField('dueDate', TODAY));
    expect(result.current.visibleFieldErrors.dueDate).toBeUndefined();
  });

  it('lists problems in the order amount, date, dueDate, lines, over', () => {
    const { result } = setup();
    act(() => result.current.setField('amount', ''));
    act(() => result.current.setField('date', ''));
    act(() => result.current.setLineProposed('ibl-1', '0'));
    // With no invoice date the due date cannot be compared, so it is no problem.
    expect(result.current.problems.map((p) => p.id)).toEqual(['amount', 'date', 'lines']);

    const second = setup();
    act(() => second.result.current.setField('dueDate', '2020-01-01'));
    act(() => second.result.current.setLineProposed('ibl-1', '0'));
    expect(second.result.current.problems.map((p) => p.id)).toEqual(['dueDate', 'lines']);

    const third = setup();
    act(() => third.result.current.setLineProposed('ibl-1', '9999'));
    expect(third.result.current.problems).toEqual([
      { id: 'over', message: tBudget('convertPage.blocked.over') },
    ]);
  });

  it('lists dueDate before over, and drops over when the final amount cannot be read', () => {
    const { result } = setup();
    act(() => result.current.setField('amount', '0.5'));
    act(() => result.current.setLineProposed('ibl-1', '10'));
    act(() => result.current.setField('dueDate', '2020-01-01'));
    expect(result.current.problems.map((p) => p.id)).toEqual(['dueDate', 'over']);
    act(() => result.current.setField('amount', ''));
    expect(result.current.problems.map((p) => p.id)).toEqual(['amount', 'dueDate']);
  });

  it('a Refund due is advisory: net deposits above the final amount are not a problem (D1)', () => {
    const offer = makeOffer({
      deposits: [makePayment({ id: 'd1', amount: 12000, budgetSourceId: 'src-1' })],
    });
    const { result } = setup(offer);
    expect(result.current.shortfall).toBe(2000);
    expect(result.current.problems).toEqual([]);
    expect(result.current.finalPayment).toBe(0);
  });

  it('computes the final payment and progress payment totals from the deposits', () => {
    const offer = makeOffer({
      deposits: [makePayment({ id: 'd1', amount: 2500 })],
    });
    const { result } = setup(offer);
    expect(result.current.depositTotals.netDeposits).toBe(2500);
    expect(result.current.finalPayment).toBe(7500);
    expect(result.current.shortfall).toBe(0);
  });

  it('a final amount that cannot be read leaves the shortfall at 0', () => {
    const offer = makeOffer({ deposits: [makePayment({ amount: 500 })] });
    const { result } = setup(offer);
    act(() => result.current.setField('amount', ''));
    expect(result.current.shortfall).toBe(0);
    expect(result.current.remainder).toBe(0);
  });
});

describe('dirty state', () => {
  it.each([
    ['amount', (r: Hook) => r.current.setField('amount', '9999')],
    ['date', (r: Hook) => r.current.setField('date', '2026-01-01')],
    ['invoice number', (r: Hook) => r.current.setField('invoiceNumber', 'X')],
    ['due date', (r: Hook) => r.current.setField('dueDate', '2099-03-03')],
    ['notes', (r: Hook) => r.current.setField('notes', 'changed')],
    ['status', (r: Hook) => r.current.setStatus('paid')],
    ['an edited line', (r: Hook) => r.current.setLineProposed('ibl-1', '1')],
    ['a kept line', (r: Hook) => r.current.setLineKeep('ibl-1', true)],
  ])('changing the %s makes the form dirty', (_name, change) => {
    const { result } = setup();
    expect(result.current.isFormDirty).toBe(false);
    act(() => change(result));
    expect(result.current.isFormDirty).toBe(true);
  });

  it('typing the original value back is clean again', () => {
    const { result } = setup();
    act(() => result.current.setField('notes', 'x'));
    act(() => result.current.setField('notes', 'Saved notes'));
    expect(result.current.isFormDirty).toBe(false);
  });
});

describe('AI candidates', () => {
  it('applies to untouched, unsaved fields and rescales the lines for an applied amount', () => {
    const { result } = setup(bareOffer());
    act(() =>
      result.current.applyCandidates({
        amount: '10500.00',
        date: '2026-02-02',
        invoiceNumber: 'AI-77',
        dueDate: '2026-03-03',
        notes: 'AI notes',
      }),
    );
    expect(result.current.form).toMatchObject({
      amount: '10500.00',
      date: '2026-02-02',
      invoiceNumber: 'AI-77',
      dueDate: '2026-03-03',
      notes: 'AI notes',
    });
    expect(result.current.suggestions).toEqual({});
    expect(result.current.lines.get('ibl-1')!.proposed).toBe('6300.00');
  });

  it('suggests instead of applying for fields the user has typed into', () => {
    const { result } = setup(bareOffer());
    act(() => result.current.setField('notes', 'mine'));
    act(() => result.current.setField('amount', '9000'));
    act(() => result.current.applyCandidates({ notes: 'AI notes', amount: '10500.00' }));
    expect(result.current.form.notes).toBe('mine');
    expect(result.current.form.amount).toBe('9000');
    expect(result.current.suggestions).toEqual({ notes: 'AI notes', amount: '10500.00' });
    // A suggested amount leaves the proposals alone.
    expect(result.current.lines.get('ibl-1')!.proposed).toBe('5400.00');
  });

  it('protects saved notes and a saved invoice number: the AI values become suggestions', () => {
    const { result } = setup();
    act(() => result.current.applyCandidates({ notes: 'AI notes', invoiceNumber: 'AI-77' }));
    expect(result.current.form.notes).toBe('Saved notes');
    expect(result.current.form.invoiceNumber).toBe('Q-1');
    expect(result.current.suggestions).toEqual({ notes: 'AI notes', invoiceNumber: 'AI-77' });
  });

  it('treats whitespace-only saved notes and number as empty', () => {
    const { result } = setup(makeOffer({ notes: '   ', invoiceNumber: '  ' }));
    act(() => result.current.applyCandidates({ notes: 'AI notes', invoiceNumber: 'AI-77' }));
    expect(result.current.form.notes).toBe('AI notes');
    expect(result.current.form.invoiceNumber).toBe('AI-77');
    expect(result.current.suggestions).toEqual({});
  });

  it('creates no suggestion when the AI value equals the current one', () => {
    const { result } = setup();
    act(() => result.current.applyCandidates({ notes: 'Saved notes', amount: '10000.00' }));
    expect(result.current.suggestions).toEqual({});
  });

  it('applyCandidates with nothing to apply leaves the form as it is', () => {
    const { result } = setup();
    const before = result.current.form;
    act(() => result.current.applyCandidates({}));
    expect(result.current.form).toBe(before);
  });

  it('applySuggestion applies the value, clears that suggestion and rescales an amount', () => {
    const { result } = setup(bareOffer());
    act(() => result.current.setField('amount', '9000'));
    act(() => result.current.applyCandidates({ amount: '10500.00', notes: 'x' }));
    act(() => result.current.applySuggestion('amount'));
    expect(result.current.form.amount).toBe('10500.00');
    expect(result.current.suggestions).toEqual({});
    expect(result.current.lines.get('ibl-1')!.proposed).toBe('6300.00');
  });

  it('applySuggestion for a field without a suggestion is a no-op', () => {
    const { result } = setup();
    const before = result.current.form;
    act(() => result.current.applySuggestion('notes'));
    expect(result.current.form).toBe(before);
  });

  it('a manual edit clears a pending suggestion for that field only', () => {
    const { result } = setup();
    act(() => result.current.applyCandidates({ notes: 'AI notes', invoiceNumber: 'AI-77' }));
    act(() => result.current.setField('notes', 'typed'));
    expect(result.current.suggestions).toEqual({ invoiceNumber: 'AI-77' });
  });
});

describe('proposal announcement', () => {
  it('announces the updated proposal once the amount has been quiet for 500 ms', () => {
    jest.useFakeTimers();
    const { result } = setup();
    act(() => result.current.setField('amount', '10500'));
    expect(result.current.proposalAnnouncement).toBe('');
    act(() => {
      jest.advanceTimersByTime(499);
    });
    expect(result.current.proposalAnnouncement).toBe('');
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(result.current.proposalAnnouncement).toBe(tBudget('convertPage.lines.updated'));
  });

  it('typing again restarts the debounce and clears the old announcement', () => {
    jest.useFakeTimers();
    const { result } = setup();
    act(() => result.current.setField('amount', '10500'));
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(result.current.proposalAnnouncement).not.toBe('');
    act(() => result.current.setField('amount', '10600'));
    expect(result.current.proposalAnnouncement).toBe('');
    act(() => {
      jest.advanceTimersByTime(300);
    });
    act(() => result.current.setField('amount', '10700'));
    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(result.current.proposalAnnouncement).toBe('');
    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(result.current.proposalAnnouncement).toBe(tBudget('convertPage.lines.updated'));
  });

  it('announces nothing for an unusable amount', () => {
    jest.useFakeTimers();
    const { result } = setup();
    act(() => result.current.setField('amount', '0'));
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(result.current.proposalAnnouncement).toBe('');
  });

  it('an AI-applied amount is announced as well', () => {
    jest.useFakeTimers();
    const { result } = setup(bareOffer());
    act(() => result.current.applyCandidates({ amount: '10500.00' }));
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(result.current.proposalAnnouncement).toBe(tBudget('convertPage.lines.updated'));
  });

  it('a pending announcement is cancelled on unmount', () => {
    jest.useFakeTimers();
    const { result, unmount } = setup();
    act(() => result.current.setField('amount', '10500'));
    expect(jest.getTimerCount()).toBe(1);
    unmount();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('unmounting with no pending announcement is clean', () => {
    jest.useFakeTimers();
    const { unmount } = setup();
    expect(() => unmount()).not.toThrow();
  });
});

describe('refund', () => {
  const withDeposit = () =>
    makeOffer({
      deposits: [makePayment({ id: 'd1', amount: 12000, budgetSourceId: 'src-1' })],
    });

  it('presets a pending refund for the shortfall, due today, on the one source', () => {
    const { result } = setup(withDeposit());
    expect(result.current.refundPreset).toEqual({
      entryType: 'refund',
      status: 'pending',
      amount: '2000.00',
      dueDate: TODAY,
      budgetSourceId: 'src-1',
      description: tBudget('convertPage.refund.description'),
    });
  });

  it('presets no source when the deposits use mixed sources', () => {
    const { result } = setup(
      makeOffer({
        deposits: [
          makePayment({ id: 'd1', amount: 6000, budgetSourceId: 'src-1' }),
          makePayment({ id: 'd2', amount: 6000, budgetSourceId: 'src-2' }),
        ],
      }),
    );
    expect(result.current.refundPreset.budgetSourceId).toBeNull();
  });

  it('onRefundSaved records the amount and shows the refetched deposits', async () => {
    const { result } = setup(withDeposit());
    const refund = makePayment({
      id: 'r1',
      amount: 2000,
      entryType: 'refund',
      budgetSourceId: 'src-1',
    });
    mockFetchInvoiceById.mockResolvedValue(
      makeOffer({ deposits: [...withDeposit().deposits, refund] }),
    );
    await act(async () => {
      await result.current.onRefundSaved(refund);
    });
    expect(mockFetchInvoiceById).toHaveBeenCalledWith('off-1');
    expect(result.current.recordedRefund).toBe(2000);
    expect(result.current.deposits.map((d) => d.id)).toEqual(['d1', 'r1']);
    expect(result.current.shortfall).toBe(0);
  });

  it('keeps the old deposits and the Refund due when the refetch fails', async () => {
    const { result } = setup(withDeposit());
    mockFetchInvoiceById.mockRejectedValue(new Error('offline'));
    await act(async () => {
      await result.current.onRefundSaved(makePayment({ id: 'r1', amount: 2000 }));
    });
    expect(result.current.recordedRefund).toBe(2000);
    expect(result.current.deposits.map((d) => d.id)).toEqual(['d1']);
    expect(result.current.shortfall).toBe(2000);
  });
});

describe('submit', () => {
  it('posts the final amount, trimmed fields, the status and a formatted conversion note', async () => {
    const { result } = setup();
    act(() => result.current.setField('amount', '10500'));
    act(() => result.current.setField('invoiceNumber', '  R-1  '));
    act(() => result.current.setField('notes', '  hello  '));
    act(() => result.current.setField('dueDate', ''));
    act(() => result.current.setStatus('paid'));
    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.submit();
    });
    expect(outcome).toBe('converted');
    const [id, body] = mockConvertQuotation.mock.calls[0] as [string, ConvertQuotationRequest];
    expect(id).toBe('off-1');
    expect(body).toEqual({
      amount: 10500,
      date: TODAY,
      invoiceNumber: 'R-1',
      dueDate: null,
      notes: 'hello',
      status: 'paid',
      conversionNote: tBudget('convertPage.history.converted', {
        amount: '$10000.00',
        date: TODAY,
      }),
      budgetLines: [
        { id: 'ibl-1', itemizedAmount: 6300 },
        { id: 'ibl-2', itemizedAmount: 3150 },
      ],
    });
    expect(body).not.toHaveProperty('paperlessDocumentId');
  });

  it('sends blank optional fields as null', async () => {
    const { result } = setup(bareOffer());
    await act(async () => {
      await result.current.submit();
    });
    const body = mockConvertQuotation.mock.calls[0]![1] as ConvertQuotationRequest;
    expect(body).toMatchObject({ invoiceNumber: null, dueDate: null, notes: null });
  });

  it('sends no line updates when every line is kept, or nothing changed (D4)', async () => {
    const { result } = setup();
    act(() => result.current.setAllKept(true));
    await act(async () => {
      await result.current.submit();
    });
    expect((mockConvertQuotation.mock.calls[0]![1] as ConvertQuotationRequest).budgetLines).toEqual(
      [],
    );
  });

  it('addresses changed lines by invoiceBudgetLineId and drops kept lines', async () => {
    const { result } = setup();
    act(() => result.current.setLineProposed('ibl-1', '5000'));
    act(() => result.current.setLineProposed('ibl-2', '3500'));
    act(() => result.current.setLineKeep('ibl-2', true));
    await act(async () => {
      await result.current.submit();
    });
    expect((mockConvertQuotation.mock.calls[0]![1] as ConvertQuotationRequest).budgetLines).toEqual(
      [{ id: 'ibl-1', itemizedAmount: 5000 }],
    );
  });

  it('sends the document id only when one is given', async () => {
    const { result } = setup();
    await act(async () => {
      await result.current.submit(42);
    });
    expect(mockConvertQuotation.mock.calls[0]![1]).toMatchObject({ paperlessDocumentId: 42 });
  });

  it('succeeds with a Refund due: the shortfall never blocks (D1)', async () => {
    const { result } = setup(makeOffer({ deposits: [makePayment({ id: 'd1', amount: 12000 })] }));
    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.submit();
    });
    expect(outcome).toBe('converted');
    expect(mockConvertQuotation).toHaveBeenCalledTimes(1);
    expect(result.current.saveError).toBe('');
  });

  it('is blocked, without a request, while there is a problem; the errors then show', async () => {
    const { result } = setup();
    act(() => result.current.setField('amount', ''));
    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.submit();
    });
    expect(outcome).toBe('blocked');
    expect(mockConvertQuotation).not.toHaveBeenCalled();
    expect(result.current.submitAttempted).toBe(true);
    expect(result.current.visibleFieldErrors.amount).toBeDefined();
  });

  it('a second submit while one is running is blocked', async () => {
    let resolve: (value: never) => void = () => undefined;
    mockConvertQuotation.mockReturnValue(new Promise((r) => (resolve = r)));
    const { result } = setup();
    let first: Promise<string> = Promise.resolve('');
    act(() => {
      first = result.current.submit();
    });
    expect(result.current.isSaving).toBe(true);
    let second: string | undefined;
    await act(async () => {
      second = await result.current.submit();
    });
    expect(second).toBe('blocked');
    await act(async () => {
      resolve({} as never);
      expect(await first).toBe('converted');
    });
    expect(mockConvertQuotation).toHaveBeenCalledTimes(1);
    expect(result.current.isSaving).toBe(false);
  });

  describe('failures', () => {
    const fail = (code: string, status = 400) =>
      new ApiClientError(status, { code, message: 'server prose' } as never);

    it('INVOICE_NOT_QUOTATION returns notOffer without an error message', async () => {
      mockConvertQuotation.mockRejectedValue(fail('INVOICE_NOT_QUOTATION', 409));
      const { result } = setup();
      let outcome: string | undefined;
      await act(async () => {
        outcome = await result.current.submit();
      });
      expect(outcome).toBe('notOffer');
      expect(result.current.saveError).toBe('');
      expect(result.current.isSaving).toBe(false);
    });

    it('ITEMIZED_SUM_EXCEEDS_INVOICE shows its own message', async () => {
      mockConvertQuotation.mockRejectedValue(fail('ITEMIZED_SUM_EXCEEDS_INVOICE'));
      const { result } = setup();
      let outcome: string | undefined;
      await act(async () => {
        outcome = await result.current.submit();
      });
      expect(outcome).toBe('failed');
      expect(result.current.saveError).toBe(tBudget('convertPage.errors.itemizedExceeds'));
    });

    it('other API errors show the translated error code', async () => {
      mockConvertQuotation.mockRejectedValue(fail('VALIDATION_ERROR'));
      const { result } = setup();
      await act(async () => {
        await result.current.submit();
      });
      expect(result.current.saveError).toBe(
        'The submitted data is invalid. Please check your input.',
      );
    });

    it('non-API errors show the generic save error', async () => {
      mockConvertQuotation.mockRejectedValue(new Error('offline'));
      const { result } = setup();
      let outcome: string | undefined;
      await act(async () => {
        outcome = await result.current.submit();
      });
      expect(outcome).toBe('failed');
      expect(result.current.saveError).toBe(tBudget('convertPage.errors.saveFailed'));
    });

    it('keeps the entries after a failure and clears the error on the next attempt', async () => {
      mockConvertQuotation.mockRejectedValueOnce(new Error('offline'));
      const { result } = setup();
      act(() => result.current.setField('notes', 'kept'));
      await act(async () => {
        await result.current.submit();
      });
      expect(result.current.saveError).not.toBe('');
      expect(result.current.form.notes).toBe('kept');
      await act(async () => {
        await result.current.submit();
      });
      expect(result.current.saveError).toBe('');
    });
  });
});
