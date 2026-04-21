/**
 * @jest-environment jsdom
 */
/**
 * Tests for AreaBreadcrumb rendering in DiaryEntryDetailPage (Issue #1271).
 *
 * Verifies that the compact AreaBreadcrumb is rendered beneath SourceEntityLink
 * when sourceEntityType === 'work_item', and is absent for invoice sources or
 * entries with no sourceEntityType.
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { screen, waitFor, render, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type * as DiaryApiTypes from '../../lib/diaryApi.js';
import type { DiaryEntryDetail } from '@cornerstone/shared';
import type React from 'react';

// ── API mock ──────────────────────────────────────────────────────────────────

const mockGetDiaryEntry = jest.fn<typeof DiaryApiTypes.getDiaryEntry>();

jest.unstable_mockModule('../../lib/diaryApi.js', () => ({
  getDiaryEntry: mockGetDiaryEntry,
  listDiaryEntries: jest.fn(),
  createDiaryEntry: jest.fn(),
  updateDiaryEntry: jest.fn(),
  deleteDiaryEntry: jest.fn(),
}));

jest.unstable_mockModule('../../components/Toast/ToastContext.js', () => ({
  useToast: () => ({ toasts: [], showToast: jest.fn(), dismissToast: jest.fn() }),
  ToastProvider: ({ children }: { children: unknown }) => children,
}));

jest.unstable_mockModule('../../contexts/AuthContext.js', () => ({
  useAuth: () => ({
    user: {
      id: 'user-1',
      displayName: 'Alice Builder',
      email: 'alice@example.com',
      role: 'admin',
      authProvider: 'local',
      createdAt: '2026-01-01T00:00:00Z',
    },
    oidcEnabled: false,
    isLoading: false,
    error: null,
    refreshAuth: jest.fn(),
    logout: jest.fn(),
  }),
  AuthProvider: ({ children }: { children: unknown }) => children,
}));

jest.unstable_mockModule('../../lib/vendorsApi.js', () => ({
  fetchVendors: jest.fn<() => Promise<any>>().mockResolvedValue({
    vendors: [],
    pagination: { page: 1, pageSize: 100, totalItems: 0, totalPages: 0 },
  }),
  fetchVendor: jest.fn(),
  createVendor: jest.fn(),
  updateVendor: jest.fn(),
  deleteVendor: jest.fn(),
}));

jest.unstable_mockModule('../../hooks/usePhotos.js', () => ({
  usePhotos: () => ({
    photos: [],
    loading: false,
    upload: jest.fn(),
    deletePhoto: jest.fn(),
    reorderPhotos: jest.fn(),
    updateCaption: jest.fn(),
  }),
}));

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
    }).format(n);
  const fmtTime = (ts: string | null | undefined, fallback = '—') => ts ?? fallback;
  const fmtDateTime = (ts: string | null | undefined, fallback = '—') => ts ?? fallback;
  return {
    formatCurrency: fmtCurrency,
    formatDate: fmtDate,
    formatTime: fmtTime,
    formatDateTime: fmtDateTime,
    formatPercent: (n: number) => `${n.toFixed(2)}%`,
    computeActualDuration: () => null,
    useFormatters: () => ({
      formatCurrency: fmtCurrency,
      formatDate: fmtDate,
      formatTime: fmtTime,
      formatDateTime: fmtDateTime,
      formatPercent: (n: number) => `${n.toFixed(2)}%`,
    }),
  };
});

// ── Fixtures ──────────────────────────────────────────────────────────────────

const baseDetail: DiaryEntryDetail = {
  id: 'de-area-1',
  entryType: 'daily_log',
  entryDate: '2026-03-14',
  title: 'Foundation Work',
  body: 'Poured concrete for the main foundation.',
  metadata: null,
  isAutomatic: false,
  isSigned: false,
  sourceEntityType: null,
  sourceEntityId: null,
  sourceEntityTitle: null,
  sourceEntityArea: null,
  photoCount: 0,
  createdBy: { id: 'user-1', displayName: 'Alice Builder' },
  createdAt: '2026-03-14T09:00:00.000Z',
  updatedAt: '2026-03-14T09:00:00.000Z',
};

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('DiaryEntryDetailPage — area breadcrumb', () => {
  let DiaryEntryDetailPage: React.ComponentType;

  beforeEach(async () => {
    localStorage.setItem('theme', 'light');
    mockGetDiaryEntry.mockReset();
    if (!DiaryEntryDetailPage) {
      const mod = await import('./DiaryEntryDetailPage.js');
      DiaryEntryDetailPage = mod.default;
    }
  });

  afterEach(() => {
    localStorage.clear();
  });

  const renderDetailPage = (id = 'de-area-1') =>
    render(
      <MemoryRouter initialEntries={[`/diary/${id}`]}>
        <Routes>
          <Route path="/diary/:id" element={<DiaryEntryDetailPage />} />
          <Route path="/diary" element={<div>Diary List</div>} />
        </Routes>
      </MemoryRouter>,
    );

  it('work_item source with area → area name visible in source section', async () => {
    const entry: DiaryEntryDetail = {
      ...baseDetail,
      sourceEntityType: 'work_item',
      sourceEntityId: 'wi-1',
      sourceEntityTitle: 'Kitchen Renovation',
      sourceEntityArea: {
        id: 'area-kitchen',
        name: 'Kitchen',
        color: '#ff0000',
        ancestors: [],
      },
    };
    mockGetDiaryEntry.mockResolvedValueOnce(entry);
    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText('Kitchen')).toBeInTheDocument();
    });
  });

  it('work_item source with null area → "No area" visible in source section', async () => {
    const entry: DiaryEntryDetail = {
      ...baseDetail,
      sourceEntityType: 'work_item',
      sourceEntityId: 'wi-2',
      sourceEntityTitle: 'Foundation',
      sourceEntityArea: null,
    };
    mockGetDiaryEntry.mockResolvedValueOnce(entry);
    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText('Foundation')).toBeInTheDocument();
    });

    // AreaBreadcrumb with null area renders "No area"
    expect(screen.getByText('No area')).toBeInTheDocument();
  });

  it('invoice source → no AreaBreadcrumb rendered in source section', async () => {
    const entry: DiaryEntryDetail = {
      ...baseDetail,
      sourceEntityType: 'invoice',
      sourceEntityId: 'inv-1',
      sourceEntityTitle: 'INV-001',
      sourceEntityArea: null,
    };
    mockGetDiaryEntry.mockResolvedValueOnce(entry);
    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText('INV-001')).toBeInTheDocument();
    });

    // No breadcrumb for invoice source — neither area name nor "No area" from this component
    // (scope to source section to avoid false positives from other breadcrumbs)
    // The sourceSection is the parent div; AreaBreadcrumb should NOT be present inside it
    expect(screen.queryByText('No area')).not.toBeInTheDocument();
  });

  it('sourceEntityType: null → source section not rendered, no breadcrumb', async () => {
    const entry: DiaryEntryDetail = {
      ...baseDetail,
      sourceEntityType: null,
      sourceEntityId: null,
      sourceEntityArea: null,
    };
    mockGetDiaryEntry.mockResolvedValueOnce(entry);
    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText('Foundation Work')).toBeInTheDocument();
    });

    // Without source entity, neither source link nor breadcrumb is rendered
    expect(screen.queryByText('No area')).not.toBeInTheDocument();
  });
});
