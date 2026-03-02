import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { jest } from '@jest/globals';
import type { UseDocumentLinksResult } from '../../hooks/useDocumentLinks.js';
import type { DocumentLinkWithMetadata, PaperlessDocumentSearchResult } from '@cornerstone/shared';

// ─── Mock: useDocumentLinks hook ─────────────────────────────────────────────

const mockUseDocumentLinks = jest.fn<() => UseDocumentLinksResult>();

jest.unstable_mockModule('../../hooks/useDocumentLinks.js', () => ({
  useDocumentLinks: mockUseDocumentLinks,
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

// ─── Mock: child components (to avoid transitive dependency issues) ───────────

jest.unstable_mockModule('./DocumentBrowser.js', () => ({
  DocumentBrowser: function MockDocumentBrowser(props: {
    onSelect?: (doc: PaperlessDocumentSearchResult) => void;
    mode?: string;
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
  }) {
    return (
      <div data-testid={`linked-card-${props.link.id}`}>
        <button onClick={() => props.onView?.(props.link)}>View {props.link.id}</button>
        <button onClick={() => props.onUnlink?.(props.link)}>Unlink {props.link.id}</button>
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
  mockGetPaperlessStatus.mockReset();

  // Default: configured paperless, no links
  mockUseDocumentLinks.mockReturnValue(makeHook());
  mockGetPaperlessStatus.mockResolvedValue(makeConfiguredStatus());
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('LinkedDocumentsSection', () => {
  describe('loading state', () => {
    it('renders DocumentSkeleton when hook.isLoading=true', async () => {
      mockUseDocumentLinks.mockReturnValue(makeHook({ isLoading: true }));
      render(<LinkedDocumentsSection entityType="work_item" entityId="wi-abc" />);
      await waitFor(() => expect(screen.getByTestId('document-skeleton')).toBeInTheDocument());
    });
  });

  describe('error state', () => {
    it('renders error banner when hook.error is set', async () => {
      mockUseDocumentLinks.mockReturnValue(
        makeHook({ error: 'Failed to load documents', isLoading: false }),
      );
      render(<LinkedDocumentsSection entityType="work_item" entityId="wi-abc" />);
      await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
      expect(screen.getByText('Failed to load documents')).toBeInTheDocument();
    });

    it('renders Retry button in error state that calls hook.refresh', async () => {
      const refresh = jest.fn();
      mockUseDocumentLinks.mockReturnValue(
        makeHook({ error: 'Failed to load', isLoading: false, refresh }),
      );
      render(<LinkedDocumentsSection entityType="work_item" entityId="wi-abc" />);
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument(),
      );
      fireEvent.click(screen.getByRole('button', { name: /retry/i }));
      expect(refresh).toHaveBeenCalledTimes(1);
    });
  });

  describe('not configured state', () => {
    it('renders not-configured banner when paperlessStatus.configured=false', async () => {
      mockGetPaperlessStatus.mockResolvedValue({
        configured: false,
        reachable: false,
        error: null,
        paperlessUrl: null,
      });
      render(<LinkedDocumentsSection entityType="work_item" entityId="wi-abc" />);
      await waitFor(() =>
        expect(screen.getByText(/Paperless-ngx is not configured/i)).toBeInTheDocument(),
      );
    });

    it('"Add Document" button is disabled when Paperless is not configured', async () => {
      mockGetPaperlessStatus.mockResolvedValue({
        configured: false,
        reachable: false,
        error: null,
        paperlessUrl: null,
      });
      render(<LinkedDocumentsSection entityType="work_item" entityId="wi-abc" />);
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /\+ Add Document/i })).toBeDisabled(),
      );
    });
  });

  describe('empty state', () => {
    it('renders empty state text when links=[] and paperless is configured', async () => {
      mockUseDocumentLinks.mockReturnValue(makeHook({ links: [], isLoading: false }));
      render(<LinkedDocumentsSection entityType="work_item" entityId="wi-abc" />);
      await waitFor(() => expect(screen.getByText(/No documents linked yet/i)).toBeInTheDocument());
    });
  });

  describe('list with cards', () => {
    it('renders one LinkedDocumentCard per link', async () => {
      mockUseDocumentLinks.mockReturnValue(
        makeHook({ links: [makeLink('link-1'), makeLink('link-2')], isLoading: false }),
      );
      render(<LinkedDocumentsSection entityType="work_item" entityId="wi-abc" />);
      await waitFor(() => expect(screen.getByTestId('linked-card-link-1')).toBeInTheDocument());
      expect(screen.getByTestId('linked-card-link-2')).toBeInTheDocument();
    });

    it('renders the linked documents list role with aria-label', async () => {
      mockUseDocumentLinks.mockReturnValue(
        makeHook({ links: [makeLink('link-1')], isLoading: false }),
      );
      render(<LinkedDocumentsSection entityType="work_item" entityId="wi-abc" />);
      await waitFor(() =>
        expect(screen.getByRole('list', { name: /Linked documents/i })).toBeInTheDocument(),
      );
    });
  });

  describe('Add Document opens picker', () => {
    it('shows DocumentBrowser when "Add Document" is clicked', async () => {
      render(<LinkedDocumentsSection entityType="work_item" entityId="wi-abc" />);
      // Wait for paperless status to load
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /\+ Add Document/i })).not.toBeDisabled(),
      );
      fireEvent.click(screen.getByRole('button', { name: /\+ Add Document/i }));
      expect(screen.getByTestId('document-browser')).toBeInTheDocument();
    });

    it('shows the picker dialog with aria-modal', async () => {
      render(<LinkedDocumentsSection entityType="work_item" entityId="wi-abc" />);
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /\+ Add Document/i })).not.toBeDisabled(),
      );
      fireEvent.click(screen.getByRole('button', { name: /\+ Add Document/i }));
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    });

    it('closes picker when close button is clicked', async () => {
      render(<LinkedDocumentsSection entityType="work_item" entityId="wi-abc" />);
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /\+ Add Document/i })).not.toBeDisabled(),
      );
      fireEvent.click(screen.getByRole('button', { name: /\+ Add Document/i }));
      expect(screen.getByTestId('document-browser')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /Close document picker/i }));
      expect(screen.queryByTestId('document-browser')).not.toBeInTheDocument();
    });
  });

  describe('selection triggers addLink', () => {
    it('calls hook.addLink when DocumentBrowser triggers onSelect', async () => {
      const addLink = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      mockUseDocumentLinks.mockReturnValue(makeHook({ addLink }));

      render(<LinkedDocumentsSection entityType="work_item" entityId="wi-abc" />);
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /\+ Add Document/i })).not.toBeDisabled(),
      );
      fireEvent.click(screen.getByRole('button', { name: /\+ Add Document/i }));

      // Trigger onSelect on the mocked DocumentBrowser (click fires onSelect with doc id 99)
      await act(async () => {
        fireEvent.click(screen.getByTestId('document-browser'));
      });

      expect(addLink).toHaveBeenCalledWith(99);
    });

    it('closes picker after successful selection', async () => {
      const addLink = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      mockUseDocumentLinks.mockReturnValue(makeHook({ addLink }));

      render(<LinkedDocumentsSection entityType="work_item" entityId="wi-abc" />);
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /\+ Add Document/i })).not.toBeDisabled(),
      );
      fireEvent.click(screen.getByRole('button', { name: /\+ Add Document/i }));

      await act(async () => {
        fireEvent.click(screen.getByTestId('document-browser'));
      });

      await waitFor(() => expect(screen.queryByTestId('document-browser')).not.toBeInTheDocument());
    });
  });

  describe('duplicate error shown inline', () => {
    it('shows duplicate error message when addLink rejects with DUPLICATE_DOCUMENT_LINK', async () => {
      const addLink = jest.fn<() => Promise<void>>().mockRejectedValue(
        new MockApiClientError(409, {
          code: 'DUPLICATE_DOCUMENT_LINK',
          message: 'Already linked',
        }),
      );
      mockUseDocumentLinks.mockReturnValue(makeHook({ addLink }));

      render(<LinkedDocumentsSection entityType="work_item" entityId="wi-abc" />);
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /\+ Add Document/i })).not.toBeDisabled(),
      );
      fireEvent.click(screen.getByRole('button', { name: /\+ Add Document/i }));

      await act(async () => {
        fireEvent.click(screen.getByTestId('document-browser'));
      });

      await waitFor(() =>
        expect(
          screen.getByText(/This document is already linked to this work item/i),
        ).toBeInTheDocument(),
      );
    });

    it('shows generic error message when addLink rejects with non-duplicate error', async () => {
      const addLink = jest.fn<() => Promise<void>>().mockRejectedValue(new Error('Unknown error'));
      mockUseDocumentLinks.mockReturnValue(makeHook({ addLink }));

      render(<LinkedDocumentsSection entityType="work_item" entityId="wi-abc" />);
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /\+ Add Document/i })).not.toBeDisabled(),
      );
      fireEvent.click(screen.getByRole('button', { name: /\+ Add Document/i }));

      await act(async () => {
        fireEvent.click(screen.getByTestId('document-browser'));
      });

      await waitFor(() =>
        expect(screen.getByText(/Failed to link document. Please try again/i)).toBeInTheDocument(),
      );
    });

    it('can dismiss the error banner', async () => {
      const addLink = jest.fn<() => Promise<void>>().mockRejectedValue(
        new MockApiClientError(409, {
          code: 'DUPLICATE_DOCUMENT_LINK',
          message: 'Already linked',
        }),
      );
      mockUseDocumentLinks.mockReturnValue(makeHook({ addLink }));

      render(<LinkedDocumentsSection entityType="work_item" entityId="wi-abc" />);
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /\+ Add Document/i })).not.toBeDisabled(),
      );
      fireEvent.click(screen.getByRole('button', { name: /\+ Add Document/i }));

      await act(async () => {
        fireEvent.click(screen.getByTestId('document-browser'));
      });

      await waitFor(() =>
        expect(
          screen.getByText(/This document is already linked to this work item/i),
        ).toBeInTheDocument(),
      );

      fireEvent.click(screen.getByRole('button', { name: /Dismiss error/i }));
      expect(
        screen.queryByText(/This document is already linked to this work item/i),
      ).not.toBeInTheDocument();
    });
  });

  describe('unlink confirmation', () => {
    it('shows confirmation dialog when onUnlink is triggered on a card', async () => {
      mockUseDocumentLinks.mockReturnValue(
        makeHook({ links: [makeLink('link-1')], isLoading: false }),
      );
      render(<LinkedDocumentsSection entityType="work_item" entityId="wi-abc" />);
      await waitFor(() => expect(screen.getByTestId('linked-card-link-1')).toBeInTheDocument());

      // Click the Unlink button on the card
      fireEvent.click(screen.getByRole('button', { name: /Unlink link-1/i }));

      expect(screen.getByRole('dialog', { name: /Unlink Document/i })).toBeInTheDocument();
      expect(screen.getByText(/Unlink Document\?/i)).toBeInTheDocument();
    });

    it('Cancel button dismisses the confirmation dialog', async () => {
      mockUseDocumentLinks.mockReturnValue(
        makeHook({ links: [makeLink('link-1')], isLoading: false }),
      );
      render(<LinkedDocumentsSection entityType="work_item" entityId="wi-abc" />);
      await waitFor(() => expect(screen.getByTestId('linked-card-link-1')).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: /Unlink link-1/i }));
      expect(screen.getByRole('dialog', { name: /Unlink Document/i })).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
      expect(screen.queryByRole('dialog', { name: /Unlink Document/i })).not.toBeInTheDocument();
    });
  });

  describe('unlink confirmed', () => {
    it('calls hook.removeLink with correct ID when confirmed', async () => {
      const removeLink = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      mockUseDocumentLinks.mockReturnValue(
        makeHook({ links: [makeLink('link-1')], isLoading: false, removeLink }),
      );
      render(<LinkedDocumentsSection entityType="work_item" entityId="wi-abc" />);
      await waitFor(() => expect(screen.getByTestId('linked-card-link-1')).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: /Unlink link-1/i }));
      expect(screen.getByRole('dialog', { name: /Unlink Document/i })).toBeInTheDocument();

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /^Unlink$/i }));
      });

      expect(removeLink).toHaveBeenCalledWith('link-1');
    });

    it('dismisses the confirmation dialog after confirmed unlink', async () => {
      const removeLink = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      mockUseDocumentLinks.mockReturnValue(
        makeHook({ links: [makeLink('link-1')], isLoading: false, removeLink }),
      );
      render(<LinkedDocumentsSection entityType="work_item" entityId="wi-abc" />);
      await waitFor(() => expect(screen.getByTestId('linked-card-link-1')).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: /Unlink link-1/i }));

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /^Unlink$/i }));
      });

      await waitFor(() =>
        expect(screen.queryByRole('dialog', { name: /Unlink Document/i })).not.toBeInTheDocument(),
      );
    });
  });

  describe('live region announces after link', () => {
    it('announces success message in aria-live region after addLink succeeds', async () => {
      const addLink = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      mockUseDocumentLinks.mockReturnValue(makeHook({ addLink }));

      render(<LinkedDocumentsSection entityType="work_item" entityId="wi-abc" />);
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /\+ Add Document/i })).not.toBeDisabled(),
      );
      fireEvent.click(screen.getByRole('button', { name: /\+ Add Document/i }));

      await act(async () => {
        fireEvent.click(screen.getByTestId('document-browser'));
      });

      // The aria-live region should contain the success message
      await waitFor(() => {
        const liveRegion = document.querySelector('[aria-live="polite"]');
        expect(liveRegion).not.toBeNull();
        expect(liveRegion!.textContent).toContain('Document linked: Test Doc');
      });
    });
  });

  describe('section structure', () => {
    it('renders the "Documents" section heading', async () => {
      render(<LinkedDocumentsSection entityType="work_item" entityId="wi-abc" />);
      expect(screen.getByRole('heading', { name: /^Documents/i, level: 2 })).toBeInTheDocument();
    });

    it('renders count badge when links are present', async () => {
      mockUseDocumentLinks.mockReturnValue(
        makeHook({ links: [makeLink('link-1'), makeLink('link-2')], isLoading: false }),
      );
      render(<LinkedDocumentsSection entityType="work_item" entityId="wi-abc" />);
      await waitFor(() => expect(screen.getByLabelText(/2 documents linked/i)).toBeInTheDocument());
    });

    it('does not render count badge when there are no links', async () => {
      mockUseDocumentLinks.mockReturnValue(makeHook({ links: [], isLoading: false }));
      render(<LinkedDocumentsSection entityType="work_item" entityId="wi-abc" />);
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /\+ Add Document/i })).toBeInTheDocument(),
      );
      expect(screen.queryByLabelText(/documents linked/i)).not.toBeInTheDocument();
    });
  });

  describe('invoice entity type', () => {
    it('shows invoice-specific subtitle in picker modal', async () => {
      render(<LinkedDocumentsSection entityType="invoice" entityId="inv-xyz" />);
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /\+ Add Document/i })).not.toBeDisabled(),
      );
      fireEvent.click(screen.getByRole('button', { name: /\+ Add Document/i }));
      expect(screen.getByText(/to link to this invoice/i)).toBeInTheDocument();
    });

    // TODO: Unskip after bug #379 is fixed (unlink modal hardcodes "this work item" instead of copy.unlinkBody)
    it.skip('shows invoice-specific body in unlink confirmation dialog', async () => {
      mockUseDocumentLinks.mockReturnValue(
        makeHook({ links: [makeInvoiceLink('link-inv-1')], isLoading: false }),
      );
      render(<LinkedDocumentsSection entityType="invoice" entityId="inv-xyz" />);
      await waitFor(() => expect(screen.getByTestId('linked-card-link-inv-1')).toBeInTheDocument());
      fireEvent.click(screen.getByRole('button', { name: /Unlink link-inv-1/i }));
      expect(screen.getByRole('dialog', { name: /Unlink Document/i })).toBeInTheDocument();
      // The unlink modal body should mention "this invoice" for invoice entity
      expect(screen.getByText(/this invoice/i)).toBeInTheDocument();
    });

    it('shows invoice-specific empty state body when no links exist', async () => {
      mockUseDocumentLinks.mockReturnValue(makeHook({ links: [], isLoading: false }));
      render(<LinkedDocumentsSection entityType="invoice" entityId="inv-xyz" />);
      await waitFor(() => expect(screen.getByText(/No documents linked yet/i)).toBeInTheDocument());
      expect(screen.getByText(/invoice PDFs/i)).toBeInTheDocument();
    });

    it('shows invoice-specific duplicate error when addLink returns DUPLICATE_DOCUMENT_LINK', async () => {
      const addLink = jest.fn<() => Promise<void>>().mockRejectedValue(
        new MockApiClientError(409, {
          code: 'DUPLICATE_DOCUMENT_LINK',
          message: 'Already linked',
        }),
      );
      mockUseDocumentLinks.mockReturnValue(makeHook({ addLink }));

      render(<LinkedDocumentsSection entityType="invoice" entityId="inv-xyz" />);
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /\+ Add Document/i })).not.toBeDisabled(),
      );
      fireEvent.click(screen.getByRole('button', { name: /\+ Add Document/i }));

      await act(async () => {
        fireEvent.click(screen.getByTestId('document-browser'));
      });

      await waitFor(() =>
        expect(
          screen.getByText(/This document is already linked to this invoice/i),
        ).toBeInTheDocument(),
      );
    });
  });

  describe('work_item entity type — backwards-compatibility', () => {
    it('shows work-item-specific subtitle in picker modal', async () => {
      render(<LinkedDocumentsSection entityType="work_item" entityId="wi-abc" />);
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /\+ Add Document/i })).not.toBeDisabled(),
      );
      fireEvent.click(screen.getByRole('button', { name: /\+ Add Document/i }));
      expect(screen.getByText(/to link to this work item/i)).toBeInTheDocument();
    });

    it('shows work-item-specific body in unlink confirmation dialog', async () => {
      mockUseDocumentLinks.mockReturnValue(
        makeHook({ links: [makeLink('link-1')], isLoading: false }),
      );
      render(<LinkedDocumentsSection entityType="work_item" entityId="wi-abc" />);
      await waitFor(() => expect(screen.getByTestId('linked-card-link-1')).toBeInTheDocument());
      fireEvent.click(screen.getByRole('button', { name: /Unlink link-1/i }));
      expect(screen.getByRole('dialog', { name: /Unlink Document/i })).toBeInTheDocument();
      // The unlink modal body should mention "this work item" for work_item entity
      expect(screen.getByText(/this work item/i)).toBeInTheDocument();
    });
  });
});
