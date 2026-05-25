/**
 * Tests for the `onItemize` prop / auto-itemize routing behaviour added in Story #1564.
 * Split from LinkedDocumentsSection.test.tsx to avoid OOM in Jest workers (the parent
 * file was already near the heap-exhaustion threshold; adding these tests pushed it over).
 */

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { jest } from '@jest/globals';
import type {
  UseDocumentLinksResult,
  UseAllLinkedDocumentIdsResult,
} from '../../hooks/useDocumentLinks.js';
import type { DocumentLinkWithMetadata, PaperlessDocumentSearchResult } from '@cornerstone/shared';

// ─── Mock: useDocumentLinks hook ─────────────────────────────────────────────

const mockUseDocumentLinks = jest.fn<() => UseDocumentLinksResult>();
const mockUseAllLinkedDocumentIds = jest.fn<() => UseAllLinkedDocumentIdsResult>();

jest.unstable_mockModule('../../hooks/useDocumentLinks.js', () => ({
  useDocumentLinks: mockUseDocumentLinks,
  useAllLinkedDocumentIds: mockUseAllLinkedDocumentIds,
}));

// ─── Mock: paperlessApi (for getPaperlessStatus) ──────────────────────────────

const mockGetPaperlessStatus = jest.fn<() => Promise<unknown>>();

jest.unstable_mockModule('../../lib/paperlessApi.js', () => ({
  getPaperlessStatus: mockGetPaperlessStatus,
  listPaperlessDocuments: jest.fn(),
  listPaperlessTags: jest.fn(),
  getPaperlessDocument: jest.fn(),
  getDocumentThumbnailUrl: (id: number) => `/api/paperless/documents/${id}/thumb`,
  getDocumentPreviewUrl: (id: number) => `/api/paperless/documents/${id}/preview`,
}));

// ─── Mock: apiClient (needed by LinkedDocumentsSection) ──────────────────────

jest.unstable_mockModule('../../lib/apiClient.js', () => ({
  get: jest.fn(),
  post: jest.fn(),
  patch: jest.fn(),
  del: jest.fn(),
  put: jest.fn(),
  setBaseUrl: jest.fn(),
  getBaseUrl: jest.fn().mockReturnValue('/api'),
  ApiClientError: class MockApiClientError extends Error {
    statusCode: number;
    error: { code: string; message?: string };
    constructor(statusCode: number, error: { code: string; message?: string }) {
      super(error.message ?? 'API Error');
      this.statusCode = statusCode;
      this.error = error;
    }
  },
  NetworkError: class MockNetworkError extends Error {},
}));

// ─── Mock: configApi (for auto-itemize enabled flag) ─────────────────────────

const mockFetchConfig = jest.fn<() => Promise<unknown>>();

jest.unstable_mockModule('../../lib/configApi.js', () => ({
  fetchConfig: mockFetchConfig,
}));

// ─── Mock: react-router-dom useNavigate ──────────────────────────────────────

const mockNavigate = jest.fn();

