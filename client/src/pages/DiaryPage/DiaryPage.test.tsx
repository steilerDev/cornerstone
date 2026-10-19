/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
  render as rtlRender,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { routeUrl } from '@cornerstone/shared';
import type * as DiaryApiTypes from '../../lib/diaryApi.js';
import type {
  DiaryEntryListResponse,
  DiaryEntrySummary,
  DiaryFilterOptions,
} from '@cornerstone/shared';
import type React from 'react';
import { RecordingRouter, createRouterLog } from '../../test/recordingRouter.js';
import {
  CreateMenuProvider,
  useCreateContext,
} from '../../components/CreateMenu/CreateMenuContext.js';
import { ShortcutSnapshot } from '../../test/shortcutSnapshot.js';
import { ShortcutRegistryProvider } from '../../hooks/shortcutRegistry.js';
import { CaptureUploadsContext } from '../../capture/captureUploadsContext.js';
import { ToastProvider } from '../../components/Toast/ToastContext.js';
import { makeEngine } from '../../test/captureFixtures.js';
import { installMatchMedia } from '../../test/matchMediaControl.js';
import type { MatchMediaControl } from '../../test/matchMediaControl.js';

// The page renders the Unfinished row (toasts, capture engine) and the Filters surface.
const engine = makeEngine();
function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <CaptureUploadsContext value={engine.api}>{children}</CaptureUploadsContext>
    </ToastProvider>
  );
}
const render = (ui: React.ReactElement) => rtlRender(ui, { wrapper: Providers });

const WIDE = '(min-width: 768px)';
/** Opens the Filters surface unless it is already open (a filter change must not toggle it shut). */
const openFilters = () => {
  const isOpen =
    screen.queryByTestId('diary-filters-panel') !== null ||
    screen.queryByTestId('diary-filters-sheet')?.getAttribute('data-open') === 'true';
  if (!isOpen) fireEvent.click(screen.getByTestId('diary-filters-button'));
};
let media: MatchMediaControl;

const FILTER_OPTIONS: DiaryFilterOptions = {
  types: ['daily_log', 'delivery', 'issue'],
  areas: [
    {
      id: 'area-1',
      name: 'Room 1',
      color: null,
      ancestors: [{ id: 'a0', name: 'Area A', color: null }],
    },
  ],
  companies: [{ id: 'company-1', name: 'Company A' }],
};

/** Renders the current URL's search string into the DOM so tests can assert on
 * which query params are present/absent without reaching into router internals. */
function DateContext() {
  useCreateContext({ date: '2026-03-01', areaId: 'a1' });
  return null;
}

function NavControls() {
  const navigate = useNavigate();
  return (
    <>
      <button type="button" data-testid="nav-bare" onClick={() => navigate('/diary')}>
        bare
      </button>
      <button type="button" data-testid="nav-back" onClick={() => navigate(-1)}>
        back
      </button>
    </>
  );
}

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
// The feed and the "Unfinished" row both call listDiaryEntries. The Unfinished row asks for
// drafts, three at a time; route it to its own mock so feed expectations stay about the feed.

const mockListDiaryEntries = jest.fn<typeof DiaryApiTypes.listDiaryEntries>();
const mockListUnfinished = jest.fn<typeof DiaryApiTypes.listDiaryEntries>();
const mockFetchDiaryFilterOptions = jest.fn<typeof DiaryApiTypes.fetchDiaryFilterOptions>();

jest.unstable_mockModule('../../lib/diaryApi.js', () => ({
  listDiaryEntries: (params?: Parameters<typeof DiaryApiTypes.listDiaryEntries>[0]) =>
    params?.status === 'draft' && params.pageSize === 3
      ? mockListUnfinished(params)
      : mockListDiaryEntries(params),
  fetchDiaryFilterOptions: mockFetchDiaryFilterOptions,
  getDiaryEntry: jest.fn(),
  createDiaryEntry: jest.fn(),
  updateDiaryEntry: jest.fn(),
  deleteDiaryEntry: jest.fn(),
  promoteDiaryEntry: jest.fn(),
}));

// "Today" is fixed so the week headings are deterministic: Saturday 2026-03-14, week of 2026-03-09.
const TODAY = '2026-03-14';
jest.unstable_mockModule('../../lib/localDate.js', () => ({ todayLocalIsoDate: () => TODAY }));

