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
  attachmentType: null,
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

  it('"Details" button renders with "Details" text label (not "View")', () => {
    render(
      <LinkedDocumentCard
        link={makeLink()}
        paperlessBaseUrl={null}
        onView={jest.fn()}
        onUnlink={jest.fn()}
      />,
    );
    // The button label is now "Details", not "View" (Story #1564 rename)
    expect(
      screen.getByRole('button', { name: /View details: Invoice March/i }),
    ).toBeInTheDocument();
  });

  it('"Details" button calls onView prop with the link', () => {
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
    fireEvent.click(screen.getByRole('button', { name: /View details: Invoice March/i }));
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

  it('falls back to thumbFallback icon when thumbnail image load fails', () => {
    render(
      <LinkedDocumentCard
        link={makeLink()}
        paperlessBaseUrl={null}
        onView={jest.fn()}
        onUnlink={jest.fn()}
      />,
    );
    const img = document.querySelector('img');
    expect(img).toBeInTheDocument();
    // Fire the onError event to trigger setThumbError(true)
    fireEvent.error(img!);
    // After error, the fallback div should appear and the img should be gone
    expect(document.querySelector('img')).not.toBeInTheDocument();
    expect(document.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
  });

  // ─── Overlay unlink button (Story #1680) ─────────────────────────────────

  describe('overlay unlink button', () => {
    it('overlay unlink button is in the thumb container, not the footer actions', () => {
      render(
        <LinkedDocumentCard
          link={makeLink()}
          paperlessBaseUrl={null}
          onView={jest.fn()}
          onUnlink={jest.fn()}
        />,
      );
      const unlinkBtn = screen.getByRole('button', { name: /Unlink document: Invoice March/i });
      const viewBtn = screen.getByRole('button', { name: /View details: Invoice March/i });
      expect(unlinkBtn.parentElement).not.toBe(viewBtn.parentElement);
    });

    it('unlink button aria-label includes the document title exactly', () => {
      render(
        <LinkedDocumentCard
          link={makeLink()}
          paperlessBaseUrl={null}
          onView={jest.fn()}
          onUnlink={jest.fn()}
        />,
      );
      const unlinkBtn = screen.getByRole('button', { name: /Unlink document: Invoice March/i });
      expect(unlinkBtn.getAttribute('aria-label')).toBe('Unlink document: Invoice March');
    });

    it('overlay unlink button has type="button"', () => {
      render(
        <LinkedDocumentCard
          link={makeLink()}
          paperlessBaseUrl={null}
          onView={jest.fn()}
          onUnlink={jest.fn()}
        />,
      );
      const unlinkBtn = screen.getByRole('button', { name: /Unlink document: Invoice March/i });
      expect(unlinkBtn).toHaveAttribute('type', 'button');
    });

    it('only one unlink button exists (footer unlink button was removed)', () => {
      render(
        <LinkedDocumentCard
          link={makeLink()}
          paperlessBaseUrl={null}
          onView={jest.fn()}
          onUnlink={jest.fn()}
        />,
      );
      expect(screen.queryAllByRole('button', { name: /Unlink document/i })).toHaveLength(1);
    });

    it('overlay unlink button renders even when link.document is null', () => {
      render(
        <LinkedDocumentCard
          link={makeLink({ document: null })}
          paperlessBaseUrl={null}
          onView={jest.fn()}
          onUnlink={jest.fn()}
        />,
      );
      expect(screen.getByRole('button', { name: /Unlink document/i })).toBeInTheDocument();
    });
  });

  // ─── Itemize button (Story #1564) ─────────────────────────────────────────

  describe('Itemize button', () => {
    it('renders Itemize button when onItemize prop is provided', () => {
      render(
        <LinkedDocumentCard
          link={makeLink()}
          paperlessBaseUrl={null}
          onView={jest.fn()}
          onUnlink={jest.fn()}
          onItemize={jest.fn()}
        />,
      );
      // The Itemize button should be visible
      expect(screen.getByRole('button', { name: /Itemize.*Invoice March/i })).toBeInTheDocument();
    });

    it('does NOT render Itemize button when onItemize prop is omitted', () => {
      render(
        <LinkedDocumentCard
          link={makeLink()}
          paperlessBaseUrl={null}
          onView={jest.fn()}
          onUnlink={jest.fn()}
          // no onItemize
        />,
      );
      expect(screen.queryByRole('button', { name: /Itemize/i })).not.toBeInTheDocument();
    });

    it('calls onItemize with the link when Itemize button is clicked', () => {
      const onItemize = jest.fn();
      const link = makeLink();
      render(
        <LinkedDocumentCard
          link={link}
          paperlessBaseUrl={null}
          onView={jest.fn()}
          onUnlink={jest.fn()}
          onItemize={onItemize}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: /Itemize.*Invoice March/i }));
      expect(onItemize).toHaveBeenCalledWith(link);
    });

    it('Itemize button aria-label includes document title', () => {
      render(
        <LinkedDocumentCard
          link={makeLink()}
          paperlessBaseUrl={null}
          onView={jest.fn()}
          onUnlink={jest.fn()}
          onItemize={jest.fn()}
        />,
      );
      const btn = screen.getByRole('button', { name: /Itemize.*Invoice March/i });
      expect(btn.getAttribute('aria-label')).toContain('Invoice March');
    });

    it('Itemize button has type="button" to prevent accidental form submit', () => {
      render(
        <LinkedDocumentCard
          link={makeLink()}
          paperlessBaseUrl={null}
          onView={jest.fn()}
          onUnlink={jest.fn()}
          onItemize={jest.fn()}
        />,
      );
      expect(screen.getByRole('button', { name: /Itemize.*Invoice March/i })).toHaveAttribute(
        'type',
        'button',
      );
    });

    it('Itemize button is NOT shown when document is null (even with onItemize provided)', () => {
      render(
        <LinkedDocumentCard
          link={makeLink({ document: null })}
          paperlessBaseUrl={null}
          onView={jest.fn()}
          onUnlink={jest.fn()}
          onItemize={jest.fn()}
        />,
      );
      expect(screen.queryByRole('button', { name: /Itemize/i })).not.toBeInTheDocument();
    });
  });

  // ─── Attachment type badge and select (Story #1877) ──────────────────────

  describe('attachment type badge and select', () => {
    it('does not render a badge or select when onAttachmentTypeChange is omitted', () => {
      render(
        <LinkedDocumentCard
          link={makeLink({ attachmentType: 'quotation' })}
          paperlessBaseUrl={null}
          onView={jest.fn()}
          onUnlink={jest.fn()}
        />,
      );
      expect(screen.queryByTestId('attachment-type-badge-link-1')).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/Tag document type/i)).not.toBeInTheDocument();
    });

    it('renders the select when onAttachmentTypeChange is provided', () => {
      render(
        <LinkedDocumentCard
          link={makeLink()}
          paperlessBaseUrl={null}
          onView={jest.fn()}
          onUnlink={jest.fn()}
          onAttachmentTypeChange={jest.fn()}
        />,
      );
      expect(screen.getByLabelText(/Tag document type: Invoice March/i)).toBeInTheDocument();
    });

    it('does not render a badge when link.attachmentType is null (untagged)', () => {
      render(
        <LinkedDocumentCard
          link={makeLink({ attachmentType: null })}
          paperlessBaseUrl={null}
          onView={jest.fn()}
          onUnlink={jest.fn()}
          onAttachmentTypeChange={jest.fn()}
        />,
      );
      expect(screen.queryByTestId('attachment-type-badge-link-1')).not.toBeInTheDocument();
    });

    it('renders a "Quotation" badge with the correct variant class when tagged "quotation"', () => {
      render(
        <LinkedDocumentCard
          link={makeLink({ attachmentType: 'quotation' })}
          paperlessBaseUrl={null}
          onView={jest.fn()}
          onUnlink={jest.fn()}
          onAttachmentTypeChange={jest.fn()}
        />,
      );
      const badge = screen.getByTestId('attachment-type-badge-link-1');
      expect(badge).toHaveTextContent('Quotation');
      expect(badge.className).toContain('attachmentQuotation');
    });

    it('renders a "Deposit" badge with the correct variant class when tagged "deposit"', () => {
      render(
        <LinkedDocumentCard
          link={makeLink({ attachmentType: 'deposit' })}
          paperlessBaseUrl={null}
          onView={jest.fn()}
          onUnlink={jest.fn()}
          onAttachmentTypeChange={jest.fn()}
        />,
      );
      const badge = screen.getByTestId('attachment-type-badge-link-1');
      expect(badge).toHaveTextContent('Deposit');
      expect(badge.className).toContain('attachmentDeposit');
    });

    it('renders an "Invoice" badge with the correct variant class when tagged "invoice"', () => {
      render(
        <LinkedDocumentCard
          link={makeLink({ attachmentType: 'invoice' })}
          paperlessBaseUrl={null}
          onView={jest.fn()}
          onUnlink={jest.fn()}
          onAttachmentTypeChange={jest.fn()}
        />,
      );
      const badge = screen.getByTestId('attachment-type-badge-link-1');
      expect(badge).toHaveTextContent('Invoice');
      expect(badge.className).toContain('attachmentInvoice');
    });

    it('select value reflects link.attachmentType', () => {
      render(
        <LinkedDocumentCard
          link={makeLink({ attachmentType: 'deposit' })}
          paperlessBaseUrl={null}
          onView={jest.fn()}
          onUnlink={jest.fn()}
          onAttachmentTypeChange={jest.fn()}
        />,
      );
      const select = screen.getByLabelText(
        /Tag document type: Invoice March/i,
      ) as HTMLSelectElement;
      expect(select.value).toBe('deposit');
    });

    it('select value is empty string when link.attachmentType is null', () => {
      render(
        <LinkedDocumentCard
          link={makeLink({ attachmentType: null })}
          paperlessBaseUrl={null}
          onView={jest.fn()}
          onUnlink={jest.fn()}
          onAttachmentTypeChange={jest.fn()}
        />,
      );
      const select = screen.getByLabelText(
        /Tag document type: Invoice March/i,
      ) as HTMLSelectElement;
      expect(select.value).toBe('');
    });

    it('select offers "No tag", "Quotation", "Deposit", "Invoice" options', () => {
      render(
        <LinkedDocumentCard
          link={makeLink()}
          paperlessBaseUrl={null}
          onView={jest.fn()}
          onUnlink={jest.fn()}
          onAttachmentTypeChange={jest.fn()}
        />,
      );
      const select = screen.getByLabelText(
        /Tag document type: Invoice March/i,
      ) as HTMLSelectElement;
      const optionTexts = Array.from(select.options).map((o) => o.text);
      expect(optionTexts).toEqual(['No tag', 'Quotation', 'Deposit', 'Invoice']);
    });

    it('changing the select to "Quotation" calls onAttachmentTypeChange with (link, "quotation")', () => {
      const onAttachmentTypeChange = jest.fn();
      const link = makeLink({ attachmentType: null });
      render(
        <LinkedDocumentCard
          link={link}
          paperlessBaseUrl={null}
          onView={jest.fn()}
          onUnlink={jest.fn()}
          onAttachmentTypeChange={onAttachmentTypeChange}
        />,
      );
      const select = screen.getByLabelText(/Tag document type: Invoice March/i);
      fireEvent.change(select, { target: { value: 'quotation' } });
      expect(onAttachmentTypeChange).toHaveBeenCalledWith(link, 'quotation');
    });

    it('changing the select to "No tag" calls onAttachmentTypeChange with (link, null)', () => {
      const onAttachmentTypeChange = jest.fn();
      const link = makeLink({ attachmentType: 'quotation' });
      render(
        <LinkedDocumentCard
          link={link}
          paperlessBaseUrl={null}
          onView={jest.fn()}
          onUnlink={jest.fn()}
          onAttachmentTypeChange={onAttachmentTypeChange}
        />,
      );
      const select = screen.getByLabelText(/Tag document type: Invoice March/i);
      fireEvent.change(select, { target: { value: '' } });
      expect(onAttachmentTypeChange).toHaveBeenCalledWith(link, null);
    });

    it('select is disabled when isUpdatingAttachmentType is true', () => {
      render(
        <LinkedDocumentCard
          link={makeLink()}
          paperlessBaseUrl={null}
          onView={jest.fn()}
          onUnlink={jest.fn()}
          onAttachmentTypeChange={jest.fn()}
          isUpdatingAttachmentType={true}
        />,
      );
      const select = screen.getByLabelText(/Tag document type: Invoice March/i);
      expect(select).toBeDisabled();
    });

    it('select is not disabled when isUpdatingAttachmentType is false or omitted', () => {
      render(
        <LinkedDocumentCard
          link={makeLink()}
          paperlessBaseUrl={null}
          onView={jest.fn()}
          onUnlink={jest.fn()}
          onAttachmentTypeChange={jest.fn()}
        />,
      );
      const select = screen.getByLabelText(/Tag document type: Invoice March/i);
      expect(select).not.toBeDisabled();
    });
  });
});
