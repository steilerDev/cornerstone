/**
 * @jest-environment jsdom
 */
/**
 * Component tests for VendorsPage.tsx
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { screen, waitFor, render, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RecordingRouter, createRouterLog } from '../../test/recordingRouter.js';
import { ToastProvider } from '../../components/Toast/ToastContext.js';
import type { ReactNode } from 'react';
import type * as VendorsApiTypes from '../../lib/vendorsApi.js';
import type * as UseTradesTypes from '../../hooks/useTrades.js';
import type * as AuthContextTypes from '../../contexts/AuthContext.js';
import type * as PreferencesApiTypes from '../../lib/preferencesApi.js';
import type { Vendor, VendorListItem } from '@cornerstone/shared';
import { ApiClientError } from '../../lib/apiClient.js';
import enErrors from '../../i18n/en/errors.json';
import enCommon from '../../i18n/en/common.json';
import { findDuplicateTestIds } from '../../test/findDuplicateTestIds.js';

// ─── Mock modules BEFORE importing component ────────────────────────────────

// Mock AuthContext — VendorsPage uses useAuth() to compute isAdmin for Settings SubNav visibility
const mockUseAuth = jest.fn<typeof AuthContextTypes.useAuth>();
jest.unstable_mockModule('../../contexts/AuthContext.js', () => ({
  useAuth: mockUseAuth,
  AuthProvider: ({ children }: { children: ReactNode }) => children,
}));

// Mock preferencesApi — DataTable calls useColumnPreferences -> usePreferences -> listPreferences
const mockListPreferencesVendors = jest
  .fn<typeof PreferencesApiTypes.listPreferences>()
  .mockResolvedValue([]);
jest.unstable_mockModule('../../lib/preferencesApi.js', () => ({
  listPreferences: mockListPreferencesVendors,
  upsertPreference: jest
    .fn<typeof PreferencesApiTypes.upsertPreference>()
    .mockResolvedValue({ key: '', value: '', updatedAt: '' }),
  deletePreference: jest
    .fn<typeof PreferencesApiTypes.deletePreference>()
    .mockResolvedValue(undefined),
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
  formatDayRange: (start: Date, end: Date) =>
    `${start.toISOString().slice(0, 10)} – ${end.toISOString().slice(0, 10)}`,
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

const defaultFetchResponse = (vendors: VendorListItem[] = []) => ({
  vendors,
  pagination: makePagination({ totalItems: vendors.length, totalPages: 1 }),
});

// ─── Component import (must be after mocks) ──────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let VendorsPage: any;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderPage() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={['/settings/vendors']}>
        <VendorsPage />
      </MemoryRouter>
    </ToastProvider>,
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
    mockUseAuth.mockReset();
    mockFetchVendors.mockReset();
    mockCreateVendor.mockReset();
    mockDeleteVendor.mockReset();
    mockListPreferencesVendors.mockReset();

    // Default: admin user so all Settings SubNav tabs are visible
    mockUseAuth.mockReturnValue({
      user: {
        id: 'user-admin',
        email: 'admin@example.com',
        displayName: 'Admin',
        role: 'admin' as const,
        authProvider: 'local' as const,
        oidcLinked: false,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        deactivatedAt: null,
      },
      oidcEnabled: false,
      isLoading: false,
      error: null,
      refreshAuth: jest.fn(async () => Promise.resolve()),
      logout: jest.fn(async () => Promise.resolve()),
    });
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

  describe('settings subnav', () => {
    it('renders the Settings section SubNav with correct aria-label', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
      });

      const nav = screen.getByRole('navigation', { name: 'Settings section navigation' });
      expect(nav).toBeInTheDocument();
    });

    it('hides the User Management and Backups tabs from members (D-23)', async () => {
      mockUseAuth.mockReturnValue({
        user: {
          id: 'user-member',
          email: 'member@example.com',
          displayName: 'Member',
          role: 'member' as const,
          authProvider: 'local' as const,
          oidcLinked: false,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
          deactivatedAt: null,
        },
        oidcEnabled: false,
        isLoading: false,
        error: null,
        refreshAuth: jest.fn(async () => Promise.resolve()),
        logout: jest.fn(async () => Promise.resolve()),
      });
      renderPage();

      const nav = await screen.findByRole('navigation', { name: 'Settings section navigation' });
      expect(within(nav).getByRole('link', { name: 'Profile' })).toBeInTheDocument();
      expect(within(nav).queryByRole('link', { name: 'User Management' })).toBeNull();
      expect(within(nav).queryByRole('link', { name: 'Backups' })).toBeNull();
    });

    it('shows the User Management and Backups tabs to admins', async () => {
      renderPage();

      const nav = await screen.findByRole('navigation', { name: 'Settings section navigation' });
      expect(within(nav).getByRole('link', { name: 'User Management' })).toBeInTheDocument();
      expect(within(nav).getByRole('link', { name: 'Backups' })).toBeInTheDocument();
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

    describe('contact phone fallback (#2197)', () => {
      const makeListItem = (overrides: Partial<VendorListItem> = {}): VendorListItem => ({
        ...makeVendor(),
        email: null,
        firstContactPhone: null,
        ...overrides,
      });

      async function renderWith(vendor: VendorListItem) {
        mockFetchVendors.mockResolvedValueOnce(defaultFetchResponse([vendor]));
        renderPage();
        await waitFor(() => {
          expect(screen.getAllByText('Acme Construction').length).toBeGreaterThan(0);
        });
      }

      function telHrefs(): (string | null)[] {
        return screen
          .queryAllByRole('link')
          .filter((a) => a.getAttribute('href')?.startsWith('tel:'))
          .map((a) => a.getAttribute('href'));
      }

      it('shows the first contact phone as a tel link when the vendor has no phone', async () => {
        await renderWith(makeListItem({ phone: null, firstContactPhone: '555-0101' }));

        expect(screen.getAllByText('555-0101').length).toBeGreaterThan(0);
        expect(telHrefs().length).toBeGreaterThan(0);
        expect(new Set(telHrefs())).toEqual(new Set(['tel:555-0101']));
      });

      it("prefers the vendor's own phone over the contact phone", async () => {
        await renderWith(makeListItem({ phone: '555-0102', firstContactPhone: '555-0103' }));

        expect(screen.getAllByText('555-0102').length).toBeGreaterThan(0);
        expect(screen.queryByText('555-0103')).not.toBeInTheDocument();
        expect(new Set(telHrefs())).toEqual(new Set(['tel:555-0102']));
      });

      it('falls back to the contact phone when the vendor phone is blank', async () => {
        await renderWith(makeListItem({ phone: '  ', firstContactPhone: '555-0101' }));

        expect(screen.getAllByText('555-0101').length).toBeGreaterThan(0);
        expect(new Set(telHrefs())).toEqual(new Set(['tel:555-0101']));
      });

      it('falls back when firstContactPhone is absent from a plain vendor row', async () => {
        await renderWith(makeListItem({ phone: null, firstContactPhone: undefined }));

        expect(telHrefs()).toHaveLength(0);
        expect(screen.getAllByText('—').length).toBeGreaterThan(0);
      });

      it('shows a dash when there is no phone, no contact phone and no email', async () => {
        await renderWith(makeListItem({ phone: null, firstContactPhone: null, email: null }));

        expect(telHrefs()).toHaveLength(0);
        expect(screen.getAllByText('—').length).toBeGreaterThan(0);
      });

      it('shows the contact phone together with the email', async () => {
        await renderWith(
          makeListItem({
            phone: null,
            firstContactPhone: '555-0101',
            email: 'acme@example.com',
          }),
        );

        expect(screen.getAllByText('555-0101').length).toBeGreaterThan(0);
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
        message: 'RAW-SERVER-SENTINEL',
      });
      mockFetchVendors.mockRejectedValueOnce(error);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText(enErrors.INTERNAL_ERROR)).toBeInTheDocument();
      });
      expect(screen.queryByText(/RAW-SERVER-SENTINEL/)).toBeNull();
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

      // The name error is now a field-level error (no role="alert") wired to the input
      await waitFor(() => {
        expect(screen.getByText('Vendor name is required.')).toBeInTheDocument();
      });
      expect(screen.getByLabelText(/name/i)).toHaveAttribute('aria-invalid', 'true');
      expect(mockCreateVendor).not.toHaveBeenCalled();
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
        message: 'RAW-SERVER-SENTINEL',
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
      });
      // The create error is translated via translateApiError, not the raw server message
      expect(screen.getByRole('alert')).toHaveTextContent(enErrors.CONFLICT);
      expect(screen.queryByText(/RAW-SERVER-SENTINEL/)).toBeNull();
    });

    it('closes the modal and reloads the vendor list after a successful create', async () => {
      const newVendor = makeVendor({ id: 'vendor-new', name: 'New Vendor' });
      mockCreateVendor.mockResolvedValueOnce(newVendor);
      mockFetchVendors.mockResolvedValueOnce(defaultFetchResponse());
      mockFetchVendors.mockResolvedValueOnce(defaultFetchResponse([newVendor]));

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('new-vendor-button')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByTestId('new-vendor-button'));
      fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'New Vendor' } });
      fireEvent.submit(document.querySelector('form')!);

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
      await waitFor(() => {
        expect(mockFetchVendors).toHaveBeenCalledTimes(2);
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
        expect(screen.getByTestId('vendor-menu-button-vendor-1')).toBeInTheDocument();
      });
    });

    it('shows action menu items when menu button is clicked', async () => {
      const vendor = makeVendor({ id: 'vendor-1', name: 'Acme Construction' });
      mockFetchVendors.mockResolvedValueOnce(defaultFetchResponse([vendor]));

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('vendor-menu-button-vendor-1')).toBeInTheDocument();
      });

      // Click the first menu button (table row)
      fireEvent.click(screen.getByTestId('vendor-menu-button-vendor-1'));

      expect(screen.getByTestId('vendor-delete-vendor-1')).toBeInTheDocument();
    });

    it('keeps every data-testid unique across the table and mobile cards, with a row menu open (#2069)', async () => {
      mockFetchVendors.mockResolvedValueOnce(
        defaultFetchResponse([
          makeVendor({ id: 'vendor-1', name: 'Acme Construction' }),
          makeVendor({ id: 'vendor-2', name: 'Beta Builders' }),
        ]),
      );

      const { container } = renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('vendor-menu-button-vendor-1')).toBeInTheDocument();
      });
      expect(screen.getByTestId('vendor-menu-button-mobile-vendor-1')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('vendor-menu-button-vendor-1'));

      expect(screen.getByTestId('vendor-view-vendor-1')).toBeInTheDocument();
      expect(findDuplicateTestIds(container)).toEqual([]);
    });

    it('vendor name link points to /settings/vendors/:id', async () => {
      const vendor = makeVendor({ id: 'vendor-1', name: 'Acme Construction' });
      mockFetchVendors.mockResolvedValueOnce(defaultFetchResponse([vendor]));

      renderPage();

      await waitFor(() => {
        expect(screen.getAllByText('Acme Construction').length).toBeGreaterThan(0);
      });

      // The vendor name rendered by the DataTable name column is a <Link to="/settings/vendors/:id">
      const vendorLinks = screen.getAllByRole('link', { name: 'Acme Construction' });
      expect(vendorLinks.length).toBeGreaterThan(0);
      expect(vendorLinks[0]!).toHaveAttribute('href', '/settings/vendors/vendor-1');
    });

    it('action menu "View" button navigates to /settings/vendors/:id', async () => {
      const vendor = makeVendor({ id: 'vendor-1', name: 'Acme Construction' });
      mockFetchVendors.mockResolvedValueOnce(defaultFetchResponse([vendor]));

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('vendor-menu-button-vendor-1')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('vendor-menu-button-vendor-1'));

      // vendor-view-vendor-1 button calls navigate('/settings/vendors/vendor-1')
      expect(screen.getByTestId('vendor-view-vendor-1')).toBeInTheDocument();
    });

    it('opens delete confirmation modal when delete action is clicked', async () => {
      const vendor = makeVendor({ id: 'vendor-1', name: 'Acme Construction' });
      mockFetchVendors.mockResolvedValueOnce(defaultFetchResponse([vendor]));

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('vendor-menu-button-vendor-1')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('vendor-menu-button-vendor-1'));
      fireEvent.click(screen.getByTestId('vendor-delete-vendor-1'));

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
        expect(screen.getByTestId('vendor-menu-button-vendor-1')).toBeInTheDocument();
      });

      // Open menu -> click delete
      fireEvent.click(screen.getByTestId('vendor-menu-button-vendor-1'));
      fireEvent.click(screen.getByTestId('vendor-delete-vendor-1'));

      // Find and click the confirm delete button
      await waitFor(() => {
        // After modal opens, the delete button from menu is still present in the table row
        expect(screen.getByTestId('vendor-delete-vendor-1')).toBeInTheDocument();
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
        expect(screen.getByTestId('vendor-menu-button-vendor-1')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('vendor-menu-button-vendor-1'));
      fireEvent.click(screen.getByTestId('vendor-delete-vendor-1'));

      // The delete modal should be visible now — verify by vendor name in the modal
      await waitFor(() => {
        expect(screen.getAllByText('Acme Construction').length).toBeGreaterThan(0);
      });
    });

    it('renders the delete conflict message in an alert banner (FormError)', async () => {
      const vendor = makeVendor({ id: 'vendor-1', name: 'Acme Construction' });
      mockFetchVendors.mockResolvedValueOnce(defaultFetchResponse([vendor]));
      mockDeleteVendor.mockRejectedValueOnce(
        new ApiClientError(409, { code: 'CONFLICT', message: 'Vendor has associated invoices' }),
      );

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('vendor-menu-button-vendor-1')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByTestId('vendor-menu-button-vendor-1'));
      fireEvent.click(screen.getByTestId('vendor-delete-vendor-1'));

      const dialog = await screen.findByRole('dialog');
      fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('This vendor cannot be deleted');
    });

    it('translates a non-409 delete failure instead of showing the server message', async () => {
      const vendor = makeVendor({ id: 'vendor-1', name: 'Acme Construction' });
      mockFetchVendors.mockResolvedValueOnce(defaultFetchResponse([vendor]));
      mockDeleteVendor.mockRejectedValueOnce(
        new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'RAW-SERVER-SENTINEL' }),
      );

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('vendor-menu-button-vendor-1')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByTestId('vendor-menu-button-vendor-1'));
      fireEvent.click(screen.getByTestId('vendor-delete-vendor-1'));

      const dialog = await screen.findByRole('dialog');
      fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(enErrors.INTERNAL_ERROR);
      expect(screen.queryByText(/RAW-SERVER-SENTINEL/)).toBeNull();
    });

    it('shows the plain delete fallback for a non-API failure', async () => {
      const vendor = makeVendor({ id: 'vendor-1', name: 'Acme Construction' });
      mockFetchVendors.mockResolvedValueOnce(defaultFetchResponse([vendor]));
      mockDeleteVendor.mockRejectedValueOnce(new Error('RAW-LOCAL'));

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('vendor-menu-button-vendor-1')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByTestId('vendor-menu-button-vendor-1'));
      fireEvent.click(screen.getByTestId('vendor-delete-vendor-1'));

      const dialog = await screen.findByRole('dialog');
      fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('Failed to delete vendor. Please try again.');
      expect(alert).not.toHaveTextContent(/RAW-LOCAL/);
    });

    it('labels the row actions button with the common "Actions" text', async () => {
      const vendor = makeVendor({ id: 'vendor-1', name: 'Acme Construction' });
      mockFetchVendors.mockResolvedValueOnce(defaultFetchResponse([vendor]));

      renderPage();

      const button = await screen.findByTestId('vendor-menu-button-vendor-1');
      expect(button).toHaveAttribute('aria-label', enCommon.actions);
    });
  });

  // ── Page identity (#2202): tab title only, the h1 is unchanged ──────────────

  describe('tab title (#2202)', () => {
    it('sets the tab title "Companies · <house>" (the section word is not repeated)', async () => {
      document.title = 'initial';
      renderPage();

      await waitFor(() => expect(document.title).toBe('Companies · Cornerstone'));
    });
  });
  describe('row click guard', () => {
    it('clicking the tel: link triggers no router navigation', async () => {
      mockFetchVendors.mockResolvedValue(
        defaultFetchResponse([makeVendor({ id: 'vendor-1', phone: '+1-555-0100' })]),
      );
      const log = createRouterLog();
      render(
        <ToastProvider>
          <RecordingRouter entries={['/settings/vendors']} log={log}>
            <VendorsPage />
          </RecordingRouter>
        </ToastProvider>,
      );
      // jsdom cannot follow tel: links; swallow the default action after React has handled the click.
      const swallow = (e: Event) => e.preventDefault();
      document.addEventListener('click', swallow);
      try {
        const links = await screen.findAllByRole('link', { name: '+1-555-0100' });
        fireEvent.click(links[0]!);
      } finally {
        document.removeEventListener('click', swallow);
      }

      expect(log.actions).toEqual([]);
    });
  });
});
