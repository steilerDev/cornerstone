/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import type { InvoiceDeposit } from '@cornerstone/shared';
import i18n from '../../i18n/index.js';
import type * as ModalTypes from './ConvertQuotationModal.js';
import type { ConvertLineState, UseConvertQuotation } from './useConvertQuotation.js';

jest.unstable_mockModule('../../lib/formatters.js', () => ({
  useFormatters: () => ({
    formatCurrency: (n: number) => `$${n.toFixed(2)}`,
    formatDate: (d: string | null | undefined) => d ?? '—',
    formatPercent: (n: number, digits?: number) => `${n.toFixed(digits ?? 0)}%`,
  }),
}));

const { ConvertQuotationModal } = (await import('./ConvertQuotationModal.js')) as typeof ModalTypes;

const t = (key: string, options?: Record<string, unknown>) =>
  i18n.t(key, { ns: 'budget', ...options }) as string;

function line(overrides: Partial<ConvertLineState> = {}): ConvertLineState {
  return {
    id: 'a',
    name: 'Kitchen',
    description: null,
    type: 'work_item',
    quoted: 6000,
    proposed: '6300.00',
    edited: false,
    keep: false,
    ...overrides,
  };
}

function deposit(overrides: Partial<InvoiceDeposit> = {}): InvoiceDeposit {
  return {
    id: 'dep-1',
    invoiceId: 'inv-1',
    amount: 2000,
    dueDate: '2026-01-10',
    paidDate: null,
    claimedDate: null,
    description: null,
    status: 'pending',
    entryType: 'deposit',
    budgetSourceId: null,
    createdBy: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

type ConvertOverrides = Partial<UseConvertQuotation>;

function makeConvert(overrides: ConvertOverrides = {}) {
  const fns = {
    close: jest.fn(),
    open: jest.fn(),
    setField: jest.fn(),
    setStatus: jest.fn(),
    setKeepExisting: jest.fn(),
    setLineProposed: jest.fn(),
    setLineKeep: jest.fn(),
    resetProposal: jest.fn(),
    openDocumentPicker: jest.fn(),
    onDocumentSelected: jest.fn(),
    onPickerClosed: jest.fn(),
    removeDocument: jest.fn(),
    analyze: jest.fn(),
    applySuggestion: jest.fn(),
    openRefund: jest.fn(),
    onRefundSaved: jest.fn(),
    onRefundClosed: jest.fn(),
    submit: jest.fn(),
    clearPendingFocus: jest.fn(),
  };
  const convert = {
    view: 'form',
    ...fns,
    form: {
      amount: '10500.00',
      date: '2026-03-01',
      invoiceNumber: 'INV-1',
      dueDate: '2026-04-01',
      notes: 'Some notes',
      status: 'pending',
    },
    lines: [line(), line({ id: 'b', name: 'Bath', quoted: 3000, proposed: '3150.00' })],
    keepExisting: false,
    quotedAmount: 10000,
    finalAmount: 10500,
    delta: { absolute: 500, percent: 5, direction: 'increase' },
    itemizedTotal: 9450,
    remainder: 1050,
    overAllocated: false,
    invalidLineIds: new Set<string>(),
    invoiceDeposits: [] as InvoiceDeposit[],
    depositTotals: { depositTotal: 0, refundTotal: 0, receivedRefundTotal: 0, netDeposits: 0 },
    finalPayment: 10500,
    shortfall: 0,
    shortfallResolved: false,
    fieldErrors: {},
    visibleFieldErrors: {},
    canConfirm: true,
    paperless: { configured: false, paperlessUrl: null },
    llmEnabled: false,
    selectedDocument: null,
    aiState: 'idle',
    aiError: '',
    suggestions: {},
    aiMismatch: null,
    aiNoLines: false,
    refundPreset: { amount: '', dueDate: '', budgetSourceId: null, description: '' },
    budgetSources: [],
    isSaving: false,
    saveError: '',
    pendingFocus: null,
    ...overrides,
  } as unknown as UseConvertQuotation;
  return { convert, fns };
}

function renderModal(overrides: ConvertOverrides = {}) {
  const ctx = makeConvert(overrides);
  const utils = render(<ConvertQuotationModal convert={ctx.convert} />);
  return { ...ctx, ...utils };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ConvertQuotationModal', () => {
  describe('shell and footer', () => {
    it('renders a titled dialog with the intro text', () => {
      renderModal();

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText(t('invoiceDetail.convertModal.title'))).toBeInTheDocument();
      expect(screen.getByText(t('invoiceDetail.convertModal.intro'))).toBeInTheDocument();
    });

    it('Cancel calls close', () => {
      const { fns } = renderModal();

      fireEvent.click(screen.getByTestId('convert-cancel'));

      expect(fns.close).toHaveBeenCalledTimes(1);
    });

    it('submitting the form calls submit and prevents the native submit', () => {
      const { fns } = renderModal();

      fireEvent.submit(screen.getByTestId('convert-quotation-form'));

      expect(fns.submit).toHaveBeenCalledTimes(1);
    });

    it('Confirm is a submit button bound to the form and enabled when canConfirm', () => {
      renderModal();

      const confirm = screen.getByTestId('convert-confirm');
      expect(confirm).toHaveAttribute('type', 'submit');
      expect(confirm).toHaveAttribute('form', 'convert-quotation-form');
      expect(confirm).toBeEnabled();
      expect(confirm).toHaveTextContent(t('invoiceDetail.convertModal.confirm'));
    });

    it('Confirm is disabled when canConfirm is false', () => {
      renderModal({ canConfirm: false });

      expect(screen.getByTestId('convert-confirm')).toBeDisabled();
    });

    it('while saving shows the converting label, disables Cancel and marks the form busy', () => {
      renderModal({ isSaving: true, canConfirm: false });

      expect(screen.getByTestId('convert-confirm')).toHaveTextContent(
        t('invoiceDetail.convertModal.confirming'),
      );
      expect(screen.getByTestId('convert-cancel')).toBeDisabled();
      expect(screen.getByTestId('convert-quotation-form')).toHaveAttribute('aria-busy', 'true');
      expect(screen.getByTestId('convert-final-amount')).toBeDisabled();
      expect(screen.getByTestId('convert-status-paid')).toBeDisabled();
    });

    it('shows and focuses the save error summary', async () => {
      renderModal({ saveError: 'Something went wrong' });

      const wrap = screen.getByTestId('convert-save-error');
      expect(within(wrap).getByText('Something went wrong')).toBeInTheDocument();
      await waitFor(() => expect(wrap).toHaveFocus());
    });

    it('renders no save error wrapper when there is none', () => {
      renderModal();

      expect(screen.queryByTestId('convert-save-error')).not.toBeInTheDocument();
    });
  });

  describe('source document section', () => {
    it('shows only the unavailable hint when Paperless is not configured', () => {
      renderModal();

      expect(screen.getByTestId('convert-paperless-unavailable')).toHaveTextContent(
        t('invoiceDetail.convertModal.source.paperlessUnavailable'),
      );
      expect(screen.queryByTestId('convert-select-document')).not.toBeInTheDocument();
      expect(screen.queryByTestId('convert-ai-prefill')).not.toBeInTheDocument();
    });

    it('shows Select and opens the picker when Paperless is configured with no document', () => {
      const { fns } = renderModal({ paperless: { configured: true, paperlessUrl: 'https://p' } });

      const select = screen.getByTestId('convert-select-document');
      expect(select).toHaveTextContent(t('invoiceDetail.convertModal.source.select'));
      expect(screen.getByTestId('convert-selected-document')).toHaveTextContent(
        t('invoiceDetail.convertModal.source.none'),
      );
      expect(screen.queryByTestId('convert-remove-document')).not.toBeInTheDocument();
      fireEvent.click(select);
      expect(fns.openDocumentPicker).toHaveBeenCalledTimes(1);
      expect(screen.queryByTestId('convert-paperless-unavailable')).not.toBeInTheDocument();
    });

    it('shows the selected title with a Change and Remove action', () => {
      const { fns } = renderModal({
        paperless: { configured: true, paperlessUrl: null },
        selectedDocument: { id: 4, title: 'Invoice 2026.pdf' },
      });

      expect(screen.getByTestId('convert-select-document')).toHaveTextContent(
        t('invoiceDetail.convertModal.source.change'),
      );
      const title = screen.getByTestId('convert-selected-document');
      expect(title).toHaveTextContent('Invoice 2026.pdf');
      expect(title).toHaveAttribute('title', 'Invoice 2026.pdf');
      fireEvent.click(screen.getByTestId('convert-remove-document'));
      expect(fns.removeDocument).toHaveBeenCalledTimes(1);
    });

    it('disables the AI button with the unavailable hint when the LLM is off', () => {
      renderModal({
        paperless: { configured: true, paperlessUrl: null },
        llmEnabled: false,
        selectedDocument: { id: 4, title: 'Doc' },
      });

      const button = screen.getByTestId('convert-ai-prefill');
      expect(button).toBeDisabled();
      const hintId = button.getAttribute('aria-describedby');
      expect(hintId).toBeTruthy();
      expect(document.getElementById(hintId!)).toHaveTextContent(
        t('invoiceDetail.convertModal.source.aiUnavailable'),
      );
    });

    it('disables the AI button with the needs-document hint when no document is selected', () => {
      renderModal({ paperless: { configured: true, paperlessUrl: null }, llmEnabled: true });

      const button = screen.getByTestId('convert-ai-prefill');
      expect(button).toBeDisabled();
      expect(document.getElementById(button.getAttribute('aria-describedby')!)).toHaveTextContent(
        t('invoiceDetail.convertModal.source.aiNeedsDocument'),
      );
    });

    it('enables the AI button (no hint) when the LLM is on and a document is selected', () => {
      const { fns } = renderModal({
        paperless: { configured: true, paperlessUrl: null },
        llmEnabled: true,
        selectedDocument: { id: 4, title: 'Doc' },
      });

      const button = screen.getByTestId('convert-ai-prefill');
      expect(button).toBeEnabled();
      expect(button).not.toHaveAttribute('aria-describedby');
      fireEvent.click(button);
      expect(fns.analyze).toHaveBeenCalledTimes(1);
    });

    it('shows the analyzing label and disables the AI button while analyzing', () => {
      renderModal({
        paperless: { configured: true, paperlessUrl: null },
        llmEnabled: true,
        selectedDocument: { id: 4, title: 'Doc' },
        aiState: 'analyzing',
      });

      const button = screen.getByTestId('convert-ai-prefill');
      expect(button).toBeDisabled();
      expect(button).toHaveTextContent(t('invoiceDetail.convertModal.source.aiAnalyzing'));
      expect(screen.getByTestId('convert-quotation-form')).toHaveAttribute('aria-busy', 'true');
    });

    it('shows the AI error with a working Retry button', () => {
      const { fns } = renderModal({
        paperless: { configured: true, paperlessUrl: null },
        llmEnabled: true,
        selectedDocument: { id: 4, title: 'Doc' },
        aiState: 'error',
        aiError: 'The AI service could not be reached.',
      });

      const errorBox = screen.getByTestId('convert-ai-error');
      expect(errorBox).toHaveTextContent('The AI service could not be reached.');
      fireEvent.click(screen.getByTestId('convert-ai-retry'));
      expect(fns.analyze).toHaveBeenCalledTimes(1);
    });

    it('shows success, mismatch and no-lines messages after a successful analysis', () => {
      renderModal({
        paperless: { configured: true, paperlessUrl: null },
        llmEnabled: true,
        selectedDocument: { id: 4, title: 'Doc' },
        aiState: 'success',
        aiMismatch: { extracted: 10200 },
        aiNoLines: true,
      });

      expect(screen.getByTestId('convert-ai-success')).toHaveAttribute('role', 'status');
      expect(screen.getByTestId('convert-ai-mismatch')).toHaveTextContent(
        t('invoiceDetail.convertModal.source.aiTotalMismatch', {
          extracted: '$10200.00',
          quoted: '$10000.00',
        }),
      );
      expect(
        screen.getByText(t('invoiceDetail.convertModal.source.aiNoLines')),
      ).toBeInTheDocument();
    });

    it('shows none of the AI result messages while idle', () => {
      renderModal({
        paperless: { configured: true, paperlessUrl: null },
        llmEnabled: true,
        selectedDocument: { id: 4, title: 'Doc' },
        aiMismatch: { extracted: 1 },
        aiNoLines: true,
      });

      expect(screen.queryByTestId('convert-ai-success')).not.toBeInTheDocument();
      expect(screen.queryByTestId('convert-ai-mismatch')).not.toBeInTheDocument();
      expect(screen.queryByTestId('convert-ai-error')).not.toBeInTheDocument();
      expect(
        screen.queryByText(t('invoiceDetail.convertModal.source.aiNoLines')),
      ).not.toBeInTheDocument();
    });
  });

  describe('invoice details section', () => {
    it('renders the form values in the inputs', () => {
      renderModal();

      expect(screen.getByTestId('convert-final-amount')).toHaveValue(10500);
      expect(screen.getByTestId('convert-date')).toHaveValue('2026-03-01');
      expect(screen.getByTestId('convert-invoice-number')).toHaveValue('INV-1');
      expect(screen.getByTestId('convert-due-date')).toHaveValue('2026-04-01');
      expect(screen.getByTestId('convert-notes')).toHaveValue('Some notes');
    });

    it('routes edits through setField with the field name', () => {
      const { fns } = renderModal();

      fireEvent.change(screen.getByTestId('convert-final-amount'), { target: { value: '9000' } });
      fireEvent.change(screen.getByTestId('convert-date'), { target: { value: '2026-05-05' } });
      fireEvent.change(screen.getByTestId('convert-invoice-number'), { target: { value: 'N-2' } });
      fireEvent.change(screen.getByTestId('convert-due-date'), { target: { value: '2026-06-06' } });
      fireEvent.change(screen.getByTestId('convert-notes'), { target: { value: 'hello' } });

      expect(fns.setField.mock.calls).toEqual([
        ['amount', '9000'],
        ['date', '2026-05-05'],
        ['invoiceNumber', 'N-2'],
        ['dueDate', '2026-06-06'],
        ['notes', 'hello'],
      ]);
    });

    it('links visible field errors to the inputs via aria-invalid and aria-describedby', () => {
      renderModal({
        visibleFieldErrors: {
          amount: 'Amount error',
          date: 'Date error',
          dueDate: 'Due error',
        },
      });

      for (const [testId, message] of [
        ['convert-final-amount', 'Amount error'],
        ['convert-date', 'Date error'],
        ['convert-due-date', 'Due error'],
      ] as const) {
        const input = screen.getByTestId(testId);
        expect(input).toHaveAttribute('aria-invalid', 'true');
        const describedBy = input.getAttribute('aria-describedby')!;
        expect(document.getElementById(describedBy)).toHaveTextContent(message);
      }
    });

    it('renders the due-date error and aria-invalid when only the due date is invalid (stored due date before invoice date)', () => {
      const message = t('invoiceDetail.convertModal.details.errors.dueDateBeforeDate');
      renderModal({
        visibleFieldErrors: { dueDate: message },
        fieldErrors: { dueDate: message },
        canConfirm: false,
      });

      const dueDate = screen.getByTestId('convert-due-date');
      expect(dueDate).toHaveAttribute('aria-invalid', 'true');
      expect(document.getElementById(dueDate.getAttribute('aria-describedby')!)).toHaveTextContent(
        message,
      );
      expect(screen.getByTestId('convert-final-amount')).not.toHaveAttribute('aria-invalid');
      expect(screen.getByTestId('convert-date')).not.toHaveAttribute('aria-invalid');
      expect(screen.getByTestId('convert-confirm')).toBeDisabled();
    });

    it('marks no input invalid when there are no visible errors', () => {
      renderModal();

      for (const testId of ['convert-final-amount', 'convert-date', 'convert-due-date']) {
        expect(screen.getByTestId(testId)).not.toHaveAttribute('aria-invalid');
        expect(screen.getByTestId(testId)).not.toHaveAttribute('aria-describedby');
      }
    });

    it('renders suggestion badges for each suggested field and applies them', () => {
      const { fns } = renderModal({
        suggestions: {
          amount: '10200.00',
          date: '2026-02-02',
          invoiceNumber: 'AI-77',
          dueDate: '2026-03-03',
          notes: 'AI notes',
        },
      });

      expect(
        screen.getByText(t('autoItemize.suggested', { value: '$10200.00' })),
      ).toBeInTheDocument();
      expect(
        screen.getByText(t('autoItemize.suggested', { value: '2026-02-02' })),
      ).toBeInTheDocument();
      expect(screen.getByText(t('autoItemize.suggested', { value: 'AI-77' }))).toBeInTheDocument();
      expect(
        screen.getByText(t('autoItemize.suggested', { value: '2026-03-03' })),
      ).toBeInTheDocument();
      expect(
        screen.getByText(t('autoItemize.suggested', { value: 'AI notes' })),
      ).toBeInTheDocument();

      const apply = screen.getAllByRole('button', { name: /apply/i });
      expect(apply).toHaveLength(5);
      fireEvent.click(apply[0]!);
      fireEvent.click(apply[4]!);
      expect(fns.applySuggestion.mock.calls).toEqual([['amount'], ['notes']]);
    });

    it('shows a non-numeric amount suggestion verbatim', () => {
      renderModal({ suggestions: { amount: 'n/a' } });

      expect(screen.getByText(t('autoItemize.suggested', { value: 'n/a' }))).toBeInTheDocument();
    });

    it.each([
      ['increase', 'deltaIncrease', 'Increase: +$500.00 (+5.0%)'],
      ['decrease', 'deltaDecrease', 'Decrease: −$500.00 (−5.0%)'],
      ['none', 'deltaNone', 'No change'],
    ] as const)('scenario 43: delta badge for %s uses label and class', (direction, cls, label) => {
      renderModal({
        delta: {
          absolute: direction === 'none' ? 0 : 500,
          percent: direction === 'none' ? 0 : 5,
          direction,
        },
      });

      const row = screen.getByTestId('convert-delta');
      expect(row).toHaveAttribute('role', 'status');
      expect(row).toHaveTextContent('Quoted $10000.00 → Final $10500.00');
      const badge = within(row).getByText(label);
      expect(badge.className).toContain(cls);
    });

    it('shows a $0.00 final amount in the delta row when the final amount is invalid', () => {
      renderModal({ finalAmount: null });

      expect(screen.getByTestId('convert-delta')).toHaveTextContent('Final $0.00');
    });
  });

  describe('itemized lines section', () => {
    it('scenario 43: desktop and mobile renderings use distinct test ids (one match each)', () => {
      renderModal();

      expect(screen.getAllByTestId('convert-line-input-a')).toHaveLength(1);
      expect(screen.getAllByTestId('convert-line-input-mobile-a')).toHaveLength(1);
      expect(screen.getAllByTestId('convert-line-keep-a')).toHaveLength(1);
      expect(screen.getAllByTestId('convert-line-keep-mobile-a')).toHaveLength(1);
      expect(screen.getAllByTestId('convert-line-row-a')).toHaveLength(1);
      expect(screen.getAllByTestId('convert-line-card-a')).toHaveLength(1);
      expect(document.querySelectorAll('[id="convert-line-input-a"]')).toHaveLength(1);
    });

    it('scenario 43: shows the empty text and hides the toolbar and totals with no lines', () => {
      renderModal({ lines: [] });

      expect(screen.getByTestId('convert-lines-empty')).toHaveTextContent(
        t('invoiceDetail.convertModal.lines.empty'),
      );
      expect(screen.queryByTestId('convert-reset-proposal')).not.toBeInTheDocument();
      expect(screen.queryByTestId('convert-keep-existing')).not.toBeInTheDocument();
      expect(screen.queryByTestId('convert-remainder')).not.toBeInTheDocument();
    });

    it('renders quoted and proposed values and the type labels', () => {
      renderModal({
        lines: [
          line(),
          line({ id: 'h', name: 'Sofa', type: 'household_item', quoted: 500, proposed: '525.00' }),
        ],
      });

      expect(screen.getByTestId('convert-line-input-a')).toHaveValue(6300);
      expect(screen.getByTestId('convert-line-input-mobile-h')).toHaveValue(525);
      expect(
        screen.getAllByText(t('invoiceDetail.convertModal.lines.workItem')).length,
      ).toBeGreaterThan(0);
      expect(
        screen.getAllByText(t('invoiceDetail.convertModal.lines.householdItem')).length,
      ).toBeGreaterThan(0);
      const row = screen.getByTestId('convert-line-row-a');
      expect(within(row).getByText('$6000.00')).toBeInTheDocument();
    });

    it('edits of either rendering call setLineProposed with the line id', () => {
      const { fns } = renderModal();

      fireEvent.change(screen.getByTestId('convert-line-input-a'), { target: { value: '5000' } });
      fireEvent.change(screen.getByTestId('convert-line-input-mobile-b'), {
        target: { value: '2500' },
      });

      expect(fns.setLineProposed.mock.calls).toEqual([
        ['a', '5000'],
        ['b', '2500'],
      ]);
    });

    it('scenario 43: kept rows are disabled and display the quoted value', () => {
      renderModal({
        lines: [
          line({ keep: true }),
          line({ id: 'b', name: 'Bath', quoted: 3000, proposed: '3150.00' }),
        ],
      });

      const keptDesktop = screen.getByTestId('convert-line-input-a');
      const keptMobile = screen.getByTestId('convert-line-input-mobile-a');
      expect(keptDesktop).toBeDisabled();
      expect(keptMobile).toBeDisabled();
      expect(keptDesktop).toHaveValue(6000);
      expect(screen.getByTestId('convert-line-keep-a')).toBeChecked();
      expect(screen.getByTestId('convert-line-input-b')).toBeEnabled();
      expect(screen.getByTestId('convert-line-keep-b')).not.toBeChecked();
    });

    it('keepExisting disables every input and keep checkbox and the reset button', () => {
      renderModal({ keepExisting: true });

      for (const id of ['a', 'b']) {
        expect(screen.getByTestId(`convert-line-input-${id}`)).toBeDisabled();
        expect(screen.getByTestId(`convert-line-input-${id}`)).toHaveValue(
          id === 'a' ? 6000 : 3000,
        );
        expect(screen.getByTestId(`convert-line-keep-${id}`)).toBeChecked();
        expect(screen.getByTestId(`convert-line-keep-${id}`)).toBeDisabled();
      }
      expect(screen.getByTestId('convert-keep-existing')).toBeChecked();
      expect(screen.getByTestId('convert-reset-proposal')).toBeDisabled();
    });

    it('toolbar actions call resetProposal, setKeepExisting and setLineKeep', () => {
      const { fns } = renderModal();

      fireEvent.click(screen.getByTestId('convert-reset-proposal'));
      fireEvent.click(screen.getByTestId('convert-keep-existing'));
      fireEvent.click(screen.getByTestId('convert-line-keep-a'));
      fireEvent.click(screen.getByTestId('convert-line-keep-mobile-b'));

      expect(fns.resetProposal).toHaveBeenCalledTimes(1);
      expect(fns.setKeepExisting).toHaveBeenCalledWith(true);
      expect(fns.setLineKeep.mock.calls).toEqual([
        ['a', true],
        ['b', true],
      ]);
    });

    it('scenario 43: marks the offending inputs aria-invalid and shows the line error', () => {
      renderModal({ invalidLineIds: new Set(['a']) });

      for (const testId of ['convert-line-input-a', 'convert-line-input-mobile-a']) {
        const input = screen.getByTestId(testId);
        expect(input).toHaveAttribute('aria-invalid', 'true');
        const errorEl = document.getElementById(input.getAttribute('aria-describedby')!);
        expect(errorEl).toHaveTextContent(t('invoiceDetail.convertModal.lines.lineInvalid'));
      }
      expect(screen.getByTestId('convert-line-input-b')).not.toHaveAttribute('aria-invalid');
      expect(screen.getByTestId('convert-line-input-mobile-b')).not.toHaveAttribute('aria-invalid');
    });

    it('scenario 43: the totals container has role=status and no aria-live', () => {
      renderModal();

      const totals = screen.getByTestId('convert-remainder').closest('[role="status"]');
      expect(totals).not.toBeNull();
      expect(totals).not.toHaveAttribute('aria-live');
      expect(within(totals as HTMLElement).getByTestId('convert-itemized-total')).toHaveTextContent(
        '$9450.00',
      );
      expect(screen.getByTestId('convert-remainder')).toHaveTextContent('$1050.00');
      expect(screen.queryByTestId('convert-over-allocated')).not.toBeInTheDocument();
    });

    it('scenario 43: shows the over-allocated alert with the excess amount', () => {
      renderModal({ overAllocated: true, remainder: -250, itemizedTotal: 10750 });

      const alert = screen.getByTestId('convert-over-allocated');
      expect(alert).toHaveAttribute('role', 'alert');
      expect(alert).toHaveTextContent(
        t('invoiceDetail.convertModal.lines.overAllocated', { amount: '$250.00' }),
      );
    });
  });

  describe('deposits section', () => {
    it('shows the empty message and no-remaining hint when nothing is left to pay', () => {
      renderModal({ finalPayment: 0 });

      expect(screen.getByText(t('invoiceDetail.convertModal.deposits.empty'))).toBeInTheDocument();
      expect(
        screen.getByText(t('invoiceDetail.convertModal.deposits.noRemaining')),
      ).toBeInTheDocument();
      expect(screen.getByTestId('convert-final-payment')).toHaveTextContent('$0.00');
    });

    it('does not show the no-remaining hint when a payment remains', () => {
      renderModal({ finalPayment: 10500 });

      expect(
        screen.queryByText(t('invoiceDetail.convertModal.deposits.noRemaining')),
      ).not.toBeInTheDocument();
    });

    it('lists deposits and refunds with signed amounts and badges', () => {
      renderModal({
        invoiceDeposits: [
          deposit({ id: 'd1', amount: 2000, status: 'paid' }),
          deposit({ id: 'd2', amount: 500, entryType: 'refund', status: 'pending' }),
        ],
        depositTotals: {
          depositTotal: 2000,
          refundTotal: 500,
          receivedRefundTotal: 0,
          netDeposits: 1500,
        },
        finalPayment: 8500,
      });

      const dep = screen.getByTestId('convert-deposit-d1');
      expect(dep).toHaveTextContent('$2000.00');
      expect(dep).toHaveTextContent(t('invoiceDetail.statusLabels.paid'));
      expect(dep).toHaveTextContent(t('invoiceDetail.deposits.entryTypeLabels.deposit'));
      const ref = screen.getByTestId('convert-deposit-d2');
      expect(ref).toHaveTextContent('$-500.00');
      expect(ref).toHaveTextContent(t('invoiceDetail.convertModal.deposits.refund'));
      expect(ref).toHaveTextContent(t('invoiceDetail.statusLabels.pending'));
      expect(screen.getByTestId('convert-final-payment')).toHaveTextContent('$8500.00');
      const section = screen.getByTestId('convert-deposits-section');
      expect(within(section).getByText('$-1500.00')).toBeInTheDocument();
    });

    it('scenario 43: the overpaid banner is advisory (role=status), leaves Confirm enabled and is referenced by aria-describedby', () => {
      const { fns } = renderModal({
        shortfall: 1000,
        canConfirm: true,
        depositTotals: {
          depositTotal: 6000,
          refundTotal: 0,
          receivedRefundTotal: 0,
          netDeposits: 6000,
        },
      });

      const banner = screen.getByTestId('convert-overpaid-banner');
      expect(banner).toHaveAttribute('role', 'status');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(banner).toHaveTextContent(
        t('invoiceDetail.convertModal.overpaid.message', {
          shortfall: '$1000.00',
          deposits: '$6000.00',
        }),
      );
      const confirm = screen.getByTestId('convert-confirm');
      expect(confirm).toBeEnabled();
      expect(confirm).toHaveAttribute('aria-describedby', banner.id);
      expect(banner.id).not.toBe('');
      fireEvent.submit(screen.getByTestId('convert-quotation-form'));
      expect(fns.submit).toHaveBeenCalledTimes(1);
      fireEvent.click(screen.getByTestId('convert-add-refund'));
      expect(fns.openRefund).toHaveBeenCalledTimes(1);
      expect(
        screen.queryByText(t('invoiceDetail.convertModal.deposits.noRemaining')),
      ).not.toBeInTheDocument();
    });

    it('has no banner and no aria-describedby on Confirm without a shortfall', () => {
      renderModal();

      expect(screen.queryByTestId('convert-overpaid-banner')).not.toBeInTheDocument();
      expect(screen.getByTestId('convert-confirm')).not.toHaveAttribute('aria-describedby');
    });

    it('announces the resolved shortfall only when flagged', () => {
      const { unmount } = renderModal({ shortfallResolved: true });
      const resolved = screen.getByTestId('convert-deposits-resolved');
      expect(resolved).toHaveAttribute('role', 'status');
      expect(resolved).toHaveTextContent(t('invoiceDetail.convertModal.overpaid.resolved'));
      unmount();

      renderModal({ shortfallResolved: false });
      expect(screen.queryByTestId('convert-deposits-resolved')).not.toBeInTheDocument();
    });
  });

  describe('status section', () => {
    it('scenario 43: renders exactly the two status radios (pending and paid)', () => {
      renderModal();

      const radios = screen.getAllByRole('radio');
      expect(radios).toHaveLength(2);
      expect(radios.map((r) => r.getAttribute('data-testid'))).toEqual([
        'convert-status-pending',
        'convert-status-paid',
      ]);
      expect(screen.getByTestId('convert-status-pending')).toBeChecked();
      expect(screen.getByTestId('convert-status-paid')).not.toBeChecked();
    });

    it('choosing a status calls setStatus', () => {
      const { fns } = renderModal();

      fireEvent.click(screen.getByTestId('convert-status-paid'));

      expect(fns.setStatus).toHaveBeenCalledWith('paid');
    });

    it('checks paid when the form status is paid and calls setStatus(pending) on click', () => {
      const { fns } = renderModal({
        form: {
          amount: '1',
          date: '2026-01-01',
          invoiceNumber: '',
          dueDate: '',
          notes: '',
          status: 'paid',
        },
      });

      expect(screen.getByTestId('convert-status-paid')).toBeChecked();
      fireEvent.click(screen.getByTestId('convert-status-pending'));
      expect(fns.setStatus).toHaveBeenCalledWith('pending');
    });
  });

  describe('focus restoration', () => {
    it.each([
      ['addRefund', 'convert-add-refund', { shortfall: 500, canConfirm: false }],
      ['finalAmount', 'convert-final-amount', {}],
      [
        'selectDocument',
        'convert-select-document',
        { paperless: { configured: true, paperlessUrl: null } },
      ],
    ] as const)(
      'pendingFocus %s focuses %s and clears the request',
      async (focus, testId, extra) => {
        const { fns } = renderModal({ pendingFocus: focus, ...extra } as ConvertOverrides);

        await waitFor(() => expect(screen.getByTestId(testId)).toHaveFocus());
        expect(fns.clearPendingFocus).toHaveBeenCalledTimes(1);
      },
    );

    it('does not steal focus or clear anything when there is no pending focus', async () => {
      const { fns } = renderModal({ pendingFocus: null });

      await new Promise((r) => setTimeout(r, 10));

      expect(fns.clearPendingFocus).not.toHaveBeenCalled();
    });
  });
});
