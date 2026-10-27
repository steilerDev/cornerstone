/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { InvoiceDetail } from '@cornerstone/shared';
import { LocaleProvider } from '../../contexts/LocaleContext.js';
import type * as ModalModule from './InvoiceEditModal.js';
import type * as ApiClientModule from '../../lib/apiClient.js';
import { makeInvoiceDetail } from '../../test/invoiceDetailFixtures.js';

const mockUpdateInvoice =
  jest.fn<(vendorId: string, id: string, body: Record<string, unknown>) => Promise<unknown>>();
jest.unstable_mockModule('../../lib/invoicesApi.js', () => ({ updateInvoice: mockUpdateInvoice }));

interface PickerProps {
  id?: string;
  value: string;
  selectedLabel?: string;
  disabled?: boolean;
  onChange: (id: string) => void;
  onCreatingChange?: (creating: boolean) => void;
}
let pickerProps: PickerProps | null = null;
jest.unstable_mockModule('../../components/EntityPicker/EntityPicker.js', () => ({
  EntityPicker: (props: PickerProps) => {
    pickerProps = props;
    return (
      <div data-testid="company-picker" data-value={props.value} data-label={props.selectedLabel}>
        <button type="button" onClick={() => props.onChange('v-2')}>
          pick-company
        </button>
        <button type="button" onClick={() => props.onChange('')}>
          clear-company
        </button>
        <button type="button" onClick={() => props.onCreatingChange?.(true)}>
          start-create
        </button>
        <button type="button" onClick={() => props.onCreatingChange?.(false)}>
          end-create
        </button>
      </div>
    );
  },
}));

let InvoiceEditModal: (typeof ModalModule)['InvoiceEditModal'];
let ApiClientError: (typeof ApiClientModule)['ApiClientError'];

const onSaved = jest.fn<() => Promise<unknown>>();
const onClose = jest.fn();

function renderModal(over: Partial<InvoiceDetail> = {}) {
  return render(
    <MemoryRouter>
      <LocaleProvider>
        <InvoiceEditModal invoice={makeInvoiceDetail(over)} onSaved={onSaved} onClose={onClose} />
      </LocaleProvider>
    </MemoryRouter>,
  );
}

const field = (label: RegExp | string) => screen.getByLabelText(label) as HTMLInputElement;
const save = () => screen.getByRole('button', { name: /^Save/ });

beforeEach(async () => {
  mockUpdateInvoice.mockReset().mockResolvedValue({});
  onSaved.mockReset().mockResolvedValue(undefined);
  onClose.mockReset();
  pickerProps = null;
  ({ InvoiceEditModal } = (await import('./InvoiceEditModal.js')) as typeof ModalModule);
  ({ ApiClientError } = (await import('../../lib/apiClient.js')) as typeof ApiClientModule);
});

