import { render, screen } from '@testing-library/react';
import { jest } from '@jest/globals';
import type { UsePaperlessResult } from '../../hooks/usePaperless.js';

// Mock usePaperless (used by DocumentBrowser inside DocumentsPage)
const mockUsePaperless = jest.fn<() => UsePaperlessResult>();

jest.unstable_mockModule('../../hooks/usePaperless.js', () => ({
  usePaperless: mockUsePaperless,
}));

// Mock paperlessApi (used by DocumentCard)
jest.unstable_mockModule('../../lib/paperlessApi.js', () => ({
  getPaperlessStatus: jest.fn(),
  listPaperlessDocuments: jest.fn(),
  listPaperlessTags: jest.fn(),
  getPaperlessDocument: jest.fn(),
  getDocumentThumbnailUrl: (id: number) => `/api/paperless/documents/${id}/thumb`,
  getDocumentPreviewUrl: (id: number) => `/api/paperless/documents/${id}/preview`,
}));

let DocumentsPage: (typeof import('./DocumentsPage.js'))['DocumentsPage'];

const makeHook = (overrides: Partial<UsePaperlessResult> = {}): UsePaperlessResult => ({
  status: { configured: true, reachable: true, error: null },
  documents: [],
  tags: [],
  pagination: null,
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
  ({ DocumentsPage } = await import('./DocumentsPage.js'));
  mockUsePaperless.mockReset();
  mockUsePaperless.mockReturnValue(makeHook());
});

describe('DocumentsPage', () => {
  it('renders Documents heading', () => {
    render(<DocumentsPage />);
    expect(screen.getByRole('heading', { name: /documents/i, level: 1 })).toBeInTheDocument();
  });

  it('renders search input for document search', () => {
    render(<DocumentsPage />);
    expect(screen.getByRole('searchbox', { name: /search documents/i })).toBeInTheDocument();
  });

  it('renders not-configured state when paperless is not set up', () => {
    mockUsePaperless.mockReturnValue(
      makeHook({ status: { configured: false, reachable: false, error: null } }),
    );
    render(<DocumentsPage />);
    expect(screen.getByText(/Paperless-ngx Not Configured/i)).toBeInTheDocument();
  });

  it('renders unreachable state when paperless cannot be reached', () => {
    mockUsePaperless.mockReturnValue(
      makeHook({ status: { configured: true, reachable: false, error: null } }),
    );
    render(<DocumentsPage />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/Paperless-ngx Unreachable/i)).toBeInTheDocument();
  });

  it('renders empty state when configured but no documents', () => {
    mockUsePaperless.mockReturnValue(makeHook({ documents: [], query: '', selectedTags: [] }));
    render(<DocumentsPage />);
    expect(screen.getByText(/No documents found/i)).toBeInTheDocument();
  });

  it('renders document cards when documents are available', () => {
    const doc = {
      id: 1,
      title: 'Contract 2025',
      content: null,
      tags: [],
      created: null,
      added: null,
      modified: null,
      correspondent: null,
      documentType: null,
      archiveSerialNumber: null,
      originalFileName: null,
      pageCount: null,
      searchHit: null,
    };
    mockUsePaperless.mockReturnValue(
      makeHook({
        documents: [doc],
        pagination: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1 },
      }),
    );
    render(<DocumentsPage />);
    expect(
      screen.getByRole('button', { name: /Document: Contract 2025/i }),
    ).toBeInTheDocument();
  });
});
