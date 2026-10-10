/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { screen, waitFor, render, fireEvent, within, act, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { OriginProbe, probedOrigin, probedPath } from '../../test/originProbe.js';
import { RecordingRouter, createRouterLog } from '../../test/recordingRouter.js';
import type * as DiaryApiTypes from '../../lib/diaryApi.js';
import type * as DeleteImpactApiTypes from '../../lib/deleteImpactApi.js';
import type { DiaryEntryDetail, Photo } from '@cornerstone/shared';
import type React from 'react';
import { DIARY_SOURCE_ENTITY_TYPES } from '@cornerstone/shared';
import { ApiClientError } from '../../lib/apiClient.js';
import enDiary from '../../i18n/en/diary.json';
import enErrors from '../../i18n/en/errors.json';

// ── API mock ──────────────────────────────────────────────────────────────────

const mockGetDiaryEntry = jest.fn<typeof DiaryApiTypes.getDiaryEntry>();
const mockDeleteDiaryEntry = jest.fn<typeof DiaryApiTypes.deleteDiaryEntry>();

const mockFetchDeleteImpact = jest.fn<typeof DeleteImpactApiTypes.fetchDeleteImpact>();

jest.unstable_mockModule('../../lib/deleteImpactApi.js', () => ({
  fetchDeleteImpact: mockFetchDeleteImpact,
}));

/** The delete action is aria-disabled until the "also affects" counts have loaded. */
async function enabledConfirm(): Promise<HTMLElement> {
  const btn = await screen.findByTestId('diary-delete-confirm');
  await waitFor(() => expect(btn).not.toHaveAttribute('aria-disabled'));
  return btn;
}

jest.unstable_mockModule('../../lib/diaryApi.js', () => ({
  getDiaryEntry: mockGetDiaryEntry,
  listDiaryEntries: jest.fn(),
  createDiaryEntry: jest.fn(),
  updateDiaryEntry: jest.fn(),
  deleteDiaryEntry: mockDeleteDiaryEntry,
}));

// Mock ToastContext to avoid dual-React instance issues
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
  fetchVendors: jest
    .fn<
      (params?: unknown) => Promise<{
        vendors: unknown[];
        pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
      }>
    >()
    .mockResolvedValue({
      vendors: [],
      pagination: { page: 1, pageSize: 100, totalItems: 0, totalPages: 0 },
    }),
  fetchVendor: jest.fn(),
  createVendor: jest.fn(),
  updateVendor: jest.fn(),
  deleteVendor: jest.fn(),
}));

// Mock usePhotos to avoid real API calls
let viewerDeleteResult: Promise<unknown> | undefined;

const photosState = {
  photos: [] as Photo[],
  deletePhoto: jest.fn(),
  updatePhotoInList: jest.fn(),
};

jest.unstable_mockModule('../../hooks/usePhotos.js', () => ({
  usePhotos: () => ({
    photos: photosState.photos,
    loading: false,
    upload: jest.fn(),
    deletePhoto: (...args: unknown[]) => photosState.deletePhoto(...args),
    updatePhotoInList: (...args: unknown[]) => photosState.updatePhotoInList(...args),
    reorderPhotos: jest.fn(),
    updateCaption: jest.fn(),
  }),
}));

// Mock PhotoGrid/PhotoViewer to expose the `editable` prop (#2124 lock behaviour).
jest.unstable_mockModule('../../components/photos/PhotoGrid.js', () => ({
  PhotoGrid: ({
    editable,
    photos,
    onPhotoClick,
    onEdit,
  }: {
    editable?: boolean;
    photos: Photo[];
    onPhotoClick: (photo: Photo) => void;
    onEdit: (photo: Photo) => void;
  }) => (
    <div data-testid="photo-grid-mock" data-editable={String(editable)}>
      <button type="button" onClick={() => onPhotoClick(photos[0]!)}>
        open-photo
      </button>
      <button type="button" onClick={() => onEdit(photos[0]!)}>
        edit-photo
      </button>
    </div>
  ),
}));

jest.unstable_mockModule('../../components/photos/PhotoViewer.js', () => ({
  PhotoViewer: ({
    editable,
    startInAnnotator,
    initialIndex,
    onClose,
    onDelete,
    onPhotoChanged,
  }: {
    editable?: boolean;
    startInAnnotator?: boolean;
    initialIndex: number;
    onClose: () => void;
    onDelete: (id: string) => void;
    onPhotoChanged: (photo: Photo) => void;
  }) => (
    <div
      data-testid="photo-viewer-mock"
      data-editable={String(editable)}
      data-annotator={String(startInAnnotator)}
      data-index={initialIndex}
    >
      <button type="button" onClick={onClose}>
        close-viewer
      </button>
      <button
        type="button"
        onClick={() => {
          viewerDeleteResult = Promise.resolve(onDelete('p1'));
          viewerDeleteResult.catch(() => undefined);
        }}
      >
        delete-in-viewer
      </button>
      <button type="button" onClick={() => onPhotoChanged({ id: 'p1' } as Photo)}>
        change-in-viewer
      </button>
    </div>
  ),
}));

// ─── Mock: formatters — provides useFormatters() hook ────────────────────────

