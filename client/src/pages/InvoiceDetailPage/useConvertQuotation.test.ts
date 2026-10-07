/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { renderHook, act } from '@testing-library/react';
import type {
  AppConfigResponse,
  AutoItemizePreviewResponse,
  BudgetSourceListResponse,
  ConvertQuotationRequest,
  ErrorCode,
  Invoice,
  InvoiceDeposit,
  PaperlessStatusResponse,
} from '@cornerstone/shared';
import i18n from '../../i18n/index.js';
import type * as InvoicesApiTypes from '../../lib/invoicesApi.js';
import type * as PaperlessApiTypes from '../../lib/paperlessApi.js';
import type * as ConfigApiTypes from '../../lib/configApi.js';
import type * as BudgetSourcesApiTypes from '../../lib/budgetSourcesApi.js';
import type * as AutoItemizeApiTypes from '../../lib/invoiceAutoItemizeApi.js';
import type * as HookTypes from './useConvertQuotation.js';

// ─── Module mocks ─────────────────────────────────────────────────────────────

const mockConvertQuotation = jest.fn<typeof InvoicesApiTypes.convertQuotation>();
const mockGetPaperlessStatus = jest.fn<typeof PaperlessApiTypes.getPaperlessStatus>();
const mockFetchConfig = jest.fn<typeof ConfigApiTypes.fetchConfig>();
const mockFetchBudgetSources = jest.fn<typeof BudgetSourcesApiTypes.fetchBudgetSources>();
const mockPreviewAutoItemize = jest.fn<typeof AutoItemizeApiTypes.previewAutoItemize>();

jest.unstable_mockModule('../../lib/invoicesApi.js', () => ({
  convertQuotation: mockConvertQuotation,
}));
jest.unstable_mockModule('../../lib/paperlessApi.js', () => ({
  getPaperlessStatus: mockGetPaperlessStatus,
}));
jest.unstable_mockModule('../../lib/configApi.js', () => ({ fetchConfig: mockFetchConfig }));
jest.unstable_mockModule('../../lib/budgetSourcesApi.js', () => ({
  fetchBudgetSources: mockFetchBudgetSources,
}));
jest.unstable_mockModule('../../lib/invoiceAutoItemizeApi.js', () => ({
  previewAutoItemize: mockPreviewAutoItemize,
}));
jest.unstable_mockModule('../../lib/formatters.js', () => ({
  useFormatters: () => ({
    formatCurrency: (n: number) => `$${n.toFixed(2)}`,
    formatDate: (d: string | null | undefined) => d ?? '—',
    formatPercent: (n: number) => `${n}%`,
  }),
}));

const { ApiClientError } = await import('../../lib/apiClient.js');
const { useConvertQuotation } = await import('./useConvertQuotation.js');

