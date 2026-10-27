/**
 * @jest-environment jsdom
 *
 * ConvertOfferForm (#2240): the loaded Convert form with its real hooks and cards. Boundaries
 * mocked: the invoices / Paperless / config / auto-itemize clients, the toast, and the two modals
 * (probes; they have their own tests).
 *
 * Mutations these tests catch:
 *  - a Refund due blocking Convert (D1) or Convert rendering `disabled` instead of aria-disabled;
 *  - a blocked submit focusing the wrong input (or none) for each problem;
 *  - success without the toast / onDone, or `notOffer` showing an error instead of reloading;
 *  - the save error box not receiving focus;
 *  - Cancel discarding changes without the dialog, or the dialog's Keep editing leaving;
 *  - `beforeunload` registered while the form is clean, or not removed once it is clean again;
 *  - the document card present without Paperless, Read amounts present without the AI reader.
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { createPortal } from 'react-dom';
import { MemoryRouter } from 'react-router-dom';
import type {
  AppConfigResponse,
  BudgetSource,
  InvoiceDeposit,
  InvoiceDetail,
  PaperlessStatusResponse,
} from '@cornerstone/shared';
import { LocaleProvider } from '../../contexts/LocaleContext.js';
import { groupForDocument } from '../../components/CostLineTable/costLineRows.js';
import type { CostLineRow } from '../../components/CostLineTable/types.js';
import { makeLinkedRow } from '../../test/costLineFixtures.js';
import { makeInvoiceDetail, makePayment } from '../../test/invoiceDetailFixtures.js';
import type * as InvoicesApiTypes from '../../lib/invoicesApi.js';
import type * as PaperlessApiTypes from '../../lib/paperlessApi.js';
import type * as ConfigApiTypes from '../../lib/configApi.js';
import type * as AutoItemizeApiTypes from '../../lib/invoiceAutoItemizeApi.js';
import type * as FormModule from './ConvertOfferForm.js';

const mockConvertQuotation = jest.fn<typeof InvoicesApiTypes.convertQuotation>();
const mockFetchInvoiceById = jest.fn<typeof InvoicesApiTypes.fetchInvoiceById>();
// The CostLineTable barrel (imported by `convertLines`) reaches many other API exports, so the
// clients keep their real exports and only the functions this form calls are replaced.
const actualInvoicesApi = await import('../../lib/invoicesApi.js');
const actualPaperlessApi = await import('../../lib/paperlessApi.js');
const actualConfigApi = await import('../../lib/configApi.js');
const actualAutoItemizeApi = await import('../../lib/invoiceAutoItemizeApi.js');
jest.unstable_mockModule('../../lib/invoicesApi.js', () => ({
  ...actualInvoicesApi,
  convertQuotation: mockConvertQuotation,
  fetchInvoiceById: mockFetchInvoiceById,
}));
const mockGetPaperlessStatus = jest.fn<typeof PaperlessApiTypes.getPaperlessStatus>();
jest.unstable_mockModule('../../lib/paperlessApi.js', () => ({
  ...actualPaperlessApi,
  getPaperlessStatus: mockGetPaperlessStatus,
}));
const mockFetchConfig = jest.fn<typeof ConfigApiTypes.fetchConfig>();
jest.unstable_mockModule('../../lib/configApi.js', () => ({
  ...actualConfigApi,
  fetchConfig: mockFetchConfig,
}));
const mockPreview = jest.fn<typeof AutoItemizeApiTypes.previewAutoItemize>();
jest.unstable_mockModule('../../lib/invoiceAutoItemizeApi.js', () => ({
  ...actualAutoItemizeApi,
  previewAutoItemize: mockPreview,
}));
const mockShowToast = jest.fn();
jest.unstable_mockModule('../../components/Toast/ToastContext.js', () => ({
  ToastProvider: ({ children }: { children: unknown }) => children,
  useToast: () => ({
    toasts: [],
    showToast: mockShowToast,
    showUndoToast: jest.fn(),
    dismissToast: jest.fn(),
  }),
}));

const REFUND = makePayment({ id: 'r1', amount: 2000, entryType: 'refund' });
jest.unstable_mockModule('./InvoiceDepositFormModal.js', () => ({
  InvoiceDepositFormModal: (props: {
    initialValues?: { amount?: string };
    onSaved: (deposit: InvoiceDeposit) => void;
    onClose: () => void;
  }) => (
    <div role="dialog" aria-label="refund-probe" data-amount={props.initialValues?.amount}>
      <button type="button" onClick={() => props.onSaved(REFUND)}>
        probe-save
      </button>
      <button type="button" onClick={props.onClose}>
        probe-close
      </button>
      {/* A real form in a portal: its submit bubbles through the React tree to the page form. */}
      {createPortal(
        <form aria-label="portaled-form" onSubmit={(event) => event.preventDefault()}>
          <button type="submit">probe-form-save</button>
        </form>,
        document.body,
      )}
    </div>
  ),
}));
jest.unstable_mockModule('../../components/invoices/InvoicePaperlessPickerModal.js', () => ({
  InvoicePaperlessPickerModal: (props: {
    onDocumentSelected: (doc: { id: number; title: string }) => void;
    onClose: () => void;
  }) => (
    <div role="dialog" aria-label="picker-probe">
      <button type="button" onClick={() => props.onDocumentSelected({ id: 7, title: 'Final.pdf' })}>
        probe-pick
      </button>
      <button type="button" onClick={props.onClose}>
        probe-picker-close
      </button>
    </div>
  ),
}));

