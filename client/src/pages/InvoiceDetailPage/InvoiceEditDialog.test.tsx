/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { InvoiceDetail } from '@cornerstone/shared';
import { installMatchMedia } from '../../test/matchMediaControl.js';
import type { MatchMediaControl } from '../../test/matchMediaControl.js';
import { makeInvoiceDetail } from '../../test/invoiceDetailFixtures.js';
import type * as VendorsApiTypes from '../../lib/vendorsApi.js';
import type * as DialogModule from './InvoiceEditDialog.js';
import type * as ApiClientModule from '../../lib/apiClient.js';

jest.unstable_mockModule('../../contexts/LocaleContext.js', () => {
  const localeValue = {
    locale: 'en',
    resolvedLocale: 'en',
    currency: 'EUR',
    vatRate: 0.19,
    setLocale: jest.fn(),
    syncWithServer: jest.fn(),
  };
  return {
    LocaleProvider: ({ children }: { children: unknown }) => children,
    useLocale: () => localeValue,
  };
});

const mockUpdateInvoice =
  jest.fn<(vendorId: string, id: string, body: Record<string, unknown>) => Promise<unknown>>();
jest.unstable_mockModule('../../lib/invoicesApi.js', () => ({
  updateInvoice: mockUpdateInvoice,
  createInvoice: jest.fn(),
}));

const mockSearchCompanies = jest.fn<typeof VendorsApiTypes.searchCompanies>();
jest.unstable_mockModule('../../lib/vendorsApi.js', () => ({
  searchCompanies: mockSearchCompanies,
  fetchVendor: jest.fn(() => Promise.resolve({ id: 'v-1', name: 'Example Roofing Ltd' })),
  createVendor: jest.fn(),
}));
jest.unstable_mockModule('../../lib/tradesApi.js', () => ({
  fetchTrades: jest.fn(() => Promise.resolve({ trades: [] })),
}));
jest.unstable_mockModule('../../hooks/useTrades.js', () => ({
  useTrades: () => ({ trades: [], isLoading: false, isInitialLoading: false, error: null }),
}));
jest.unstable_mockModule('../../hooks/useDocumentIntegration.js', () => ({
  useDocumentIntegration: () => ({
    loaded: false,
    status: null,
    available: false,
    llmEnabled: false,
  }),
}));

let InvoiceEditDialog: (typeof DialogModule)['InvoiceEditDialog'];
let ApiClientError: (typeof ApiClientModule)['ApiClientError'];
let media: MatchMediaControl;

const onSaved = jest.fn<() => Promise<unknown>>();
const onClose = jest.fn();

function renderDialog(over: Partial<InvoiceDetail> = {}) {
  return render(
    <MemoryRouter>
      <InvoiceEditDialog invoice={makeInvoiceDetail(over)} onSaved={onSaved} onClose={onClose} />
    </MemoryRouter>,
  );
}

const field = (label: RegExp | string) => screen.getByLabelText(label) as HTMLInputElement;
const save = () => screen.getByTestId('invoice-edit-form-save');

beforeEach(async () => {
  mockUpdateInvoice.mockReset().mockResolvedValue({});
  mockSearchCompanies
    .mockReset()
    .mockResolvedValue([{ id: 'v-2', name: 'Other Tiling Co' }] as never);
  onSaved.mockReset().mockResolvedValue(undefined);
  onClose.mockReset();
  media = installMatchMedia({ '(min-width: 768px)': true });
  ({ InvoiceEditDialog } = (await import('./InvoiceEditDialog.js')) as typeof DialogModule);
  ({ ApiClientError } = (await import('../../lib/apiClient.js')) as typeof ApiClientModule);
});

afterEach(() => {
  media.restore();
});