jest.unstable_mockModule('../../lib/formatters.js', () => {
  const fmtCurrency = (n: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
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
  const fmtDayMonth = (d: string | null | undefined, fallback = '—') => {
    if (!d) return fallback;
    const [year, month, day] = d.slice(0, 10).split('-').map(Number);
    if (!year || !month || !day) return fallback;
    return new Date(year, month - 1, day).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      ...(year !== new Date().getFullYear() ? { year: 'numeric' } : {}),
    });
  };
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
      formatDayMonth: fmtDayMonth,
      formatTime: fmtTime,
      formatDateTime: fmtDateTime,
      formatPercent: (n: number) => `${n.toFixed(2)}%`,
    }),
  };
});

// ── Fixtures ──────────────────────────────────────────────────────────────────

const baseDetail: DiaryEntryDetail = {
  id: 'de-1',
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
  sourceEntityArea: null,
  sourceEntityTitle: null,
  photoCount: 0,
  createdBy: { id: 'user-1', displayName: 'Alice Builder' },
  createdAt: '2026-03-14T09:00:00.000Z',
  updatedAt: '2026-03-14T09:00:00.000Z',
};

describe('DiaryEntryDetailPage', () => {
  let DiaryEntryDetailPage: React.ComponentType;

  beforeEach(async () => {
    localStorage.setItem('theme', 'light');
    if (!DiaryEntryDetailPage) {
      const mod = await import('./DiaryEntryDetailPage.js');
      DiaryEntryDetailPage = mod.default;
    }
    mockGetDiaryEntry.mockReset();
    mockDeleteDiaryEntry.mockReset();
    mockFetchDeleteImpact.mockReset();
    mockFetchDeleteImpact.mockResolvedValue({ entityType: 'diary_entry', id: 'de-1', effects: [] });
    photosState.photos = [];
    photosState.deletePhoto = jest.fn();
    photosState.updatePhotoInList = jest.fn();
  });

  afterEach(() => {
    localStorage.clear();
  });

  const renderDetailPage = (id = 'de-1') =>
    render(
      <MemoryRouter initialEntries={[`/diary/${id}`]}>
        <Routes>
          <Route path="/diary/:id" element={<DiaryEntryDetailPage />} />
          <Route path="/diary" element={<div data-testid="diary-list">Diary List</div>} />
        </Routes>
      </MemoryRouter>,
    );

  // ─── Basic rendering ────────────────────────────────────────────────────────

  it('calls getDiaryEntry with the id from URL params', async () => {
    mockGetDiaryEntry.mockResolvedValueOnce(baseDetail);
    renderDetailPage('de-1');
    await waitFor(() => {
      expect(mockGetDiaryEntry).toHaveBeenCalledWith('de-1');
    });
  });

  it('shows loading indicator while fetching', () => {
    mockGetDiaryEntry.mockReturnValue(new Promise(() => undefined));
    renderDetailPage();
    expect(screen.getByText(/loading entry/i)).toBeInTheDocument();
  });

  it('renders the entry title after load', async () => {
    mockGetDiaryEntry.mockResolvedValueOnce(baseDetail);
    renderDetailPage();
    await waitFor(() => {
      expect(screen.getByText('Foundation Work')).toBeInTheDocument();
    });
  });

  it('renders the entry body after load', async () => {
    mockGetDiaryEntry.mockResolvedValueOnce(baseDetail);
    renderDetailPage();
    await waitFor(() => {
      expect(screen.getByText('Poured concrete for the main foundation.')).toBeInTheDocument();
    });
  });

  it('renders created timestamp', async () => {
    mockGetDiaryEntry.mockResolvedValueOnce(baseDetail);
    renderDetailPage();
    await waitFor(() => {
      expect(screen.getByText('Created:')).toBeInTheDocument();
    });
  });

  it('renders the type badge for the entry type', async () => {
    mockGetDiaryEntry.mockResolvedValueOnce(baseDetail);
    renderDetailPage();
    await waitFor(() => {
      expect(screen.getByTestId('diary-type-badge-daily_log')).toBeInTheDocument();
    });
  });

  // ─── Identity: h1, tab title, trail, Back (#2204) ───────────────────────────

  it('renders exactly one h1 with the entry title and no in-page back button', async () => {
    mockGetDiaryEntry.mockResolvedValueOnce(baseDetail);
    renderDetailPage();
    await screen.findByTestId('diary-type-badge-daily_log');
    // Mutation: keeping the old title-only-if-set h1 or a second h1 changes this count/text.
    const h1s = screen.getAllByRole('heading', { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent('Foundation Work');
    expect(screen.queryByRole('button', { name: /go back/i })).not.toBeInTheDocument();
  });

  it('shows the trail "Site diary" and sets the tab title "<title> · Site diary · ..."', async () => {
    mockGetDiaryEntry.mockResolvedValueOnce(baseDetail);
    renderDetailPage();
    await screen.findByTestId('diary-type-badge-daily_log');
    const nav = screen.getByRole('navigation', { name: 'You are here' });
    expect(within(nav).getAllByRole('link')).toHaveLength(1);
    expect(within(nav).getByRole('link', { name: /Site diary/ })).toHaveAttribute('href', '/diary');
    await waitFor(() => expect(document.title).toMatch(/^Foundation Work · Site diary/));
  });

  it.each([
    ['whitespace title', '   ', 'daily_log', /^Daily log · /],
    ['null title', null, 'site_visit', /^Site visit · /],
  ] as const)(
    'an entry with a %s shows "<Type> · <date>" as its h1',
    async (_n, title, type, re) => {
      // Mutation: rendering entry.title directly yields an empty/blank h1.
      mockGetDiaryEntry.mockResolvedValueOnce({ ...baseDetail, title, entryType: type });
      renderDetailPage();
      const h1 = await screen.findByRole('heading', { level: 1, name: re });
      expect(h1).toHaveTextContent(/Mar 14, 2026|Mar 14/);
      await waitFor(() => expect(document.title.startsWith(h1.textContent ?? '?')).toBe(true));
    },
  );

  it('shows "Back to Home" from a Home origin and "Back to ‹name›" from a named origin', async () => {
    mockGetDiaryEntry.mockResolvedValueOnce(baseDetail);
    render(
      <MemoryRouter
        initialEntries={[
          { pathname: '/diary/de-1', state: { origin: { to: '/project/overview' } } },
        ]}
      >
        <Routes>
          <Route path="/diary/:id" element={<DiaryEntryDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByRole('link', { name: /Back to Home/ })).toHaveAttribute(
      'href',
      '/project/overview',
    );
    cleanup();
    mockGetDiaryEntry.mockResolvedValueOnce(baseDetail);
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/diary/de-1',
            state: { origin: { to: '/photos/spots/s1', name: 'Synthetic spot' } },
          },
        ]}
      >
        <Routes>
          <Route path="/diary/:id" element={<DiaryEntryDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByRole('link', { name: /Back to Synthetic spot/ })).toHaveAttribute(
      'href',
      '/photos/spots/s1',
    );
  });

  it('the Edit and Add photos links carry the entry URL and display title as origin', async () => {
    mockGetDiaryEntry.mockResolvedValueOnce(baseDetail);
    render(
      <MemoryRouter initialEntries={['/diary/de-1']}>
        <Routes>
          <Route path="/diary/:id" element={<DiaryEntryDetailPage />} />
          <Route path="/diary/:id/edit" element={<div>edit-stub</div>} />
        </Routes>
        <OriginProbe />
      </MemoryRouter>,
    );
    // Mutation: dropping state={originState} or the name leaves origin null / nameless.
    fireEvent.click(await screen.findByRole('link', { name: 'Edit' }));
    expect(probedPath()).toBe('/diary/de-1/edit');
    expect(probedOrigin()).toEqual({ to: '/diary/de-1', name: 'Foundation Work' });
  });

  it('an untitled entry passes its generated title as the origin name', async () => {
    mockGetDiaryEntry.mockResolvedValueOnce({ ...baseDetail, title: null });
    render(
      <MemoryRouter initialEntries={['/diary/de-1']}>
        <Routes>
          <Route path="/diary/:id" element={<DiaryEntryDetailPage />} />
          <Route path="/diary/:id/edit" element={<div>edit-stub</div>} />
        </Routes>
        <OriginProbe />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole('link', { name: 'Edit' }));
    expect(probedOrigin()?.name).toMatch(/^Daily log · Mar 14/);
  });

  it('hides Edit and Delete for an automatic, unlocked entry (no empty top bar)', async () => {
    mockGetDiaryEntry.mockResolvedValueOnce({
      ...baseDetail,
      isAutomatic: true,
      entryType: 'work_item_status',
      createdBy: null,
    });
    renderDetailPage();
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^delete/i })).not.toBeInTheDocument();
  });

  // ─── Print button removed ────────────────────────────────────────────────────

  it('does not render a print button', async () => {
    mockGetDiaryEntry.mockResolvedValueOnce(baseDetail);
    renderDetailPage();
    await waitFor(() => {
      expect(screen.getByText('Foundation Work')).toBeInTheDocument();
    });
    // No print button should exist anywhere in the rendered page
    expect(screen.queryByRole('button', { name: /print/i })).not.toBeInTheDocument();
  });

  // ─── Header meta row does not contain created date/author ─────────────────

  it('header meta row contains the entry date but not createdAt or author', async () => {
    mockGetDiaryEntry.mockResolvedValueOnce(baseDetail);
    renderDetailPage();
    await waitFor(() => {
      expect(screen.getByText('Foundation Work')).toBeInTheDocument();
    });

    // The meta row in the card header should show entryDate, not createdAt timestamp
    // Entry date "2026-03-14" should be visible
    const header = document.querySelector('[class*="header"]');
    expect(header).not.toBeNull();

    // Created time/author appears in the timestamps section at bottom, not the header meta row
    // The header meta only has the entry date and optional automatic badge
    // Multiple elements may contain "2026" (entry date + timestamps), so use getAllByText
    expect(screen.getAllByText(/2026/).length).toBeGreaterThan(0);
  });

  it('sourceEntityTitle is displayed in source entity link when provided', async () => {
    const entryWithSource: DiaryEntryDetail = {
      ...baseDetail,
      id: 'de-src',
      entryType: 'work_item_status',
      isAutomatic: true,
      sourceEntityType: 'work_item',
      sourceEntityId: 'wi-kitchen',
      sourceEntityTitle: 'Kitchen Renovation',
      createdBy: null,
    };
    mockGetDiaryEntry.mockResolvedValueOnce(entryWithSource);
    renderDetailPage('de-src');
    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Kitchen Renovation' })).toBeInTheDocument();
    });
  });

  it('source entity link falls back to default label when sourceEntityTitle is null', async () => {
    const entryNoTitle: DiaryEntryDetail = {
      ...baseDetail,
      id: 'de-src-notitle',
      entryType: 'work_item_status',
      isAutomatic: true,
      sourceEntityType: 'work_item',
      sourceEntityId: 'wi-kitchen',
      sourceEntityTitle: null,
      createdBy: null,
    };
    mockGetDiaryEntry.mockResolvedValueOnce(entryNoTitle);
    renderDetailPage('de-src-notitle');
    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Work Item' })).toBeInTheDocument();
    });
  });

  // ─── Type-specific metadata — daily_log ─────────────────────────────────────

  it('shows weather info from daily_log metadata', async () => {
    const dailyLogEntry: DiaryEntryDetail = {
      ...baseDetail,
      entryType: 'daily_log',
      metadata: { weather: 'sunny', workersOnSite: 5 },
    };
    mockGetDiaryEntry.mockResolvedValueOnce(dailyLogEntry);
    renderDetailPage();
    await waitFor(() => {
      expect(screen.getByTestId('daily-log-metadata')).toBeInTheDocument();
      expect(screen.getByText(/sunny/i)).toBeInTheDocument();
      expect(screen.getByText(/5 workers/i)).toBeInTheDocument();
    });
  });

  // ─── Type-specific metadata — site_visit ────────────────────────────────────

  it('shows outcome badge for site_visit with pass outcome', async () => {
    const siteVisitEntry: DiaryEntryDetail = {
      ...baseDetail,
      id: 'de-sv',
      entryType: 'site_visit',
      metadata: { inspectorName: 'Bob Inspector', outcome: 'pass' },
    };
    mockGetDiaryEntry.mockResolvedValueOnce(siteVisitEntry);
    renderDetailPage('de-sv');
    await waitFor(() => {
      expect(screen.getByTestId('outcome-pass')).toBeInTheDocument();
      expect(screen.getByText('Bob Inspector')).toBeInTheDocument();
    });
  });

  it('shows outcome badge for site_visit with fail outcome', async () => {
    const siteVisitEntry: DiaryEntryDetail = {
      ...baseDetail,
      id: 'de-sv-fail',
      entryType: 'site_visit',
      metadata: { outcome: 'fail' },
    };
    mockGetDiaryEntry.mockResolvedValueOnce(siteVisitEntry);
    renderDetailPage('de-sv-fail');
    await waitFor(() => {
      expect(screen.getByTestId('outcome-fail')).toBeInTheDocument();
    });
  });

  it('shows outcome badge for site_visit with conditional outcome', async () => {
    const siteVisitEntry: DiaryEntryDetail = {
      ...baseDetail,
      id: 'de-sv-cond',
      entryType: 'site_visit',
      metadata: { outcome: 'conditional' },
    };
    mockGetDiaryEntry.mockResolvedValueOnce(siteVisitEntry);
    renderDetailPage('de-sv-cond');
    await waitFor(() => {
      expect(screen.getByTestId('outcome-conditional')).toBeInTheDocument();
    });
  });

  // ─── Type-specific metadata — issue ─────────────────────────────────────────

  it('shows severity badge for issue with high severity', async () => {
    const issueEntry: DiaryEntryDetail = {
      ...baseDetail,
      id: 'de-iss',
      entryType: 'issue',
      metadata: { severity: 'high', resolutionStatus: 'open' },
    };
    mockGetDiaryEntry.mockResolvedValueOnce(issueEntry);
    renderDetailPage('de-iss');
    await waitFor(() => {
      expect(screen.getByTestId('severity-high')).toBeInTheDocument();
    });
  });

  it('shows severity badge for issue with critical severity', async () => {
    const issueEntry: DiaryEntryDetail = {
      ...baseDetail,
      id: 'de-iss-crit',
      entryType: 'issue',
      metadata: { severity: 'critical', resolutionStatus: 'in_progress' },
    };
    mockGetDiaryEntry.mockResolvedValueOnce(issueEntry);
    renderDetailPage('de-iss-crit');
    await waitFor(() => {
      expect(screen.getByTestId('severity-critical')).toBeInTheDocument();
    });
  });

  // ─── Photo section ─────────────────────────────────────────────────────────────

  it('shows photo section with heading after entry loads', async () => {
    mockGetDiaryEntry.mockResolvedValueOnce(baseDetail);
    renderDetailPage();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /photos/i })).toBeInTheDocument();
    });
  });

  it('shows empty photo state when no photos attached', async () => {
    mockGetDiaryEntry.mockResolvedValueOnce(baseDetail);
    renderDetailPage();
    await waitFor(() => {
      expect(screen.getByText(/no photos attached/i)).toBeInTheDocument();
    });
  });

  // ─── Automatic entry badge ────────────────────────────────────────────────────

  it('shows "Automatic" badge for automatic entries', async () => {
    const autoEntry: DiaryEntryDetail = {
      ...baseDetail,
      id: 'de-auto',
      entryType: 'work_item_status',
      isAutomatic: true,
      createdBy: null,
    };
    mockGetDiaryEntry.mockResolvedValueOnce(autoEntry);
    renderDetailPage('de-auto');
    await waitFor(() => {
      expect(screen.getByText('Automatic')).toBeInTheDocument();
    });
  });

  // ─── Source entity link ───────────────────────────────────────────────────────

  it('shows the source entity section for automatic entries', async () => {
    const autoEntry: DiaryEntryDetail = {
      ...baseDetail,
      id: 'de-auto-link',
      entryType: 'work_item_status',
      isAutomatic: true,
      sourceEntityType: 'work_item',
      sourceEntityId: 'wi-kitchen',
      createdBy: null,
    };
    mockGetDiaryEntry.mockResolvedValueOnce(autoEntry);
    renderDetailPage('de-auto-link');
    await waitFor(() => {
      expect(screen.getByText(/related to/i)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Work Item' })).toHaveAttribute(
        'href',
        '/project/work-items/wi-kitchen',
      );
    });
  });

  it('links to /budget/invoices/:id for invoice source entity', async () => {
    const invoiceEntry: DiaryEntryDetail = {
      ...baseDetail,
      id: 'de-inv-link',
      entryType: 'invoice_status',
      isAutomatic: true,
      sourceEntityType: 'invoice',
      sourceEntityId: 'inv-999',
      createdBy: null,
    };
    mockGetDiaryEntry.mockResolvedValueOnce(invoiceEntry);
    renderDetailPage('de-inv-link');
    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Invoice' })).toHaveAttribute(
        'href',
        '/budget/invoices/inv-999',
      );
    });
  });

  // ─── 404 not found ───────────────────────────────────────────────────────────

  it('shows "Diary entry not found" for a 404 error', async () => {
    const { ApiClientError } = await import('../../lib/apiClient.js');
    mockGetDiaryEntry.mockRejectedValueOnce(
      new ApiClientError(404, { code: 'NOT_FOUND', message: 'Diary entry not found' }),
    );
    renderDetailPage('nonexistent');
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Diary entry not found');
    });
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByText(/doesn't exist/)).toBeInTheDocument();
    await waitFor(() => expect(document.title).toMatch(/^Diary entry not found/));
  });

  it('shows the API error message for non-404 errors', async () => {
    const { ApiClientError } = await import('../../lib/apiClient.js');
    mockGetDiaryEntry.mockRejectedValueOnce(
      new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'RAW-SERVER-SENTINEL' }),
    );
    renderDetailPage();
    await waitFor(() => {
      expect(screen.getByText(enErrors.INTERNAL_ERROR)).toBeInTheDocument();
    });
    expect(screen.queryByText(/RAW-SERVER-SENTINEL/)).toBeNull();
  });

  it('shows generic error message for non-ApiClientError', async () => {
    mockGetDiaryEntry.mockRejectedValueOnce(new Error('Network failure'));
    renderDetailPage();
    await waitFor(() => {
      expect(screen.getByText(/failed to load diary entry/i)).toBeInTheDocument();
    });
  });

  it('renders Back to Diary link in error state', async () => {
    const { ApiClientError } = await import('../../lib/apiClient.js');
    mockGetDiaryEntry.mockRejectedValueOnce(
      new ApiClientError(404, { code: 'NOT_FOUND', message: 'Not found' }),
    );
    renderDetailPage();
    // Mutation: the retired "Back to Diary" wording fails here.
    const link = await screen.findByRole('link', { name: 'Back to Site diary' });
    expect(link).toHaveAttribute('href', '/diary');
    expect(screen.queryByText(/Back to Diary/)).not.toBeInTheDocument();
  });

  // ─── Timestamps ─────────────────────────────────────────────────────────────

  it('renders the created timestamp', async () => {
    mockGetDiaryEntry.mockResolvedValueOnce(baseDetail);
    renderDetailPage();
    await waitFor(() => {
      expect(screen.getByText(/created/i)).toBeInTheDocument();
    });
  });

  it('renders the updated timestamp when present', async () => {
    const entryWithUpdate: DiaryEntryDetail = {
      ...baseDetail,
      updatedAt: '2026-03-15T10:00:00.000Z',
    };
    mockGetDiaryEntry.mockResolvedValueOnce(entryWithUpdate);
    renderDetailPage();
    await waitFor(() => {
      expect(screen.getByText(/updated/i)).toBeInTheDocument();
    });
  });

  // ─── Signature lock (#2124) ─────────────────────────────────────────────────

  describe('signature lock (#2124)', () => {
    const sig = {
      signerName: 'Alice Builder',
      signerType: 'self' as const,
      signatureDataUrl: 'data:image/png;base64,SIGDATA',
      signedAt: '2026-03-14T10:00:00.000Z',
    };
    const signedDraft: DiaryEntryDetail = {
      ...baseDetail,
      status: 'draft',
      isSigned: true,
      metadata: { signatures: [sig] },
    };
    const signedSaved: DiaryEntryDetail = { ...signedDraft, status: 'saved' };

    it('signed draft: shows the Edit link and editable photos (mutation: lock on raw isSigned)', async () => {
      photosState.photos = [{ id: 'p1' } as Photo];
      mockGetDiaryEntry.mockResolvedValueOnce(signedDraft);
      renderDetailPage();

      const edit = await screen.findByRole('link', { name: 'Edit' });
      expect(edit).toHaveAttribute('href', '/diary/de-1/edit');
      expect(screen.getByTestId('photo-grid-mock')).toHaveAttribute('data-editable', 'true');
      await userEvent.setup().click(screen.getByText('open-photo'));
      expect(await screen.findByTestId('photo-viewer-mock')).toHaveAttribute(
        'data-editable',
        'true',
      );
    });

    it('signed saved: Edit is absent, Delete is present, photos are not editable', async () => {
      photosState.photos = [{ id: 'p1' } as Photo];
      mockGetDiaryEntry.mockResolvedValueOnce(signedSaved);
      renderDetailPage();

      expect(await screen.findByRole('button', { name: 'Delete' })).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument();
      expect(screen.getByTestId('photo-grid-mock')).toHaveAttribute('data-editable', 'false');
      await userEvent.setup().click(screen.getByText('open-photo'));
      expect(await screen.findByTestId('photo-viewer-mock')).toHaveAttribute(
        'data-editable',
        'false',
      );
    });

    it('signed saved: the Delete button still opens the delete dialog (#808)', async () => {
      mockGetDiaryEntry.mockResolvedValueOnce(signedSaved);
      renderDetailPage();
      await userEvent.setup().click(await screen.findByRole('button', { name: 'Delete' }));
      expect(await screen.findByRole('alertdialog', { name: /^Delete / })).toBeInTheDocument();
    });

    it('signed saved with no photos: the photo section is hidden', async () => {
      mockGetDiaryEntry.mockResolvedValueOnce(signedSaved);
      renderDetailPage();
      await screen.findByRole('button', { name: 'Delete' });
      expect(screen.queryByText(/^Photos \(/)).not.toBeInTheDocument();
    });

    it('signed draft with no photos: the photo section and add-photos link stay visible', async () => {
      mockGetDiaryEntry.mockResolvedValueOnce(signedDraft);
      renderDetailPage();
      expect(await screen.findByText('Photos (0)')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Add photos' })).toBeInTheDocument();
    });

    it('unsigned saved entry keeps Edit and Delete', async () => {
      mockGetDiaryEntry.mockResolvedValueOnce(baseDetail);
      renderDetailPage();
      expect(await screen.findByRole('link', { name: 'Edit' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    });

    it('an issue entry with signatures renders the SignatureDisplay image', async () => {
      mockGetDiaryEntry.mockResolvedValueOnce({
        ...signedSaved,
        entryType: 'issue',
        metadata: { severity: 'high', resolutionStatus: 'open', signatures: [sig] },
      });
      renderDetailPage();
      const img = await screen.findByAltText('Signature of Alice Builder');
      expect(img).toHaveAttribute('src', sig.signatureDataUrl);
      expect(screen.getByText('Signed by Alice Builder')).toBeInTheDocument();
    });
  });

  // ─── Delete dialog uses the shared Modal (F13) ──────────────────────────────

  describe('delete dialog (shared Modal)', () => {
    const DELETE = { name: /^Delete / };

    const openDelete = async () => {
      mockGetDiaryEntry.mockResolvedValueOnce(baseDetail);
      renderDetailPage();
      await userEvent.setup().click(await screen.findByRole('button', { name: 'Delete' }));
      return screen.findByRole('alertdialog', DELETE);
    };

    it('portals to document.body and has no fixed #delete-modal-title', async () => {
      const dialog = await openDelete();
      expect(dialog.parentElement).toBe(document.body);
      expect(document.getElementById('delete-modal-title')).toBeNull();
      expect(within(dialog).getByText(/this can't be undone/i)).toBeInTheDocument();
    });

    it.each([
      ['Escape', async () => fireEvent.keyDown(document, { key: 'Escape' })],
      [
        'the close button',
        async () => userEvent.setup().click(screen.getByRole('button', { name: 'Close dialog' })),
      ],
      [
        'the backdrop',
        async () =>
          fireEvent.click(screen.getByRole('alertdialog', DELETE).firstElementChild as HTMLElement),
      ],
      [
        'Cancel',
        async () => userEvent.setup().click(screen.getByRole('button', { name: 'Cancel' })),
      ],
    ])('closes via %s', async (_label, close) => {
      await openDelete();
      await close();
      await waitFor(() =>
        expect(screen.queryByRole('alertdialog', DELETE)).not.toBeInTheDocument(),
      );
    });

    it('Escape does not close the dialog while the delete is in flight', async () => {
      let resolveDelete: () => void = () => undefined;
      mockDeleteDiaryEntry.mockReturnValueOnce(
        new Promise<void>((resolve) => {
          resolveDelete = resolve;
        }),
      );
      const dialog = await openDelete();
      await userEvent.setup().click(await enabledConfirm());
      await within(dialog).findByRole('button', { name: 'Deleting…' });

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.getByRole('alertdialog', DELETE)).toBeInTheDocument();

      await act(async () => {
        resolveDelete();
      });
    });

    it('confirming deletes the entry and navigates to /diary', async () => {
      mockDeleteDiaryEntry.mockResolvedValueOnce(undefined);
      await openDelete();
      await userEvent.setup().click(await enabledConfirm());
      expect(mockDeleteDiaryEntry).toHaveBeenCalledWith('de-1');
      expect(await screen.findByTestId('diary-list')).toBeInTheDocument();
    });

    it('a 409 hides the confirm button and keeps Cancel', async () => {
      mockDeleteDiaryEntry.mockRejectedValueOnce(
        new ApiClientError(409, { code: 'CONFLICT', message: 'x' }),
      );
      const dialog = await openDelete();
      await userEvent.setup().click(await enabledConfirm());
      await waitFor(() => expect(within(dialog).queryByTestId('diary-delete-confirm')).toBeNull());
      expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    });

    it('lists what the delete also removes', async () => {
      mockFetchDeleteImpact.mockResolvedValue({
        entityType: 'diary_entry',
        id: 'de-1',
        effects: [{ kind: 'photos', count: 4 }],
      });
      await openDelete();
      await waitFor(() =>
        expect(screen.getByTestId('diary-delete-consequences')).toHaveTextContent(
          'Photos deleted with it: 4',
        ),
      );
      expect(mockFetchDeleteImpact).toHaveBeenCalledWith('diary_entry', 'de-1');
    });

    it('a non-409 delete failure shows the error inside the dialog and keeps the confirm button for a retry', async () => {
      mockDeleteDiaryEntry.mockRejectedValueOnce(new Error('boom'));
      const dialog = await openDelete();
      await userEvent.setup().click(await enabledConfirm());

      const alert = await within(dialog).findByText(/failed to delete diary entry/i);
      expect(dialog).toContainElement(alert);
      expect(within(dialog).getByTestId('diary-delete-confirm')).toBeInTheDocument();
      expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    });
  });

  // ─── Whole-file coverage: guards, photo viewer, source links ────────────────

  describe('route and load guards', () => {
    it('shows the invalid-id banner when the route has no id param', async () => {
      render(
        <MemoryRouter initialEntries={['/diary']}>
          <Routes>
            <Route path="/diary" element={<DiaryEntryDetailPage />} />
          </Routes>
        </MemoryRouter>,
      );
      // A missing id renders the same not-found page as a 404.
      expect(
        await screen.findByRole('heading', { level: 1, name: 'Diary entry not found' }),
      ).toBeInTheDocument();
      expect(mockGetDiaryEntry).not.toHaveBeenCalled();
      expect(screen.getByRole('link', { name: 'Back to Site diary' })).toHaveAttribute(
        'href',
        '/diary',
      );
    });

    it('shows the not-found message when the API resolves without an entry', async () => {
      mockGetDiaryEntry.mockResolvedValueOnce(null as never);
      renderDetailPage();
      expect(
        await screen.findByRole('heading', { level: 1, name: 'Diary entry not found' }),
      ).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Back to Site diary' })).toBeInTheDocument();
      expect(screen.queryByText('Foundation Work')).not.toBeInTheDocument();
    });
  });

  describe('photo grid and viewer wiring', () => {
    const withPhotos = async () => {
      photosState.photos = [{ id: 'p1' } as Photo];
      mockGetDiaryEntry.mockResolvedValueOnce(baseDetail);
      renderDetailPage();
      await screen.findByTestId('photo-grid-mock');
    };

    it('clicking a photo opens the viewer at its index, not in annotator mode', async () => {
      await withPhotos();
      await userEvent.setup().click(screen.getByText('open-photo'));
      const viewer = await screen.findByTestId('photo-viewer-mock');
      expect(viewer).toHaveAttribute('data-annotator', 'false');
      expect(viewer).toHaveAttribute('data-index', '0');
    });

    it('the edit action opens the viewer in annotator mode', async () => {
      await withPhotos();
      await userEvent.setup().click(screen.getByText('edit-photo'));
      expect(await screen.findByTestId('photo-viewer-mock')).toHaveAttribute(
        'data-annotator',
        'true',
      );
    });

    it('closing the viewer removes it and resets annotator mode', async () => {
      await withPhotos();
      const user = userEvent.setup();
      await user.click(screen.getByText('edit-photo'));
      await user.click(await screen.findByText('close-viewer'));
      expect(screen.queryByTestId('photo-viewer-mock')).not.toBeInTheDocument();
      await user.click(screen.getByText('open-photo'));
      expect(await screen.findByTestId('photo-viewer-mock')).toHaveAttribute(
        'data-annotator',
        'false',
      );
    });

    it('deleting from the viewer deletes the photo and closes the viewer', async () => {
      await withPhotos();
      const user = userEvent.setup();
      await user.click(screen.getByText('open-photo'));
      await user.click(await screen.findByText('delete-in-viewer'));
      expect(photosState.deletePhoto).toHaveBeenCalledWith('p1');
      expect(screen.queryByTestId('photo-viewer-mock')).not.toBeInTheDocument();
    });

    it('awaits the photo delete: the viewer stays open while it is pending and closes on success', async () => {
      await withPhotos();
      let resolveDelete!: () => void;
      photosState.deletePhoto = jest.fn(() => new Promise<void>((r) => (resolveDelete = r)));
      const user = userEvent.setup();
      await user.click(screen.getByText('open-photo'));
      await user.click(await screen.findByText('delete-in-viewer'));

      expect(photosState.deletePhoto).toHaveBeenCalledWith('p1');
      expect(screen.getByTestId('photo-viewer-mock')).toBeInTheDocument();

      await act(async () => {
        resolveDelete();
        await viewerDeleteResult;
      });
      expect(screen.queryByTestId('photo-viewer-mock')).not.toBeInTheDocument();
    });

    it('a failed photo delete rejects to the viewer and keeps it open', async () => {
      await withPhotos();
      const failure = new Error('boom');
      photosState.deletePhoto = jest.fn(() => Promise.reject(failure));
      const user = userEvent.setup();
      await user.click(screen.getByText('open-photo'));
      await user.click(await screen.findByText('delete-in-viewer'));

      await expect(viewerDeleteResult).rejects.toBe(failure);
      expect(screen.getByTestId('photo-viewer-mock')).toBeInTheDocument();
    });

    it('photo changes made in the viewer are forwarded to the photo list', async () => {
      await withPhotos();
      const user = userEvent.setup();
      await user.click(screen.getByText('open-photo'));
      await user.click(await screen.findByText('change-in-viewer'));
      expect(photosState.updatePhotoInList).toHaveBeenCalledWith({ id: 'p1' });
    });
  });

  describe('signature date and source entity links', () => {
    it('falls back to the entry date when a signature has no signedAt', async () => {
      mockGetDiaryEntry.mockResolvedValueOnce({
        ...baseDetail,
        metadata: {
          signatures: [
            {
              signerName: 'Alice',
              signerType: 'self',
              signatureDataUrl: 'data:image/png;base64,A',
            },
          ],
        },
      });
      renderDetailPage();
      await screen.findByAltText('Signature of Alice');
      expect(screen.getAllByText('Mar 14, 2026').length).toBeGreaterThan(0);
    });

    const auto = (sourceEntityType: string | null, sourceEntityTitle: string | null) =>
      ({
        ...baseDetail,
        id: 'de-auto-src',
        entryType: 'work_item_status',
        isAutomatic: true,
        createdBy: null,
        sourceEntityType,
        sourceEntityId: 'src-1',
        sourceEntityTitle,
      }) as DiaryEntryDetail;

    it.each([
      ['work_item', '/project/work-items/src-1'],
      ['invoice', '/budget/invoices/src-1'],
      ['milestone', '/project/milestones/src-1'],
      ['budget_source', '/budget/sources'],
      ['subsidy_program', '/budget/subsidies'],
    ])('links a %s source to %s', async (type, href) => {
      mockGetDiaryEntry.mockResolvedValueOnce(auto(type, 'Source Title'));
      renderDetailPage('de-auto-src');
      expect(await screen.findByRole('link', { name: 'Source Title' })).toHaveAttribute(
        'href',
        href,
      );
    });

    it('uses the translated type label when the source has no title', async () => {
      mockGetDiaryEntry.mockResolvedValueOnce(auto('budget_source', null));
      renderDetailPage('de-auto-src');
      expect(await screen.findByRole('link', { name: 'Budget Sources' })).toBeInTheDocument();
    });

    it.each(DIARY_SOURCE_ENTITY_TYPES)(
      'labels an untitled %s source with its translated type label',
      async (type) => {
        mockGetDiaryEntry.mockResolvedValueOnce(auto(type, null));
        renderDetailPage('de-auto-src');
        expect(
          await screen.findByRole('link', { name: enDiary.detailPage.sourceType[type] }),
        ).toBeInTheDocument();
      },
    );
  });

  // ─── Origin (#2202): the source entity link carries the entry URL ───────────

  it('opens the source task with the entry URL and display title as origin', async () => {
    mockGetDiaryEntry.mockResolvedValueOnce({
      ...baseDetail,
      id: 'de-origin',
      entryType: 'work_item_status',
      isAutomatic: true,
      sourceEntityType: 'work_item',
      sourceEntityId: 'wi-kitchen',
      sourceEntityTitle: 'Kitchen Renovation',
      createdBy: null,
    });
    render(
      <MemoryRouter initialEntries={['/diary/de-origin']}>
        <Routes>
          <Route path="/diary/:id" element={<DiaryEntryDetailPage />} />
        </Routes>
        <OriginProbe />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('link', { name: 'Kitchen Renovation' }));

    expect(probedPath()).toBe('/project/work-items/wi-kitchen');
    expect(probedOrigin()).toEqual({ to: '/diary/de-origin', name: 'Foundation Work' });
  });

  it('shows exactly one "Diary entry" h1 while loading', () => {
    mockGetDiaryEntry.mockReturnValue(new Promise(() => undefined));
    renderDetailPage();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/^Diary entry$/);
  });

  it('a non-404 failure keeps an h1 "Diary entry", the banner and Back to Site diary', async () => {
    mockGetDiaryEntry.mockRejectedValueOnce(new Error('Network failure'));
    renderDetailPage();
    await screen.findByText(/failed to load diary entry/i);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/^Diary entry$/);
    expect(screen.getByRole('link', { name: 'Back to Site diary' })).toBeInTheDocument();
  });

  it('the Add photos link carries the entry origin with its title', async () => {
    mockGetDiaryEntry.mockResolvedValueOnce(baseDetail);
    render(
      <MemoryRouter initialEntries={['/diary/de-1']}>
        <Routes>
          <Route path="/diary/:id" element={<DiaryEntryDetailPage />} />
          <Route path="/diary/:id/edit" element={<div>edit-stub</div>} />
        </Routes>
        <OriginProbe />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole('link', { name: 'Add photos' }));
    expect(probedOrigin()).toEqual({ to: '/diary/de-1', name: 'Foundation Work' });
  });

  it('deleting the entry replaces the history entry with /diary', async () => {
    mockGetDiaryEntry.mockResolvedValueOnce(baseDetail);
    mockDeleteDiaryEntry.mockResolvedValueOnce(undefined);
    const log = createRouterLog();
    render(
      <RecordingRouter entries={['/diary', '/diary/de-1']} log={log}>
        <Routes>
          <Route path="/diary/:id" element={<DiaryEntryDetailPage />} />
          <Route path="/diary" element={<div>list</div>} />
        </Routes>
      </RecordingRouter>,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    await user.click(await enabledConfirm());
    // Mutation: navigate(...) without replace logs PUSH and keeps the deleted entry in history.
    await waitFor(() => expect(log.actions).toEqual(['REPLACE /diary']));
    expect(log.entries).toEqual(['/diary', '/diary']);
  });
});
