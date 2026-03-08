import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

const makePagination = (page = 1, totalPages = 1, totalItems = 2) => ({
  page,
  pageSize: 25,
  totalItems,
  totalPages,
});

const makeHook = (overrides: Partial<UsePaperlessResult> = {}): UsePaperlessResult => ({
  status: { configured: true, reachable: true, error: null, paperlessUrl: null, filterTag: null },
  documents: [makeDoc(1), makeDoc(2)],
  tags: [],
  pagination: makePagination(),
  isLoading: false,
  error: null,
  query: '',
  selectedTags: [],
  search: jest.fn(),
  toggleTag: jest.fn(),
  setPage: jest.fn(),
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
      mockUsePaperless.mockReturnValue(makeHook({ status: null, isLoading: true }));
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
      jest.advanceTimersByTime(350);

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
    it('renders skeleton cards when isLoading=true', () => {
      mockUsePaperless.mockReturnValue(makeHook({ isLoading: true }));
      const { container } = render(<DocumentBrowser />);
      const skeletons = container.querySelectorAll('[aria-hidden="true"]');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('grid has aria-busy="true" when isLoading=true', () => {
      mockUsePaperless.mockReturnValue(makeHook({ isLoading: true }));
      render(<DocumentBrowser />);
      const grid = screen.getByRole('list', { name: 'Documents' });
      expect(grid).toHaveAttribute('aria-busy', 'true');
    });
  });

  describe('error state', () => {
    it('renders error message with retry button when error is set', () => {
      const refresh = jest.fn();
      mockUsePaperless.mockReturnValue(
        makeHook({ error: 'Something went wrong', documents: [], refresh }),
      );
      render(<DocumentBrowser />);
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    });

    it('calls refresh when Try Again is clicked in error state', () => {
      const refresh = jest.fn();
      mockUsePaperless.mockReturnValue(makeHook({ error: 'Error', documents: [], refresh }));
      render(<DocumentBrowser />);
      fireEvent.click(screen.getByRole('button', { name: /try again/i }));
      expect(refresh).toHaveBeenCalledTimes(1);
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

  describe('pagination', () => {
    it('does not render pagination when totalPages <= 1', () => {
      mockUsePaperless.mockReturnValue(makeHook({ pagination: makePagination(1, 1, 2) }));
      render(<DocumentBrowser />);
      expect(
        screen.queryByRole('navigation', { name: /Document pagination/i }),
      ).not.toBeInTheDocument();
    });

    it('renders pagination nav when totalPages > 1', () => {
      mockUsePaperless.mockReturnValue(makeHook({ pagination: makePagination(1, 3, 75) }));
      render(<DocumentBrowser />);
      expect(screen.getByRole('navigation', { name: /Document pagination/i })).toBeInTheDocument();
    });

    it('renders current page info', () => {
      mockUsePaperless.mockReturnValue(makeHook({ pagination: makePagination(2, 5, 125) }));
      render(<DocumentBrowser />);
      expect(screen.getByText(/Page 2 of 5/i)).toBeInTheDocument();
    });

    it('calls setPage with page-1 when Previous is clicked', () => {
      const setPage = jest.fn();
      mockUsePaperless.mockReturnValue(
        makeHook({ pagination: makePagination(2, 5, 125), setPage }),
      );
      render(<DocumentBrowser />);
      fireEvent.click(screen.getByRole('button', { name: /previous page/i }));
      expect(setPage).toHaveBeenCalledWith(1);
    });

    it('calls setPage with page+1 when Next is clicked', () => {
      const setPage = jest.fn();
      mockUsePaperless.mockReturnValue(
        makeHook({ pagination: makePagination(2, 5, 125), setPage }),
      );
      render(<DocumentBrowser />);
      fireEvent.click(screen.getByRole('button', { name: /next page/i }));
      expect(setPage).toHaveBeenCalledWith(3);
    });

    it('disables Previous button on first page', () => {
      mockUsePaperless.mockReturnValue(makeHook({ pagination: makePagination(1, 3, 75) }));
      render(<DocumentBrowser />);
      expect(screen.getByRole('button', { name: /previous page/i })).toBeDisabled();
    });

    it('disables Next button on last page', () => {
      mockUsePaperless.mockReturnValue(makeHook({ pagination: makePagination(3, 3, 75) }));
      render(<DocumentBrowser />);
      expect(screen.getByRole('button', { name: /next page/i })).toBeDisabled();
    });
  });
});