const { ApiClientError } = await import('../../lib/apiClient.js');
let Form: (typeof FormModule)['ConvertOfferForm'];

const SOURCES = [{ id: 'src-1', name: 'Savings account' }] as unknown as BudgetSource[];
const ROOF = { type: 'work_item' as const, id: 'w1', label: 'Roof' };

function makeRows(): CostLineRow[] {
  return [
    makeLinkedRow({
      id: 'wb-1',
      invoiceBudgetLineId: 'ibl-1',
      description: 'Tiles',
      gross: 6000,
      target: ROOF,
    }),
    makeLinkedRow({
      id: 'wb-2',
      invoiceBudgetLineId: 'ibl-2',
      description: 'Labour',
      gross: 3000,
      target: ROOF,
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
    notes: null,
    ...over,
  });
}

function status(over: Partial<PaperlessStatusResponse> = {}): PaperlessStatusResponse {
  return {
    configured: true,
    reachable: true,
    error: null,
    paperlessUrl: 'https://paperless.example',
    filterTag: null,
    ...over,
  };
}
const config = (llmEnabled: boolean): AppConfigResponse =>
  ({ currency: 'EUR', vatRate: 0.19, autoItemizeEnabled: llmEnabled, llmEnabled }) as never;

const originalRects = HTMLElement.prototype.getClientRects;

interface Setup {
  invoice?: InvoiceDetail;
  rows?: CostLineRow[];
}

function renderForm({ invoice = makeOffer(), rows = makeRows() }: Setup = {}) {
  const onDone = jest.fn();
  const onNotOffer = jest.fn();
  const view = render(
    <MemoryRouter>
      <LocaleProvider>
        <Form
          invoice={invoice}
          rows={rows}
          groups={groupForDocument(rows)}
          budgetSources={SOURCES}
          onDone={onDone}
          onNotOffer={onNotOffer}
        />
      </LocaleProvider>
    </MemoryRouter>,
  );
  return { ...view, onDone, onNotOffer };
}

const amountInput = () => screen.getByTestId('convert-final-amount');
const convertButton = () => screen.getByTestId('convert-confirm');
const type = (testId: string, value: string) =>
  fireEvent.change(screen.getByTestId(testId), { target: { value } });

/** jsdom has no layout: only inputs outside the card surface count as shown. */
function showTableSurface() {
  HTMLElement.prototype.getClientRects = function (this: HTMLElement) {
    return (this.closest('[class*="cardSurface"]') === null ? [{}] : []) as unknown as DOMRectList;
  };
}

beforeEach(async () => {
  mockConvertQuotation.mockReset().mockResolvedValue({} as never);
  mockFetchInvoiceById.mockReset();
  mockGetPaperlessStatus.mockReset().mockResolvedValue(status({ configured: false }));
  mockFetchConfig.mockReset().mockResolvedValue(config(false));
  mockPreview.mockReset();
  mockShowToast.mockReset();
  ({ ConvertOfferForm: Form } = (await import('./ConvertOfferForm.js')) as typeof FormModule);
});

afterEach(() => {
  HTMLElement.prototype.getClientRects = originalRects;
});

describe('cards', () => {
  it('renders the details, cost lines and the sticky bar; no document card without Paperless', async () => {
    renderForm();
    await act(async () => undefined);
    expect(screen.getByTestId('convert-page')).toBeInTheDocument();
    expect(screen.getByTestId('convert-details')).toBeInTheDocument();
    expect(screen.getByTestId('convert-lines-card')).toBeInTheDocument();
    expect(screen.getByTestId('convert-actions')).toBeInTheDocument();
    expect(screen.queryByTestId('convert-document')).toBeNull();
    expect(screen.queryByTestId('convert-payments')).toBeNull();
    expect(screen.queryByTestId('convert-problems')).toBeNull();
    expect(screen.queryByTestId('convert-save-error')).toBeNull();
  });

  it('shows the document card when Paperless works, but Read amounts only with the AI reader', async () => {
    mockGetPaperlessStatus.mockResolvedValue(status());
    renderForm();
    expect(await screen.findByTestId('convert-document')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('convert-select-document'));
    fireEvent.click(screen.getByText('probe-pick'));
    expect(screen.getByTestId('convert-selected-document')).toHaveTextContent('Final.pdf');
    expect(screen.queryByTestId('convert-ai-prefill')).toBeNull();
  });

  it('shows Read amounts when Paperless and the AI reader are on', async () => {
    mockGetPaperlessStatus.mockResolvedValue(status());
    mockFetchConfig.mockResolvedValue(config(true));
    renderForm();
    await screen.findByTestId('convert-document');
    fireEvent.click(screen.getByTestId('convert-select-document'));
    fireEvent.click(screen.getByText('probe-pick'));
    await waitFor(() => expect(screen.getByTestId('convert-ai-prefill')).toBeInTheDocument());
  });

  it('shows the progress payments card only when the offer has payments', async () => {
    renderForm({ invoice: makeOffer({ deposits: [makePayment({ id: 'd1', amount: 2500 })] }) });
    await act(async () => undefined);
    expect(screen.getByTestId('convert-payments')).toBeInTheDocument();
    expect(screen.queryByTestId('convert-refund-due')).toBeNull();
  });

  it('shows an empty state instead of the table when the offer has no cost lines', async () => {
    renderForm({ rows: [] });
    await act(async () => undefined);
    expect(screen.getByTestId('convert-lines-empty')).toHaveTextContent(
      'This offer has no cost lines. Nothing to adjust.',
    );
    expect(screen.queryByTestId('convert-keep-all')).toBeNull();
    expect(screen.queryByTestId('convert-lines')).toBeNull();
  });
});

describe('cost lines card', () => {
  it('names each Keep checkbox "Keep as offered: <line>"', async () => {
    renderForm();
    await act(async () => undefined);
    expect(screen.getByTestId('convert-lines-keep-ibl-1')).toHaveAccessibleName(
      'Keep as offered: Tiles',
    );
    expect(screen.getByTestId('convert-lines-keep-mobile-ibl-2')).toHaveAccessibleName(
      'Keep as offered: Labour',
    );
  });

  it('Keep all offered amounts checks every line and Reset to proposal becomes aria-disabled', async () => {
    renderForm();
    await act(async () => undefined);
    const reset = screen.getByTestId('convert-reset-proposal');
    expect(reset).not.toHaveAttribute('aria-disabled');
    const keepAll = within(screen.getByTestId('convert-keep-all')).getByRole('checkbox');
    fireEvent.click(keepAll);
    expect(screen.getByTestId('convert-lines-keep-ibl-1')).toBeChecked();
    expect(screen.getByTestId('convert-lines-keep-ibl-2')).toBeChecked();
    expect(keepAll).toBeChecked();
    expect(reset).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(keepAll);
    expect(screen.getByTestId('convert-lines-keep-ibl-1')).not.toBeChecked();
  });

  it('one kept line leaves Keep all mixed', async () => {
    renderForm();
    await act(async () => undefined);
    fireEvent.click(screen.getByTestId('convert-lines-keep-ibl-1'));
    const keepAll = within(screen.getByTestId('convert-keep-all')).getByRole('checkbox');
    expect((keepAll as HTMLInputElement).indeterminate).toBe(true);
  });

  it('Reset to proposal restores an edited line', async () => {
    renderForm();
    await act(async () => undefined);
    type('convert-lines-input-ibl-1', '1');
    expect(screen.getByTestId('convert-lines-input-ibl-1')).toHaveValue(1);
    fireEvent.click(screen.getByTestId('convert-reset-proposal'));
    expect(screen.getByTestId('convert-lines-input-ibl-1')).toHaveValue(6000);
  });

  it('describes what is left to split in the three remainder states, on both surfaces', async () => {
    renderForm();
    await act(async () => undefined);
    // 10,000 final over 9,000 of lines: 1,000 is not yet split.
    expect(screen.getByTestId('convert-lines-remainder-all')).toHaveTextContent(
      '€1,000.00 not yet split',
    );
    expect(screen.getByTestId('convert-lines-remainder-mobile-all')).toHaveTextContent(
      '€1,000.00 not yet split',
    );
    type('convert-lines-input-ibl-1', '7000');
    expect(screen.getByTestId('convert-lines-remainder-all')).toHaveTextContent(
      'Nothing left to split',
    );
    type('convert-lines-input-ibl-1', '7500');
    expect(screen.getByTestId('convert-lines-remainder-all')).toHaveTextContent(
      '€500.00 more than the final amount',
    );
  });

  it('a status line under the bar shows the final amount and the final payment', async () => {
    renderForm({ invoice: makeOffer({ deposits: [makePayment({ id: 'd1', amount: 2500 })] }) });
    await act(async () => undefined);
    expect(screen.getByTestId('convert-actions')).toHaveTextContent(
      'Final €10,000.00 · Final payment €7,500.00',
    );
  });
});

describe('blocked submit', () => {
  it('keeps Convert aria-disabled, not disabled, and lists the problems', async () => {
    renderForm();
    await act(async () => undefined);
    expect(convertButton()).not.toHaveAttribute('aria-disabled');
    type('convert-final-amount', '');
    expect(convertButton()).toHaveAttribute('aria-disabled', 'true');
    expect(convertButton()).not.toBeDisabled();
    const problems = screen.getByTestId('convert-problems');
    expect(problems).toHaveTextContent('Enter a final amount.');
    expect(convertButton().getAttribute('aria-describedby')).toContain(problems.id);
  });

  it('focuses the amount when it is the first problem, and sends nothing', async () => {
    renderForm();
    await act(async () => undefined);
    type('convert-final-amount', '');
    fireEvent.click(convertButton());
    await waitFor(() => expect(amountInput()).toHaveFocus());
    expect(mockConvertQuotation).not.toHaveBeenCalled();
    expect(amountInput()).toHaveAttribute('aria-invalid', 'true');
  });

  it('focuses the date when the date is the first problem', async () => {
    renderForm();
    await act(async () => undefined);
    type('convert-date', '');
    fireEvent.click(convertButton());
    await waitFor(() => expect(screen.getByTestId('convert-date')).toHaveFocus());
  });

  it('focuses the due date when the due date is the first problem', async () => {
    renderForm();
    await act(async () => undefined);
    type('convert-due-date', '2020-01-01');
    fireEvent.click(convertButton());
    await waitFor(() => expect(screen.getByTestId('convert-due-date')).toHaveFocus());
  });

  it('focuses the first invalid cost line', async () => {
    showTableSurface();
    renderForm();
    await act(async () => undefined);
    type('convert-lines-input-ibl-2', '0');
    fireEvent.click(convertButton());
    await waitFor(() => expect(screen.getByTestId('convert-lines-input-ibl-2')).toHaveFocus());
    expect(screen.getByTestId('convert-problems')).toHaveTextContent('Fix the highlighted lines.');
  });

  it('focuses the first editable cost line when the lines are over the final amount', async () => {
    showTableSurface();
    renderForm();
    await act(async () => undefined);
    type('convert-lines-input-ibl-1', '20000');
    fireEvent.click(convertButton());
    await waitFor(() => expect(screen.getByTestId('convert-lines-input-ibl-1')).toHaveFocus());
    expect(screen.getByTestId('convert-problems')).toHaveTextContent(
      'Lower the proposed amounts to the final amount.',
    );
    expect(mockConvertQuotation).not.toHaveBeenCalled();
  });

  it('announces the problems in the bar once a submit was attempted', async () => {
    renderForm();
    await act(async () => undefined);
    type('convert-final-amount', '');
    expect(screen.getByTestId('convert-actions-status')).toBeEmptyDOMElement();
    fireEvent.click(convertButton());
    await waitFor(() =>
      expect(screen.getByTestId('convert-actions-status')).toHaveTextContent(
        'Enter a final amount.',
      ),
    );
  });
});

describe('converting', () => {
  it('posts the conversion, shows the success toast and leaves', async () => {
    const { onDone, onNotOffer } = renderForm();
    await act(async () => undefined);
    fireEvent.click(convertButton());
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(mockConvertQuotation).toHaveBeenCalledWith(
      'off-1',
      expect.objectContaining({ amount: 10000, status: 'pending', budgetLines: [] }),
    );
    expect(mockShowToast).toHaveBeenCalledWith('success', 'Offer converted to a final invoice.');
    expect(onNotOffer).not.toHaveBeenCalled();
  });

  it('addresses edited lines by their invoice budget line id', async () => {
    renderForm();
    await act(async () => undefined);
    type('convert-lines-input-ibl-1', '5000');
    fireEvent.click(screen.getByTestId('convert-lines-keep-ibl-2'));
    fireEvent.click(convertButton());
    await waitFor(() => expect(mockConvertQuotation).toHaveBeenCalled());
    expect(mockConvertQuotation.mock.calls[0]![1].budgetLines).toEqual([
      { id: 'ibl-1', itemizedAmount: 5000 },
    ]);
  });

  it('succeeds with a Refund due: the shortfall never blocks (D1)', async () => {
    const { onDone } = renderForm({
      invoice: makeOffer({
        deposits: [makePayment({ id: 'd1', amount: 12000, budgetSourceId: 'src-1' })],
      }),
    });
    await act(async () => undefined);
    expect(screen.getByTestId('convert-refund-due')).toBeInTheDocument();
    expect(convertButton()).not.toHaveAttribute('aria-disabled');
    expect(convertButton().getAttribute('aria-describedby')).toBe(
      screen.getByTestId('convert-refund-due').id,
    );
    fireEvent.click(convertButton());
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(mockConvertQuotation).toHaveBeenCalledTimes(1);
  });

  it('sends the selected document and shows the busy state while the request runs', async () => {
    mockGetPaperlessStatus.mockResolvedValue(status());
    let resolve: (value: never) => void = () => undefined;
    mockConvertQuotation.mockReturnValue(new Promise((r) => (resolve = r)));
    const { onDone } = renderForm();
    await screen.findByTestId('convert-document');
    fireEvent.click(screen.getByTestId('convert-select-document'));
    fireEvent.click(screen.getByText('probe-pick'));
    fireEvent.click(convertButton());
    await waitFor(() => expect(convertButton()).toHaveAttribute('aria-busy', 'true'));
    expect(convertButton()).toHaveTextContent('Converting…');
    expect(convertButton()).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByTestId('convert-page')).toHaveAttribute('aria-busy', 'true');
    expect(amountInput()).toBeDisabled();
    expect(screen.getByTestId('convert-select-document')).toBeDisabled();
    expect(screen.getByTestId('convert-actions-status')).toHaveTextContent('Converting the offer…');
    expect(mockConvertQuotation.mock.calls[0]![1]).toMatchObject({ paperlessDocumentId: 7 });
    await act(async () => {
      resolve({} as never);
    });
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it('a second click while converting sends nothing and moves no focus', async () => {
    let resolve: (value: never) => void = () => undefined;
    mockConvertQuotation.mockReturnValue(new Promise((r) => (resolve = r)));
    const { onDone } = renderForm();
    await act(async () => undefined);
    fireEvent.click(convertButton());
    await waitFor(() => expect(convertButton()).toHaveAttribute('aria-busy', 'true'));
    convertButton().focus();
    fireEvent.click(convertButton());
    await act(async () => undefined);
    expect(mockConvertQuotation).toHaveBeenCalledTimes(1);
    expect(convertButton()).toHaveFocus();
    await act(async () => {
      resolve({} as never);
    });
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
  });

  it('INVOICE_NOT_QUOTATION asks the page to reload the record, without a toast or an error', async () => {
    mockConvertQuotation.mockRejectedValue(
      new ApiClientError(409, { code: 'INVOICE_NOT_QUOTATION', message: 'x' } as never),
    );
    const { onDone, onNotOffer } = renderForm();
    await act(async () => undefined);
    fireEvent.click(convertButton());
    await waitFor(() => expect(onNotOffer).toHaveBeenCalledTimes(1));
    expect(onDone).not.toHaveBeenCalled();
    expect(mockShowToast).not.toHaveBeenCalled();
    expect(screen.queryByTestId('convert-save-error')).toBeNull();
  });

  it('a failed save keeps the form, shows the error and moves focus to it', async () => {
    mockConvertQuotation.mockRejectedValue(new Error('offline'));
    const { onDone } = renderForm();
    await act(async () => undefined);
    type('convert-invoice-number', 'R-9');
    fireEvent.click(convertButton());
    const box = await screen.findByTestId('convert-save-error');
    expect(box).toHaveTextContent('The offer could not be converted. Nothing was changed.');
    await waitFor(() => expect(box).toHaveFocus());
    expect(onDone).not.toHaveBeenCalled();
    expect(mockShowToast).not.toHaveBeenCalled();
    expect(screen.getByTestId('convert-invoice-number')).toHaveValue('R-9');
    expect(screen.getByTestId('convert-actions-status')).toHaveTextContent(
      'The offer could not be converted. Nothing was changed.',
    );
  });
});

describe('submits from dialogs', () => {
  it('a submit inside the portaled refund dialog never converts the offer', async () => {
    const { onDone } = renderForm({
      invoice: makeOffer({
        deposits: [makePayment({ id: 'd1', amount: 12000, budgetSourceId: 'src-1' })],
      }),
    });
    await act(async () => undefined);
    fireEvent.click(screen.getByTestId('convert-add-refund'));
    fireEvent.click(screen.getByText('probe-form-save'));
    await act(async () => undefined);
    expect(mockConvertQuotation).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
    expect(mockShowToast).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'refund-probe' })).toBeInTheDocument();
  });

  it('the Convert button itself still submits', async () => {
    const { onDone } = renderForm();
    await act(async () => undefined);
    fireEvent.click(convertButton());
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(mockConvertQuotation).toHaveBeenCalledTimes(1);
  });
});

