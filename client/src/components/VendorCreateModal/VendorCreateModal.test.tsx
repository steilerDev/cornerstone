/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import type * as VendorsApiTypes from '../../lib/vendorsApi.js';
import type * as UseTradesTypes from '../../hooks/useTrades.js';
import type { Vendor } from '@cornerstone/shared';
import { ApiClientError } from '../../lib/apiClient.js';
import type { VendorCreateModal as VendorCreateModalType } from './VendorCreateModal.js';

// ─── Mock modules BEFORE importing component ────────────────────────────────

const mockCreateVendor = jest.fn<typeof VendorsApiTypes.createVendor>();
jest.unstable_mockModule('../../lib/vendorsApi.js', () => ({
  createVendor: mockCreateVendor,
}));

const mockUseTrades = jest.fn<typeof UseTradesTypes.useTrades>();
jest.unstable_mockModule('../../hooks/useTrades.js', () => ({
  useTrades: mockUseTrades,
}));

jest.unstable_mockModule('../TradePicker/TradePicker.js', () => ({
  TradePicker: ({
    value,
    onChange,
    disabled,
  }: {
    value: string;
    onChange: (v: string | null) => void;
    disabled?: boolean;
  }) => (
    <select
      data-testid="trade-picker"
      value={value}
      onChange={(e) => onChange(e.target.value || null)}
      disabled={disabled}
    >
      <option value="">No trade</option>
      <option value="trade-1">Electrician</option>
    </select>
  ),
}));

let VendorCreateModal: typeof VendorCreateModalType;

