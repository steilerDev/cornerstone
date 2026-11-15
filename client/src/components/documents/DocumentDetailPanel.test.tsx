import { render as rtlRender, screen, fireEvent } from '@testing-library/react';
import { jest } from '@jest/globals';
import type { ReactElement } from 'react';
import type * as DocumentDetailPanelModule from './DocumentDetailPanel.js';
import { LocaleProvider } from '../../contexts/LocaleContext.js';

/**
 * Custom render function that wraps the component with LocaleProvider —
 * DocumentDetailPanel uses useFormatters() (via useLocale()), which throws
 * outside a LocaleProvider. See DateRangePicker.test.tsx for the reference pattern.
 */
function render(ui: ReactElement, options?: Parameters<typeof rtlRender>[1]) {
  return rtlRender(<LocaleProvider>{ui}</LocaleProvider>, options);
}

const mockGetDocumentThumbnailUrl = jest.fn<(id: number) => string>();

jest.unstable_mockModule('../../lib/paperlessApi.js', () => ({
  getPaperlessStatus: jest.fn(),
  listPaperlessDocuments: jest.fn(),
  listPaperlessTags: jest.fn(),
  getPaperlessDocument: jest.fn(),
  getDocumentThumbnailUrl: mockGetDocumentThumbnailUrl,
  getDocumentPreviewUrl: jest.fn(),
}));

let mockEntriesLanguage: string | null = null;

jest.unstable_mockModule('../../contexts/HouseNameContext.js', () => ({
  useEntriesLanguage: () => mockEntriesLanguage,
}));

let DocumentDetailPanel: (typeof DocumentDetailPanelModule)['DocumentDetailPanel'];

