import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { jest } from '@jest/globals';
import { MemoryRouter } from 'react-router-dom';
import type {
  DocumentLinkEntityType,
  DocumentLinkWithMetadata,
  PaperlessStatusResponse,
} from '@cornerstone/shared';
import type * as HookModule from './useDocumentsPanel.js';
import type * as StatusCacheModule from '../../lib/paperlessStatusCache.js';
import { installMatchMedia } from '../../test/matchMediaControl.js';
import type { MatchMediaControl } from '../../test/matchMediaControl.js';
import { LocaleProvider } from '../../contexts/LocaleContext.js';
import { ToastProvider, useToast } from '../Toast/ToastContext.js';

const mockGetPaperlessStatus = jest.fn<() => Promise<PaperlessStatusResponse>>();
const mockFetchConfig = jest.fn<() => Promise<{ autoItemizeEnabled: boolean }>>();
const mockListDocumentLinks = jest.fn<() => Promise<DocumentLinkWithMetadata[]>>();
const mockDeleteDocumentLink = jest.fn<() => Promise<unknown>>();
const mockUndoChange = jest.fn<(token: string) => Promise<unknown>>();

jest.unstable_mockModule('../../lib/paperlessApi.js', () => ({
  getPaperlessStatus: mockGetPaperlessStatus,
  listPaperlessDocuments: jest.fn(),
  listPaperlessTags: jest.fn(),
  getPaperlessDocument: jest.fn(),
  getDocumentThumbnailUrl: (id: number) => `/thumb/${id}`,
  getDocumentPreviewUrl: jest.fn(),
}));
jest.unstable_mockModule('../../lib/configApi.js', () => ({ fetchConfig: mockFetchConfig }));
jest.unstable_mockModule('../../lib/documentLinksApi.js', () => ({
  listDocumentLinks: mockListDocumentLinks,
  createDocumentLink: jest.fn(),
  deleteDocumentLink: mockDeleteDocumentLink,
  listAllLinkedDocumentIds: jest.fn(async () => []),
  updateDocumentLinkAttachmentType: jest.fn(),
}));
jest.unstable_mockModule('../../lib/undoApi.js', () => ({ undoChange: mockUndoChange }));
jest.unstable_mockModule('../../contexts/AuthContext.js', () => ({
  useAuth: () => ({ user: { role: 'admin' } }),
}));
jest.unstable_mockModule('../../contexts/HouseNameContext.js', () => ({
  useEntriesLanguage: () => 'en',
}));
jest.unstable_mockModule('../documents/DocumentBrowser.js', () => ({
  DocumentBrowser: () => <div data-testid="document-browser" />,
}));

let useDocumentsPanel: (typeof HookModule)['useDocumentsPanel'];
let resetPaperlessStatusCache: (typeof StatusCacheModule)['resetPaperlessStatusCache'];
let media: MatchMediaControl;

const STATUS_ON: PaperlessStatusResponse = {
  configured: true,
  reachable: true,
  paperlessUrl: 'https://paperless.example.test',
  error: null,
  filterTag: null,
};
const STATUS_OFF: PaperlessStatusResponse = {
  configured: false,
  reachable: false,
  paperlessUrl: null,
  error: null,
  filterTag: null,
};

