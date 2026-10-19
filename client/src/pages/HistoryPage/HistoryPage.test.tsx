/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { DiaryEntrySummary, HistoryListResponse, HistoryObjectRef } from '@cornerstone/shared';
import type React from 'react';
import type * as HistoryApiTypes from '../../lib/historyApi.js';
import { createRouterLog, RecordingRouter } from '../../test/recordingRouter.js';
import { installMatchMedia } from '../../test/matchMediaControl.js';
import type { MatchMediaControl } from '../../test/matchMediaControl.js';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const TODAY = '2026-03-14';

const mockListHistory = jest.fn<typeof HistoryApiTypes.listHistory>();

jest.unstable_mockModule('../../lib/historyApi.js', () => ({ listHistory: mockListHistory }));
jest.unstable_mockModule('../../lib/localDate.js', () => ({ todayLocalIsoDate: () => TODAY }));

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
  const formatters = {
    formatCurrency: (n: number) => `EUR ${n.toFixed(2)}`,
    formatDate: fmtDate,
    formatTime: (ts: string | null | undefined, fallback = '—') => ts ?? fallback,
    formatDateTime: (ts: string | null | undefined, fallback = '—') => ts ?? fallback,
    formatPercent: (n: number) => `${n.toFixed(2)}%`,
  };
  return {
    ...formatters,
    computeActualDuration: jest.fn(),
    computeWorkDuration: jest.fn(),
    useFormatters: () => formatters,
  };
});

class NoopIntersectionObserver {
  observe = jest.fn();
  disconnect = jest.fn();
  unobserve = jest.fn();
  constructor(_cb: IntersectionObserverCallback) {}
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** An ISO timestamp for local March `day` of 2026 at `hour`. */
const at = (day: number, hour = 12): string => new Date(2026, 2, day, hour).toISOString();

function task(id: string, createdAt: string, over: Partial<DiaryEntrySummary> = {}) {
  return {
    id,
    entryType: 'work_item_status',
    entryDate: '2020-01-01',
    title: null,
    body: '',
    metadata: {
      v: 1,
      event: 'status_changed',
      from: 'not_started',
      to: 'in_progress',
      subjectLabel: 'Kitchen tiling',
    },
    isAutomatic: true,
    isSigned: false,
    status: 'saved',
    sourceEntityType: 'work_item',
    sourceEntityId: 'wi-1',
    sourceEntityArea: null,
    sourceEntityTitle: 'Kitchen tiling',
    sourceEntityExists: true,
    photoCount: 0,
    createdBy: null,
    createdAt,
    updatedAt: createdAt,
    ...over,
  } as DiaryEntrySummary;
}

function note(id: string, entryDate: string, createdAt: string) {
  return {
    id,
    entryType: 'daily_log',
    entryDate,
    title: `Note ${id}`,
    body: `Body ${id}`,
    metadata: null,
    isAutomatic: false,
    isSigned: false,
    status: 'saved',
    sourceEntityType: null,
    sourceEntityId: null,
    sourceEntityArea: null,
    sourceEntityTitle: null,
    photoCount: 0,
    createdBy: { id: 'u-1', displayName: 'Alice' },
    createdAt,
    updatedAt: createdAt,
  } as DiaryEntrySummary;
}

function response(
  items: DiaryEntrySummary[],
  over: {
    totalPages?: number;
    totalItems?: number;
    page?: number;
    hiddenCount?: number;
    object?: HistoryObjectRef | null;
  } = {},
): HistoryListResponse {
  return {
    items,
    pagination: {
      page: over.page ?? 1,
      pageSize: 25,
      totalPages: over.totalPages ?? 1,
      totalItems: over.totalItems ?? items.length,
    },
    hiddenCount: over.hiddenCount ?? 0,
    object: over.object ?? null,
  };
}

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location-search">{location.search}</div>;
}

// ── Harness ───────────────────────────────────────────────────────────────────

