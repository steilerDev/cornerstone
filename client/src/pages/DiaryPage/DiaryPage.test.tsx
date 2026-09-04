/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { act, fireEvent, screen, waitFor, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type * as DiaryApiTypes from '../../lib/diaryApi.js';
import type { DiaryEntryListResponse, DiaryEntrySummary } from '@cornerstone/shared';
import type React from 'react';

/** Renders the current URL's search string into the DOM so tests can assert on
 * which query params are present/absent without reaching into router internals. */
function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location-search">{location.search}</div>;
}

// ── IntersectionObserver stub ────────────────────────────────────────────────
// jsdom does not implement IntersectionObserver, and useInfiniteScroll (used by
// DiaryPage) attaches one to its sentinel unconditionally on mount. None of these
// page-level tests drive the observer directly (that's covered in
// useInfiniteScroll.test.tsx) — this is just a no-op stub so mounting doesn't throw.
class NoopIntersectionObserver {
  observe = jest.fn();
  disconnect = jest.fn();
  unobserve = jest.fn();
  constructor(_cb: IntersectionObserverCallback) {}
}

let originalIntersectionObserver: typeof IntersectionObserver | undefined;

// ── API mock ──────────────────────────────────────────────────────────────────

const mockListDiaryEntries = jest.fn<typeof DiaryApiTypes.listDiaryEntries>();

jest.unstable_mockModule('../../lib/diaryApi.js', () => ({
  listDiaryEntries: mockListDiaryEntries,
  getDiaryEntry: jest.fn(),
  createDiaryEntry: jest.fn(),
  updateDiaryEntry: jest.fn(),
  deleteDiaryEntry: jest.fn(),
  promoteDiaryEntry: jest.fn(),
}));

// ─── Mock: formatters — DiaryDateGroup and DiaryEntryCard use useFormatters() ──