describe('Cancel and unsaved changes', () => {
  it('leaves at once when nothing changed', async () => {
    const { onDone } = renderForm();
    await act(async () => undefined);
    fireEvent.click(screen.getByTestId('convert-cancel'));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('asks before discarding changes: Keep editing stays, Discard leaves', async () => {
    const { onDone } = renderForm();
    await act(async () => undefined);
    type('convert-notes', 'changed');
    fireEvent.click(screen.getByTestId('convert-cancel'));
    expect(onDone).not.toHaveBeenCalled();
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep editing' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByTestId('convert-notes')).toHaveValue('changed');
    fireEvent.click(screen.getByTestId('convert-cancel'));
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Discard' }),
    );
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('a selected document counts as a change', async () => {
    mockGetPaperlessStatus.mockResolvedValue(status());
    const { onDone } = renderForm();
    await screen.findByTestId('convert-document');
    fireEvent.click(screen.getByTestId('convert-select-document'));
    fireEvent.click(screen.getByText('probe-pick'));
    fireEvent.click(screen.getByTestId('convert-cancel'));
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('registers beforeunload only while there are unsaved changes', async () => {
    renderForm();
    await act(async () => undefined);
    const fire = () => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(fire()).toBe(false);
    type('convert-notes', 'changed');
    expect(fire()).toBe(true);
    type('convert-notes', '');
    expect(fire()).toBe(false);
  });
});

describe('refund', () => {
  const withDeposit = () =>
    makeOffer({
      deposits: [makePayment({ id: 'd1', amount: 12000, budgetSourceId: 'src-1' })],
    });

  it('opens the refund modal prefilled with the amount due', async () => {
    renderForm({ invoice: withDeposit() });
    await act(async () => undefined);
    fireEvent.click(screen.getByTestId('convert-add-refund'));
    expect(screen.getByRole('dialog', { name: 'refund-probe' })).toHaveAttribute(
      'data-amount',
      '2000.00',
    );
  });

  it('saving the refund settles the block, confirms it and keeps the entered values', async () => {
    mockFetchInvoiceById.mockResolvedValue(
      makeOffer({ deposits: [...withDeposit().deposits, REFUND] }),
    );
    renderForm({ invoice: withDeposit() });
    await act(async () => undefined);
    type('convert-notes', 'my note');
    fireEvent.click(screen.getByTestId('convert-add-refund'));
    fireEvent.click(screen.getByText('probe-save'));
    const recorded = await screen.findByTestId('convert-refund-recorded');
    expect(recorded).toHaveTextContent('The refund of €2,000.00 is recorded.');
    expect(screen.queryByTestId('convert-refund-due')).toBeNull();
    expect(screen.getByTestId('convert-notes')).toHaveValue('my note');
    expect(convertButton().getAttribute('aria-describedby')).toBeNull();
  });
});