describe('InvoiceEditModal (S16)', () => {
  it('is one dialog titled "Edit details", prefilled from the record', () => {
    renderModal({
      invoiceNumber: 'INV-9',
      amount: 1234.5,
      date: '2026-05-01T00:00:00.000Z',
      dueDate: '2026-06-01',
      status: 'paid',
      notes: 'Sample note',
    });
    expect(screen.getByRole('dialog', { name: 'Edit details' })).toBeInTheDocument();
    expect(field(/Invoice #/).value).toBe('INV-9');
    expect(field(/^Amount/).value).toBe('1234.5');
    expect(field(/Invoice Date/).value).toBe('2026-05-01');
    expect(field(/Due Date/).value).toBe('2026-06-01');
    expect((screen.getByLabelText(/Status/) as HTMLSelectElement).value).toBe('paid');
    expect((screen.getByLabelText(/Notes/) as HTMLTextAreaElement).value).toBe('Sample note');
    expect(screen.getByTestId('company-picker')).toHaveAttribute('data-value', 'v-1');
    expect(screen.getByTestId('company-picker')).toHaveAttribute(
      'data-label',
      'Example Roofing Ltd',
    );
  });

  it('lists every status with its translated label in order', () => {
    renderModal();
    const options = Array.from((screen.getByLabelText(/Status/) as HTMLSelectElement).options).map(
      (o) => o.textContent,
    );
    expect(options).toEqual(['To pay', 'Paid', 'Submitted', 'Offer']);
  });

  it('shows blank optional fields for a record without number, due date and notes', () => {
    renderModal({ invoiceNumber: null, dueDate: null, notes: null });
    expect(field(/Invoice #/).value).toBe('');
    expect(field(/Due Date/).value).toBe('');
    expect((screen.getByLabelText(/Notes/) as HTMLTextAreaElement).value).toBe('');
  });

  it('saves every edited field, using the original vendor in the path and the picked one in the body', async () => {
    renderModal({ id: 'inv-5', vendorId: 'v-1' });
    await userEvent.clear(field(/Invoice #/));
    await userEvent.type(field(/Invoice #/), '  INV-NEW  ');
    await userEvent.clear(field(/^Amount/));
    await userEvent.type(field(/^Amount/), '2500.75');
    fireEvent.change(field(/Invoice Date/), { target: { value: '2026-02-02' } });
    fireEvent.change(field(/Due Date/), { target: { value: '2026-03-03' } });
    await userEvent.selectOptions(screen.getByLabelText(/Status/), 'claimed');
    await userEvent.type(screen.getByLabelText(/Notes/), '  fresh note  ');
    await userEvent.click(screen.getByText('pick-company'));
    await userEvent.click(save());
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
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('refreshes the page before closing the dialog', async () => {
    const order: string[] = [];
    onSaved.mockImplementation(async () => void order.push('saved'));
    onClose.mockImplementation(() => void order.push('closed'));
    renderModal();
    await userEvent.click(save());
    await waitFor(() => expect(order).toEqual(['saved', 'closed']));
  });

  it('sends null for a blank invoice number, due date and notes', async () => {
    renderModal({ invoiceNumber: 'X', dueDate: '2026-06-01', notes: 'n' });
    await userEvent.clear(field(/Invoice #/));
    fireEvent.change(field(/Due Date/), { target: { value: '' } });
    await userEvent.clear(screen.getByLabelText(/Notes/));
    await userEvent.click(save());
    await waitFor(() => expect(mockUpdateInvoice).toHaveBeenCalled());
    expect(mockUpdateInvoice.mock.calls[0]![2]).toMatchObject({
      invoiceNumber: null,
      dueDate: null,
      notes: null,
    });
  });

  it('a non-positive amount shows the amount message and sends nothing', async () => {
    renderModal();
    await userEvent.clear(field(/^Amount/));
    await userEvent.type(field(/^Amount/), '-5');
    await userEvent.click(save());
    expect(await screen.findByRole('alert')).toHaveTextContent('Amount must be a positive number.');
    expect(mockUpdateInvoice).not.toHaveBeenCalled();
  });

  it('clearing the vendor shows the vendor message as a field error and sends nothing', async () => {
    renderModal();
    await userEvent.click(screen.getByText('clear-company'));
    await userEvent.click(save());
    expect(await screen.findByText('Please select a vendor')).toBeVisible();
    expect(mockUpdateInvoice).not.toHaveBeenCalled();
  });

  it('Save is aria-disabled while the amount or the date is empty, and Enter sends nothing', async () => {
    renderModal();
    expect(save()).not.toHaveAttribute('aria-disabled');
    await userEvent.clear(field(/^Amount/));
    expect(save()).toHaveAttribute('aria-disabled', 'true');
    await userEvent.type(field(/^Amount/), '10');
    expect(save()).not.toHaveAttribute('aria-disabled');
    fireEvent.change(field(/Invoice Date/), { target: { value: '' } });
    expect(save()).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(save());
    expect(mockUpdateInvoice).not.toHaveBeenCalled();
  });

  it('while saving: Save shows Saving, is aria-disabled and busy, inputs are disabled, nothing is sent twice', async () => {
    let finish: () => void = () => undefined;
    mockUpdateInvoice.mockReturnValue(
      new Promise((resolve) => {
        finish = () => resolve({});
      }),
    );
    renderModal();
    await userEvent.click(save());
    const busy = await screen.findByRole('button', { name: /Saving/ });
    expect(busy).toHaveAttribute('aria-disabled', 'true');
    expect(busy).toHaveAttribute('aria-busy', 'true');
    expect(field(/Invoice #/)).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(pickerProps?.disabled).toBe(true);
    await userEvent.click(busy);
    expect(mockUpdateInvoice).toHaveBeenCalledTimes(1);
    finish();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('Escape and Cancel close it when idle, but Escape does nothing while saving', async () => {
    let finish: () => void = () => undefined;
    mockUpdateInvoice.mockReturnValue(
      new Promise((resolve) => {
        finish = () => resolve({});
      }),
    );
    renderModal();
    await userEvent.click(save());
    await screen.findByRole('button', { name: /Saving/ });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    finish();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('blurs the amount field on wheel so scrolling does not change it', () => {
    renderModal();
    const amount = field(/^Amount/);
    amount.focus();
    expect(amount).toHaveFocus();
    fireEvent.wheel(amount);
    expect(amount).not.toHaveFocus();
  });

  it('Cancel closes without saving', async () => {
    renderModal();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockUpdateInvoice).not.toHaveBeenCalled();
  });

  it('is not dismissible while a New company form is open, and is again afterwards', async () => {
    renderModal();
    await userEvent.click(screen.getByText('start-create'));
    fireEvent.keyDown(document, { key: 'Escape' });
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.click(screen.getByText('end-create'));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  describe('save errors keep the dialog open', () => {
    async function submitWith(error: unknown) {
      mockUpdateInvoice.mockRejectedValue(error);
      renderModal();
      await userEvent.click(save());
      return screen.findByRole('alert');
    }

    it('a 404 NOT_FOUND shows the vendor-not-found copy', async () => {
      const alert = await submitWith(new ApiClientError(404, { code: 'NOT_FOUND', message: 'x' }));
      expect(alert).toHaveTextContent('The selected vendor could not be found');
      expect(onClose).not.toHaveBeenCalled();
      expect(onSaved).not.toHaveBeenCalled();
    });

    it('ITEMIZED_SUM_EXCEEDS_INVOICE names the formatted itemized total', async () => {
      const alert = await submitWith(
        new ApiClientError(400, {
          code: 'ITEMIZED_SUM_EXCEEDS_INVOICE',
          message: 'raw',
          details: { itemizedTotal: 1800 },
        }),
      );
      expect(alert).toHaveTextContent('€1,800.00');
      expect(alert).not.toHaveTextContent('raw');
    });

    it('ITEMIZED_SUM_EXCEEDS_INVOICE without details falls back to a formatted zero', async () => {
      const alert = await submitWith(
        new ApiClientError(400, { code: 'ITEMIZED_SUM_EXCEEDS_INVOICE', message: 'raw' }),
      );
      expect(alert).toHaveTextContent('€0.00');
    });

    it('any other API error shows the translated text, never the server prose', async () => {
      const alert = await submitWith(
        new ApiClientError(400, { code: 'VALIDATION_ERROR', message: 'SERVER PROSE' }),
      );
      expect(alert).not.toHaveTextContent('SERVER PROSE');
      expect(alert.textContent?.length).toBeGreaterThan(0);
    });

    it('a 404 with another code is translated, not the vendor copy', async () => {
      const alert = await submitWith(
        new ApiClientError(404, { code: 'VALIDATION_ERROR', message: 'x' }),
      );
      expect(alert).not.toHaveTextContent('The selected vendor could not be found');
    });

    it('a non-API failure shows the generic update error', async () => {
      const alert = await submitWith(new Error('offline'));
      expect(alert).toHaveTextContent('Failed to update invoice. Please try again.');
    });

    it('a failed save leaves the form usable and clears the error on the next attempt', async () => {
      mockUpdateInvoice.mockRejectedValueOnce(new Error('offline'));
      renderModal();
      await userEvent.click(save());
      await screen.findByRole('alert');
      expect(save()).not.toHaveAttribute('aria-busy');
      await userEvent.click(save());
      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });
});
