/**
 * @jest-environment jsdom
 */
/**
 * The entry page's "Areas" section (#2225, decision 14): the distinct areas of the photos plus
 * the source task's area, each a link with the entry as origin. Until route `area` is served
 * (P5.7) every chip links to the Areas page (`routeUrl('areas')`).
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { DiaryEntryDetail } from '@cornerstone/shared';
import type React from 'react';
import { OriginProbe, probedOrigin, probedPath } from '../../test/originProbe.js';
import type * as DiaryApiTypes from '../../lib/diaryApi.js';

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
    user: { id: 'user-1', displayName: 'Alice Builder', role: 'admin' },
    isLoading: false,
    error: null,
  }),
  AuthProvider: ({ children }: { children: unknown }) => children,
}));

jest.unstable_mockModule('../../hooks/usePhotos.js', () => ({
  usePhotos: () => ({
    photos: [],
    loading: false,
    upload: jest.fn(),
    deletePhoto: jest.fn(),
    updatePhotoInList: jest.fn(),
    reorderPhotos: jest.fn(),
    updateCaption: jest.fn(),
  }),
}));

jest.unstable_mockModule('../../lib/formatters.js', () => {
  const fmtDate = (d: string | null | undefined, fallback = '—') => d ?? fallback;
  const bound = {
    formatCurrency: (n: number) => String(n),
    formatDate: fmtDate,
    formatDayMonth: fmtDate,
    formatClockTime: (t: string) => t,
    formatHours: (h: number) => `${h} h`,
    formatTime: (ts: string | null | undefined, fallback = '—') => ts ?? fallback,
    formatDateTime: (ts: string | null | undefined, fallback = '—') => ts ?? fallback,
    formatPercent: (n: number) => `${n}%`,
  };
  return {
    ...bound,
    computeActualDuration: () => null,
    computeWorkDuration: () => null,
    useFormatters: () => bound,
  };
});

const area = (id: string, name: string, ancestors: { id: string; name: string }[] = []) => ({
  id,
  name,
  color: null,
  ancestors: ancestors.map((a) => ({ ...a, color: null })),
});

const baseDetail: DiaryEntryDetail = {
  id: 'de-1',
  entryType: 'daily_log',
  entryDate: '2026-03-14',
  title: 'Foundation Work',
  body: 'Poured concrete.',
  metadata: null,
  isAutomatic: false,
  isSigned: false,
  status: 'saved',
  sourceEntityType: null,
  sourceEntityId: null,
  sourceEntityArea: null,
  sourceEntityTitle: null,
  photoCount: 0,
  createdBy: { id: 'user-1', displayName: 'Alice Builder' },
  createdAt: '2026-03-14T09:00:00.000Z',
  updatedAt: '2026-03-14T09:00:00.000Z',
};

describe('DiaryEntryDetailPage: Areas section (#2225)', () => {
  let DiaryEntryDetailPage: React.ComponentType;

  beforeEach(async () => {
    localStorage.setItem('theme', 'light');
    mockGetDiaryEntry.mockReset();
    if (!DiaryEntryDetailPage) {
      DiaryEntryDetailPage = (await import('./DiaryEntryDetailPage.js')).default;
    }
  });

  afterEach(() => {
    localStorage.clear();
  });

  const renderPage = () =>
    render(
      <MemoryRouter initialEntries={['/diary/de-1']}>
        <Routes>
          <Route path="/diary/:id" element={<DiaryEntryDetailPage />} />
          <Route path="/areas" element={<div>areas-stub</div>} />
        </Routes>
        <OriginProbe />
      </MemoryRouter>,
    );

  it('shows one chip per photo area as its full path, under an "Areas" heading', async () => {
    mockGetDiaryEntry.mockResolvedValueOnce({
      ...baseDetail,
      photoAreas: [area('a1', 'Room 1', [{ id: 'a0', name: 'Area A' }]), area('a2', 'Area B')],
    });
    renderPage();
    const section = await screen.findByTestId('diary-entry-areas');
    expect(within(section).getByRole('heading', { level: 2, name: 'Areas' })).toBeInTheDocument();
    const chips = within(section).getAllByRole('link');
    expect(chips).toHaveLength(2);
    expect(chips[0]).toHaveTextContent('Area A › Room 1');
    expect(chips[0]).toHaveAttribute('href', '/areas');
    expect(chips[1]).toHaveTextContent('Area B');
    expect(chips[1]).toHaveAttribute('href', '/areas');
  });

  it("adds the source task's area and drops duplicates by id", async () => {
    mockGetDiaryEntry.mockResolvedValueOnce({
      ...baseDetail,
      photoAreas: [area('a1', 'Room 1')],
      sourceEntityType: 'work_item',
      sourceEntityId: 'wi-1',
      sourceEntityTitle: 'Kitchen tiling',
      sourceEntityArea: area('a2', 'Area B'),
    });
    renderPage();
    const section = await screen.findByTestId('diary-entry-areas');
    expect(within(section).getAllByRole('link')).toHaveLength(2);

    document.body.innerHTML = '';
    mockGetDiaryEntry.mockResolvedValueOnce({
      ...baseDetail,
      photoAreas: [area('a1', 'Room 1')],
      sourceEntityType: 'work_item',
      sourceEntityId: 'wi-1',
      sourceEntityArea: area('a1', 'Room 1'),
    });
    renderPage();
    await waitFor(() =>
      expect(within(screen.getByTestId('diary-entry-areas')).getAllByRole('link')).toHaveLength(1),
    );
  });

  it('shows the source area alone when the photos carry no area', async () => {
    mockGetDiaryEntry.mockResolvedValueOnce({
      ...baseDetail,
      photoAreas: [],
      sourceEntityType: 'work_item',
      sourceEntityId: 'wi-1',
      sourceEntityArea: area('a2', 'Area B'),
    });
    renderPage();
    const section = await screen.findByTestId('diary-entry-areas');
    expect(within(section).getAllByRole('link')).toHaveLength(1);
    expect(section).toHaveTextContent('Area B');
  });

  it('is absent without any area, and for an entry that has only an invoice source', async () => {
    mockGetDiaryEntry.mockResolvedValueOnce({
      ...baseDetail,
      sourceEntityType: 'invoice',
      sourceEntityId: 'inv-1',
    });
    renderPage();
    await screen.findByTestId('diary-type-badge-daily_log');
    expect(screen.queryByTestId('diary-entry-areas')).not.toBeInTheDocument();
  });

  it('is absent for an automatic entry', async () => {
    mockGetDiaryEntry.mockResolvedValueOnce({
      ...baseDetail,
      isAutomatic: true,
      entryType: 'work_item_status',
      createdBy: null,
      photoAreas: [area('a1', 'Room 1')],
    });
    renderPage();
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByTestId('diary-entry-areas')).not.toBeInTheDocument();
  });

  it('opens the area with the entry and its title as origin', async () => {
    mockGetDiaryEntry.mockResolvedValueOnce({ ...baseDetail, photoAreas: [area('a1', 'Room 1')] });
    renderPage();
    fireEvent.click(await screen.findByTestId('diary-entry-area-a1'));
    expect(probedPath()).toBe('/areas');
    expect(probedOrigin()).toEqual({ to: '/diary/de-1', name: 'Foundation Work' });
  });

  it('sits after the signatures and before "Related to:"', async () => {
    mockGetDiaryEntry.mockResolvedValueOnce({
      ...baseDetail,
      entryType: 'daily_log',
      metadata: {
        signatures: [
          {
            signerName: 'Alice Builder',
            signerType: 'self',
            signatureDataUrl: 'data:image/png;base64,SIG',
            signedAt: '2026-03-14T10:00:00.000Z',
          },
        ],
      },
      photoAreas: [area('a1', 'Room 1')],
      sourceEntityType: 'work_item',
      sourceEntityId: 'wi-1',
      sourceEntityTitle: 'Kitchen tiling',
    });
    renderPage();
    const areas = await screen.findByTestId('diary-entry-areas');
    const follows = (a: HTMLElement, b: HTMLElement) =>
      a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING;
    expect(follows(screen.getByAltText('Signature of Alice Builder'), areas)).toBeTruthy();
    expect(follows(areas, screen.getByText('Related to:'))).toBeTruthy();
    expect(follows(areas, screen.getByTestId('diary-entry-history'))).toBeTruthy();
  });
});
