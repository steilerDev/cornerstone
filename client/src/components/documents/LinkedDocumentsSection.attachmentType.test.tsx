/**
 * Tests for attachment-type tagging behaviour added in Story #1877:
 * - The "Add Document" picker's attachment-type field (invoice only)
 * - Wiring of onAttachmentTypeChange / isUpdatingAttachmentType to LinkedDocumentCard
 * - Success/failure handling for retag/untag via handleAttachmentTypeChange
 *
 * Split from LinkedDocumentsSection.test.tsx following the onItemize precedent
 * (LinkedDocumentsSection.onItemize.test.tsx) to keep individual suites well under
 * the Jest worker heap-exhaustion threshold.
 */

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { jest } from '@jest/globals';
import type {
  UseDocumentLinksResult,
  UseAllLinkedDocumentIdsResult,
} from '../../hooks/useDocumentLinks.js';
import type {
  DocumentLinkWithMetadata,
  PaperlessDocumentSearchResult,
  AttachmentType,
} from '@cornerstone/shared';

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

class MockApiClientError extends Error {
  statusCode: number;
  error: { code: string; message?: string };
  constructor(statusCode: number, error: { code: string; message?: string }) {
    super(error.message ?? 'API Error');
    this.statusCode = statusCode;
    this.error = error;
  }
}

jest.unstable_mockModule('../../lib/apiClient.js', () => ({
  get: jest.fn(),
  post: jest.fn(),
  patch: jest.fn(),
  del: jest.fn(),
  put: jest.fn(),
  setBaseUrl: jest.fn(),
  getBaseUrl: jest.fn().mockReturnValue('/api'),
  ApiClientError: MockApiClientError,
  NetworkError: class MockNetworkError extends Error {},
}));

// ─── Mock: configApi (unconditionally imported by LinkedDocumentsSection) ────

const mockFetchConfig = jest.fn<() => Promise<unknown>>();

jest.unstable_mockModule('../../lib/configApi.js', () => ({
  fetchConfig: mockFetchConfig,
}));

// ─── Mock: react-router-dom useNavigate ──────────────────────────────────────

const mockNavigate = jest.fn();

