import { render as rtlRender, screen, fireEvent } from '@testing-library/react';
import { jest } from '@jest/globals';
import type { ReactElement } from 'react';
import type * as LinkedDocumentCardModule from './LinkedDocumentCard.js';
import type { DocumentLinkWithMetadata } from '@cornerstone/shared';
import { LocaleProvider } from '../../contexts/LocaleContext.js';

function render(ui: ReactElement) {
  return rtlRender(<LocaleProvider>{ui}</LocaleProvider>);
}

const mockGetDocumentThumbnailUrl = jest.fn<(id: number) => string>();
let mockEntriesLanguage: string | null = null;

jest.unstable_mockModule('../../lib/paperlessApi.js', () => ({
  getPaperlessStatus: jest.fn(),
  listPaperlessDocuments: jest.fn(),
  listPaperlessTags: jest.fn(),
  getPaperlessDocument: jest.fn(),
  getDocumentThumbnailUrl: mockGetDocumentThumbnailUrl,
  getDocumentPreviewUrl: jest.fn(),
}));

jest.unstable_mockModule('../../contexts/HouseNameContext.js', () => ({
  useEntriesLanguage: () => mockEntriesLanguage,
}));

let LinkedDocumentCard: (typeof LinkedDocumentCardModule)['LinkedDocumentCard'];

beforeEach(async () => {
  ({ LinkedDocumentCard } =
    (await import('./LinkedDocumentCard.js')) as typeof LinkedDocumentCardModule);
  mockGetDocumentThumbnailUrl.mockReset();
  mockGetDocumentThumbnailUrl.mockImplementation((id) => `/api/paperless/documents/${id}/thumb`);
  mockEntriesLanguage = null;
  localStorage.clear();
});

afterEach(() => {
  jest.restoreAllMocks();
  localStorage.clear();
});

const makeDoc = (overrides = {}) => ({
  id: 42,
  title: 'Sample offer.pdf',
  content: 'Sample preview text of the offer.',
  tags: [{ id: 1, name: 'Offer', color: null, documentCount: 5 }],
  created: '2026-01-15',
  added: null,
  modified: null,
  correspondent: 'Fixture Company',
  documentType: null,
  archiveSerialNumber: null,
  originalFileName: null,
  pageCount: null,
  ...overrides,
});

const makeLink = (overrides: Partial<DocumentLinkWithMetadata> = {}): DocumentLinkWithMetadata => ({
  id: 'link-1',
  entityType: 'work_item',
  entityId: 'wi-1',
  paperlessDocumentId: 42,
  attachmentType: null,
  createdBy: null,
  createdAt: '2026-01-01T00:00:00Z',
  document: makeDoc(),
  ...overrides,
});

const BASE = 'https://paperless.example.test';

const openMenu = () => fireEvent.click(screen.getByTestId('document-menu-link-1'));

