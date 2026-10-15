/**
 * @jest-environment jsdom
 */
/**
 * Component tests for HouseholdItemsPage.tsx
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { makeSearchCompanies } from '../../test/companySearchMock.js';
import { screen, waitFor, render, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation, useNavigationType } from 'react-router-dom';
import { ToastProvider } from '../../components/Toast/ToastContext.js';
import type * as HouseholdItemsApiTypes from '../../lib/householdItemsApi.js';
import type * as VendorsApiTypes from '../../lib/vendorsApi.js';
import type * as DeleteImpactApiTypes from '../../lib/deleteImpactApi.js';
import type * as HouseholdItemCategoriesApiTypes from '../../lib/householdItemCategoriesApi.js';
import type * as UseAreasTypes from '../../hooks/useAreas.js';
import type * as PreferencesApiTypes from '../../lib/preferencesApi.js';
import type { HouseholdItemSummary } from '@cornerstone/shared';
import { ApiClientError, NetworkError } from '../../lib/apiClient.js';
import { HOUSEHOLD_ITEM_STATUSES } from '@cornerstone/shared';
import enErrors from '../../i18n/en/errors.json';
import enCommon from '../../i18n/en/common.json';
import { findDuplicateTestIds } from '../../test/findDuplicateTestIds.js';
import { RecordingRouter, createRouterLog } from '../../test/recordingRouter.js';
import { ShortcutSnapshot } from '../../test/shortcutSnapshot.js';
import { ShortcutRegistryProvider } from '../../hooks/shortcutRegistry.js';

// ─── Mock modules BEFORE importing component ────────────────────────────────

// Mock preferencesApi — DataTable calls useColumnPreferences -> usePreferences -> listPreferences
const mockListPreferencesHI = jest
  .fn<typeof PreferencesApiTypes.listPreferences>()
  .mockResolvedValue([]);
jest.unstable_mockModule('../../lib/preferencesApi.js', () => ({
  listPreferences: mockListPreferencesHI,
  upsertPreference: jest
    .fn<typeof PreferencesApiTypes.upsertPreference>()
    .mockResolvedValue({ key: '', value: '', updatedAt: '' }),
  deletePreference: jest
    .fn<typeof PreferencesApiTypes.deletePreference>()
    .mockResolvedValue(undefined),
}));

const mockListHouseholdItems = jest.fn<typeof HouseholdItemsApiTypes.listHouseholdItems>();
const mockDeleteHouseholdItem = jest.fn<typeof HouseholdItemsApiTypes.deleteHouseholdItem>();
const mockFetchDeleteImpact = jest.fn<typeof DeleteImpactApiTypes.fetchDeleteImpact>();

jest.unstable_mockModule('../../lib/deleteImpactApi.js', () => ({
  fetchDeleteImpact: mockFetchDeleteImpact,
}));

jest.unstable_mockModule('../../lib/householdItemsApi.js', () => ({
  listHouseholdItems: mockListHouseholdItems,
  deleteHouseholdItem: mockDeleteHouseholdItem,
  getHouseholdItem: jest.fn(),
  createHouseholdItem: jest.fn(),
  updateHouseholdItem: jest.fn(),
}));

const mockFetchVendors = jest.fn<typeof VendorsApiTypes.fetchVendors>();
const mockFetchVendor = jest.fn<typeof VendorsApiTypes.fetchVendor>();

jest.unstable_mockModule('../../lib/vendorsApi.js', () => ({
  fetchVendors: mockFetchVendors,
  searchCompanies: makeSearchCompanies(mockFetchVendors),
  fetchVendor: mockFetchVendor,
  createVendor: jest.fn(),
  updateVendor: jest.fn(),
  deleteVendor: jest.fn(),
}));

const mockFetchHouseholdItemCategories =
  jest.fn<typeof HouseholdItemCategoriesApiTypes.fetchHouseholdItemCategories>();

jest.unstable_mockModule('../../lib/householdItemCategoriesApi.js', () => ({
  fetchHouseholdItemCategories: mockFetchHouseholdItemCategories,
  createHouseholdItemCategory: jest.fn(),
  updateHouseholdItemCategory: jest.fn(),
  deleteHouseholdItemCategory: jest.fn(),
}));

const mockUseAreas = jest.fn<typeof UseAreasTypes.useAreas>();

jest.unstable_mockModule('../../hooks/useAreas.js', () => ({
  useAreas: mockUseAreas,
}));

// Mock useTableState — use a stable Map reference to prevent infinite useEffect re-renders.
const stableFiltersHI = new Map<string, { value: string }>();
const mockSetFilterHI = jest.fn<(key: string, value: string | null) => void>();
jest.unstable_mockModule('../../hooks/useTableState.js', () => ({
  useTableState: () => ({
    tableState: {
      search: '',
      filters: stableFiltersHI,
      sortBy: null,
      sortDir: null,
      page: 1,
      pageSize: 25,
    },
    searchInput: '',
    setSearch: jest.fn(),
    toApiParams: jest.fn(() => ({})),
    setFilter: mockSetFilterHI,
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

const makeHouseholdItem = (
  overrides: Partial<HouseholdItemSummary> = {},
): HouseholdItemSummary => ({
  id: 'hi-1',
  name: 'Living Room Sofa',
  description: null,
  category: 'hic-furniture',
  status: 'planned',
  vendor: null,
  area: null,
  quantity: 1,
  orderDate: null,
  actualDeliveryDate: null,
  earliestDeliveryDate: null,
  latestDeliveryDate: null,
  targetDeliveryDate: null,
  isLate: false,
  url: null,
  budgetLineCount: 0,
  totalPlannedAmount: 1500,
  budgetSummary: {
    totalPlanned: 1500,
    totalActual: 0,
    subsidyReduction: 0,
    netCost: 1500,
  },
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

const defaultListResponse = (items: HouseholdItemSummary[] = []) => ({
  items,
  pagination: makePagination({ totalItems: items.length }),
  filterMeta: {},
});

// ─── Component import (must be after mocks) ──────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let HouseholdItemsPage: any;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderPage() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={['/project/household-items']}>
        <HouseholdItemsPage />
      </MemoryRouter>
    </ToastProvider>,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('HouseholdItemsPage', () => {
  beforeEach(async () => {
    if (!HouseholdItemsPage) {
      const module = await import('./HouseholdItemsPage.js');
      HouseholdItemsPage = module.HouseholdItemsPage;
    }
    // Reset mocks to clear call history AND queued Once implementations from prior tests.
    mockListHouseholdItems.mockReset();
    mockDeleteHouseholdItem.mockReset();
    mockFetchDeleteImpact.mockReset();
    mockFetchDeleteImpact.mockResolvedValue({
      entityType: 'household_item',
      id: 'hi-1',
      effects: [],
    });
    mockFetchVendors.mockReset();
    mockFetchVendor.mockReset();
    mockSetFilterHI.mockReset();
    stableFiltersHI.clear();
    mockFetchHouseholdItemCategories.mockReset();
    mockListPreferencesHI.mockReset();
    mockListPreferencesHI.mockResolvedValue([]);
    mockUseAreas.mockReturnValue({
      areas: [],
      isLoading: false,
      error: null,
      refetch: jest.fn(),
      createArea: jest.fn<UseAreasTypes.UseAreasResult['createArea']>(),
      updateArea: jest.fn<UseAreasTypes.UseAreasResult['updateArea']>(),
      deleteArea: jest.fn<UseAreasTypes.UseAreasResult['deleteArea']>(),
    });
    mockListHouseholdItems.mockResolvedValue(defaultListResponse());
    mockFetchVendors.mockResolvedValue({
      vendors: [],
      pagination: makePagination(),
    });
    mockFetchHouseholdItemCategories.mockResolvedValue({
      categories: [],
    });
    mockDeleteHouseholdItem.mockResolvedValue(undefined);
  });

  describe('loading state', () => {
    it('shows loading skeleton while household items are being fetched', () => {
      mockListHouseholdItems.mockImplementationOnce(
        () => new Promise((resolve) => setTimeout(() => resolve(defaultListResponse()), 200)),
      );

      renderPage();

      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('hides loading skeleton after household items load', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
      });
    });
  });

  describe('data display', () => {
    it('renders the "New Household Item" button', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('new-household-item-button')).toBeInTheDocument();
      });
    });

    it('renders household item names as links when items are loaded', async () => {
      const item = makeHouseholdItem({ name: 'Living Room Sofa', id: 'hi-1' });
      mockListHouseholdItems.mockResolvedValueOnce(defaultListResponse([item]));

      renderPage();

      // DataTable renders both table rows and mobile cards — use getAllByText.
      await waitFor(() => {
        expect(screen.getAllByText('Living Room Sofa').length).toBeGreaterThan(0);
      });
    });

    it('renders multiple household items', async () => {
      const items = [
        makeHouseholdItem({ id: 'hi-1', name: 'Living Room Sofa' }),
        makeHouseholdItem({ id: 'hi-2', name: 'Dining Table' }),
      ];
      mockListHouseholdItems.mockResolvedValueOnce(defaultListResponse(items));

      renderPage();

      // DataTable renders both table rows and mobile cards — use getAllByText.
      await waitFor(() => {
        expect(screen.getAllByText('Living Room Sofa').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Dining Table').length).toBeGreaterThan(0);
      });
    });

    it.each(HOUSEHOLD_ITEM_STATUSES)(
      'renders the %s status badge with the shared Badge class and canonical word (D-08)',
      async (status) => {
        mockListHouseholdItems.mockResolvedValueOnce(
          defaultListResponse([makeHouseholdItem({ id: 'hi-1', name: 'Sample Sofa', status })]),
        );
        renderPage();
        const label = enCommon.statusVocabulary.purchase[status];
        await waitFor(() => {
          expect(screen.getAllByText(label).length).toBeGreaterThan(0);
        });
        const badge = screen.getAllByText(label).find((el) => el.className.includes('badge'));
        expect(badge).toBeDefined();
        expect(badge!.className).toContain(status);
        expect(badge!.className).not.toContain('badge-');
      },
    );

    it('status filter lists HOUSEHOLD_ITEM_STATUSES in order with translated labels', async () => {
      renderPage();
      fireEvent.click((await screen.findAllByRole('button', { name: /filter by status/i }))[0]!);
      const dialog = await screen.findByRole('dialog', { name: /filter by status/i });
      const rows = Array.from(dialog.querySelectorAll('label')).map((label) => [
        label.querySelector('input')?.id,
        label.querySelector('span')?.textContent,
      ]);

      expect(rows).toEqual(
        HOUSEHOLD_ITEM_STATUSES.map((status) => [
          `enum-${status}`,
          enCommon.statusVocabulary.purchase[status],
        ]),
      );
    });

    it('calls listHouseholdItems on mount', async () => {
      renderPage();

      await waitFor(() => {
        expect(mockListHouseholdItems).toHaveBeenCalled();
      });
    });

    it('loads no companies on mount (the company filter searches the server instead)', async () => {
      renderPage();

      await waitFor(() => {
        expect(mockListHouseholdItems).toHaveBeenCalled();
      });

      expect(mockFetchVendors).not.toHaveBeenCalled();
      expect(mockFetchVendor).not.toHaveBeenCalled();
    });

    it('calls fetchHouseholdItemCategories on mount to populate category filter options', async () => {
      renderPage();

      await waitFor(() => {
        expect(mockFetchHouseholdItemCategories).toHaveBeenCalled();
      });
    });

    it('renders action menu button for each item', async () => {
      const item = makeHouseholdItem({ id: 'hi-1', name: 'Living Room Sofa' });
      mockListHouseholdItems.mockResolvedValueOnce(defaultListResponse([item]));

      renderPage();

      // DataTable renders actions in both table rows and mobile cards; the testids are disjoint
      // (`-mobile-` infix via dataTableTestId), so getByTestId targets the table instance.
      await waitFor(() => {
        expect(screen.getByTestId('hi-menu-button-hi-1')).toBeInTheDocument();
      });
    });
  });

  describe('error state', () => {
    it('shows error message when listHouseholdItems fails with ApiClientError', async () => {
      const error = new ApiClientError(500, {
        code: 'INTERNAL_ERROR',
        message: 'RAW-SERVER-SENTINEL',
      });
      mockListHouseholdItems.mockRejectedValueOnce(error);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText(enErrors.INTERNAL_ERROR)).toBeInTheDocument();
      });
      expect(screen.queryByText(/RAW-SERVER-SENTINEL/)).toBeNull();
    });

    it('shows the network copy when listHouseholdItems fails with a NetworkError', async () => {
      mockListHouseholdItems.mockRejectedValueOnce(
        new NetworkError('RAW-LOCAL', new Error('cause')),
      );

      renderPage();

      await waitFor(() => {
        expect(screen.getByText(enCommon.requestErrors.network)).toBeInTheDocument();
      });
      expect(screen.queryByText(/RAW-LOCAL/)).toBeNull();
    });

    it('shows the generic load error (not the local text) for a plain Error', async () => {
      mockListHouseholdItems.mockRejectedValueOnce(new Error('RAW-LOCAL'));

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
      expect(screen.queryByText(/RAW-LOCAL/)).toBeNull();
    });

    it('does not crash when fetchVendors fails (graceful degradation)', async () => {
      mockFetchVendors.mockRejectedValueOnce(new Error('Vendors failed to load'));

      // Should not throw
      renderPage();

      await waitFor(() => {
        // Page still renders; vendor filter options just won't be populated
        expect(screen.getByTestId('new-household-item-button')).toBeInTheDocument();
      });
    });
  });

  describe('action menu', () => {
    it('shows view and delete options when action menu is opened', async () => {
      const item = makeHouseholdItem({ id: 'hi-1', name: 'Living Room Sofa' });
      mockListHouseholdItems.mockResolvedValueOnce(defaultListResponse([item]));

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('hi-menu-button-hi-1')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('hi-menu-button-hi-1'));

      expect(screen.getByTestId('hi-view-hi-1')).toBeInTheDocument();
      expect(screen.getByTestId('hi-delete-hi-1')).toBeInTheDocument();
    });

    it('keeps every data-testid unique across the table and mobile cards, with a row menu open (#2069)', async () => {
      mockListHouseholdItems.mockResolvedValueOnce(
        defaultListResponse([
          makeHouseholdItem({ id: 'hi-1', name: 'Living Room Sofa' }),
          makeHouseholdItem({ id: 'hi-2', name: 'Dining Table' }),
        ]),
      );

      const { container } = renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('hi-menu-button-hi-1')).toBeInTheDocument();
      });
      expect(screen.getByTestId('hi-menu-button-mobile-hi-1')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('hi-menu-button-hi-1'));

      expect(screen.getByTestId('hi-view-hi-1')).toBeInTheDocument();
      expect(findDuplicateTestIds(container)).toEqual([]);
    });

    it('opens delete confirmation modal when delete is clicked from menu', async () => {
      const item = makeHouseholdItem({ id: 'hi-1', name: 'Living Room Sofa' });
      mockListHouseholdItems.mockResolvedValueOnce(defaultListResponse([item]));

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('hi-menu-button-hi-1')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('hi-menu-button-hi-1'));
      fireEvent.click(screen.getByTestId('hi-delete-hi-1'));

      await waitFor(() => {
        // The delete modal renders the item name in bold
        const boldItems = screen.getAllByText('Living Room Sofa');
        expect(boldItems.length).toBeGreaterThan(0);
      });
    });
  });

  describe('delete household item', () => {
    async function confirmDelete() {
      const btn = await screen.findByTestId('purchase-list-delete-confirm');
      await waitFor(() => expect(btn).not.toHaveAttribute('aria-disabled'));
      fireEvent.click(btn);
    }

    async function openDialog() {
      const item = makeHouseholdItem({ id: 'hi-1', name: 'Living Room Sofa' });
      mockListHouseholdItems.mockResolvedValueOnce(defaultListResponse([item]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId('hi-menu-button-hi-1')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByTestId('hi-menu-button-hi-1'));
      fireEvent.click(screen.getByTestId('hi-delete-hi-1'));
    }

    it('opens an alertdialog titled with the purchase, Cancel focused', async () => {
      await openDialog();
      expect(
        await screen.findByRole('alertdialog', { name: 'Delete Living Room Sofa?' }),
      ).toBeInTheDocument();
      expect(screen.getByTestId('purchase-list-delete-cancel')).toHaveFocus();
    });

    it('lists what the delete also changes', async () => {
      mockFetchDeleteImpact.mockResolvedValue({
        entityType: 'household_item',
        id: 'hi-1',
        effects: [
          { kind: 'costLines', count: 2 },
          { kind: 'documentLinks', count: 0 },
        ],
      });
      await openDialog();
      await waitFor(() =>
        expect(screen.getByTestId('purchase-list-delete-consequences')).toHaveTextContent(
          'Cost lines deleted with it: 2',
        ),
      );
      expect(screen.queryByText(/Linked documents/)).toBeNull();
      expect(mockFetchDeleteImpact).toHaveBeenCalledWith('household_item', 'hi-1');
    });

    it('a 409 hides the action', async () => {
      mockDeleteHouseholdItem.mockRejectedValueOnce(
        new ApiClientError(409, { code: 'CONFLICT', message: 'x' }),
      );
      await openDialog();
      await confirmDelete();
      await waitFor(() => expect(screen.queryByTestId('purchase-list-delete-confirm')).toBeNull());
      expect(screen.getByTestId('purchase-list-delete-cancel')).toBeInTheDocument();
    });

    it('a non-409 failure keeps the action for a retry', async () => {
      mockDeleteHouseholdItem.mockRejectedValueOnce(new Error('boom'));
      await openDialog();
      await confirmDelete();
      await screen.findByRole('alert');
      expect(screen.getByTestId('purchase-list-delete-confirm')).toBeInTheDocument();
    });

    it('calls deleteHouseholdItem API when deletion is confirmed', async () => {
      const item = makeHouseholdItem({ id: 'hi-1', name: 'Living Room Sofa' });
      mockListHouseholdItems.mockResolvedValueOnce(defaultListResponse([item]));
      mockListHouseholdItems.mockResolvedValueOnce(defaultListResponse([]));

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('hi-menu-button-hi-1')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('hi-menu-button-hi-1'));
      fireEvent.click(screen.getByTestId('hi-delete-hi-1'));

      await waitFor(() => {
        const boldItems = screen.getAllByText('Living Room Sofa');
        expect(boldItems.length).toBeGreaterThan(0);
      });

      await confirmDelete();

      await waitFor(() => {
        expect(mockDeleteHouseholdItem).toHaveBeenCalledWith('hi-1');
      });
    });

    it.each([
      [
        'NetworkError',
        () => new NetworkError('RAW-LOCAL', new Error('cause')),
        enCommon.requestErrors.network,
      ],
      [
        'plain Error',
        () => new Error('RAW-LOCAL'),
        'Failed to delete household item. Please try again.',
      ],
    ])(
      'shows the translated copy when deleteHouseholdItem fails with a %s',
      async (_n, make, expected) => {
        const item = makeHouseholdItem({ id: 'hi-1', name: 'Living Room Sofa' });
        mockListHouseholdItems.mockResolvedValueOnce(defaultListResponse([item]));
        mockDeleteHouseholdItem.mockRejectedValueOnce(make());

        renderPage();

        await waitFor(() => {
          expect(screen.getByTestId('hi-menu-button-hi-1')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByTestId('hi-menu-button-hi-1'));
        fireEvent.click(screen.getByTestId('hi-delete-hi-1'));

        await confirmDelete();

        await waitFor(() => {
          expect(screen.getByRole('alert')).toHaveTextContent(expected);
        });
        expect(screen.queryByText(/RAW-LOCAL/)).toBeNull();
      },
    );

    it('shows API error when deleteHouseholdItem fails', async () => {
      const item = makeHouseholdItem({ id: 'hi-1', name: 'Living Room Sofa' });
      mockListHouseholdItems.mockResolvedValueOnce(defaultListResponse([item]));
      const error = new ApiClientError(409, {
        code: 'CONFLICT',
        message: 'RAW-SERVER-SENTINEL',
      });
      mockDeleteHouseholdItem.mockRejectedValueOnce(error);

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('hi-menu-button-hi-1')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('hi-menu-button-hi-1'));
      fireEvent.click(screen.getByTestId('hi-delete-hi-1'));

      await waitFor(() => {
        const boldItems = screen.getAllByText('Living Room Sofa');
        expect(boldItems.length).toBeGreaterThan(0);
      });

      await confirmDelete();

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText(enErrors.CONFLICT)).toBeInTheDocument();
        expect(screen.queryByText(/RAW-SERVER-SENTINEL/)).toBeNull();
      });
    });

    it('closes delete modal when cancel is clicked', async () => {
      const item = makeHouseholdItem({ id: 'hi-1', name: 'Living Room Sofa' });
      mockListHouseholdItems.mockResolvedValueOnce(defaultListResponse([item]));

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('hi-menu-button-hi-1')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('hi-menu-button-hi-1'));
      fireEvent.click(screen.getByTestId('hi-delete-hi-1'));

      await waitFor(() => {
        // Modal is open
        const boldItems = screen.getAllByText('Living Room Sofa');
        expect(boldItems.length).toBeGreaterThan(0);
      });

      fireEvent.click(screen.getByTestId('purchase-list-delete-cancel'));
      expect(screen.queryByRole('alertdialog')).toBeNull();

      // Delete API should NOT have been called
      expect(mockDeleteHouseholdItem).not.toHaveBeenCalled();
    });
  });

  describe('areas integration', () => {
    it('uses areas from useAreas hook for filter options', async () => {
      const areas = [
        {
          id: 'area-1',
          name: 'Living Room',
          parentId: null,
          color: null,
          description: null,
          sortOrder: 0,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ];
      mockUseAreas.mockReturnValueOnce({
        areas,
        isLoading: false,
        error: null,
        refetch: jest.fn(),
        createArea: jest.fn<UseAreasTypes.UseAreasResult['createArea']>(),
        updateArea: jest.fn<UseAreasTypes.UseAreasResult['updateArea']>(),
        deleteArea: jest.fn<UseAreasTypes.UseAreasResult['deleteArea']>(),
      });

      renderPage();

      // The hook should be called
      await waitFor(() => {
        expect(mockUseAreas).toHaveBeenCalled();
      });
    });
  });

  // ── Page identity (#2202) ──────────────────────────────────────────────────

  describe('page identity (#2202)', () => {
    function Probe() {
      const location = useLocation();
      const type = useNavigationType();
      return (
        <>
          <div data-testid="probe-type">{type}</div>
          <div data-testid="probe-search">{location.search}</div>
        </>
      );
    }

    function renderWithProbe() {
      return render(
        <ToastProvider>
          <MemoryRouter initialEntries={['/project/household-items']}>
            <HouseholdItemsPage />
            <Probe />
          </MemoryRouter>
        </ToastProvider>,
      );
    }

    it('shows exactly one h1 "Purchases" and sets the tab title', async () => {
      renderPage();

      expect(await screen.findByRole('heading', { name: 'Purchases', level: 1 })).toBeVisible();
      expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
      await waitFor(() => expect(document.title).toBe('Purchases · Cornerstone'));
    });

    it('is a view: it renders no "You are here" trail and no Back link', async () => {
      renderPage();

      await screen.findByRole('heading', { name: 'Purchases', level: 1 });
      expect(screen.queryByRole('navigation', { name: 'You are here' })).not.toBeInTheDocument();
      expect(screen.queryByTestId('breadcrumbs')).not.toBeInTheDocument();
    });

    it('does not push a history entry on mount', async () => {
      renderWithProbe();

      await screen.findByRole('heading', { name: 'Purchases', level: 1 });
      expect(screen.getByTestId('probe-type')).toHaveTextContent('POP');
    });

    it('replaces (not pushes) the history entry when a filter changes', async () => {
      renderWithProbe();

      fireEvent.click((await screen.findAllByRole('button', { name: /filter by status/i }))[0]!);
      const dialog = await screen.findByRole('dialog', { name: /filter by status/i });
      fireEvent.click(dialog.querySelector('input') as HTMLInputElement);

      await waitFor(() => expect(screen.getByTestId('probe-search')).toHaveTextContent('status='));
      expect(screen.getByTestId('probe-type')).toHaveTextContent('REPLACE');
    });
  });

  describe('company filter (entity filter, server search)', () => {
    afterEach(() => {
      stableFiltersHI.clear();
    });

    const openVendorFilter = async (user: ReturnType<typeof userEvent.setup>) => {
      await user.click(await screen.findByRole('button', { name: /filter by vendor/i }));
      return within(await screen.findByRole('dialog'));
    };

    it('searches companies on the server when the filter picker is used', async () => {
      const user = userEvent.setup();
      mockFetchVendors.mockImplementation(async (params) => ({
        vendors:
          params?.q === 'zeta'
            ? ([{ id: 'v-250', name: 'Zeta Tiling', trade: null }] as never)
            : [],
        pagination: { page: 1, pageSize: 50, totalItems: 1, totalPages: 1 },
      }));
      let search = '';
      function Probe() {
        search = useLocation().search;
        return null;
      }
      render(
        <ToastProvider>
          <MemoryRouter initialEntries={['/project/household-items']}>
            <HouseholdItemsPage />
            <Probe />
          </MemoryRouter>
        </ToastProvider>,
      );
      const dialog = await openVendorFilter(user);

      await user.type(dialog.getByRole('textbox'), 'zeta');
      await user.click(await screen.findByRole('option', { name: 'Zeta Tiling' }));

      expect(mockFetchVendors).toHaveBeenCalledWith(
        { q: 'zeta', pageSize: 50 },
        { signal: expect.any(AbortSignal) },
      );
      expect(new URLSearchParams(search).get('vendorId')).toBe('v-250');
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('resolves the label of ?vendorId=<id> with GET /vendors/:id', async () => {
      const user = userEvent.setup();
      stableFiltersHI.set('vendorId', { value: 'v-250' });
      mockFetchVendor.mockResolvedValue({ id: 'v-250', name: 'Zeta Tiling' } as never);
      renderPage();

      await waitFor(() => expect(mockFetchVendor).toHaveBeenCalledWith('v-250'));
      const dialog = await openVendorFilter(user);

      expect(await dialog.findByText('Zeta Tiling')).toBeInTheDocument();
      expect(mockSetFilterHI).not.toHaveBeenCalled();
    });

    it('drops an unknown (404) company from the URL filter', async () => {
      stableFiltersHI.set('vendorId', { value: 'v-gone' });
      mockFetchVendor.mockRejectedValue(
        new ApiClientError(404, { code: 'NOT_FOUND', message: 'x' }),
      );
      renderPage();

      await waitFor(() => expect(mockSetFilterHI).toHaveBeenCalledWith('vendorId', null));
      expect(mockSetFilterHI).toHaveBeenCalledTimes(1);
    });

    it('keeps the URL filter when the company lookup fails with a server error', async () => {
      stableFiltersHI.set('vendorId', { value: 'v-1' });
      mockFetchVendor.mockRejectedValue(
        new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'x' }),
      );
      renderPage();

      await waitFor(() => expect(mockFetchVendor).toHaveBeenCalledTimes(1));
      await Promise.resolve();

      expect(mockSetFilterHI).not.toHaveBeenCalled();
    });
  });
});

describe('HouseholdItemsPage create openers (#2212)', () => {
  function renderAt(entry = '/project/household-items?x=1') {
    const log = createRouterLog();
    render(
      <ToastProvider>
        <RecordingRouter entries={[entry]} log={log}>
          <HouseholdItemsPage />
        </RecordingRouter>
      </ToastProvider>,
    );
    return log;
  }

  function expectDialogPush(log: ReturnType<typeof createRouterLog>) {
    expect(log.actions).toEqual(['PUSH /project/household-items/new']);
    expect(log.states[0]).toMatchObject({
      origin: { to: '/project/household-items?x=1' },
      background: { pathname: '/project/household-items', search: '?x=1' },
    });
  }

  it('the primary button opens the New purchase dialog over the list', async () => {
    const log = renderAt();
    fireEvent.click(await screen.findByTestId('new-household-item-button'));
    expectDialogPush(log);
  });

  it('the empty-state action opens the New purchase dialog over the list', async () => {
    const log = renderAt();
    fireEvent.click(await screen.findByRole('button', { name: 'Create First Item' }));
    expectDialogPush(log);
  });

  it('the n shortcut opens the same New purchase dialog as the primary button (#2211)', async () => {
    const log = renderAt();
    await screen.findByTestId('new-household-item-button');
    fireEvent.keyDown(document, { key: 'n' });
    expectDialogPush(log);
  });

  it('n typed into the list search field does not open the dialog (#2211)', async () => {
    const log = renderAt();
    await screen.findByTestId('new-household-item-button');
    fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'n' });
    expect(log.actions).toEqual([]);
  });

  it('n with a modifier key does not open the dialog (#2211)', async () => {
    const log = renderAt();
    await screen.findByTestId('new-household-item-button');
    fireEvent.keyDown(document, { key: 'n', ctrlKey: true });
    expect(log.actions).toEqual([]);
  });

  it('registers its n shortcut with the New purchase description (#2211)', async () => {
    const log = createRouterLog();
    render(
      <ShortcutRegistryProvider>
        <ToastProvider>
          <RecordingRouter entries={['/project/household-items']} log={log}>
            <HouseholdItemsPage />
            <ShortcutSnapshot />
          </RecordingRouter>
        </ToastProvider>
      </ShortcutRegistryProvider>,
    );
    await screen.findByTestId('new-household-item-button');
    fireEvent.click(screen.getByTestId('shortcut-snapshot'));
    expect(screen.getByTestId('shortcut-snapshot-out').textContent).toContain('n:New purchase');
  });
});