const makeLink = (id: string, title: string): DocumentLinkWithMetadata => ({
  id,
  entityType: 'work_item',
  entityId: 'e1',
  paperlessDocumentId: Number(id.replace(/\D/g, '')),
  attachmentType: null,
  createdBy: null,
  createdAt: '2026-01-01T00:00:00Z',
  document: {
    id: Number(id.replace(/\D/g, '')),
    title,
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

let latest: ReturnType<typeof HookModule.useDocumentsPanel> | null = null;

function ToastText() {
  const { toasts, undoToast } = useToast();
  return (
    <>
      {toasts.map((toast) => (
        <div key={toast.id}>
          <span>{toast.message}</span>
          <button type="button" data-testid="toast-undo" onClick={() => void undoToast(toast.id)}>
            Undo
          </button>
        </div>
      ))}
    </>
  );
}

function Probe({ entityType = 'work_item' }: { entityType?: DocumentLinkEntityType }) {
  const host = useDocumentsPanel(entityType, 'e1');
  latest = host;
  return (
    <>
      <span data-testid="mode">{host.mode}</span>
      <span data-testid="count">{host.count === null ? 'null' : host.count}</span>
      {host.fact && host.fact.kind === 'button' && (
        <button
          type="button"
          ref={host.fact.buttonRef}
          data-testid="fact"
          aria-expanded={host.fact.expanded}
          onClick={host.fact.onClick}
        >
          {String(host.fact.label)}:{host.fact.value === null ? 'none' : String(host.fact.value)}
        </button>
      )}
      {host.panel}
    </>
  );
}

function renderProbe(entityType: DocumentLinkEntityType = 'work_item') {
  return render(
    <LocaleProvider>
      <ToastProvider>
        <MemoryRouter>
          <Probe entityType={entityType} />
          <ToastText />
        </MemoryRouter>
      </ToastProvider>
    </LocaleProvider>,
  );
}

beforeEach(async () => {
  ({ useDocumentsPanel } = (await import('./useDocumentsPanel.js')) as typeof HookModule);
  ({ resetPaperlessStatusCache } =
    (await import('../../lib/paperlessStatusCache.js')) as typeof StatusCacheModule);
  resetPaperlessStatusCache();
  media = installMatchMedia({ '(min-width: 768px)': true });
  mockGetPaperlessStatus.mockReset().mockResolvedValue(STATUS_ON);
  mockFetchConfig.mockReset().mockResolvedValue({ autoItemizeEnabled: true });
  mockListDocumentLinks.mockReset().mockResolvedValue([]);
  mockDeleteDocumentLink.mockReset();
  mockUndoChange.mockReset().mockResolvedValue({});
  latest = null;
  localStorage.clear();
});

afterEach(() => {
  media.restore();
  jest.restoreAllMocks();
});

describe('useDocumentsPanel — mode gating', () => {
  it('configured and reachable: full mode, fact with the count (0 included), panel mounted', async () => {
    renderProbe();

    await waitFor(() => expect(screen.getByTestId('mode')).toHaveTextContent('full'));
    expect(screen.getByTestId('fact')).toHaveTextContent('Documents:0');
    expect(screen.getByTestId('count')).toHaveTextContent('0');
    fireEvent.click(screen.getByTestId('fact'));
    expect(screen.getByRole('heading', { name: 'Documents (0)' })).toBeInTheDocument();
  });

  it('configured but not reachable: unreachable mode, panel mounted', async () => {
    mockGetPaperlessStatus.mockResolvedValue({ ...STATUS_ON, reachable: false });
    renderProbe();

    await waitFor(() => expect(screen.getByTestId('mode')).toHaveTextContent('unreachable'));
    expect(screen.getByTestId('fact')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('fact'));
    expect(screen.getByTestId('documents-panel')).toBeInTheDocument();
    expect(screen.getByTestId('documents-link-document')).toBeInTheDocument();
  });

  it('not configured and no links: hidden, no fact and no panel', async () => {
    mockGetPaperlessStatus.mockResolvedValue(STATUS_OFF);
    renderProbe();

    await waitFor(() => expect(screen.getByTestId('mode')).toHaveTextContent('hidden'));
    expect(screen.queryByTestId('fact')).toBeNull();
    expect(screen.queryByTestId('documents-panel')).toBeNull();
  });

  it('not configured with kept links: readOnly with the notice and the count', async () => {
    mockGetPaperlessStatus.mockResolvedValue(STATUS_OFF);
    mockListDocumentLinks.mockResolvedValue([makeLink('l1', 'Sample offer.pdf')]);
    renderProbe();

    await waitFor(() => expect(screen.getByTestId('mode')).toHaveTextContent('readOnly'));
    expect(screen.getByTestId('fact')).toHaveTextContent('Documents:1');
    fireEvent.click(screen.getByTestId('fact'));
    expect(screen.getByTestId('documents-paperless-off')).toHaveTextContent('1 link is kept');
    expect(screen.getByTestId('documents-integrations-link')).toBeInTheDocument();
    expect(screen.queryByTestId('documents-link-document')).toBeNull();
  });

  it('status request failed with links: readOnly with "Paperless is unreachable." and Try again re-checks', async () => {
    mockGetPaperlessStatus.mockRejectedValueOnce(new Error('down'));
    mockListDocumentLinks.mockResolvedValue([makeLink('l1', 'Sample offer.pdf')]);
    renderProbe();

    await waitFor(() => expect(screen.getByTestId('mode')).toHaveTextContent('readOnly'));
    fireEvent.click(screen.getByTestId('fact'));
    expect(screen.getByText(/Paperless is unreachable\./)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(screen.getByTestId('mode')).toHaveTextContent('full'));
    expect(mockGetPaperlessStatus).toHaveBeenCalledTimes(2);
  });

  it('two hosts on one page share a single status request', async () => {
    render(
      <LocaleProvider>
        <ToastProvider>
          <MemoryRouter>
            <Probe />
            <Probe entityType="invoice" />
          </MemoryRouter>
        </ToastProvider>
      </LocaleProvider>,
    );

    await waitFor(() => expect(screen.getAllByTestId('mode')[0]).toHaveTextContent('full'));
    await waitFor(() => expect(screen.getAllByTestId('mode')[1]).toHaveTextContent('full'));
    expect(mockGetPaperlessStatus).toHaveBeenCalledTimes(1);
  });

  it('reuses a fresh status answer when a host mounts again', async () => {
    const first = renderProbe();
    await waitFor(() => expect(screen.getByTestId('mode')).toHaveTextContent('full'));
    first.unmount();

    renderProbe();
    await waitFor(() => expect(screen.getByTestId('mode')).toHaveTextContent('full'));
    expect(mockGetPaperlessStatus).toHaveBeenCalledTimes(1);
  });

  it('status request failed with no links: hidden', async () => {
    mockGetPaperlessStatus.mockRejectedValue(new Error('down'));
    renderProbe();

    await waitFor(() => expect(screen.getByTestId('mode')).toHaveTextContent('hidden'));
    expect(screen.queryByTestId('fact')).toBeNull();
  });

  it('a link load error counts as kept links when Paperless is off', async () => {
    mockGetPaperlessStatus.mockResolvedValue(STATUS_OFF);
    mockListDocumentLinks.mockRejectedValue(new Error('x'));
    renderProbe();

    await waitFor(() => expect(screen.getByTestId('mode')).toHaveTextContent('readOnly'));
  });
});

describe('useDocumentsPanel — pending', () => {
  it('has no fact (so no "Not set" value) and no panel while the status is pending', async () => {
    let resolveStatus: (value: PaperlessStatusResponse) => void = () => {};
    mockGetPaperlessStatus.mockImplementation(
      () => new Promise((resolve) => (resolveStatus = resolve)),
    );
    renderProbe();

    expect(screen.getByTestId('mode')).toHaveTextContent('pending');
    expect(screen.queryByTestId('fact')).toBeNull();
    expect(screen.queryByText(/Not set/)).toBeNull();
    expect(screen.queryByTestId('documents-panel')).toBeNull();
    expect(latest?.fact).toBeNull();

    await act(async () => resolveStatus(STATUS_ON));
    await waitFor(() => expect(screen.getByTestId('fact')).toBeInTheDocument());
  });

  it('an open() before the status resolves is a no-op: the sheet never opens later', async () => {
    let resolveStatus: (value: PaperlessStatusResponse) => void = () => {};
    mockGetPaperlessStatus.mockImplementation(
      () => new Promise((resolve) => (resolveStatus = resolve)),
    );
    renderProbe();

    act(() => latest?.open());
    expect(latest?.isOpen).toBe(false);

    await act(async () => resolveStatus(STATUS_ON));
    await waitFor(() => expect(screen.getByTestId('mode')).toHaveTextContent('full'));
    expect(latest?.isOpen).toBe(false);
    expect(screen.getByTestId('documents-panel')).toHaveAttribute('data-open', 'false');
  });

  it('open() while hidden is also a no-op', async () => {
    mockGetPaperlessStatus.mockResolvedValue(STATUS_OFF);
    renderProbe();
    await waitFor(() => expect(screen.getByTestId('mode')).toHaveTextContent('hidden'));

    act(() => latest?.open());

    expect(latest?.isOpen).toBe(false);
  });

  it('stays pending while the links load when Paperless is off, and count is null', async () => {
    mockGetPaperlessStatus.mockResolvedValue(STATUS_OFF);
    let resolveList: (value: DocumentLinkWithMetadata[]) => void = () => {};
    mockListDocumentLinks.mockImplementation(
      () => new Promise((resolve) => (resolveList = resolve)),
    );
    renderProbe();

    await waitFor(() => expect(mockGetPaperlessStatus).toHaveBeenCalled());
    expect(screen.getByTestId('mode')).toHaveTextContent('pending');
    expect(screen.getByTestId('count')).toHaveTextContent('null');

    await act(async () => resolveList([makeLink('l1', 'Sample offer.pdf')]));
    await waitFor(() => expect(screen.getByTestId('mode')).toHaveTextContent('readOnly'));
  });
});

describe('useDocumentsPanel — late responses after unmount', () => {
  it('ignores a status result, a status failure and a config result that arrive after unmount', async () => {
    let resolveStatus: (value: PaperlessStatusResponse) => void = () => {};
    let resolveConfig: (value: { autoItemizeEnabled: boolean }) => void = () => {};
    mockGetPaperlessStatus.mockImplementationOnce(
      () => new Promise((resolve) => (resolveStatus = resolve)),
    );
    mockFetchConfig.mockImplementationOnce(
      () => new Promise((resolve) => (resolveConfig = resolve)),
    );
    const first = renderProbe('invoice');
    first.unmount();
    await act(async () => {
      resolveStatus(STATUS_ON);
      resolveConfig({ autoItemizeEnabled: true });
    });

    let rejectStatus: (reason: unknown) => void = () => {};
    mockGetPaperlessStatus.mockImplementationOnce(
      () => new Promise((_resolve, reject) => (rejectStatus = reject)),
    );
    resetPaperlessStatusCache(); // the first answer is cached for ten seconds
    const second = renderProbe();
    second.unmount();
    await act(async () => {
      rejectStatus(new Error('late'));
    });

    expect(mockGetPaperlessStatus).toHaveBeenCalledTimes(2);
  });

  it('ignores a rejected config request that arrives after unmount', async () => {
    let rejectConfig: (reason: unknown) => void = () => {};
    mockFetchConfig.mockImplementationOnce(
      () => new Promise((_resolve, reject) => (rejectConfig = reject)),
    );
    const { unmount } = renderProbe('invoice');
    unmount();
    await act(async () => {
      rejectConfig(new Error('late'));
    });

    expect(mockFetchConfig).toHaveBeenCalledTimes(1);
  });
});

describe('useDocumentsPanel — fact and focus', () => {
  it('exposes a button fact whose ref is the trigger; expanded follows the open state', async () => {
    renderProbe();
    await waitFor(() => expect(screen.getByTestId('fact')).toBeInTheDocument());
    const fact = screen.getByTestId('fact');
    expect(fact).toHaveAttribute('aria-expanded', 'false');
    expect(latest?.triggerRef.current).toBe(fact);

    fact.focus();
    fireEvent.click(fact);
    expect(fact).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('heading', { name: 'Documents (0)' })).toHaveFocus();

    fireEvent.click(screen.getByRole('button', { name: /close/i }));

    expect(fact).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('useDocumentsPanel — auto-itemize setting', () => {
  it('reads the config only for invoices and offers Itemize', async () => {
    mockListDocumentLinks.mockResolvedValue([
      { ...makeLink('l7', 'Sample offer.pdf'), entityType: 'invoice' },
    ]);
    renderProbe('invoice');
    await waitFor(() => expect(screen.getByTestId('fact')).toHaveTextContent('Documents:1'));
    fireEvent.click(screen.getByTestId('fact'));
    await waitFor(() => expect(mockFetchConfig).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByTestId('document-menu-l7'));

    await waitFor(() => expect(screen.getByTestId('document-itemize-l7')).toBeInTheDocument());
  });

  it('does not read the config for other entity types', async () => {
    renderProbe('work_item');
    await waitFor(() => expect(screen.getByTestId('fact')).toBeInTheDocument());

    expect(mockFetchConfig).not.toHaveBeenCalled();
  });

  it('keeps Itemize hidden when the config cannot be read', async () => {
    mockFetchConfig.mockRejectedValue(new Error('x'));
    mockListDocumentLinks.mockResolvedValue([
      { ...makeLink('l7', 'Sample offer.pdf'), entityType: 'invoice' },
    ]);
    renderProbe('invoice');
    await waitFor(() => expect(screen.getByTestId('fact')).toHaveTextContent('Documents:1'));
    fireEvent.click(screen.getByTestId('fact'));
    await waitFor(() => expect(mockFetchConfig).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId('document-menu-l7'));

    expect(screen.queryByTestId('document-itemize-l7')).toBeNull();
  });
});

describe('useDocumentsPanel — Unlink with Undo round trip (real hooks)', () => {
  it('removes the row and the count; Undo posts the token, refetches and the row and count are back', async () => {
    const link = makeLink('l1', 'Sample offer.pdf');
    mockListDocumentLinks.mockResolvedValue([link]);
    mockDeleteDocumentLink.mockResolvedValue({
      undo: { token: 'tok-9', expiresAt: '2026-01-01T00:00:30Z' },
    });
    renderProbe();
    await waitFor(() => expect(screen.getByTestId('fact')).toHaveTextContent('Documents:1'));
    fireEvent.click(screen.getByTestId('fact'));

    fireEvent.click(screen.getByTestId('document-menu-l1'));
    fireEvent.click(screen.getByTestId('document-unlink-l1'));

    await waitFor(() => expect(screen.queryByTestId('linked-document-l1')).toBeNull());
    expect(mockDeleteDocumentLink).toHaveBeenCalledWith('l1');
    expect(screen.getByText('Unlinked Sample offer.pdf.')).toBeInTheDocument();
    expect(screen.getByTestId('count')).toHaveTextContent('0');

    await act(async () => {
      fireEvent.click(screen.getByTestId('toast-undo'));
    });

    expect(mockUndoChange).toHaveBeenCalledWith('tok-9');
    await waitFor(() => expect(screen.getByTestId('linked-document-l1')).toBeInTheDocument());
    expect(screen.getByTestId('count')).toHaveTextContent('1');
  });

  it('Undo after the sheet was closed still refreshes the count', async () => {
    mockListDocumentLinks.mockResolvedValue([makeLink('l1', 'Sample offer.pdf')]);
    mockDeleteDocumentLink.mockResolvedValue({
      undo: { token: 'tok-9', expiresAt: '2026-01-01T00:00:30Z' },
    });
    renderProbe();
    await waitFor(() => expect(screen.getByTestId('fact')).toHaveTextContent('Documents:1'));
    fireEvent.click(screen.getByTestId('fact'));
    fireEvent.click(screen.getByTestId('document-menu-l1'));
    fireEvent.click(screen.getByTestId('document-unlink-l1'));
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('0'));
    fireEvent.click(screen.getByRole('button', { name: /close/i }));

    await act(async () => {
      fireEvent.click(screen.getByTestId('toast-undo'));
    });

    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('1'));
  });
});