type Hook = typeof HookTypes.useConvertQuotation;

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function localToday(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function makeDeposit(overrides: Partial<InvoiceDeposit> = {}): InvoiceDeposit {
  return {
    id: 'dep-1',
    invoiceId: 'inv-1',
    amount: 6000,
    dueDate: '2026-01-10',
    paidDate: '2026-01-11',
    claimedDate: null,
    description: null,
    status: 'paid',
    entryType: 'deposit',
    budgetSourceId: 'src-1',
    createdBy: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeLine(id: string, amount: number, name = `Item ${id}`) {
  return {
    id,
    budgetLineId: `bl-${id}`,
    budgetLineType: 'work_item' as const,
    itemName: name,
    budgetLineDescription: null,
    categoryName: null,
    categoryColor: null,
    categoryTranslationKey: null,
    plannedAmount: amount,
    itemizedAmount: amount,
  };
}

function makeInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv-1',
    vendorId: 'vendor-1',
    vendorName: 'Vendor',
    invoiceNumber: 'Q-1',
    amount: 10000,
    date: '2026-01-01',
    dueDate: '2099-02-01T00:00:00.000Z',
    status: 'quotation',
    notes: 'Existing notes',
    budgetLines: [makeLine('a', 6000), makeLine('b', 3000)],
    remainingAmount: 1000,
    deposits: [],
    finalPaymentAmount: 10000,
    createdBy: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as unknown as Invoice;
}

const noLinesInvoice = () => makeInvoice({ budgetLines: [] });

function status(overrides: Partial<PaperlessStatusResponse> = {}): PaperlessStatusResponse {
  return {
    configured: true,
    reachable: true,
    error: null,
    paperlessUrl: 'https://paperless.example',
    filterTag: null,
    ...overrides,
  };
}

function config(llmEnabled: boolean): AppConfigResponse {
  return { currency: 'EUR', vatRate: 0.19, autoItemizeEnabled: llmEnabled, llmEnabled };
}

function preview(overrides: Partial<AutoItemizePreviewResponse> = {}): AutoItemizePreviewResponse {
  return {
    lines: [
      { description: 'x', totalAmount: 5000, confidence: 0.9 },
      { description: 'y', totalAmount: 5200, confidence: 0.9 },
    ],
    suggestedVendorId: null,
    extractedInvoiceNumber: 'AI-77',
    extractedInvoiceDate: '2026-02-02',
    extractedDueDate: '2026-03-03',
    extractedNotes: 'AI notes',
    ...overrides,
  };
}

const tBudget = (key: string) => i18n.t(key, { ns: 'budget' }) as string;

interface SetupOptions {
  invoice?: Invoice | null;
  refreshInvoice?: jest.Mock<() => Promise<Invoice>>;
  onConverted?: jest.Mock<(invoice: Invoice) => void>;
}

function setup(options: SetupOptions = {}) {
  const refreshInvoice =
    options.refreshInvoice ?? jest.fn<() => Promise<Invoice>>().mockResolvedValue(makeInvoice());
  const onConverted = options.onConverted ?? jest.fn<(invoice: Invoice) => void>();
  const initial: { invoice: Invoice | null } = {
    invoice: options.invoice === undefined ? makeInvoice() : options.invoice,
  };
  const rendered = renderHook(
    (props: { invoice: Invoice | null }) =>
      (useConvertQuotation as Hook)({
        invoice: props.invoice,
        refreshInvoice,
        onConverted,
      }),
    { initialProps: initial },
  );
  return { ...rendered, refreshInvoice, onConverted };
}

/** Opens the flow and lets the async integration loads settle. */
async function openFlow(result: { current: ReturnType<Hook> }) {
  await act(async () => {
    result.current.open();
  });
}

/** Opens the flow with Paperless + LLM available and a document selected. */
async function openWithDocument(
  result: { current: ReturnType<Hook> },
  llm = true,
  doc = { id: 5, title: 'Doc.pdf' },
) {
  mockFetchConfig.mockResolvedValue(config(llm));
  await openFlow(result);
  act(() => {
    result.current.onDocumentSelected(doc);
  });
}

beforeEach(() => {
  jest.resetAllMocks();
  mockGetPaperlessStatus.mockResolvedValue(status({ configured: false, reachable: false }));
  mockFetchConfig.mockResolvedValue(config(false));
  mockFetchBudgetSources.mockResolvedValue({
    budgetSources: [],
  } as unknown as BudgetSourceListResponse);
  mockConvertQuotation.mockResolvedValue(makeInvoice({ status: 'pending' }));
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useConvertQuotation', () => {
  describe('scenario 30: open()', () => {
    it('initializes the form and lines from the invoice and switches to the form view', async () => {
      const { result } = setup();
      expect(result.current.view).toBe('closed');

      await openFlow(result);

      expect(result.current.view).toBe('form');
      expect(result.current.form).toEqual({
        amount: '10000.00',
        date: localToday(),
        invoiceNumber: 'Q-1',
        dueDate: '2099-02-01',
        notes: 'Existing notes',
        status: 'pending',
      });
      expect(result.current.lines.map((l) => [l.id, l.quoted, l.proposed])).toEqual([
        ['a', 6000, '6000.00'],
        ['b', 3000, '3000.00'],
      ]);
      expect(result.current.lines.every((l) => !l.edited && !l.keep)).toBe(true);
      expect(result.current.quotedAmount).toBe(10000);
      expect(result.current.finalAmount).toBe(10000);
      expect(result.current.delta.direction).toBe('none');
      expect(result.current.itemizedTotal).toBe(9000);
      expect(result.current.remainder).toBe(1000);
      expect(result.current.canConfirm).toBe(true);
    });

    it('uses blank strings for null invoiceNumber, dueDate and notes', async () => {
      const { result } = setup({
        invoice: makeInvoice({ invoiceNumber: null, dueDate: null, notes: null }),
      });

      await openFlow(result);

      expect(result.current.form.invoiceNumber).toBe('');
      expect(result.current.form.dueDate).toBe('');
      expect(result.current.form.notes).toBe('');
    });

    it('does nothing while the invoice is null', async () => {
      const { result } = setup({ invoice: null });

      await openFlow(result);

      expect(result.current.view).toBe('closed');
      expect(mockGetPaperlessStatus).not.toHaveBeenCalled();
    });

    it('close() returns to the closed view without calling the API', async () => {
      const { result } = setup();
      await openFlow(result);

      act(() => {
        result.current.close();
      });

      expect(result.current.view).toBe('closed');
      expect(mockConvertQuotation).not.toHaveBeenCalled();
    });

    it('reopening resets edits, touched state, document and errors', async () => {
      const { result } = setup();
      await openWithDocument(result);
      act(() => {
        result.current.setField('amount', '12345');
        result.current.setLineKeep('a', true);
      });
      act(() => {
        result.current.close();
      });

      await openFlow(result);

      expect(result.current.form.amount).toBe('10000.00');
      expect(result.current.selectedDocument).toBeNull();
      expect(result.current.lines.every((l) => !l.keep && !l.edited)).toBe(true);
      expect(result.current.visibleFieldErrors).toEqual({});
      expect(result.current.aiState).toBe('idle');
    });

    it('ignores integration results that resolve after close()', async () => {
      let resolveStatus: (s: PaperlessStatusResponse) => void = () => undefined;
      mockGetPaperlessStatus.mockReturnValue(
        new Promise<PaperlessStatusResponse>((r) => {
          resolveStatus = r;
        }),
      );
      mockFetchConfig.mockResolvedValue(config(true));
      const { result } = setup();
      act(() => {
        result.current.open();
      });
      act(() => {
        result.current.close();
      });

      await act(async () => {
        resolveStatus(status());
      });

      expect(result.current.paperless.configured).toBe(false);
      expect(result.current.llmEnabled).toBe(false);
    });
  });

  describe('scenario 42: integrations', () => {
    it('reports unavailable when the status/config requests reject', async () => {
      mockGetPaperlessStatus.mockRejectedValue(new Error('down'));
      const { result } = setup();

      await openFlow(result);

      expect(result.current.paperless).toEqual({ configured: false, paperlessUrl: null });
      expect(result.current.llmEnabled).toBe(false);
    });

    it('reports configured only when Paperless is both configured and reachable', async () => {
      mockGetPaperlessStatus.mockResolvedValue(status({ configured: true, reachable: false }));
      const { result } = setup();

      await openFlow(result);

      expect(result.current.paperless.configured).toBe(false);
    });

    it('exposes the Paperless URL and llmEnabled when available', async () => {
      mockGetPaperlessStatus.mockResolvedValue(status());
      mockFetchConfig.mockResolvedValue(config(true));
      const { result } = setup();

      await openFlow(result);

      expect(result.current.paperless).toEqual({
        configured: true,
        paperlessUrl: 'https://paperless.example',
      });
      expect(result.current.llmEnabled).toBe(true);
    });

    it('falls back to a null Paperless URL when the status has none', async () => {
      mockGetPaperlessStatus.mockResolvedValue(
        status({ paperlessUrl: undefined as unknown as string | null }),
      );
      const { result } = setup();

      await openFlow(result);

      expect(result.current.paperless.paperlessUrl).toBeNull();
    });

    it('loads budget sources and falls back to [] on failure', async () => {
      const source = { id: 'src-1', name: 'Bank' };
      mockFetchBudgetSources.mockResolvedValueOnce({
        budgetSources: [source],
      } as unknown as BudgetSourceListResponse);
      const first = setup();
      await openFlow(first.result);
      expect(first.result.current.budgetSources).toEqual([source]);

      mockFetchBudgetSources.mockRejectedValueOnce(new Error('nope'));
      const second = setup();
      await openFlow(second.result);
      expect(second.result.current.budgetSources).toEqual([]);
    });
  });

  describe('scenario 31: proposals', () => {
    it('editing the amount recomputes only untouched, non-kept rows', async () => {
      const { result } = setup();
      await openFlow(result);

      act(() => {
        result.current.setLineProposed('a', '5000');
        result.current.setLineKeep('b', true);
      });
      act(() => {
        result.current.setField('amount', '12000');
      });

      const [a, b] = result.current.lines;
      expect(a!.proposed).toBe('5000');
      expect(a!.edited).toBe(true);
      expect(b!.keep).toBe(true);
      expect(b!.proposed).toBe('3000.00');
    });

    it('editing the amount rescales untouched rows pro rata', async () => {
      const { result } = setup();
      await openFlow(result);

      act(() => {
        result.current.setField('amount', '10500');
      });

      expect(result.current.lines.map((l) => l.proposed)).toEqual(['6300.00', '3150.00']);
      expect(result.current.delta).toEqual({
        absolute: 500,
        percent: 5,
        direction: 'increase',
      });
      expect(result.current.remainder).toBe(1050);
    });

    it('does not rescale for an empty or non-positive amount', async () => {
      const { result } = setup();
      await openFlow(result);

      act(() => {
        result.current.setField('amount', '');
      });
      expect(result.current.lines.map((l) => l.proposed)).toEqual(['6000.00', '3000.00']);
      expect(result.current.finalAmount).toBeNull();

      act(() => {
        result.current.setField('amount', '0');
      });
      expect(result.current.lines.map((l) => l.proposed)).toEqual(['6000.00', '3000.00']);
    });

    it('resetProposal recomputes edited rows but leaves kept rows alone', async () => {
      const { result } = setup();
      await openFlow(result);
      act(() => {
        result.current.setField('amount', '12000');
      });
      act(() => {
        result.current.setLineProposed('a', '1111');
        result.current.setLineKeep('b', true);
      });

      act(() => {
        result.current.resetProposal();
      });

      const [a, b] = result.current.lines;
      expect(a!.edited).toBe(false);
      expect(a!.proposed).toBe('7200.00');
      expect(b!.keep).toBe(true);
      expect(b!.proposed).toBe('3600.00');
    });

    it('un-keeping a row recomputes its proposal and clears its edited flag', async () => {
      const { result } = setup();
      await openFlow(result);
      act(() => {
        result.current.setField('amount', '12000');
      });
      act(() => {
        result.current.setLineProposed('a', '1111');
        result.current.setLineKeep('a', true);
      });
      expect(result.current.lines[0]!.edited).toBe(true);

      act(() => {
        result.current.setLineKeep('a', false);
      });

      expect(result.current.lines[0]!.keep).toBe(false);
      expect(result.current.lines[0]!.edited).toBe(false);
      expect(result.current.lines[0]!.proposed).toBe('7200.00');
    });

    it('a kept row contributes its quoted amount to the itemized total', async () => {
      const { result } = setup();
      await openFlow(result);
      act(() => {
        result.current.setLineProposed('a', '1000');
      });
      expect(result.current.itemizedTotal).toBe(4000);

      act(() => {
        result.current.setLineKeep('a', true);
      });

      expect(result.current.itemizedTotal).toBe(9000);
    });

    it('a manual edit clears a pending suggestion for that field', async () => {
      const { result } = setup();
      await openWithDocument(result);
      act(() => {
        result.current.setField('invoiceNumber', 'MINE');
      });
      mockPreviewAutoItemize.mockResolvedValue(preview());
      await act(async () => {
        await result.current.analyze();
      });
      expect(result.current.suggestions.invoiceNumber).toBe('AI-77');

      act(() => {
        result.current.setField('invoiceNumber', 'MINE2');
      });

      expect(result.current.suggestions.invoiceNumber).toBeUndefined();
    });
  });

  describe('field errors and canConfirm', () => {
    it('scenario 34a: stays true (advisory only) when net deposits exceed the final amount (#2188)', async () => {
      const { result } = setup({
        invoice: makeInvoice({ budgetLines: [], deposits: [makeDeposit({ amount: 6000 })] }),
      });
      await openFlow(result);
      expect(result.current.canConfirm).toBe(true);

      act(() => {
        result.current.setField('amount', '5000');
      });

      expect(result.current.shortfall).toBe(1000);
      expect(result.current.canConfirm).toBe(true);
      expect(result.current.finalPayment).toBe(0);
      expect(result.current.depositTotals.netDeposits).toBe(6000);
    });

    it('scenario 34a2: with a shortfall, submit still posts the conversion and closes the flow', async () => {
      const { result } = setup({
        invoice: makeInvoice({ budgetLines: [], deposits: [makeDeposit({ amount: 6000 })] }),
      });
      await openFlow(result);
      act(() => {
        result.current.setField('amount', '5000');
      });
      expect(result.current.shortfall).toBe(1000);

      await act(async () => {
        await result.current.submit();
      });

      expect(mockConvertQuotation).toHaveBeenCalledTimes(1);
      expect(mockConvertQuotation.mock.calls[0]![1]).toMatchObject({ amount: 5000 });
      expect(result.current.saveError).toBe('');
      expect(result.current.view).toBe('closed');
    });

    it('scenario 34b: is false when the itemized lines are over-allocated', async () => {
      const { result } = setup();
      await openFlow(result);

      act(() => {
        result.current.setLineProposed('a', '9000');
      });

      expect(result.current.overAllocated).toBe(true);
      expect(result.current.remainder).toBe(-2000);
      expect(result.current.canConfirm).toBe(false);
    });

    it('scenario 34c: is false on an invalid (zero, empty) line and lists its id', async () => {
      const { result } = setup();
      await openFlow(result);

      act(() => {
        result.current.setLineProposed('a', '0');
        result.current.setLineProposed('b', '');
      });

      expect([...result.current.invalidLineIds].sort()).toEqual(['a', 'b']);
      expect(result.current.canConfirm).toBe(false);
    });

    it('scenario 34d: choosing paid alone does not disable Confirm', async () => {
      const { result } = setup();
      await openFlow(result);

      act(() => {
        result.current.setStatus('paid');
      });

      expect(result.current.form.status).toBe('paid');
      expect(result.current.canConfirm).toBe(true);
    });

    it('keepExisting ignores invalid proposals and uses quoted amounts', async () => {
      const { result } = setup();
      await openFlow(result);
      act(() => {
        result.current.setLineProposed('a', '');
      });
      expect(result.current.invalidLineIds.size).toBe(1);

      act(() => {
        result.current.setKeepExisting(true);
      });

      expect(result.current.invalidLineIds.size).toBe(0);
      expect(result.current.itemizedTotal).toBe(9000);
      expect(result.current.canConfirm).toBe(true);
    });

    it('reports the required/positive/date/dueDate errors and only shows them once touched', async () => {
      const { result } = setup();
      await openFlow(result);

      act(() => {
        result.current.setField('amount', '');
        result.current.setField('date', '');
      });
      expect(result.current.fieldErrors.amount).toBe(
        tBudget('invoiceDetail.convertModal.details.errors.amountRequired'),
      );
      expect(result.current.fieldErrors.date).toBe(
        tBudget('invoiceDetail.convertModal.details.errors.dateRequired'),
      );
      expect(Object.keys(result.current.visibleFieldErrors).sort()).toEqual(['amount', 'date']);

      act(() => {
        result.current.setField('amount', '-3');
      });
      expect(result.current.fieldErrors.amount).toBe(
        tBudget('invoiceDetail.convertModal.details.errors.amountPositive'),
      );

      act(() => {
        result.current.setField('date', '2026-05-10');
        result.current.setField('dueDate', '2026-05-01');
      });
      expect(result.current.fieldErrors.dueDate).toBe(
        tBudget('invoiceDetail.convertModal.details.errors.dueDateBeforeDate'),
      );
      expect(result.current.visibleFieldErrors.dueDate).toBe(result.current.fieldErrors.dueDate);
      expect(result.current.canConfirm).toBe(false);
    });

    it('shows a stored due date earlier than the invoice date immediately, without touch, and blocks Confirm', async () => {
      const { result } = setup({ invoice: makeInvoice({ dueDate: '2026-01-01' }) });

      await openFlow(result);

      // date defaults to today, which is after the stored due date
      expect(result.current.fieldErrors.dueDate).toBe(
        tBudget('invoiceDetail.convertModal.details.errors.dueDateBeforeDate'),
      );
      expect(result.current.visibleFieldErrors).toEqual({
        dueDate: tBudget('invoiceDetail.convertModal.details.errors.dueDateBeforeDate'),
      });
      expect(result.current.canConfirm).toBe(false);

      await act(async () => {
        await result.current.submit();
      });

      expect(mockConvertQuotation).not.toHaveBeenCalled();
    });

    it('shows a required-date error once the field is touched and no other errors', async () => {
      const { result } = setup();
      await openFlow(result);
      act(() => {
        result.current.setField('date', '');
      });
      expect(Object.keys(result.current.visibleFieldErrors)).toEqual(['date']);
    });

    it('announces when the shortfall is resolved', async () => {
      const deposit = makeDeposit({ amount: 6000 });
      const { result, rerender } = setup({
        invoice: makeInvoice({ budgetLines: [], deposits: [deposit] }),
      });
      await openFlow(result);
      act(() => {
        result.current.setField('amount', '5000');
      });
      expect(result.current.shortfall).toBe(1000);
      expect(result.current.shortfallResolved).toBe(false);

      rerender({
        invoice: makeInvoice({
          budgetLines: [],
          deposits: [deposit, makeDeposit({ id: 'ref', amount: 1000, entryType: 'refund' })],
        }),
      });

      expect(result.current.shortfall).toBe(0);
      expect(result.current.shortfallResolved).toBe(true);
    });
  });

  describe('submit body', () => {
    it('scenario 32: keepExisting sends an empty budgetLines array', async () => {
      const { result } = setup();
      await openFlow(result);
      act(() => {
        result.current.setField('amount', '10500');
        result.current.setKeepExisting(true);
      });

      await act(async () => {
        await result.current.submit();
      });

      const body = mockConvertQuotation.mock.calls[0]![1] as ConvertQuotationRequest;
      expect(body.budgetLines).toEqual([]);
      expect(body.amount).toBe(10500);
    });

    it('scenario 33: unchanged rows and kept rows are excluded from budgetLines', async () => {
      const { result } = setup();
      await openFlow(result);
      act(() => {
        result.current.setLineProposed('a', '5000');
      });

      await act(async () => {
        await result.current.submit();
      });

      const body = mockConvertQuotation.mock.calls[0]![1] as ConvertQuotationRequest;
      expect(body.budgetLines).toEqual([{ id: 'a', itemizedAmount: 5000 }]);
    });

    it('excludes a kept row even when its proposal differs', async () => {
      const { result } = setup();
      await openFlow(result);
      act(() => {
        result.current.setField('amount', '10500');
        result.current.setLineKeep('a', true);
      });

      await act(async () => {
        await result.current.submit();
      });

      const body = mockConvertQuotation.mock.calls[0]![1] as ConvertQuotationRequest;
      expect(body.budgetLines).toEqual([{ id: 'b', itemizedAmount: 3150 }]);
    });

    it('sends trimmed values, nulls for blank optional fields, and the target status', async () => {
      const { result } = setup();
      await openFlow(result);
      act(() => {
        result.current.setField('invoiceNumber', '  ');
        result.current.setField('dueDate', '');
        result.current.setField('notes', '  ');
        result.current.setStatus('paid');
      });

      await act(async () => {
        await result.current.submit();
      });

      expect(mockConvertQuotation).toHaveBeenCalledTimes(1);
      const [invoiceId, body] = mockConvertQuotation.mock.calls[0]!;
      expect(invoiceId).toBe('inv-1');
      expect(body).toMatchObject({
        amount: 10000,
        date: localToday(),
        invoiceNumber: null,
        dueDate: null,
        notes: null,
        status: 'paid',
      });
      expect('paperlessDocumentId' in body).toBe(false);
    });

    it('scenario 41: the conversion note contains the formatted quoted amount and is identical for pending and paid', async () => {
      const { result } = setup();
      await openFlow(result);

      await act(async () => {
        await result.current.submit();
      });
      act(() => {
        result.current.setStatus('paid');
      });
      await act(async () => {
        await result.current.submit();
      });

      const first = mockConvertQuotation.mock.calls[0]![1] as ConvertQuotationRequest;
      const second = mockConvertQuotation.mock.calls[1]![1] as ConvertQuotationRequest;
      expect(first.status).toBe('pending');
      expect(second.status).toBe('paid');
      expect(first.conversionNote).toBe(
        `Converted from quotation of $10000.00 on ${localToday()}.`,
      );
      expect(second.conversionNote).toBe(first.conversionNote);
    });

    it('on success calls onConverted with the converted invoice and closes the flow', async () => {
      const converted = makeInvoice({ status: 'pending' });
      mockConvertQuotation.mockResolvedValue(converted);
      const { result, onConverted } = setup();
      await openFlow(result);

      await act(async () => {
        await result.current.submit();
      });

      expect(onConverted).toHaveBeenCalledTimes(1);
      expect(onConverted).toHaveBeenCalledWith(converted);
      expect(result.current.view).toBe('closed');
      expect(result.current.isSaving).toBe(false);
      expect(result.current.saveError).toBe('');
    });

    it('does not submit when Confirm is blocked', async () => {
      const { result } = setup();
      await openFlow(result);
      act(() => {
        result.current.setLineProposed('a', '9000');
      });

      await act(async () => {
        await result.current.submit();
      });

      expect(mockConvertQuotation).not.toHaveBeenCalled();
    });

    it('does nothing when the invoice is null', async () => {
      const { result } = setup({ invoice: null });

      await act(async () => {
        await result.current.submit();
      });

      expect(mockConvertQuotation).not.toHaveBeenCalled();
    });

    it('close() is ignored while saving', async () => {
      let resolveConvert: (i: Invoice) => void = () => undefined;
      mockConvertQuotation.mockReturnValue(
        new Promise<Invoice>((r) => {
          resolveConvert = r;
        }),
      );
      const { result } = setup();
      await openFlow(result);
      let pending: Promise<void> = Promise.resolve();
      act(() => {
        pending = result.current.submit();
      });
      expect(result.current.isSaving).toBe(true);
      expect(result.current.canConfirm).toBe(false);

      act(() => {
        result.current.close();
      });
      expect(result.current.view).toBe('form');

      await act(async () => {
        resolveConvert(makeInvoice({ status: 'pending' }));
        await pending;
      });
      expect(result.current.view).toBe('closed');
    });
  });

  describe('scenario 40: submit error mapping', () => {
    async function failWith(code: ErrorCode, refresh = jest.fn<() => Promise<Invoice>>()) {
      refresh.mockResolvedValue(makeInvoice());
      mockConvertQuotation.mockRejectedValue(new ApiClientError(400, { code, message: code }));
      const ctx = setup({ refreshInvoice: refresh });
      await openFlow(ctx.result);
      act(() => {
        ctx.result.current.setField('amount', '10500');
      });
      await act(async () => {
        await ctx.result.current.submit();
      });
      return { ...ctx, refresh };
    }

    it('ITEMIZED_SUM_EXCEEDS_INVOICE shows its message without refreshing', async () => {
      const { result, refresh } = await failWith('ITEMIZED_SUM_EXCEEDS_INVOICE');

      expect(result.current.saveError).toBe(
        tBudget('invoiceDetail.convertModal.errors.itemizedExceeds'),
      );
      expect(refresh).not.toHaveBeenCalled();
    });

    it('INVOICE_NOT_QUOTATION shows its message and refreshes the invoice', async () => {
      const { result, refresh } = await failWith('INVOICE_NOT_QUOTATION');

      expect(result.current.saveError).toBe(
        tBudget('invoiceDetail.convertModal.errors.notQuotation'),
      );
      expect(refresh).toHaveBeenCalledTimes(1);
    });

    it('INVOICE_NOT_QUOTATION swallows a failing refresh', async () => {
      const refresh = jest.fn<() => Promise<Invoice>>().mockRejectedValue(new Error('x'));
      mockConvertQuotation.mockRejectedValue(
        new ApiClientError(409, { code: 'INVOICE_NOT_QUOTATION', message: 'x' }),
      );
      const { result } = setup({ refreshInvoice: refresh });
      await openFlow(result);

      await act(async () => {
        await result.current.submit();
      });

      expect(result.current.saveError).toBe(
        tBudget('invoiceDetail.convertModal.errors.notQuotation'),
      );
    });

    it('other API errors use the translated error code', async () => {
      const { result, refresh } = await failWith('LLM_UNREACHABLE');

      expect(result.current.saveError).toBe(i18n.t('LLM_UNREACHABLE', { ns: 'errors' }) as string);
      expect(refresh).not.toHaveBeenCalled();
    });

    it('non-API errors use the generic save error', async () => {
      mockConvertQuotation.mockRejectedValue(new Error('network'));
      const { result } = setup();
      await openFlow(result);

      await act(async () => {
        await result.current.submit();
      });

      expect(result.current.saveError).toBe(tBudget('invoiceDetail.convertModal.saveError'));
    });

    it('retains entered values after an error and clears the error on the next attempt', async () => {
      mockConvertQuotation.mockRejectedValueOnce(new Error('network'));
      const { result, onConverted } = setup();
      await openFlow(result);
      act(() => {
        result.current.setField('amount', '10500');
      });
      await act(async () => {
        await result.current.submit();
      });
      expect(result.current.form.amount).toBe('10500');
      expect(result.current.saveError).not.toBe('');
      expect(result.current.isSaving).toBe(false);

      await act(async () => {
        await result.current.submit();
      });

      expect(result.current.saveError).toBe('');
      expect(onConverted).toHaveBeenCalledTimes(1);
    });
  });

  describe('scenario 35-37: AI prefill', () => {
    it('scenario 35: sets untouched fields, suggests touched ones, and applySuggestion applies and clears', async () => {
      const { result } = setup();
      await openWithDocument(result);
      mockPreviewAutoItemize.mockResolvedValue(preview());
      act(() => {
        result.current.setField('invoiceNumber', 'MINE');
      });

      await act(async () => {
        await result.current.analyze();
      });

      expect(mockPreviewAutoItemize).toHaveBeenCalledWith({ paperlessDocumentId: 5 });
      expect(result.current.aiState).toBe('success');
      expect(result.current.form.amount).toBe('10200.00');
      expect(result.current.form.date).toBe('2026-02-02');
      expect(result.current.form.dueDate).toBe('2026-03-03');
      // notes and invoiceNumber hold saved quotation data: suggested, never overwritten
      expect(result.current.form.notes).toBe('Existing notes');
      expect(result.current.form.invoiceNumber).toBe('MINE');
      expect(result.current.suggestions).toEqual({ invoiceNumber: 'AI-77', notes: 'AI notes' });
      // pro-rata re-proposal from the prefilled amount
      expect(result.current.lines.map((l) => l.proposed)).toEqual(['6120.00', '3060.00']);

      act(() => {
        result.current.applySuggestion('invoiceNumber');
      });

      expect(result.current.form.invoiceNumber).toBe('AI-77');
      expect(result.current.suggestions).toEqual({ notes: 'AI notes' });
    });

    it('protects non-empty notes and invoiceNumber from the quotation: AI values become suggestions', async () => {
      const { result } = setup();
      await openWithDocument(result);
      mockPreviewAutoItemize.mockResolvedValue(preview());

      await act(async () => {
        await result.current.analyze();
      });

      expect(result.current.form.notes).toBe('Existing notes');
      expect(result.current.form.invoiceNumber).toBe('Q-1');
      expect(result.current.suggestions).toEqual({ notes: 'AI notes', invoiceNumber: 'AI-77' });
    });

    it('applies AI notes and invoiceNumber directly when they are empty or null at open', async () => {
      const { result } = setup({ invoice: makeInvoice({ notes: null, invoiceNumber: '' }) });
      await openWithDocument(result);
      mockPreviewAutoItemize.mockResolvedValue(preview());

      await act(async () => {
        await result.current.analyze();
      });

      expect(result.current.form.notes).toBe('AI notes');
      expect(result.current.form.invoiceNumber).toBe('AI-77');
      expect(result.current.suggestions).toEqual({});
    });

    it('treats whitespace-only saved notes as empty (AI applies directly)', async () => {
      const { result } = setup({ invoice: makeInvoice({ notes: '   ' }) });
      await openWithDocument(result);
      mockPreviewAutoItemize.mockResolvedValue(preview());

      await act(async () => {
        await result.current.analyze();
      });

      expect(result.current.form.notes).toBe('AI notes');
    });

    it('creates no suggestion when the AI value equals the current value', async () => {
      const { result } = setup();
      await openWithDocument(result);
      mockPreviewAutoItemize.mockResolvedValue(
        preview({ extractedNotes: 'Existing notes', extractedInvoiceNumber: 'Q-1' }),
      );

      await act(async () => {
        await result.current.analyze();
      });

      expect(result.current.suggestions).toEqual({});
      expect(result.current.form.notes).toBe('Existing notes');
      expect(result.current.form.invoiceNumber).toBe('Q-1');
    });

    it('a touched amount gets a suggestion and its line proposals are left alone', async () => {
      const { result } = setup();
      await openWithDocument(result);
      mockPreviewAutoItemize.mockResolvedValue(preview());
      act(() => {
        result.current.setField('amount', '9999');
      });
      const before = result.current.lines.map((l) => l.proposed);

      await act(async () => {
        await result.current.analyze();
      });

      expect(result.current.form.amount).toBe('9999');
      expect(result.current.suggestions.amount).toBe('10200.00');
      expect(result.current.lines.map((l) => l.proposed)).toEqual(before);
    });

    it('applySuggestion for a field without a suggestion is a no-op', async () => {
      const { result } = setup();
      await openFlow(result);

      act(() => {
        result.current.applySuggestion('notes');
      });

      expect(result.current.form.notes).toBe('Existing notes');
    });

    it('ignores extracted dates that are not YYYY-MM-DD and empty strings', async () => {
      const { result } = setup();
      await openWithDocument(result);
      mockPreviewAutoItemize.mockResolvedValue(
        preview({
          extractedInvoiceDate: '01.02.2026',
          extractedDueDate: undefined,
          extractedInvoiceNumber: '',
          extractedNotes: undefined,
        }),
      );
      const before = { ...result.current.form };

      await act(async () => {
        await result.current.analyze();
      });

      expect(result.current.form.date).toBe(before.date);
      expect(result.current.form.dueDate).toBe(before.dueDate);
      expect(result.current.form.invoiceNumber).toBe(before.invoiceNumber);
      expect(result.current.form.notes).toBe(before.notes);
      expect(result.current.suggestions).toEqual({});
      expect(result.current.form.amount).toBe('10200.00');
    });

    it('scenario 36a: flags a total mismatch above 1% of the quoted amount', async () => {
      const { result } = setup();
      await openWithDocument(result);
      mockPreviewAutoItemize.mockResolvedValue(preview());

      await act(async () => {
        await result.current.analyze();
      });

      expect(result.current.aiMismatch).toEqual({ extracted: 10200 });
      expect(result.current.aiNoLines).toBe(false);
    });

    it('scenario 36b: no mismatch within 1%', async () => {
      const { result } = setup();
      await openWithDocument(result);
      mockPreviewAutoItemize.mockResolvedValue(
        preview({ lines: [{ description: 'x', totalAmount: 10050, confidence: 1 }] }),
      );

      await act(async () => {
        await result.current.analyze();
      });

      expect(result.current.aiMismatch).toBeNull();
    });

    it('scenario 36c: no extracted lines sets aiNoLines and leaves the amount alone', async () => {
      const { result } = setup();
      await openWithDocument(result);
      mockPreviewAutoItemize.mockResolvedValue(preview({ lines: [] }));

      await act(async () => {
        await result.current.analyze();
      });

      expect(result.current.aiNoLines).toBe(true);
      expect(result.current.aiMismatch).toBeNull();
      expect(result.current.form.amount).toBe('10000.00');
      expect(result.current.form.invoiceNumber).toBe('Q-1');
      expect(result.current.suggestions.invoiceNumber).toBe('AI-77');
      expect(result.current.aiState).toBe('success');
    });

    it('scenario 37: an API failure keeps the values, shows the translated error, and retry works', async () => {
      const { result } = setup();
      await openWithDocument(result);
      act(() => {
        result.current.setField('amount', '10500');
      });
      mockPreviewAutoItemize.mockRejectedValueOnce(
        new ApiClientError(502, { code: 'LLM_UNREACHABLE', message: 'x' }),
      );

      await act(async () => {
        await result.current.analyze();
      });

      expect(result.current.aiState).toBe('error');
      expect(result.current.aiError).toBe(i18n.t('LLM_UNREACHABLE', { ns: 'errors' }) as string);
      expect(result.current.form.amount).toBe('10500');
      expect(result.current.form.invoiceNumber).toBe('Q-1');

      mockPreviewAutoItemize.mockResolvedValueOnce(preview());
      await act(async () => {
        await result.current.analyze();
      });

      expect(result.current.aiState).toBe('success');
      expect(result.current.aiError).toBe('');
      expect(mockPreviewAutoItemize).toHaveBeenCalledTimes(2);
    });

    it('scenario 37: a non-API failure uses the generic AI error message', async () => {
      const { result } = setup();
      await openWithDocument(result);
      mockPreviewAutoItemize.mockRejectedValue(new Error('boom'));

      await act(async () => {
        await result.current.analyze();
      });

      expect(result.current.aiState).toBe('error');
      expect(result.current.aiError).toBe(tBudget('invoiceDetail.convertModal.source.aiError'));
    });

    it('analyze() is a no-op without a document or when the LLM is disabled', async () => {
      const noDoc = setup();
      mockFetchConfig.mockResolvedValue(config(true));
      await openFlow(noDoc.result);
      await act(async () => {
        await noDoc.result.current.analyze();
      });

      const noLlm = setup();
      await openWithDocument(noLlm.result, false);
      await act(async () => {
        await noLlm.result.current.analyze();
      });

      expect(mockPreviewAutoItemize).not.toHaveBeenCalled();
      expect(noDoc.result.current.aiState).toBe('idle');
      expect(noLlm.result.current.aiState).toBe('idle');
    });

    it('shows the analyzing state and blocks Confirm while the request is in flight', async () => {
      let resolvePreview: (r: AutoItemizePreviewResponse) => void = () => undefined;
      mockPreviewAutoItemize.mockReturnValue(
        new Promise<AutoItemizePreviewResponse>((r) => {
          resolvePreview = r;
        }),
      );
      const { result } = setup();
      await openWithDocument(result);
      let pending: Promise<void> = Promise.resolve();
      act(() => {
        pending = result.current.analyze();
      });

      expect(result.current.aiState).toBe('analyzing');
      expect(result.current.canConfirm).toBe(false);

      await act(async () => {
        resolvePreview(preview());
        await pending;
      });
      expect(result.current.aiState).toBe('success');
    });

    it('discards an analysis that finishes after the flow was closed', async () => {
      let resolvePreview: (r: AutoItemizePreviewResponse) => void = () => undefined;
      mockPreviewAutoItemize.mockReturnValue(
        new Promise<AutoItemizePreviewResponse>((r) => {
          resolvePreview = r;
        }),
      );
      const { result } = setup();
      await openWithDocument(result);
      let pending: Promise<void> = Promise.resolve();
      act(() => {
        pending = result.current.analyze();
      });
      act(() => {
        result.current.close();
      });

      await act(async () => {
        resolvePreview(preview());
        await pending;
      });

      expect(result.current.aiState).toBe('analyzing');
      expect(result.current.form.amount).toBe('10000.00');
    });

    it('discards a failure that arrives after the flow was closed', async () => {
      let rejectPreview: (e: Error) => void = () => undefined;
      mockPreviewAutoItemize.mockReturnValue(
        new Promise<AutoItemizePreviewResponse>((_, rej) => {
          rejectPreview = rej;
        }),
      );
      const { result } = setup();
      await openWithDocument(result);
      let pending: Promise<void> = Promise.resolve();
      act(() => {
        pending = result.current.analyze();
      });
      act(() => {
        result.current.close();
      });

      await act(async () => {
        rejectPreview(new Error('late'));
        await pending;
      });

      expect(result.current.aiError).toBe('');
    });
  });

  describe('scenario 38: refund flow', () => {
    const overpaid = () =>
      makeInvoice({ budgetLines: [], deposits: [makeDeposit({ amount: 6000 })] });

    it('openRefund switches to the refund view with a preset for the shortfall', async () => {
      const { result } = setup({ invoice: overpaid() });
      await openFlow(result);
      act(() => {
        result.current.setField('amount', '5000');
      });

      act(() => {
        result.current.openRefund();
      });

      expect(result.current.view).toBe('refund');
      expect(result.current.refundPreset).toEqual({
        amount: '1000.00',
        dueDate: localToday(),
        budgetSourceId: 'src-1',
        description: tBudget('invoiceDetail.convertModal.overpaid.refundDescription'),
      });
      // form state is retained
      expect(result.current.form.amount).toBe('5000');
    });

    it('onRefundSaved refreshes, returns to the form and focuses the final amount when the shortfall is cleared', async () => {
      const refreshed = makeInvoice({
        budgetLines: [],
        deposits: [
          makeDeposit({ amount: 6000 }),
          makeDeposit({ id: 'r', amount: 1000, entryType: 'refund' }),
        ],
      });
      const refresh = jest.fn<() => Promise<Invoice>>().mockResolvedValue(refreshed);
      const { result } = setup({ invoice: overpaid(), refreshInvoice: refresh });
      await openFlow(result);
      act(() => {
        result.current.setField('amount', '5000');
      });
      act(() => {
        result.current.openRefund();
      });

      await act(async () => {
        await result.current.onRefundSaved();
      });

      expect(refresh).toHaveBeenCalledTimes(1);
      expect(result.current.view).toBe('form');
      expect(result.current.pendingFocus).toBe('finalAmount');
      expect(result.current.form.amount).toBe('5000');
    });

    it('onRefundSaved focuses Add refund when the refreshed invoice still has a shortfall', async () => {
      const refresh = jest.fn<() => Promise<Invoice>>().mockResolvedValue(overpaid());
      const { result } = setup({ invoice: overpaid(), refreshInvoice: refresh });
      await openFlow(result);
      act(() => {
        result.current.setField('amount', '5000');
      });

      await act(async () => {
        await result.current.onRefundSaved();
      });

      expect(result.current.view).toBe('form');
      expect(result.current.pendingFocus).toBe('addRefund');
    });

    it('onRefundSaved still returns to the form when the refresh fails', async () => {
      const refresh = jest.fn<() => Promise<Invoice>>().mockRejectedValue(new Error('x'));
      const { result } = setup({ invoice: overpaid(), refreshInvoice: refresh });
      await openFlow(result);
      act(() => {
        result.current.setField('amount', '5000');
      });

      await act(async () => {
        await result.current.onRefundSaved();
      });

      expect(result.current.view).toBe('form');
      expect(result.current.pendingFocus).toBe('addRefund');
    });

    it('onRefundSaved with an invalid final amount falls back to the current shortfall', async () => {
      const refresh = jest.fn<() => Promise<Invoice>>().mockResolvedValue(makeInvoice());
      const { result } = setup({ refreshInvoice: refresh });
      await openFlow(result);
      act(() => {
        result.current.setField('amount', '');
      });

      await act(async () => {
        await result.current.onRefundSaved();
      });

      expect(result.current.pendingFocus).toBe('finalAmount');
    });

    it('onRefundSaved after close() does not reopen the form', async () => {
      let resolveRefresh: (i: Invoice) => void = () => undefined;
      const refresh = jest.fn<() => Promise<Invoice>>().mockReturnValue(
        new Promise<Invoice>((r) => {
          resolveRefresh = r;
        }),
      );
      const { result } = setup({ invoice: overpaid(), refreshInvoice: refresh });
      await openFlow(result);
      act(() => {
        result.current.openRefund();
      });
      let pending: Promise<void> = Promise.resolve();
      act(() => {
        pending = result.current.onRefundSaved();
      });
      act(() => {
        result.current.close();
      });

      await act(async () => {
        resolveRefresh(overpaid());
        await pending;
      });

      expect(result.current.view).toBe('closed');
    });

    it('onRefundClosed returns to the form and focuses Add refund; clearPendingFocus resets it', async () => {
      const { result } = setup({ invoice: overpaid() });
      await openFlow(result);
      act(() => {
        result.current.openRefund();
      });

      act(() => {
        result.current.onRefundClosed();
      });

      expect(result.current.view).toBe('form');
      expect(result.current.pendingFocus).toBe('addRefund');

      act(() => {
        result.current.clearPendingFocus();
      });

      expect(result.current.pendingFocus).toBeNull();
    });

    it('refundPreset budgetSourceId is null when deposits use mixed sources', async () => {
      const { result } = setup({
        invoice: makeInvoice({
          budgetLines: [],
          deposits: [
            makeDeposit({ id: 'd1', amount: 3000, budgetSourceId: 'src-1' }),
            makeDeposit({ id: 'd2', amount: 3000, budgetSourceId: 'src-2' }),
          ],
        }),
      });
      await openFlow(result);

      act(() => {
        result.current.openRefund();
      });

      expect(result.current.refundPreset.budgetSourceId).toBeNull();
    });
  });

  describe('scenario 39: document picker flow', () => {
    it('opening the picker switches views; selecting a document returns to the form with focus', async () => {
      const { result } = setup();
      await openFlow(result);

      act(() => {
        result.current.openDocumentPicker();
      });
      expect(result.current.view).toBe('paperless');

      act(() => {
        result.current.onDocumentSelected({ id: 9, title: 'Invoice.pdf' });
      });

      expect(result.current.view).toBe('form');
      expect(result.current.selectedDocument).toEqual({ id: 9, title: 'Invoice.pdf' });
      expect(result.current.pendingFocus).toBe('selectDocument');
    });

    it('closing the picker returns to the form without a document', async () => {
      const { result } = setup();
      await openFlow(result);
      act(() => {
        result.current.openDocumentPicker();
      });

      act(() => {
        result.current.onPickerClosed();
      });

      expect(result.current.view).toBe('form');
      expect(result.current.selectedDocument).toBeNull();
      expect(result.current.pendingFocus).toBe('selectDocument');
    });

    it('sends paperlessDocumentId in the body when a document is selected', async () => {
      const { result } = setup();
      await openWithDocument(result, true, { id: 42, title: 'Doc' });

      await act(async () => {
        await result.current.submit();
      });

      const body = mockConvertQuotation.mock.calls[0]![1] as ConvertQuotationRequest;
      expect(body.paperlessDocumentId).toBe(42);
    });

    it('removeDocument clears the document and resets the AI state', async () => {
      const { result } = setup();
      await openWithDocument(result);
      mockPreviewAutoItemize.mockResolvedValue(preview({ lines: [] }));
      await act(async () => {
        await result.current.analyze();
      });
      expect(result.current.aiNoLines).toBe(true);

      act(() => {
        result.current.removeDocument();
      });

      expect(result.current.selectedDocument).toBeNull();
      expect(result.current.aiState).toBe('idle');
      expect(result.current.aiNoLines).toBe(false);
      expect(result.current.aiMismatch).toBeNull();
    });

    it('selecting a new document resets a previous AI result', async () => {
      const { result } = setup();
      await openWithDocument(result);
      mockPreviewAutoItemize.mockResolvedValue(preview());
      await act(async () => {
        await result.current.analyze();
      });
      expect(result.current.aiState).toBe('success');

      act(() => {
        result.current.onDocumentSelected({ id: 6, title: 'Other.pdf' });
      });

      expect(result.current.aiState).toBe('idle');
      expect(result.current.aiMismatch).toBeNull();
    });
  });

  describe('no-lines quotation', () => {
    it('opens with no lines, zero itemized total, and submits an empty budgetLines array', async () => {
      const { result } = setup({ invoice: noLinesInvoice() });
      await openFlow(result);
      expect(result.current.lines).toEqual([]);
      expect(result.current.itemizedTotal).toBe(0);
      expect(result.current.overAllocated).toBe(false);

      await act(async () => {
        await result.current.submit();
      });

      const body = mockConvertQuotation.mock.calls[0]![1] as ConvertQuotationRequest;
      expect(body.budgetLines).toEqual([]);
    });
  });
});
