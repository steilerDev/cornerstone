/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ApiClientError } from '../../lib/apiClient.js';
import type { ErrorCode } from '@cornerstone/shared';
import { installMatchMedia } from '../../test/matchMediaControl.js';
import type { MatchMediaControl } from '../../test/matchMediaControl.js';
import { makeCostLineRow } from '../../test/costLineFixtures.js';
import type * as InvoicesApiTypes from '../../lib/invoicesApi.js';
import type * as InvoiceLinesTypes from '../../lib/invoiceBudgetLinesApi.js';
import type * as FormTypes from './LinkInvoiceForm.js';
import type * as RowsTypes from '../CostLineTable/costLineRows.js';
import type { CostLineRow } from '../CostLineTable/types.js';

jest.unstable_mockModule('../../contexts/LocaleContext.js', () => ({
  useLocale: () => ({
    locale: 'en',
    resolvedLocale: 'en',
    currency: 'EUR',
    vatRate: 0.19,
    setLocale: jest.fn(),
    syncWithServer: jest.fn(),
  }),
  RESOLVED_LOCALES: ['en', 'de'],
  LocaleProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const mockFetchInvoices = jest.fn<typeof InvoicesApiTypes.fetchAllInvoices>();
jest.unstable_mockModule('../../lib/invoicesApi.js', () => ({
  fetchAllInvoices: mockFetchInvoices,
}));
const mockCreateLine = jest.fn<typeof InvoiceLinesTypes.createInvoiceBudgetLine>();
jest.unstable_mockModule('../../lib/invoiceBudgetLinesApi.js', () => ({
  createInvoiceBudgetLine: mockCreateLine,
  fetchInvoiceBudgetLines: jest.fn(),
  deleteInvoiceBudgetLine: jest.fn(),
  editAndMoveBudgetLine: jest.fn(),
}));

const invoice = (over: Record<string, unknown>) =>
  ({
    id: 'inv-1',
    vendorName: 'Acme Supply',
    invoiceNumber: '17',
    status: 'pending',
    remainingAmount: 50,
    ...over,
  }) as never;

const INVOICES = [
  invoice({ id: 'inv-1', remainingAmount: 50 }),
  invoice({ id: 'inv-2', invoiceNumber: '18', remainingAmount: 0 }),
  invoice({ id: 'inv-3', invoiceNumber: '19', remainingAmount: -12.5 }),
  invoice({ id: 'inv-4', invoiceNumber: null, vendorName: null, status: 'quotation' }),
];

describe('LinkInvoiceForm', () => {
  let Form: typeof FormTypes;
  let Rows: typeof RowsTypes;
  let media: MatchMediaControl;
  const onSaved = jest.fn<(title: string) => void>();
  const onClose = jest.fn<() => void>();

  beforeEach(async () => {
    mockFetchInvoices.mockReset();
    mockCreateLine.mockReset();
    onSaved.mockReset();
    onClose.mockReset();
    mockFetchInvoices.mockResolvedValue({ invoices: INVOICES } as never);
    mockCreateLine.mockResolvedValue({} as never);
    media = installMatchMedia({ '(min-width: 768px)': true });
    if (!Form) {
      Form = await import('./LinkInvoiceForm.js');
      Rows = await import('../CostLineTable/costLineRows.js');
    }
  });

  afterEach(() => {
    media.restore();
    delete document.documentElement.dataset.scrollLocked;
  });

  function renderForm(row: CostLineRow = makeCostLineRow()) {
    render(
      <MemoryRouter>
        <Form.LinkInvoiceForm row={row} onSaved={onSaved} onClose={onClose} />
      </MemoryRouter>,
    );
  }

  const amount = () => screen.getByLabelText(/^Amount/) as HTMLInputElement;
  const save = () => screen.getByTestId('link-invoice-form-save');
  const invoiceInput = () => screen.getByLabelText(/^Offer or invoice/);

  it('D-20: prefills the itemized amount with the line gross, not net', () => {
    // A realistic estimate built from the stored line: net 100 entered Net, VAT 0.19.
    const line = {
      id: 'bl-net',
      description: 'Net estimate',
      plannedAmount: 100,
      includesVat: false,
      quantity: null,
      unit: null,
      unitPrice: null,
      confidence: 'own_estimate',
      invoiceLink: null,
      budgetCategory: null,
      budgetSource: null,
      vendor: null,
    };
    const row = Rows.rowFromBudgetLine(
      line as never,
      'work_item',
      { type: 'work_item', id: 'wi-1', label: 'Lay floors', area: null },
      0.19,
    );
    expect(row.net).toBe(100);
    expect(row.gross).toBe(119);

    renderForm(row);

    expect(amount()).toHaveValue(119);
    expect(amount().value).toBe('119');
    expect(amount().value).not.toBe('100');
  });

  it("offers the offers and invoices of the line's company with how much is left to split", async () => {
    const user = userEvent.setup();
    renderForm(makeCostLineRow({ vendorId: 'v1' }));
    await user.click(invoiceInput());

    const first = await screen.findByRole('option', { name: /Acme Supply · 17/ });
    expect(first).toHaveTextContent('€50.00 left to split');
    expect(screen.getByRole('option', { name: /Acme Supply · 18/ })).toHaveTextContent(
      'Fully split',
    );
    expect(screen.getByRole('option', { name: /Acme Supply · 19/ })).toHaveTextContent(
      'Over by €12.50',
    );
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toContainEqual(
      expect.stringMatching(/^offer/),
    );
    expect(mockFetchInvoices).toHaveBeenCalledWith(
      { pageSize: 50, vendorId: 'v1' },
      expect.objectContaining({ signal: expect.anything() }),
    );
  });

  it('searches without a leading # and without a company filter when the line has none', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(invoiceInput(), '#17');
    await waitFor(() =>
      expect(mockFetchInvoices.mock.calls.map((call) => call[0])).toContainEqual({
        q: '17',
        pageSize: 50,
      }),
    );
  });

  it('shows the empty message when there are no offers or invoices', async () => {
    const user = userEvent.setup();
    mockFetchInvoices.mockResolvedValue({ invoices: [] } as never);
    renderForm();
    await user.type(invoiceInput(), 'zz');
    expect(await screen.findByText('There are no offers or invoices yet.')).toBeInTheDocument();
  });

  it('links the line with the typed amount and reports the invoice title', async () => {
    const user = userEvent.setup();
    renderForm(makeCostLineRow({ id: 'bl-7' }));
    await user.click(invoiceInput());
    await user.click(await screen.findByRole('option', { name: /Acme Supply · 17/ }));
    expect(
      await screen.findByText('€50.00 of this offer or invoice is not split yet.'),
    ).toBeInTheDocument();
    await user.clear(amount());
    await user.type(amount(), '40');
    await user.click(save());

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('Acme Supply · 17'));
    expect(mockCreateLine).toHaveBeenCalledWith('inv-1', {
      invoiceId: 'inv-1',
      workItemBudgetId: 'bl-7',
      itemizedAmount: 40,
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('links a purchase line through householdItemBudgetId', async () => {
    const user = userEvent.setup();
    renderForm(makeCostLineRow({ id: 'bl-h', lineType: 'household_item' }));
    await user.click(invoiceInput());
    await user.click(await screen.findByRole('option', { name: /Acme Supply · 17/ }));
    await user.click(save());
    await waitFor(() => expect(mockCreateLine).toHaveBeenCalledTimes(1));
    expect(mockCreateLine.mock.calls[0]![1]).toEqual({
      invoiceId: 'inv-1',
      householdItemBudgetId: 'bl-h',
      itemizedAmount: 595,
    });
  });

  it('does not hint a negative remainder and clears the hint when the pick is cleared', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(invoiceInput());
    await user.click(await screen.findByRole('option', { name: /Acme Supply · 19/ }));
    expect(
      await screen.findByText('€0.00 of this offer or invoice is not split yet.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /clear/i }));
    expect(screen.queryByText(/is not split yet/)).toBeNull();
  });

  it('asks for an invoice and a positive amount', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.clear(amount());
    await user.type(amount(), '0');
    await user.click(save());

    expect(await screen.findByText('Pick an offer or invoice.')).toBeInTheDocument();
    expect(screen.getByText('Enter an amount above 0.')).toBeInTheDocument();
    expect(mockCreateLine).not.toHaveBeenCalled();
  });

  it.each<[ErrorCode, number, RegExp]>([
    ['ITEMIZED_SUM_EXCEEDS_INVOICE', 409, /would be more than this offer or invoice/],
    ['BUDGET_LINE_ALREADY_LINKED', 409, /already linked to an offer or invoice/],
  ])('maps %s onto its field', async (code, status, message) => {
    const user = userEvent.setup();
    mockCreateLine.mockRejectedValue(new ApiClientError(status, { code, message: 'server text' }));
    renderForm();
    await user.click(invoiceInput());
    await user.click(await screen.findByRole('option', { name: /Acme Supply · 17/ }));
    await user.click(save());

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('server text');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows other failures as a banner', async () => {
    const user = userEvent.setup();
    mockCreateLine.mockRejectedValue(
      new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'm' }),
    );
    renderForm();
    await user.click(invoiceInput());
    await user.click(await screen.findByRole('option', { name: /Acme Supply · 17/ }));
    await user.click(save());
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('closes through Cancel', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByTestId('link-invoice-form-cancel'));
    expect(onClose).toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });
});
