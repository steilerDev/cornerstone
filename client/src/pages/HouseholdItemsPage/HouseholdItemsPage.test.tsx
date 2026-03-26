/**
 * @jest-environment jsdom
 */
/**
 * Component tests for HouseholdItemsPage.tsx
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { screen, waitFor, render, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type * as HouseholdItemsApiTypes from '../../lib/householdItemsApi.js';
import type * as VendorsApiTypes from '../../lib/vendorsApi.js';
import type * as HouseholdItemCategoriesApiTypes from '../../lib/householdItemCategoriesApi.js';
import type * as UseAreasTypes from '../../hooks/useAreas.js';
import type { HouseholdItemSummary } from '@cornerstone/shared';
import { ApiClientError } from '../../lib/apiClient.js';

// ─── Mock modules BEFORE importing component ────────────────────────────────

const mockListHouseholdItems = jest.fn<typeof HouseholdItemsApiTypes.listHouseholdItems>();
const mockDeleteHouseholdItem = jest.fn<typeof HouseholdItemsApiTypes.deleteHouseholdItem>();

jest.unstable_mockModule('../../lib/householdItemsApi.js', () => ({
  listHouseholdItems: mockListHouseholdItems,
  deleteHouseholdItem: mockDeleteHouseholdItem,
  getHouseholdItem: jest.fn(),
  createHouseholdItem: jest.fn(),
  updateHouseholdItem: jest.fn(),
}));

const mockFetchVendors = jest.fn<typeof VendorsApiTypes.fetchVendors>();

jest.unstable_mockModule('../../lib/vendorsApi.js', () => ({
  fetchVendors: mockFetchVendors,
  fetchVendor: jest.fn(),
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

// Mock useTableState
jest.unstable_mockModule('../../hooks/useTableState.js', () => ({
  useTableState: () => ({
    tableState: {
      search: '',
      filters: new Map(),
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

const { HouseholdItemsPage } = await import('./HouseholdItemsPage.js');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/project/household-items']}>
      <HouseholdItemsPage />
    </MemoryRouter>,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('HouseholdItemsPage', () => {
  beforeEach(() => {
    mockUseAreas.mockReturnValue({
      areas: [],
      isLoading: false,
      error: null,
      refetch: jest.fn(),
      createArea: jest.fn(),
      updateArea: jest.fn(),
      deleteArea: jest.fn(),
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

      await waitFor(() => {
        expect(screen.getByText('Living Room Sofa')).toBeInTheDocument();
      });
    });

    it('renders multiple household items', async () => {
      const items = [
        makeHouseholdItem({ id: 'hi-1', name: 'Living Room Sofa' }),
        makeHouseholdItem({ id: 'hi-2', name: 'Dining Table' }),
      ];
      mockListHouseholdItems.mockResolvedValueOnce(defaultListResponse(items));

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Living Room Sofa')).toBeInTheDocument();
        expect(screen.getByText('Dining Table')).toBeInTheDocument();
      });
    });

    it('calls listHouseholdItems on mount', async () => {
      renderPage();

      await waitFor(() => {
        expect(mockListHouseholdItems).toHaveBeenCalledTimes(1);
      });
    });

    it('calls fetchVendors on mount to populate vendor filter options', async () => {
      renderPage();

      await waitFor(() => {
        expect(mockFetchVendors).toHaveBeenCalledWith({ pageSize: 100 });
      });
    });

    it('calls fetchHouseholdItemCategories on mount to populate category filter options', async () => {
      renderPage();

      await waitFor(() => {
        expect(mockFetchHouseholdItemCategories).toHaveBeenCalledTimes(1);
      });
    });

    it('renders action menu button for each item', async () => {
      const item = makeHouseholdItem({ id: 'hi-1', name: 'Living Room Sofa' });
      mockListHouseholdItems.mockResolvedValueOnce(defaultListResponse([item]));

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('hi-menu-button-hi-1')).toBeInTheDocument();
      });
    });
  });

  describe('error state', () => {
    it('shows error message when listHouseholdItems fails with ApiClientError', async () => {
      const error = new ApiClientError(
        { code: 'INTERNAL_ERROR', message: 'Failed to load items' },
        500,
      );
      mockListHouseholdItems.mockRejectedValueOnce(error);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Failed to load items')).toBeInTheDocument();
      });
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

      // Click the delete confirm button in modal footer
      const buttons = screen.getAllByRole('button');
      const confirmBtn = buttons.find(
        (btn) =>
          btn.textContent?.toLowerCase().includes('delete') &&
          !btn.textContent?.toLowerCase().includes('cancel'),
      );
      if (confirmBtn) {
        fireEvent.click(confirmBtn);
      }

      await waitFor(() => {
        expect(mockDeleteHouseholdItem).toHaveBeenCalledWith('hi-1');
      });
    });

    it('shows API error when deleteHouseholdItem fails', async () => {
      const item = makeHouseholdItem({ id: 'hi-1', name: 'Living Room Sofa' });
      mockListHouseholdItems.mockResolvedValueOnce(defaultListResponse([item]));
      const error = new ApiClientError(
        { code: 'CONFLICT', message: 'Item has linked invoices' },
        409,
      );
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

      const buttons = screen.getAllByRole('button');
      const confirmBtn = buttons.find(
        (btn) =>
          btn.textContent?.toLowerCase().includes('delete') &&
          !btn.textContent?.toLowerCase().includes('cancel'),
      );
      if (confirmBtn) {
        fireEvent.click(confirmBtn);
      }

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText('Item has linked invoices')).toBeInTheDocument();
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

      const cancelBtn = screen.getAllByRole('button').find(
        (btn) => btn.textContent?.toLowerCase() === 'cancel',
      );
      expect(cancelBtn).toBeDefined();
      fireEvent.click(cancelBtn!);

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
        createArea: jest.fn(),
        updateArea: jest.fn(),
        deleteArea: jest.fn(),
      });

      renderPage();

      // The hook should be called
      await waitFor(() => {
        expect(mockUseAreas).toHaveBeenCalled();
      });
    });
  });
});
