import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { jest } from '@jest/globals';
import type { UsePaperlessResult } from '../../hooks/usePaperless.js';

// Mock usePaperless hook
const mockUsePaperless = jest.fn<() => UsePaperlessResult>();

jest.unstable_mockModule('../../hooks/usePaperless.js', () => ({
  usePaperless: mockUsePaperless,
}));

// Mock paperlessApi (for DocumentCard thumbnail URLs)
jest.unstable_mockModule('../../lib/paperlessApi.js', () => ({
  getPaperlessStatus: jest.fn(),
  listPaperlessDocuments: jest.fn(),
  listPaperlessTags: jest.fn(),
  getPaperlessDocument: jest.fn(),
  getDocumentThumbnailUrl: (id: number) => `/api/paperless/documents/${id}/thumb`,
  getDocumentPreviewUrl: (id: number) => `/api/paperless/documents/${id}/preview`,
}));

// Mock LocaleContext — DocumentBrowser (or a descendant it renders) uses useLocale().
jest.unstable_mockModule('../../contexts/LocaleContext.js', () => ({
  useLocale: jest.fn(() => ({
    locale: 'en' as const,
    resolvedLocale: 'en' as const,
    currency: 'EUR',
    setLocale: jest.fn(),
    syncWithServer: jest.fn(),
  })),
  LocaleProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Deferred type import — must appear AFTER jest.unstable_mockModule calls to ensure mock
// registration happens before module resolution. See usePaperless.test.tsx for the same pattern.
import type * as DocumentBrowserModule from './DocumentBrowser.js';

let DocumentBrowser: (typeof DocumentBrowserModule)['DocumentBrowser'];

const makeDoc = (id: number, title = `Document ${id}`) => ({
  id,
  title,
  content: `Content for doc ${id}`,
  tags: [],
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

const makeHook = (overrides: Partial<UsePaperlessResult> = {}): UsePaperlessResult => ({
  status: { configured: true, reachable: true, error: null, paperlessUrl: null, filterTag: null },
  documents: [makeDoc(1), makeDoc(2)],
  tags: [],
  listStatus: 'done',
  hasMore: false,
  lastBatchCount: 2,
  fetchSequence: 1,
  sentinelRef: jest.fn(),
  loadMore: jest.fn(),
  retry: jest.fn(),
  error: null,
  query: '',
  selectedTags: [],
  tagCountMap: new Map(),
  resetKey: '|||0',
  search: jest.fn(),
  toggleTag: jest.fn(),
  setCorrespondent: jest.fn(),
  refresh: jest.fn(),
  ...overrides,
});

beforeEach(async () => {
  ({ DocumentBrowser } = (await import('./DocumentBrowser.js')) as typeof DocumentBrowserModule);
  mockUsePaperless.mockReset();
  mockUsePaperless.mockReturnValue(makeHook());
});

describe('DocumentBrowser', () => {
  describe('status states', () => {
    it('renders checking connection state when status is null', () => {
      mockUsePaperless.mockReturnValue(makeHook({ status: null, listStatus: 'loading' }));
      render(<DocumentBrowser />);
      expect(screen.getByText(/Checking Paperless-ngx connection/i)).toBeInTheDocument();
    });

    it('renders not configured state when configured=false', () => {
      mockUsePaperless.mockReturnValue(
        makeHook({
          status: {
            configured: false,
            reachable: false,
            error: null,
            paperlessUrl: null,
            filterTag: null,
          },
        }),
      );
      render(<DocumentBrowser />);
      expect(screen.getByText(/Paperless-ngx Not Configured/i)).toBeInTheDocument();
      expect(screen.getByText(/PAPERLESS_URL/)).toBeInTheDocument();
      expect(screen.getByText(/PAPERLESS_API_TOKEN/)).toBeInTheDocument();
    });

    it('renders unreachable state when configured=true but reachable=false', () => {
      mockUsePaperless.mockReturnValue(
        makeHook({
          status: {
            configured: true,
            reachable: false,
            error: null,
            paperlessUrl: null,
            filterTag: null,
          },
        }),
      );
      render(<DocumentBrowser />);
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/Paperless-ngx Unreachable/i)).toBeInTheDocument();
    });

    it('renders Try Again button in unreachable state', () => {
      const refresh = jest.fn();
      mockUsePaperless.mockReturnValue(
        makeHook({
          status: {
            configured: true,
            reachable: false,
            error: null,
            paperlessUrl: null,
            filterTag: null,
          },
          refresh,
        }),
      );
      render(<DocumentBrowser />);
      fireEvent.click(screen.getByRole('button', { name: /try again/i }));
      expect(refresh).toHaveBeenCalledTimes(1);
    });
  });

  describe('search bar', () => {
    it('renders search input with aria-label', () => {
      render(<DocumentBrowser />);
      expect(screen.getByRole('searchbox', { name: /search documents/i })).toBeInTheDocument();
    });

    it('calls hook.search after debounce when typing', async () => {
      jest.useFakeTimers();
      const search = jest.fn();
      mockUsePaperless.mockReturnValue(makeHook({ search }));
      render(<DocumentBrowser />);

      fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'invoice' } });
      act(() => {
        jest.advanceTimersByTime(350);
      });

      await waitFor(() => expect(search).toHaveBeenCalledWith('invoice'));
      jest.useRealTimers();
    });
  });

  describe('tag filter strip', () => {
    it('does not render tag strip when tags array is empty', () => {
      mockUsePaperless.mockReturnValue(makeHook({ tags: [] }));
      render(<DocumentBrowser />);
      expect(screen.queryByRole('group', { name: /filter by tag/i })).not.toBeInTheDocument();
    });

    it('renders tag strip with role="group" when tags exist', () => {
      mockUsePaperless.mockReturnValue(
        makeHook({
          tags: [
            { id: 1, name: 'Invoice', color: null, documentCount: 5 },
            { id: 2, name: 'Receipt', color: null, documentCount: 3 },
          ],
        }),
      );
      render(<DocumentBrowser />);
      expect(screen.getByRole('group', { name: /filter by tag/i })).toBeInTheDocument();
    });

    it('renders tag chips with role="checkbox" and aria-checked', () => {
      mockUsePaperless.mockReturnValue(
        makeHook({
          tags: [{ id: 1, name: 'Invoice', color: null, documentCount: 5 }],
          selectedTags: [],
        }),
      );
      render(<DocumentBrowser />);
      const chip = screen.getByRole('checkbox', {
        name: /Filter by tag: Invoice \(5 documents\)/i,
      });
      expect(chip).toHaveAttribute('aria-checked', 'false');
    });

    it('renders selected tag chips with aria-checked=true', () => {
      mockUsePaperless.mockReturnValue(
        makeHook({
          tags: [{ id: 1, name: 'Invoice', color: null, documentCount: 5 }],
          selectedTags: [1],
        }),
      );
      render(<DocumentBrowser />);
      const chip = screen.getByRole('checkbox', {
        name: /Filter by tag: Invoice \(5 documents\)/i,
      });
      expect(chip).toHaveAttribute('aria-checked', 'true');
    });

    it('calls toggleTag when tag chip is clicked', () => {
      const toggleTag = jest.fn();
      mockUsePaperless.mockReturnValue(
        makeHook({
          tags: [{ id: 1, name: 'Invoice', color: null, documentCount: 5 }],
          toggleTag,
        }),
      );
      render(<DocumentBrowser />);
      fireEvent.click(
        screen.getByRole('checkbox', { name: /Filter by tag: Invoice \(5 documents\)/i }),
      );
      expect(toggleTag).toHaveBeenCalledWith(1);
    });

    it('calls toggleTag on Enter key press', () => {
      const toggleTag = jest.fn();
      mockUsePaperless.mockReturnValue(
        makeHook({
          tags: [{ id: 1, name: 'Invoice', color: null, documentCount: 5 }],
          toggleTag,
        }),
      );
      render(<DocumentBrowser />);
      fireEvent.keyDown(
        screen.getByRole('checkbox', { name: /Filter by tag: Invoice \(5 documents\)/i }),
        { key: 'Enter' },
      );
      expect(toggleTag).toHaveBeenCalledWith(1);
    });
  });

  describe('loading state', () => {
    it('renders skeleton cards while the first batch is loading (no documents yet)', () => {
      mockUsePaperless.mockReturnValue(
        makeHook({ listStatus: 'loading', documents: [], fetchSequence: 0 }),
      );
      const { container } = render(<DocumentBrowser />);
      const skeletons = container.querySelectorAll('[aria-hidden="true"]');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('grid has aria-busy="true" while the first batch is loading', () => {
      mockUsePaperless.mockReturnValue(
        makeHook({ listStatus: 'loading', documents: [], fetchSequence: 0 }),
      );
      render(<DocumentBrowser />);
      const grid = screen.getByRole('list', { name: 'Documents' });
      expect(grid).toHaveAttribute('aria-busy', 'true');
    });
  });

  describe('error state', () => {
    it('renders error message with retry button when the first batch failed', () => {
      mockUsePaperless.mockReturnValue(
        makeHook({ error: 'Something went wrong', listStatus: 'error', documents: [] }),
      );
      render(<DocumentBrowser />);
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    });

    it('calls retry (re-requests the failed page, not refresh) when Try Again is clicked', () => {
      const retry = jest.fn();
      const refresh = jest.fn();
      mockUsePaperless.mockReturnValue(
        makeHook({ error: 'Error', listStatus: 'error', documents: [], retry, refresh }),
      );
      render(<DocumentBrowser />);
      fireEvent.click(screen.getByRole('button', { name: /try again/i }));
      expect(retry).toHaveBeenCalledTimes(1);
      expect(refresh).not.toHaveBeenCalled();
    });

    it('with documents already loaded, a failed later batch keeps the grid and shows the footer alert instead of the full-page error', () => {
      mockUsePaperless.mockReturnValue(makeHook({ error: 'later failure', listStatus: 'error' }));
      render(<DocumentBrowser />);
      expect(screen.getByRole('button', { name: /Document: Document 1/i })).toBeInTheDocument();
      expect(screen.getByRole('alert')).toHaveTextContent(/failed to load more/i);
      expect(screen.queryByText('later failure')).not.toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('renders "No documents found" when no docs and no query', () => {
      mockUsePaperless.mockReturnValue(makeHook({ documents: [], query: '', selectedTags: [] }));
      render(<DocumentBrowser />);
      expect(screen.getByText(/No documents found\./i)).toBeInTheDocument();
    });

    it('renders "No documents match" when query is active', () => {
      mockUsePaperless.mockReturnValue(makeHook({ documents: [], query: 'invoice' }));
      render(<DocumentBrowser />);
      expect(screen.getByText(/No documents match your search\./i)).toBeInTheDocument();
    });

    it('renders Clear Filters button when query is active in empty state', () => {
      mockUsePaperless.mockReturnValue(makeHook({ documents: [], query: 'invoice' }));
      render(<DocumentBrowser />);
      expect(screen.getByRole('button', { name: /Clear Filters/i })).toBeInTheDocument();
    });
  });

  describe('document grid', () => {
    it('renders document cards', () => {
      render(<DocumentBrowser />);
      expect(screen.getByRole('button', { name: /Document: Document 1/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Document: Document 2/i })).toBeInTheDocument();
    });

    it('grid container has role="list" and aria-label="Documents"', () => {
      render(<DocumentBrowser />);
      expect(screen.getByRole('list', { name: 'Documents' })).toBeInTheDocument();
    });

    it('each document card is wrapped in a role="listitem" element', () => {
      render(<DocumentBrowser />);
      const listItems = screen.getAllByRole('listitem');
      expect(listItems.length).toBeGreaterThanOrEqual(2);
    });

    it('grid has aria-busy="false" when documents are shown', () => {
      render(<DocumentBrowser />);
      const grid = screen.getByRole('list', { name: 'Documents' });
      expect(grid).toHaveAttribute('aria-busy', 'false');
    });

    it('search input has aria-controls pointing to document-grid', () => {
      render(<DocumentBrowser />);
      const searchInput = screen.getByRole('searchbox', { name: /search documents/i });
      expect(searchInput).toHaveAttribute('aria-controls', 'document-grid');
    });

    it('shows detail panel when card is clicked (page mode)', () => {
      render(<DocumentBrowser mode="page" />);
      fireEvent.click(screen.getByRole('button', { name: /Document: Document 1/i }));
      expect(screen.getByRole('region', { name: /Details for Document 1/i })).toBeInTheDocument();
    });

    it('closes detail panel when close button is clicked', () => {
      render(<DocumentBrowser mode="page" />);
      fireEvent.click(screen.getByRole('button', { name: /Document: Document 1/i }));
      fireEvent.click(screen.getByRole('button', { name: /close document details/i }));
      expect(
        screen.queryByRole('region', { name: /Details for Document 1/i }),
      ).not.toBeInTheDocument();
    });

    it('toggles detail panel when same card is clicked twice', () => {
      render(<DocumentBrowser mode="page" />);
      fireEvent.click(screen.getByRole('button', { name: /Document: Document 1/i }));
      expect(screen.getByRole('region', { name: /Details for Document 1/i })).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /Document: Document 1/i }));
      expect(
        screen.queryByRole('region', { name: /Details for Document 1/i }),
      ).not.toBeInTheDocument();
    });

    it('calls onSelect callback instead of showing detail panel in modal mode', () => {
      const onSelect = jest.fn();
      render(<DocumentBrowser mode="modal" onSelect={onSelect} />);
      fireEvent.click(screen.getByRole('button', { name: /Document: Document 1/i }));
      expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
      expect(
        screen.queryByRole('region', { name: /Details for Document 1/i }),
      ).not.toBeInTheDocument();
    });

    it('passes paperlessUrl from status to detail panel as paperlessBaseUrl', () => {
      mockUsePaperless.mockReturnValue(
        makeHook({
          status: {
            configured: true,
            reachable: true,
            error: null,
            paperlessUrl: 'https://paperless.example.com',
            filterTag: null,
          },
        }),
      );
      render(<DocumentBrowser mode="page" />);
      fireEvent.click(screen.getByRole('button', { name: /Document: Document 1/i }));
      const link = screen.getByRole('link', {
        name: /View in Paperless/i,
      }) as HTMLAnchorElement;
      expect(link).toBeInTheDocument();
      expect(link.href).toContain('https://paperless.example.com/documents/1/details');
    });

    it('does not show View in Paperless link when paperlessUrl is null', () => {
      mockUsePaperless.mockReturnValue(
        makeHook({
          status: {
            configured: true,
            reachable: true,
            error: null,
            paperlessUrl: null,
            filterTag: null,
          },
        }),
      );
      render(<DocumentBrowser mode="page" />);
      fireEvent.click(screen.getByRole('button', { name: /Document: Document 1/i }));
      expect(screen.queryByRole('link', { name: /View in Paperless/i })).not.toBeInTheDocument();
    });
  });

  describe('filter tag banner', () => {
    it('does not render filter banner when filterTag is null', () => {
      mockUsePaperless.mockReturnValue(
        makeHook({
          status: {
            configured: true,
            reachable: true,
            error: null,
            paperlessUrl: null,
            filterTag: null,
          },
        }),
      );
      render(<DocumentBrowser />);
      expect(screen.queryByRole('note')).not.toBeInTheDocument();
    });

    it('renders filter banner with role="note" when filterTag is set', () => {
      mockUsePaperless.mockReturnValue(
        makeHook({
          status: {
            configured: true,
            reachable: true,
            error: null,
            paperlessUrl: null,
            filterTag: 'invoice',
          },
        }),
      );
      render(<DocumentBrowser />);
      expect(screen.getByRole('note')).toBeInTheDocument();
      expect(screen.getByText(/invoice/i)).toBeInTheDocument();
    });

    it('renders filter banner with different tag name', () => {
      mockUsePaperless.mockReturnValue(
        makeHook({
          status: {
            configured: true,
            reachable: true,
            error: null,
            paperlessUrl: null,
            filterTag: 'contract',
          },
        }),
      );
      render(<DocumentBrowser />);
      expect(screen.getByRole('note')).toBeInTheDocument();
      expect(screen.getByText(/contract/i)).toBeInTheDocument();
    });
  });

  describe('hide linked documents (#1369)', () => {
    it('renders the hide-linked checkbox when linkedDocumentIds is an empty array (#1679: condition is !== undefined)', () => {
      mockUsePaperless.mockReturnValue(makeHook());
      render(<DocumentBrowser linkedDocumentIds={[]} />);
      // Story #1679 changed the condition from linkedDocumentIds.length > 0 to
      // linkedDocumentIds !== undefined, so passing [] still shows the toggle.
      expect(screen.getByRole('checkbox')).toBeInTheDocument();
    });

    it('renders the hide-linked checkbox when linkedDocumentIds has entries', () => {
      mockUsePaperless.mockReturnValue(makeHook());
      render(<DocumentBrowser linkedDocumentIds={[1, 2]} />);
      expect(screen.getByRole('checkbox')).toBeInTheDocument();
    });

    it('hide-linked checkbox is unchecked by default', () => {
      mockUsePaperless.mockReturnValue(makeHook());
      render(<DocumentBrowser linkedDocumentIds={[1, 2]} />);
      expect(screen.getByRole('checkbox')).not.toBeChecked();
    });

    it('checkbox label text is "Hide already-linked documents"', () => {
      mockUsePaperless.mockReturnValue(makeHook());
      render(<DocumentBrowser linkedDocumentIds={[1, 2]} />);
      expect(screen.getByText('Hide already-linked documents')).toBeInTheDocument();
    });

    it('all documents are visible when checkbox is unchecked', () => {
      mockUsePaperless.mockReturnValue(makeHook({ documents: [makeDoc(1), makeDoc(2)] }));
      render(<DocumentBrowser linkedDocumentIds={[1, 2]} />);
      // Both docs should be visible
      expect(screen.getByRole('button', { name: /Document: Document 1/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Document: Document 2/i })).toBeInTheDocument();
    });

    it('filters out linked documents when checkbox is checked', () => {
      mockUsePaperless.mockReturnValue(makeHook({ documents: [makeDoc(1), makeDoc(2)] }));
      render(<DocumentBrowser linkedDocumentIds={[1, 2]} />);

      fireEvent.click(screen.getByRole('checkbox'));

      expect(
        screen.queryByRole('button', { name: /Document: Document 1/i }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /Document: Document 2/i }),
      ).not.toBeInTheDocument();
    });

    it('shows all documents again when checkbox is unchecked after being checked', () => {
      mockUsePaperless.mockReturnValue(makeHook({ documents: [makeDoc(1), makeDoc(2)] }));
      render(<DocumentBrowser linkedDocumentIds={[1, 2]} />);

      const checkbox = screen.getByRole('checkbox');
      fireEvent.click(checkbox); // check
      fireEvent.click(checkbox); // uncheck

      expect(screen.getByRole('button', { name: /Document: Document 1/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Document: Document 2/i })).toBeInTheDocument();
    });

    it('only filters documents whose ids are in linkedDocumentIds', () => {
      mockUsePaperless.mockReturnValue(
        makeHook({ documents: [makeDoc(1), makeDoc(2), makeDoc(3)] }),
      );
      render(<DocumentBrowser linkedDocumentIds={[1]} />);

      fireEvent.click(screen.getByRole('checkbox'));

      expect(
        screen.queryByRole('button', { name: /Document: Document 1/i }),
      ).not.toBeInTheDocument();
      // Docs 2 and 3 are not linked — still visible
      expect(screen.getByRole('button', { name: /Document: Document 2/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Document: Document 3/i })).toBeInTheDocument();
    });

    it('shows "no additional documents" empty state when all docs are linked and checkbox is checked', () => {
      mockUsePaperless.mockReturnValue(makeHook({ documents: [makeDoc(1), makeDoc(2)] }));
      render(<DocumentBrowser linkedDocumentIds={[1, 2]} />);

      fireEvent.click(screen.getByRole('checkbox'));

      expect(screen.getByText(/No additional documents/i)).toBeInTheDocument();
    });
  });

  describe('defaultHideLinked prop (#1679)', () => {
    it('checkbox is shown when linkedDocumentIds is an empty array', () => {
      mockUsePaperless.mockReturnValue(makeHook());
      render(<DocumentBrowser linkedDocumentIds={[]} />);
      // Story #1679: toggle condition is `linkedDocumentIds !== undefined`, so [] shows the toggle.
      expect(screen.queryByRole('checkbox')).toBeInTheDocument();
    });

    it('checkbox IS shown when linkedDocumentIds prop is absent (default = EMPTY_LINKED_DOCUMENT_IDS = [])', () => {
      mockUsePaperless.mockReturnValue(makeHook());
      render(<DocumentBrowser />);
      // No linkedDocumentIds prop → component default = EMPTY_LINKED_DOCUMENT_IDS ([]).
      // Condition is `linkedDocumentIds !== undefined` — [] !== undefined is true, so
      // the checkbox renders. Story #1679: the toggle is always present when the prop
      // is accepted (caller opts in by not omitting the prop type).
      expect(screen.getByRole('checkbox')).toBeInTheDocument();
    });

    it('hide-linked checkbox starts checked when defaultHideLinked=true', () => {
      mockUsePaperless.mockReturnValue(makeHook({ documents: [makeDoc(1), makeDoc(2)] }));
      render(<DocumentBrowser linkedDocumentIds={[1, 2]} defaultHideLinked={true} />);
      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toBeChecked();
    });

    it('hide-linked checkbox starts unchecked when defaultHideLinked=false (default)', () => {
      mockUsePaperless.mockReturnValue(makeHook({ documents: [makeDoc(1), makeDoc(2)] }));
      render(<DocumentBrowser linkedDocumentIds={[1, 2]} defaultHideLinked={false} />);
      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).not.toBeChecked();
    });

    it('linked documents are immediately filtered when defaultHideLinked=true', () => {
      mockUsePaperless.mockReturnValue(
        makeHook({ documents: [makeDoc(1), makeDoc(2), makeDoc(3)] }),
      );
      render(<DocumentBrowser linkedDocumentIds={[1, 2]} defaultHideLinked={true} />);

      // Docs 1 and 2 should be filtered out from the start (no click needed)
      expect(
        screen.queryByRole('button', { name: /Document: Document 1/i }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /Document: Document 2/i }),
      ).not.toBeInTheDocument();
      // Doc 3 is unlinked, stays visible
      expect(screen.getByRole('button', { name: /Document: Document 3/i })).toBeInTheDocument();
    });

    it('all documents visible when defaultHideLinked=true but no linkedDocumentIds match', () => {
      mockUsePaperless.mockReturnValue(makeHook({ documents: [makeDoc(1), makeDoc(2)] }));
      // The linked ids don't overlap with displayed docs
      render(<DocumentBrowser linkedDocumentIds={[99, 100]} defaultHideLinked={true} />);

      // Nothing filtered out — docs 1 and 2 remain visible
      expect(screen.getByRole('button', { name: /Document: Document 1/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Document: Document 2/i })).toBeInTheDocument();
    });
  });

  describe('infinite scroll rendering', () => {
    it('does not render any pager: no navigation role, no "Page N of M", no Previous/Next', () => {
      mockUsePaperless.mockReturnValue(makeHook({ listStatus: 'idle', hasMore: true }));
      render(<DocumentBrowser />);
      expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
      expect(screen.queryByText(/page \d+ of/i)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /previous|next/i })).not.toBeInTheDocument();
    });

    it('renders the footer with a Load more button when idle and hasMore', () => {
      const loadMore = jest.fn();
      mockUsePaperless.mockReturnValue(makeHook({ listStatus: 'idle', hasMore: true, loadMore }));
      render(<DocumentBrowser />);
      expect(screen.getByTestId('paperless-documents-footer')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('paperless-documents-load-more-button'));
      expect(loadMore).toHaveBeenCalledTimes(1);
    });

    it('wires the hook sentinelRef to the footer sentinel', () => {
      const sentinelRef = jest.fn();
      mockUsePaperless.mockReturnValue(
        makeHook({ listStatus: 'idle', hasMore: true, sentinelRef }),
      );
      render(<DocumentBrowser />);
      expect(sentinelRef).toHaveBeenCalledWith(screen.getByTestId('paperless-documents-sentinel'));
    });

    it('shows the end-of-list message when the list is done', () => {
      mockUsePaperless.mockReturnValue(makeHook({ listStatus: 'done', hasMore: false }));
      render(<DocumentBrowser />);
      expect(screen.getByTestId('paperless-documents-end-of-list')).toBeInTheDocument();
    });

    it('footer Retry calls hook.retry when a later batch failed', () => {
      const retry = jest.fn();
      mockUsePaperless.mockReturnValue(
        makeHook({ listStatus: 'error', hasMore: true, retry, error: 'x' }),
      );
      render(<DocumentBrowser />);
      fireEvent.click(screen.getByTestId('paperless-documents-load-more-button'));
      expect(retry).toHaveBeenCalledTimes(1);
    });

    it('renders no footer in the empty state (AC14)', () => {
      mockUsePaperless.mockReturnValue(makeHook({ documents: [], fetchSequence: 1 }));
      render(<DocumentBrowser />);
      expect(screen.queryByTestId('paperless-documents-footer')).not.toBeInTheDocument();
    });

    it('auto-advances (calls loadMore) when every loaded document is hidden and more remain (AC11)', () => {
      const loadMore = jest.fn();
      mockUsePaperless.mockReturnValue(
        makeHook({
          listStatus: 'idle',
          hasMore: true,
          loadMore,
          documents: [makeDoc(1), makeDoc(2)],
        }),
      );
      render(<DocumentBrowser linkedDocumentIds={[1, 2]} defaultHideLinked />);
      expect(loadMore).toHaveBeenCalled();
    });

    it('does not auto-advance when something is visible', () => {
      const loadMore = jest.fn();
      mockUsePaperless.mockReturnValue(makeHook({ listStatus: 'idle', hasMore: true, loadMore }));
      render(<DocumentBrowser linkedDocumentIds={[1]} defaultHideLinked />);
      expect(loadMore).not.toHaveBeenCalled();
    });

    it('does not auto-advance while a fetch is loading or when no more remain', () => {
      const loadMore = jest.fn();
      mockUsePaperless.mockReturnValue(
        makeHook({ listStatus: 'loading', hasMore: true, loadMore }),
      );
      const { unmount } = render(<DocumentBrowser linkedDocumentIds={[1, 2]} defaultHideLinked />);
      unmount();
      mockUsePaperless.mockReturnValue(makeHook({ listStatus: 'done', hasMore: false, loadMore }));
      render(<DocumentBrowser linkedDocumentIds={[1, 2]} defaultHideLinked />);
      expect(loadMore).not.toHaveBeenCalled();
    });

    it('forwards the correspondentId prop to hook.setCorrespondent', () => {
      const setCorrespondent = jest.fn();
      mockUsePaperless.mockReturnValue(makeHook({ setCorrespondent }));
      const { rerender } = render(<DocumentBrowser correspondentId={5} />);
      expect(setCorrespondent).toHaveBeenLastCalledWith(5);
      rerender(<DocumentBrowser correspondentId={null} />);
      expect(setCorrespondent).toHaveBeenLastCalledWith(null);
    });

    it('passes a scrollRoot (nearest scrollable ancestor) to usePaperless', () => {
      const scroller = document.createElement('div');
      scroller.style.overflowY = 'auto';
      document.body.appendChild(scroller);
      render(<DocumentBrowser />, {
        container: scroller.appendChild(document.createElement('div')),
      });
      const calls = mockUsePaperless.mock.calls as unknown as [{ scrollRoot: Element | null }][];
      expect(calls[calls.length - 1]![0].scrollRoot).toBe(scroller);
      scroller.remove();
    });

    it('resets the scroll container to the top when resetKey changes, but not on first render', () => {
      const scroller = document.createElement('div');
      scroller.style.overflowY = 'auto';
      document.body.appendChild(scroller);
      mockUsePaperless.mockReturnValue(makeHook({ resetKey: 'a' }));
      const { rerender } = render(<DocumentBrowser />, {
        container: scroller.appendChild(document.createElement('div')),
      });
      scroller.scrollTop = 120;
      rerender(<DocumentBrowser />);
      expect(scroller.scrollTop).toBe(120);

      mockUsePaperless.mockReturnValue(makeHook({ resetKey: 'b' }));
      rerender(<DocumentBrowser />);
      expect(scroller.scrollTop).toBe(0);
      scroller.remove();
    });

    it('scrolls the browser into view on reset when the viewport scrolls and the browser is above the fold', () => {
      const scrollIntoView = jest.fn();
      const original = Element.prototype.scrollIntoView;
      Element.prototype.scrollIntoView = scrollIntoView;
      const rectSpy = jest
        .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
        .mockReturnValue({ top: -50 } as DOMRect);
      mockUsePaperless.mockReturnValue(makeHook({ resetKey: 'a' }));
      const { rerender } = render(<DocumentBrowser />);
      expect(scrollIntoView).not.toHaveBeenCalled();

      mockUsePaperless.mockReturnValue(makeHook({ resetKey: 'b' }));
      rerender(<DocumentBrowser />);
      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start' });

      rectSpy.mockRestore();
      Element.prototype.scrollIntoView = original;
    });

    it('clear filters resets the search query', () => {
      const search = jest.fn();
      mockUsePaperless.mockReturnValue(makeHook({ documents: [], query: 'invoice', search }));
      render(<DocumentBrowser />);
      fireEvent.click(screen.getByRole('button', { name: /Clear Filters/i }));
      expect(search).toHaveBeenCalledWith('');
    });
  });
});
