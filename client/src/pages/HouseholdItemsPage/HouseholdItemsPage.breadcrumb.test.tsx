/**
 * @jest-environment jsdom
 *
 * Breadcrumb-specific tests for HouseholdItemsPage.tsx (Story #1240).
 * Verifies that the name column renders AreaBreadcrumb (compact variant)
 * below the item link, both for items with an area and items with area: null.
 *
 * All mocks are identical to HouseholdItemsPage.test.tsx to avoid
 * module-registry conflicts between test files.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { screen, waitFor, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type * as HouseholdItemsApiTypes from '../../lib/householdItemsApi.js';
import type * as VendorsApiTypes from '../../lib/vendorsApi.js';
import type * as HouseholdItemCategoriesApiTypes from '../../lib/householdItemCategoriesApi.js';
import type * as UseAreasTypes from '../../hooks/useAreas.js';
import type { HouseholdItemSummary } from '@cornerstone/shared';

// ─── Mock modules BEFORE importing component ────────────────────────────────

// Mock preferencesApi — DataTable calls useColumnPreferences -> usePreferences -> listPreferences
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockListPreferences = jest.fn<any>().mockResolvedValue([]);
jest.unstable_mockModule('../../lib/preferencesApi.js', () => ({
  listPreferences: mockListPreferences,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  upsertPreference: jest.fn<any>().mockResolvedValue({ key: '', value: '', updatedAt: '' }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  deletePreference: jest.fn<any>().mockResolvedValue(undefined),
}));

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

// Mock useTableState with a stable Map to prevent infinite re-renders.
const stableFilters = new Map();
jest.unstable_mockModule('../../hooks/useTableState.js', () => ({
  useTableState: () => ({
    tableState: {
      search: '',
      filters: stableFilters,
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let HouseholdItemsPage: any;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/project/household-items']}>
      <HouseholdItemsPage />
    </MemoryRouter>,
  );
}

function makeDefaultAreasHook(): ReturnType<typeof UseAreasTypes.useAreas> {
  return {
    areas: [],
    isLoading: false,
    error: null,
    refetch: jest.fn(),
    createArea: jest.fn<UseAreasTypes.UseAreasResult['createArea']>(),
    updateArea: jest.fn<UseAreasTypes.UseAreasResult['updateArea']>(),
    deleteArea: jest.fn<UseAreasTypes.UseAreasResult['deleteArea']>(),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('HouseholdItemsPage — AreaBreadcrumb in name column (Story #1240)', () => {
  beforeEach(async () => {
    if (!HouseholdItemsPage) {
      const module = await import('./HouseholdItemsPage.js');
      HouseholdItemsPage = module.HouseholdItemsPage;
    }

    mockListHouseholdItems.mockReset();
    mockDeleteHouseholdItem.mockReset();
    mockFetchVendors.mockReset();
    mockFetchHouseholdItemCategories.mockReset();
    mockListPreferences.mockReset();
    mockListPreferences.mockResolvedValue([]);

    mockUseAreas.mockReturnValue(makeDefaultAreasHook());

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

  // ── Scenario 1: item with area → compact breadcrumb text visible ──────────

  describe('name column — item with area set', () => {
    it('renders the leaf area name in the compact breadcrumb below the item link', async () => {
      const item = makeHouseholdItem({
        id: 'hi-1',
        name: 'Living Room Sofa',
        area: {
          id: 'area-kitchen',
          name: 'Kitchen',
          color: null,
          ancestors: [{ id: 'area-gf', name: 'Ground Floor', color: null }],
        },
      });
      mockListHouseholdItems.mockResolvedValueOnce(defaultListResponse([item]));

      renderPage();

      // DataTable renders both table rows and mobile cards — use getAllByText.
      await waitFor(() => {
        // The item name link should be present
        expect(screen.getAllByText('Living Room Sofa').length).toBeGreaterThan(0);
      });

      // Compact breadcrumb renders the full path as "Ground Floor › Kitchen"
      // The separator is U+203A (›) with spaces.
      const breadcrumbEls = screen.getAllByText('Ground Floor \u203a Kitchen');
      expect(breadcrumbEls.length).toBeGreaterThan(0);
    });

    it('renders a tooltip element containing the full area path when area has ancestors', async () => {
      const item = makeHouseholdItem({
        id: 'hi-1',
        name: 'Bookshelf',
        area: {
          id: 'area-study',
          name: 'Study',
          color: null,
          ancestors: [{ id: 'area-upper', name: 'Upper Floor', color: null }],
        },
      });
      mockListHouseholdItems.mockResolvedValueOnce(defaultListResponse([item]));

      const { container } = renderPage();

      await waitFor(() => {
        expect(screen.getAllByText('Bookshelf').length).toBeGreaterThan(0);
      });

      // Compact variant wraps text in a Tooltip that renders role="tooltip"
      const tooltips = container.querySelectorAll('[role="tooltip"]');
      expect(tooltips.length).toBeGreaterThan(0);

      // At least one tooltip should contain the full path
      const fullPath = 'Upper Floor \u203a Study';
      const matchingTooltip = Array.from(tooltips).find((el) => el.textContent === fullPath);
      expect(matchingTooltip).toBeDefined();
    });

    it('renders both the item link and the breadcrumb within the name column', async () => {
      const item = makeHouseholdItem({
        id: 'hi-2',
        name: 'Dining Table',
        area: {
          id: 'area-dining',
          name: 'Dining Room',
          color: null,
          ancestors: [],
        },
      });
      mockListHouseholdItems.mockResolvedValueOnce(defaultListResponse([item]));

      renderPage();

      await waitFor(() => {
        expect(screen.getAllByText('Dining Table').length).toBeGreaterThan(0);
        // Root area: no ancestors → breadcrumb shows just "Dining Room"
        expect(screen.getAllByText('Dining Room').length).toBeGreaterThan(0);
      });
    });

    it('renders breadcrumb for item with multiple ancestor levels', async () => {
      const item = makeHouseholdItem({
        id: 'hi-3',
        name: 'Cabinet',
        area: {
          id: 'area-cabinet',
          name: 'Kitchen Cabinet',
          color: null,
          ancestors: [
            { id: 'area-gf', name: 'Ground Floor', color: null },
            { id: 'area-kitchen', name: 'Kitchen', color: null },
          ],
        },
      });
      mockListHouseholdItems.mockResolvedValueOnce(defaultListResponse([item]));

      renderPage();

      await waitFor(() => {
        expect(screen.getAllByText('Cabinet').length).toBeGreaterThan(0);
      });

      // Full path: "Ground Floor › Kitchen › Kitchen Cabinet"
      const fullPath = 'Ground Floor \u203a Kitchen \u203a Kitchen Cabinet';
      const breadcrumbs = screen.getAllByText(fullPath);
      expect(breadcrumbs.length).toBeGreaterThan(0);
    });
  });

  // ── Scenario 2: item with area: null → "No area" text ────────────────────

  describe('name column — item with area: null', () => {
    it('renders "No area" text when item area is null', async () => {
      const item = makeHouseholdItem({
        id: 'hi-1',
        name: 'Living Room Sofa',
        area: null,
      });
      mockListHouseholdItems.mockResolvedValueOnce(defaultListResponse([item]));

      renderPage();

      await waitFor(() => {
        expect(screen.getAllByText('Living Room Sofa').length).toBeGreaterThan(0);
      });

      // AreaBreadcrumb with area=null renders "No area"
      const noAreaEls = screen.getAllByText('No area');
      expect(noAreaEls.length).toBeGreaterThan(0);
    });

    it('does not render a nav element when area is null', async () => {
      const item = makeHouseholdItem({ area: null });
      mockListHouseholdItems.mockResolvedValueOnce(defaultListResponse([item]));

      const { container } = renderPage();

      await waitFor(() => {
        expect(screen.getAllByText('Living Room Sofa').length).toBeGreaterThan(0);
      });

      // null area renders a <span>, not a <nav>
      expect(container.querySelector('nav[aria-label="Area path"]')).not.toBeInTheDocument();
    });

    it('renders "No area" for every null-area item in a multi-item list', async () => {
      const items = [
        makeHouseholdItem({ id: 'hi-1', name: 'Sofa', area: null }),
        makeHouseholdItem({ id: 'hi-2', name: 'Chair', area: null }),
      ];
      mockListHouseholdItems.mockResolvedValueOnce(defaultListResponse(items));

      renderPage();

      await waitFor(() => {
        expect(screen.getAllByText('Sofa').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Chair').length).toBeGreaterThan(0);
      });

      // DataTable renders table rows + mobile cards, so we expect at least 2 "No area" per item
      const noAreaEls = screen.getAllByText('No area');
      expect(noAreaEls.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ── Mixed list: some items with area, some without ───────────────────────

  describe('name column — mixed area / no-area list', () => {
    it('renders breadcrumb for area items and "No area" for null-area items side by side', async () => {
      const items = [
        makeHouseholdItem({
          id: 'hi-1',
          name: 'Sofa',
          area: {
            id: 'area-lr',
            name: 'Living Room',
            color: null,
            ancestors: [],
          },
        }),
        makeHouseholdItem({ id: 'hi-2', name: 'Chair', area: null }),
      ];
      mockListHouseholdItems.mockResolvedValueOnce(defaultListResponse(items));

      renderPage();

      await waitFor(() => {
        expect(screen.getAllByText('Sofa').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Chair').length).toBeGreaterThan(0);
      });

      // Area item shows leaf name as compact breadcrumb
      expect(screen.getAllByText('Living Room').length).toBeGreaterThan(0);
      // Null-area item shows "No area"
      expect(screen.getAllByText('No area').length).toBeGreaterThan(0);
    });
  });
});
