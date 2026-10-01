/**
 * @jest-environment jsdom
 *
 * Integration tests for the Paperless document browser infinite scroll (Issue #2101).
 *
 * Renders the REAL DocumentBrowser + usePaperless + useInfiniteScroll against a mocked
 * paperlessApi and a controllable IntersectionObserver, and asserts on what a user would see
 * (cards, footer, live region) and on which pages the server is asked for.
 */
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type { ReactElement } from 'react';
import type * as DocumentBrowserModule from './DocumentBrowser.js';
import type * as ApiClientModule from '../../lib/apiClient.js';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockGetPaperlessStatus = jest.fn<() => Promise<unknown>>();
const mockListPaperlessDocuments = jest.fn<(params: ListParams) => Promise<unknown>>();
const mockListPaperlessTags = jest.fn<() => Promise<unknown>>();

interface ListParams {
  query?: string;
  tags?: string;
  correspondent?: number;
  page: number;
  pageSize: number;
}

jest.unstable_mockModule('../../lib/paperlessApi.js', () => ({
  getPaperlessStatus: mockGetPaperlessStatus,
  listPaperlessDocuments: mockListPaperlessDocuments,
  listPaperlessTags: mockListPaperlessTags,
  getPaperlessDocument: jest.fn(),
  getDocumentThumbnailUrl: (id: number) => `/api/paperless/documents/${id}/thumb`,
  getDocumentPreviewUrl: (id: number) => `/api/paperless/documents/${id}/preview`,
}));

jest.unstable_mockModule('../../contexts/LocaleContext.js', () => ({
  useLocale: jest.fn(() => ({
    locale: 'en' as const,
    resolvedLocale: 'en' as const,
    vatRate: 0.19,
    currency: 'EUR',
    setLocale: jest.fn(),
    syncWithServer: jest.fn(),
  })),
  LocaleProvider: ({ children }: { children: React.ReactNode }) => children,
}));

let DocumentBrowser: (typeof DocumentBrowserModule)['DocumentBrowser'];
let ApiClientError: (typeof ApiClientModule)['ApiClientError'];
let NetworkError: (typeof ApiClientModule)['NetworkError'];

