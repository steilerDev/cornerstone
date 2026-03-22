/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { screen, waitFor, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type * as VendorsApiTypes from '../../lib/vendorsApi.js';

// Mock API modules BEFORE importing the component
const mockFetchVendors = jest.fn<typeof VendorsApiTypes.fetchVendors>();
const mockCreateVendor = jest.fn<typeof VendorsApiTypes.createVendor>();
const mockDeleteVendor = jest.fn<typeof VendorsApiTypes.deleteVendor>();

jest.unstable_mockModule('../../lib/vendorsApi.js', () => ({
  fetchVendors: mockFetchVendors,
  fetchVendor: jest.fn(),
  createVendor: mockCreateVendor,
  updateVendor: jest.fn(),
  deleteVendor: mockDeleteVendor,
}));

// ─── Mock: useTrades hook ─────────────────────────────────────────────────────

jest.unstable_mockModule('../../hooks/useTrades.js', () => ({
  useTrades: () => ({
    trades: [],
    isLoading: false,
    error: null,
  }),
}));

// ─── Mock: TradePicker component ─────────────────────────────────────────────

jest.unstable_mockModule('../../components/TradePicker/TradePicker.js', () => ({
  TradePicker: ({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) => (
    <select
      data-testid="trade-picker"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
    >
      <option value="">No trade</option>
    </select>
  ),
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

describe('VendorsPage — layout consistency (Issue #1142)', () => {
  let VendorsPage: React.ComponentType;

  const emptyVendorResponse = {
    vendors: [],
    pagination: { totalItems: 0, totalPages: 1, page: 1, pageSize: 25 },
  };

  beforeEach(async () => {
    if (!VendorsPage) {
      const module = await import('./VendorsPage.js');
      VendorsPage = module.VendorsPage;
    }

    mockFetchVendors.mockReset();
    mockCreateVendor.mockReset();
    mockDeleteVendor.mockReset();

    mockFetchVendors.mockResolvedValue(emptyVendorResponse);
  });

  function renderPage() {
    return render(
      <MemoryRouter initialEntries={['/budget/vendors']}>
        <VendorsPage />
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

    it('renders "New Vendor" primary action button', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /new vendor/i })).toBeInTheDocument();
      });
    });

    it('"New Vendor" button is accessible by role and text', async () => {
      renderPage();

      await waitFor(() => {
        const btn = screen.getByRole('button', { name: /new vendor/i });
        expect(btn).toBeVisible();
        expect(btn).not.toBeDisabled();
      });
    });
  });
});