jest.unstable_mockModule('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

// ─── Mock: child components ───────────────────────────────────────────────────

jest.unstable_mockModule('./DocumentBrowser.js', () => ({
  DocumentBrowser: function MockDocumentBrowser(props: {
    onSelect?: (doc: PaperlessDocumentSearchResult) => void;
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

// Capture the wiring props passed to each card, keyed by link id (so multiple
// rendered cards don't clobber each other's captured callback).
const capturedOnAttachmentTypeChange = new Map<
  string,
  ((link: DocumentLinkWithMetadata, type: AttachmentType | null) => void) | undefined
>();
const capturedIsUpdatingAttachmentType = new Map<string, boolean | undefined>();

jest.unstable_mockModule('./LinkedDocumentCard.js', () => ({
  LinkedDocumentCard: function MockLinkedDocumentCard(props: {
    link: DocumentLinkWithMetadata;
    onView?: (link: DocumentLinkWithMetadata) => void;
    onUnlink?: (link: DocumentLinkWithMetadata) => void;
    onAttachmentTypeChange?: (link: DocumentLinkWithMetadata, type: AttachmentType | null) => void;
    isUpdatingAttachmentType?: boolean;
  }) {
    capturedOnAttachmentTypeChange.set(props.link.id, props.onAttachmentTypeChange);
    capturedIsUpdatingAttachmentType.set(props.link.id, props.isUpdatingAttachmentType);
    return (
      <div data-testid={`linked-card-${props.link.id}`}>
        <button onClick={() => props.onView?.(props.link)}>View {props.link.id}</button>
        <button onClick={() => props.onUnlink?.(props.link)}>Unlink {props.link.id}</button>
        {props.onAttachmentTypeChange && (
          <button
            onClick={() => props.onAttachmentTypeChange!(props.link, 'quotation')}
            data-testid={`retag-${props.link.id}`}
          >
            Tag {props.link.id} as Quotation
          </button>
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
  updateAttachmentType: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
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

const makeInvoiceLink = (
  id: string,
  attachmentType: AttachmentType | null = null,
): DocumentLinkWithMetadata => ({
  id,
  entityType: 'invoice',
  entityId: 'inv-xyz',
  paperlessDocumentId: 42,
  attachmentType,
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

const makeWorkItemLink = (id: string): DocumentLinkWithMetadata => ({
  id,
  entityType: 'work_item',
  entityId: 'wi-abc',
  paperlessDocumentId: 42,
  attachmentType: null,
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
  capturedOnAttachmentTypeChange.clear();
  capturedIsUpdatingAttachmentType.clear();

  mockUseDocumentLinks.mockReturnValue(makeHook());
  mockUseAllLinkedDocumentIds.mockReturnValue(makeAllLinkedIdsHook());
  mockGetPaperlessStatus.mockResolvedValue(makeConfiguredStatus());
  mockFetchConfig.mockResolvedValue({ autoItemizeEnabled: false, currency: 'EUR' });
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('LinkedDocumentsSection — picker attachment-type field', () => {
  it('shows the attachment-type field in the "Add Document" picker when entityType=invoice', async () => {
    render(<LinkedDocumentsSection entityType="invoice" entityId="inv-xyz" />);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /\+ Add Document/i })).not.toBeDisabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: /\+ Add Document/i }));

    expect(screen.getByLabelText('Document Type (optional)')).toBeInTheDocument();
  });

  it('does NOT show the attachment-type field for a non-invoice entity type (work_item)', async () => {
    render(<LinkedDocumentsSection entityType="work_item" entityId="wi-abc" />);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /\+ Add Document/i })).not.toBeDisabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: /\+ Add Document/i }));

    expect(screen.queryByLabelText('Document Type (optional)')).not.toBeInTheDocument();
  });

  it('passes the selected attachment type to hook.addLink when a document is chosen', async () => {
    const addLink = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    mockUseDocumentLinks.mockReturnValue(makeHook({ addLink }));

    render(<LinkedDocumentsSection entityType="invoice" entityId="inv-xyz" />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /\+ Add Document/i })).not.toBeDisabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: /\+ Add Document/i }));

    fireEvent.change(screen.getByLabelText('Document Type (optional)'), {
      target: { value: 'quotation' },
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('document-browser'));
    });

    expect(addLink).toHaveBeenCalledWith(99, 'quotation');
  });

  it('passes null (not undefined) to hook.addLink for an invoice link when no type was selected', async () => {
    const addLink = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    mockUseDocumentLinks.mockReturnValue(makeHook({ addLink }));

    render(<LinkedDocumentsSection entityType="invoice" entityId="inv-xyz" />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /\+ Add Document/i })).not.toBeDisabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: /\+ Add Document/i }));

    await act(async () => {
      fireEvent.click(screen.getByTestId('document-browser'));
    });

    expect(addLink).toHaveBeenCalledWith(99, null);
  });

  it('resets the picker attachment-type selection after closing (Escape) and reopening', async () => {
    render(<LinkedDocumentsSection entityType="invoice" entityId="inv-xyz" />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /\+ Add Document/i })).not.toBeDisabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: /\+ Add Document/i }));

    fireEvent.change(screen.getByLabelText('Document Type (optional)'), {
      target: { value: 'deposit' },
    });
    expect((screen.getByLabelText('Document Type (optional)') as HTMLSelectElement).value).toBe(
      'deposit',
    );

    // Close via Escape
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() =>
      expect(screen.queryByLabelText('Document Type (optional)')).not.toBeInTheDocument(),
    );

    // Reopen — selection should have reset to blank
    fireEvent.click(screen.getByRole('button', { name: /\+ Add Document/i }));
    expect((screen.getByLabelText('Document Type (optional)') as HTMLSelectElement).value).toBe('');
  });

  it('resets the picker attachment-type selection after a successful selection', async () => {
    mockUseDocumentLinks.mockReturnValue(makeHook());

    render(<LinkedDocumentsSection entityType="invoice" entityId="inv-xyz" />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /\+ Add Document/i })).not.toBeDisabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: /\+ Add Document/i }));

    fireEvent.change(screen.getByLabelText('Document Type (optional)'), {
      target: { value: 'invoice' },
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('document-browser'));
    });

    // Picker closed on selection — reopen and verify blank
    fireEvent.click(screen.getByRole('button', { name: /\+ Add Document/i }));
    expect((screen.getByLabelText('Document Type (optional)') as HTMLSelectElement).value).toBe('');
  });

  it('shows a failure banner when addLink rejects', async () => {
    const addLink = jest.fn<() => Promise<void>>().mockRejectedValue(new Error('boom'));
    mockUseDocumentLinks.mockReturnValue(makeHook({ addLink }));

    render(<LinkedDocumentsSection entityType="invoice" entityId="inv-xyz" />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /\+ Add Document/i })).not.toBeDisabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: /\+ Add Document/i }));

    fireEvent.change(screen.getByLabelText('Document Type (optional)'), {
      target: { value: 'quotation' },
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('document-browser'));
    });

    expect(screen.getByRole('alert')).toHaveTextContent(/failed to link/i);

    // Picker was closed on the failed attempt (leaving the stale selection in
    // state) — reopening must reset the attachment-type select back to "No tag"
    // rather than carrying the previous selection over.
    fireEvent.click(screen.getByRole('button', { name: /\+ Add Document/i }));
    expect((screen.getByLabelText('Document Type (optional)') as HTMLSelectElement).value).toBe('');
  });
});