jest.unstable_mockModule('react-router-dom', async () => {
  const actual = await import('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// ─── Mock: child components (to avoid transitive dependency issues) ───────────

// Capture onItemize prop for assertions
let capturedOnItemize: ((link: DocumentLinkWithMetadata) => void) | undefined;

jest.unstable_mockModule('./DocumentBrowser.js', () => ({
  DocumentBrowser: function MockDocumentBrowser(props: {
    onSelect?: (doc: PaperlessDocumentSearchResult) => void;
    mode?: string;
    linkedDocumentIds?: number[];
  }) {
    const mockDoc: PaperlessDocumentSearchResult = {
      id: 99,
      title: 'Test Doc',
      content: null,
      tags: [],
      created: '2026-01-15',
      added: null,
      modified: null,
      correspondent: null,
      documentType: null,
      archiveSerialNumber: null,
      originalFileName: null,
      pageCount: null,
      searchHit: null,
    };
    return <div data-testid="document-browser" onClick={() => props.onSelect?.(mockDoc)} />;
  },
}));

jest.unstable_mockModule('./DocumentDetailPanel.js', () => ({
  DocumentDetailPanel: function MockDocumentDetailPanel(props: { onClose?: () => void }) {
    return <div data-testid="document-detail-panel" onClick={props.onClose} />;
  },
}));

jest.unstable_mockModule('./DocumentSkeleton.js', () => ({
  DocumentSkeleton: function MockDocumentSkeleton() {
    return <div data-testid="document-skeleton" />;
  },
}));

jest.unstable_mockModule('./LinkedDocumentCard.js', () => ({
  LinkedDocumentCard: function MockLinkedDocumentCard(props: {
    link: DocumentLinkWithMetadata;
    onView?: (link: DocumentLinkWithMetadata) => void;
    onUnlink?: (link: DocumentLinkWithMetadata) => void;
    onItemize?: (link: DocumentLinkWithMetadata) => void;
  }) {
    capturedOnItemize = props.onItemize;
    return (
      <div data-testid={`linked-card-${props.link.id}`}>
        <button onClick={() => props.onView?.(props.link)}>View {props.link.id}</button>
        <button onClick={() => props.onUnlink?.(props.link)}>Unlink {props.link.id}</button>
        {props.onItemize && (
          <button onClick={() => props.onItemize!(props.link)}>Itemize {props.link.id}</button>
        )}
      </div>
    );
  },
}));

// ─── Type imports ─────────────────────────────────────────────────────────────

import type * as LinkedDocumentsSectionModule from './LinkedDocumentsSection.js';

let LinkedDocumentsSection: (typeof LinkedDocumentsSectionModule)['LinkedDocumentsSection'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const makeHook = (overrides: Partial<UseDocumentLinksResult> = {}): UseDocumentLinksResult => ({
  links: [],
  isLoading: false,
  error: null,
  addLink: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  removeLink: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  refresh: jest.fn(),
  ...overrides,
});

const makeAllLinkedIdsHook = (
  overrides: Partial<UseAllLinkedDocumentIdsResult> = {},
): UseAllLinkedDocumentIdsResult => ({
  ids: [],
  isLoading: false,
  error: null,
  fetch: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  ...overrides,
});

const makeInvoiceLink = (id: string): DocumentLinkWithMetadata => ({
  id,
  entityType: 'invoice',
  entityId: 'inv-xyz',
  paperlessDocumentId: 42,
  createdBy: null,
  createdAt: '2026-01-01T00:00:00Z',
  document: {
    id: 42,
    title: `Document ${id}`,
    content: null,
    tags: [],
    created: '2026-01-15',
    added: null,
    modified: null,
    correspondent: null,
    documentType: null,
    archiveSerialNumber: null,
    originalFileName: null,
    pageCount: null,
  },
});

const makeLink = (id: string): DocumentLinkWithMetadata => ({
  id,
  entityType: 'work_item',
  entityId: 'wi-abc',
  paperlessDocumentId: 42,
  createdBy: null,
  createdAt: '2026-01-01T00:00:00Z',
  document: {
    id: 42,
    title: `Document ${id}`,
    content: null,
    tags: [],
    created: '2026-01-15',
    added: null,
    modified: null,
    correspondent: null,
    documentType: null,
    archiveSerialNumber: null,
    originalFileName: null,
    pageCount: null,
  },
});

const makeConfiguredStatus = (overrides = {}) => ({
  configured: true,
  reachable: true,
  error: null,
  paperlessUrl: null,
  ...overrides,
});

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(async () => {
  ({ LinkedDocumentsSection } =
    (await import('./LinkedDocumentsSection.js')) as typeof LinkedDocumentsSectionModule);

  mockUseDocumentLinks.mockReset();
  mockUseAllLinkedDocumentIds.mockReset();
  mockGetPaperlessStatus.mockReset();
  mockFetchConfig.mockReset();
  mockNavigate.mockReset();
  capturedOnItemize = undefined;

  // Default: configured paperless, no links, auto-itemize disabled
  mockUseDocumentLinks.mockReturnValue(makeHook());
  mockUseAllLinkedDocumentIds.mockReturnValue(makeAllLinkedIdsHook());
  mockGetPaperlessStatus.mockResolvedValue(makeConfiguredStatus());
  mockFetchConfig.mockResolvedValue({ autoItemizeEnabled: false, currency: 'EUR' });
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('LinkedDocumentsSection — onItemize callback', () => {
  it('passes onItemize to LinkedDocumentCard when entityType=invoice AND autoItemizeEnabled=true', async () => {
    mockFetchConfig.mockResolvedValue({ autoItemizeEnabled: true, currency: 'EUR' });
    mockUseDocumentLinks.mockReturnValue(
      makeHook({ links: [makeInvoiceLink('link-inv-1')], isLoading: false }),
    );

    render(<LinkedDocumentsSection entityType="invoice" entityId="inv-xyz" />);

    // Wait for config to load and cards to render
    await waitFor(() =>
      expect(screen.getByTestId('linked-card-link-inv-1')).toBeInTheDocument(),
    );
    await waitFor(() => expect(capturedOnItemize).toBeDefined());

    expect(capturedOnItemize).toBeDefined();
  });

  it('does NOT pass onItemize when entityType=invoice but autoItemizeEnabled=false', async () => {
    mockFetchConfig.mockResolvedValue({ autoItemizeEnabled: false, currency: 'EUR' });
    mockUseDocumentLinks.mockReturnValue(
      makeHook({ links: [makeInvoiceLink('link-inv-2')], isLoading: false }),
    );

    render(<LinkedDocumentsSection entityType="invoice" entityId="inv-xyz" />);

    await waitFor(() =>
      expect(screen.getByTestId('linked-card-link-inv-2')).toBeInTheDocument(),
    );
    await waitFor(() => expect(mockFetchConfig).toHaveBeenCalled());

    // Give config time to load
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(capturedOnItemize).toBeUndefined();
  });

  it('does NOT pass onItemize when entityType=work_item even if autoItemizeEnabled=true', async () => {
    mockFetchConfig.mockResolvedValue({ autoItemizeEnabled: true, currency: 'EUR' });
    mockUseDocumentLinks.mockReturnValue(
      makeHook({ links: [makeLink('link-wi-1')], isLoading: false }),
    );

    render(<LinkedDocumentsSection entityType="work_item" entityId="wi-abc" />);

    await waitFor(() =>
      expect(screen.getByTestId('linked-card-link-wi-1')).toBeInTheDocument(),
    );
    await waitFor(() => expect(mockFetchConfig).toHaveBeenCalled());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(capturedOnItemize).toBeUndefined();
  });

  it('clicking Itemize button navigates to auto-itemize page', async () => {
    mockFetchConfig.mockResolvedValue({ autoItemizeEnabled: true, currency: 'EUR' });
    const invoiceLink = makeInvoiceLink('link-inv-3');
    mockUseDocumentLinks.mockReturnValue(
      makeHook({ links: [invoiceLink], isLoading: false }),
    );

    render(<LinkedDocumentsSection entityType="invoice" entityId="inv-xyz" />);

    await waitFor(() =>
      expect(screen.getByTestId('linked-card-link-inv-3')).toBeInTheDocument(),
    );
    await waitFor(() => expect(capturedOnItemize).toBeDefined());

    // Click the Itemize button exposed by mock
    fireEvent.click(screen.getByRole('button', { name: /Itemize link-inv-3/i }));

    expect(mockNavigate).toHaveBeenCalledWith(
      `/budget/invoices/inv-xyz/auto-itemize/${invoiceLink.document!.id}`,
    );
  });
});
