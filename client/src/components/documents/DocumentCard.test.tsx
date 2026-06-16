import { render, screen, fireEvent } from '@testing-library/react';
import { jest } from '@jest/globals';
import type * as DocumentCardModule from './DocumentCard.js';

const mockGetDocumentThumbnailUrl = jest.fn<(id: number) => string>();
const mockGetDocumentPreviewUrl = jest.fn<(id: number) => string>();

jest.unstable_mockModule('../../lib/paperlessApi.js', () => ({
  getPaperlessStatus: jest.fn(),
  listPaperlessDocuments: jest.fn(),
  listPaperlessTags: jest.fn(),
  getPaperlessDocument: jest.fn(),
  getDocumentThumbnailUrl: mockGetDocumentThumbnailUrl,
  getDocumentPreviewUrl: mockGetDocumentPreviewUrl,
}));

let DocumentCard: (typeof DocumentCardModule)['DocumentCard'];

beforeEach(async () => {
  ({ DocumentCard } = (await import('./DocumentCard.js')) as typeof DocumentCardModule);
  mockGetDocumentThumbnailUrl.mockReset();
  mockGetDocumentThumbnailUrl.mockImplementation((id) => `/api/paperless/documents/${id}/thumb`);
  mockGetDocumentPreviewUrl.mockImplementation((id) => `/api/paperless/documents/${id}/preview`);
});

const makeDoc = (overrides = {}) => ({
  id: 42,
  title: 'Test Invoice 2025',
  content: 'Invoice content here',
  tags: [],
  created: '2025-03-15',
  added: '2025-03-16T10:00:00Z',
  modified: '2025-03-16T10:00:00Z',
  correspondent: 'ACME Corp',
  documentType: 'Invoice',
  archiveSerialNumber: 100,
  originalFileName: 'invoice.pdf',
  pageCount: 2,
  searchHit: null,
  ...overrides,
});

