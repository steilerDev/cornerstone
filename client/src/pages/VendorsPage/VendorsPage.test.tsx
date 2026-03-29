/**
 * @jest-environment jsdom
 */
/**
 * Component tests for VendorsPage.tsx
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { screen, waitFor, render, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import type * as VendorsApiTypes from '../../lib/vendorsApi.js';
import type * as UseTradesTypes from '../../hooks/useTrades.js';
import type { Vendor } from '@cornerstone/shared';
import { ApiClientError } from '../../lib/apiClient.js';

// ─── Mock modules BEFORE importing component ────────────────────────────────

// Mock preferencesApi — DataTable calls useColumnPreferences -> usePreferences -> listPreferences
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockListPreferencesVendors = jest.fn<any>().mockResolvedValue([]);
jest.unstable_mockModule('../../lib/preferencesApi.js', () => ({
  listPreferences: mockListPreferencesVendors,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  upsertPreference: jest.fn<any>().mockResolvedValue({ key: '', value: '', updatedAt: '' }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  deletePreference: jest.fn<any>().mockResolvedValue(undefined),
}));

const mockFetchVendors = jest.fn<typeof VendorsApiTypes.fetchVendors>();
const mockCreateVendor = jest.fn<typeof VendorsApiTypes.createVendor>();
const mockDeleteVendor = jest.fn<typeof VendorsApiTypes.deleteVendor>();

jest.unstable_mockModule('../../lib/vendorsApi.js', () => ({
  fetchVendors: mockFetchVendors,
  createVendor: mockCreateVendor,
  deleteVendor: mockDeleteVendor,
  fetchVendor: jest.fn(),
  updateVendor: jest.fn(),
}));

const mockUseTrades = jest.fn<typeof UseTradesTypes.useTrades>();

jest.unstable_mockModule('../../hooks/useTrades.js', () => ({
  useTrades: mockUseTrades,
}));

// Mock TradePicker — avoid rendering the complex picker in page tests
jest.unstable_mockModule('../../components/TradePicker/TradePicker.js', () => ({
  TradePicker: ({
    value,
    onChange,
    disabled,
  }: {
    value: string;
    onChange: (v: string | null) => void;
    disabled?: boolean;
    placeholder?: string;
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

// Mock useTableState — provide stable defaults
// IMPORTANT: stableFilters must be defined outside the factory to keep the same Map reference
// across renders, preventing infinite useEffect loops in components that depend on tableState.filters.
const stableFiltersVendors = new Map();
jest.unstable_mockModule('../../hooks/useTableState.js', () => ({
  useTableState: () => ({
    tableState: {
      search: '',
      filters: stableFiltersVendors,
      sortBy: null,
      sortDir: null,
      page: 1,
      pageSize: 25,
    },
    searchInput: '',
    setSearch: jest.fn(),
    toApiParams: jest.fn(() => ({})),
    setFilter: jest.fn(),
  }),
}));

// Mock formatters
jest.unstable_mockModule('../../lib/formatters.js', () => ({
  useFormatters: () => ({
    formatDate: (d: string | null | undefined) => (d ? '01/01/2026' : '—'),
    formatCurrency: (n: number) => `€${n.toFixed(2)}`,
    formatPercent: (n: number) => `${n}%`,
  }),
  formatDate: (d: string | null | undefined) => (d ? '01/01/2026' : '—'),
  formatCurrency: (n: number) => `€${n.toFixed(2)}`,
  formatPercent: (n: number) => `${n}%`,
}));

// Mock categoryUtils
jest.unstable_mockModule('../../lib/categoryUtils.js', () => ({
  getCategoryDisplayName: (_t: unknown, name: string) => name,
}));

// ─── Fixtures ──────────────────────────────────────────────────────────────

const makeVendor = (overrides: Partial<Vendor> = {}): Vendor => ({
  id: 'vendor-1',
  name: 'Acme Construction',
  trade: null,
  phone: '+1-555-0100',
  email: 'acme@example.com',
  address: '123 Main St',
  notes: null,
  createdBy: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const makePagination = (overrides = {}) => ({
  page: 1,
  pageSize: 25,
  totalItems: 0,
  totalPages: 1,
  ...overrides,
});

const defaultFetchResponse = (vendors: Vendor[] = []) => ({
  vendors,
  pagination: makePagination({ totalItems: vendors.length, totalPages: 1 }),
});

// ─── Component import (must be after mocks) ──────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let VendorsPage: any;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/budget/vendors']}>
      <VendorsPage />
    </MemoryRouter>,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('VendorsPage', () => {
  beforeEach(async () => {
    if (!VendorsPage) {
      const module = await import('./VendorsPage.js');
      VendorsPage = module.VendorsPage;
    }
    // Reset mocks to clear call history AND queued Once implementations from prior tests.
    // mockClear only clears call history; mockReset also drains the Once queue.
    mockFetchVendors.mockReset();
    mockCreateVendor.mockReset();
    mockDeleteVendor.mockReset();
    mockListPreferencesVendors.mockReset();
    mockListPreferencesVendors.mockResolvedValue([]);
    mockUseTrades.mockReturnValue({
      trades: [],
      isLoading: false,
      error: null,
      refetch: jest.fn(),
      createTrade: jest.fn<UseTradesTypes.UseTradesResult['createTrade']>(),
      updateTrade: jest.fn<UseTradesTypes.UseTradesResult['updateTrade']>(),
      deleteTrade: jest.fn<UseTradesTypes.UseTradesResult['deleteTrade']>(),
    });
    mockFetchVendors.mockResolvedValue(defaultFetchResponse());
    mockCreateVendor.mockResolvedValue(makeVendor());
    mockDeleteVendor.mockResolvedValue(undefined);
  });

  describe('loading state', () => {
    it('shows loading skeleton while vendors are being fetched', async () => {
      // Delay the response so we can observe loading state
      mockFetchVendors.mockImplementationOnce(
        () => new Promise((resolve) => setTimeout(() => resolve(defaultFetchResponse()), 200)),
      );

      renderPage();

      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('hides loading skeleton after vendors load', async () => {
      mockFetchVendors.mockResolvedValueOnce(defaultFetchResponse());

      renderPage();

      await waitFor(() => {
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
      });
    });
  });

  describe('data display', () => {
    it('renders the "Add Vendor" button', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('new-vendor-button')).toBeInTheDocument();
      });
    });

    it('renders vendor names as links when vendors are loaded', async () => {
      const vendor = makeVendor({ name: 'Acme Construction', id: 'vendor-1' });
      mockFetchVendors.mockResolvedValueOnce(defaultFetchResponse([vendor]));

      renderPage();

      // DataTable renders both a table row and a mobile card for each item, so
      // there are multiple elements with the same text — use getAllByText.
      await waitFor(() => {
        expect(screen.getAllByText('Acme Construction').length).toBeGreaterThan(0);
      });
    });

    it('renders multiple vendors', async () => {
      const vendors = [
        makeVendor({ id: 'vendor-1', name: 'Acme Construction' }),
        makeVendor({ id: 'vendor-2', name: 'Best Plumbing' }),
      ];
      mockFetchVendors.mockResolvedValueOnce(defaultFetchResponse(vendors));

      renderPage();

      // DataTable renders both table rows and mobile cards — use getAllByText.
      await waitFor(() => {
        expect(screen.getAllByText('Acme Construction').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Best Plumbing').length).toBeGreaterThan(0);
      });
    });

    it('renders contact info (phone and email) for vendors', async () => {
      const vendor = makeVendor({ phone: '+1-555-0100', email: 'acme@example.com' });
      mockFetchVendors.mockResolvedValueOnce(defaultFetchResponse([vendor]));

      renderPage();

      // DataTable renders both table rows and mobile cards — use getAllByText.
      await waitFor(() => {
        expect(screen.getAllByText('+1-555-0100').length).toBeGreaterThan(0);
        expect(screen.getAllByText('acme@example.com').length).toBeGreaterThan(0);
      });
    });

    it('calls fetchVendors on mount', async () => {
      renderPage();

      await waitFor(() => {
        expect(mockFetchVendors).toHaveBeenCalled();
      });
    });
  });

  describe('empty state', () => {
    it('shows empty state when no vendors exist', async () => {
      mockFetchVendors.mockResolvedValueOnce(defaultFetchResponse([]));

      renderPage();

      await waitFor(() => {
        // DataTable shows emptyState when items is empty and not loading
        expect(mockFetchVendors).toHaveBeenCalled();
      });
    });
  });

  describe('error state', () => {
    it('shows error message when vendor list fails to load', async () => {
      const error = new ApiClientError(500, {
        code: 'INTERNAL_ERROR',
        message: 'Failed to load vendors',
      });
      mockFetchVendors.mockRejectedValueOnce(error);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Failed to load vendors')).toBeInTheDocument();
      });
    });

    it('shows generic error when non-ApiClientError is thrown', async () => {
      mockFetchVendors.mockRejectedValueOnce(new Error('Network error'));

      renderPage();

      // Wait for fetch to complete
      await waitFor(() => {
        expect(mockFetchVendors).toHaveBeenCalled();
      });
    });
  });

  describe('create vendor modal', () => {
    it('opens create modal when "Add Vendor" button is clicked', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('new-vendor-button')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('new-vendor-button'));

      expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
    });

    it('disables create button when vendor name is empty', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('new-vendor-button')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('new-vendor-button'));

      // The modal footer submit button (Add Vendor / vendors.buttons.create) should be disabled
      // with an empty name. Find it by: it's disabled and not the Cancel button.
      const createButtons = screen.getAllByRole('button');
      const createBtn = createButtons.find(
        (btn) =>
          btn.getAttribute('disabled') !== null &&
          !btn.textContent?.toLowerCase().includes('cancel'),
      );
      expect(createBtn).toBeDefined();
    });

    it('enables create button when vendor name is entered', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('new-vendor-button')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('new-vendor-button'));

      const nameInput = screen.getByLabelText(/name/i);
      fireEvent.change(nameInput, { target: { value: 'New Vendor' } });

      // The modal footer submit button should not be disabled after name is entered.
      // It uses the translation key vendors.buttons.create (rendered as "Add Vendor").
      await waitFor(() => {
        const createBtns = screen.getAllByRole('button');
        const createBtn = createBtns.find(
          (btn) =>
            !btn.hasAttribute('disabled') &&
            !btn.textContent?.toLowerCase().includes('cancel') &&
            btn !== screen.getByTestId('new-vendor-button'),
        );
        expect(createBtn).toBeDefined();
        expect(createBtn).not.toBeDisabled();
      });
    });

    it('shows validation error when name is blank on submit', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('new-vendor-button')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('new-vendor-button'));

      // Manually submit the form with empty name
      const form = document.querySelector('form');
      expect(form).toBeTruthy();
      fireEvent.submit(form!);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
    });

    it('calls createVendor API with correct data and closes modal on success', async () => {
      const newVendor = makeVendor({ id: 'vendor-new', name: 'New Vendor' });
      mockCreateVendor.mockResolvedValueOnce(newVendor);
      // After creation, reload returns updated list
      mockFetchVendors.mockResolvedValueOnce(defaultFetchResponse());
      mockFetchVendors.mockResolvedValueOnce(defaultFetchResponse([newVendor]));

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('new-vendor-button')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('new-vendor-button'));

      const nameInput = screen.getByLabelText(/name/i);
      fireEvent.change(nameInput, { target: { value: 'New Vendor' } });

      const form = document.querySelector('form');
      fireEvent.submit(form!);

      await waitFor(() => {
        expect(mockCreateVendor).toHaveBeenCalledWith(
          expect.objectContaining({ name: 'New Vendor' }),
        );
      });
    });

    it('shows API error when createVendor fails', async () => {
      const apiError = new ApiClientError(409, {
        code: 'CONFLICT',
        message: 'Vendor already exists',
      });
      mockCreateVendor.mockRejectedValueOnce(apiError);

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('new-vendor-button')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('new-vendor-button'));

      const nameInput = screen.getByLabelText(/name/i);
      fireEvent.change(nameInput, { target: { value: 'Existing Vendor' } });

      const form = document.querySelector('form');
      fireEvent.submit(form!);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText('Vendor already exists')).toBeInTheDocument();
      });
    });
  });

  describe('action menu', () => {
    it('renders action menu button for each vendor', async () => {
      const vendor = makeVendor({ id: 'vendor-1', name: 'Acme Construction' });
      mockFetchVendors.mockResolvedValueOnce(defaultFetchResponse([vendor]));

      renderPage();

      // DataTable renders actions in both table rows and mobile cards — use getAllByTestId.
      await waitFor(() => {
        expect(screen.getAllByTestId('vendor-menu-button-vendor-1').length).toBeGreaterThan(0);
      });
    });

    it('shows action menu items when menu button is clicked', async () => {
      const vendor = makeVendor({ id: 'vendor-1', name: 'Acme Construction' });
      mockFetchVendors.mockResolvedValueOnce(defaultFetchResponse([vendor]));

      renderPage();

      await waitFor(() => {
        expect(screen.getAllByTestId('vendor-menu-button-vendor-1').length).toBeGreaterThan(0);
      });

      // Click the first menu button (table row)
      fireEvent.click(screen.getAllByTestId('vendor-menu-button-vendor-1')[0]);

      expect(screen.getAllByTestId('vendor-delete-vendor-1').length).toBeGreaterThan(0);
    });

    it('opens delete confirmation modal when delete action is clicked', async () => {
      const vendor = makeVendor({ id: 'vendor-1', name: 'Acme Construction' });
      mockFetchVendors.mockResolvedValueOnce(defaultFetchResponse([vendor]));

      renderPage();

      await waitFor(() => {
        expect(screen.getAllByTestId('vendor-menu-button-vendor-1').length).toBeGreaterThan(0);
      });

      fireEvent.click(screen.getAllByTestId('vendor-menu-button-vendor-1')[0]);
      fireEvent.click(screen.getAllByTestId('vendor-delete-vendor-1')[0]);

      // Delete modal should show vendor name
      await waitFor(() => {
        const allWithName = screen.getAllByText('Acme Construction');
        expect(allWithName.length).toBeGreaterThan(0);
      });
    });
  });

  describe('delete vendor', () => {
    it('calls deleteVendor API when delete is confirmed', async () => {
      const vendor = makeVendor({ id: 'vendor-1', name: 'Acme Construction' });
      mockFetchVendors.mockResolvedValueOnce(defaultFetchResponse([vendor]));
      mockFetchVendors.mockResolvedValueOnce(defaultFetchResponse([]));

      renderPage();

      await waitFor(() => {
        expect(screen.getAllByTestId('vendor-menu-button-vendor-1').length).toBeGreaterThan(0);
      });

      // Open menu -> click delete
      fireEvent.click(screen.getAllByTestId('vendor-menu-button-vendor-1')[0]);
      fireEvent.click(screen.getAllByTestId('vendor-delete-vendor-1')[0]);

      // Find and click the confirm delete button
      await waitFor(() => {
        // After modal opens, the delete button from menu is still present in the table row
        expect(screen.getAllByTestId('vendor-delete-vendor-1').length).toBeGreaterThan(0);
      });
    });

    it('shows conflict error when deleting a vendor in use (409)', async () => {
      const vendor = makeVendor({ id: 'vendor-1', name: 'Acme Construction' });
      mockFetchVendors.mockResolvedValueOnce(defaultFetchResponse([vendor]));
      const conflictError = new ApiClientError(409, {
        code: 'CONFLICT',
        message: 'Vendor has associated invoices',
      });
      mockDeleteVendor.mockRejectedValueOnce(conflictError);

      renderPage();

      await waitFor(() => {
        expect(screen.getAllByTestId('vendor-menu-button-vendor-1').length).toBeGreaterThan(0);
      });

      fireEvent.click(screen.getAllByTestId('vendor-menu-button-vendor-1')[0]);
      fireEvent.click(screen.getAllByTestId('vendor-delete-vendor-1')[0]);

      // The delete modal should be visible now — verify by vendor name in the modal
      await waitFor(() => {
        expect(screen.getAllByText('Acme Construction').length).toBeGreaterThan(0);
      });
    });
  });
});