describe('LinkedDocumentsSection — onAttachmentTypeChange wiring to LinkedDocumentCard', () => {
  it('passes onAttachmentTypeChange to the card when entityType=invoice', async () => {
    mockUseDocumentLinks.mockReturnValue(
      makeHook({ links: [makeInvoiceLink('link-1')], isLoading: false }),
    );

    render(<LinkedDocumentsSection entityType="invoice" entityId="inv-xyz" />);

    await waitFor(() => expect(screen.getByTestId('linked-card-link-1')).toBeInTheDocument());
    expect(capturedOnAttachmentTypeChange.get('link-1')).toBeDefined();
  });

  it('does NOT pass onAttachmentTypeChange when entityType=work_item', async () => {
    mockUseDocumentLinks.mockReturnValue(
      makeHook({ links: [makeWorkItemLink('link-2')], isLoading: false }),
    );

    render(<LinkedDocumentsSection entityType="work_item" entityId="wi-abc" />);

    await waitFor(() => expect(screen.getByTestId('linked-card-link-2')).toBeInTheDocument());
    expect(capturedOnAttachmentTypeChange.get('link-2')).toBeUndefined();
  });

  it('calling the wired handler invokes hook.updateAttachmentType with (linkId, type)', async () => {
    const updateAttachmentType = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    mockUseDocumentLinks.mockReturnValue(
      makeHook({ links: [makeInvoiceLink('link-3')], isLoading: false, updateAttachmentType }),
    );

    render(<LinkedDocumentsSection entityType="invoice" entityId="inv-xyz" />);
    await waitFor(() => expect(screen.getByTestId('retag-link-3')).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByTestId('retag-link-3'));
    });

    expect(updateAttachmentType).toHaveBeenCalledWith('link-3', 'quotation');
  });

  it('shows an error banner with the server message when updateAttachmentType rejects with an ApiClientError', async () => {
    const updateAttachmentType = jest
      .fn<() => Promise<void>>()
      .mockRejectedValue(
        new MockApiClientError(500, { code: 'INTERNAL_ERROR', message: 'Server exploded' }),
      );
    mockUseDocumentLinks.mockReturnValue(
      makeHook({ links: [makeInvoiceLink('link-4')], isLoading: false, updateAttachmentType }),
    );

    render(<LinkedDocumentsSection entityType="invoice" entityId="inv-xyz" />);
    await waitFor(() => expect(screen.getByTestId('retag-link-4')).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByTestId('retag-link-4'));
    });

    expect(screen.getByRole('alert')).toHaveTextContent('Server exploded');
  });

  it('shows the generic failure message when updateAttachmentType rejects with a non-ApiClientError', async () => {
    const updateAttachmentType = jest
      .fn<() => Promise<void>>()
      .mockRejectedValue(new Error('boom'));
    mockUseDocumentLinks.mockReturnValue(
      makeHook({ links: [makeInvoiceLink('link-5')], isLoading: false, updateAttachmentType }),
    );

    render(<LinkedDocumentsSection entityType="invoice" entityId="inv-xyz" />);
    await waitFor(() => expect(screen.getByTestId('retag-link-5')).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByTestId('retag-link-5'));
    });

    expect(screen.getByRole('alert')).toHaveTextContent(/failed to update document type/i);
  });

  it('isUpdatingAttachmentType is true only for the specific link being updated', async () => {
    let resolveUpdate!: () => void;
    const updateAttachmentType = jest.fn<() => Promise<void>>().mockReturnValue(
      new Promise<void>((resolve) => {
        resolveUpdate = resolve;
      }),
    );
    mockUseDocumentLinks.mockReturnValue(
      makeHook({
        links: [makeInvoiceLink('link-6'), makeInvoiceLink('link-7')],
        isLoading: false,
        updateAttachmentType,
      }),
    );

    render(<LinkedDocumentsSection entityType="invoice" entityId="inv-xyz" />);
    await waitFor(() => expect(screen.getByTestId('retag-link-6')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('retag-link-6'));

    await waitFor(() => expect(capturedIsUpdatingAttachmentType.get('link-6')).toBe(true));
    expect(capturedIsUpdatingAttachmentType.get('link-7')).toBe(false);

    await act(async () => {
      resolveUpdate();
      await Promise.resolve();
    });

    await waitFor(() => expect(capturedIsUpdatingAttachmentType.get('link-6')).toBe(false));
  });
});