describe('DocumentCard', () => {
  it('renders the document title', () => {
    render(<DocumentCard document={makeDoc()} isSelected={false} onSelect={jest.fn()} />);
    expect(screen.getByRole('heading', { name: 'Test Invoice 2025' })).toBeInTheDocument();
  });

  it('renders thumbnail image with correct alt text', () => {
    render(<DocumentCard document={makeDoc()} isSelected={false} onSelect={jest.fn()} />);
    const img = screen.getByAltText('Test Invoice 2025') as HTMLImageElement;
    expect(img).toBeInTheDocument();
    expect(img.src).toContain('/api/paperless/documents/42/thumb');
  });

  it('renders created date when present', () => {
    render(
      <DocumentCard
        document={makeDoc({ created: '2025-03-15' })}
        isSelected={false}
        onSelect={jest.fn()}
      />,
    );
    expect(screen.getByText(/Mar 15, 2025/)).toBeInTheDocument();
  });

  it('does not render date when created is null', () => {
    render(
      <DocumentCard
        document={makeDoc({ created: null })}
        isSelected={false}
        onSelect={jest.fn()}
      />,
    );
    // Check that no formatted date (e.g. "Mar 15, 2025") is rendered.
    // Use a pattern that matches month-day-year format but not the document title.
    expect(screen.queryByText(/^[A-Z][a-z]+ \d+, \d{4}$/)).not.toBeInTheDocument();
  });

  it('renders correspondent name', () => {
    render(<DocumentCard document={makeDoc()} isSelected={false} onSelect={jest.fn()} />);
    expect(screen.getByText('ACME Corp')).toBeInTheDocument();
  });

  it('renders up to 3 tag chips', () => {
    const doc = makeDoc({
      tags: [
        { id: 1, name: 'Invoice', color: null, documentCount: 5 },
        { id: 2, name: 'Work', color: null, documentCount: 3 },
        { id: 3, name: 'Archive', color: null, documentCount: 2 },
        { id: 4, name: 'Extra', color: null, documentCount: 1 },
      ],
    });
    render(<DocumentCard document={doc} isSelected={false} onSelect={jest.fn()} />);

    expect(screen.getByText('Invoice')).toBeInTheDocument();
    expect(screen.getByText('Work')).toBeInTheDocument();
    expect(screen.getByText('Archive')).toBeInTheDocument();
    expect(screen.getByText('+1')).toBeInTheDocument();
    expect(screen.queryByText('Extra')).not.toBeInTheDocument();
  });

  it('renders no tags section when tags array is empty', () => {
    render(
      <DocumentCard document={makeDoc({ tags: [] })} isSelected={false} onSelect={jest.fn()} />,
    );
    expect(screen.queryByText(/\+/)).not.toBeInTheDocument();
  });

  it('has role="button" for keyboard/screen reader navigation', () => {
    render(<DocumentCard document={makeDoc()} isSelected={false} onSelect={jest.fn()} />);
    expect(
      screen.getByRole('button', { name: /Document: Test Invoice 2025/i }),
    ).toBeInTheDocument();
  });

  it('includes formatted date in aria-label when created is set', () => {
    render(
      <DocumentCard
        document={makeDoc({ created: '2025-03-15' })}
        isSelected={false}
        onSelect={jest.fn()}
      />,
    );
    // The date '2025-03-15' formats to 'Mar 15, 2025' via toLocaleDateString('en-US', ...)
    const card = screen.getByRole('button', { name: /Document: Test Invoice 2025, Mar 15, 2025/i });
    expect(card).toBeInTheDocument();
  });

  it('aria-label is just "Document: {title}" when created is null', () => {
    render(
      <DocumentCard
        document={makeDoc({ created: null })}
        isSelected={false}
        onSelect={jest.fn()}
      />,
    );
    const card = screen.getByRole('button', { name: 'Document: Test Invoice 2025' });
    expect(card).toBeInTheDocument();
    // Ensure no date suffix is appended
    expect(card).toHaveAttribute('aria-label', 'Document: Test Invoice 2025');
  });

  it('has aria-expanded=false when not selected', () => {
    render(<DocumentCard document={makeDoc()} isSelected={false} onSelect={jest.fn()} />);
    const card = screen.getByRole('button', { name: /Document: Test Invoice 2025/i });
    expect(card).toHaveAttribute('aria-expanded', 'false');
  });

  it('has aria-expanded=true when selected', () => {
    render(<DocumentCard document={makeDoc()} isSelected={true} onSelect={jest.fn()} />);
    const card = screen.getByRole('button', { name: /Document: Test Invoice 2025/i });
    expect(card).toHaveAttribute('aria-expanded', 'true');
  });

  it('calls onSelect with document when clicked', () => {
    const onSelect = jest.fn();
    render(<DocumentCard document={makeDoc()} isSelected={false} onSelect={onSelect} />);

    fireEvent.click(screen.getByRole('button', { name: /Document: Test Invoice 2025/i }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 42 }));
  });

  it('calls onSelect on Enter key press', () => {
    const onSelect = jest.fn();
    render(<DocumentCard document={makeDoc()} isSelected={false} onSelect={onSelect} />);

    fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('calls onSelect on Space key press', () => {
    const onSelect = jest.fn();
    render(<DocumentCard document={makeDoc()} isSelected={false} onSelect={onSelect} />);

    fireEvent.keyDown(screen.getByRole('button'), { key: ' ' });
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('does not call onSelect on other key press', () => {
    const onSelect = jest.fn();
    render(<DocumentCard document={makeDoc()} isSelected={false} onSelect={onSelect} />);

    fireEvent.keyDown(screen.getByRole('button'), { key: 'Tab' });
    expect(onSelect).not.toHaveBeenCalled();
  });

  describe('paperlessUrl prop — "Open in Paperless" anchor', () => {
    it('does not render a link when paperlessUrl is undefined', () => {
      render(<DocumentCard document={makeDoc()} isSelected={false} onSelect={jest.fn()} />);
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
    });

    it('does not render a link when paperlessUrl is null', () => {
      render(
        <DocumentCard
          document={makeDoc()}
          isSelected={false}
          onSelect={jest.fn()}
          paperlessUrl={null}
        />,
      );
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
    });

    it('renders an anchor link when paperlessUrl is provided', () => {
      render(
        <DocumentCard
          document={makeDoc()}
          isSelected={false}
          onSelect={jest.fn()}
          paperlessUrl="https://paperless.example.com"
        />,
      );
      expect(screen.getByRole('link')).toBeInTheDocument();
    });

    it('anchor href points to the correct Paperless document detail URL', () => {
      render(
        <DocumentCard
          document={makeDoc({ id: 42 })}
          isSelected={false}
          onSelect={jest.fn()}
          paperlessUrl="https://paperless.example.com"
        />,
      );
      const link = screen.getByRole('link') as HTMLAnchorElement;
      expect(link.href).toBe('https://paperless.example.com/documents/42/details');
    });

    it('anchor has target="_blank" for opening in a new tab', () => {
      render(
        <DocumentCard
          document={makeDoc()}
          isSelected={false}
          onSelect={jest.fn()}
          paperlessUrl="https://paperless.example.com"
        />,
      );
      const link = screen.getByRole('link') as HTMLAnchorElement;
      expect(link).toHaveAttribute('target', '_blank');
    });

    it('anchor has rel="noopener noreferrer"', () => {
      render(
        <DocumentCard
          document={makeDoc()}
          isSelected={false}
          onSelect={jest.fn()}
          paperlessUrl="https://paperless.example.com"
        />,
      );
      const link = screen.getByRole('link') as HTMLAnchorElement;
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('clicking the anchor does not trigger onSelect (stopPropagation)', () => {
      const onSelect = jest.fn();
      render(
        <DocumentCard
          document={makeDoc()}
          isSelected={false}
          onSelect={onSelect}
          paperlessUrl="https://paperless.example.com"
        />,
      );
      fireEvent.click(screen.getByRole('link'));
      expect(onSelect).not.toHaveBeenCalled();
    });

    it('pressing a key on the anchor does not trigger onSelect (onKeyDown stopPropagation)', () => {
      const onSelect = jest.fn();
      render(
        <DocumentCard
          document={makeDoc()}
          isSelected={false}
          onSelect={onSelect}
          paperlessUrl="https://paperless.example.com"
        />,
      );
      fireEvent.keyDown(screen.getByRole('link'), { key: 'Enter' });
      expect(onSelect).not.toHaveBeenCalled();
    });
  });

  it('hides thumbnail image on load error (onError handler)', () => {
    render(<DocumentCard document={makeDoc()} isSelected={false} onSelect={jest.fn()} />);
    const img = screen.getByAltText('Test Invoice 2025') as HTMLImageElement;
    // Trigger the image error event to exercise the onError handler (line coverage)
    fireEvent.error(img);
    expect(img.style.display).toBe('none');
  });
});