jest.unstable_mockModule('../../lib/formatters.js', () => {
  const fmtCurrency = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR' }).format(n);
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
  const fmtTime = (ts: string | null | undefined, fallback = '—') => ts ?? fallback;
  const fmtDateTime = (ts: string | null | undefined, fallback = '—') => ts ?? fallback;
  return {
    formatCurrency: fmtCurrency,
    formatDate: fmtDate,
    formatTime: fmtTime,
    formatDateTime: fmtDateTime,
    formatPercent: (n: number) => `${n.toFixed(2)}%`,
    computeActualDuration: jest.fn(),
    computeWorkDuration: jest.fn(),
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

function makeSummary(id: string, overrides: Partial<DiaryEntrySummary> = {}): DiaryEntrySummary {
  return {
    id,
    entryType: 'daily_log',
    entryDate: '2026-03-14',
    title: `Entry ${id}`,
    body: `Body of entry ${id}`,
    metadata: null,
    isAutomatic: false,
    isSigned: false,
    status: 'saved',
    sourceEntityType: null,
    sourceEntityId: null,
    sourceEntityArea: null,
    sourceEntityTitle: null,
    photoCount: 0,
    createdBy: { id: 'user-1', displayName: 'Alice' },
    createdAt: '2026-03-14T09:00:00.000Z',
    updatedAt: '2026-03-14T09:00:00.000Z',
    ...overrides,
  };
}

function makeListResponse(entries: DiaryEntrySummary[], totalPages = 1): DiaryEntryListResponse {
  return {
    items: entries,
    pagination: {
      page: 1,
      pageSize: 25,
      totalPages,
      totalItems: entries.length,
    },
  };
}

const emptyResponse = makeListResponse([]);

describe('DiaryPage', () => {
  let DiaryPage: React.ComponentType;

  beforeEach(async () => {
    localStorage.setItem('theme', 'light');
    if (!DiaryPage) {
      const mod = await import('./DiaryPage.js');
      DiaryPage = mod.default;
    }
    mockListDiaryEntries.mockReset();
    originalIntersectionObserver = globalThis.IntersectionObserver;
    (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver =
      NoopIntersectionObserver;
  });

  afterEach(() => {
    localStorage.clear();
    (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver =
      originalIntersectionObserver;
  });

  const renderPage = (initialEntries = ['/diary']) =>
    render(
      <MemoryRouter initialEntries={initialEntries}>
        <LocationDisplay />
        <DiaryPage />
      </MemoryRouter>,
    );

  // ─── Heading ────────────────────────────────────────────────────────────────

  it('renders the "Construction Diary" h1 heading', async () => {
    mockListDiaryEntries.mockResolvedValueOnce(emptyResponse);
    renderPage();
    expect(
      screen.getByRole('heading', { name: 'Construction Diary', level: 1 }),
    ).toBeInTheDocument();
  });

  it('shows the total entry count in the subtitle', async () => {
    mockListDiaryEntries.mockResolvedValueOnce(
      makeListResponse([makeSummary('1'), makeSummary('2')]),
    );
    // Scoped to the .subtitle element specifically: the infinite-scroll live region
    // also announces "Loaded 2 entries" on the same page, which would otherwise
    // collide with a bare /2 entries/i text query.
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('.subtitle')).toHaveTextContent(/2\s*entries/i);
    });
  });

  it('uses singular "entry" when totalItems is 1', async () => {
    mockListDiaryEntries.mockResolvedValueOnce(makeListResponse([makeSummary('1')]));
    // Scoped to the .subtitle element specifically: the infinite-scroll live region
    // also announces "1 entry loaded" on the same page (initialLoadAnnouncementSingular),
    // which would otherwise collide with a bare /1 entry/i text query.
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('.subtitle')).toHaveTextContent(/1\s*entry\b/i);
    });
  });

  // ─── API call on mount ───────────────────────────────────────────────────────

  it('calls listDiaryEntries on mount', async () => {
    mockListDiaryEntries.mockResolvedValueOnce(emptyResponse);
    renderPage();
    await waitFor(() => {
      expect(mockListDiaryEntries).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Loading state ──────────────────────────────────────────────────────────

  it('shows loading indicator while fetching', () => {
    // Never resolves during this check
    mockListDiaryEntries.mockReturnValue(new Promise(() => undefined));
    renderPage();
    expect(screen.getByText(/loading entries/i)).toBeInTheDocument();
  });

  // ─── Entry display and grouping ─────────────────────────────────────────────

  it('renders entry cards after successful load', async () => {
    mockListDiaryEntries.mockResolvedValueOnce(makeListResponse([makeSummary('de-1')]));
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('diary-card-de-1')).toBeInTheDocument();
    });
  });

  it('groups entries under a date header', async () => {
    mockListDiaryEntries.mockResolvedValueOnce(
      makeListResponse([makeSummary('de-1', { entryDate: '2026-03-14' })]),
    );
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('date-group-2026-03-14')).toBeInTheDocument();
    });
  });

  it('shows multiple date groups when entries span different dates', async () => {
    mockListDiaryEntries.mockResolvedValueOnce(
      makeListResponse([
        makeSummary('de-1', { entryDate: '2026-03-14' }),
        makeSummary('de-2', { entryDate: '2026-03-13' }),
      ]),
    );
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('date-group-2026-03-14')).toBeInTheDocument();
      expect(screen.getByTestId('date-group-2026-03-13')).toBeInTheDocument();
    });
  });

  it('renders the filter bar', async () => {
    mockListDiaryEntries.mockResolvedValueOnce(emptyResponse);
    renderPage();
    expect(screen.getByTestId('diary-filter-bar')).toBeInTheDocument();
  });

  // ─── Empty state ────────────────────────────────────────────────────────────

  it('shows empty state when no entries exist', async () => {
    mockListDiaryEntries.mockResolvedValueOnce(emptyResponse);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/no diary entries yet/i)).toBeInTheDocument();
    });
  });

  it('shows a CTA link to create first entry in empty state', async () => {
    mockListDiaryEntries.mockResolvedValueOnce(emptyResponse);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/create your first entry/i)).toBeInTheDocument();
    });
  });

  // ─── Error state ─────────────────────────────────────────────────────────────

  it('shows an error banner when the API fails', async () => {
    const { ApiClientError } = await import('../../lib/apiClient.js');
    mockListDiaryEntries.mockRejectedValueOnce(
      new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'Server went down' }),
    );
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Server went down')).toBeInTheDocument();
    });
  });

  it('shows generic error message when non-ApiClientError is thrown', async () => {
    mockListDiaryEntries.mockRejectedValueOnce(new Error('Network error'));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/failed to load diary entries/i)).toBeInTheDocument();
    });
  });

  // ─── Infinite scroll (Issue #2060) ───────────────────────────────────────────

  describe('infinite scroll', () => {
    it('renders the first batch on mount, and the load-more button is present when hasMore', async () => {
      mockListDiaryEntries.mockResolvedValueOnce({
        items: [makeSummary('p1-1'), makeSummary('p1-2')],
        pagination: { page: 1, pageSize: 25, totalPages: 3, totalItems: 60 },
      });
      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('diary-card-p1-1')).toBeInTheDocument();
      });
      expect(screen.getByTestId('diary-card-p1-2')).toBeInTheDocument();
      expect(screen.getByTestId('diary-load-more-button')).toBeInTheDocument();
    });

    it('does not render the load-more button and shows the end-of-list row when there is only one page', async () => {
      mockListDiaryEntries.mockResolvedValueOnce(makeListResponse([makeSummary('de-1')], 1));
      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('diary-card-de-1')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('diary-load-more-button')).not.toBeInTheDocument();
      expect(screen.getByTestId('diary-end-of-list')).toBeInTheDocument();
    });

    it('changing the search query re-fetches from page 1 and discards previously-appended entries; the URL keeps q but never gains a page param', async () => {
      const user = userEvent.setup();
      mockListDiaryEntries.mockResolvedValueOnce(makeListResponse([makeSummary('old-1')]));
      mockListDiaryEntries.mockResolvedValueOnce(makeListResponse([makeSummary('new-1')]));

      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId('diary-card-old-1')).toBeInTheDocument();
      });

      await user.type(screen.getByTestId('diary-search-input'), 'foo');

      await waitFor(
        () => {
          expect(screen.getByTestId('diary-card-new-1')).toBeInTheDocument();
        },
        { timeout: 2000 },
      );
      expect(screen.queryByTestId('diary-card-old-1')).not.toBeInTheDocument();

      const lastCall = mockListDiaryEntries.mock.calls[mockListDiaryEntries.mock.calls.length - 1];
      expect(lastCall?.[0]?.q).toBe('foo');
      expect(lastCall?.[0]?.page).toBe(1);

      const search = screen.getByTestId('location-search').textContent ?? '';
      expect(search).toContain('q=foo');
      expect(search).not.toContain('page=');
    });

    // Regression test for a finding surfaced alongside BUG-2060-1/2060-2: the
    // debounced-search-sync effect only wrote/deleted the `q` param and did not
    // delete a stale `page` param already present in the URL (e.g. from a
    // pre-rework bookmark/shared link), unlike every other filter-change
    // handler in this file, which all do `newParams.delete('page')`. Fixed by
    // adding the same `newParams.delete('page')` to that effect.
    it('typing a search query when the URL already has a stale page param removes it', async () => {
      const user = userEvent.setup();
      mockListDiaryEntries.mockResolvedValueOnce(makeListResponse([makeSummary('old-1')]));
      mockListDiaryEntries.mockResolvedValueOnce(makeListResponse([makeSummary('new-1')]));

      renderPage(['/diary?page=3']);
      await waitFor(() => {
        expect(screen.getByTestId('diary-card-old-1')).toBeInTheDocument();
      });

      await user.type(screen.getByTestId('diary-search-input'), 'foo');

      await waitFor(
        () => {
          expect(screen.getByTestId('diary-card-new-1')).toBeInTheDocument();
        },
        { timeout: 2000 },
      );

      const search = screen.getByTestId('location-search').textContent ?? '';
      expect(search).toContain('q=foo');
      expect(search).not.toContain('page=');
    });

    it('clicking the load-more button in idle state fetches page 2 and appends its items below the first batch', async () => {
      const user = userEvent.setup();
      mockListDiaryEntries.mockResolvedValueOnce({
        items: [makeSummary('p1-1')],
        pagination: { page: 1, pageSize: 25, totalPages: 2, totalItems: 30 },
      });
      mockListDiaryEntries.mockResolvedValueOnce({
        items: [makeSummary('p2-1')],
        pagination: { page: 2, pageSize: 25, totalPages: 2, totalItems: 30 },
      });

      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId('diary-card-p1-1')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('diary-load-more-button'));

      await waitFor(() => {
        expect(screen.getByTestId('diary-card-p2-1')).toBeInTheDocument();
      });
      expect(screen.getByTestId('diary-card-p1-1')).toBeInTheDocument();

      expect(mockListDiaryEntries).toHaveBeenCalledTimes(2);
      expect(mockListDiaryEntries.mock.calls[1]?.[0]?.page).toBe(2);
    });

    it('shows the full-page error banner when listDiaryEntries rejects on the first call (no entries yet)', async () => {
      mockListDiaryEntries.mockRejectedValueOnce(new Error('network down'));
      renderPage();

      await waitFor(() => {
        expect(screen.getByText(/failed to load diary entries/i)).toBeInTheDocument();
      });
      expect(screen.getByText(/failed to load diary entries/i)).toHaveClass('bannerError');
    });

    it('a failed append fetch shows the footer error banner (not the full-page banner) and keeps the first batch of cards', async () => {
      const user = userEvent.setup();
      mockListDiaryEntries.mockResolvedValueOnce({
        items: [makeSummary('p1-1')],
        pagination: { page: 1, pageSize: 25, totalPages: 2, totalItems: 30 },
      });
      mockListDiaryEntries.mockRejectedValueOnce(new Error('network blip'));

      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId('diary-card-p1-1')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('diary-load-more-button'));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('Failed to load more entries.');
      });
      // The full-page banner must not render — entries are still present.
      expect(screen.queryByText(/failed to load diary entries/i)).not.toBeInTheDocument();
      expect(screen.getByTestId('diary-card-p1-1')).toBeInTheDocument();
    });

    it('visiting with ?page=3&q=foo in the URL loads page-1 semantics, honors q=foo, and does not error', async () => {
      mockListDiaryEntries.mockResolvedValueOnce(makeListResponse([makeSummary('foo-1')]));

      render(
        <MemoryRouter initialEntries={['/diary?page=3&q=foo']}>
          <LocationDisplay />
          <DiaryPage />
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByTestId('diary-card-foo-1')).toBeInTheDocument();
      });

      const callArg = mockListDiaryEntries.mock.calls[0]?.[0];
      expect(callArg?.page).toBe(1);
      expect(callArg?.q).toBe('foo');
      expect(screen.queryByText(/failed to load/i)).not.toBeInTheDocument();
    });

    it('sets aria-busy=true on the timeline only while an append fetch is loading, and the timeline does not exist during the very first load', async () => {
      let resolveFirst: ((v: DiaryEntryListResponse) => void) | undefined;
      const firstPromise = new Promise<DiaryEntryListResponse>((resolve) => {
        resolveFirst = resolve;
      });
      let resolveSecond: ((v: DiaryEntryListResponse) => void) | undefined;
      const secondPromise = new Promise<DiaryEntryListResponse>((resolve) => {
        resolveSecond = resolve;
      });

      mockListDiaryEntries.mockImplementationOnce(() => firstPromise);
      mockListDiaryEntries.mockImplementationOnce(() => secondPromise);

      renderPage();

      // Initial load: entries.length === 0, so the timeline isn't rendered yet.
      expect(screen.queryByRole('feed')).not.toBeInTheDocument();

      await act(async () => {
        resolveFirst?.({
          items: [makeSummary('p1-1')],
          pagination: { page: 1, pageSize: 25, totalPages: 2, totalItems: 30 },
        });
        await firstPromise;
      });

      await waitFor(() => {
        expect(screen.getByTestId('diary-card-p1-1')).toBeInTheDocument();
      });
      const timeline = screen.getByRole('feed');
      expect(timeline).toHaveAttribute('aria-busy', 'false');

      const user = userEvent.setup();
      await user.click(screen.getByTestId('diary-load-more-button'));

      await waitFor(() => {
        expect(timeline).toHaveAttribute('aria-busy', 'true');
      });

      await act(async () => {
        resolveSecond?.({
          items: [makeSummary('p2-1')],
          pagination: { page: 2, pageSize: 25, totalPages: 2, totalItems: 30 },
        });
        await secondPromise;
      });

      await waitFor(() => {
        expect(timeline).toHaveAttribute('aria-busy', 'false');
      });
    });

    it('announces via the singular "more entry loaded" copy (not the end-of-list copy) when hasMore remains true after an append', async () => {
      const user = userEvent.setup();
      mockListDiaryEntries.mockResolvedValueOnce({
        items: [makeSummary('p1-1')],
        pagination: { page: 1, pageSize: 25, totalPages: 3, totalItems: 60 },
      });
      mockListDiaryEntries.mockResolvedValueOnce({
        items: [makeSummary('p2-1')],
        pagination: { page: 2, pageSize: 25, totalPages: 3, totalItems: 60 },
      });

      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId('diary-card-p1-1')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('diary-load-more-button'));

      await waitFor(() => {
        // count === 1 selects the singular grammar key ("entry", not "entries").
        expect(screen.getByRole('status')).toHaveTextContent('1 more entry loaded');
      });
      // Still more pages after this batch — must not use the end-of-list announcement.
      expect(screen.getByRole('status')).not.toHaveTextContent(/reached the end/i);
    });

    it("after appending additional batches for one filter, changing filters announces the new filter's first batch via initial-load phrasing (not appended phrasing)", async () => {
      const user = userEvent.setup();
      mockListDiaryEntries.mockResolvedValueOnce({
        items: [makeSummary('f1-1'), makeSummary('f1-2')],
        pagination: { page: 1, pageSize: 25, totalPages: 2, totalItems: 40 },
      });
      mockListDiaryEntries.mockResolvedValueOnce({
        items: [makeSummary('f1-3')],
        pagination: { page: 2, pageSize: 25, totalPages: 2, totalItems: 40 },
      });
      mockListDiaryEntries.mockResolvedValueOnce({
        items: [makeSummary('f2-1'), makeSummary('f2-2')],
        pagination: { page: 1, pageSize: 25, totalPages: 1, totalItems: 2 },
      });

      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId('diary-card-f1-1')).toBeInTheDocument();
      });

      // Append a second batch for the first filter — uses "appended" phrasing (covered above).
      await user.click(screen.getByTestId('diary-load-more-button'));
      await waitFor(() => {
        expect(screen.getByTestId('diary-card-f1-3')).toBeInTheDocument();
      });
      expect(screen.getByRole('status')).toHaveTextContent(/more entr(y|ies) loaded/i);

      // Change filters (dateFrom) — resets fetchSequence, so the new filter's first
      // successful load must read as fetchSequence === 1 again.
      fireEvent.change(screen.getByTestId('diary-date-from'), { target: { value: '2026-01-01' } });

      await waitFor(() => {
        expect(screen.getByTestId('diary-card-f2-1')).toBeInTheDocument();
      });
      expect(screen.getByTestId('diary-card-f2-2')).toBeInTheDocument();
      expect(screen.queryByTestId('diary-card-f1-1')).not.toBeInTheDocument();

      const status = screen.getByRole('status');
      // initialLoadAnnouncementPlural: "{{count}} entries loaded" (count=2) — not "more ... loaded".
      expect(status).toHaveTextContent('2 entries loaded');
      expect(status).not.toHaveTextContent(/more entr(y|ies) loaded/i);
    });

    it("when a slow first (pre-filter-change) response resolves after a fast second (post-filter-change) response, the header subtitle reflects only the current filter's totalItems", async () => {
      const user = userEvent.setup();
      let resolveSlow: ((v: DiaryEntryListResponse) => void) | undefined;
      const slowPromise = new Promise<DiaryEntryListResponse>((resolve) => {
        resolveSlow = resolve;
      });

      // Initial mount fetch — held open, never resolves until we say so.
      mockListDiaryEntries.mockImplementationOnce(() => slowPromise);
      // Post-search-change fetch — resolves immediately, with a DIFFERENT totalItems.
      mockListDiaryEntries.mockResolvedValueOnce({
        items: [makeSummary('new-1')],
        pagination: { page: 1, pageSize: 25, totalPages: 1, totalItems: 7 },
      });

      const { container } = renderPage();

      // Change filters before the slow initial-mount request resolves.
      await user.type(screen.getByTestId('diary-search-input'), 'foo');

      await waitFor(
        () => {
          expect(screen.getByTestId('diary-card-new-1')).toBeInTheDocument();
        },
        { timeout: 2000 },
      );
      expect(container.querySelector('.subtitle')).toHaveTextContent(/7\s*entries/i);

      // Now let the stale slow response resolve, with a totally different totalItems.
      await act(async () => {
        resolveSlow?.({
          items: [makeSummary('old-1')],
          pagination: { page: 1, pageSize: 25, totalPages: 1, totalItems: 999 },
        });
        await slowPromise;
      });

      // The stale (epoch-superseded) response must not clobber the current filter's count.
      expect(container.querySelector('.subtitle')).toHaveTextContent(/7\s*entries/i);
      expect(container.querySelector('.subtitle')).not.toHaveTextContent(/999/);
    });

    it('toggling an entry type chip while in manual mode restricts the query to the manual/type intersection and removes the page param', async () => {
      const user = userEvent.setup();
      mockListDiaryEntries.mockResolvedValueOnce(makeListResponse([makeSummary('m-1')]));
      mockListDiaryEntries.mockResolvedValueOnce(makeListResponse([makeSummary('m-2')]));

      renderPage(['/diary']); // default filterMode is 'manual'
      await waitFor(() => {
        expect(screen.getByTestId('diary-card-m-1')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('type-filter-daily_log'));

      await waitFor(() => {
        expect(screen.getByTestId('diary-card-m-2')).toBeInTheDocument();
      });
      const lastCall = mockListDiaryEntries.mock.calls[mockListDiaryEntries.mock.calls.length - 1];
      expect(lastCall?.[0]?.type).toBe('daily_log');

      const search = screen.getByTestId('location-search').textContent ?? '';
      expect(search).toContain('types=daily_log');
      expect(search).not.toContain('page=');
    });

    it('toggling an entry type chip while in automatic mode restricts the query to the automatic/type intersection', async () => {
      const user = userEvent.setup();
      mockListDiaryEntries.mockResolvedValueOnce(makeListResponse([makeSummary('a-1')]));
      mockListDiaryEntries.mockResolvedValueOnce(makeListResponse([makeSummary('a-2')]));

      renderPage(['/diary?filterMode=automatic']);
      await waitFor(() => {
        expect(screen.getByTestId('diary-card-a-1')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('type-filter-work_item_status'));

      await waitFor(() => {
        expect(screen.getByTestId('diary-card-a-2')).toBeInTheDocument();
      });
      const lastCall = mockListDiaryEntries.mock.calls[mockListDiaryEntries.mock.calls.length - 1];
      expect(lastCall?.[0]?.type).toBe('work_item_status');
    });

    it('changing the date-from filter removes the page param and re-fetches from page 1', async () => {
      mockListDiaryEntries.mockResolvedValueOnce(makeListResponse([makeSummary('d-1')]));
      mockListDiaryEntries.mockResolvedValueOnce(makeListResponse([makeSummary('d-2')]));

      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId('diary-card-d-1')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByTestId('diary-date-from'), { target: { value: '2026-01-01' } });

      await waitFor(() => {
        expect(screen.getByTestId('diary-card-d-2')).toBeInTheDocument();
      });
      const lastCall = mockListDiaryEntries.mock.calls[mockListDiaryEntries.mock.calls.length - 1];
      expect(lastCall?.[0]?.dateFrom).toBe('2026-01-01');
      const search = screen.getByTestId('location-search').textContent ?? '';
      expect(search).not.toContain('page=');
    });

    it('changing the date-to filter removes the page param and re-fetches from page 1', async () => {
      mockListDiaryEntries.mockResolvedValueOnce(makeListResponse([makeSummary('d-1')]));
      mockListDiaryEntries.mockResolvedValueOnce(makeListResponse([makeSummary('d-2')]));

      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId('diary-card-d-1')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByTestId('diary-date-to'), { target: { value: '2026-02-01' } });

      await waitFor(() => {
        expect(screen.getByTestId('diary-card-d-2')).toBeInTheDocument();
      });
      const lastCall = mockListDiaryEntries.mock.calls[mockListDiaryEntries.mock.calls.length - 1];
      expect(lastCall?.[0]?.dateTo).toBe('2026-02-01');
      const search = screen.getByTestId('location-search').textContent ?? '';
      expect(search).not.toContain('page=');
    });

    it('clicking a filter-mode chip removes the page param, updates the URL, and re-fetches', async () => {
      const user = userEvent.setup();
      mockListDiaryEntries.mockResolvedValueOnce(makeListResponse([makeSummary('fm-1')]));
      mockListDiaryEntries.mockResolvedValueOnce(makeListResponse([makeSummary('fm-2')]));

      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId('diary-card-fm-1')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('mode-filter-automatic'));

      await waitFor(() => {
        expect(screen.getByTestId('diary-card-fm-2')).toBeInTheDocument();
      });
      const search = screen.getByTestId('location-search').textContent ?? '';
      expect(search).toContain('filterMode=automatic');
      expect(search).not.toContain('page=');
    });
  });

  // ─── Filter mode changes call API ──────────────────────────────────────────

  // ─── New Entry button ─────────────────────────────────────────────────────

  it('renders a "+ New Entry" link pointing to /diary/new', async () => {
    mockListDiaryEntries.mockResolvedValueOnce(emptyResponse);
    renderPage();
    const newEntryLink = screen.getByRole('link', { name: /new entry/i });
    expect(newEntryLink).toHaveAttribute('href', '/diary/new');
  });

  // ─── Export functionality removed ─────────────────────────────────────────

  it('does not render an export or PDF button', async () => {
    mockListDiaryEntries.mockResolvedValueOnce(makeListResponse([makeSummary('de-1')]));
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('diary-card-de-1')).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /export/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /pdf/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /export/i })).not.toBeInTheDocument();
  });

  // ─── Filter mode default and URL param behaviour ──────────────────────────────

  describe('filter mode — default and URL param behaviour', () => {
    it('defaults to manual filter mode when no filterMode URL param is present', async () => {
      mockListDiaryEntries.mockResolvedValueOnce(emptyResponse);
      renderPage(['/diary']);
      await waitFor(() => {
        expect(mockListDiaryEntries).toHaveBeenCalledTimes(1);
      });
      // The manual mode button should be pressed
      expect(screen.getByTestId('mode-filter-manual')).toHaveAttribute('aria-pressed', 'true');
      // The all mode button should not be pressed
      expect(screen.getByTestId('mode-filter-all')).toHaveAttribute('aria-pressed', 'false');
      // The API call should include the manual type set
      const callArg = mockListDiaryEntries.mock.calls[0]?.[0];
      expect(callArg?.type).toBeDefined();
      expect(callArg?.type).toContain('daily_log');
    });

    it('honors explicit filterMode=all URL param', async () => {
      mockListDiaryEntries.mockResolvedValueOnce(emptyResponse);
      renderPage(['/diary?filterMode=all']);
      await waitFor(() => {
        expect(mockListDiaryEntries).toHaveBeenCalledTimes(1);
      });
      // The all mode button should be pressed
      expect(screen.getByTestId('mode-filter-all')).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByTestId('mode-filter-manual')).toHaveAttribute('aria-pressed', 'false');
      // With filterMode=all and no type restrictions, type should be undefined (no restriction)
      const callArg = mockListDiaryEntries.mock.calls[0]?.[0];
      expect(callArg?.type).toBeUndefined();
    });

    it('honors explicit filterMode=automatic URL param', async () => {
      mockListDiaryEntries.mockResolvedValueOnce(emptyResponse);
      renderPage(['/diary?filterMode=automatic']);
      await waitFor(() => {
        expect(mockListDiaryEntries).toHaveBeenCalledTimes(1);
      });
      // The automatic mode button should be pressed
      expect(screen.getByTestId('mode-filter-automatic')).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByTestId('mode-filter-manual')).toHaveAttribute('aria-pressed', 'false');
    });

    it('handleClearAll resets filterMode to manual', async () => {
      const user = userEvent.setup();
      mockListDiaryEntries.mockResolvedValueOnce(emptyResponse);
      mockListDiaryEntries.mockResolvedValueOnce(emptyResponse);
      // Use q=test so filterCount >= 1 and the Clear All button is rendered
      renderPage(['/diary?filterMode=all&q=test']);

      await waitFor(() => {
        expect(mockListDiaryEntries).toHaveBeenCalledTimes(1);
      });

      // Confirm we start in 'all' mode
      expect(screen.getByTestId('mode-filter-all')).toHaveAttribute('aria-pressed', 'true');

      // Click the Clear All button
      const clearBtn = screen.getByTestId('clear-filters-button');
      await user.click(clearBtn);

      // After clearing, filterMode should reset to 'manual'
      await waitFor(() => {
        expect(screen.getByTestId('mode-filter-manual')).toHaveAttribute('aria-pressed', 'true');
      });
      expect(screen.getByTestId('mode-filter-all')).toHaveAttribute('aria-pressed', 'false');

      // The second API call should use the manual type set
      const lastCall = mockListDiaryEntries.mock.calls[mockListDiaryEntries.mock.calls.length - 1];
      expect(lastCall?.[0]?.type).toContain('daily_log');
    });
  });

  // ─── Status chip row removed (Story #1435) ────────────────────────────────────

  describe('status chip row removed (Story #1435)', () => {
    it('Scenario 8: no status chip group rendered', async () => {
      mockListDiaryEntries.mockResolvedValueOnce(emptyResponse);
      renderPage();
      // The OLD status chip row had three buttons: "All", "Drafts only", "Saved only".
      // It was removed in Story #1435. Assert by button text so this doesn't collide
      // with the new drafts chip group (aria-label "Filter by draft status", Story #1446).
      expect(screen.queryByRole('button', { name: /^Drafts only$/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Saved only$/i })).not.toBeInTheDocument();
    });
  });

  // ─── Drafts chip integration via DiaryFilterBar (Story #1446) ───────────────

  describe('drafts chip integration (Story #1446)', () => {
    it('Scenario 9: chip has aria-pressed=true when URL has no status param (drafts visible)', async () => {
      mockListDiaryEntries.mockResolvedValueOnce(emptyResponse);
      renderPage(['/diary']);
      await waitFor(() => {
        const chip = screen.getByTestId('status-filter-drafts');
        expect(chip).toHaveAttribute('aria-pressed', 'true');
      });
    });

    it('Scenario 10: chip has aria-pressed=false when URL has ?status=saved (drafts hidden)', async () => {
      mockListDiaryEntries.mockResolvedValueOnce(emptyResponse);
      renderPage(['/diary?status=saved']);
      await waitFor(() => {
        const chip = screen.getByTestId('status-filter-drafts');
        expect(chip).toHaveAttribute('aria-pressed', 'false');
      });
    });

    it('Scenario 11: clicking pressed chip sets status=saved and calls listDiaryEntries with status="saved"', async () => {
      const user = userEvent.setup();
      mockListDiaryEntries.mockResolvedValueOnce(emptyResponse);
      mockListDiaryEntries.mockResolvedValueOnce(emptyResponse);
      renderPage(['/diary']);

      await waitFor(() => {
        expect(mockListDiaryEntries).toHaveBeenCalledTimes(1);
      });

      const chip = screen.getByTestId('status-filter-drafts');
      await user.click(chip);

      await waitFor(() => {
        expect(mockListDiaryEntries).toHaveBeenCalledWith(
          expect.objectContaining({ status: 'saved' }),
        );
      });
    });

    it('Scenario 11b: clicking unpressed chip removes status param and calls listDiaryEntries without status', async () => {
      const user = userEvent.setup();
      mockListDiaryEntries.mockResolvedValueOnce(emptyResponse);
      mockListDiaryEntries.mockResolvedValueOnce(emptyResponse);
      renderPage(['/diary?status=saved']);

      await waitFor(() => {
        expect(mockListDiaryEntries).toHaveBeenCalledTimes(1);
      });

      const chip = screen.getByTestId('status-filter-drafts');
      await user.click(chip);

      await waitFor(() => {
        const lastCall =
          mockListDiaryEntries.mock.calls[mockListDiaryEntries.mock.calls.length - 1];
        expect(lastCall?.[0]?.status).toBeUndefined();
      });
    });
  });
});
