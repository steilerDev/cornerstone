/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { WorkItemSummary } from '@cornerstone/shared';
import type * as WorkItemsApiTypes from '../../lib/workItemsApi.js';
import type * as UsersApiTypes from '../../lib/usersApi.js';
import type * as VendorsApiTypes from '../../lib/vendorsApi.js';
import type * as WorkItemsPageTypes from './WorkItemsPage.js';

// ─── Module-scope mock functions ─────────────────────────────────────────────

const mockListWorkItems = jest.fn<typeof WorkItemsApiTypes.listWorkItems>();
const mockDeleteWorkItem = jest.fn<typeof WorkItemsApiTypes.deleteWorkItem>();
const mockListUsers = jest.fn<typeof UsersApiTypes.listUsers>();
const mockFetchVendors = jest.fn<typeof VendorsApiTypes.fetchVendors>();

jest.unstable_mockModule('../../lib/workItemsApi.js', () => ({
  listWorkItems: mockListWorkItems,
  deleteWorkItem: mockDeleteWorkItem,
}));

jest.unstable_mockModule('../../lib/usersApi.js', () => ({
  listUsers: mockListUsers,
}));

jest.unstable_mockModule('../../lib/vendorsApi.js', () => ({
  fetchVendors: mockFetchVendors,
}));

// ─── preferencesApi mock — DataTable calls useColumnPreferences -> listPreferences ──

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockListPreferences = jest.fn<any>().mockResolvedValue([]);
jest.unstable_mockModule('../../lib/preferencesApi.js', () => ({
  listPreferences: mockListPreferences,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  upsertPreference: jest.fn<any>().mockResolvedValue({ key: '', value: '', updatedAt: '' }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  deletePreference: jest.fn<any>().mockResolvedValue(undefined),
}));

// ─── useTableState mock — prevents infinite useEffect re-renders ─────────────

const stableFilters = new Map<string, { value: string }>();
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

// ─── useAreas mock ────────────────────────────────────────────────────────────
// WorkItemsPage uses useAreas() for the area filter column enumOptions.

const mockUseAreas = jest.fn(() => ({
  areas: [],
  isLoading: false,
  error: null,
  refetch: jest.fn(),
  createArea: jest.fn(),
  updateArea: jest.fn(),
  deleteArea: jest.fn(),
}));

jest.unstable_mockModule('../../hooks/useAreas.js', () => ({
  useAreas: mockUseAreas,
}));

// ─── Formatters mock — WorkItemsPage uses useFormatters() ────────────────────

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
  return {
    formatDate: fmtDate,
    useFormatters: () => ({ formatDate: fmtDate }),
  };
});

// ─── Shared fixture builders ──────────────────────────────────────────────────