beforeEach(async () => {
  ({ DocumentDetailPanel } =
    (await import('./DocumentDetailPanel.js')) as typeof DocumentDetailPanelModule);
  mockGetDocumentThumbnailUrl.mockReset();
  mockGetDocumentThumbnailUrl.mockImplementation((id) => `/api/paperless/documents/${id}/thumb`);
  mockEntriesLanguage = null;
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
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
    render(
      <DocumentDetailPanel document={makeDoc({ created: '2025-01-01' })} onClose={jest.fn()} />,
    );
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
    render(
      <DocumentDetailPanel document={makeDoc({ content: longContent })} onClose={jest.fn()} />,
    );
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
    render(<DocumentDetailPanel document={makeDoc({ created: null })} onClose={jest.fn()} />);
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

  // ─── variant prop (Story #1564) ────────────────────────────────────────────

  describe('variant prop', () => {
    it('default variant (no variant prop) shows close button', () => {
      render(<DocumentDetailPanel document={makeDoc()} onClose={jest.fn()} />);
      expect(screen.getByRole('button', { name: /close document details/i })).toBeInTheDocument();
    });

    it('variant="standalone" (explicit) shows close button', () => {
      render(<DocumentDetailPanel document={makeDoc()} onClose={jest.fn()} variant="standalone" />);
      expect(screen.getByRole('button', { name: /close document details/i })).toBeInTheDocument();
    });

    it('variant="sidebyside" does NOT show close button', () => {
      render(<DocumentDetailPanel document={makeDoc()} variant="sidebyside" />);
      expect(
        screen.queryByRole('button', { name: /close document details/i }),
      ).not.toBeInTheDocument();
    });

    it('variant="sidebyside" renders without errors even when onClose is omitted', () => {
      expect(() => {
        render(<DocumentDetailPanel document={makeDoc()} variant="sidebyside" />);
      }).not.toThrow();
    });

    it('variant="sidebyside" still renders document title', () => {
      render(<DocumentDetailPanel document={makeDoc()} variant="sidebyside" />);
      expect(screen.getByRole('heading', { name: 'Annual Report 2025' })).toBeInTheDocument();
    });

    it('variant="standalone" calls onClose when close button is clicked', () => {
      const onClose = jest.fn();
      render(<DocumentDetailPanel document={makeDoc()} onClose={onClose} variant="standalone" />);
      fireEvent.click(screen.getByRole('button', { name: /close document details/i }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  // ─── UTC-midnight-shift regression (Issue #1813, Scenario 10) ──────────────

  it('renders "February 24, 2026" (not Feb 23 or Feb 25) for created="2026-02-24"', () => {
    render(
      <DocumentDetailPanel document={makeDoc({ created: '2026-02-24' })} onClose={jest.fn()} />,
    );
    expect(screen.getByText('February 24, 2026')).toBeInTheDocument();
    expect(screen.queryByText('February 23, 2026')).not.toBeInTheDocument();
    expect(screen.queryByText('February 25, 2026')).not.toBeInTheDocument();
  });

  // ─── de-DE locale (Issue #1813) ──────────────────────────────────────────────

  describe('de-DE locale', () => {
    it('renders the full German month name for the created date (long monthStyle)', () => {
      localStorage.setItem('locale', 'de');
      render(
        <DocumentDetailPanel document={makeDoc({ created: '2026-02-24' })} onClose={jest.fn()} />,
      );
      expect(screen.getByText(/Februar/)).toBeInTheDocument();
      expect(screen.queryByText(/^Feb /)).not.toBeInTheDocument();
    });

    it('renders the full German month name for a May date (diverges from English)', () => {
      localStorage.setItem('locale', 'de');
      render(
        <DocumentDetailPanel document={makeDoc({ created: '2026-05-24' })} onClose={jest.fn()} />,
      );
      expect(screen.getByText(/Mai/)).toBeInTheDocument();
      expect(screen.queryByText(/May/)).not.toBeInTheDocument();
    });

    it('does not render undefined/NaN under de-DE locale', () => {
      localStorage.setItem('locale', 'de');
      render(
        <DocumentDetailPanel document={makeDoc({ created: '2026-02-24' })} onClose={jest.fn()} />,
      );
      expect(screen.queryByText(/undefined/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/\bNaN\b/)).not.toBeInTheDocument();
    });
  });

  describe('user text (AC6)', () => {
    it('tags the title and the text preview with the entries language and the user-text class', () => {
      mockEntriesLanguage = 'de';
      render(<DocumentDetailPanel document={makeDoc()} onClose={jest.fn()} />);

      const title = screen.getByRole('heading', { name: 'Annual Report 2025' });
      expect(title).toHaveAttribute('lang', 'de');
      expect(title.className).toContain('userText');
      const preview = screen.getByText(/full content of the annual report/);
      expect(preview).toHaveAttribute('lang', 'de');
      expect(preview.className).toContain('userText');
    });

    it('keeps the class but sets no lang while the entries language is unknown', () => {
      render(<DocumentDetailPanel document={makeDoc()} onClose={jest.fn()} />);

      const title = screen.getByRole('heading', { name: 'Annual Report 2025' });
      expect(title).not.toHaveAttribute('lang');
      expect(title.className).toContain('userText');
    });
  });

  describe('inline', () => {
    it('renders no title row, Close button, thumbnail or fixed element id', () => {
      render(<DocumentDetailPanel inline document={makeDoc()} onClose={jest.fn()} />);

      const region = screen.getByRole('region', { name: /Details for Annual Report 2025/i });
      expect(region).not.toHaveAttribute('id');
      expect(region.className).toContain('inline');
      expect(screen.queryByRole('heading', { name: 'Annual Report 2025' })).toBeNull();
      expect(screen.queryByRole('button', { name: /close/i })).toBeNull();
      expect(screen.queryByRole('img')).toBeNull();
    });

    it('still shows the metadata and the text preview', () => {
      render(<DocumentDetailPanel inline document={makeDoc()} />);

      expect(screen.getByText('Finance Dept')).toBeInTheDocument();
      expect(screen.getByText(/full content of the annual report/)).toBeInTheDocument();
    });

    it('the default (not inline) keeps id="detail-panel", the title row and the thumbnail', () => {
      render(<DocumentDetailPanel document={makeDoc()} onClose={jest.fn()} />);

      expect(screen.getByRole('region')).toHaveAttribute('id', 'detail-panel');
      expect(screen.getByRole('img', { name: 'Annual Report 2025' })).toBeInTheDocument();
    });
  });

  describe('variant="sheet" (#2252)', () => {
    const sheet = (overrides = {}, props: Record<string, unknown> = {}) =>
      render(<DocumentDetailPanel variant="sheet" document={makeDoc(overrides)} {...props} />);

    it('renders no title row, no Close button and no region or fixed id (the side panel is the container)', () => {
      const { container } = sheet({}, { onClose: jest.fn() });

      expect(screen.queryByRole('heading', { name: 'Annual Report 2025' })).toBeNull();
      expect(screen.queryByRole('button', { name: /close/i })).toBeNull();
      expect(screen.queryByRole('region')).toBeNull();
      const panel = container.firstElementChild!;
      expect(panel).not.toHaveAttribute('id');
      expect(panel).not.toHaveAttribute('aria-label');
      expect(panel).not.toHaveAttribute('role');
      expect(panel.className).toContain('sheet');
    });

    it('keeps the thumbnail with the title as alt text, loaded lazily', () => {
      sheet();

      const img = screen.getByRole('img', { name: 'Annual Report 2025' });
      expect(img).toHaveAttribute('src', '/api/paperless/documents/42/thumb');
      expect(img).toHaveAttribute('loading', 'lazy');
    });

    it('shows Added and Last modified after Pages, with formatted dates', () => {
      sheet({ added: '2025-03-04T09:00:00Z', modified: '2025-05-06T09:00:00Z' });

      const labels = Array.from(document.querySelectorAll('dt')).map((dt) => dt.textContent);
      expect(labels).toEqual([
        'Created',
        'Correspondent',
        'Document Type',
        'Archive #',
        'Pages',
        'Added',
        'Last modified',
        'Tags',
      ]);
      const added = screen.getByText('Added').nextElementSibling!;
      const modified = screen.getByText('Last modified').nextElementSibling!;
      expect(added.textContent).toMatch(/2025/);
      expect(added.textContent).toMatch(/3|Mar/);
      expect(modified.textContent).toMatch(/2025/);
      expect(modified.textContent).toMatch(/5|May/);
      expect(added.textContent).not.toBe(modified.textContent);
    });

    it('omits Added when it is null and Last modified when it is null', () => {
      sheet({ added: null, modified: null });

      expect(screen.queryByText('Added')).toBeNull();
      expect(screen.queryByText('Last modified')).toBeNull();
    });

    it('omits only the row whose date is missing', () => {
      sheet({ added: null });

      expect(screen.queryByText('Added')).toBeNull();
      expect(screen.getByText('Last modified')).toBeInTheDocument();
    });

    it('does not add Added or Last modified to the standalone, side-by-side or inline variants', () => {
      for (const props of [{}, { variant: 'sidebyside' as const }, { inline: true }]) {
        const { unmount } = render(<DocumentDetailPanel document={makeDoc()} {...props} />);
        expect(screen.queryByText('Added')).toBeNull();
        expect(screen.queryByText('Last modified')).toBeNull();
        unmount();
      }
    });

    it('renders the content preview heading as an h3, the other variants as an h4', () => {
      const { unmount } = sheet();
      expect(
        screen.getByRole('heading', { level: 3, name: 'Content Preview' }),
      ).toBeInTheDocument();
      expect(screen.queryByRole('heading', { level: 4 })).toBeNull();
      unmount();

      render(<DocumentDetailPanel document={makeDoc()} onClose={jest.fn()} />);
      expect(
        screen.getByRole('heading', { level: 4, name: 'Content Preview' }),
      ).toBeInTheDocument();
    });

    it('renders no content preview section when the content is empty', () => {
      sheet({ content: null });

      expect(screen.queryByText('Content Preview')).toBeNull();
    });

    it('truncates a long preview at 300 characters with an ellipsis', () => {
      sheet({ content: 'x'.repeat(400) });

      expect(screen.getByText(`${'x'.repeat(300)}...`)).toBeInTheDocument();
    });

    it('offers Open in Paperless as a new-tab link with a screen-reader hint', () => {
      sheet({}, { paperlessBaseUrl: 'https://paperless.example.test' });

      const link = screen.getByRole('link', { name: 'Open in Paperless (opens in a new tab)' });
      expect(link).toHaveAttribute('href', 'https://paperless.example.test/documents/42/details');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      expect(link.querySelector('span')?.textContent).toBe('(opens in a new tab)');
    });

    it('omits Open in Paperless without a Paperless base URL', () => {
      sheet();

      expect(screen.queryByRole('link')).toBeNull();
    });

    it('does not use the "View in Paperless-ngx" link text of the other variants', () => {
      sheet({}, { paperlessBaseUrl: 'https://paperless.example.test' });
      expect(screen.queryByText(/View in Paperless-ngx/)).toBeNull();
    });

    it('keeps "View in Paperless-ngx" on the standalone variant', () => {
      render(
        <DocumentDetailPanel
          document={makeDoc()}
          onClose={jest.fn()}
          paperlessBaseUrl="https://paperless.example.test"
        />,
      );

      const link = screen.getByRole('link', { name: /View in Paperless-ngx/ });
      expect(link).toHaveAttribute('href', 'https://paperless.example.test/documents/42/details');
      expect(screen.queryByText('(opens in a new tab)')).toBeNull();
    });

    it('shows the tags and the other metadata like the other variants', () => {
      sheet();

      expect(screen.getByText('Finance')).toBeInTheDocument();
      expect(screen.getByText('Annual')).toBeInTheDocument();
      expect(screen.getByText('Finance Dept')).toBeInTheDocument();
      expect(screen.getByText('Report')).toBeInTheDocument();
    });
  });
});