// ─── Mock: formatters (DiaryEntryFeedRow, the week headings and the filter chips) ──

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
  const fmtDayMonth = (d: string | null | undefined, fallback = '—') => {
    if (!d) return fallback;
    const [year, month, day] = d.slice(0, 10).split('-').map(Number);
    if (!year || !month || !day) return fallback;
    return new Date(year, month - 1, day).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };
  const fmtDayRange = (start: string, end: string) => `${start} to ${end}`;
  const fmtTime = (ts: string | null | undefined, fallback = '—') => ts ?? fallback;
  const fmtDateTime = (ts: string | null | undefined, fallback = '—') => ts ?? fallback;
  const bound = {
    formatCurrency: fmtCurrency,
    formatDate: fmtDate,
    formatDayMonth: fmtDayMonth,
    formatDayRange: fmtDayRange,
    formatTime: fmtTime,
    formatDateTime: fmtDateTime,
    formatPercent: (n: number) => `${n.toFixed(2)}%`,
  };
  return {
    ...bound,
    computeActualDuration: jest.fn(),
    computeWorkDuration: jest.fn(),
    useFormatters: () => bound,
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

/** The infinite-scroll announcement region (the page's only status region). */
function announcementRegion(): HTMLElement {
  return screen.getByRole('status');
}

describe('DiaryPage', () => {
  let DiaryPage: React.ComponentType;

  beforeEach(async () => {
    localStorage.setItem('theme', 'light');
    if (!DiaryPage) {
      const mod = await import('./DiaryPage.js');
      DiaryPage = mod.default;
    }
    mockListDiaryEntries.mockReset();
    mockListUnfinished.mockReset();
    mockListUnfinished.mockResolvedValue(makeListResponse([]));
    mockFetchDiaryFilterOptions.mockReset();
    mockFetchDiaryFilterOptions.mockResolvedValue(FILTER_OPTIONS);
    media = installMatchMedia({ [WIDE]: true });
    originalIntersectionObserver = globalThis.IntersectionObserver;
    (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver =
      NoopIntersectionObserver;
  });

  afterEach(() => {
    media.restore();
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

  it('renders exactly one "Site diary" h1 and never the retired "Construction Diary"', async () => {
    mockListDiaryEntries.mockResolvedValueOnce(emptyResponse);
    renderPage();
    // Mutation: reverting to page.title ("Construction Diary") fails both assertions.
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'Site diary', level: 1 })).toBeInTheDocument();
    expect(screen.queryByText(/Construction Diary/)).not.toBeInTheDocument();
  });

  it('sets the tab title to "Site diary" with the section and house segments', async () => {
    mockListDiaryEntries.mockResolvedValueOnce(emptyResponse);
    renderPage();
    // Mutation: dropping useDocumentTitle leaves the previous title in place.
    await waitFor(() => expect(document.title).toMatch(/^Site diary/));
  });

  describe('history hygiene (replace, nothing written on mount)', () => {
    const renderRecorded = (url: string) => {
      const log = createRouterLog();
      render(
        <RecordingRouter entries={[url]} log={log}>
          <DiaryPage />
        </RecordingRouter>,
      );
      return log;
    };

    it('does not navigate on mount', async () => {
      mockListDiaryEntries.mockResolvedValueOnce(emptyResponse);
      const log = renderRecorded('/diary?q=oak');
      await waitFor(() => expect(mockListDiaryEntries).toHaveBeenCalled());
      expect(log.actions).toEqual([]);
    });

    it('filter, chip, show-all, clear-all and search changes all use REPLACE', async () => {
      mockListDiaryEntries.mockResolvedValue(emptyResponse);
      mockListUnfinished.mockResolvedValue({
        items: [makeSummary('dr-1', { status: 'draft' })],
        pagination: { page: 1, pageSize: 3, totalPages: 2, totalItems: 5 },
      });
      const log = renderRecorded('/diary?q=x');
      await waitFor(() => expect(mockListDiaryEntries).toHaveBeenCalled());

      // Mutation: any handler dropping { replace: true } logs PUSH and fails the final check.
      openFilters();
      fireEvent.change(screen.getByTestId('diary-date-from'), { target: { value: '2026-01-01' } });
      openFilters();
      fireEvent.change(screen.getByTestId('diary-date-to'), { target: { value: '2026-02-01' } });
      openFilters();
      fireEvent.click(screen.getByTestId('type-filter-daily_log'));
      fireEvent.click(await screen.findByTestId('diary-unfinished-show-all'));
      fireEvent.change(screen.getByTestId('diary-search-input'), { target: { value: 'abc' } });
      await waitFor(() => expect(log.actions.length).toBeGreaterThanOrEqual(5));
      fireEvent.click(screen.getByTestId('diary-active-filter-from-remove'));
      fireEvent.click(screen.getByTestId('clear-filters-button'));

      await waitFor(() => expect(log.entries[log.index]).toBe('/diary'));
      expect(log.actions.length).toBeGreaterThanOrEqual(7);
      expect(log.actions.every((a) => a.startsWith('REPLACE '))).toBe(true);
      expect(log.entries).toHaveLength(1);
    });
  });

  it('shows the total entry count next to the History link', async () => {
    mockListDiaryEntries.mockResolvedValueOnce(
      makeListResponse([makeSummary('1'), makeSummary('2')]),
    );
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('diary-entry-count')).toHaveTextContent(/2 entries/);
    });
    expect(screen.getByTestId('diary-entry-count')).toContainElement(
      screen.getByTestId('diary-history-link'),
    );
  });

  it('uses singular "entry" when totalItems is 1', async () => {
    mockListDiaryEntries.mockResolvedValueOnce(makeListResponse([makeSummary('1')]));
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('diary-entry-count')).toHaveTextContent(/1 entry/);
    });
    expect(screen.getByTestId('diary-entry-count')).not.toHaveTextContent(/entries/);
  });

  // ─── API call on mount ───────────────────────────────────────────────────────

  it('calls listDiaryEntries on mount', async () => {
    mockListDiaryEntries.mockResolvedValueOnce(emptyResponse);
    renderPage();
    await waitFor(() => {
      expect(mockListDiaryEntries).toHaveBeenCalledTimes(1);
    });
  });

  it('requests saved manual entries, 25 at a time, and no filters by default', async () => {
    mockListDiaryEntries.mockResolvedValueOnce(emptyResponse);
    renderPage();
    await waitFor(() => expect(mockListDiaryEntries).toHaveBeenCalledTimes(1));
    expect(mockListDiaryEntries).toHaveBeenCalledWith({
      page: 1,
      pageSize: 25,
      q: undefined,
      dateFrom: undefined,
      dateTo: undefined,
      automatic: false,
      type: undefined,
      status: 'saved',
      areaId: undefined,
      vendorId: undefined,
    });
  });

  // ─── Loading state ──────────────────────────────────────────────────────────

  it('shows three row-shaped placeholders while fetching', () => {
    // Never resolves during this check
    mockListDiaryEntries.mockReturnValue(new Promise(() => undefined));
    renderPage();
    const loading = screen.getByTestId('diary-loading');
    expect(loading).toHaveAttribute('aria-busy', 'true');
    expect(within(loading).getAllByRole('status', { name: 'Loading entries...' })).toHaveLength(3);
    expect(screen.queryByRole('feed')).not.toBeInTheDocument();
  });

  // ─── Entry display and grouping ─────────────────────────────────────────────

  it('renders a row per entry after a successful load', async () => {
    mockListDiaryEntries.mockResolvedValueOnce(makeListResponse([makeSummary('de-1')]));
    renderPage();
    const row = await screen.findByTestId('diary-entry-de-1');
    expect(row).toHaveTextContent('Entry de-1');
    expect(screen.getByTestId('diary-entry-de-1-link')).toHaveAttribute('href', '/diary/de-1');
  });

  it('renders the feed with a labelled landmark and no Photos card', async () => {
    mockListDiaryEntries.mockResolvedValueOnce(makeListResponse([makeSummary('de-1')]));
    renderPage();
    await screen.findByTestId('diary-entry-de-1');
    expect(screen.getByRole('feed', { name: 'Site diary entries' })).toBeInTheDocument();
    expect(screen.queryByTestId('diary-photos-card')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /photos/i })).not.toBeInTheDocument();
  });

  it('groups the entries of today\'s week under "This week" with the week range', async () => {
    mockListDiaryEntries.mockResolvedValueOnce(
      makeListResponse([
        makeSummary('de-1', { entryDate: '2026-03-14' }),
        makeSummary('de-2', { entryDate: '2026-03-09' }),
      ]),
    );
    renderPage();
    const group = await screen.findByTestId('diary-week-2026-03-09');
    expect(within(group).getByRole('heading', { level: 2, name: /^This week/ })).toHaveTextContent(
      '2026-03-09 to 2026-03-15',
    );
    expect(group).toContainElement(screen.getByTestId('diary-entry-de-1'));
    expect(group).toContainElement(screen.getByTestId('diary-entry-de-2'));
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(1);
  });

  it('adds a screen-reader row count to the week heading', async () => {
    mockListDiaryEntries.mockResolvedValueOnce(
      makeListResponse([
        makeSummary('de-1', { entryDate: '2026-03-14' }),
        makeSummary('de-2', { entryDate: '2026-03-13' }),
      ]),
    );
    renderPage();
    const group = await screen.findByTestId('diary-week-2026-03-09');
    expect(within(group).getByRole('heading', { level: 2 })).toHaveAccessibleName(/, 2 entries$/);
  });

  it('names last week, and older weeks by their Monday', async () => {
    mockListDiaryEntries.mockResolvedValueOnce(
      makeListResponse([
        makeSummary('de-1', { entryDate: '2026-03-14' }),
        makeSummary('de-2', { entryDate: '2026-03-05' }),
        makeSummary('de-3', { entryDate: '2026-02-20' }),
      ]),
    );
    renderPage();
    await screen.findByTestId('diary-week-2026-03-09');
    expect(
      within(screen.getByTestId('diary-week-2026-03-02')).getByRole('heading', { level: 2 }),
    ).toHaveTextContent(/^Last week/);
    expect(
      within(screen.getByTestId('diary-week-2026-02-16')).getByRole('heading', { level: 2 }),
    ).toHaveTextContent(/^Week of Feb 16/);
    const order = screen
      .getAllByRole('heading', { level: 2 })
      .map((h) => h.textContent?.slice(0, 9));
    expect(order).toEqual(['This week', 'Last week', 'Week of F']);
  });

  it('shows a draft row (status=draft view) with its Draft badge, linking to the capture screen', async () => {
    mockListDiaryEntries.mockResolvedValueOnce(
      makeListResponse([makeSummary('dr-1', { status: 'draft' })]),
    );
    renderPage(['/diary?status=draft']);
    expect(await screen.findByTestId('draft-badge-dr-1')).toHaveTextContent('Draft');
    expect(screen.getByTestId('diary-entry-dr-1-link')).toHaveAttribute('href', '/diary/dr-1/edit');
  });

  it('renders the toolbar: a search field with the search-everywhere row, and the Filters button', async () => {
    mockListDiaryEntries.mockResolvedValueOnce(emptyResponse);
    renderPage();
    const search = screen.getByTestId('diary-search-input');
    expect(search).toHaveAccessibleName('Search diary entries');
    expect(search).toHaveAttribute('data-page-search');
    expect(search).toHaveAttribute('id', 'diary-search');
    expect(screen.getByTestId('diary-filters-button')).toHaveTextContent('Filters');
    await waitFor(() => expect(mockListDiaryEntries).toHaveBeenCalled());
  });

  it('has exactly one primary action, "Log today"', async () => {
    mockListDiaryEntries.mockResolvedValueOnce(makeListResponse([makeSummary('de-1')]));
    renderPage();
    await screen.findByTestId('diary-entry-de-1');
    const primary = Array.from(document.querySelectorAll('.btnPrimary'));
    expect(primary).toHaveLength(1);
    expect(primary[0]).toBe(screen.getByTestId('diary-log-today'));
  });

  // ─── Empty states ───────────────────────────────────────────────────────────

  it('shows the empty state with a hint when no entries exist and nothing is filtered', async () => {
    mockListDiaryEntries.mockResolvedValueOnce(emptyResponse);
    renderPage();
    const empty = await screen.findByTestId('diary-empty');
    expect(within(empty).getByText('No diary entries yet.')).toBeInTheDocument();
    expect(
      within(empty).getByText(
        'Photos, notes and deliveries from site show up here, newest week first.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('diary-filtered-empty')).not.toBeInTheDocument();
    expect(screen.queryByRole('feed')).not.toBeInTheDocument();
  });

  it('the empty-state action is a date-free "Log today" link to /diary/new that pushes the origin on click', async () => {
    mockListDiaryEntries.mockResolvedValueOnce(emptyResponse);
    const log = createRouterLog();
    render(
      <RecordingRouter entries={['/diary']} log={log}>
        <CreateMenuProvider moneyPage={false} wide sheetOpen={false} onSheetOpenChange={() => {}}>
          <DateContext />
          <DiaryPage />
        </CreateMenuProvider>
      </RecordingRouter>,
    );
    const empty = await screen.findByTestId('diary-empty');
    const link = within(empty).getByRole('link', { name: 'Log today' });
    expect(link).toHaveAttribute('href', '/diary/new');

    fireEvent.click(link);

    expect(log.actions.filter((a) => a.startsWith('PUSH'))).toEqual(['PUSH /diary/new']);
    expect(log.states[0]).toMatchObject({ origin: { to: '/diary' } });
  });

  describe('filtered empty state', () => {
    it('says no entries match, with a Clear filters action, when a filter is set', async () => {
      mockListDiaryEntries.mockResolvedValue(emptyResponse);
      renderPage(['/diary?types=issue']);
      const empty = await screen.findByTestId('diary-filtered-empty');
      expect(within(empty).getByText('No entries match these filters')).toBeInTheDocument();
      expect(within(empty).getByRole('button', { name: 'Clear filters' })).toBeInTheDocument();
      expect(screen.queryByTestId('diary-empty')).not.toBeInTheDocument();
    });

    it('also appears for a search text alone', async () => {
      mockListDiaryEntries.mockResolvedValue(emptyResponse);
      renderPage(['/diary?q=oak']);
      expect(await screen.findByTestId('diary-filtered-empty')).toBeInTheDocument();
    });

    it('Clear filters clears the filters and the search and focuses the Filters button', async () => {
      const user = userEvent.setup();
      mockListDiaryEntries.mockResolvedValue(emptyResponse);
      renderPage(['/diary?types=issue&q=oak&areaId=area-1']);
      const empty = await screen.findByTestId('diary-filtered-empty');

      await user.click(within(empty).getByRole('button', { name: 'Clear filters' }));

      await waitFor(() => expect(screen.getByTestId('location-search')).toBeEmptyDOMElement());
      expect(screen.getByTestId('diary-search-input')).toHaveValue('');
      expect(screen.getByTestId('diary-filters-button')).toHaveFocus();
      expect(await screen.findByTestId('diary-empty')).toBeInTheDocument();
    });
  });

  // ─── Error state ─────────────────────────────────────────────────────────────
  // ─── First-batch failure (#2064): one translated alert + Retry, no raw server message ───

  describe('first batch failure', () => {
    const FAILED_TEXT = 'Failed to load diary entries. Please try again.';

    async function renderFailedFirstBatch(rejection: Error) {
      mockListDiaryEntries.mockRejectedValueOnce(rejection);
      renderPage();
      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
    }

    async function makeApiError() {
      const { ApiClientError } = await import('../../lib/apiClient.js');
      return new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'Server went down' });
    }

    function expectFailedState() {
      const alerts = screen.getAllByRole('alert');
      expect(alerts).toHaveLength(1);
      expect(alerts[0]).toHaveTextContent(FAILED_TEXT);
      expect(document.querySelector('.bannerError')).toBeNull();
      expect(screen.getByTestId('diary-retry')).toHaveTextContent('Retry');
      expect(screen.queryByTestId('diary-loading')).not.toBeInTheDocument();
      expect(screen.queryByTestId('diary-empty')).not.toBeInTheDocument();
      expect(screen.queryByTestId('diary-filtered-empty')).not.toBeInTheDocument();
      expect(screen.queryByTestId('diary-footer')).not.toBeInTheDocument();
    }

    it('shows one translated alert, a Retry button, and never the raw server message (ApiClientError)', async () => {
      await renderFailedFirstBatch(await makeApiError());
      expectFailedState();
      expect(screen.queryByText('Server went down')).not.toBeInTheDocument();
    });

    it('shows the same single alert and Retry button for a plain Error', async () => {
      await renderFailedFirstBatch(new Error('Network error'));
      expectFailedState();
    });

    it('Retry re-requests page 1', async () => {
      const user = userEvent.setup();
      await renderFailedFirstBatch(new Error('boom'));
      mockListDiaryEntries.mockImplementationOnce(() => new Promise(() => {}));

      await user.click(screen.getByTestId('diary-retry'));

      await waitFor(() => {
        expect(mockListDiaryEntries).toHaveBeenCalledTimes(2);
      });
      expect(mockListDiaryEntries.mock.calls[1]?.[0]?.page).toBe(1);
    });

    it('a successful retry renders the rows and clears the alert', async () => {
      const user = userEvent.setup();
      await renderFailedFirstBatch(new Error('boom'));
      mockListDiaryEntries.mockResolvedValueOnce({
        items: [makeSummary('r-1')],
        pagination: { page: 1, pageSize: 25, totalPages: 2, totalItems: 30 },
      });

      await user.click(screen.getByTestId('diary-retry'));

      expect(await screen.findByTestId('diary-entry-r-1')).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.queryByTestId('diary-retry')).not.toBeInTheDocument();
      expect(screen.getByTestId('diary-load-more-button')).toHaveTextContent('Load more');
    });

    // The Retry button unmounts when the rows arrive; focus goes to the page heading, not <body>.
    it('a successful retry with rows moves focus to the page heading', async () => {
      const user = userEvent.setup();
      await renderFailedFirstBatch(new Error('boom'));
      mockListDiaryEntries.mockResolvedValueOnce({
        items: [makeSummary('r-1')],
        pagination: { page: 1, pageSize: 25, totalPages: 2, totalItems: 30 },
      });

      const button = screen.getByTestId('diary-retry');
      act(() => {
        button.focus();
      });
      await user.keyboard('{Enter}');

      await screen.findByTestId('diary-entry-r-1');
      await waitFor(() =>
        expect(screen.getByRole('heading', { level: 1, name: 'Site diary' })).toHaveFocus(),
      );
    });

    it('a successful retry with no entries shows the empty state and focuses its message', async () => {
      const user = userEvent.setup();
      await renderFailedFirstBatch(new Error('boom'));
      mockListDiaryEntries.mockResolvedValueOnce(emptyResponse);

      await user.click(screen.getByTestId('diary-retry'));

      const empty = await screen.findByTestId('diary-empty');
      expect(within(empty).getByText('No diary entries yet.')).toHaveFocus();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('a failed retry shows the alert once more', async () => {
      const user = userEvent.setup();
      await renderFailedFirstBatch(new Error('boom'));
      mockListDiaryEntries.mockRejectedValueOnce(new Error('still down'));

      await user.click(screen.getByTestId('diary-retry'));

      await waitFor(() => {
        expect(mockListDiaryEntries).toHaveBeenCalledTimes(2);
      });
      await waitFor(() => {
        expect(screen.getAllByRole('alert')).toHaveLength(1);
      });
      expect(screen.getByRole('alert')).toHaveTextContent(FAILED_TEXT);
      expect(screen.getByTestId('diary-retry')).toBeInTheDocument();
    });

    it('a filter change after a first-batch failure shows the normal initial loading state', async () => {
      const user = userEvent.setup();
      await renderFailedFirstBatch(new Error('boom'));
      mockListDiaryEntries.mockImplementationOnce(() => new Promise(() => {}));

      await user.type(screen.getByTestId('diary-search-input'), 'x');

      await waitFor(() => {
        expect(mockListDiaryEntries).toHaveBeenCalledTimes(2);
      });
      expect(mockListDiaryEntries.mock.calls[1]?.[0]?.q).toBe('x');
      expect(screen.getByTestId('diary-loading')).toBeInTheDocument();
      expect(screen.queryByTestId('diary-retry')).not.toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('a filter change during a pending Retry does not steal focus from the search box when the new query is empty', async () => {
      const user = userEvent.setup();
      await renderFailedFirstBatch(new Error('boom'));
      mockListDiaryEntries.mockImplementationOnce(() => new Promise(() => {}));
      await user.click(screen.getByTestId('diary-retry'));
      await waitFor(() => {
        expect(mockListDiaryEntries).toHaveBeenCalledTimes(2);
      });

      mockListDiaryEntries.mockResolvedValueOnce(emptyResponse);
      const search = screen.getByTestId('diary-search-input');
      await user.type(search, 'x');

      const empty = await screen.findByTestId('diary-filtered-empty');
      expect(mockListDiaryEntries.mock.calls[2]?.[0]?.q).toBe('x');
      expect(empty).not.toContainElement(document.activeElement as HTMLElement);
      expect(search).toHaveFocus();
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
        expect(screen.getByTestId('diary-entry-p1-1')).toBeInTheDocument();
      });
      expect(screen.getByTestId('diary-entry-p1-2')).toBeInTheDocument();
      expect(screen.getByTestId('diary-load-more-button')).toBeInTheDocument();
    });

    it('exposes the announcement status region without an explicit aria-live (role=status is implicitly polite)', async () => {
      mockListDiaryEntries.mockResolvedValueOnce({
        items: [makeSummary('al-1')],
        pagination: { page: 1, pageSize: 25, totalPages: 3, totalItems: 60 },
      });
      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('diary-entry-al-1')).toBeInTheDocument();
      });
      const status = announcementRegion();
      expect(status).toHaveAttribute('aria-atomic', 'true');
      expect(status).not.toHaveAttribute('aria-live');
    });

    it('does not render the load-more button and shows the end-of-list row when there is only one page', async () => {
      mockListDiaryEntries.mockResolvedValueOnce(makeListResponse([makeSummary('de-1')], 1));
      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('diary-entry-de-1')).toBeInTheDocument();
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
        expect(screen.getByTestId('diary-entry-old-1')).toBeInTheDocument();
      });

      await user.type(screen.getByTestId('diary-search-input'), 'foo');

      await waitFor(
        () => {
          expect(screen.getByTestId('diary-entry-new-1')).toBeInTheDocument();
        },
        { timeout: 2000 },
      );
      expect(screen.queryByTestId('diary-entry-old-1')).not.toBeInTheDocument();

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
        expect(screen.getByTestId('diary-entry-old-1')).toBeInTheDocument();
      });

      await user.type(screen.getByTestId('diary-search-input'), 'foo');

      await waitFor(
        () => {
          expect(screen.getByTestId('diary-entry-new-1')).toBeInTheDocument();
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
        expect(screen.getByTestId('diary-entry-p1-1')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('diary-load-more-button'));

      await waitFor(() => {
        expect(screen.getByTestId('diary-entry-p2-1')).toBeInTheDocument();
      });
      expect(screen.getByTestId('diary-entry-p1-1')).toBeInTheDocument();

      expect(mockListDiaryEntries).toHaveBeenCalledTimes(2);
      expect(mockListDiaryEntries.mock.calls[1]?.[0]?.page).toBe(2);
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
        expect(screen.getByTestId('diary-entry-p1-1')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('diary-load-more-button'));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('Failed to load more entries.');
      });
      // The full-page banner must not render — entries are still present.
      expect(screen.queryByText(/failed to load diary entries/i)).not.toBeInTheDocument();
      expect(screen.getByTestId('diary-entry-p1-1')).toBeInTheDocument();
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
        expect(screen.getByTestId('diary-entry-foo-1')).toBeInTheDocument();
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
        expect(screen.getByTestId('diary-entry-p1-1')).toBeInTheDocument();
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
        expect(screen.getByTestId('diary-entry-p1-1')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('diary-load-more-button'));

      await waitFor(() => {
        // count === 1 selects the singular grammar key ("entry", not "entries").
        expect(announcementRegion()).toHaveTextContent('1 more entry loaded');
      });
      // Still more pages after this batch — must not use the end-of-list announcement.
      expect(announcementRegion()).not.toHaveTextContent(/reached the end/i);
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
        expect(screen.getByTestId('diary-entry-f1-1')).toBeInTheDocument();
      });

      // Append a second batch for the first filter — uses "appended" phrasing (covered above).
      await user.click(screen.getByTestId('diary-load-more-button'));
      await waitFor(() => {
        expect(screen.getByTestId('diary-entry-f1-3')).toBeInTheDocument();
      });
      expect(announcementRegion()).toHaveTextContent(/more entr(y|ies) loaded/i);

      // Change filters (dateFrom) — resets fetchSequence, so the new filter's first
      // successful load must read as fetchSequence === 1 again.
      openFilters();
      fireEvent.change(screen.getByTestId('diary-date-from'), { target: { value: '2026-01-01' } });

      await waitFor(() => {
        expect(screen.getByTestId('diary-entry-f2-1')).toBeInTheDocument();
      });
      expect(screen.getByTestId('diary-entry-f2-2')).toBeInTheDocument();
      expect(screen.queryByTestId('diary-entry-f1-1')).not.toBeInTheDocument();

      const status = announcementRegion();
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
          expect(screen.getByTestId('diary-entry-new-1')).toBeInTheDocument();
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

    it('toggling an entry type chip restricts the query to that manual type and removes the page param', async () => {
      const user = userEvent.setup();
      mockListDiaryEntries.mockResolvedValueOnce(makeListResponse([makeSummary('m-1')]));
      mockListDiaryEntries.mockResolvedValueOnce(makeListResponse([makeSummary('m-2')]));

      renderPage(['/diary']);
      await waitFor(() => {
        expect(screen.getByTestId('diary-entry-m-1')).toBeInTheDocument();
      });

      openFilters();
      await user.click(await screen.findByTestId('type-filter-daily_log'));

      await waitFor(() => {
        expect(screen.getByTestId('diary-entry-m-2')).toBeInTheDocument();
      });
      const lastCall = mockListDiaryEntries.mock.calls[mockListDiaryEntries.mock.calls.length - 1];
      expect(lastCall?.[0]?.type).toBe('daily_log');

      const search = screen.getByTestId('location-search').textContent ?? '';
      expect(search).toContain('types=daily_log');
      expect(search).not.toContain('page=');
    });

    it('changing the date-from filter removes the page param and re-fetches from page 1', async () => {
      mockListDiaryEntries.mockResolvedValueOnce(makeListResponse([makeSummary('d-1')]));
      mockListDiaryEntries.mockResolvedValueOnce(makeListResponse([makeSummary('d-2')]));

      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId('diary-entry-d-1')).toBeInTheDocument();
      });

      openFilters();
      fireEvent.change(screen.getByTestId('diary-date-from'), { target: { value: '2026-01-01' } });

      await waitFor(() => {
        expect(screen.getByTestId('diary-entry-d-2')).toBeInTheDocument();
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
        expect(screen.getByTestId('diary-entry-d-1')).toBeInTheDocument();
      });

      openFilters();
      fireEvent.change(screen.getByTestId('diary-date-to'), { target: { value: '2026-02-01' } });

      await waitFor(() => {
        expect(screen.getByTestId('diary-entry-d-2')).toBeInTheDocument();
      });
      const lastCall = mockListDiaryEntries.mock.calls[mockListDiaryEntries.mock.calls.length - 1];
      expect(lastCall?.[0]?.dateTo).toBe('2026-02-01');
      const search = screen.getByTestId('location-search').textContent ?? '';
      expect(search).not.toContain('page=');
    });
  });

  // ─── Log today link (#2222) ───────────────────────────────────────────────

  it('renders a "Log today" link to /diary/new, and no "New Entry" button', async () => {
    mockListDiaryEntries.mockResolvedValueOnce(emptyResponse);
    renderPage();
    const link = screen.getByTestId('diary-log-today');
    expect(link).toHaveTextContent('Log today');
    expect(link).toHaveAttribute('href', routeUrl('diaryEntryNew'));
    expect(link).toHaveAttribute('href', '/diary/new');
    expect(screen.queryByRole('link', { name: /new entry/i })).toBeNull();
    expect(screen.queryByText('New Entry')).toBeNull();
    await waitFor(() => expect(mockListDiaryEntries).toHaveBeenCalled());
  });

  it('pushes the capture screen with the diary page (and its filters) as origin on click', async () => {
    mockListDiaryEntries.mockResolvedValueOnce(emptyResponse);
    const log = createRouterLog();
    render(
      <RecordingRouter entries={['/diary?q=oak']} log={log}>
        <DiaryPage />
      </RecordingRouter>,
    );
    fireEvent.click(screen.getByTestId('diary-log-today'));

    expect(log.actions.filter((a) => a.startsWith('PUSH'))).toEqual(['PUSH /diary/new']);
    expect(log.states[0]).toMatchObject({ origin: { to: '/diary?q=oak' } });
    expect(log.states[0]).not.toHaveProperty('background');
    await waitFor(() => expect(mockListDiaryEntries).toHaveBeenCalled());
  });

  it('never carries a registered create-context date or area: href is exactly /diary/new', async () => {
    mockListDiaryEntries.mockResolvedValueOnce(emptyResponse);
    const log = createRouterLog();
    render(
      <RecordingRouter entries={['/diary?q=oak']} log={log}>
        <CreateMenuProvider moneyPage={false} wide sheetOpen={false} onSheetOpenChange={() => {}}>
          <DateContext />
          <DiaryPage />
        </CreateMenuProvider>
      </RecordingRouter>,
    );
    const link = screen.getByTestId('diary-log-today');
    expect(link.getAttribute('href')).toBe('/diary/new');

    fireEvent.click(link);

    expect(log.actions.filter((a) => a.startsWith('PUSH'))).toEqual(['PUSH /diary/new']);
    expect(log.states[0]).toMatchObject({ origin: { to: '/diary?q=oak' } });
    await waitFor(() => expect(mockListDiaryEntries).toHaveBeenCalled());
  });

  // ─── Export functionality removed ─────────────────────────────────────────

  it('does not render an export or PDF button', async () => {
    mockListDiaryEntries.mockResolvedValueOnce(makeListResponse([makeSummary('de-1')]));
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('diary-entry-de-1')).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /export/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /pdf/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /export/i })).not.toBeInTheDocument();
  });

  // ─── Drafts leave the feed (#2225) ───────────────────────────────────────────

  describe('drafts leave the feed (#2225)', () => {
    const draftsResponse = (total = 1) => ({
      items: [makeSummary('dr-1', { status: 'draft' })],
      pagination: { page: 1, pageSize: 3, totalPages: 1, totalItems: total },
    });

    it('has no status chip row and no Drafts chip', async () => {
      mockListDiaryEntries.mockResolvedValueOnce(emptyResponse);
      renderPage();
      openFilters();
      expect(screen.queryByTestId('status-filter-drafts')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Drafts( only)?$/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Saved only$/i })).not.toBeInTheDocument();
      await waitFor(() => expect(mockListDiaryEntries).toHaveBeenCalled());
    });

    it('requests status=saved without a status in the URL', async () => {
      mockListDiaryEntries.mockResolvedValueOnce(emptyResponse);
      renderPage(['/diary']);
      await waitFor(() => expect(mockListDiaryEntries).toHaveBeenCalledTimes(1));
      expect(mockListDiaryEntries.mock.calls[0]?.[0]?.status).toBe('saved');
    });

    it('treats an old ?status=saved link like no status', async () => {
      mockListDiaryEntries.mockResolvedValueOnce(emptyResponse);
      renderPage(['/diary?status=saved']);
      await waitFor(() => expect(mockListDiaryEntries).toHaveBeenCalledTimes(1));
      expect(mockListDiaryEntries.mock.calls[0]?.[0]?.status).toBe('saved');
      expect(screen.queryByTestId('diary-active-filters')).not.toBeInTheDocument();
    });

    it('?status=draft lists drafts only and hides the Unfinished row', async () => {
      mockListDiaryEntries.mockResolvedValueOnce(emptyResponse);
      mockListUnfinished.mockResolvedValue(draftsResponse());
      renderPage(['/diary?status=draft']);
      await waitFor(() => expect(mockListDiaryEntries).toHaveBeenCalledTimes(1));
      expect(mockListDiaryEntries.mock.calls[0]?.[0]?.status).toBe('draft');
      expect(mockListUnfinished).not.toHaveBeenCalled();
      expect(screen.queryByTestId('diary-unfinished')).not.toBeInTheDocument();
      expect(screen.getByTestId('diary-active-filter-drafts-remove')).toBeInTheDocument();
    });

    it('shows the Unfinished row above the toolbar when drafts exist', async () => {
      mockListDiaryEntries.mockResolvedValueOnce(emptyResponse);
      mockListUnfinished.mockResolvedValue(draftsResponse());
      renderPage();
      const unfinished = await screen.findByTestId('diary-unfinished');
      expect(mockListUnfinished).toHaveBeenCalledWith({
        automatic: false,
        status: 'draft',
        page: 1,
        pageSize: 3,
      });
      const search = screen.getByTestId('diary-search-input');
      expect(
        unfinished.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it('"Show all n" switches the feed to drafts only and the chip brings it back', async () => {
      const user = userEvent.setup();
      mockListDiaryEntries.mockResolvedValue(emptyResponse);
      mockListUnfinished.mockResolvedValue({
        ...draftsResponse(5),
        pagination: { page: 1, pageSize: 3, totalPages: 2, totalItems: 5 },
      });
      renderPage();
      await user.click(await screen.findByTestId('diary-unfinished-show-all'));

      await waitFor(() => expect(mockListDiaryEntries.mock.lastCall?.[0]?.status).toBe('draft'));
      expect(screen.getByTestId('location-search')).toHaveTextContent('status=draft');
      expect(screen.queryByTestId('diary-unfinished')).not.toBeInTheDocument();
      expect(screen.getByTestId('diary-filters-button')).toHaveAttribute(
        'aria-label',
        'Filters, 1 active',
      );

      await user.click(screen.getByTestId('diary-active-filter-drafts-remove'));

      await waitFor(() => expect(mockListDiaryEntries.mock.lastCall?.[0]?.status).toBe('saved'));
      expect(screen.getByTestId('location-search')).toBeEmptyDOMElement();
      expect(await screen.findByTestId('diary-unfinished')).toBeInTheDocument();
    });
  });

  // ─── Filters (#2225) ──────────────────────────────────────────────────────────

  describe('filters (#2225)', () => {
    it('loads the filter options once, when the page mounts', async () => {
      mockListDiaryEntries.mockResolvedValue(emptyResponse);
      renderPage();
      await waitFor(() => expect(mockFetchDiaryFilterOptions).toHaveBeenCalledTimes(1));
      openFilters();
      fireEvent.change(screen.getByTestId('diary-search-input'), { target: { value: 'abc' } });
      await waitFor(() => expect(mockListDiaryEntries.mock.lastCall?.[0]?.q).toBe('abc'));
      expect(mockFetchDiaryFilterOptions).toHaveBeenCalledTimes(1);
    });

    it('offers only the types in use, and the area and company of the options', async () => {
      mockListDiaryEntries.mockResolvedValue(emptyResponse);
      renderPage();
      await waitFor(() => expect(mockFetchDiaryFilterOptions).toHaveBeenCalled());
      openFilters();
      expect(await screen.findByTestId('type-filter-issue')).toBeInTheDocument();
      expect(screen.queryByTestId('type-filter-site_visit')).not.toBeInTheDocument();
      expect(screen.getByTestId('diary-filter-area')).toBeInTheDocument();
      expect(screen.getByTestId('diary-filter-company')).toBeInTheDocument();
    });

    it('still works when the options fail to load: Area and Company stay hidden', async () => {
      mockFetchDiaryFilterOptions.mockRejectedValue(new Error('boom'));
      mockListDiaryEntries.mockResolvedValue(emptyResponse);
      renderPage();
      await waitFor(() => expect(mockFetchDiaryFilterOptions).toHaveBeenCalled());
      openFilters();
      expect(screen.queryByTestId('diary-filter-area')).not.toBeInTheDocument();
      expect(screen.queryByTestId('diary-filter-company')).not.toBeInTheDocument();
      expect(screen.getByTestId('type-filter-site_visit')).toBeInTheDocument();
      expect(screen.getByTestId('diary-date-from')).toBeInTheDocument();
    });

    it('picking an area writes areaId to the URL and sends it to the API', async () => {
      const user = userEvent.setup();
      mockListDiaryEntries.mockResolvedValue(emptyResponse);
      renderPage();
      await waitFor(() => expect(mockFetchDiaryFilterOptions).toHaveBeenCalled());
      openFilters();
      await user.click(await screen.findByLabelText('Area'));
      await user.click(await screen.findByTestId('diary-filter-area-option-area-1'));

      await waitFor(() => expect(mockListDiaryEntries.mock.lastCall?.[0]?.areaId).toBe('area-1'));
      expect(screen.getByTestId('location-search')).toHaveTextContent('areaId=area-1');
      expect(screen.getByTestId('diary-active-filters')).toHaveTextContent('Room 1');
    });

    // Live filter writes are router replaces; the panel closes only on a path change.
    it('keeps the anchored panel open while a filter is applied live', async () => {
      const user = userEvent.setup();
      mockListDiaryEntries.mockResolvedValue(emptyResponse);
      renderPage();
      await waitFor(() => expect(mockFetchDiaryFilterOptions).toHaveBeenCalled());
      openFilters();
      await user.click(await screen.findByLabelText('Area'));
      await user.click(await screen.findByTestId('diary-filter-area-option-area-1'));
      await waitFor(() =>
        expect(screen.getByTestId('location-search')).toHaveTextContent('areaId'),
      );
      expect(screen.getByTestId('diary-filters-panel')).toBeInTheDocument();
    });

    it('picking a company writes companyId to the URL and sends it as vendorId', async () => {
      const user = userEvent.setup();
      mockListDiaryEntries.mockResolvedValue(emptyResponse);
      renderPage();
      await waitFor(() => expect(mockFetchDiaryFilterOptions).toHaveBeenCalled());
      openFilters();
      await user.click(await screen.findByLabelText('Company'));
      await user.click(await screen.findByTestId('diary-filter-company-option-company-1'));

      await waitFor(() =>
        expect(mockListDiaryEntries.mock.lastCall?.[0]?.vendorId).toBe('company-1'),
      );
      expect(screen.getByTestId('location-search')).toHaveTextContent('companyId=company-1');
      expect(mockListDiaryEntries.mock.lastCall?.[0]).not.toHaveProperty('companyId');
    });

    it('reads areaId, companyId, dates and types from the URL into the first request', async () => {
      mockListDiaryEntries.mockResolvedValue(emptyResponse);
      renderPage([
        '/diary?areaId=area-1&companyId=company-1&dateFrom=2026-01-01&dateTo=2026-02-01&types=issue,delivery&q=oak',
      ]);
      await waitFor(() => expect(mockListDiaryEntries).toHaveBeenCalledTimes(1));
      expect(mockListDiaryEntries.mock.calls[0]?.[0]).toMatchObject({
        areaId: 'area-1',
        vendorId: 'company-1',
        dateFrom: '2026-01-01',
        dateTo: '2026-02-01',
        type: 'issue,delivery',
        q: 'oak',
        status: 'saved',
        automatic: false,
      });
    });

    it('sends no request for an invalid date range and shows the error', async () => {
      mockListDiaryEntries.mockResolvedValue(emptyResponse);
      renderPage(['/diary?dateTo=2026-01-10']);
      await waitFor(() => expect(mockListDiaryEntries).toHaveBeenCalledTimes(1));
      openFilters();
      fireEvent.change(screen.getByTestId('diary-date-from'), { target: { value: '2026-02-01' } });
      expect(
        await screen.findByText('The start date must be before the end date.'),
      ).toBeInTheDocument();
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });
      expect(mockListDiaryEntries).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('location-search')).toHaveTextContent('?dateTo=2026-01-10');
    });

    it('Clear all clears the filters and the search, and focuses the Filters button', async () => {
      const user = userEvent.setup();
      mockListDiaryEntries.mockResolvedValue(emptyResponse);
      renderPage(['/diary?types=issue&q=oak&areaId=area-1']);
      await waitFor(() => expect(mockListDiaryEntries).toHaveBeenCalled());

      await user.click(screen.getByTestId('clear-filters-button'));

      await waitFor(() => expect(screen.getByTestId('location-search')).toBeEmptyDOMElement());
      expect(screen.getByTestId('diary-search-input')).toHaveValue('');
      expect(screen.getByTestId('diary-filters-button')).toHaveFocus();
      expect(screen.queryByTestId('diary-active-filters')).not.toBeInTheDocument();
    });

    it('shows active filter chips with a count on the Filters button', async () => {
      mockListDiaryEntries.mockResolvedValue(emptyResponse);
      renderPage(['/diary?types=issue&areaId=area-1']);
      await waitFor(() => expect(mockListDiaryEntries).toHaveBeenCalled());
      expect(screen.getByTestId('diary-filters-button')).toHaveAttribute(
        'aria-label',
        'Filters, 2 active',
      );
      const chips = within(screen.getByRole('list', { name: 'Active filters' }));
      expect(chips.getAllByRole('listitem')).toHaveLength(2);
    });

    it('opens the filters in a bottom sheet on a phone', async () => {
      media.set(WIDE, false);
      mockListDiaryEntries.mockResolvedValue(emptyResponse);
      renderPage();
      openFilters();
      expect(screen.getByTestId('diary-filters-sheet')).toHaveAttribute('data-open', 'true');
      expect(screen.queryByTestId('diary-filters-panel')).not.toBeInTheDocument();
      await waitFor(() => expect(mockListDiaryEntries).toHaveBeenCalled());
    });
  });

  // ─── History link ────────────────────────────────────────────────────────────

  describe('History link', () => {
    it('is a real link to /history named for the automatic record, inside the count line', async () => {
      mockListDiaryEntries.mockResolvedValueOnce(emptyResponse);
      renderPage();
      const link = screen.getByRole('link', {
        name: 'History, the automatic record of changes',
      });
      expect(link).toBe(screen.getByTestId('diary-history-link'));
      expect(link).toHaveAttribute('href', '/history');
      expect(link).toHaveTextContent('History');
      await waitFor(() => expect(mockListDiaryEntries).toHaveBeenCalled());
    });
  });

  describe('n shortcut (#2211)', () => {
    const renderRecorded = (url = '/diary?q=oak') => {
      const log = createRouterLog();
      render(
        <ShortcutRegistryProvider>
          <RecordingRouter entries={[url]} log={log}>
            <DiaryPage />
            <ShortcutSnapshot />
          </RecordingRouter>
        </ShortcutRegistryProvider>,
      );
      return log;
    };

    it('opens the New diary entry target with the page as origin', async () => {
      mockListDiaryEntries.mockResolvedValueOnce(emptyResponse);
      const log = renderRecorded();
      await waitFor(() => expect(mockListDiaryEntries).toHaveBeenCalled());
      fireEvent.keyDown(document, { key: 'n' });
      // The page stays mounted in this router and may rewrite its own params afterwards.
      expect(log.actions[0]).toMatch(/^PUSH \/diary\/new/);
      expect(log.actions.filter((a) => a.startsWith('PUSH'))).toHaveLength(1);
      expect(log.states[0]).toMatchObject({ origin: { to: '/diary?q=oak' } });
    });

    it('ignores n typed into the diary search field', async () => {
      mockListDiaryEntries.mockResolvedValueOnce(emptyResponse);
      const log = renderRecorded();
      await waitFor(() => expect(mockListDiaryEntries).toHaveBeenCalled());
      fireEvent.keyDown(screen.getByTestId('diary-search-input'), { key: 'n' });
      expect(log.actions).toEqual([]);
    });

    it('registers n as "New diary entry" in the shortcut registry', async () => {
      mockListDiaryEntries.mockResolvedValueOnce(emptyResponse);
      renderRecorded();
      await waitFor(() => expect(mockListDiaryEntries).toHaveBeenCalled());
      fireEvent.click(screen.getByTestId('shortcut-snapshot'));
      expect(screen.getByTestId('shortcut-snapshot-out').textContent).toContain(
        'n:New diary entry',
      );
    });
  });

  // ─── System events moved to History (#2224) ───────────────────────────────────

  describe('system events live on History, not in the diary (#2224)', () => {
    it('always requests automatic=false', async () => {
      mockListDiaryEntries.mockResolvedValueOnce(emptyResponse);
      renderPage(['/diary']);
      await waitFor(() => expect(mockListDiaryEntries).toHaveBeenCalledTimes(1));
      expect(mockListDiaryEntries.mock.calls[0]?.[0]).toMatchObject({ automatic: false });
    });

    it('keeps automatic=false with filters, a status and a type chip', async () => {
      const user = userEvent.setup();
      mockListDiaryEntries.mockResolvedValue(emptyResponse);
      renderPage(['/diary?q=oak&status=saved']);
      await waitFor(() => expect(mockListDiaryEntries).toHaveBeenCalled());
      openFilters();
      await user.click(await screen.findByTestId('type-filter-issue'));
      await waitFor(() =>
        expect(mockListDiaryEntries.mock.lastCall?.[0]).toMatchObject({
          automatic: false,
          q: 'oak',
          status: 'saved',
          type: 'issue',
        }),
      );
      for (const [query] of mockListDiaryEntries.mock.calls) {
        expect(query).toMatchObject({ automatic: false });
      }
    });

    it('does not send a type restriction or showHidden by default', async () => {
      mockListDiaryEntries.mockResolvedValueOnce(emptyResponse);
      renderPage(['/diary']);
      await waitFor(() => expect(mockListDiaryEntries).toHaveBeenCalledTimes(1));
      const query = mockListDiaryEntries.mock.calls[0]?.[0];
      expect(query?.type).toBeUndefined();
      expect(query).not.toHaveProperty('showHidden');
    });

    it('renders no mode chips and no hidden-notes line even when the server reports hidden notes', async () => {
      mockListDiaryEntries.mockResolvedValueOnce({
        ...makeListResponse([makeSummary('m-1')]),
        hiddenCount: 4,
      });
      renderPage(['/diary']);
      await screen.findByTestId('diary-entry-m-1');
      expect(screen.queryByTestId('mode-filter-all')).toBeNull();
      expect(screen.queryByTestId('mode-filter-manual')).toBeNull();
      expect(screen.queryByTestId('mode-filter-automatic')).toBeNull();
      expect(screen.queryByTestId('diary-hidden-note')).toBeNull();
      expect(screen.queryByTestId('diary-show-hidden')).toBeNull();
      expect(screen.queryByTestId('diary-hidden-status')).toBeNull();
    });

    it('shows the History link in the page header', async () => {
      mockListDiaryEntries.mockResolvedValueOnce(emptyResponse);
      renderPage(['/diary']);
      expect(screen.getByTestId('diary-history-link')).toHaveAttribute('href', '/history');
      await waitFor(() => expect(mockListDiaryEntries).toHaveBeenCalled());
    });

    it('ignores automatic types in the URL: only manual types reach the filter and the query', async () => {
      mockListDiaryEntries.mockResolvedValueOnce(emptyResponse);
      renderPage(['/diary?types=work_item_status,daily_log,bogus']);
      await waitFor(() => expect(mockListDiaryEntries).toHaveBeenCalledTimes(1));
      expect(mockListDiaryEntries.mock.calls[0]?.[0]?.type).toBe('daily_log');
      openFilters();
      expect(await screen.findByTestId('type-filter-daily_log')).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });

    it('clearing the dates and untoggling the last type removes their URL params', async () => {
      const user = userEvent.setup();
      mockListDiaryEntries.mockResolvedValue(emptyResponse);
      renderPage(['/diary?dateFrom=2026-01-01&dateTo=2026-02-01&types=issue']);
      await waitFor(() => expect(mockListDiaryEntries).toHaveBeenCalled());

      openFilters();
      fireEvent.change(screen.getByTestId('diary-date-from'), { target: { value: '' } });
      openFilters();
      fireEvent.change(screen.getByTestId('diary-date-to'), { target: { value: '' } });
      openFilters();
      await user.click(await screen.findByTestId('type-filter-issue'));

      await waitFor(() => expect(screen.getByTestId('location-search')).toBeEmptyDOMElement());
    });

    it('sends no type when the URL only carries automatic types', async () => {
      mockListDiaryEntries.mockResolvedValueOnce(emptyResponse);
      renderPage(['/diary?types=invoice_status']);
      await waitFor(() => expect(mockListDiaryEntries).toHaveBeenCalledTimes(1));
      expect(mockListDiaryEntries.mock.calls[0]?.[0]?.type).toBeUndefined();
    });
  });

  // ─── Legacy ?filterMode links (#2224) ─────────────────────────────────────────

  describe('?filterMode redirect to History (#2224)', () => {
    const renderRecordedWithHistory = (url: string) => {
      const log = createRouterLog();
      render(
        <RecordingRouter entries={[url]} log={log}>
          <Routes>
            <Route path="/diary" element={<DiaryPage />} />
            <Route path="/history" element={<div data-testid="history-stub" />} />
          </Routes>
          <LocationDisplay />
        </RecordingRouter>,
      );
      return log;
    };

    it('filterMode=automatic goes to /history with one REPLACE and no diary request', async () => {
      const log = renderRecordedWithHistory('/diary?filterMode=automatic');
      await screen.findByTestId('history-stub');
      expect(log.actions).toEqual(['REPLACE /history']);
      expect(log.entries).toEqual(['/history']);
      expect(mockListDiaryEntries).not.toHaveBeenCalled();
    });

    it('filterMode=all goes to /history?include=diary and does not load the diary', async () => {
      const log = renderRecordedWithHistory('/diary?filterMode=all');
      await screen.findByTestId('history-stub');
      expect(log.entries).toEqual(['/history?include=diary']);
      expect(log.actions.every((a) => a.startsWith('REPLACE '))).toBe(true);
      expect(mockListDiaryEntries).not.toHaveBeenCalled();
    });

    it('carries q and the first History type and drops other keys', async () => {
      const log = renderRecordedWithHistory(
        '/diary?filterMode=automatic&types=invoice_status,daily_log&q=zz&status=saved',
      );
      await screen.findByTestId('history-stub');
      expect(log.entries).toEqual(['/history?q=zz&type=invoice_status']);
      expect(mockListDiaryEntries).not.toHaveBeenCalled();
    });

    it('filterMode=manual stays on the diary and loads it', async () => {
      mockListDiaryEntries.mockResolvedValueOnce(emptyResponse);
      const log = renderRecordedWithHistory('/diary?filterMode=manual');
      await waitFor(() => expect(mockListDiaryEntries).toHaveBeenCalledTimes(1));
      expect(screen.queryByTestId('history-stub')).toBeNull();
      expect(log.actions).toEqual([]);
    });

    it('a diary URL without filterMode is not redirected', async () => {
      mockListDiaryEntries.mockResolvedValueOnce(emptyResponse);
      const log = renderRecordedWithHistory('/diary?q=oak');
      await waitFor(() => expect(mockListDiaryEntries).toHaveBeenCalledTimes(1));
      expect(log.actions).toEqual([]);
    });
  });

  describe('search text follows the URL q (#2317)', () => {
    const renderNav = (url: string) =>
      render(
        <MemoryRouter initialEntries={[url]}>
          <LocationDisplay />
          <NavControls />
          <DiaryPage />
        </MemoryRouter>,
      );
    const box = () => screen.getByTestId('diary-search-input') as HTMLInputElement;

    it('clears the box when navigating to the bare route and restores it on Back', async () => {
      mockListDiaryEntries.mockResolvedValue(emptyResponse);
      renderNav('/diary?q=foo');
      expect(box().value).toBe('foo');
      await waitFor(() => expect(mockListDiaryEntries).toHaveBeenCalled());

      fireEvent.click(screen.getByTestId('nav-bare'));
      await waitFor(() => expect(box().value).toBe(''));
      await waitFor(() => expect(screen.getByTestId('location-search')).toBeEmptyDOMElement());
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 400));
      });
      expect(screen.getByTestId('location-search')).toBeEmptyDOMElement();
      expect(box().value).toBe('');

      fireEvent.click(screen.getByTestId('nav-back'));
      await waitFor(() => expect(box().value).toBe('foo'));
      await waitFor(() =>
        expect(screen.getByTestId('location-search')).toHaveTextContent('?q=foo'),
      );
    });

    it('does not overwrite text typed while the debounced write lands', async () => {
      mockListDiaryEntries.mockResolvedValue(emptyResponse);
      renderNav('/diary');
      await waitFor(() => expect(mockListDiaryEntries).toHaveBeenCalled());

      fireEvent.change(box(), { target: { value: 'a' } });
      await waitFor(() => expect(screen.getByTestId('location-search')).toHaveTextContent('?q=a'));
      expect(box().value).toBe('a');

      fireEvent.change(box(), { target: { value: 'ab' } });
      expect(box().value).toBe('ab');
      await waitFor(() => expect(screen.getByTestId('location-search')).toHaveTextContent('?q=ab'));
      expect(box().value).toBe('ab');
    });
  });

  describe('search field keys', () => {
    it('Escape clears a non-empty search box', async () => {
      mockListDiaryEntries.mockResolvedValue(emptyResponse);
      renderPage(['/diary?q=oak']);
      const box = screen.getByTestId('diary-search-input');
      expect(box).toHaveValue('oak');
      fireEvent.keyDown(box, { key: 'Escape' });
      expect(box).toHaveValue('');
      await waitFor(() => expect(screen.getByTestId('location-search')).toBeEmptyDOMElement());
    });

    it('Escape in an empty box leaves everything alone', async () => {
      mockListDiaryEntries.mockResolvedValue(emptyResponse);
      renderPage(['/diary']);
      const box = screen.getByTestId('diary-search-input');
      fireEvent.keyDown(box, { key: 'Escape' });
      expect(box).toHaveValue('');
      await waitFor(() => expect(mockListDiaryEntries).toHaveBeenCalled());
    });

    it('keeps typed keys inside the field (page shortcuts and the shell "/" never see them)', async () => {
      mockListDiaryEntries.mockResolvedValue(emptyResponse);
      renderPage(['/diary']);
      const outside = jest.fn();
      document.addEventListener('keydown', outside);
      fireEvent.keyDown(screen.getByTestId('diary-search-input'), { key: 'a' });
      document.removeEventListener('keydown', outside);
      expect(outside).not.toHaveBeenCalled();
      await waitFor(() => expect(mockListDiaryEntries).toHaveBeenCalled());
    });

    it('is the one field marked as the page search', async () => {
      mockListDiaryEntries.mockResolvedValue(emptyResponse);
      renderPage(['/diary']);
      expect(document.querySelectorAll('[data-page-search]')).toHaveLength(1);
      await waitFor(() => expect(mockListDiaryEntries).toHaveBeenCalled());
    });
  });

  describe('robustness', () => {
    it('ignores filter options that arrive after the page was left', async () => {
      let resolveOptions: (value: DiaryFilterOptions) => void = () => {};
      mockFetchDiaryFilterOptions.mockReturnValue(
        new Promise<DiaryFilterOptions>((resolve) => {
          resolveOptions = resolve;
        }),
      );
      mockListDiaryEntries.mockResolvedValue(emptyResponse);
      const { unmount } = renderPage();
      unmount();
      await act(async () => {
        resolveOptions(FILTER_OPTIONS);
        await Promise.resolve();
      });
      expect(mockFetchDiaryFilterOptions).toHaveBeenCalledTimes(1);
    });

    it('ignores a filter options failure that arrives after the page was left', async () => {
      let rejectOptions: (reason: Error) => void = () => {};
      mockFetchDiaryFilterOptions.mockReturnValue(
        new Promise<DiaryFilterOptions>((_resolve, reject) => {
          rejectOptions = reject;
        }),
      );
      mockListDiaryEntries.mockResolvedValue(emptyResponse);
      const { unmount } = renderPage();
      unmount();
      await act(async () => {
        rejectOptions(new Error('late'));
        await Promise.resolve();
      });
      expect(mockFetchDiaryFilterOptions).toHaveBeenCalledTimes(1);
    });

    it('Retry in the footer after a failed append re-requests that page and keeps the rows', async () => {
      const user = userEvent.setup();
      mockListDiaryEntries.mockResolvedValueOnce({
        items: [makeSummary('p1-1')],
        pagination: { page: 1, pageSize: 25, totalPages: 2, totalItems: 30 },
      });
      mockListDiaryEntries.mockRejectedValueOnce(new Error('blip'));
      mockListDiaryEntries.mockResolvedValueOnce({
        items: [makeSummary('p2-1')],
        pagination: { page: 2, pageSize: 25, totalPages: 2, totalItems: 30 },
      });
      renderPage();
      await screen.findByTestId('diary-entry-p1-1');
      await user.click(screen.getByTestId('diary-load-more-button'));
      await screen.findByRole('alert');

      await user.click(screen.getByTestId('diary-load-more-button'));

      expect(await screen.findByTestId('diary-entry-p2-1')).toBeInTheDocument();
      expect(screen.getByTestId('diary-entry-p1-1')).toBeInTheDocument();
      expect(mockListDiaryEntries.mock.calls[2]?.[0]?.page).toBe(2);
    });

    it('Clear all from the phone sheet footer clears the filters and the search', async () => {
      media.set(WIDE, false);
      const user = userEvent.setup();
      mockListDiaryEntries.mockResolvedValue(emptyResponse);
      renderPage(['/diary?types=issue&q=oak']);
      await waitFor(() => expect(mockListDiaryEntries).toHaveBeenCalled());
      openFilters();

      await user.click(screen.getByTestId('diary-filters-sheet-clear'));

      await waitFor(() => expect(screen.getByTestId('location-search')).toBeEmptyDOMElement());
      expect(screen.getByTestId('diary-search-input')).toHaveValue('');
      // The sheet stays open and focus stays inside it (it is not moved to the Filters button).
      const sheet = screen.getByTestId('diary-filters-sheet');
      expect(sheet).toHaveAttribute('data-open', 'true');
      expect(sheet).toContainElement(document.activeElement as HTMLElement);
      expect(screen.getByTestId('diary-filters-button')).not.toHaveFocus();
    });

    it('the chips-row Clear all focuses the Filters button', async () => {
      const user = userEvent.setup();
      mockListDiaryEntries.mockResolvedValue(emptyResponse);
      renderPage(['/diary?types=issue']);
      await waitFor(() => expect(mockListDiaryEntries).toHaveBeenCalled());
      await user.click(screen.getByTestId('clear-filters-button'));
      expect(screen.getByTestId('diary-filters-button')).toHaveFocus();
    });

    it('a footer Retry after a failed append leaves focus on the footer button, not the heading', async () => {
      const user = userEvent.setup();
      mockListDiaryEntries.mockResolvedValueOnce({
        items: [makeSummary('p1-1')],
        pagination: { page: 1, pageSize: 25, totalPages: 3, totalItems: 60 },
      });
      mockListDiaryEntries.mockRejectedValueOnce(new Error('blip'));
      mockListDiaryEntries.mockResolvedValueOnce({
        items: [makeSummary('p2-1')],
        pagination: { page: 2, pageSize: 25, totalPages: 3, totalItems: 60 },
      });
      renderPage();
      await screen.findByTestId('diary-entry-p1-1');
      await user.click(screen.getByTestId('diary-load-more-button'));
      await screen.findByRole('alert');

      await user.click(screen.getByTestId('diary-load-more-button'));

      await screen.findByTestId('diary-entry-p2-1');
      expect(screen.getByRole('heading', { level: 1 })).not.toHaveFocus();
      expect(screen.getByTestId('diary-load-more-button')).toHaveFocus();
    });

    it('writes both dates once a rejected range becomes valid again (To=10, From=15 rejected, To=20)', async () => {
      mockListDiaryEntries.mockResolvedValue(emptyResponse);
      renderPage(['/diary?dateTo=2026-01-10']);
      await waitFor(() => expect(mockListDiaryEntries).toHaveBeenCalledTimes(1));
      openFilters();
      fireEvent.change(screen.getByTestId('diary-date-from'), { target: { value: '2026-01-15' } });
      await screen.findByText('The start date must be before the end date.');
      expect(screen.getByTestId('location-search')).toHaveTextContent('?dateTo=2026-01-10');
      expect(screen.getByTestId('location-search')).not.toHaveTextContent('dateFrom');

      openFilters();
      fireEvent.change(screen.getByTestId('diary-date-to'), { target: { value: '2026-01-20' } });

      await waitFor(() => {
        const params = new URLSearchParams(screen.getByTestId('location-search').textContent ?? '');
        expect(params.get('dateFrom')).toBe('2026-01-15');
        expect(params.get('dateTo')).toBe('2026-01-20');
      });
      await waitFor(() =>
        expect(mockListDiaryEntries.mock.lastCall?.[0]).toMatchObject({
          dateFrom: '2026-01-15',
          dateTo: '2026-01-20',
        }),
      );
      expect(screen.queryByText('The start date must be before the end date.')).toBeNull();
    });
  });
});
