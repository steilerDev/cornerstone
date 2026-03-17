import { render, screen, fireEvent } from '@testing-library/react';
import { jest } from '@jest/globals';
import type * as LinkedDocumentCardModule from './LinkedDocumentCard.js';
import type { DocumentLinkWithMetadata } from '@cornerstone/shared';

const mockGetDocumentThumbnailUrl = jest.fn<(id: number) => string>();

jest.unstable_mockModule('../../lib/paperlessApi.js', () => ({
  getPaperlessStatus: jest.fn(),
  listPaperlessDocuments: jest.fn(),
  listPaperlessTags: jest.fn(),
  getPaperlessDocument: jest.fn(),
  getDocumentThumbnailUrl: mockGetDocumentThumbnailUrl,
  getDocumentPreviewUrl: jest.fn(),
}));

let LinkedDocumentCard: (typeof LinkedDocumentCardModule)['LinkedDocumentCard'];

beforeEach(async () => {
  ({ LinkedDocumentCard } =
    (await import('./LinkedDocumentCard.js')) as typeof LinkedDocumentCardModule);
  mockGetDocumentThumbnailUrl.mockReset();
  mockGetDocumentThumbnailUrl.mockImplementation((id) => `/api/paperless/documents/${id}/thumb`);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const makeLink = (overrides: Partial<DocumentLinkWithMetadata> = {}): DocumentLinkWithMetadata => ({
  id: 'link-1',
  entityType: 'work_item',
  entityId: 'wi-1',
  paperlessDocumentId: 42,
  createdBy: null,
  createdAt: '2026-01-01T00:00:00Z',
  document: {
    id: 42,
    title: 'Invoice March',
    content: null,
    tags: [{ id: 1, name: 'Invoice', color: null, documentCount: 5 }],
    created: '2026-01-15',
    added: null,
    modified: null,
    correspondent: 'ACME Corp',
    documentType: null,
    archiveSerialNumber: null,
    originalFileName: null,
    pageCount: null,
  },
  ...overrides,
});

describe('LinkedDocumentCard', () => {
  it('renders document title from link.document.title', () => {
    render(
      <LinkedDocumentCard
        link={makeLink()}
        paperlessBaseUrl={null}
        onView={jest.fn()}
        onUnlink={jest.fn()}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Invoice March' })).toBeInTheDocument();
  });

  it('renders formatted date from link.document.created', () => {
    render(
      <LinkedDocumentCard
        link={makeLink()}
        paperlessBaseUrl={null}
        onView={jest.fn()}
        onUnlink={jest.fn()}
      />,
    );
    // 2026-01-15 => "Jan 15, 2026"
    expect(screen.getByText(/Jan 15, 2026/)).toBeInTheDocument();
  });

  it('renders up to 2 tag chips', () => {
    const link = makeLink({
      document: {
        id: 42,
        title: 'Invoice March',
        content: null,
        tags: [
          { id: 1, name: 'Invoice', color: null, documentCount: 5 },
          { id: 2, name: 'Work', color: null, documentCount: 3 },
        ],
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
    render(
      <LinkedDocumentCard
        link={link}
        paperlessBaseUrl={null}
        onView={jest.fn()}
        onUnlink={jest.fn()}
      />,
    );
    expect(screen.getByText('Invoice')).toBeInTheDocument();
    expect(screen.getByText('Work')).toBeInTheDocument();
    expect(screen.queryByText(/\+/)).not.toBeInTheDocument();
  });

  it('shows "+N" overflow indicator when more than 2 tags exist', () => {
    const link = makeLink({
      document: {
        id: 42,
        title: 'Invoice March',
        content: null,
        tags: [
          { id: 1, name: 'Invoice', color: null, documentCount: 5 },
          { id: 2, name: 'Work', color: null, documentCount: 3 },
          { id: 3, name: 'Archive', color: null, documentCount: 2 },
          { id: 4, name: 'Extra', color: null, documentCount: 1 },
        ],
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
    render(
      <LinkedDocumentCard
        link={link}
        paperlessBaseUrl={null}
        onView={jest.fn()}
        onUnlink={jest.fn()}
      />,
    );
    expect(screen.getByText('Invoice')).toBeInTheDocument();
    expect(screen.getByText('Work')).toBeInTheDocument();
    // 3rd and 4th tags are not shown individually
    expect(screen.queryByText('Archive')).not.toBeInTheDocument();
    expect(screen.queryByText('Extra')).not.toBeInTheDocument();
    // Overflow indicator shows +2 (4 tags - 2 shown = 2 extra)
    expect(screen.getByText('+2')).toBeInTheDocument();
  });

  it('"View" button calls onView prop with the link', () => {
    const onView = jest.fn();
    const link = makeLink();
    render(
      <LinkedDocumentCard
        link={link}
        paperlessBaseUrl={null}
        onView={onView}
        onUnlink={jest.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /View: Invoice March/i }));
    expect(onView).toHaveBeenCalledWith(link);
  });

  it('"Open in Paperless" link is rendered when paperlessBaseUrl is set', () => {
    const link = makeLink();
    render(
      <LinkedDocumentCard
        link={link}
        paperlessBaseUrl="https://paperless.example.com"
        onView={jest.fn()}
        onUnlink={jest.fn()}
      />,
    );
    const openLink = screen.getByRole('link', {
      name: /Open document in Paperless: Invoice March/i,
    }) as HTMLAnchorElement;
    expect(openLink).toBeInTheDocument();
    expect(openLink.href).toBe('https://paperless.example.com/documents/42/details');
  });

  it('"Open in Paperless" link has correct href with document ID', () => {
    const link = makeLink({ paperlessDocumentId: 77 });
    render(
      <LinkedDocumentCard
        link={link}
        paperlessBaseUrl="https://my-paperless.local"
        onView={jest.fn()}
        onUnlink={jest.fn()}
      />,
    );
    const openLink = screen.getByRole('link', {
      name: /Open document in Paperless/i,
    }) as HTMLAnchorElement;
    expect(openLink.href).toContain('/documents/77/details');
  });

  it('"Open in Paperless" link is NOT rendered when paperlessBaseUrl is null', () => {
    render(
      <LinkedDocumentCard
        link={makeLink()}
        paperlessBaseUrl={null}
        onView={jest.fn()}
        onUnlink={jest.fn()}
      />,
    );
    expect(
      screen.queryByRole('link', { name: /Open document in Paperless/i }),
    ).not.toBeInTheDocument();
  });

  it('"Unlink" button calls onUnlink prop with the link', () => {
    const onUnlink = jest.fn();
    const link = makeLink();
    render(
      <LinkedDocumentCard
        link={link}
        paperlessBaseUrl={null}
        onView={jest.fn()}
        onUnlink={onUnlink}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Unlink document: Invoice March/i }));
    expect(onUnlink).toHaveBeenCalledWith(link);
  });

  it('when link.document is null: only "Unlink" action visible, no View or Open buttons', () => {
    const link = makeLink({ document: null });
    render(
      <LinkedDocumentCard
        link={link}
        paperlessBaseUrl="https://paperless.example.com"
        onView={jest.fn()}
        onUnlink={jest.fn()}
      />,
    );
    // View button should not appear
    expect(screen.queryByRole('button', { name: /View document/i })).not.toBeInTheDocument();
    // Open in Paperless link should not appear (hasDocument is false)
    expect(
      screen.queryByRole('link', { name: /Open document in Paperless/i }),
    ).not.toBeInTheDocument();
    // Unlink button should still be present
    expect(screen.getByRole('button', { name: /Unlink document/i })).toBeInTheDocument();
  });

  it('shows fallback title Document #<id> when link.document is null', () => {
    const link = makeLink({ paperlessDocumentId: 99, document: null });
    render(
      <LinkedDocumentCard
        link={link}
        paperlessBaseUrl={null}
        onView={jest.fn()}
        onUnlink={jest.fn()}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Document #99' })).toBeInTheDocument();
  });

  it('does not render date section when document.created is null', () => {
    const link = makeLink({
      document: {
        id: 42,
        title: 'Invoice March',
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
      },
    });
    render(
      <LinkedDocumentCard
        link={link}
        paperlessBaseUrl={null}
        onView={jest.fn()}
        onUnlink={jest.fn()}
      />,
    );
    // No formatted date text visible
    expect(screen.queryByText(/^[A-Z][a-z]+ \d+, \d{4}$/)).not.toBeInTheDocument();
  });

  it('does not render tag section when document has no tags', () => {
    const link = makeLink({
      document: {
        id: 42,
        title: 'Invoice March',
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
    render(
      <LinkedDocumentCard
        link={link}
        paperlessBaseUrl={null}
        onView={jest.fn()}
        onUnlink={jest.fn()}
      />,
    );
    expect(screen.queryByText(/\+/)).not.toBeInTheDocument();
  });

  it('"Open in Paperless" link opens in new tab with noopener noreferrer', () => {
    render(
      <LinkedDocumentCard
        link={makeLink()}
        paperlessBaseUrl="https://paperless.example.com"
        onView={jest.fn()}
        onUnlink={jest.fn()}
      />,
    );
    const openLink = screen.getByRole('link', {
      name: /Open document in Paperless/i,
    }) as HTMLAnchorElement;
    expect(openLink).toHaveAttribute('target', '_blank');
    expect(openLink).toHaveAttribute('rel', 'noopener noreferrer');
  });
});