// ─── IntersectionObserver mock (copied from useInfiniteScroll.test.tsx) ──────────

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];
  callback: IntersectionObserverCallback;
  options: IntersectionObserverInit | undefined;
  constructor(cb: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.callback = cb;
    this.options = options;
    MockIntersectionObserver.instances.push(this);
  }
  observe = jest.fn();
  disconnect = jest.fn();
  unobserve = jest.fn();
  trigger(isIntersecting: boolean) {
    this.callback(
      [{ isIntersecting } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}

/** Fires "sentinel is visible" on the newest live (not disconnected) observer. */
function intersect() {
  const live = MockIntersectionObserver.instances.filter(
    (o) => o.disconnect.mock.calls.length === 0,
  );
  const observer = live[live.length - 1];
  if (!observer) throw new Error('no live IntersectionObserver — is the sentinel mounted?');
  act(() => observer.trigger(true));
}

let originalIO: typeof IntersectionObserver | undefined;

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 25;

const makeDoc = (id: number, tags: unknown[] = []) => ({
  id,
  title: `Document ${id}`,
  content: `Content ${id}`,
  tags,
  created: '2025-06-15',
  added: null,
  modified: null,
  correspondent: 'Test Corp',
  documentType: null,
  archiveSerialNumber: null,
  originalFileName: null,
  pageCount: null,
  searchHit: null,
});

/** Documents with ids from..to inclusive. */
const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => makeDoc(from + i));

/** Server-like paging over `all`. */
function serve(all: ReturnType<typeof makeDoc>[]) {
  mockListPaperlessDocuments.mockImplementation(async ({ page, pageSize }: ListParams) => ({
    documents: all.slice((page - 1) * pageSize, page * pageSize),
    pagination: {
      page,
      pageSize,
      totalItems: all.length,
      totalPages: Math.max(1, Math.ceil(all.length / pageSize)),
    },
  }));
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const pageResponse = (docs: ReturnType<typeof makeDoc>[], page: number, totalPages: number) => ({
  documents: docs,
  pagination: { page, pageSize: PAGE_SIZE, totalItems: docs.length, totalPages },
});

const cardTitles = () =>
  screen.queryAllByRole('heading', { level: 3 }).map((h) => h.textContent ?? '');
const cardCount = () => cardTitles().length;
const cardFor = (id: number) =>
  screen.getByRole('heading', { name: `Document ${id}` }).closest('[role="button"]') as HTMLElement;
const callsWithPage = (page: number) =>
  mockListPaperlessDocuments.mock.calls.filter(([p]) => p.page === page);

/** Renders inside a scrollable ancestor so DocumentBrowser resolves a scroll root. */
function renderInScroller(ui: ReactElement) {
  const scroller = document.createElement('div');
  scroller.style.overflowY = 'auto';
  document.body.appendChild(scroller);
  const container = scroller.appendChild(document.createElement('div'));
  const view = render(ui, { container });
  return { scroller, ...view };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

const NO_LINKED: number[] = [];

beforeEach(async () => {
  MockIntersectionObserver.instances = [];
  originalIO = globalThis.IntersectionObserver;
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver =
    MockIntersectionObserver;

  ({ DocumentBrowser } = (await import('./DocumentBrowser.js')) as typeof DocumentBrowserModule);
  ({ ApiClientError, NetworkError } = await import('../../lib/apiClient.js'));

  mockGetPaperlessStatus.mockReset();
  mockListPaperlessDocuments.mockReset();
  mockListPaperlessTags.mockReset();
  mockGetPaperlessStatus.mockResolvedValue({
    configured: true,
    reachable: true,
    error: null,
    paperlessUrl: null,
    filterTag: null,
  });
  mockListPaperlessTags.mockResolvedValue({
    tags: [{ id: 1, name: 'Invoice', color: null, documentCount: 3 }],
  });
  serve(range(1, 30));
});

afterEach(() => {
  jest.useRealTimers();
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = originalIO;
  document.body.innerHTML = '';
});

describe('DocumentBrowser infinite scroll (integration)', () => {
  // ─── AC1 / AC2 / AC3 ─────────────────────────────────────────────────────

  it('AC1: fetches page 1 (pageSize 25) exactly once on mount, renders 25 cards, and does not fetch page 2 until the sentinel intersects', async () => {
    render(<DocumentBrowser />);

    await waitFor(() => expect(cardCount()).toBe(25));
    await flush();

    expect(mockListPaperlessDocuments).toHaveBeenCalledTimes(1);
    expect(mockListPaperlessDocuments.mock.calls[0]![0]).toMatchObject({ page: 1, pageSize: 25 });
    expect(callsWithPage(2)).toHaveLength(0);
  });

  it('AC2: intersecting the sentinel requests page 2, appends 5 cards, and keeps the first 25 card nodes mounted', async () => {
    render(<DocumentBrowser />);
    await waitFor(() => expect(cardCount()).toBe(25));
    const firstCard = cardFor(1);

    intersect();

    await waitFor(() => expect(cardCount()).toBe(30));
    expect(mockListPaperlessDocuments.mock.calls[1]![0]).toMatchObject({ page: 2, pageSize: 25 });
    expect(firstCard.isConnected).toBe(true);
    expect(cardFor(1)).toBe(firstCard);
  });

  it('AC3: triggering the observer twice while page 2 is pending issues exactly one page-2 request', async () => {
    const page2 = deferred<unknown>();
    render(<DocumentBrowser />);
    await waitFor(() => expect(cardCount()).toBe(25));
    mockListPaperlessDocuments.mockImplementationOnce(() => page2.promise);

    intersect();
    intersect();
    await flush();

    expect(callsWithPage(2)).toHaveLength(1);

    await act(async () => {
      page2.resolve(pageResponse(range(26, 30), 2, 2));
      await page2.promise;
    });
    await waitFor(() => expect(cardCount()).toBe(30));
  });

  // ─── AC5 / AC6 ────────────────────────────────────────────────────────────

  it.each(['page', 'modal'] as const)(
    'AC5/6: renders no pager (no navigation, no "Page N of M", no Previous/Next) in %s mode',
    async (mode) => {
      render(<DocumentBrowser mode={mode} />);
      await waitFor(() => expect(cardCount()).toBe(25));

      expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
      expect(screen.queryByText(/page \d+ of/i)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /previous|next/i })).not.toBeInTheDocument();
    },
  );

  // ─── AC7: resets ──────────────────────────────────────────────────────────

  describe('AC7: filter changes reset to a fresh first batch', () => {
    async function loadTwoBatches(ui: ReactElement) {
      const view = renderInScroller(ui);
      await waitFor(() => expect(cardCount()).toBe(25));
      intersect();
      await waitFor(() => expect(cardCount()).toBe(30));
      return view;
    }

    it('a search change clears the list (skeleton), refetches page 1 with the query, and scrolls the container to the top', async () => {
      jest.useFakeTimers();
      const { scroller } = await loadTwoBatches(<DocumentBrowser />);
      scroller.scrollTop = 300;
      const held = deferred<unknown>();
      mockListPaperlessDocuments.mockImplementationOnce(() => held.promise);

      fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'invoice' } });
      await act(async () => {
        jest.advanceTimersByTime(350);
      });

      await waitFor(() => expect(cardCount()).toBe(0));
      expect(screen.getByRole('list', { name: 'Documents' })).toHaveAttribute('aria-busy', 'true');
      const last = mockListPaperlessDocuments.mock.calls.at(-1)![0];
      expect(last).toMatchObject({ query: 'invoice', page: 1 });
      expect(scroller.scrollTop).toBe(0);

      await act(async () => {
        held.resolve(pageResponse([makeDoc(99)], 1, 1));
        await held.promise;
      });
      await waitFor(() => expect(cardTitles()).toEqual(['Document 99']));
    });

    it('toggling a tag refetches page 1 with the tag and drops the previously loaded documents', async () => {
      await loadTwoBatches(<DocumentBrowser />);
      mockListPaperlessDocuments.mockResolvedValueOnce(pageResponse([makeDoc(50)], 1, 1));

      fireEvent.click(await screen.findByRole('checkbox', { name: /Filter by tag: Invoice/i }));

      await waitFor(() => expect(cardTitles()).toEqual(['Document 50']));
      expect(mockListPaperlessDocuments.mock.calls.at(-1)![0]).toMatchObject({
        tags: '1',
        page: 1,
      });
    });

    it('changing the correspondent prop refetches page 1 with the new correspondent', async () => {
      const view = await loadTwoBatches(<DocumentBrowser correspondentId={3} />);
      expect(mockListPaperlessDocuments.mock.calls.at(-1)![0]).toMatchObject({ correspondent: 3 });
      mockListPaperlessDocuments.mockResolvedValueOnce(pageResponse([makeDoc(60)], 1, 1));

      view.rerender(<DocumentBrowser correspondentId={8} />);

      await waitFor(() => expect(cardTitles()).toEqual(['Document 60']));
      expect(mockListPaperlessDocuments.mock.calls.at(-1)![0]).toMatchObject({
        correspondent: 8,
        page: 1,
      });
    });
  });

  // ─── AC8 ──────────────────────────────────────────────────────────────────

  it('AC8: a stale page-2 response that resolves after the query changed renders none of its documents', async () => {
    jest.useFakeTimers();
    render(<DocumentBrowser />);
    await waitFor(() => expect(cardCount()).toBe(25));
    const stalePage2 = deferred<unknown>();
    mockListPaperlessDocuments.mockImplementationOnce(() => stalePage2.promise);
    intersect();
    await flush();
    expect(callsWithPage(2)).toHaveLength(1);
    mockListPaperlessDocuments.mockResolvedValueOnce(pageResponse([makeDoc(70)], 1, 1));

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'other' } });
    await act(async () => {
      jest.advanceTimersByTime(350);
    });
    await waitFor(() => expect(cardTitles()).toEqual(['Document 70']));

    await act(async () => {
      stalePage2.resolve(pageResponse(range(26, 30), 2, 2));
      await stalePage2.promise;
    });

    expect(cardTitles()).toEqual(['Document 70']);
    expect(screen.queryByRole('heading', { name: 'Document 26' })).not.toBeInTheDocument();
  });

  // ─── AC9 ──────────────────────────────────────────────────────────────────

  it('AC9: toggling hide-linked does not refetch, changes the visible count exactly, and never duplicates', async () => {
    const linked = [1, 2, 27];
    render(<DocumentBrowser linkedDocumentIds={linked} />);
    await waitFor(() => expect(cardCount()).toBe(25));
    intersect();
    await waitFor(() => expect(cardCount()).toBe(30));
    const callsBefore = mockListPaperlessDocuments.mock.calls.length;

    fireEvent.click(screen.getByRole('checkbox', { name: /hide already-linked/i }));
    expect(cardCount()).toBe(27);
    expect(screen.queryByRole('heading', { name: 'Document 27' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: /hide already-linked/i }));
    expect(cardCount()).toBe(30);
    expect(new Set(cardTitles()).size).toBe(30);
    expect(mockListPaperlessDocuments.mock.calls.length).toBe(callsBefore);
  });

  // ─── AC10 ─────────────────────────────────────────────────────────────────

  it('AC10: 30 documents (not a multiple of 25) render ids 1..30 each exactly once', async () => {
    render(<DocumentBrowser />);
    await waitFor(() => expect(cardCount()).toBe(25));
    intersect();
    await waitFor(() => expect(cardCount()).toBe(30));

    expect(cardTitles().sort()).toEqual(
      range(1, 30)
        .map((d) => d.title)
        .sort(),
    );
  });

  it('AC10: a document repeated by page 2 is rendered once and produces no duplicate-key warning', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockListPaperlessDocuments.mockImplementation(async ({ page }: ListParams) =>
      page === 1
        ? pageResponse(range(1, 25), 1, 2)
        : pageResponse([makeDoc(25), ...range(26, 30)], 2, 2),
    );
    render(<DocumentBrowser />);
    await waitFor(() => expect(cardCount()).toBe(25));

    intersect();

    await waitFor(() => expect(cardCount()).toBe(30));
    expect(cardTitles().filter((t) => t === 'Document 25')).toHaveLength(1);
    const keyWarnings = errorSpy.mock.calls.filter((c) => String(c[0]).includes('same key'));
    expect(keyWarnings).toHaveLength(0);
    errorSpy.mockRestore();
  });

  // ─── AC11 ─────────────────────────────────────────────────────────────────

  describe('AC11: hide-linked hiding a whole batch', () => {
    it('auto-fetches page 2 without an intersection when every document of page 1 is hidden', async () => {
      const linked = range(1, 25).map((d) => d.id);
      render(<DocumentBrowser linkedDocumentIds={linked} defaultHideLinked />);

      await waitFor(() => expect(cardCount()).toBe(5));
      expect(callsWithPage(2)).toHaveLength(1);
      expect(cardTitles().sort()).toEqual(
        range(26, 30)
          .map((d) => d.title)
          .sort(),
      );
    });

    it('ends in the "no additional documents" empty state with no footer when everything is linked', async () => {
      const linked = range(1, 30).map((d) => d.id);
      render(<DocumentBrowser linkedDocumentIds={linked} defaultHideLinked />);

      expect(await screen.findByText(/no additional documents/i)).toBeInTheDocument();
      expect(callsWithPage(2)).toHaveLength(1);
      expect(cardCount()).toBe(0);
      expect(screen.queryByTestId('paperless-documents-footer')).not.toBeInTheDocument();
    });
  });

  // ─── AC13 / AC14 ──────────────────────────────────────────────────────────

  it('AC13: after the last batch the end-of-list message shows and further intersections fetch nothing', async () => {
    render(<DocumentBrowser />);
    await waitFor(() => expect(cardCount()).toBe(25));
    intersect();
    await waitFor(() =>
      expect(screen.getByTestId('paperless-documents-end-of-list')).toBeVisible(),
    );
    const calls = mockListPaperlessDocuments.mock.calls.length;

    intersect();
    intersect();
    await flush();

    expect(mockListPaperlessDocuments.mock.calls.length).toBe(calls);
    expect(screen.queryByTestId('paperless-documents-load-more-button')).not.toBeInTheDocument();
  });

  it('AC14: zero documents shows the empty state and no footer', async () => {
    serve([]);
    render(<DocumentBrowser />);

    expect(await screen.findByText(/no documents found/i)).toBeInTheDocument();
    expect(screen.queryByTestId('paperless-documents-footer')).not.toBeInTheDocument();
  });

  // ─── AC15 / AC16 ──────────────────────────────────────────────────────────

  it('AC15: a failed page 2 keeps the 25 cards, shows a footer alert, and Retry re-requests page 2 (not 1)', async () => {
    render(<DocumentBrowser />);
    await waitFor(() => expect(cardCount()).toBe(25));
    mockListPaperlessDocuments.mockRejectedValueOnce(new Error('boom'));

    intersect();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Failed to load more documents.');
    expect(cardCount()).toBe(25);
    expect(callsWithPage(2)).toHaveLength(1);

    fireEvent.click(
      within(screen.getByTestId('paperless-documents-footer')).getByRole('button', {
        name: 'Retry',
      }),
    );

    await waitFor(() => expect(cardCount()).toBe(30));
    expect(callsWithPage(2)).toHaveLength(2);
    expect(callsWithPage(1)).toHaveLength(1);
    expect(new Set(cardTitles()).size).toBe(30);
  });

  describe('AC16: first-batch failure', () => {
    it('shows the ApiClientError message and Try Again re-requests page 1', async () => {
      mockListPaperlessDocuments.mockRejectedValueOnce(
        new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'Paperless exploded' }),
      );
      render(<DocumentBrowser />);

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('Paperless exploded');
      expect(cardCount()).toBe(0);

      fireEvent.click(screen.getByRole('button', { name: /try again/i }));

      await waitFor(() => expect(cardCount()).toBe(25));
      expect(callsWithPage(1)).toHaveLength(2);
    });

    it('shows the network-error copy for a NetworkError', async () => {
      mockListPaperlessDocuments.mockRejectedValueOnce(new NetworkError('offline', new Error()));
      render(<DocumentBrowser />);
      expect(await screen.findByRole('alert')).toHaveTextContent(
        /unable to connect to the server/i,
      );
    });

    it('shows the generic copy for an unknown error', async () => {
      mockListPaperlessDocuments.mockRejectedValueOnce(new Error('???'));
      render(<DocumentBrowser />);
      expect(await screen.findByRole('alert')).toHaveTextContent('An unexpected error occurred.');
    });

    it('a failed later batch after a search does not show the first-batch error state', async () => {
      render(<DocumentBrowser />);
      await waitFor(() => expect(cardCount()).toBe(25));
      mockListPaperlessDocuments.mockRejectedValueOnce(new Error('later'));
      intersect();
      await screen.findByRole('alert');
      expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument();
    });
  });

  it('keeps the not-configured state unchanged (no fetch, no footer)', async () => {
    mockGetPaperlessStatus.mockResolvedValue({
      configured: false,
      reachable: false,
      error: null,
      paperlessUrl: null,
      filterTag: null,
    });
    render(<DocumentBrowser />);

    expect(await screen.findByText(/paperless-ngx not configured/i)).toBeInTheDocument();
    expect(mockListPaperlessDocuments).not.toHaveBeenCalled();
    expect(screen.queryByTestId('paperless-documents-footer')).not.toBeInTheDocument();
  });

  it('keeps the unreachable state unchanged (alert with Try Again, no document fetch)', async () => {
    mockGetPaperlessStatus.mockResolvedValue({
      configured: true,
      reachable: false,
      error: null,
      paperlessUrl: null,
      filterTag: null,
    });
    render(<DocumentBrowser />);

    expect(await screen.findByText(/paperless-ngx unreachable/i)).toBeInTheDocument();
    expect(mockListPaperlessDocuments).not.toHaveBeenCalled();
  });

  // ─── AC21 ─────────────────────────────────────────────────────────────────

  describe('AC21: live-region announcements', () => {
    it('announces "25 documents loaded" after the first batch and the appended count with end-of-list after page 2', async () => {
      render(<DocumentBrowser />);
      const region = await screen.findByRole('status');
      await waitFor(() => expect(region).toHaveTextContent('25 documents loaded'));

      intersect();

      await waitFor(() =>
        expect(region).toHaveTextContent("5 more documents loaded. You've reached the end."),
      );
    });

    it('announces "Loading more documents…" while a later batch is in flight', async () => {
      render(<DocumentBrowser />);
      const region = await screen.findByRole('status');
      await waitFor(() => expect(region).toHaveTextContent('25 documents loaded'));
      const page2 = deferred<unknown>();
      mockListPaperlessDocuments.mockImplementationOnce(() => page2.promise);

      intersect();

      await waitFor(() => expect(region).toHaveTextContent('Loading more documents'));
      await act(async () => {
        page2.resolve(pageResponse(range(26, 30), 2, 2));
        await page2.promise;
      });
      await waitFor(() => expect(region).toHaveTextContent('5 more documents loaded'));
    });

    it('counts only VISIBLE added documents when hide-linked hides some of the appended batch', async () => {
      render(<DocumentBrowser linkedDocumentIds={[26, 27]} defaultHideLinked />);
      const region = await screen.findByRole('status');
      await waitFor(() => expect(region).toHaveTextContent('25 documents loaded'));

      intersect();

      await waitFor(() =>
        expect(region).toHaveTextContent("3 more documents loaded. You've reached the end."),
      );
    });

    it('uses the singular form for a single appended document', async () => {
      serve(range(1, 26));
      render(<DocumentBrowser />);
      const region = await screen.findByRole('status');
      await waitFor(() => expect(region).toHaveTextContent('25 documents loaded'));

      intersect();

      await waitFor(() =>
        expect(region).toHaveTextContent("1 more document loaded. You've reached the end."),
      );
    });

    it('announces the end of the list when the last batch adds nothing visible', async () => {
      render(
        <DocumentBrowser linkedDocumentIds={range(26, 30).map((d) => d.id)} defaultHideLinked />,
      );
      const region = await screen.findByRole('status');
      await waitFor(() => expect(region).toHaveTextContent('25 documents loaded'));

      intersect();

      await waitFor(() =>
        expect(region).toHaveTextContent("You've reached the end of the document list."),
      );
    });
  });

  // ─── AC22 ─────────────────────────────────────────────────────────────────

  it('AC22: keyboard focus on a card is preserved when the next batch is appended', async () => {
    render(<DocumentBrowser />);
    await waitFor(() => expect(cardCount()).toBe(25));
    const card = cardFor(3);
    act(() => card.focus());
    expect(document.activeElement).toBe(card);

    intersect();
    await waitFor(() => expect(cardCount()).toBe(30));

    expect(document.activeElement).toBe(card);
  });

  // ─── Observer wiring ──────────────────────────────────────────────────────

  it('creates the IntersectionObserver with the nearest scrollable ancestor as root', async () => {
    const { scroller } = renderInScroller(<DocumentBrowser />);
    await waitFor(() => expect(cardCount()).toBe(25));

    const live = MockIntersectionObserver.instances.filter(
      (o) => o.disconnect.mock.calls.length === 0,
    );
    expect(live[live.length - 1]!.options!.root).toBe(scroller);
  });

  it('the Load more button is a working fallback that requests the next page', async () => {
    render(<DocumentBrowser linkedDocumentIds={NO_LINKED} />);
    await waitFor(() => expect(cardCount()).toBe(25));

    fireEvent.click(screen.getByTestId('paperless-documents-load-more-button'));

    await waitFor(() => expect(cardCount()).toBe(30));
    expect(callsWithPage(2)).toHaveLength(1);
  });
});
