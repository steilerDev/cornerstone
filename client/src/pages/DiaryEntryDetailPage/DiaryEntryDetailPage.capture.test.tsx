/**
 * @jest-environment jsdom
 */
/**
 * Capture-screen arrival on DiaryEntryDetailPage (#2221): the heading takes focus once when the
 * router state carries the focus-heading flag, and the "photos waiting" notice shows above the
 * Photos section when a capture upload provider holds items for this entry.
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { makeSearchCompanies } from '../../test/companySearchMock.js';
import { screen, waitFor, render, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { CaptureUploadsContext } from '../../capture/captureUploadsContext.js';
import type { CaptureUploadsApi } from '../../capture/captureTypes.js';
import { item } from '../../test/captureFixtures.js';
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

const mockFetchVendors = jest
  .fn<
    (
      params?: unknown,
      options?: unknown,
    ) => Promise<{
      vendors: never[];
      pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
    }>
  >()
  .mockResolvedValue({
    vendors: [],
    pagination: { page: 1, pageSize: 50, totalItems: 0, totalPages: 0 },
  });

jest.unstable_mockModule('../../lib/vendorsApi.js', () => ({
  fetchVendors: mockFetchVendors,
  searchCompanies: makeSearchCompanies(mockFetchVendors),
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
    computeWorkDuration: () => null,
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
  id: 'de-cap-1',
  entryType: 'daily_log',
  entryDate: '2026-03-14',
  title: 'Foundation Work',
  body: 'Poured concrete for the main foundation.',
  metadata: null,
  isAutomatic: false,
  isSigned: false,
  status: 'saved' as const,
  sourceEntityType: null,
  sourceEntityId: null,
  sourceEntityTitle: null,
  sourceEntityArea: null,
  photoCount: 0,
  createdBy: { id: 'user-1', displayName: 'Alice Builder' },
  createdAt: '2026-03-14T09:00:00.000Z',
  updatedAt: '2026-03-14T09:00:00.000Z',
};

function uploadsApi(items: ReturnType<typeof item>[]): CaptureUploadsApi {
  return {
    storage: 'persistent',
    items,
    orphans: [],
    add: jest.fn(async () => []),
    assignDraft: jest.fn(),
    reassign: jest.fn(() => []),
    updateTags: jest.fn(),
    remove: jest.fn(),
    retry: jest.fn(),
    discardDraft: jest.fn(async () => {}),
    adoptOrphans: jest.fn(),
    discardOrphans: jest.fn(async () => {}),
    subscribe: () => () => {},
    whenSettled: jest.fn(async () => ({ uploaded: [], failedIds: [] })),
  };
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('DiaryEntryDetailPage — arriving from the capture screen', () => {
  let DiaryEntryDetailPage: React.ComponentType;

  beforeEach(async () => {
    localStorage.setItem('theme', 'light');
    mockGetDiaryEntry.mockReset();
    mockGetDiaryEntry.mockResolvedValue(baseDetail);
    if (!DiaryEntryDetailPage) {
      const mod = await import('./DiaryEntryDetailPage.js');
      DiaryEntryDetailPage = mod.default;
    }
  });

  afterEach(() => {
    localStorage.clear();
  });

  function Navigator() {
    const navigate = useNavigate();
    return (
      <button
        type="button"
        onClick={() => navigate('/diary/de-cap-1', { state: { focusHeading: true } })}
      >
        arrive again
      </button>
    );
  }

  const renderDetailPage = (state?: unknown, api: CaptureUploadsApi | null = null) =>
    render(
      <CaptureUploadsContext value={api}>
        <MemoryRouter initialEntries={[{ pathname: '/diary/de-cap-1', state }]}>
          <Routes>
            <Route
              path="/diary/:id"
              element={
                <>
                  <DiaryEntryDetailPage />
                  <Navigator />
                </>
              }
            />
          </Routes>
        </MemoryRouter>
      </CaptureUploadsContext>,
    );

  it('focuses the h1 once the entry has loaded when the flag is set', async () => {
    renderDetailPage({ focusHeading: true });

    const h1 = await screen.findByRole('heading', { level: 1, name: 'Foundation Work' });

    await waitFor(() => expect(h1).toHaveFocus());
    expect(h1).toHaveAttribute('tabindex', '-1');
  });

  it('does not move focus without the flag', async () => {
    renderDetailPage({ origin: { to: '/diary' } });

    const h1 = await screen.findByRole('heading', { level: 1, name: 'Foundation Work' });

    expect(h1).not.toHaveFocus();
    expect(h1).toHaveAttribute('tabindex', '-1');
  });

  it('does not move focus without any router state', async () => {
    renderDetailPage();

    const h1 = await screen.findByRole('heading', { level: 1 });

    expect(h1).not.toHaveFocus();
  });

  it('focuses only once per navigation: later re-renders do not steal focus back', async () => {
    renderDetailPage({ focusHeading: true });
    const h1 = await screen.findByRole('heading', { level: 1, name: 'Foundation Work' });
    await waitFor(() => expect(h1).toHaveFocus());
    const other = screen.getByRole('button', { name: 'arrive again' });

    act(() => other.focus());
    expect(other).toHaveFocus();
    await act(async () => {
      await Promise.resolve();
    });

    expect(other).toHaveFocus();
  });

  it('a language change reloads the entry but does not pull focus back to the h1', async () => {
    const { default: i18n } = await import('../../i18n/index.js');
    renderDetailPage({ focusHeading: true });
    const h1 = await screen.findByRole('heading', { level: 1, name: 'Foundation Work' });
    await waitFor(() => expect(h1).toHaveFocus());
    const other = screen.getByRole('button', { name: 'arrive again' });
    act(() => other.focus());
    const loadsBefore = mockGetDiaryEntry.mock.calls.length;

    try {
      await act(async () => {
        await i18n.changeLanguage('de');
      });
      // The entry reloads (isLoading flips) under the same location.key.
      await waitFor(() => expect(mockGetDiaryEntry.mock.calls.length).toBeGreaterThan(loadsBefore));
      await screen.findByRole('heading', { level: 1, name: 'Foundation Work' });
      expect(other).toHaveFocus();
    } finally {
      await act(async () => {
        await i18n.changeLanguage('en');
      });
    }
  });

  it('focuses again for a new navigation that carries the flag', async () => {
    renderDetailPage({ focusHeading: true });
    const h1 = await screen.findByRole('heading', { level: 1, name: 'Foundation Work' });
    await waitFor(() => expect(h1).toHaveFocus());
    const other = screen.getByRole('button', { name: 'arrive again' });
    act(() => other.focus());

    act(() => other.click());

    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1, name: 'Foundation Work' })).toHaveFocus(),
    );
  });

  it('shows the photos-waiting notice above the Photos section when items wait for this entry', async () => {
    renderDetailPage(undefined, uploadsApi([item('w1', { draftId: 'de-cap-1' })]));

    const notice = await screen.findByTestId('photos-waiting-notice');
    expect(notice).toHaveTextContent('1');
  });

  it('shows no notice when nothing waits for this entry', async () => {
    renderDetailPage(undefined, uploadsApi([item('other', { draftId: 'someone-else' })]));

    await screen.findByRole('heading', { level: 1 });

    expect(screen.queryByTestId('photos-waiting-notice')).not.toBeInTheDocument();
  });

  it('shows no notice without an upload provider', async () => {
    renderDetailPage();

    await screen.findByRole('heading', { level: 1 });

    expect(screen.queryByTestId('photos-waiting-notice')).not.toBeInTheDocument();
  });
});
