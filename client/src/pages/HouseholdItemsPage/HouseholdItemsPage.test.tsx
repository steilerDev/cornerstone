/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { screen, waitFor, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type * as HouseholdItemsApiTypes from '../../lib/householdItemsApi.js';
import type * as VendorsApiTypes from '../../lib/vendorsApi.js';
import type * as HouseholdItemCategoriesApiTypes from '../../lib/householdItemCategoriesApi.js';

// Mock API modules BEFORE importing the component
const mockListHouseholdItems = jest.fn<typeof HouseholdItemsApiTypes.listHouseholdItems>();
const mockDeleteHouseholdItem = jest.fn<typeof HouseholdItemsApiTypes.deleteHouseholdItem>();
const mockFetchVendors = jest.fn<typeof VendorsApiTypes.fetchVendors>();
const mockFetchHouseholdItemCategories =
  jest.fn<typeof HouseholdItemCategoriesApiTypes.fetchHouseholdItemCategories>();

jest.unstable_mockModule('../../lib/householdItemsApi.js', () => ({
  listHouseholdItems: mockListHouseholdItems,
  deleteHouseholdItem: mockDeleteHouseholdItem,
  fetchHouseholdItem: jest.fn(),
  createHouseholdItem: jest.fn(),
  updateHouseholdItem: jest.fn(),
}));

jest.unstable_mockModule('../../lib/vendorsApi.js', () => ({
  fetchVendors: mockFetchVendors,
  fetchVendor: jest.fn(),
  createVendor: jest.fn(),
  updateVendor: jest.fn(),
  deleteVendor: jest.fn(),
}));

jest.unstable_mockModule('../../lib/householdItemCategoriesApi.js', () => ({
  fetchHouseholdItemCategories: mockFetchHouseholdItemCategories,
  fetchHouseholdItemCategory: jest.fn(),
  createHouseholdItemCategory: jest.fn(),
  updateHouseholdItemCategory: jest.fn(),
  deleteHouseholdItemCategory: jest.fn(),
}));

// ─── Mock: useAreas hook ──────────────────────────────────────────────────────

jest.unstable_mockModule('../../hooks/useAreas.js', () => ({
  useAreas: () => ({
    areas: [],
    isLoading: false,
    error: null,
  }),
}));

// ─── Mock: formatters — provides useFormatters() hook ────────────────────────

jest.unstable_mockModule('../../lib/formatters.js', () => {
  const fmtDate = (d: string | null | undefined, fallback = '—') => {
    if (!d) return fallback;
    const [year, month, day] = d.slice(0, 10).split('-').map(Number);
    if (!year || !month || !day) return fallback;
    return new Date(year, month - 1, day).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };
  const fmtCurrency = (n: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  return {
    formatCurrency: fmtCurrency,
    formatDate: fmtDate,
    formatTime: (ts: string | null | undefined, fallback = '—') => ts ?? fallback,
    formatDateTime: (ts: string | null | undefined, fallback = '—') => ts ?? fallback,
    formatPercent: (n: number) => `${n.toFixed(2)}%`,
    computeActualDuration: () => null,
    useFormatters: () => ({
      formatCurrency: fmtCurrency,
      formatDate: fmtDate,
      formatTime: (ts: string | null | undefined, fallback = '—') => ts ?? fallback,
      formatDateTime: (ts: string | null | undefined, fallback = '—') => ts ?? fallback,
      formatPercent: (n: number) => `${n.toFixed(2)}%`,
    }),
  };
});

// ─── Mock: useTableState — returns stable defaults ────────────────────────────

jest.unstable_mockModule('../../hooks/useTableState.js', () => ({
  useTableState: () => ({
    tableState: {
      search: '',
      sortBy: 'name',
      sortDir: 'asc',
      page: 1,
      pageSize: 25,
      filters: new Map(),
    },
    searchInput: '',
    setSearch: jest.fn(),
    toApiParams: () => ({ page: 1, pageSize: 25 }),
    setFilter: jest.fn(),
    setSortBy: jest.fn(),
    setPage: jest.fn(),
    setPageSize: jest.fn(),
  }),
}));

describe('HouseholdItemsPage — layout consistency (Issue #1142)', () => {
  let HouseholdItemsPage: React.ComponentType;

  const emptyHouseholdItemsResponse = {
    items: [],
    pagination: { totalItems: 0, totalPages: 1, page: 1, pageSize: 25 },
  };

  beforeEach(async () => {
    if (!HouseholdItemsPage) {
      const module = await import('./HouseholdItemsPage.js');
      HouseholdItemsPage = module.HouseholdItemsPage;
    }

    mockListHouseholdItems.mockReset();
    mockDeleteHouseholdItem.mockReset();
    mockFetchVendors.mockReset();
    mockFetchHouseholdItemCategories.mockReset();

    mockListHouseholdItems.mockResolvedValue(emptyHouseholdItemsResponse);
    mockFetchVendors.mockResolvedValue({ vendors: [], pagination: { totalItems: 0, totalPages: 1, page: 1, pageSize: 100 } });
    mockFetchHouseholdItemCategories.mockResolvedValue({ categories: [] });
  });

  function renderPage() {
    return render(
      <MemoryRouter initialEntries={['/project/household-items']}>
        <HouseholdItemsPage />
      </MemoryRouter>,
    );
  }

  // ─── Page layout ────────────────────────────────────────────────────────────

  describe('page layout', () => {
    it('renders an <h1> page title', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });
    });

    it('renders "New Household Item" primary action button', async () => {
      renderPage();

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /new household item/i }),
        ).toBeInTheDocument();
      });
    });

    it('"New Household Item" button is accessible by role, has testid, and is not disabled', async () => {
      renderPage();

      await waitFor(() => {
        const btn = screen.getByTestId('new-household-item-button');
        expect(btn).toBeVisible();
        expect(btn).not.toBeDisabled();
      });
    });
  });
});