describe('InvoiceEditDialog', () => {
  it('is one dialog titled "Edit details", prefilled from the record', () => {
    renderDialog({
      invoiceNumber: 'INV-9',
      amount: 1234.5,
      date: '2026-05-01T00:00:00.000Z',
      dueDate: '2026-06-01',
      status: 'paid',
      notes: 'Sample note',
    });

    expect(screen.getByRole('dialog', { name: 'Edit details' })).toBeInTheDocument();
    expect(field(/^Number/).value).toBe('INV-9');
    expect(field(/^Amount/).value).toBe('1234.5');
    expect(field(/^Date/).value).toBe('2026-05-01');
    expect(field(/^Due date/).value).toBe('2026-06-01');
    expect((screen.getByLabelText('Status') as HTMLSelectElement).value).toBe('paid');
    expect((screen.getByLabelText('Notes') as HTMLTextAreaElement).value).toBe('Sample note');
    expect(screen.getByText('Example Roofing Ltd')).toBeInTheDocument();
  });

  it('lists the invoice statuses with their translated labels, without Offer', () => {
    renderDialog();
    const options = Array.from((screen.getByLabelText('Status') as HTMLSelectElement).options).map(
      (o) => o.textContent,
    );
    expect(options).toEqual(['To pay', 'Paid', 'Submitted']);
  });

  it('edits an offer without a Status field', () => {
    renderDialog({ status: 'quotation' });
    expect(screen.queryByLabelText('Status')).toBeNull();
  });

  it('shows blank optional fields for a record without number, due date and notes', () => {
    renderDialog({ invoiceNumber: null, dueDate: null, notes: null });
    expect(field(/^Number/).value).toBe('');
    expect(field(/^Due date/).value).toBe('');
    expect((screen.getByLabelText('Notes') as HTMLTextAreaElement).value).toBe('');
  });

  it('offers neither a document row, a task or purchase row nor Add another', () => {
    renderDialog();
    expect(screen.queryByLabelText('Start from a document')).toBeNull();
    expect(screen.queryByLabelText('For task / purchase')).toBeNull();
    expect(screen.queryByTestId('invoice-edit-form-add-another')).toBeNull();
  });

  it('saves every edited field with the original company in the path and the picked one in the body, then closes', async () => {
    const user = userEvent.setup();
    renderDialog({ id: 'inv-5', vendorId: 'v-1' });
    await user.clear(field(/^Number/));
    await user.type(field(/^Number/), '  INV-NEW  ');
    await user.clear(field(/^Amount/));
    await user.type(field(/^Amount/), '2500.75');
    fireEvent.change(field(/^Date/), { target: { value: '2026-02-02' } });
    fireEvent.change(field(/^Due date/), { target: { value: '2026-03-03' } });
    await user.selectOptions(screen.getByLabelText('Status'), 'claimed');
    await user.type(screen.getByLabelText('Notes'), '  fresh note  ');
    await user.click(screen.getByRole('button', { name: 'Clear selection' }));
    await user.type(screen.getByLabelText(/^Company/), 'Oth');
    await user.click(await screen.findByRole('option', { name: /Other Tiling Co/ }));

    await user.click(save());

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(mockUpdateInvoice).toHaveBeenCalledWith('v-1', 'inv-5', {
      invoiceNumber: 'INV-NEW',
      amount: 2500.75,
      date: '2026-02-02',
      dueDate: '2026-03-03',
      status: 'claimed',
      notes: 'fresh note',
      vendorId: 'v-2',
    });
  });

  it('refreshes the page before closing the dialog', async () => {
    const user = userEvent.setup();
    const order: string[] = [];
    onSaved.mockImplementation(() => {
      order.push('saved');
      return Promise.resolve();
    });
    onClose.mockImplementation(() => {
      order.push('closed');
    });
    renderDialog();

    await user.click(save());

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(order).toEqual(['saved', 'closed']);
  });

  it('sends null for a blank number, due date and notes', async () => {
    const user = userEvent.setup();
    renderDialog({ invoiceNumber: 'INV-1', dueDate: '2026-08-01', notes: 'x' });
    await user.clear(field(/^Number/));
    await user.clear(field(/^Due date/));
    await user.clear(screen.getByLabelText('Notes'));

    await user.click(save());

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(mockUpdateInvoice.mock.calls[0]![2]).toMatchObject({
      invoiceNumber: null,
      dueDate: null,
      notes: null,
    });
  });

  it('a non-positive amount shows the amount message and sends nothing', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.clear(field(/^Amount/));
    await user.type(field(/^Amount/), '-5');

    await user.click(save());

    expect(await screen.findByText('Enter an amount greater than 0.')).toBeVisible();
    expect(mockUpdateInvoice).not.toHaveBeenCalled();
  });

  it('clearing the company shows the company message and sends nothing', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole('button', { name: 'Clear selection' }));

    await user.click(save());

    expect(await screen.findByText('Choose a company.')).toBeVisible();
    expect(mockUpdateInvoice).not.toHaveBeenCalled();
  });

  it('an empty date shows the date message and sends nothing', async () => {
    const user = userEvent.setup();
    renderDialog();
    fireEvent.change(field(/^Date/), { target: { value: '' } });

    await user.click(save());

    expect(await screen.findByText('Enter a date.')).toBeVisible();
    expect(mockUpdateInvoice).not.toHaveBeenCalled();
  });

  it('while saving: Save shows Saving, inputs are read-only, nothing is sent twice, Escape does nothing', async () => {
    const user = userEvent.setup();
    let finish: () => void = () => undefined;
    mockUpdateInvoice.mockReturnValue(
      new Promise((resolve) => {
        finish = () => resolve({});
      }),
    );
    renderDialog();

    await user.click(save());
    const busy = await screen.findByRole('button', { name: /Saving/ });

    expect(busy).toHaveAttribute('aria-disabled', 'true');
    expect(field(/^Number/)).toHaveAttribute('readonly');
    await user.click(busy);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(mockUpdateInvoice).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    finish();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('Cancel closes a clean form without saving', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByTestId('invoice-edit-form-cancel'));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockUpdateInvoice).not.toHaveBeenCalled();
  });

  it('asks before discarding edits, and discarding closes without saving', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.type(field(/^Number/), 'X');

    await user.click(screen.getByTestId('invoice-edit-form-cancel'));
    expect(onClose).not.toHaveBeenCalled();
    await user.click(await screen.findByTestId('invoice-edit-form-discard-confirm'));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockUpdateInvoice).not.toHaveBeenCalled();
  });

  it('blurs the amount field on wheel so scrolling does not change it', () => {
    renderDialog();
    const amount = field(/^Amount/);
    amount.focus();
    expect(amount).toHaveFocus();
    fireEvent.wheel(amount);
    expect(amount).not.toHaveFocus();
  });

  describe('save errors keep the dialog open', () => {
    async function submitWith(error: unknown) {
      const user = userEvent.setup();
      mockUpdateInvoice.mockRejectedValue(error);
      renderDialog();
      await user.click(save());
    }

    it('a 404 NOT_FOUND shows the company-not-found message under Company', async () => {
      await submitWith(new ApiClientError(404, { code: 'NOT_FOUND', message: 'x' }));
      expect(await screen.findByText('That company no longer exists.')).toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();
      expect(onSaved).not.toHaveBeenCalled();
    });

    it('ITEMIZED_SUM_EXCEEDS_INVOICE shows the itemized message under Amount, never the server prose', async () => {
      await submitWith(
        new ApiClientError(400, {
          code: 'ITEMIZED_SUM_EXCEEDS_INVOICE',
          message: 'raw prose',
          details: { itemizedTotal: 1800 },
        }),
      );
      expect(
        await screen.findByText(
          "The amount can't be lower than €1,800.00, the total of the cost lines on it. Lower the cost lines first.",
        ),
      ).toBeInTheDocument();
      expect(screen.queryByText('raw prose')).toBeNull();
      expect(onClose).not.toHaveBeenCalled();
    });

    it('any other API error shows the translated text, never the server prose', async () => {
      await submitWith(
        new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'SERVER PROSE' }),
      );
      const alert = await screen.findByRole('alert');
      expect(alert).not.toHaveTextContent('SERVER PROSE');
      expect(alert.textContent?.length).toBeGreaterThan(0);
      expect(onClose).not.toHaveBeenCalled();
    });

    it('a refresh that fails after a saved edit still closes the dialog', async () => {
      const user = userEvent.setup();
      onSaved.mockRejectedValue(new Error('refresh failed'));
      renderDialog();

      await user.click(save());

      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
      expect(mockUpdateInvoice).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('a non-API failure shows the generic save error', async () => {
      await submitWith(new Error('offline'));
      expect(await screen.findByRole('alert')).toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();
    });

    it('a failed save leaves the form usable and the next attempt succeeds', async () => {
      const user = userEvent.setup();
      mockUpdateInvoice.mockRejectedValueOnce(new Error('offline'));
      renderDialog();
      await user.click(save());
      await screen.findByRole('alert');

      await user.click(save());

      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });
});