function makeVendor(overrides: Partial<Vendor> = {}): Vendor {
  return {
    id: 'vendor-new',
    name: 'Acme',
    phone: null,
    email: null,
    address: null,
    notes: null,
    trade: null,
    createdBy: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as Vendor;
}

const mockOnCreated = jest.fn<(vendor: Vendor) => void>();
const mockOnClose = jest.fn<() => void>();

function renderModal(initialName?: string) {
  return render(
    <VendorCreateModal
      {...(initialName !== undefined ? { initialName } : {})}
      onCreated={mockOnCreated}
      onClose={mockOnClose}
    />,
  );
}

function nameInput() {
  return screen.getByLabelText(/^Name/) as HTMLInputElement;
}

function createButton() {
  return screen.getByRole('button', { name: /^(Add Vendor|Adding\.\.\.)/ });
}

describe('VendorCreateModal (Story #2148)', () => {
  beforeEach(async () => {
    if (!VendorCreateModal) {
      const mod = await import('./VendorCreateModal.js');
      VendorCreateModal = mod.VendorCreateModal;
    }
    mockCreateVendor.mockReset();
    mockOnCreated.mockReset();
    mockOnClose.mockReset();
    mockUseTrades.mockReset();
    mockUseTrades.mockReturnValue({
      trades: [],
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof UseTradesTypes.useTrades>);
  });

  describe('prefill and focus', () => {
    it('prefills the name from initialName', () => {
      renderModal('Acme');
      expect(nameInput().value).toBe('Acme');
    });

    it('starts with an empty name when initialName is undefined', () => {
      renderModal();
      expect(nameInput().value).toBe('');
    });

    it('truncates an over-long initialName to 200 characters', () => {
      renderModal('A'.repeat(250));
      expect(nameInput().value).toBe('A'.repeat(200));
    });

    it('focuses the name field on mount with the caret at the end', () => {
      renderModal('Acme');
      const input = nameInput();
      expect(document.activeElement).toBe(input);
      expect(input.selectionStart).toBe(4);
      expect(input.selectionEnd).toBe(4);
    });
  });

  describe('create button state', () => {
    it('is disabled for an empty or whitespace-only name and enabled with text', () => {
      renderModal();

      expect(createButton()).toBeDisabled();
      fireEvent.change(nameInput(), { target: { value: '   ' } });
      expect(createButton()).toBeDisabled();
      fireEvent.change(nameInput(), { target: { value: 'Acme' } });
      expect(createButton()).toBeEnabled();
    });
  });

  describe('successful submit', () => {
    it('sends trimmed values with empty optionals as null and calls onCreated (not onClose)', async () => {
      const created = makeVendor({ id: 'v-1', name: 'Acme' });
      mockCreateVendor.mockResolvedValueOnce(created);
      renderModal();

      fireEvent.change(nameInput(), { target: { value: '  Acme  ' } });
      fireEvent.change(screen.getByLabelText('Phone'), { target: { value: ' 123 ' } });
      fireEvent.change(screen.getByTestId('trade-picker'), { target: { value: 'trade-1' } });
      fireEvent.click(createButton());

      await waitFor(() => {
        expect(mockOnCreated).toHaveBeenCalledTimes(1);
      });
      expect(mockOnCreated).toHaveBeenCalledWith(created);
      expect(mockOnClose).not.toHaveBeenCalled();
      expect(mockCreateVendor).toHaveBeenCalledWith({
        name: 'Acme',
        phone: '123',
        email: null,
        address: null,
        notes: null,
        tradeId: 'trade-1',
      });
    });

    it('sends every optional field trimmed when all are filled in', async () => {
      mockCreateVendor.mockResolvedValueOnce(makeVendor());
      renderModal('Acme');

      fireEvent.change(screen.getByLabelText('Email'), { target: { value: ' a@b.de ' } });
      fireEvent.change(screen.getByLabelText('Address'), { target: { value: ' Hauptstr. 1 ' } });
      fireEvent.change(screen.getByLabelText('Notes'), { target: { value: ' note ' } });
      fireEvent.click(createButton());

      await waitFor(() => {
        expect(mockCreateVendor).toHaveBeenCalledWith({
          name: 'Acme',
          phone: null,
          email: 'a@b.de',
          address: 'Hauptstr. 1',
          notes: 'note',
          tradeId: null,
        });
      });
    });

    it('sends tradeId null when no trade is chosen', async () => {
      mockCreateVendor.mockResolvedValueOnce(makeVendor());
      renderModal('Acme');

      fireEvent.click(createButton());

      await waitFor(() => {
        expect(mockCreateVendor).toHaveBeenCalledWith(
          expect.objectContaining({ name: 'Acme', tradeId: null }),
        );
      });
    });
  });

  describe('while the request is in flight', () => {
    function deferred() {
      let resolve!: (v: Vendor) => void;
      const promise = new Promise<Vendor>((res) => {
        resolve = res;
      });
      return { promise, resolve };
    }

    it('shows "Adding...", disables Create and Cancel, ignores Escape/backdrop, and sends once', async () => {
      const d = deferred();
      mockCreateVendor.mockReturnValueOnce(d.promise);
      renderModal('Acme');

      fireEvent.click(createButton());
      await waitFor(() => {
        expect(createButton()).toHaveTextContent('Adding...');
      });
      fireEvent.click(createButton());

      expect(createButton()).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
      fireEvent.keyDown(document, { key: 'Escape' });
      const backdrop = document.querySelector('[class*="modalBackdrop"]');
      expect(backdrop).toBeTruthy();
      fireEvent.click(backdrop!);
      fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));

      expect(mockOnClose).not.toHaveBeenCalled();
      expect(mockCreateVendor).toHaveBeenCalledTimes(1);

      await act(async () => {
        d.resolve(makeVendor());
        await d.promise;
      });
      expect(mockOnCreated).toHaveBeenCalledTimes(1);
    });
  });

  describe('errors', () => {
    it('shows a translated alert for an ApiClientError, keeps fields and re-enables Create', async () => {
      mockCreateVendor.mockRejectedValueOnce(
        new ApiClientError(400, { code: 'VALIDATION_ERROR', message: 'raw server text' }),
      );
      renderModal('Acme');
      fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '555' } });

      fireEvent.click(createButton());

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('The submitted data is invalid. Please check your input.');
      expect(alert).not.toHaveTextContent('raw server text');
      expect(nameInput().value).toBe('Acme');
      expect((screen.getByLabelText('Phone') as HTMLInputElement).value).toBe('555');
      expect(createButton()).toBeEnabled();
      expect(createButton()).toHaveTextContent('Add Vendor');
      expect(mockOnCreated).not.toHaveBeenCalled();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('shows the generic create error for a non-API error', async () => {
      mockCreateVendor.mockRejectedValueOnce(new Error('network down'));
      renderModal('Acme');

      fireEvent.click(createButton());

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('Failed to create vendor. Please try again.');
      expect(createButton()).toBeEnabled();
    });

    it('shows the too-long name error when a name over 200 characters is submitted', () => {
      renderModal();
      fireEvent.change(nameInput(), { target: { value: 'N'.repeat(201) } });

      fireEvent.submit(document.querySelector('form')!);

      expect(document.getElementById('vendor-name-error')).toHaveTextContent(
        'Vendor name must be 200 characters or less.',
      );
      expect(mockCreateVendor).not.toHaveBeenCalled();
    });

    it('shows an inline name error for a whitespace name on direct form submit and clears it on typing', () => {
      renderModal();
      fireEvent.change(nameInput(), { target: { value: '   ' } });

      fireEvent.submit(document.querySelector('form')!);

      const error = document.getElementById('vendor-name-error');
      expect(error).toHaveTextContent('Vendor name is required.');
      expect(nameInput()).toHaveAttribute('aria-invalid', 'true');
      expect(nameInput()).toHaveAttribute('aria-describedby', 'vendor-name-error');
      expect(mockCreateVendor).not.toHaveBeenCalled();

      fireEvent.change(nameInput(), { target: { value: 'Acme' } });

      expect(error).toBeEmptyDOMElement();
      expect(nameInput()).not.toHaveAttribute('aria-invalid');
    });
  });

  describe('closing when idle', () => {
    it('Cancel calls onClose once', () => {
      renderModal('Acme');
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('the x button calls onClose once', () => {
      renderModal('Acme');
      fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('Escape calls onClose once', () => {
      renderModal('Acme');
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('backdrop click calls onClose once', () => {
      renderModal('Acme');
      fireEvent.click(document.querySelector('[class*="modalBackdrop"]')!);
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });
  });
});
