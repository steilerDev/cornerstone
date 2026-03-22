/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { screen, waitFor, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type * as WorkItemsApiTypes from '../../lib/workItemsApi.js';
import type { listUsers as listUsersFn } from '../../lib/usersApi.js';
import type * as VendorsApiTypes from '../../lib/vendorsApi.js';

// Mock API modules BEFORE importing the component
const mockListWorkItems = jest.fn<typeof WorkItemsApiTypes.listWorkItems>();
const mockDeleteWorkItem = jest.fn<typeof WorkItemsApiTypes.deleteWorkItem>();
const mockListUsers = jest.fn<typeof listUsersFn>();
const mockFetchVendors = jest.fn<typeof VendorsApiTypes.fetchVendors>();

jest.unstable_mockModule('../../lib/workItemsApi.js', () => ({
  listWorkItems: mockListWorkItems,
  deleteWorkItem: mockDeleteWorkItem,
  fetchWorkItem: jest.fn(),
  createWorkItem: jest.fn(),
  updateWorkItem: jest.fn(),
}));

jest.unstable_mockModule('../../lib/usersApi.js', () => ({
  listUsers: mockListUsers,
  adminUpdateUser: jest.fn(),
  deactivateUser: jest.fn(),
}));

jest.unstable_mockModule('../../lib/vendorsApi.js', () => ({
  fetchVendors: mockFetchVendors,
  fetchVendor: jest.fn(),
  createVendor: jest.fn(),
  updateVendor: jest.fn(),
  deleteVendor: jest.fn(),
}));

// ─── Mock: useAreas hook ──────────────────────────────────────────────────────

jest.unstable_mockModule('../../hooks/useAreas.js', () => ({
  useAreas: () => ({
    areas: [],
    isLoading: false,
    error: null,
  }),
}));

// ─── Mock: useKeyboardShortcuts hook ─────────────────────────────────────────

jest.unstable_mockModule('../../hooks/useKeyboardShortcuts.js', () => ({
  useKeyboardShortcuts: () => undefined,
}));

// ─── Mock: KeyboardShortcutsHelp component ────────────────────────────────────

jest.unstable_mockModule('../../components/KeyboardShortcutsHelp/KeyboardShortcutsHelp.js', () => ({
  KeyboardShortcutsHelp: () => null,
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
      sortBy: 'title',
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

describe('WorkItemsPage — layout consistency (Issue #1142)', () => {
  let WorkItemsPage: React.ComponentType;

  const emptyWorkItemsResponse = {
    items: [],
    pagination: { totalItems: 0, totalPages: 1, page: 1, pageSize: 25 },
  };

  beforeEach(async () => {
    if (!WorkItemsPage) {
      const module = await import('./WorkItemsPage.js');
      WorkItemsPage = module.WorkItemsPage;
    }

    mockListWorkItems.mockReset();
    mockDeleteWorkItem.mockReset();
    mockListUsers.mockReset();
    mockFetchVendors.mockReset();

    mockListWorkItems.mockResolvedValue(emptyWorkItemsResponse);
    mockListUsers.mockResolvedValue({ users: [] });
    mockFetchVendors.mockResolvedValue({ vendors: [], pagination: { totalItems: 0, totalPages: 1, page: 1, pageSize: 100 } });
  });

  function renderPage() {
    return render(
      <MemoryRouter initialEntries={['/project/work-items']}>
        <WorkItemsPage />
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

    it('renders "New Work Item" primary action button', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /new work item/i })).toBeInTheDocument();
      });
    });

    it('"New Work Item" button is accessible by role and text', async () => {
      renderPage();

      await waitFor(() => {
        const btn = screen.getByRole('button', { name: /new work item/i });
        expect(btn).toBeVisible();
        expect(btn).not.toBeDisabled();
      });
    });
  });
});