describe('LinkedDocumentCard', () => {
  describe('row content', () => {
    it('renders the document title as a heading with the meta line (date and correspondent)', () => {
      render(<LinkedDocumentCard link={makeLink()} paperlessBaseUrl={null} />);

      expect(screen.getByRole('heading', { name: 'Sample offer.pdf' })).toBeInTheDocument();
      expect(screen.getByText(/Jan 15, 2026/)).toBeInTheDocument();
      expect(screen.getByText('Fixture Company')).toBeInTheDocument();
      expect(screen.getByText(/·/)).toBeInTheDocument();
    });

    it('omits the separator and meta line parts that are missing', () => {
      const { rerender } = render(
        <LinkedDocumentCard
          link={makeLink({ document: makeDoc({ correspondent: null }) })}
          paperlessBaseUrl={null}
        />,
      );
      expect(screen.getByText(/Jan 15, 2026/)).toBeInTheDocument();
      expect(screen.queryByText(/·/)).toBeNull();

      rerender(
        <LocaleProvider>
          <LinkedDocumentCard
            link={makeLink({ document: makeDoc({ created: null }) })}
            paperlessBaseUrl={null}
          />
        </LocaleProvider>,
      );
      expect(screen.getByText('Fixture Company')).toBeInTheDocument();
      expect(screen.queryByText(/Jan 15, 2026/)).toBeNull();
      expect(screen.queryByText(/·/)).toBeNull();

      rerender(
        <LocaleProvider>
          <LinkedDocumentCard
            link={makeLink({ document: makeDoc({ created: null, correspondent: null }) })}
            paperlessBaseUrl={null}
          />
        </LocaleProvider>,
      );
      expect(screen.queryByText('Fixture Company')).toBeNull();
    });

    it('renders the thumbnail and falls back to the placeholder when it fails to load', () => {
      const { container } = render(
        <LinkedDocumentCard link={makeLink()} paperlessBaseUrl={null} />,
      );
      const img = container.querySelector('img');
      expect(img).toHaveAttribute('src', '/api/paperless/documents/42/thumb');

      fireEvent.error(img as HTMLImageElement);

      expect(container.querySelector('img')).toBeNull();
      expect(screen.getByText('📄')).toBeInTheDocument();
    });

    it('shows the fallback title and placeholder when the document is unavailable', () => {
      const { container } = render(
        <LinkedDocumentCard
          link={makeLink({ document: null, paperlessDocumentId: 12 })}
          paperlessBaseUrl={BASE}
          onUnlink={jest.fn()}
          onItemize={jest.fn()}
        />,
      );

      expect(screen.getByRole('heading', { name: 'Document #12' })).toBeInTheDocument();
      expect(container.querySelector('img')).toBeNull();
      expect(screen.getByText('📄')).toBeInTheDocument();
      expect(screen.queryByTestId('document-details-link-1')).toBeNull();
    });
  });

  describe('user text (AC6)', () => {
    it('tags the document title and correspondent with the entries language', () => {
      mockEntriesLanguage = 'de';
      render(<LinkedDocumentCard link={makeLink()} paperlessBaseUrl={null} />);

      const title = screen.getByRole('heading', { name: 'Sample offer.pdf' });
      expect(title).toHaveAttribute('lang', 'de');
      expect(title.className).toContain('userText');
      expect(screen.getByText('Fixture Company')).toHaveAttribute('lang', 'de');
    });

    it('does not tag the translated fallback title', () => {
      mockEntriesLanguage = 'de';
      render(
        <LinkedDocumentCard
          link={makeLink({ document: null, paperlessDocumentId: 12 })}
          paperlessBaseUrl={null}
        />,
      );

      const title = screen.getByRole('heading', { name: 'Document #12' });
      expect(title).not.toHaveAttribute('lang');
      expect(title.className).not.toContain('userText');
    });
  });

  describe('no overlay controls', () => {
    it('has no unlink cross, view overlay or Open-in-Paperless button on the thumbnail', () => {
      render(
        <LinkedDocumentCard
          link={makeLink()}
          paperlessBaseUrl={BASE}
          onUnlink={jest.fn()}
          onItemize={jest.fn()}
        />,
      );

      expect(screen.queryByText('✕')).toBeNull();
      expect(screen.queryByText('↗')).toBeNull();
      expect(screen.queryByTestId('document-unlink-link-1')).toBeNull();
    });
  });

  describe('⋯ menu', () => {
    it('names the trigger for the document', () => {
      render(<LinkedDocumentCard link={makeLink()} paperlessBaseUrl={BASE} onUnlink={jest.fn()} />);

      expect(
        screen.getByRole('button', { name: 'Actions for Sample offer.pdf' }),
      ).toBeInTheDocument();
    });

    it('lists Open in Paperless (new tab), Itemize, a separator and a destructive Unlink', () => {
      render(
        <LinkedDocumentCard
          link={makeLink()}
          paperlessBaseUrl={BASE}
          onUnlink={jest.fn()}
          onItemize={jest.fn()}
        />,
      );
      openMenu();

      const open = screen.getByTestId('document-open-link-1');
      expect(open).toHaveAttribute('href', `${BASE}/documents/42/details`);
      expect(open).toHaveAttribute('target', '_blank');
      expect(open).toHaveTextContent('(opens in a new tab)');
      expect(screen.getByTestId('document-itemize-link-1')).toHaveTextContent('Itemize');
      expect(screen.getByTestId('document-unlink-link-1')).toHaveTextContent('Unlink');
      expect(screen.getByRole('separator')).toBeInTheDocument();
    });

    it('calls onUnlink and onItemize with the link; Unlink needs no confirmation', () => {
      const onUnlink = jest.fn();
      const onItemize = jest.fn();
      const link = makeLink();
      render(
        <LinkedDocumentCard
          link={link}
          paperlessBaseUrl={BASE}
          onUnlink={onUnlink}
          onItemize={onItemize}
        />,
      );

      openMenu();
      fireEvent.click(screen.getByTestId('document-itemize-link-1'));
      expect(onItemize).toHaveBeenCalledWith(link.document!.id);

      openMenu();
      fireEvent.click(screen.getByTestId('document-unlink-link-1'));
      expect(onUnlink).toHaveBeenCalledWith(link);
      expect(screen.queryByRole('alertdialog')).toBeNull();
    });

    it('omits Open in Paperless without a base URL and the separator when Unlink is the only item', () => {
      render(<LinkedDocumentCard link={makeLink()} paperlessBaseUrl={null} onUnlink={jest.fn()} />);
      openMenu();

      expect(screen.queryByTestId('document-open-link-1')).toBeNull();
      expect(screen.queryByRole('separator')).toBeNull();
      expect(screen.getByTestId('document-unlink-link-1')).toBeInTheDocument();
    });

    it('has no Itemize item without onItemize and no Unlink without onUnlink', () => {
      render(<LinkedDocumentCard link={makeLink()} paperlessBaseUrl={BASE} />);
      openMenu();

      expect(screen.queryByTestId('document-itemize-link-1')).toBeNull();
      expect(screen.queryByTestId('document-unlink-link-1')).toBeNull();
      expect(screen.queryByRole('separator')).toBeNull();
      expect(screen.getByTestId('document-open-link-1')).toBeInTheDocument();
    });

    it('renders no menu at all when there are no items', () => {
      render(<LinkedDocumentCard link={makeLink()} paperlessBaseUrl={null} />);

      expect(screen.queryByTestId('document-menu-link-1')).toBeNull();
    });

    it('exposes the trigger through menuTriggerRef', () => {
      const ref = { current: null as HTMLButtonElement | null };
      render(
        <LinkedDocumentCard
          link={makeLink()}
          paperlessBaseUrl={BASE}
          onUnlink={jest.fn()}
          menuTriggerRef={ref}
        />,
      );

      expect(ref.current).toBe(screen.getByTestId('document-menu-link-1'));
    });

    it('only Unlink remains for a document that is unavailable (no Open, no Itemize)', () => {
      render(
        <LinkedDocumentCard
          link={makeLink({ document: null })}
          paperlessBaseUrl={BASE}
          onUnlink={jest.fn()}
          onItemize={jest.fn()}
        />,
      );
      openMenu();

      expect(screen.queryByTestId('document-open-link-1')).toBeNull();
      expect(screen.queryByTestId('document-itemize-link-1')).toBeNull();
      expect(screen.getByTestId('document-unlink-link-1')).toBeInTheDocument();
    });
  });

  describe('Details', () => {
    it('toggles the inline details (metadata and text preview, no title row) and aria-expanded', () => {
      render(<LinkedDocumentCard link={makeLink()} paperlessBaseUrl={BASE} />);
      const toggle = screen.getByTestId('document-details-link-1');

      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      expect(toggle).not.toHaveAttribute('aria-controls');
      expect(screen.queryByRole('region')).toBeNull();

      fireEvent.click(toggle);

      const region = screen.getByRole('region', { name: /Details for Sample offer.pdf/ });
      expect(toggle).toHaveAttribute('aria-expanded', 'true');
      expect(toggle).toHaveAttribute('aria-controls', region.parentElement?.id);
      expect(screen.getByText('Sample preview text of the offer.')).toBeInTheDocument();
      // Only the card title is a heading; the inline panel adds no title row.
      expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(1);

      fireEvent.click(toggle);

      expect(screen.queryByRole('region')).toBeNull();
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
    });
  });

  describe('document type (invoice links)', () => {
    const link = (attachmentType: DocumentLinkWithMetadata['attachmentType'] = null) =>
      makeLink({ entityType: 'invoice', attachmentType });

    it('renders the select with every option and an sr-only label naming the document', () => {
      render(
        <LinkedDocumentCard
          link={link()}
          paperlessBaseUrl={null}
          onAttachmentTypeChange={jest.fn()}
        />,
      );

      const select = screen.getByLabelText('Tag document type: Sample offer.pdf');
      expect(select).toHaveValue('');
      expect(
        Array.from((select as HTMLSelectElement).options).map((option) => option.value),
      ).toEqual(['', 'quotation', 'deposit', 'invoice']);
      expect(screen.queryByTestId('attachment-type-badge-link-1')).toBeNull();
    });

    it('shows the badge and the current value for a typed link', () => {
      render(
        <LinkedDocumentCard
          link={link('deposit')}
          paperlessBaseUrl={null}
          onAttachmentTypeChange={jest.fn()}
        />,
      );

      expect(screen.getByTestId('attachment-type-badge-link-1')).toHaveTextContent('Deposit');
      expect(screen.getByLabelText('Tag document type: Sample offer.pdf')).toHaveValue('deposit');
    });

    it('reports the chosen type, and null for "No tag"', () => {
      const onChange = jest.fn();
      const typed = link('invoice');
      render(
        <LinkedDocumentCard
          link={typed}
          paperlessBaseUrl={null}
          onAttachmentTypeChange={onChange}
        />,
      );
      const select = screen.getByLabelText('Tag document type: Sample offer.pdf');

      fireEvent.change(select, { target: { value: 'quotation' } });
      expect(onChange).toHaveBeenLastCalledWith(typed, 'quotation');

      fireEvent.change(select, { target: { value: '' } });
      expect(onChange).toHaveBeenLastCalledWith(typed, null);
    });

    it('disables the select while the update is running', () => {
      render(
        <LinkedDocumentCard
          link={link()}
          paperlessBaseUrl={null}
          onAttachmentTypeChange={jest.fn()}
          isUpdatingAttachmentType
        />,
      );

      expect(screen.getByLabelText('Tag document type: Sample offer.pdf')).toBeDisabled();
    });

    it('is absent without onAttachmentTypeChange', () => {
      render(<LinkedDocumentCard link={link('deposit')} paperlessBaseUrl={null} />);

      expect(screen.queryByLabelText(/Tag document type/)).toBeNull();
      expect(screen.queryByTestId('attachment-type-badge-link-1')).toBeNull();
    });
  });

  describe('readOnly', () => {
    it('shows title and meta only: no menu, Details or type control', () => {
      render(
        <LinkedDocumentCard
          link={makeLink({ entityType: 'invoice', attachmentType: 'deposit' })}
          paperlessBaseUrl={BASE}
          onUnlink={jest.fn()}
          onItemize={jest.fn()}
          onAttachmentTypeChange={jest.fn()}
          readOnly
        />,
      );

      expect(screen.getByRole('heading', { name: 'Sample offer.pdf' })).toBeInTheDocument();
      expect(screen.getByText('Fixture Company')).toBeInTheDocument();
      expect(screen.queryByTestId('document-menu-link-1')).toBeNull();
      expect(screen.queryByTestId('document-details-link-1')).toBeNull();
      expect(screen.queryByLabelText(/Tag document type/)).toBeNull();
      expect(screen.queryByTestId('attachment-type-badge-link-1')).toBeNull();
    });
  });
});
