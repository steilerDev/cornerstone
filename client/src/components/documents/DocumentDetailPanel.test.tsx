import { render, screen, fireEvent } from '@testing-library/react';
import { jest } from '@jest/globals';

const mockGetDocumentThumbnailUrl = jest.fn<(id: number) => string>();

jest.unstable_mockModule('../../lib/paperlessApi.js', () => ({
  getPaperlessStatus: jest.fn(),
  listPaperlessDocuments: jest.fn(),
  listPaperlessTags: jest.fn(),
  getPaperlessDocument: jest.fn(),
  getDocumentThumbnailUrl: mockGetDocumentThumbnailUrl,
  getDocumentPreviewUrl: jest.fn(),
}));

let DocumentDetailPanel: (typeof import('./DocumentDetailPanel.js'))['DocumentDetailPanel'];

beforeEach(async () => {
  ({ DocumentDetailPanel } = await import('./DocumentDetailPanel.js'));
  mockGetDocumentThumbnailUrl.mockReset();
  mockGetDocumentThumbnailUrl.mockImplementation(
    (id) => `/api/paperless/documents/${id}/thumb`,
  );
});

const makeDoc = (overrides = {}) => ({
  id: 42,
  title: 'Annual Report 2025',
  content: 'This is the full content of the annual report document.',
  tags: [
    { id: 1, name: 'Finance', color: null, documentCount: 10 },
    { id: 2, name: 'Annual', color: null, documentCount: 5 },
  ],
  created: '2025-01-01',
  added: '2025-01-02T09:00:00Z',
  modified: '2025-01-02T09:00:00Z',
  correspondent: 'Finance Dept',
  documentType: 'Report',
  archiveSerialNumber: 200,
  originalFileName: 'annual-report.pdf',
  pageCount: 50,
  searchHit: null,
  ...overrides,
});

describe('DocumentDetailPanel', () => {
  it('renders the document title', () => {
    render(<DocumentDetailPanel document={makeDoc()} onClose={jest.fn()} />);
    expect(screen.getByRole('heading', { name: 'Annual Report 2025' })).toBeInTheDocument();
  });

  it('has role="region" with document title as aria-label', () => {
    render(<DocumentDetailPanel document={makeDoc()} onClose={jest.fn()} />);
    expect(
      screen.getByRole('region', { name: /Details for Annual Report 2025/i }),
    ).toBeInTheDocument();
  });

  it('renders thumbnail image with alt text', () => {
    render(<DocumentDetailPanel document={makeDoc()} onClose={jest.fn()} />);
    const img = screen.getByAltText('Annual Report 2025') as HTMLImageElement;
    expect(img).toBeInTheDocument();
    expect(img.src).toContain('/api/paperless/documents/42/thumb');
  });

  it('renders close button', () => {
    render(<DocumentDetailPanel document={makeDoc()} onClose={jest.fn()} />);
    expect(screen.getByRole('button', { name: /close document details/i })).toBeInTheDocument();
  });

  it('calls onClose when close button clicked', () => {
    const onClose = jest.fn();
    render(<DocumentDetailPanel document={makeDoc()} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: /close document details/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders correspondent in metadata', () => {
    render(<DocumentDetailPanel document={makeDoc()} onClose={jest.fn()} />);
    expect(screen.getByText('Finance Dept')).toBeInTheDocument();
  });

  it('renders document type in metadata', () => {
    render(<DocumentDetailPanel document={makeDoc()} onClose={jest.fn()} />);
    expect(screen.getByText('Report')).toBeInTheDocument();
  });

  it('renders created date in metadata', () => {
    render(<DocumentDetailPanel document={makeDoc({ created: '2025-01-01' })} onClose={jest.fn()} />);
    expect(screen.getByText(/January 1, 2025/i)).toBeInTheDocument();
  });

  it('renders archive serial number', () => {
    render(<DocumentDetailPanel document={makeDoc()} onClose={jest.fn()} />);
    expect(screen.getByText('200')).toBeInTheDocument();
  });

  it('renders page count', () => {
    render(<DocumentDetailPanel document={makeDoc()} onClose={jest.fn()} />);
    expect(screen.getByText('50')).toBeInTheDocument();
  });

  it('renders tags as chips', () => {
    render(<DocumentDetailPanel document={makeDoc()} onClose={jest.fn()} />);
    expect(screen.getByText('Finance')).toBeInTheDocument();
    expect(screen.getByText('Annual')).toBeInTheDocument();
  });

  it('renders content snippet when content is present', () => {
    render(<DocumentDetailPanel document={makeDoc()} onClose={jest.fn()} />);
    expect(screen.getByText(/This is the full content/i)).toBeInTheDocument();
  });

  it('truncates long content to 300 chars with ellipsis', () => {
    const longContent = 'A'.repeat(400);
    render(<DocumentDetailPanel document={makeDoc({ content: longContent })} onClose={jest.fn()} />);
    const snippetText = screen.getByText(/A{100,}\.\.\.$/);
    expect(snippetText.textContent?.length).toBeLessThanOrEqual(304); // 300 + '...'
  });

  it('does not render content section when content is null', () => {
    render(<DocumentDetailPanel document={makeDoc({ content: null })} onClose={jest.fn()} />);
    expect(screen.queryByText(/Content Preview/i)).not.toBeInTheDocument();
  });

  it('does not render "View in Paperless" link when paperlessBaseUrl is not provided', () => {
    render(<DocumentDetailPanel document={makeDoc()} onClose={jest.fn()} />);
    expect(screen.queryByRole('link', { name: /View in Paperless/i })).not.toBeInTheDocument();
  });

  it('renders "View in Paperless" link when paperlessBaseUrl is provided', () => {
    render(
      <DocumentDetailPanel
        document={makeDoc()}
        onClose={jest.fn()}
        paperlessBaseUrl="https://paperless.example.com"
      />,
    );
    const link = screen.getByRole('link', { name: /View in Paperless/i }) as HTMLAnchorElement;
    expect(link).toBeInTheDocument();
    expect(link.href).toContain('https://paperless.example.com/documents/42/details');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('does not render created date when created is null', () => {
    render(
      <DocumentDetailPanel document={makeDoc({ created: null })} onClose={jest.fn()} />,
    );
    // "Created" label should not be in the metadata
    const metaLabels = screen.queryAllByText(/^Created$/i);
    expect(metaLabels).toHaveLength(0);
  });

  it('does not render archive serial number when null', () => {
    render(
      <DocumentDetailPanel document={makeDoc({ archiveSerialNumber: null })} onClose={jest.fn()} />,
    );
    expect(screen.queryByText(/Archive #/i)).not.toBeInTheDocument();
  });
});
