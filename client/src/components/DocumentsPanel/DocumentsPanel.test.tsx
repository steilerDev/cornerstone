import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import { jest } from '@jest/globals';
import { useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import type {
  AttachmentType,
  DocumentLinkEntityType,
  DocumentLinkWithMetadata,
  PaperlessDocumentSearchResult,
} from '@cornerstone/shared';
import { DOCUMENT_LINK_ENTITY_TYPES } from '@cornerstone/shared';
import * as sharedActual from '@cornerstone/shared';
import type * as PanelModule from './DocumentsPanel.js';
import type { ApiClientError as ApiClientErrorType } from '../../lib/apiClient.js';
import { installMatchMedia } from '../../test/matchMediaControl.js';
import type { MatchMediaControl } from '../../test/matchMediaControl.js';
import { OriginProbe, probedOrigin, probedPath } from '../../test/originProbe.js';
import { LocaleProvider } from '../../contexts/LocaleContext.js';
import { markEscapeHandled } from '../Modal/useFocusTrap.js';
import { ToastProvider, useToast } from '../Toast/ToastContext.js';
import { ToastList as RealToastList } from '../Toast/Toast.js';

// ─── Mocks ───────────────────────────────────────────────────────────────────

let mockRole: 'admin' | 'member' = 'member';
jest.unstable_mockModule('../../contexts/AuthContext.js', () => ({
  useAuth: () => ({ user: { role: mockRole } }),
}));

jest.unstable_mockModule('../../contexts/HouseNameContext.js', () => ({
  useEntriesLanguage: () => 'en',
}));

jest.unstable_mockModule('../../lib/paperlessApi.js', () => ({
  getPaperlessStatus: jest.fn(),
  listPaperlessDocuments: jest.fn(),
  listPaperlessTags: jest.fn(),
  getPaperlessDocument: jest.fn(),
  getDocumentThumbnailUrl: (id: number) => `/api/paperless/documents/${id}/thumb`,
  getDocumentPreviewUrl: (id: number) => `/api/paperless/documents/${id}/preview`,
}));

let mockDocumentsServed = false;
jest.unstable_mockModule('@cornerstone/shared', () => ({
  ...sharedActual,
  isRouteServed: (id: string) =>
    id === 'documents' ? mockDocumentsServed : sharedActual.isRouteServed(id as never),
}));

const PICKED: PaperlessDocumentSearchResult = {
  id: 99,
  title: 'Sample scan.pdf',
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

let browserProps: { linkedDocumentIds?: number[]; defaultHideLinked?: boolean } = {};
jest.unstable_mockModule('../documents/DocumentBrowser.js', () => ({
  DocumentBrowser: function MockDocumentBrowser(props: {
    onSelect: (doc: PaperlessDocumentSearchResult) => void;
    linkedDocumentIds?: number[];
    defaultHideLinked?: boolean;
  }) {
    browserProps = props;
    return (
      <div data-testid="document-browser">
        <input aria-label="Search documents" />
        <button type="button" data-testid="pick-doc" onClick={() => props.onSelect(PICKED)}>
          pick
        </button>
      </div>
    );
  },
}));

let DocumentsPanel: (typeof PanelModule)['DocumentsPanel'];
let ApiClientError: typeof ApiClientErrorType;
let media: MatchMediaControl;

// ─── Fixtures ────────────────────────────────────────────────────────────────

const makeLink = (
  id: string,
  title: string | null,
  overrides: Partial<DocumentLinkWithMetadata> = {},
): DocumentLinkWithMetadata => ({
  id,
  entityType: 'work_item',
  entityId: 'wi-1',
  paperlessDocumentId: Number(id.replace(/\D/g, '')) || 1,
  attachmentType: null,
  createdBy: null,
  createdAt: '2026-01-01T00:00:00Z',
  document:
    title === null
      ? null
      : {
          id: Number(id.replace(/\D/g, '')) || 1,
          title,
          content: 'Sample preview text',
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
  ...overrides,
});

const TOKEN = { token: 'tok-1', expiresAt: '2026-01-01T00:00:30Z' };

interface HostProps {
  entityType?: DocumentLinkEntityType;
  mode?: 'full' | 'readOnly' | 'unreachable';
  readOnlyReason?: 'notConfigured' | 'statusFailed';
  initialLinks?: DocumentLinkWithMetadata[];
  isLoading?: boolean;
  error?: string | null;
  autoItemizeEnabled?: boolean;
  addLink?: (id: number, type?: AttachmentType | null) => Promise<void>;
  removeLink?: (id: string) => Promise<typeof TOKEN>;
  restoreLink?: (token: string) => Promise<void>;
  updateAttachmentType?: (id: string, type: AttachmentType | null) => Promise<void>;
  refresh?: () => void;
  onRetryStatus?: () => void;
  fetchSystemLinkedIds?: () => Promise<void>;
  systemLinkedIds?: number[];
  paperlessUrl?: string | null;
  realToasts?: boolean;
  alsoRemoveOnUnlink?: string;
}

function ToastList() {
  const { toasts, undoToast } = useToast();
  return (
    <ul data-testid="toasts">
      {toasts.map((toast) => (
        <li key={toast.id}>
          <span>{toast.message}</span>
          {toast.variant === 'undo' && (
            <button type="button" data-testid="toast-undo" onClick={() => void undoToast(toast.id)}>
              Undo
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

function Host(props: HostProps) {
  const [open, setOpen] = useState(false);
  const [links, setLinks] = useState(props.initialLinks ?? []);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const removedRef = useRef<DocumentLinkWithMetadata[]>([]);
  return (
    <>
      <button ref={triggerRef} type="button" data-testid="trigger" onClick={() => setOpen(true)}>
        Documents
      </button>
      <DocumentsPanel
        entityType={props.entityType ?? 'work_item'}
        entityId="wi-1"
        open={open}
        onClose={() => setOpen(false)}
        triggerRef={triggerRef}
        mode={props.mode ?? 'full'}
        readOnlyReason={props.readOnlyReason ?? 'notConfigured'}
        paperlessUrl={
          props.paperlessUrl === undefined ? 'https://paperless.example.test' : props.paperlessUrl
        }
        autoItemizeEnabled={props.autoItemizeEnabled ?? false}
        onRetryStatus={props.onRetryStatus ?? (() => {})}
        links={links}
        isLoading={props.isLoading ?? false}
        error={props.error ?? null}
        addLink={
          props.addLink ??
          (async (docId) => {
            await tick();
            setLinks((prev) => [
              ...prev,
              makeLink(`l${docId}`, PICKED.title, { paperlessDocumentId: docId }),
            ]);
          })
        }
        removeLink={
          props.removeLink ??
          (async (id) => {
            await tick();
            const gone = links.find((l) => l.id === id);
            if (gone) removedRef.current.push(gone);
            setLinks((prev) =>
              prev.filter((l) => l.id !== id && l.id !== props.alsoRemoveOnUnlink),
            );
            return TOKEN;
          })
        }
        restoreLink={
          props.restoreLink ??
          (async () => {
            const back = removedRef.current.pop();
            if (back) setLinks((prev) => [...prev, back]);
          })
        }
        updateAttachmentType={props.updateAttachmentType ?? (async () => {})}
        refresh={props.refresh ?? (() => {})}
        systemLinkedIds={props.systemLinkedIds ?? []}
        fetchSystemLinkedIds={props.fetchSystemLinkedIds ?? (async () => {})}
      />
      {props.realToasts ? <RealToastList /> : <ToastList />}
    </>
  );
}

function renderHost(props: HostProps = {}, ui?: ReactElement) {
  return render(
    <LocaleProvider>
      <ToastProvider>
        <MemoryRouter initialEntries={['/project/work-items/wi-1?tab=cost']}>
          <OriginProbe />
          {ui ?? <Host {...props} />}
        </MemoryRouter>
      </ToastProvider>
    </LocaleProvider>,
  );
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const expectSheetClosed = () => {
  const sheet = screen.queryByTestId('documents-panel');
  if (sheet) expect(sheet).toHaveAttribute('data-open', 'false');
};
const openPanel = () => fireEvent.click(screen.getByTestId('trigger'));
const openPicker = () => fireEvent.click(screen.getByTestId('documents-link-document'));

beforeEach(async () => {
  ({ DocumentsPanel } = (await import('./DocumentsPanel.js')) as typeof PanelModule);
  ({ ApiClientError } = await import('../../lib/apiClient.js'));
  media = installMatchMedia({ '(min-width: 768px)': true });
  mockRole = 'member';
  mockDocumentsServed = false;
  browserProps = {};
  localStorage.clear();
});

afterEach(() => {
  media.restore();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('DocumentsPanel — open and close', () => {
  it('opens as a side sheet from 768 px with the count in the title, focused', () => {
    renderHost({
      initialLinks: [makeLink('l1', 'Sample offer.pdf'), makeLink('l2', 'Task A plan.pdf')],
    });
    openPanel();

    const title = screen.getByRole('heading', { name: 'Documents (2)' });
    expect(title).toHaveFocus();
    expect(screen.getByTestId('documents-panel').className).toContain('panelSide');
  });

  it('is a full-screen sheet below 768 px', () => {
    media.set('(min-width: 768px)', false);
    renderHost();
    openPanel();

    expect(screen.getByTestId('documents-panel').className).toContain('panelFullScreen');
  });

  // Focus return to the trigger after Close is E2E-only: it relies on the browser blurring the
  // focused element when the always-mounted sheet becomes inert (jsdom does not), after which
  // useFocusRestore's microtask pass restores the opener.
  it('Close closes the sheet and hands the trigger ref to the focus restore', () => {
    renderHost();
    openPanel();
    fireEvent.click(screen.getByRole('button', { name: /close/i }));

    expectSheetClosed();
  });

  it('renders the list of linked documents with their titles', () => {
    renderHost({ initialLinks: [makeLink('l1', 'Sample offer.pdf')] });
    openPanel();

    const list = screen.getByTestId('documents-list');
    expect(within(list).getByText('Sample offer.pdf')).toBeInTheDocument();
  });

  it('uses the fallback title for a document that is gone', () => {
    renderHost({ initialLinks: [makeLink('l12', null)] });
    openPanel();

    expect(screen.getByRole('heading', { name: 'Document #12' })).toBeInTheDocument();
  });
});

describe('DocumentsPanel — empty state per entity type', () => {
  it.each(DOCUMENT_LINK_ENTITY_TYPES)('shows the %s empty body', (entityType) => {
    renderHost({ entityType });
    openPanel();

    expect(screen.getByText('No documents linked yet.')).toBeInTheDocument();
    // The body text is looked up through the union key set per entity type.
    expect(
      screen.getByText(/from Paperless-ngx to keep everything in one place\.$/),
    ).toBeInTheDocument();
  });

  it('uses a different body for invoices than for tasks', () => {
    const { unmount } = renderHost({ entityType: 'invoice' });
    openPanel();
    expect(screen.getByText(/invoice PDFs/)).toBeInTheDocument();
    unmount();

    renderHost({ entityType: 'work_item' });
    openPanel();
    expect(screen.getByText(/receipts, contracts and plans/)).toBeInTheDocument();
  });

  it('shows no empty state while loading; shows the skeleton instead', () => {
    renderHost({ isLoading: true });
    openPanel();

    expect(screen.queryByText('No documents linked yet.')).toBeNull();
  });
});

describe('DocumentsPanel — errors', () => {
  it('shows the load error with Try again calling refresh and no empty state', () => {
    const refresh = jest.fn();
    renderHost({ error: 'Could not load documents.', refresh });
    openPanel();

    expect(screen.getByText('Could not load documents.')).toBeInTheDocument();
    expect(screen.queryByText('No documents linked yet.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe('DocumentsPanel — read-only', () => {
  it('shows the Paperless-off notice with the count and no controls (member: no Integrations link)', () => {
    renderHost({
      mode: 'readOnly',
      initialLinks: [makeLink('l1', 'Sample offer.pdf'), makeLink('l2', 'Task A plan.pdf')],
    });
    openPanel();

    expect(screen.getByTestId('documents-paperless-off')).toHaveTextContent(
      'Paperless is not connected. 2 links are kept.',
    );
    expect(screen.queryByTestId('documents-integrations-link')).toBeNull();
    expect(screen.queryByTestId('documents-link-document')).toBeNull();
    expect(screen.queryByTestId('documents-browse-all')).toBeNull();
    expect(screen.queryByTestId('document-menu-l1')).toBeNull();
    expect(screen.queryByTestId('document-details-l1')).toBeNull();
    expect(screen.queryByText('No documents linked yet.')).toBeNull();
  });

  it('uses the singular for one kept link and shows the Integrations link for admins', () => {
    mockRole = 'admin';
    renderHost({ mode: 'readOnly', initialLinks: [makeLink('l1', 'Sample offer.pdf')] });
    openPanel();

    expect(screen.getByTestId('documents-paperless-off')).toHaveTextContent(
      'Paperless is not connected. 1 link is kept.',
    );
    expect(screen.getByTestId('documents-integrations-link')).toBeInTheDocument();
  });

  it('shows "Paperless is unreachable." with Try again calling onRetryStatus when the status failed', () => {
    const onRetryStatus = jest.fn();
    renderHost({
      mode: 'readOnly',
      readOnlyReason: 'statusFailed',
      initialLinks: [makeLink('l1', 'Sample offer.pdf')],
      onRetryStatus,
    });
    openPanel();

    expect(screen.getByText(/Paperless is unreachable\./)).toBeInTheDocument();
    expect(screen.queryByTestId('documents-integrations-link')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetryStatus).toHaveBeenCalledTimes(1);
  });

  it('hides the notice while loading and when the load failed', () => {
    const { unmount } = renderHost({ mode: 'readOnly', isLoading: true });
    openPanel();
    expect(screen.queryByTestId('documents-paperless-off')).toBeNull();
    unmount();

    renderHost({ mode: 'readOnly', error: 'Could not load documents.' });
    openPanel();
    expect(screen.queryByTestId('documents-paperless-off')).toBeNull();
  });
});

describe('DocumentsPanel — Unlink with Undo', () => {
  const three = () => [
    makeLink('l1', 'First doc.pdf'),
    makeLink('l2', 'Second doc.pdf'),
    makeLink('l3', 'Third doc.pdf'),
  ];

  const unlink = (id: string) => {
    fireEvent.click(screen.getByTestId(`document-menu-${id}`));
    fireEvent.click(screen.getByTestId(`document-unlink-${id}`));
  };

  it('removes the row at once without a confirmation and shows the Undo toast', async () => {
    renderHost({ initialLinks: three() });
    openPanel();
    unlink('l2');

    await waitFor(() => expect(screen.queryByTestId('linked-document-l2')).toBeNull());
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByTestId('toasts')).toHaveTextContent('Unlinked Second doc.pdf.');
    expect(screen.getByRole('heading', { name: 'Documents (2)' })).toBeInTheDocument();
  });

  it('Undo restores the link with the server token and the row is back', async () => {
    const restoreLink = jest.fn<(token: string) => Promise<void>>().mockResolvedValue(undefined);
    renderHost({ initialLinks: three(), restoreLink });
    openPanel();
    unlink('l2');
    await waitFor(() => expect(screen.queryByTestId('linked-document-l2')).toBeNull());
    await screen.findByTestId('toast-undo');

    await act(async () => {
      fireEvent.click(screen.getByTestId('toast-undo'));
    });

    expect(restoreLink).toHaveBeenCalledWith('tok-1');
  });

  it('Undo brings the row back in the list', async () => {
    renderHost({ initialLinks: three() });
    openPanel();
    unlink('l2');
    await waitFor(() => expect(screen.queryByTestId('linked-document-l2')).toBeNull());
    await screen.findByTestId('toast-undo');

    await act(async () => {
      fireEvent.click(screen.getByTestId('toast-undo'));
    });

    await waitFor(() => expect(screen.getByTestId('linked-document-l2')).toBeInTheDocument());
  });

  it('hands focus to Link document when the toast Undo button held focus and the toast goes away', async () => {
    renderHost({ initialLinks: three(), realToasts: true });
    openPanel();
    unlink('l2');
    const undo = await screen.findByTestId('toast-undo-button');
    undo.focus();

    await act(async () => {
      fireEvent.click(undo);
    });

    await waitFor(() => expect(screen.getByTestId('documents-link-document')).toHaveFocus());
  });

  it('falls through to the next remaining neighbour when the first one is gone too', async () => {
    renderHost({ initialLinks: three(), alsoRemoveOnUnlink: 'l3' });
    openPanel();
    unlink('l2');

    await waitFor(() => expect(screen.getByTestId('document-menu-l1')).toHaveFocus());
  });

  it('hands focus to the trigger when the toast goes away while the picker hides Link document', async () => {
    renderHost({ initialLinks: three(), realToasts: true });
    openPanel();
    unlink('l2');
    const undo = await screen.findByTestId('toast-undo-button');
    openPicker();
    undo.focus();

    await act(async () => {
      fireEvent.click(undo);
    });

    await waitFor(() => expect(screen.getByTestId('trigger')).toHaveFocus());
  });

  it('moves focus to the next row menu after unlinking a middle row', async () => {
    renderHost({ initialLinks: three() });
    openPanel();
    unlink('l2');

    await waitFor(() => expect(screen.getByTestId('document-menu-l3')).toHaveFocus());
  });

  it('moves focus to the previous row menu after unlinking the last row', async () => {
    renderHost({ initialLinks: three() });
    openPanel();
    unlink('l3');

    await waitFor(() => expect(screen.getByTestId('document-menu-l2')).toHaveFocus());
  });

  it('moves focus to Link document after unlinking the only row', async () => {
    renderHost({ initialLinks: [makeLink('l1', 'First doc.pdf')] });
    openPanel();
    unlink('l1');

    await waitFor(() => expect(screen.getByTestId('documents-link-document')).toHaveFocus());
    expect(screen.getByText('No documents linked yet.')).toBeInTheDocument();
  });

  it('uses the fallback title in the toast for a document that is gone', async () => {
    renderHost({ initialLinks: [makeLink('l12', null)] });
    openPanel();
    unlink('l12');

    await waitFor(() =>
      expect(screen.getByTestId('toasts')).toHaveTextContent('Unlinked Document #12.'),
    );
  });

  it('shows an error banner and refreshes when the delete fails; the row stays', async () => {
    const refresh = jest.fn();
    const removeLink = jest.fn<() => Promise<typeof TOKEN>>().mockRejectedValue(new Error('boom'));
    renderHost({ initialLinks: three(), removeLink, refresh });
    openPanel();
    unlink('l2');

    await waitFor(() =>
      expect(screen.getByText("Couldn't unlink the document. Try again.")).toBeInTheDocument(),
    );
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('linked-document-l2')).toBeInTheDocument();
    expect(screen.queryByTestId('toast-undo')).toBeNull();
  });
});

describe('DocumentsPanel — Link document picker', () => {
  it('opens the picker view with Back, title and subtitle, hides the list and footer', () => {
    renderHost({ initialLinks: [makeLink('l1', 'First doc.pdf')] });
    openPanel();
    openPicker();

    expect(screen.getByRole('heading', { name: 'Link document' })).toBeInTheDocument();
    expect(screen.getByTestId('documents-back')).toHaveFocus();
    expect(
      screen.getByText('Choose a Paperless-ngx document to link to this task.'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('document-browser')).toBeInTheDocument();
    expect(screen.queryByTestId('documents-list')).toBeNull();
    expect(screen.queryByTestId('documents-link-document')).toBeNull();
  });

  it('fetches the system-wide linked ids when the picker opens and hides linked documents by default', () => {
    const fetchSystemLinkedIds = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    renderHost({
      initialLinks: [makeLink('l1', 'First doc.pdf')],
      fetchSystemLinkedIds,
      systemLinkedIds: [7, 1],
    });
    openPanel();
    expect(fetchSystemLinkedIds).not.toHaveBeenCalled();
    openPicker();

    expect(fetchSystemLinkedIds).toHaveBeenCalledTimes(1);
    expect(browserProps.defaultHideLinked).toBe(true);
    expect(browserProps.linkedDocumentIds?.slice().sort()).toEqual([1, 7]);
  });

  it('Back returns to the list with focus on Link document', () => {
    renderHost();
    openPanel();
    openPicker();
    fireEvent.click(screen.getByTestId('documents-back'));

    expect(screen.getByTestId('documents-link-document')).toHaveFocus();
    expect(screen.getByRole('heading', { name: 'Documents (0)' })).toBeInTheDocument();
  });

  it('Escape in the picker returns to the list (sheet stays open); a second Escape closes it', () => {
    renderHost();
    openPanel();
    openPicker();

    fireEvent.keyDown(screen.getByLabelText('Search documents'), { key: 'Escape' });

    expect(screen.getByTestId('documents-panel')).toBeInTheDocument();
    expect(screen.getByTestId('documents-link-document')).toHaveFocus();
    expect(screen.queryByTestId('document-browser')).toBeNull();

    fireEvent.keyDown(screen.getByTestId('documents-link-document'), { key: 'Escape' });

    expectSheetClosed();
  });

  it('Escape on the Back button also returns to the list and keeps the sheet open', () => {
    renderHost();
    openPanel();
    openPicker();

    fireEvent.keyDown(screen.getByTestId('documents-back'), { key: 'Escape' });

    expect(screen.getByTestId('documents-panel')).toBeInTheDocument();
    expect(screen.getByTestId('documents-link-document')).toHaveFocus();
    expect(screen.queryByTestId('document-browser')).toBeNull();
  });

  it('an Escape already consumed by an inner layer does not leave the picker', () => {
    renderHost();
    openPanel();
    openPicker();
    const input = screen.getByLabelText('Search documents');
    input.addEventListener('keydown', (event) => markEscapeHandled(event));

    fireEvent.keyDown(input, { key: 'Escape' });

    expect(screen.getByTestId('document-browser')).toBeInTheDocument();
  });

  it('ignores other keys in the picker', () => {
    renderHost();
    openPanel();
    openPicker();

    fireEvent.keyDown(screen.getByLabelText('Search documents'), { key: 'a' });

    expect(screen.getByTestId('document-browser')).toBeInTheDocument();
  });

  it('selecting a document links it (no type for a task), announces it and focuses the new row menu', async () => {
    const addLink = jest.fn<(id: number, type?: AttachmentType | null) => Promise<void>>();
    renderHost({ addLink });
    // The default host addLink appends a row; reuse it through a wrapper-free path.
    addLink.mockResolvedValue(undefined);
    openPanel();
    openPicker();
    fireEvent.click(screen.getByTestId('pick-doc'));

    await waitFor(() => expect(addLink).toHaveBeenCalledWith(99, undefined));
    await waitFor(() =>
      expect(screen.getByRole('status', { hidden: true })).toHaveTextContent(
        'Linked Sample scan.pdf.',
      ),
    );
    expect(screen.getByTestId('documents-link-document')).toBeInTheDocument();
  });

  it('focuses the new row menu after the link appears', async () => {
    renderHost();
    openPanel();
    openPicker();
    fireEvent.click(screen.getByTestId('pick-doc'));

    await waitFor(() => expect(screen.getByTestId('document-menu-l99')).toHaveFocus());
  });

  it('an invoice link carries the chosen document type; "No tag" sends null', async () => {
    const addLink = jest.fn<(id: number, type?: AttachmentType | null) => Promise<void>>();
    addLink.mockResolvedValue(undefined);
    renderHost({ entityType: 'invoice', addLink });
    openPanel();
    openPicker();

    fireEvent.change(screen.getByLabelText('Document type (optional)'), {
      target: { value: 'deposit' },
    });
    fireEvent.click(screen.getByTestId('pick-doc'));
    await waitFor(() => expect(addLink).toHaveBeenLastCalledWith(99, 'deposit'));

    openPicker();
    expect(screen.getByLabelText('Document type (optional)')).toHaveValue('');
    fireEvent.click(screen.getByTestId('pick-doc'));
    await waitFor(() => expect(addLink).toHaveBeenLastCalledWith(99, null));
  });

  it('choosing "No tag" in the picker clears the pending type', async () => {
    const addLink = jest.fn<(id: number, type?: AttachmentType | null) => Promise<void>>();
    addLink.mockResolvedValue(undefined);
    renderHost({ entityType: 'invoice', addLink });
    openPanel();
    openPicker();
    const select = screen.getByLabelText('Document type (optional)');
    fireEvent.change(select, { target: { value: 'deposit' } });
    fireEvent.change(select, { target: { value: '' } });
    fireEvent.click(screen.getByTestId('pick-doc'));

    await waitFor(() => expect(addLink).toHaveBeenCalledWith(99, null));
  });

  it('shows the type select only for invoices; Back resets the pending type', () => {
    const { unmount } = renderHost({ entityType: 'work_item' });
    openPanel();
    openPicker();
    expect(screen.queryByLabelText('Document type (optional)')).toBeNull();
    unmount();

    renderHost({ entityType: 'invoice' });
    openPanel();
    openPicker();
    fireEvent.change(screen.getByLabelText('Document type (optional)'), {
      target: { value: 'quotation' },
    });
    fireEvent.click(screen.getByTestId('documents-back'));
    openPicker();
    expect(screen.getByLabelText('Document type (optional)')).toHaveValue('');
  });

  it.each(DOCUMENT_LINK_ENTITY_TYPES)(
    'shows the duplicate message for %s with the entity phrase',
    async (entityType) => {
      const addLink = jest
        .fn<() => Promise<void>>()
        .mockRejectedValue(
          new ApiClientError(409, { code: 'DUPLICATE_DOCUMENT_LINK', message: 'dup' }),
        );
      renderHost({ entityType, addLink });
      openPanel();
      openPicker();
      fireEvent.click(screen.getByTestId('pick-doc'));

      const phrase = {
        work_item: 'this task',
        household_item: 'this purchase',
        invoice: 'this invoice',
        budget_source: 'this funding source',
        subsidy_program: 'this grant',
      }[entityType];
      await waitFor(() =>
        expect(
          screen.getByText(`This document is already linked to ${phrase}.`),
        ).toBeInTheDocument(),
      );
      expect(screen.getByTestId('documents-link-document')).toHaveFocus();
    },
  );

  it('shows the generic message when linking fails otherwise', async () => {
    const addLink = jest.fn<() => Promise<void>>().mockRejectedValue(new Error('boom'));
    renderHost({ addLink });
    openPanel();
    openPicker();
    fireEvent.click(screen.getByTestId('pick-doc'));

    await waitFor(() =>
      expect(screen.getByText("Couldn't link the document. Try again.")).toBeInTheDocument(),
    );
  });

  it('shows the generic message for an ApiClientError that is not a duplicate', async () => {
    const addLink = jest
      .fn<() => Promise<void>>()
      .mockRejectedValue(new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'x' }));
    renderHost({ addLink });
    openPanel();
    openPicker();
    fireEvent.click(screen.getByTestId('pick-doc'));

    await waitFor(() =>
      expect(screen.getByText("Couldn't link the document. Try again.")).toBeInTheDocument(),
    );
  });
});

describe('DocumentsPanel — Browse all', () => {
  it('is absent while the documents route is not served', () => {
    renderHost();
    openPanel();

    expect(screen.queryByTestId('documents-browse-all')).toBeNull();
  });

  it('is an anchor with origin state that closes the sheet when the route is served', () => {
    mockDocumentsServed = true;
    renderHost();
    openPanel();

    const link = screen.getByTestId('documents-browse-all');
    expect(link).toHaveTextContent('Browse all');
    fireEvent.click(link);

    expect(probedPath()).toBe('/documents');
    expect(probedOrigin()?.to).toBe('/project/work-items/wi-1?tab=cost');
    expectSheetClosed();
  });
});

describe('DocumentsPanel — invoices', () => {
  const invoiceLink = (attachmentType: AttachmentType | null = null) =>
    makeLink('l7', 'Sample offer.pdf', { entityType: 'invoice', attachmentType });

  it('offers Itemize only with autoItemizeEnabled and navigates to the auto-itemize page with origin state', () => {
    renderHost({
      entityType: 'invoice',
      autoItemizeEnabled: true,
      initialLinks: [invoiceLink()],
    });
    openPanel();
    fireEvent.click(screen.getByTestId('document-menu-l7'));
    fireEvent.click(screen.getByTestId('document-itemize-l7'));

    expect(probedPath()).toBe('/budget/invoices/wi-1/auto-itemize/7');
    expect(probedOrigin()?.to).toBe('/project/work-items/wi-1?tab=cost');
  });

  it('has no Itemize item when the setting is off or the entity is not an invoice', () => {
    const { unmount } = renderHost({ entityType: 'invoice', initialLinks: [invoiceLink()] });
    openPanel();
    fireEvent.click(screen.getByTestId('document-menu-l7'));
    expect(screen.queryByTestId('document-itemize-l7')).toBeNull();
    unmount();

    renderHost({ autoItemizeEnabled: true, initialLinks: [makeLink('l7', 'Sample offer.pdf')] });
    openPanel();
    fireEvent.click(screen.getByTestId('document-menu-l7'));
    expect(screen.queryByTestId('document-itemize-l7')).toBeNull();
  });

  it('does not navigate when Itemize is chosen for a document that is gone', () => {
    renderHost({
      entityType: 'invoice',
      autoItemizeEnabled: true,
      initialLinks: [makeLink('l7', null, { entityType: 'invoice' })],
    });
    openPanel();
    fireEvent.click(screen.getByTestId('document-menu-l7'));

    expect(screen.queryByTestId('document-itemize-l7')).toBeNull();
    expect(probedPath()).toBe('/project/work-items/wi-1');
  });

  it('changes the document type through updateAttachmentType and announces the translated label', async () => {
    const updateAttachmentType = jest
      .fn<(id: string, type: AttachmentType | null) => Promise<void>>()
      .mockResolvedValue(undefined);
    renderHost({ entityType: 'invoice', initialLinks: [invoiceLink()], updateAttachmentType });
    openPanel();

    fireEvent.change(screen.getByLabelText('Tag document type: Sample offer.pdf'), {
      target: { value: 'deposit' },
    });

    await waitFor(() => expect(updateAttachmentType).toHaveBeenCalledWith('l7', 'deposit'));
    await waitFor(() =>
      expect(screen.getByRole('status', { hidden: true })).toHaveTextContent(
        'Sample offer.pdf tagged as Deposit',
      ),
    );
  });

  it('announces "No tag" when the type is removed', async () => {
    renderHost({ entityType: 'invoice', initialLinks: [invoiceLink('deposit')] });
    openPanel();

    fireEvent.change(screen.getByLabelText('Tag document type: Sample offer.pdf'), {
      target: { value: '' },
    });

    await waitFor(() =>
      expect(screen.getByRole('status', { hidden: true })).toHaveTextContent(
        'Sample offer.pdf tagged as No tag',
      ),
    );
  });

  it('clears the announcement after three seconds', async () => {
    jest.useFakeTimers();
    renderHost({ entityType: 'invoice', initialLinks: [invoiceLink()] });
    openPanel();
    fireEvent.change(screen.getByLabelText('Tag document type: Sample offer.pdf'), {
      target: { value: 'invoice' },
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByRole('status', { hidden: true })).toHaveTextContent('tagged as Invoice');

    act(() => {
      jest.advanceTimersByTime(3000);
    });

    expect(screen.getByRole('status', { hidden: true })).toHaveTextContent('');
  });

  it('restarts the three-second clear when a second announcement arrives', async () => {
    jest.useFakeTimers();
    try {
      renderHost({ entityType: 'invoice', initialLinks: [invoiceLink()] });
      openPanel();
      const select = screen.getByLabelText('Tag document type: Sample offer.pdf');
      const status = () => screen.getByRole('status', { hidden: true });

      fireEvent.change(select, { target: { value: 'invoice' } });
      await act(async () => {
        await Promise.resolve();
      });
      expect(status()).toHaveTextContent('tagged as Invoice');

      act(() => {
        jest.advanceTimersByTime(2000);
      });
      fireEvent.change(select, { target: { value: 'deposit' } });
      await act(async () => {
        await Promise.resolve();
      });
      expect(status()).toHaveTextContent('tagged as Deposit');

      // 2 s after the second announcement the first timer would already have fired.
      act(() => {
        jest.advanceTimersByTime(2000);
      });
      expect(status()).toHaveTextContent('tagged as Deposit');

      act(() => {
        jest.advanceTimersByTime(1000);
      });
      expect(status()).toHaveTextContent('');
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('cancels the pending announcement timer on unmount (no state update afterwards)', async () => {
    jest.useFakeTimers();
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    // Plain wrappers (not jest spies): Testing Library treats a mock-function setTimeout as fake
    // timers and would stall later waitFor calls.
    const fakeSetTimeout = window.setTimeout;
    const fakeClearTimeout = window.clearTimeout;
    const announceTimers: number[] = [];
    const cleared: unknown[] = [];
    window.setTimeout = ((handler: TimerHandler, delay?: number, ...args: unknown[]) => {
      const id = fakeSetTimeout(handler, delay, ...args);
      if (delay === 3000) announceTimers.push(id);
      return id;
    }) as typeof window.setTimeout;
    window.clearTimeout = ((id?: number) => {
      cleared.push(id);
      fakeClearTimeout(id);
    }) as typeof window.clearTimeout;
    try {
      const view = renderHost({ entityType: 'invoice', initialLinks: [invoiceLink()] });
      openPanel();
      fireEvent.change(screen.getByLabelText('Tag document type: Sample offer.pdf'), {
        target: { value: 'invoice' },
      });
      await act(async () => {
        await Promise.resolve();
      });
      expect(announceTimers).toHaveLength(1);

      view.unmount();

      expect(cleared).toContain(announceTimers[0]);
      act(() => {
        jest.advanceTimersByTime(5000);
      });
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      window.setTimeout = fakeSetTimeout;
      window.clearTimeout = fakeClearTimeout;
      consoleError.mockRestore();
      jest.useRealTimers();
    }
  });

  it('shows the translated message for an ApiClientError when the type update fails', async () => {
    const updateAttachmentType = jest
      .fn<() => Promise<void>>()
      .mockRejectedValue(new ApiClientError(404, { code: 'NOT_FOUND', message: 'server text' }));
    renderHost({ entityType: 'invoice', initialLinks: [invoiceLink()], updateAttachmentType });
    openPanel();
    fireEvent.change(screen.getByLabelText('Tag document type: Sample offer.pdf'), {
      target: { value: 'deposit' },
    });

    await waitFor(() => expect(screen.queryByText('server text')).toBeNull());
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('alert')).not.toHaveTextContent('server text');
  });

  it('shows the generic message for another failure when the type update fails', async () => {
    const updateAttachmentType = jest.fn<() => Promise<void>>().mockRejectedValue(new Error('x'));
    renderHost({ entityType: 'invoice', initialLinks: [invoiceLink()], updateAttachmentType });
    openPanel();
    fireEvent.change(screen.getByLabelText('Tag document type: Sample offer.pdf'), {
      target: { value: 'deposit' },
    });

    await waitFor(() =>
      expect(screen.getByText("Couldn't change the document type. Try again.")).toBeInTheDocument(),
    );
  });

  it('disables only the select of the link being updated', async () => {
    let finish: () => void = () => {};
    const updateAttachmentType = jest.fn<() => Promise<void>>(
      () => new Promise<void>((resolve) => (finish = resolve)),
    );
    renderHost({
      entityType: 'invoice',
      initialLinks: [invoiceLink(), makeLink('l8', 'Other.pdf', { entityType: 'invoice' })],
      updateAttachmentType,
    });
    openPanel();
    fireEvent.change(screen.getByLabelText('Tag document type: Sample offer.pdf'), {
      target: { value: 'deposit' },
    });

    expect(screen.getByLabelText('Tag document type: Sample offer.pdf')).toBeDisabled();
    expect(screen.getByLabelText('Tag document type: Other.pdf')).not.toBeDisabled();
    await act(async () => finish());
    await waitFor(() =>
      expect(screen.getByLabelText('Tag document type: Sample offer.pdf')).not.toBeDisabled(),
    );
  });
});

describe('DocumentsPanel — user text', () => {
  it('tags document titles with the entries language but not the fallback title', () => {
    renderHost({ initialLinks: [makeLink('l1', 'Sample offer.pdf'), makeLink('l12', null)] });
    openPanel();

    expect(screen.getByRole('heading', { name: 'Sample offer.pdf' })).toHaveAttribute('lang', 'en');
    expect(screen.getByRole('heading', { name: 'Document #12' })).not.toHaveAttribute('lang');
  });

  it('tags the Details preview text with the entries language', () => {
    renderHost({ initialLinks: [makeLink('l1', 'Sample offer.pdf')] });
    openPanel();
    fireEvent.click(screen.getByTestId('document-details-l1'));

    expect(screen.getByText('Sample preview text')).toHaveAttribute('lang', 'en');
  });
});

describe('DocumentsPanel — primary button rule', () => {
  it('does not style anything in the panel as a primary button', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const dir = path.resolve(process.cwd(), 'client/src/components/DocumentsPanel');
    const css = fs.readFileSync(path.join(dir, 'DocumentsPanel.module.css'), 'utf8');
    const buttonCss = fs.readFileSync(path.join(dir, 'DocumentsPanelButton.module.css'), 'utf8');

    for (const source of [css, buttonCss]) {
      expect(source).not.toMatch(/background(-color)?:\s*var\(--color-primary\)/);
    }
  });
});