function makeWorkItemSummary(overrides: Partial<WorkItemSummary> = {}): WorkItemSummary {
  return {
    id: 'wi-1',
    title: 'Lay Foundation',
    status: 'not_started',
    startDate: null,
    endDate: null,
    durationDays: null,
    actualStartDate: null,
    actualEndDate: null,
    assignedUser: null,
    assignedVendor: null,
    area: null,
    budgetLineCount: 0,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeListResponse(items: WorkItemSummary[]) {
  return {
    items,
    filterMeta: {},
    pagination: {
      page: 1,
      pageSize: 25,
      totalItems: items.length,
      totalPages: 1,
    },
  };
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('WorkItemsPage', () => {
  let WorkItemsPageModule: typeof WorkItemsPageTypes;

  beforeEach(async () => {
    mockListWorkItems.mockReset();
    mockDeleteWorkItem.mockReset();
    mockListUsers.mockReset();
    mockFetchVendors.mockReset();
    mockListPreferences.mockReset();
    mockListPreferences.mockResolvedValue([]);
    mockUseAreas.mockReset();

    if (!WorkItemsPageModule) {
      WorkItemsPageModule = await import('./WorkItemsPage.js');
    }

    // Default: empty users + vendors so secondary API calls resolve quickly
    mockListUsers.mockResolvedValue({ users: [] });
    mockFetchVendors.mockResolvedValue({
      vendors: [],
      pagination: { page: 1, pageSize: 100, totalItems: 0, totalPages: 0 },
    });

    // Default useAreas: no areas
    mockUseAreas.mockReturnValue({
      areas: [],
      isLoading: false,
      error: null,
      refetch: jest.fn(),
      createArea: jest.fn(),
      updateArea: jest.fn(),
      deleteArea: jest.fn(),
    });
  });

  function renderPage() {
    return render(
      <MemoryRouter initialEntries={['/project/work-items']}>
        <WorkItemsPageModule.WorkItemsPage />
      </MemoryRouter>,
    );
  }

  // ── Breadcrumb rendering: work item with ancestors ────────────────────────

  describe('breadcrumb in title cell', () => {
    it('shows ancestor name and area name in title cell when area has ancestors', async () => {
      const item = makeWorkItemSummary({
        area: {
          id: 'a1',
          name: 'Kitchen',
          color: null,
          ancestors: [{ id: 'a0', name: 'Ground Floor', color: null }],
        },
      });
      mockListWorkItems.mockResolvedValue(makeListResponse([item]));

      renderPage();

      // DataTable renders both table and mobile card — use getAllByText and verify at least one match
      await waitFor(() => {
        expect(screen.getAllByText('Ground Floor \u203a Kitchen').length).toBeGreaterThanOrEqual(1);
      });
    });

    it('shows just the area name when area has no ancestors', async () => {
      const item = makeWorkItemSummary({
        area: {
          id: 'a1',
          name: 'Garage',
          color: null,
          ancestors: [],
        },
      });
      mockListWorkItems.mockResolvedValue(makeListResponse([item]));

      renderPage();

      await waitFor(() => {
        expect(screen.getAllByText('Garage').length).toBeGreaterThanOrEqual(1);
      });
    });

    it('shows "No area" text when area is null', async () => {
      const item = makeWorkItemSummary({ area: null });
      mockListWorkItems.mockResolvedValue(makeListResponse([item]));

      renderPage();

      await waitFor(() => {
        expect(screen.getAllByText('No area').length).toBeGreaterThanOrEqual(1);
      });
    });

    it('work item title link is present alongside the area breadcrumb', async () => {
      const item = makeWorkItemSummary({
        title: 'Install Tiles',
        area: {
          id: 'a1',
          name: 'Bathroom',
          color: null,
          ancestors: [{ id: 'a0', name: 'First Floor', color: null }],
        },
      });
      mockListWorkItems.mockResolvedValue(makeListResponse([item]));

      renderPage();

      await waitFor(() => {
        expect(screen.getAllByText('Install Tiles').length).toBeGreaterThanOrEqual(1);
      });

      // Both title link and breadcrumb text should appear
      expect(screen.getAllByText('First Floor \u203a Bathroom').length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── Multiple items — each gets its own breadcrumb ─────────────────────────

  describe('multiple work items with different area states', () => {
    it('renders breadcrumb per item independently', async () => {
      const items = [
        makeWorkItemSummary({
          id: 'wi-1',
          title: 'Item A',
          area: { id: 'a1', name: 'Living Room', color: null, ancestors: [] },
        }),
        makeWorkItemSummary({
          id: 'wi-2',
          title: 'Item B',
          area: null,
        }),
      ];
      mockListWorkItems.mockResolvedValue(makeListResponse(items));

      renderPage();

      await waitFor(() => {
        expect(screen.getAllByText('Item A').length).toBeGreaterThanOrEqual(1);
      });

      expect(screen.getAllByText('Living Room').length).toBeGreaterThanOrEqual(1);
      // "No area" should appear for Item B
      expect(screen.getAllByText('No area').length).toBeGreaterThanOrEqual(1);
    });
  });
});