describe('HistoryPage', () => {
  let HistoryPage: React.ComponentType;
  let media: MatchMediaControl;
  let originalObserver: typeof IntersectionObserver | undefined;

  beforeEach(async () => {
    if (!HistoryPage) ({ default: HistoryPage } = await import('./HistoryPage.js'));
    mockListHistory.mockReset();
    media = installMatchMedia({ '(min-width: 768px)': true });
    originalObserver = globalThis.IntersectionObserver;
    (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver =
      NoopIntersectionObserver;
  });

  afterEach(() => {
    media.restore();
    (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver =
      originalObserver;
  });

  const renderPage = (url = '/history') =>
    render(
      <MemoryRouter initialEntries={[url]}>
        <LocationDisplay />
        <HistoryPage />
      </MemoryRouter>,
    );

  const renderRecorded = (url = '/history') => {
    const log = createRouterLog();
    render(
      <RecordingRouter entries={[url]} log={log}>
        <LocationDisplay />
        <HistoryPage />
      </RecordingRouter>,
    );
    return log;
  };

  const search = () => screen.getByTestId('location-search').textContent ?? '';
  const lastQuery = () => mockListHistory.mock.lastCall?.[0];
  const resultStatus = () => screen.getByTestId('history-result-status');

  // ─── Heading and states ───────────────────────────────────────────────────

  describe('page states', () => {
    it('shows exactly one "History" h1 and the description while loading', () => {
      mockListHistory.mockReturnValue(new Promise(() => {}));
      renderPage();
      expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
      expect(screen.getByRole('heading', { name: 'History', level: 1 })).toBeInTheDocument();
      expect(
        screen.getByText('Everything that changed in your project, newest first.'),
      ).toBeInTheDocument();
    });

    it('sets the tab title to History', async () => {
      mockListHistory.mockResolvedValue(response([]));
      renderPage();
      await waitFor(() => expect(document.title).toMatch(/^History/));
    });

    it('loading: an aria-hidden skeleton and a "Loading History" status', () => {
      mockListHistory.mockReturnValue(new Promise(() => {}));
      renderPage();
      const feed = screen.getByTestId('history-feed');
      const skeleton = feed.querySelector('[aria-hidden="true"]');
      expect(skeleton).not.toBeNull();
      expect(resultStatus()).toHaveTextContent('Loading History');
      expect(screen.queryByTestId('history-footer')).toBeNull();
    });

    it('requests page 1 with a page size of 25 and nothing else', async () => {
      mockListHistory.mockResolvedValue(response([]));
      renderPage();
      await waitFor(() => expect(mockListHistory).toHaveBeenCalledTimes(1));
      expect(mockListHistory.mock.calls[0]![0]).toEqual({ page: 1, pageSize: 25 });
    });

    it('empty: the "Nothing has changed yet" state with no Clear action', async () => {
      mockListHistory.mockResolvedValue(response([]));
      renderPage();
      expect(await screen.findByText('Nothing has changed yet')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'History', level: 1 })).toBeInTheDocument();
      expect(screen.queryByText('No changes match these filters')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull();
      expect(screen.queryByTestId('history-footer')).toBeNull();
    });

    it('filtered-empty: "No changes match these filters" with a Clear filters action', async () => {
      mockListHistory.mockResolvedValue(response([]));
      renderPage('/history?type=payment');
      expect(await screen.findByText('No changes match these filters')).toBeInTheDocument();
      expect(screen.queryByText('Nothing has changed yet')).toBeNull();
      expect(screen.getByRole('heading', { name: 'History', level: 1 })).toBeInTheDocument();
      // Both the filter bar and the empty state offer a Clear action.
      expect(screen.getAllByRole('button', { name: 'Clear filters' })).toHaveLength(2);
    });

    it('treats the include toggle alone as a filtered state', async () => {
      mockListHistory.mockResolvedValue(response([]));
      renderPage('/history?include=diary');
      expect(await screen.findByText('No changes match these filters')).toBeInTheDocument();
    });

    it('list: renders the rows, the footer and the h1', async () => {
      mockListHistory.mockResolvedValue(response([task('t-1', at(14, 9))]));
      renderPage();
      const row = await screen.findByTestId('system-event-t-1');
      expect(row).toHaveTextContent('Kitchen tiling went from Not started to In progress');
      expect(screen.getByRole('heading', { name: 'History', level: 1 })).toBeInTheDocument();
      expect(await screen.findByTestId('history-end-of-list')).toHaveTextContent(
        "You've reached the start of the history.",
      );
    });

    it('first-load error: a banner, Try again and the h1; Try again reloads and focuses nothing stale', async () => {
      const user = userEvent.setup();
      mockListHistory.mockRejectedValueOnce(new Error('boom'));
      mockListHistory.mockResolvedValueOnce(response([task('t-1', at(14))]));
      renderPage();

      expect(await screen.findByText("Couldn't load History.")).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'History', level: 1 })).toBeInTheDocument();
      expect(screen.queryByText('Nothing has changed yet')).toBeNull();
      expect(screen.queryByTestId('history-footer')).toBeNull();

      await user.click(screen.getByTestId('history-try-again'));

      expect(await screen.findByTestId('system-event-t-1')).toBeInTheDocument();
      expect(screen.queryByText("Couldn't load History.")).toBeNull();
      expect(mockListHistory).toHaveBeenCalledTimes(2);
    });

    it('a retry that finds nothing focuses the empty message', async () => {
      const user = userEvent.setup();
      mockListHistory.mockRejectedValueOnce(new Error('boom'));
      mockListHistory.mockResolvedValueOnce(response([]));
      renderPage();
      await user.click(await screen.findByTestId('history-try-again'));
      const title = await screen.findByText('Nothing has changed yet');
      await waitFor(() => expect(title).toHaveFocus());
    });

    it('a filter change clears a stale first-load error and loads again', async () => {
      const user = userEvent.setup();
      mockListHistory.mockRejectedValueOnce(new Error('boom'));
      mockListHistory.mockResolvedValueOnce(response([task('t-1', at(14))]));
      renderPage();
      await screen.findByText("Couldn't load History.");

      await user.click(screen.getByTestId('history-type-payment'));

      expect(await screen.findByTestId('system-event-t-1')).toBeInTheDocument();
      expect(screen.queryByText("Couldn't load History.")).toBeNull();
      expect(lastQuery()).toMatchObject({ type: 'payment' });
    });
  });

  // ─── Grouping and headings ────────────────────────────────────────────────

  describe('day groups', () => {
    it('shows "Today" and "Yesterday" headings with the muted date, other days by date', async () => {
      mockListHistory.mockResolvedValue(
        response([task('t-1', at(14, 10)), task('t-2', at(13, 10)), task('t-3', at(10, 10))]),
      );
      renderPage();
      await screen.findByTestId('system-event-t-1');

      const today = screen.getByTestId('date-group-2026-03-14');
      expect(within(today).getByRole('heading', { level: 2 })).toHaveTextContent(
        'TodayMar 14, 2026',
      );
      const yesterday = screen.getByTestId('date-group-2026-03-13');
      expect(within(yesterday).getByRole('heading', { level: 2 })).toHaveTextContent(
        'YesterdayMar 13, 2026',
      );
      const older = screen.getByTestId('date-group-2026-03-10');
      expect(within(older).getByRole('heading', { level: 2 })).toHaveTextContent(/^Mar 10, 2026$/);
    });

    it('groups days newest first even when the rows arrive out of order', async () => {
      mockListHistory.mockResolvedValue(
        response([task('t-1', at(10)), task('t-2', at(12)), task('t-3', at(11))]),
      );
      renderPage();
      await screen.findByTestId('system-event-t-1');
      const keys = Array.from(document.querySelectorAll('[data-testid^="date-group-"]'), (el) =>
        el.getAttribute('data-testid'),
      );
      expect(keys).toEqual([
        'date-group-2026-03-12',
        'date-group-2026-03-11',
        'date-group-2026-03-10',
      ]);
    });

    it('groups automatic rows by the local day of createdAt and manual rows by entryDate', async () => {
      mockListHistory.mockResolvedValue(
        response([
          // entryDate says 2020, createdAt says 11 March: the automatic row follows createdAt.
          task('t-1', at(11, 9)),
          // createdAt is 14 March, entryDate is 9 March: the manual row follows entryDate.
          note('n-1', '2026-03-09', at(14, 9)),
        ]),
      );
      renderPage();
      await screen.findByTestId('system-event-t-1');

      expect(
        within(screen.getByTestId('date-group-2026-03-11')).getByTestId('system-event-t-1'),
      ).toBeInTheDocument();
      expect(
        within(screen.getByTestId('date-group-2026-03-09')).getByTestId('diary-card-n-1'),
      ).toBeInTheDocument();
      expect(screen.queryByTestId('date-group-2020-01-01')).toBeNull();
      expect(screen.queryByTestId('date-group-2026-03-14')).toBeNull();
    });

    it('merges one day split over two pages into a single group', async () => {
      const user = userEvent.setup();
      mockListHistory.mockResolvedValueOnce(
        response([task('t-1', at(14, 11))], { totalPages: 2, totalItems: 2 }),
      );
      mockListHistory.mockResolvedValueOnce(
        response([task('t-2', at(14, 8))], { totalPages: 2, totalItems: 2, page: 2 }),
      );
      renderPage();
      await screen.findByTestId('system-event-t-1');

      await user.click(screen.getByTestId('history-load-more-button'));

      await screen.findByTestId('system-event-t-2');
      expect(screen.getAllByTestId('date-group-2026-03-14')).toHaveLength(1);
      expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(1);
      expect(
        within(screen.getByTestId('date-group-2026-03-14')).getAllByRole('listitem'),
      ).toHaveLength(2);
      expect(mockListHistory.mock.calls[1]![0]).toMatchObject({ page: 2 });
    });

    it('shows "Couldn\'t load more changes." with a working Retry when a later page fails', async () => {
      const user = userEvent.setup();
      mockListHistory.mockResolvedValueOnce(
        response([task('t-1', at(14))], { totalPages: 2, totalItems: 2 }),
      );
      mockListHistory.mockRejectedValueOnce(new Error('boom'));
      mockListHistory.mockResolvedValueOnce(
        response([task('t-2', at(13))], { totalPages: 2, totalItems: 2, page: 2 }),
      );
      renderPage();
      await screen.findByTestId('system-event-t-1');

      await user.click(screen.getByTestId('history-load-more-button'));
      expect(await screen.findByText("Couldn't load more changes.")).toBeInTheDocument();
      // The first batch stays; no first-load error block.
      expect(screen.getByTestId('system-event-t-1')).toBeInTheDocument();
      expect(screen.queryByTestId('history-try-again')).toBeNull();

      await user.click(screen.getByRole('button', { name: 'Retry' }));
      expect(await screen.findByTestId('system-event-t-2')).toBeInTheDocument();
    });
  });

  // ─── URL writes ───────────────────────────────────────────────────────────

  describe('filters write the URL with replace', () => {
    it('does not navigate on mount', async () => {
      mockListHistory.mockResolvedValue(response([]));
      const log = renderRecorded('/history?type=payment&q=T-001');
      await waitFor(() => expect(mockListHistory).toHaveBeenCalled());
      expect(log.actions).toEqual([]);
      expect(lastQuery()).toMatchObject({ type: 'payment', q: 'T-001' });
    });

    it('pressing a type chip writes type and deselecting deletes it', async () => {
      const user = userEvent.setup();
      mockListHistory.mockResolvedValue(response([task('t-1', at(14))]));
      const log = renderRecorded();
      await screen.findByTestId('system-event-t-1');

      await user.click(screen.getByTestId('history-type-payment'));
      await waitFor(() => expect(search()).toBe('?type=payment'));
      await waitFor(() => expect(lastQuery()).toMatchObject({ type: 'payment', page: 1 }));
      expect(screen.getByTestId('history-type-payment')).toHaveAttribute('aria-pressed', 'true');

      await user.click(screen.getByTestId('history-type-payment'));
      await waitFor(() => expect(search()).toBe(''));
      await waitFor(() => expect(lastQuery()).not.toHaveProperty('type'));

      expect(log.actions.every((a) => a.startsWith('REPLACE '))).toBe(true);
      expect([...new Set(log.actions)]).toEqual([
        'REPLACE /history?type=payment',
        'REPLACE /history',
      ]);
      expect(log.entries).toHaveLength(1);
    });

    it('the include toggle writes include=diary and sends includeDiary', async () => {
      const user = userEvent.setup();
      mockListHistory.mockResolvedValue(response([task('t-1', at(14))]));
      const log = renderRecorded();
      await screen.findByTestId('system-event-t-1');

      await user.click(screen.getByTestId('history-include-diary'));

      await waitFor(() => expect(search()).toBe('?include=diary'));
      await waitFor(() => expect(lastQuery()).toMatchObject({ includeDiary: true }));
      expect(screen.getByTestId('history-include-diary')).toBeChecked();
      expect(log.actions.every((a) => a.startsWith('REPLACE '))).toBe(true);
      expect([...new Set(log.actions)]).toEqual(['REPLACE /history?include=diary']);

      await user.click(screen.getByTestId('history-include-diary'));
      await waitFor(() => expect(search()).toBe(''));
    });

    it('date changes write dateFrom and dateTo', async () => {
      mockListHistory.mockResolvedValue(response([]));
      renderPage();
      await waitFor(() => expect(mockListHistory).toHaveBeenCalled());

      fireEvent.change(screen.getByTestId('history-date-from'), {
        target: { value: '2026-03-01' },
      });
      fireEvent.change(screen.getByTestId('history-date-to'), { target: { value: '2026-03-10' } });

      await waitFor(() => expect(search()).toBe('?dateFrom=2026-03-01&dateTo=2026-03-10'));
      await waitFor(() =>
        expect(lastQuery()).toMatchObject({ dateFrom: '2026-03-01', dateTo: '2026-03-10' }),
      );
    });

    it('debounces the search into the URL with one replace', async () => {
      mockListHistory.mockResolvedValue(response([]));
      const log = renderRecorded();
      await waitFor(() => expect(mockListHistory).toHaveBeenCalledTimes(1));

      const input = screen.getByTestId('history-search-input');
      fireEvent.change(input, { target: { value: 'r' } });
      fireEvent.change(input, { target: { value: 'ro' } });
      fireEvent.change(input, { target: { value: 'roof' } });

      // Nothing is written while the user is still typing.
      expect(search()).toBe('');
      expect(log.actions).toEqual([]);
      expect(mockListHistory).toHaveBeenCalledTimes(1);

      await waitFor(() => expect(search()).toBe('?q=roof'));
      expect(log.actions.every((a) => a.startsWith('REPLACE '))).toBe(true);
      expect([...new Set(log.actions)]).toEqual(['REPLACE /history?q=roof']);
      await waitFor(() => expect(lastQuery()).toMatchObject({ q: 'roof' }));
    });

    it('starts the search field from the URL value', async () => {
      mockListHistory.mockResolvedValue(response([]));
      renderPage('/history?q=T-001');
      expect((screen.getByTestId('history-search-input') as HTMLInputElement).value).toBe('T-001');
      await waitFor(() => expect(mockListHistory).toHaveBeenCalled());
    });

    it('keeps unrelated URL keys when a filter is written', async () => {
      const user = userEvent.setup();
      mockListHistory.mockResolvedValue(response([]));
      renderPage('/history?keep=1');
      await waitFor(() => expect(mockListHistory).toHaveBeenCalled());
      await user.click(screen.getByTestId('history-type-submission'));
      await waitFor(() => expect(search()).toBe('?keep=1&type=submission'));
    });

    it('sends the object filter from the URL', async () => {
      mockListHistory.mockResolvedValue(response([]));
      renderPage('/history?object=invoice:inv-1');
      await waitFor(() => expect(mockListHistory).toHaveBeenCalled());
      expect(lastQuery()).toMatchObject({ entityType: 'invoice', entityId: 'inv-1' });
    });
  });

  // ─── Object chip label from the API echo ──────────────────────────────────

  describe('object filter echo', () => {
    it('names the chip after a reload from the echoed live title', async () => {
      mockListHistory.mockResolvedValue(
        response([task('t-1', at(14))], {
          object: { entityType: 'invoice', entityId: 'inv-1', title: 'T-001', exists: true },
        }),
      );
      renderPage('/history?object=invoice:inv-1');
      await screen.findByTestId('system-event-t-1');
      expect(screen.getByTestId('history-object-object')).toHaveTextContent(
        'Object · Invoice T-001',
      );
    });

    it('says "No longer exists" for a deleted object', async () => {
      mockListHistory.mockResolvedValue(
        response([], {
          object: { entityType: 'work_item', entityId: 'wi-9', title: null, exists: false },
        }),
      );
      renderPage('/history?object=work_item:wi-9');
      await screen.findByText('No changes match these filters');
      expect(screen.getByTestId('history-object-object')).toHaveTextContent(
        'Object · No longer exists',
      );
    });

    it('ignores an echo that belongs to another object', async () => {
      mockListHistory.mockResolvedValue(
        response([task('t-1', at(14))], {
          object: { entityType: 'invoice', entityId: 'inv-OTHER', title: 'T-999', exists: true },
        }),
      );
      renderPage('/history?object=invoice:inv-1');
      await screen.findByTestId('system-event-t-1');
      expect(screen.getByTestId('history-object-object')).toHaveTextContent('Object · Invoice');
      expect(screen.getByTestId('history-object-object')).not.toHaveTextContent('T-999');
    });
  });

  // ─── Hidden notes line ────────────────────────────────────────────────────

  describe('hidden notes', () => {
    it('shows no line and an empty status when nothing is hidden', async () => {
      mockListHistory.mockResolvedValue(response([task('t-1', at(14))]));
      renderPage();
      await screen.findByTestId('system-event-t-1');
      expect(screen.queryByTestId('history-hidden-note')).toBeNull();
      expect(screen.queryByTestId('history-show-hidden')).toBeNull();
      expect(screen.getByTestId('history-hidden-status')).toBeEmptyDOMElement();
    });

    it.each([
      [1, '1 later delay note is hidden.'],
      [3, '3 later delay notes are hidden.'],
    ])('shows the count line for %i hidden notes', async (count, text) => {
      mockListHistory.mockResolvedValue(response([task('t-1', at(14))], { hiddenCount: count }));
      renderPage();
      const note = await screen.findByTestId('history-hidden-note');
      expect(note).toHaveTextContent(text);
      expect(screen.getByTestId('history-show-hidden')).toHaveTextContent('Show hidden');
      expect(screen.getByTestId('history-show-hidden')).toHaveAttribute('aria-pressed', 'false');
    });

    it('Show hidden refetches with showHidden, announces it and stays mounted with focus', async () => {
      const user = userEvent.setup();
      mockListHistory.mockResolvedValueOnce(response([task('t-1', at(14))], { hiddenCount: 2 }));
      renderPage();
      const toggle = await screen.findByTestId('history-show-hidden');
      expect(mockListHistory.mock.calls[0]![0]).not.toHaveProperty('showHidden');

      let resolveReload!: (value: HistoryListResponse) => void;
      mockListHistory.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveReload = resolve;
          }),
      );
      await user.click(toggle);

      expect(screen.getByTestId('history-show-hidden')).toBe(toggle);
      expect(toggle).toHaveFocus();
      expect(toggle).toHaveAttribute('aria-pressed', 'true');
      expect(toggle).toHaveTextContent('Hide again');
      expect(screen.getByTestId('history-hidden-status')).toHaveTextContent('2 hidden notes shown');
      expect(screen.getByTestId('history-hidden-note')).toHaveTextContent(
        'Showing 2 later delay notes.',
      );
      await waitFor(() => expect(lastQuery()).toMatchObject({ showHidden: true }));

      await act(async () => {
        resolveReload(
          response(
            [
              task('t-1', at(14)),
              task('t-2', at(14, 13), { hidden: true } as Partial<DiaryEntrySummary>),
            ],
            { hiddenCount: 2 },
          ),
        );
      });
      const hiddenRow = await screen.findByTestId('system-event-t-2');
      expect(hiddenRow).toHaveTextContent('After reached');
      expect(screen.getByTestId('history-show-hidden')).toHaveFocus();
      // The result announcement region is separate from the hidden-notes status.
      expect(resultStatus()).not.toBe(screen.getByTestId('history-hidden-status'));
    });

    it('Hide again returns to the normal query and announces it', async () => {
      const user = userEvent.setup();
      mockListHistory.mockResolvedValue(response([task('t-1', at(14))], { hiddenCount: 1 }));
      renderPage();
      await user.click(await screen.findByTestId('history-show-hidden'));
      await waitFor(() => expect(lastQuery()).toMatchObject({ showHidden: true }));

      await user.click(screen.getByTestId('history-show-hidden'));

      expect(screen.getByTestId('history-hidden-status')).toHaveTextContent('Hidden notes hidden');
      expect(screen.getByTestId('history-show-hidden')).toHaveAttribute('aria-pressed', 'false');
      await waitFor(() => expect(lastQuery()).not.toHaveProperty('showHidden'));
    });

    it('keeps the line mounted while shown even when the count drops to zero', async () => {
      const user = userEvent.setup();
      mockListHistory.mockResolvedValueOnce(response([task('t-1', at(14))], { hiddenCount: 1 }));
      mockListHistory.mockResolvedValueOnce(response([task('t-1', at(14))], { hiddenCount: 0 }));
      renderPage();
      await user.click(await screen.findByTestId('history-show-hidden'));
      await waitFor(() => expect(mockListHistory).toHaveBeenCalledTimes(2));
      await waitFor(() =>
        expect(screen.getByTestId('history-hidden-note')).toHaveTextContent(
          'Showing 0 later delay notes.',
        ),
      );
      expect(screen.getByTestId('history-show-hidden')).toBeInTheDocument();
    });
  });

  // ─── Announcements ────────────────────────────────────────────────────────

  describe('result announcements', () => {
    it('announces the total after the first load', async () => {
      mockListHistory.mockResolvedValue(
        response([task('t-1', at(14))], { totalItems: 7, totalPages: 1 }),
      );
      renderPage();
      await screen.findByTestId('system-event-t-1');
      await waitFor(() => expect(resultStatus()).toHaveTextContent('7 changes'));
    });

    it('uses the singular for one change', async () => {
      mockListHistory.mockResolvedValue(response([task('t-1', at(14))]));
      renderPage();
      await waitFor(() => expect(resultStatus()).toHaveTextContent(/^1 change$/));
    });

    it('announces the new total after a filter change', async () => {
      const user = userEvent.setup();
      mockListHistory.mockResolvedValueOnce(
        response([task('t-1', at(14)), task('t-2', at(13))], { totalItems: 2 }),
      );
      mockListHistory.mockResolvedValueOnce(response([task('t-3', at(12))], { totalItems: 1 }));
      renderPage();
      await waitFor(() => expect(resultStatus()).toHaveTextContent('2 changes'));

      await user.click(screen.getByTestId('history-type-payment'));

      await screen.findByTestId('system-event-t-3');
      await waitFor(() => expect(resultStatus()).toHaveTextContent(/^1 change$/));
    });

    it('announces a middle batch without the end-of-list sentence', async () => {
      const user = userEvent.setup();
      mockListHistory.mockResolvedValueOnce(
        response([task('t-1', at(14))], { totalPages: 3, totalItems: 3 }),
      );
      mockListHistory.mockResolvedValueOnce(
        response([task('t-2', at(13))], { totalPages: 3, totalItems: 3, page: 2 }),
      );
      renderPage();
      await screen.findByTestId('system-event-t-1');
      await user.click(screen.getByTestId('history-load-more-button'));
      await screen.findByTestId('system-event-t-2');
      await waitFor(() => expect(resultStatus()).toHaveTextContent(/^1 more change loaded$/));
    });

    it('announces the last batch with the end-of-list sentence', async () => {
      const user = userEvent.setup();
      mockListHistory.mockResolvedValueOnce(
        response([task('t-1', at(14))], { totalPages: 2, totalItems: 2 }),
      );
      mockListHistory.mockResolvedValueOnce(
        response([task('t-2', at(13))], { totalPages: 2, totalItems: 2, page: 2 }),
      );
      renderPage();
      await screen.findByTestId('system-event-t-1');
      await user.click(screen.getByTestId('history-load-more-button'));
      await screen.findByTestId('system-event-t-2');
      await waitFor(() =>
        expect(resultStatus()).toHaveTextContent(
          "1 more change loaded. You've reached the start of the history.",
        ),
      );
    });
  });

  // ─── Clear filters ────────────────────────────────────────────────────────

  describe('Clear filters', () => {
    it('the empty-state action clears everything and focuses the first type chip', async () => {
      const user = userEvent.setup();
      mockListHistory.mockResolvedValue(response([]));
      renderPage('/history?type=payment&q=zz&dateFrom=2026-01-01&include=diary');
      await screen.findByText('No changes match these filters');
      expect((screen.getByTestId('history-search-input') as HTMLInputElement).value).toBe('zz');

      const emptyState = screen.getByText('No changes match these filters').closest('div')!
        .parentElement as HTMLElement;
      await user.click(within(emptyState).getByRole('button', { name: 'Clear filters' }));

      await waitFor(() => expect(search()).toBe(''));
      expect((screen.getByTestId('history-search-input') as HTMLInputElement).value).toBe('');
      expect(screen.getByTestId('history-include-diary')).not.toBeChecked();
      await screen.findByText('Nothing has changed yet');
      expect(document.activeElement).toBe(screen.getByTestId('history-type-work_item_status'));
    });

    it('the filter bar button clears too and keeps unrelated keys out of the way', async () => {
      const user = userEvent.setup();
      mockListHistory.mockResolvedValue(response([task('t-1', at(14))]));
      renderPage('/history?type=payment&q=T-001');
      await screen.findByTestId('system-event-t-1');

      await user.click(screen.getByTestId('history-clear-filters'));

      await waitFor(() => expect(search()).toBe(''));
      await waitFor(() => expect(lastQuery()).toEqual({ page: 1, pageSize: 25 }));
      expect(screen.getByTestId('history-type-payment')).toHaveAttribute('aria-pressed', 'false');
    });
  });

  // ─── Scroll back to the top ───────────────────────────────────────────────

  describe('scrolling', () => {
    let scrollTo: jest.Mock;
    let rectSpy: jest.SpiedFunction<typeof Element.prototype.getBoundingClientRect>;

    beforeEach(() => {
      scrollTo = jest.fn();
      window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
      rectSpy = jest.spyOn(Element.prototype, 'getBoundingClientRect');
    });

    afterEach(() => {
      rectSpy.mockRestore();
    });

    it('returns to the top on a filter change when the feed top has scrolled away', async () => {
      const user = userEvent.setup();
      rectSpy.mockReturnValue({ top: -300 } as DOMRect);
      mockListHistory.mockResolvedValue(response([task('t-1', at(14))]));
      renderPage();
      await screen.findByTestId('system-event-t-1');
      expect(scrollTo).not.toHaveBeenCalled();

      await user.click(screen.getByTestId('history-type-payment'));

      await waitFor(() => expect(scrollTo).toHaveBeenCalledWith({ top: 0 }));
    });

    it('stays put when the feed top is still in view', async () => {
      const user = userEvent.setup();
      rectSpy.mockReturnValue({ top: 40 } as DOMRect);
      mockListHistory.mockResolvedValue(response([task('t-1', at(14))]));
      renderPage();
      await screen.findByTestId('system-event-t-1');

      await user.click(screen.getByTestId('history-type-payment'));
      await waitFor(() => expect(lastQuery()).toMatchObject({ type: 'payment' }));

      expect(scrollTo).not.toHaveBeenCalled();
    });
  });
});
