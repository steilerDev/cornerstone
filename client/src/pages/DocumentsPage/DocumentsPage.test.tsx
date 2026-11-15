/**
 * @jest-environment jsdom
 *
 * The Documents page (#2252): Paperless library on the object-list template with a details side
 * panel (?doc=<id>). All data is synthetic.
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { PaperlessDocumentSearchResult } from '@cornerstone/shared';
import { ApiClientError } from '../../lib/apiClient.js';
import { ToastProvider } from '../../components/Toast/ToastContext.js';
import { ShortcutRegistryProvider } from '../../hooks/shortcutRegistry.js';
import { RecordingRouter, createRouterLog } from '../../test/recordingRouter.js';
import type { RouterLog } from '../../test/recordingRouter.js';
import { installMatchMedia } from '../../test/matchMediaControl.js';
import type { MatchMediaControl } from '../../test/matchMediaControl.js';
import { findDuplicateTestIds } from '../../test/findDuplicateTestIds.js';
import {
  makeDocument,
  makeDocumentDetail,
  makeLinkWithEntity,
  makePaperlessStatus,
  makeTag,
  plainEntity,
} from '../../test/documentsPageFixtures.js';
import type * as DocumentLinksApiTypes from '../../lib/documentLinksApi.js';
import type * as PaperlessApiTypes from '../../lib/paperlessApi.js';

// ─── Mocks (before the component import) ───────────────────────────────────────

const mockGetStatus = jest.fn<typeof PaperlessApiTypes.getPaperlessStatus>();
const mockListDocuments = jest.fn<typeof PaperlessApiTypes.listPaperlessDocuments>();
const mockListTypes = jest.fn<typeof PaperlessApiTypes.listPaperlessDocumentTypes>();
const mockListTags = jest.fn<typeof PaperlessApiTypes.listPaperlessTags>();
const mockGetDocument = jest.fn<typeof PaperlessApiTypes.getPaperlessDocument>();
jest.unstable_mockModule('../../lib/paperlessApi.js', () => ({
  getPaperlessStatus: mockGetStatus,
  listPaperlessDocuments: mockListDocuments,
  listPaperlessDocumentTypes: mockListTypes,
  listPaperlessTags: mockListTags,
  getPaperlessDocument: mockGetDocument,
  listPaperlessCorrespondents: jest.fn(),
  getDocumentThumbnailUrl: (id: number) => `/api/paperless/documents/${id}/thumb`,
  getDocumentPreviewUrl: (id: number) => `/api/paperless/documents/${id}/preview`,
}));

const mockListAllLinkedIds = jest.fn<typeof DocumentLinksApiTypes.listAllLinkedDocumentIds>();
const mockListForDocument = jest.fn<typeof DocumentLinksApiTypes.listDocumentLinksForDocument>();
const mockDeleteLink = jest.fn<typeof DocumentLinksApiTypes.deleteDocumentLink>();
jest.unstable_mockModule('../../lib/documentLinksApi.js', () => ({
  listAllLinkedDocumentIds: mockListAllLinkedIds,
  listDocumentLinksForDocument: mockListForDocument,
  createDocumentLink: jest.fn(),
  deleteDocumentLink: mockDeleteLink,
}));
jest.unstable_mockModule('../../lib/undoApi.js', () => ({ undoChange: jest.fn() }));

let mockRole: 'admin' | 'member' = 'admin';
jest.unstable_mockModule('../../contexts/AuthContext.js', () => ({
  useAuth: () => ({ user: { id: 'u1', role: mockRole } }),
}));
jest.unstable_mockModule('../../contexts/LocaleContext.js', () => ({
  useLocale: jest.fn(() => ({
    locale: 'en' as const,
    resolvedLocale: 'en' as const,
    vatRate: 0.19,
    currency: 'EUR',
    setLocale: jest.fn(),
    syncWithServer: jest.fn(),
  })),
  LocaleProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const DOC_7 = makeDocument(7, {
  title: 'Roof contract',
  documentType: 'Contract',
  tags: [makeTag(1, 'Roof'), makeTag(2, 'Permit')],
});
const DOC_8 = makeDocument(8, { title: 'Permit letter', documentType: 'Letter' });
const DOC_9 = makeDocument(9, { title: 'Floor plan', documentType: null });

const listPage = (documents: PaperlessDocumentSearchResult[], totalItems = documents.length) => ({
  documents,
  pagination: { page: 1, pageSize: 100, totalItems, totalPages: 1 },
});

// ─── Harness ──────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let DocumentsPage: any;
let media: MatchMediaControl;

function LocationProbe() {
  const location = useLocation();
  return (
    <>
      <output data-testid="loc">{`${location.pathname}${location.search}`}</output>
      <output data-testid="loc-state">{JSON.stringify(location.state)}</output>
    </>
  );
}

function BackButton() {
  const navigate = useNavigate();
  return (
    <button type="button" data-testid="go-back" onClick={() => void navigate(-1)}>
      back
    </button>
  );
}

function renderPage(url = '/documents', options: { state?: unknown; log?: RouterLog } = {}) {
  const log = options.log ?? createRouterLog();
  const view = render(
    <ToastProvider>
      <ShortcutRegistryProvider>
        <RecordingRouter entries={[options.state ? { url, state: options.state } : url]} log={log}>
          <DocumentsPage />
          <LocationProbe />
          <BackButton />
        </RecordingRouter>
      </ShortcutRegistryProvider>
    </ToastProvider>,
  );
  return { ...view, log };
}

const loc = () => screen.getByTestId('loc').textContent;
const heading = () => screen.getByRole('heading', { level: 1 });
const sheet = () => screen.queryByTestId('documents-library-sheet');
const lastList = () => mockListDocuments.mock.calls[mockListDocuments.mock.calls.length - 1]![0]!;

/** The status answered, the list is mounted and its first batch is in. */
async function loaded() {
  await screen.findByTestId('documents-library-search');
  await waitFor(() => expect(screen.queryByLabelText('Loading the list')).not.toBeInTheDocument());
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(async () => {
  if (!DocumentsPage) ({ DocumentsPage } = await import('./DocumentsPage.js'));
  window.sessionStorage.clear();
  window.localStorage.clear();
  mockRole = 'admin';
  media = installMatchMedia({ '(min-width: 768px)': true, '(min-width: 1440px)': false });
  for (const mock of [
    mockGetStatus,
    mockListDocuments,
    mockListTypes,
    mockListTags,
    mockGetDocument,
    mockListAllLinkedIds,
    mockListForDocument,
    mockDeleteLink,
  ]) {
    mock.mockReset();
  }
  mockGetStatus.mockResolvedValue(makePaperlessStatus());
  mockListDocuments.mockResolvedValue(listPage([DOC_7, DOC_8, DOC_9]));
  mockListTypes.mockResolvedValue({ documentTypes: [{ id: 3, name: 'Contract' }] });
  mockListTags.mockResolvedValue({ tags: [makeTag(1, 'Roof'), makeTag(2, 'Permit')] });
  mockListAllLinkedIds.mockResolvedValue([] as never);
  mockListForDocument.mockResolvedValue([]);
  mockDeleteLink.mockResolvedValue({ undo: { token: 'tok', expiresAt: '2026-01-01T00:00:30Z' } });
  mockGetDocument.mockImplementation((id: number) =>
    Promise.resolve({ document: makeDocumentDetail(id, { title: `Detail of ${id}` }) }),
  );
});

afterEach(() => {
  media.restore();
  jest.restoreAllMocks();
});

// ─── Status states ────────────────────────────────────────────────────────────

// The page's own live region is the only <p role="status"> (ObjectList's is a <div>).
const unavailableRegion = (): HTMLElement => {
  const region = screen.getAllByRole('status').find((el) => el.tagName === 'P');
  if (!region) throw new Error('page status live region missing');
  return region;
};

describe('page identity and the status states', () => {
  it('titles the tab "Documents" and has the one Documents heading', async () => {
    renderPage();
    await loaded();

    expect(document.title).toContain('Documents');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(heading()).toHaveTextContent('Documents');
  });

  it('shows the heading and a skeleton, and no list, until the status has answered', () => {
    mockGetStatus.mockReturnValue(new Promise(() => undefined));
    renderPage();

    expect(heading()).toHaveTextContent('Documents');
    expect(screen.getByLabelText('Loading...')).toBeInTheDocument();
    expect(mockListDocuments).not.toHaveBeenCalled();
    expect(screen.queryByTestId('documents-library-search')).not.toBeInTheDocument();
  });

  it('explains that Paperless is not connected, with the Integrations link for an admin', async () => {
    mockGetStatus.mockResolvedValue(makePaperlessStatus({ configured: false }));
    renderPage();

    expect(await screen.findByText('Paperless is not connected')).toBeVisible();
    expect(
      screen.getByText(/Documents come from Paperless, which is not connected right now\./),
    ).toBeVisible();
    expect(screen.getByTestId('documents-library-integrations-link')).toHaveAttribute(
      'href',
      expect.stringContaining('#paperless'),
    );
    expect(heading()).toHaveTextContent('Documents');
    expect(mockListDocuments).not.toHaveBeenCalled();
  });

  it('shows no Integrations link to a member when Paperless is not connected', async () => {
    mockRole = 'member';
    mockGetStatus.mockResolvedValue(makePaperlessStatus({ configured: false }));
    renderPage();

    await screen.findByText('Paperless is not connected');

    expect(screen.queryByTestId('documents-library-integrations-link')).toBeNull();
  });

  it('shows the unreachable alert with the fixed copy, never the server error text', async () => {
    mockGetStatus.mockResolvedValue(
      makePaperlessStatus({ reachable: false, error: 'connect ECONNREFUSED 10.0.0.5:8000' }),
    );
    renderPage();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Paperless-ngx Unreachable');
    expect(alert).toHaveTextContent('Unable to connect to your Paperless-ngx instance.');
    expect(document.body.textContent).not.toContain('ECONNREFUSED');
    expect(document.body.textContent).not.toContain('10.0.0.5');
    expect(heading()).toHaveTextContent('Documents');
    expect(screen.getByTestId('documents-library-integrations-link')).toBeInTheDocument();
  });

  it('renders neither the list nor its filters while unreachable', async () => {
    mockGetStatus.mockResolvedValue(makePaperlessStatus({ reachable: false }));
    renderPage();

    await screen.findByRole('alert');

    expect(mockListDocuments).not.toHaveBeenCalled();
    expect(screen.queryByTestId('documents-library-search')).toBeNull();
    expect(screen.queryByTestId('documents-library-filters-button')).toBeNull();
  });

  it('treats a failed status request like an unreachable Paperless', async () => {
    mockGetStatus.mockRejectedValue(new Error('boom'));
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('Paperless-ngx Unreachable');
    expect(document.body.textContent).not.toContain('boom');
  });

  it('Try Again asks again and shows the list once Paperless answers', async () => {
    mockGetStatus.mockResolvedValueOnce(makePaperlessStatus({ reachable: false }));
    renderPage();
    const retry = await screen.findByTestId('documents-library-retry');
    expect(retry).toHaveTextContent('Try Again');

    fireEvent.click(retry);

    expect(await screen.findByTestId('documents-library-row-7')).toBeInTheDocument();
    expect(mockGetStatus).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows the skeleton again while Try Again is waiting', async () => {
    mockGetStatus.mockResolvedValueOnce(makePaperlessStatus({ reachable: false }));
    renderPage();
    const retry = await screen.findByTestId('documents-library-retry');
    mockGetStatus.mockReturnValue(new Promise(() => undefined));

    fireEvent.click(retry);

    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByLabelText('Loading...')).toBeInTheDocument();
  });

  it('ignores a status answer that arrives after unmount', async () => {
    let resolve: (v: ReturnType<typeof makePaperlessStatus>) => void = () => undefined;
    mockGetStatus.mockReturnValue(new Promise((r) => (resolve = r)));
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const view = renderPage();
    view.unmount();

    resolve(makePaperlessStatus());
    await Promise.resolve();

    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('ignores a status failure that arrives after unmount', async () => {
    let reject: (e: Error) => void = () => undefined;
    mockGetStatus.mockReturnValue(new Promise((_, r) => (reject = r)));
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const view = renderPage();
    view.unmount();

    reject(new Error('late'));
    await Promise.resolve();

    expect(errorSpy).not.toHaveBeenCalled();
  });
});

// ─── The list ─────────────────────────────────────────────────────────────────

describe('the list', () => {
  it('renders the rows with the count, one search field and no primary button', async () => {
    renderPage();
    await loaded();

    expect(heading()).toHaveTextContent('Documents (3)');
    for (const id of [7, 8, 9]) {
      expect(screen.getByTestId(`documents-library-row-${id}`)).toBeInTheDocument();
    }
    expect(screen.getAllByTestId('documents-library-search')).toHaveLength(1);
    expect(screen.queryByTestId('documents-library-new')).toBeNull();
    expect(screen.queryByRole('button', { name: /^New/ })).toBeNull();
  });

  it('requests the first batch with the default sort, Date added newest first', async () => {
    renderPage();
    await loaded();

    expect(lastList()).toMatchObject({
      page: 1,
      pageSize: 100,
      sortBy: 'added',
      sortOrder: 'desc',
    });
  });

  it('shows the type, tags and the formatted document date of a row', async () => {
    renderPage();
    await loaded();

    const row = screen.getByTestId('documents-library-row-7');
    expect(row).toHaveTextContent('Roof contract');
    expect(row).toHaveTextContent('Contract');
    expect(row).toHaveTextContent('Roof');
    expect(row).toHaveTextContent('Permit');
    expect(row).toHaveTextContent('Feb 3, 2026');
  });

  it('shows the empty state when Paperless holds no documents', async () => {
    mockListDocuments.mockResolvedValue(listPage([]));
    renderPage();

    expect(await screen.findByText('No documents in Paperless yet.')).toBeVisible();
  });

  it('shows the no-match state for a search without results', async () => {
    mockListDocuments.mockResolvedValue(listPage([]));
    renderPage('/documents?q=nothing');

    expect(await screen.findByText('No documents match.')).toBeVisible();
  });

  it('shows the load failure with Retry that fetches the batch again', async () => {
    mockListDocuments.mockRejectedValueOnce(new Error('boom'));
    renderPage();

    expect(await screen.findByText('Documents could not be loaded.')).toBeVisible();
    fireEvent.click(screen.getByTestId('documents-library-retry'));

    expect(await screen.findByTestId('documents-library-row-7')).toBeInTheDocument();
  });

  it('renders an always-present, empty status live region when no document is unavailable', async () => {
    renderPage();
    await loaded();

    const region = unavailableRegion();
    expect(region).toBeEmptyDOMElement();
    expect(screen.queryByTestId('documents-library-unavailable')).toBeNull();
  });

  it('shows no "only documents tagged" note without a filter tag', async () => {
    renderPage();
    await loaded();

    expect(screen.queryByTestId('documents-library-filter-note')).toBeNull();
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('shows the filter tag note when Paperless is configured with a filter tag', async () => {
    mockGetStatus.mockResolvedValue(makePaperlessStatus({ filterTag: 'house-build' }));
    renderPage();
    await loaded();

    const note = screen.getByRole('note');
    expect(note).toBe(screen.getByTestId('documents-library-filter-note'));
    expect(note).toHaveTextContent('Showing only documents tagged house-build');
    expect(unavailableRegion()).not.toContainElement(note);
    expect(unavailableRegion()).toBeEmptyDOMElement();
  });

  it('has no duplicate test ids', async () => {
    renderPage('/documents?doc=7');
    await screen.findByTestId('documents-library-sheet');

    expect(findDuplicateTestIds(document.body)).toEqual([]);
  });
});

describe('the Linked badge', () => {
  it('marks the documents that are linked to any record', async () => {
    mockListAllLinkedIds.mockResolvedValue([7, 9] as never);
    renderPage();
    await loaded();
    await settle();

    expect(within(screen.getByTestId('documents-library-row-7')).getByText('Linked')).toBeVisible();
    expect(within(screen.getByTestId('documents-library-row-9')).getByText('Linked')).toBeVisible();
    expect(within(screen.getByTestId('documents-library-row-8')).queryByText('Linked')).toBeNull();
  });

  it('shows no badge when the linked ids cannot be loaded, and the list still works', async () => {
    mockListAllLinkedIds.mockRejectedValue(new Error('boom'));
    renderPage();
    await loaded();
    await settle();

    for (const id of [7, 8, 9]) {
      expect(
        within(screen.getByTestId(`documents-library-row-${id}`)).queryByText('Linked'),
      ).toBeNull();
    }
  });
});

describe('opening a document from a row', () => {
  it('links the title to ?doc=<id> and keeps the other params', async () => {
    renderPage('/documents?q=roof&type=3&tags=1,2&unlinked=1&sortBy=title&sortOrder=asc');
    await loaded();

    const href = screen.getByTestId('documents-library-title-7').getAttribute('href')!;
    const parsed = new URL(href, 'http://localhost');
    expect(parsed.pathname).toBe('/documents');
    expect(Object.fromEntries(parsed.searchParams)).toEqual({
      q: 'roof',
      type: '3',
      tags: '1,2',
      unlinked: '1',
      sortBy: 'title',
      sortOrder: 'asc',
      doc: '7',
    });
  });

  it('pushes the new URL so Back closes the panel', async () => {
    const { log } = renderPage();
    await loaded();

    fireEvent.click(screen.getByTestId('documents-library-title-8'));

    await waitFor(() => expect(loc()).toBe('/documents?doc=8'));
    expect(log.actions).toContain('PUSH /documents?doc=8');
    expect(await screen.findByTestId('documents-library-sheet')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('go-back'));

    await waitFor(() => expect(loc()).toBe('/documents'));
    expect(sheet()).toBeNull();
  });

  it('carries the origin of the page when the title link is opened', async () => {
    renderPage();
    await loaded();

    fireEvent.click(screen.getByTestId('documents-library-title-8'));

    await waitFor(() =>
      expect(screen.getByTestId('loc-state').textContent).toContain('/documents'),
    );
  });
});

// ─── The details panel ────────────────────────────────────────────────────────

describe('the details panel', () => {
  it('does not render a panel without ?doc=', async () => {
    renderPage();
    await loaded();

    expect(sheet()).toBeNull();
    expect(mockGetDocument).not.toHaveBeenCalled();
  });

  it('opens the panel for ?doc=<id> and loads that document and its links', async () => {
    renderPage('/documents?doc=7');

    expect(await screen.findByTestId('documents-library-sheet')).toBeInTheDocument();
    await waitFor(() => expect(mockGetDocument).toHaveBeenCalledWith(7));
    expect(mockListForDocument).toHaveBeenCalledWith(7);
    expect(await screen.findByText('Content Preview')).toBeVisible();
  });

  it('titles the panel with the row title while the detail loads, then with the detail title', async () => {
    let resolve: (v: { document: ReturnType<typeof makeDocumentDetail> }) => void = () => undefined;
    mockGetDocument.mockReturnValue(new Promise((r) => (resolve = r)));
    renderPage('/documents?doc=7');
    await loaded();

    expect(
      within(screen.getByTestId('documents-library-sheet')).getByText('Roof contract'),
    ).toBeVisible();

    await act(async () =>
      resolve({ document: makeDocumentDetail(7, { title: 'Detail title of 7' }) }),
    );

    expect(
      await within(screen.getByTestId('documents-library-sheet')).findByText('Detail title of 7'),
    ).toBeVisible();
  });

  it('titles the panel "Document #<id>" when the row is not on the loaded page and the detail is pending', async () => {
    mockGetDocument.mockReturnValue(new Promise(() => undefined));
    renderPage('/documents?doc=4711');
    await loaded();

    expect(
      within(screen.getByTestId('documents-library-sheet')).getByText('Document #4711'),
    ).toBeVisible();
  });

  it('opens a deep-linked document that is not on the loaded page', async () => {
    renderPage('/documents?doc=4711');

    await waitFor(() => expect(mockGetDocument).toHaveBeenCalledWith(4711));
    expect(
      await within(await screen.findByTestId('documents-library-sheet')).findByText(
        'Detail of 4711',
      ),
    ).toBeVisible();
  });

  it('keeps the list and its URL params while the panel is open', async () => {
    renderPage('/documents?q=roof&doc=7');
    await loaded();

    expect(loc()).toBe('/documents?q=roof&doc=7');
    expect(lastList()).toMatchObject({ query: 'roof' });
    expect(Object.keys(lastList())).not.toContain('doc');
  });

  it('shows the panel as a docked aside from 1440 px, labelled by its title', async () => {
    media.set('(min-width: 1440px)', true);
    renderPage('/documents?doc=7');

    const aside = await screen.findByTestId('documents-library-sheet');
    expect(aside.tagName).toBe('ASIDE');
    await waitFor(() => expect(aside).toHaveAccessibleName('Detail of 7'));
  });

  it('moves focus to the panel heading when it opens (docked)', async () => {
    media.set('(min-width: 1440px)', true);
    renderPage('/documents?doc=7');
    await loaded();

    await waitFor(() =>
      expect(
        within(screen.getByTestId('documents-library-sheet')).getByRole('heading', { level: 2 }),
      ).toHaveFocus(),
    );
  });

  it('moves focus to the new panel heading when another document is opened', async () => {
    media.set('(min-width: 1440px)', true);
    renderPage('/documents?doc=7');
    await loaded();

    fireEvent.click(screen.getByTestId('documents-library-title-8'));

    await waitFor(() => expect(loc()).toBe('/documents?doc=8'));
    await waitFor(() =>
      expect(
        within(screen.getByTestId('documents-library-sheet')).getByRole('heading', { level: 2 }),
      ).toHaveFocus(),
    );
    await waitFor(() => expect(mockGetDocument).toHaveBeenCalledWith(8));
  });

  describe('closing', () => {
    beforeEach(() => {
      // jsdom has no layout: report every element as rendered so the row title counts as on screen
      jest
        .spyOn(HTMLElement.prototype, 'getClientRects')
        .mockReturnValue([{}] as unknown as DOMRectList);
    });

    it('removes only doc from the URL with replace and keeps the other params and the state', async () => {
      const { log } = renderPage('/documents?q=roof&tags=1&doc=7', { state: { origin: 'kept' } });
      await loaded();
      media.set('(min-width: 1440px)', true);
      fireEvent.click(await screen.findByTestId('documents-library-sheet-close'));

      await waitFor(() => expect(loc()).toBe('/documents?q=roof&tags=1'));
      expect(sheet()).toBeNull();
      expect(log.actions.filter((a) => a.startsWith('REPLACE'))).toContain(
        'REPLACE /documents?q=roof&tags=1',
      );
      expect(screen.getByTestId('loc-state').textContent).toContain('kept');
    });

    it('returns focus to the title link of the row that was open (docked)', async () => {
      media.set('(min-width: 1440px)', true);
      renderPage('/documents?doc=8');
      await loaded();

      fireEvent.click(await screen.findByTestId('documents-library-sheet-close'));

      await waitFor(() => expect(screen.getByTestId('documents-library-title-8')).toHaveFocus());
    });

    it('returns focus to the row title when the docked panel is closed with Escape', async () => {
      media.set('(min-width: 1440px)', true);
      renderPage('/documents?doc=9');
      await loaded();

      fireEvent.keyDown(await screen.findByTestId('documents-library-sheet'), { key: 'Escape' });

      await waitFor(() => expect(loc()).toBe('/documents'));
      expect(screen.getByTestId('documents-library-title-9')).toHaveFocus();
    });

    it('closes the sheet below 1440 px through its Close button', async () => {
      renderPage('/documents?doc=7');
      await loaded();
      const panel = await screen.findByTestId('documents-library-sheet');

      fireEvent.click(within(panel).getByRole('button', { name: 'Close dialog' }));

      await waitFor(() => expect(loc()).toBe('/documents'));
      expect(sheet()).toBeNull();
    });

    it('closes a deep-linked panel whose row is not on the page, without a row to focus', async () => {
      media.set('(min-width: 1440px)', true);
      renderPage('/documents?doc=4711');
      await loaded();

      fireEvent.click(await screen.findByTestId('documents-library-sheet-close'));

      await waitFor(() => expect(loc()).toBe('/documents'));
      expect(sheet()).toBeNull();
    });
  });

  describe('a document that is not available', () => {
    it('closes the panel, removes doc with replace and says so when the detail answers 404', async () => {
      mockGetDocument.mockRejectedValue(
        new ApiClientError(404, { code: 'NOT_FOUND', message: 'raw' }),
      );
      const { log } = renderPage('/documents?q=roof&doc=4711');

      expect(await screen.findByText('That document is not available')).toBeVisible();
      expect(screen.getByTestId('documents-library-unavailable')).toBeInTheDocument();
      expect(
        within(unavailableRegion()).getByTestId('documents-library-unavailable'),
      ).toHaveTextContent('That document is not available');
      await waitFor(() => expect(loc()).toBe('/documents?q=roof'));
      expect(sheet()).toBeNull();
      expect(log.actions.filter((a) => a.startsWith('REPLACE'))).toContain(
        'REPLACE /documents?q=roof',
      );
    });

    it.each(['abc', '0', '-3', '1.5', '007', '1e3', '99999999999999999999'])(
      'removes the invalid value doc=%s, opens no panel and says so',
      async (value) => {
        const { log } = renderPage(`/documents?doc=${value}`);

        expect(await screen.findByText('That document is not available')).toBeVisible();
        expect(
          within(unavailableRegion()).getByText('That document is not available'),
        ).toBeVisible();
        await waitFor(() => expect(loc()).toBe('/documents'));
        expect(sheet()).toBeNull();
        expect(mockGetDocument).not.toHaveBeenCalled();
        expect(log.actions.some((a) => a.startsWith('REPLACE'))).toBe(true);
      },
    );

    it('treats an empty doc= like an invalid one', async () => {
      renderPage('/documents?doc=');

      expect(await screen.findByText('That document is not available')).toBeVisible();
      expect(sheet()).toBeNull();
    });

    it('clears the note when another document is opened', async () => {
      renderPage('/documents?doc=abc');
      await screen.findByText('That document is not available');
      await loaded();

      fireEvent.click(screen.getByTestId('documents-library-title-8'));

      await waitFor(() => expect(loc()).toBe('/documents?doc=8'));
      expect(screen.queryByText('That document is not available')).toBeNull();
      expect(unavailableRegion()).toBeEmptyDOMElement();
      expect(await screen.findByTestId('documents-library-sheet')).toBeInTheDocument();
    });

    it('shows the filter tag note and the unavailable note together', async () => {
      mockGetStatus.mockResolvedValue(makePaperlessStatus({ filterTag: 'house-build' }));
      renderPage('/documents?doc=abc');

      expect(await screen.findByText('That document is not available')).toBeVisible();
      expect(screen.getByTestId('documents-library-filter-note')).toBeInTheDocument();
      expect(screen.getByRole('note')).toHaveTextContent('house-build');
      expect(within(unavailableRegion()).getByText('That document is not available')).toBeVisible();
    });
  });

  describe('linking from the panel', () => {
    it('updates the Linked badge without reloading the list when a link is removed', async () => {
      mockListAllLinkedIds.mockResolvedValueOnce([7] as never);
      mockListForDocument.mockResolvedValue([
        makeLinkWithEntity('l1', 'work_item', 'w1', plainEntity('Frame the roof'), 7),
      ]);
      renderPage('/documents?doc=7');
      await loaded();
      await settle();
      expect(
        within(screen.getByTestId('documents-library-row-7')).getByText('Linked'),
      ).toBeVisible();
      const listCalls = mockListDocuments.mock.calls.length;
      mockListAllLinkedIds.mockResolvedValue([] as never);
      mockListForDocument.mockResolvedValue([]);

      fireEvent.click(await screen.findByTestId('documents-library-linked-to-actions-l1'));
      await act(async () => {
        fireEvent.click(await screen.findByTestId('documents-library-linked-to-remove-l1'));
      });

      await waitFor(() =>
        expect(
          within(screen.getByTestId('documents-library-row-7')).queryByText('Linked'),
        ).toBeNull(),
      );
      expect(mockDeleteLink).toHaveBeenCalledWith('l1');
      expect(mockListAllLinkedIds).toHaveBeenCalledTimes(2);
      // the rows were not reloaded: a refresh would clear them and drop focus
      expect(mockListDocuments.mock.calls.length).toBe(listCalls);
      expect(screen.getByTestId('documents-library-row-7')).toBeInTheDocument();
    });
  });
});
