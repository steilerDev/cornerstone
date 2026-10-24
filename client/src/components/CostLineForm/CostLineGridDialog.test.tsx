/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import type { PaperlessStatusResponse } from '@cornerstone/shared';
import { ApiClientError, NetworkError } from '../../lib/apiClient.js';
import { installMatchMedia } from '../../test/matchMediaControl.js';
import type { MatchMediaControl } from '../../test/matchMediaControl.js';
import type * as DialogModule from './CostLineGridDialog.js';
import type { CostLineHost } from '../CostLineTable/types.js';

// ─── Module boundaries ───────────────────────────────────────────────────────

const localeState = { resolved: 'en' };
jest.unstable_mockModule('../../contexts/LocaleContext.js', () => {
  const localeValue = {
    locale: 'en',
    get resolvedLocale() {
      return localeState.resolved;
    },
    currency: 'EUR',
    vatRate: 0.19,
    setLocale: jest.fn(),
    syncWithServer: jest.fn(),
  };
  return {
    LocaleProvider: ({ children }: { children: unknown }) => children,
    useLocale: () => localeValue,
  };
});

jest.unstable_mockModule('../Toast/ToastContext.js', () => ({
  useToast: () => ({ showUndoToast: jest.fn(), showToast: jest.fn() }),
}));

const mockSearchEverywhere = jest.fn<(...a: unknown[]) => Promise<unknown>>();
jest.unstable_mockModule('../../lib/searchApi.js', () => ({
  searchEverywhere: mockSearchEverywhere,
}));

jest.unstable_mockModule('../../lib/workItemBudgetsApi.js', () => ({
  fetchWorkItemBudgets: jest.fn(),
  createWorkItemBudget: jest.fn(),
  updateWorkItemBudget: jest.fn(),
  deleteWorkItemBudget: jest.fn(),
}));
jest.unstable_mockModule('../../lib/householdItemBudgetsApi.js', () => ({
  fetchHouseholdItemBudgets: jest.fn(),
  createHouseholdItemBudget: jest.fn(),
  updateHouseholdItemBudget: jest.fn(),
  deleteHouseholdItemBudget: jest.fn(),
}));

const mockCreateBatch = jest.fn<(...a: unknown[]) => Promise<unknown>>();
jest.unstable_mockModule('../../lib/budgetLinesBatchApi.js', () => ({
  createBudgetLinesBatch: mockCreateBatch,
}));

let mockOptions = {
  categories: [],
  sources: [],
  categoryOptions: [{ value: 'cat1', label: 'Materials' }],
  sourceOptions: [{ value: 'disc', label: 'Discretionary' }],
  discretionarySourceId: 'disc' as string | null,
  loading: false,
  failed: false,
};
jest.unstable_mockModule('./useCostLineOptions.js', () => ({
  useCostLineOptions: () => mockOptions,
}));

interface LinkStub {
  id: string;
  createdAt: string;
  paperlessDocumentId: number;
  document: { title: string } | null;
}
let mockLinks: LinkStub[] = [];
jest.unstable_mockModule('../../hooks/useDocumentLinks.js', () => ({
  useDocumentLinks: () => ({ links: mockLinks }),
}));

const mockGetStatus = jest.fn<() => Promise<PaperlessStatusResponse>>();
jest.unstable_mockModule('../../lib/paperlessStatusCache.js', () => ({
  getSharedPaperlessStatus: mockGetStatus,
  resetPaperlessStatusCache: jest.fn(),
  PAPERLESS_STATUS_TTL_MS: 10_000,
}));

jest.unstable_mockModule('../autoItemize/AutoItemizePdfPreview.js', () => ({
  AutoItemizePdfPreview: (props: { documentId: number; paperlessUrl?: string | null }) => (
    <div data-testid="pdf-probe">
      doc-{props.documentId}-{props.paperlessUrl}
    </div>
  ),
}));

let CostLineGridDialog: typeof DialogModule.CostLineGridDialog;
let media: MatchMediaControl;

const TASK_HOST: CostLineHost = { kind: 'work_item', id: 'w1', label: 'Tiling' };
const INVOICE_HOST: CostLineHost = {
  kind: 'invoice',
  id: 'inv1',
  label: 'Acme · INV-7',
  status: 'paid',
  amount: 1000,
  vendorId: 'v1',
};

beforeEach(async () => {
  jest.clearAllMocks();
  localeState.resolved = 'en';
  mockOptions = { ...mockOptions, loading: false, failed: false, discretionarySourceId: 'disc' };
  mockLinks = [];
  mockGetStatus.mockResolvedValue({
    configured: false,
    reachable: false,
    error: null,
    paperlessUrl: null,
  } as PaperlessStatusResponse);
  mockSearchEverywhere.mockResolvedValue({
    groups: [{ type: 'work_item', items: [{ id: 'w2', label: 'Painting', areaPath: [] }] }],
  });
  media = installMatchMedia({ '(min-width: 768px)': true });
  ({ CostLineGridDialog } = await import('./CostLineGridDialog.js'));
});

function setup(
  host: CostLineHost = TASK_HOST,
  props: Partial<ComponentProps<typeof DialogModule.CostLineGridDialog>> = {},
) {
  const onSaved = jest.fn<(count: number) => void>();
  const onClose = jest.fn<() => void>();
  const user = userEvent.setup();
  const view = render(
    <CostLineGridDialog host={host} mode="add" onSaved={onSaved} onClose={onClose} {...props} />,
  );
  return { ...view, user, onSaved, onClose };
}

async function fillRow(
  user: ReturnType<typeof userEvent.setup>,
  rowId: string,
  description: string,
  price: string,
) {
  await user.type(screen.getByTestId(`cost-line-grid-description-${rowId}`), description);
  await user.type(screen.getByTestId(`cost-line-grid-unitPrice-${rowId}`), price);
}

function firstRowId(): string {
  const row = document.querySelector<HTMLElement>('tr[data-row]');
  return row!.dataset.row!;
}

describe('CostLineGridDialog layout', () => {
  it('opens as a dialog titled Add lines with focus in the first description', async () => {
    setup();
    const dialog = await screen.findByRole('dialog', { name: 'Add lines' });
    expect(dialog).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId(`cost-line-grid-description-${firstRowId()}`)).toHaveFocus(),
    );
    expect(screen.queryByLabelText('Assign all to')).not.toBeInTheDocument();
    expect(screen.getByText('0 lines')).toBeInTheDocument();
  });

  it('titles the split mode with the host label and shows Belongs to on document hosts', async () => {
    setup(INVOICE_HOST, { mode: 'split', remainingAmount: 500 });
    expect(await screen.findByRole('dialog', { name: 'Split Acme · INV-7' })).toBeInTheDocument();
    expect(screen.getByLabelText('Assign all to')).toBeInTheDocument();
    expect(screen.getByTestId('cost-line-grid-remainder')).toHaveTextContent('Not yet split');
  });

  it('shows no remaining footer for task hosts even when an amount is passed', async () => {
    setup(TASK_HOST, { remainingAmount: 500 });
    await screen.findByRole('dialog');
    expect(screen.queryByTestId('cost-line-grid-total')).not.toBeInTheDocument();
  });

  it('uses a full-screen sheet below 768px', async () => {
    media.set('(min-width: 768px)', false);
    setup();
    expect(await screen.findByTestId('cost-line-grid-sheet')).toBeInTheDocument();
  });

  it('warns when the categories and sources could not be loaded', async () => {
    mockOptions = { ...mockOptions, failed: true };
    setup();
    // The banner, plus the hidden reason that explains the blocked Save.
    expect(await screen.findAllByText('The cost lines could not be loaded.')).toHaveLength(2);
  });
});

describe('saving', () => {
  it('saves task rows as estimates on the task through one batch request', async () => {
    mockCreateBatch.mockResolvedValue({ lines: [{ index: 0 }, { index: 1 }] });
    const { user, onSaved, onClose } = setup();
    await screen.findByRole('dialog');
    const first = firstRowId();
    await fillRow(user, first, 'Tile', '100');
    const second = document.querySelectorAll<HTMLElement>('tr[data-row]')[1]!.dataset.row!;
    await fillRow(user, second, 'Glue', '20');
    expect(screen.getByText('2 lines')).toBeInTheDocument();
    await user.click(screen.getByTestId('cost-line-grid-save'));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(2));
    expect(onClose).toHaveBeenCalled();
    const body = mockCreateBatch.mock.calls[0]![0] as { invoiceId?: string; lines: unknown[] };
    expect(body.invoiceId).toBeUndefined();
    expect(body.lines).toMatchObject([
      {
        kind: 'create',
        targetType: 'work_item',
        targetId: 'w1',
        description: 'Tile',
        plannedAmount: 100,
        includesVat: false,
        confidence: 'own_estimate',
        budgetSourceId: 'disc',
      },
      { description: 'Glue', plannedAmount: 20 },
    ]);
  });

  it('saves document rows linked to the invoice, assigned with Assign all to', async () => {
    mockCreateBatch.mockResolvedValue({ lines: [{ index: 0 }] });
    const { user, onSaved } = setup(INVOICE_HOST);
    await screen.findByRole('dialog');
    await user.type(screen.getByLabelText('Assign all to'), 'Pai');
    await user.click(await screen.findByRole('option', { name: /Painting/ }));
    await fillRow(user, firstRowId(), 'Paint', '50');
    await user.click(screen.getByTestId('cost-line-grid-save'));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(1));
    expect(mockCreateBatch.mock.calls[0]![0]).toMatchObject({
      invoiceId: 'inv1',
      lines: [{ targetId: 'w2', confidence: 'invoice', description: 'Paint' }],
    });
  });

  it('saves with Ctrl+S from a cell', async () => {
    mockCreateBatch.mockResolvedValue({ lines: [{ index: 0 }] });
    const { user, onSaved } = setup();
    await screen.findByRole('dialog');
    await fillRow(user, firstRowId(), 'Tile', '100');
    await user.keyboard('{Control>}s{/Control}');
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it('announces and refocuses the grid when there is nothing to save', async () => {
    const { user } = setup();
    await screen.findByRole('dialog');
    await user.click(screen.getByTestId('cost-line-grid-save'));
    expect(mockCreateBatch).not.toHaveBeenCalled();
    expect(screen.getByTestId('cost-line-grid-status')).toHaveTextContent('0 lines');
    expect(screen.getByTestId(`cost-line-grid-description-${firstRowId()}`)).toHaveFocus();
  });

  it('shows every error and focuses the first invalid cell instead of saving', async () => {
    const { user } = setup();
    await screen.findByRole('dialog');
    await user.type(screen.getByTestId(`cost-line-grid-description-${firstRowId()}`), 'Tile');
    await user.click(screen.getByTestId('cost-line-grid-save'));
    expect(mockCreateBatch).not.toHaveBeenCalled();
    expect(screen.getByText('Error: Enter a unit price of 0 or more.')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId(`cost-line-grid-unitPrice-${firstRowId()}`)).toHaveFocus(),
    );
    expect(screen.getByRole('button', { name: '1 row needs attention.' })).toBeInTheDocument();
  });

  it('jumps to the first invalid cell from the needs-attention button', async () => {
    const { user } = setup();
    await screen.findByRole('dialog');
    await user.type(screen.getByTestId(`cost-line-grid-description-${firstRowId()}`), 'Tile');
    await user.click(screen.getByRole('button', { name: '1 row needs attention.' }));
    await waitFor(() =>
      expect(screen.getByTestId(`cost-line-grid-unitPrice-${firstRowId()}`)).toHaveFocus(),
    );
  });

  it('marks Save aria-disabled while saving and ignores a second click', async () => {
    let resolve!: (value: unknown) => void;
    mockCreateBatch.mockReturnValue(new Promise((r) => (resolve = r)));
    const { user, onSaved } = setup();
    await screen.findByRole('dialog');
    await fillRow(user, firstRowId(), 'Tile', '100');
    const save = screen.getByTestId('cost-line-grid-save');
    await user.click(save);
    await waitFor(() => expect(save).toHaveAttribute('aria-disabled', 'true'));
    expect(save).toHaveTextContent('Saving…');
    await user.click(save);
    await user.click(screen.getByTestId('cost-line-grid-cancel'));
    expect(mockCreateBatch).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Discard changes?')).not.toBeInTheDocument();
    await act(async () => resolve({ lines: [{ index: 0 }] }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(1));
  });
});

describe('saving while the funding sources are not ready', () => {
  async function fillValid() {
    const view = setup();
    await screen.findByRole('dialog');
    await fillRow(view.user, firstRowId(), 'Tile', '100');
    return view;
  }

  it('blocks Save and both shortcuts, explaining that sources are still loading', async () => {
    mockOptions = { ...mockOptions, loading: true };
    const { user, onSaved } = await fillValid();
    const save = screen.getByTestId('cost-line-grid-save');
    expect(save).toHaveAttribute('aria-disabled', 'true');
    expect(save).not.toBeDisabled();
    expect(save).toHaveAttribute('aria-describedby', 'cost-line-grid-save-reason');
    const reason = screen.getByTestId('cost-line-grid-save-reason');
    expect(reason).toHaveAttribute('id', 'cost-line-grid-save-reason');
    expect(reason).toHaveTextContent('Funding sources are still loading.');
    expect(save).toHaveAccessibleDescription('Funding sources are still loading.');
    // While loading the reason is visible muted text, not screen-reader-only.
    expect(reason).toHaveClass('saveReason');
    expect(reason).not.toHaveClass('srOnly');

    await user.click(save);
    await user.keyboard('{Control>}s{/Control}');
    await user.keyboard('{Control>}{Enter}{/Control}');
    await user.keyboard('{Meta>}s{/Meta}');
    expect(mockCreateBatch).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    // Nothing was announced or revealed either: the guard returns before validation.
    expect(screen.getByTestId('cost-line-grid-status')).toBeEmptyDOMElement();
  });

  it('blocks Save and both shortcuts after the sources failed to load, keeping the banner', async () => {
    mockOptions = { ...mockOptions, failed: true };
    const { user, onSaved } = await fillValid();
    const save = screen.getByTestId('cost-line-grid-save');
    expect(save).toHaveAttribute('aria-disabled', 'true');
    expect(save).not.toBeDisabled();
    expect(save).toHaveAttribute('aria-describedby', 'cost-line-grid-save-reason');
    const reason = screen.getByTestId('cost-line-grid-save-reason');
    expect(reason).toHaveTextContent('The cost lines could not be loaded.');
    // The banner already shows the failure, so the reason stays visually hidden.
    expect(reason).toHaveClass('srOnly');
    expect(reason).not.toHaveClass('saveReason');
    // The existing failure banner stays next to the new reason.
    expect(screen.getAllByText('The cost lines could not be loaded.')).toHaveLength(2);

    await user.click(save);
    await user.keyboard('{Control>}s{/Control}');
    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(mockCreateBatch).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('prefers the loading reason while loading even if a failure is also set', async () => {
    mockOptions = { ...mockOptions, loading: true, failed: true };
    await fillValid();
    expect(screen.getByTestId('cost-line-grid-save-reason')).toHaveTextContent(
      'Funding sources are still loading.',
    );
  });

  it('has no blocked state, reason or description once the options are ready', async () => {
    const { user } = await fillValid();
    const save = screen.getByTestId('cost-line-grid-save');
    expect(save).not.toHaveAttribute('aria-disabled');
    expect(save).not.toHaveAttribute('aria-describedby');
    expect(screen.queryByTestId('cost-line-grid-save-reason')).not.toBeInTheDocument();
    mockCreateBatch.mockResolvedValue({ lines: [{ index: 0 }] });
    await user.click(save);
    await waitFor(() => expect(mockCreateBatch).toHaveBeenCalledTimes(1));
  });

  it('saves once the options finish loading', async () => {
    mockOptions = { ...mockOptions, loading: true };
    mockCreateBatch.mockResolvedValue({ lines: [{ index: 0 }] });
    const { user, onSaved, rerender } = await fillValid();
    await user.click(screen.getByTestId('cost-line-grid-save'));
    expect(mockCreateBatch).not.toHaveBeenCalled();

    mockOptions = { ...mockOptions, loading: false };
    rerender(
      <CostLineGridDialog host={TASK_HOST} mode="add" onSaved={onSaved} onClose={jest.fn()} />,
    );
    const save = screen.getByTestId('cost-line-grid-save');
    expect(save).not.toHaveAttribute('aria-disabled');
    expect(screen.queryByTestId('cost-line-grid-save-reason')).not.toBeInTheDocument();
    await user.click(save);
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(1));
    expect(mockCreateBatch).toHaveBeenCalledTimes(1);
  });
});

describe('server errors', () => {
  async function saveWith(error: unknown) {
    mockCreateBatch.mockRejectedValue(error);
    const view = setup();
    await screen.findByRole('dialog');
    await fillRow(view.user, firstRowId(), 'Tile', '100');
    await view.user.click(screen.getByTestId('cost-line-grid-save'));
    return view;
  }

  it('maps /lines/<i>/<field> paths to the cells of the row', async () => {
    await saveWith(
      new ApiClientError(400, {
        code: 'VALIDATION_ERROR',
        message: 'x',
        details: { fields: [{ path: '/lines/0/description' }] },
      }),
    );
    expect(await screen.findByText('Error: Enter a description.')).toBeInTheDocument();
    expect(screen.queryByText(/Validation/i)).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId(`cost-line-grid-description-${firstRowId()}`)).toHaveFocus(),
    );
    expect(screen.getByTestId('cost-line-grid-save')).not.toHaveAttribute('aria-disabled');
  });

  it('maps details.index to the row and keeps the rows', async () => {
    await saveWith(
      new ApiClientError(400, {
        code: 'ITEMIZED_SUM_EXCEEDS_INVOICE',
        message: 'x',
        details: { index: 0 },
      }),
    );
    expect(
      await screen.findByText(
        'Error: The cost lines would be more than this offer or invoice is worth.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId(`cost-line-grid-description-${firstRowId()}`)).toHaveValue('Tile');
  });

  it('shows a banner for errors that cannot be placed on a row and clears server errors on edit', async () => {
    const { user } = await saveWith(
      new ApiClientError(400, {
        code: 'VALIDATION_ERROR',
        message: 'x',
        details: { fields: [{ path: '/lines/0/description' }, { path: '/lines' }] },
      }),
    );
    expect(await screen.findByText('Error: Enter a description.')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    await user.type(screen.getByTestId(`cost-line-grid-description-${firstRowId()}`), '!');
    expect(screen.queryByText('Error: Enter a description.')).not.toBeInTheDocument();
  });

  it('translates a server error without row details into a banner', async () => {
    await saveWith(new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'x' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('shows the network message for a lost connection', async () => {
    await saveWith(new NetworkError('offline', null));
    expect(await screen.findByText(/Can't reach the server/)).toBeInTheDocument();
  });

  it('shows the generic save failure for anything else', async () => {
    await saveWith(new Error('weird'));
    expect(await screen.findByText(/Couldn't save/)).toBeInTheDocument();
  });
});

describe('closing', () => {
  it('closes at once when nothing was entered', async () => {
    const { user, onClose } = setup();
    await screen.findByRole('dialog');
    await user.click(screen.getByTestId('cost-line-grid-cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('asks before discarding entered lines and keeps them on Keep editing', async () => {
    const { user, onClose } = setup();
    await screen.findByRole('dialog');
    await user.type(screen.getByTestId(`cost-line-grid-description-${firstRowId()}`), 'Tile');
    await user.click(screen.getByTestId('cost-line-grid-cancel'));
    const confirm = await screen.findByRole('alertdialog', { name: 'Discard changes?' });
    expect(within(confirm).getByText('The lines you added are not saved.')).toBeInTheDocument();
    await user.click(within(confirm).getByRole('button', { name: 'Keep editing' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId(`cost-line-grid-description-${firstRowId()}`)).toHaveValue('Tile');
  });

  it('discards on confirmation, also via Escape in a cell', async () => {
    const { user, onClose } = setup();
    await screen.findByRole('dialog');
    await user.type(screen.getByTestId(`cost-line-grid-description-${firstRowId()}`), 'Tile');
    await user.keyboard('{Escape}');
    const confirm = await screen.findByRole('alertdialog');
    await user.click(within(confirm).getByRole('button', { name: 'Discard' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('treats a picked Assign all to target as a change worth keeping', async () => {
    const { user, onClose } = setup(INVOICE_HOST);
    await screen.findByRole('dialog');
    await user.type(screen.getByLabelText('Assign all to'), 'Pai');
    await user.click(await screen.findByRole('option', { name: /Painting/ }));
    await user.click(screen.getByTestId('cost-line-grid-cancel'));
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('locale and unmounting', () => {
  it('reads decimal commas under the German locale', async () => {
    localeState.resolved = 'de';
    mockCreateBatch.mockResolvedValue({ lines: [{ index: 0 }] });
    const { user, onSaved } = setup();
    await screen.findByRole('dialog');
    await fillRow(user, firstRowId(), 'Fliese', '10,5');
    await user.click(screen.getByTestId('cost-line-grid-save'));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(mockCreateBatch.mock.calls[0]![0]).toMatchObject({ lines: [{ plannedAmount: 10.5 }] });
  });

  it('ignores a Paperless status that arrives after the dialog was closed', async () => {
    let resolve!: (value: PaperlessStatusResponse) => void;
    mockGetStatus.mockReturnValue(new Promise((r) => (resolve = r)));
    const { unmount } = setup(INVOICE_HOST);
    await screen.findByRole('dialog');
    unmount();
    await act(async () => {
      resolve({ configured: true, reachable: true } as PaperlessStatusResponse);
    });
    expect(screen.queryByTestId('cost-line-grid-preview')).not.toBeInTheDocument();
  });

  it('ignores a failing status that arrives after the dialog was closed', async () => {
    let reject!: (error: unknown) => void;
    mockGetStatus.mockReturnValue(new Promise((_r, rj) => (reject = rj)));
    const { unmount } = setup(INVOICE_HOST);
    await screen.findByRole('dialog');
    unmount();
    await act(async () => {
      reject(new Error('late'));
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('document preview', () => {
  const link = (id: string, createdAt: string, docId: number, title: string | null): LinkStub => ({
    id,
    createdAt,
    paperlessDocumentId: docId,
    document: title === null ? null : { title },
  });
  const ready = {
    configured: true,
    reachable: true,
    error: null,
    paperlessUrl: 'https://paper.example',
  } as PaperlessStatusResponse;

  it('shows the newest linked document beside the grid from 1024px', async () => {
    media.set('(min-width: 1024px)', true);
    mockGetStatus.mockResolvedValue(ready);
    mockLinks = [
      link('l1', '2026-01-01T00:00:00Z', 11, 'Old scan'),
      link('l2', '2026-02-01T00:00:00Z', 22, 'New scan'),
    ];
    setup(INVOICE_HOST);
    const preview = await screen.findByTestId('cost-line-grid-preview');
    expect(preview).toHaveAccessibleName('Document preview: New scan');
    expect(within(preview).getByTestId('pdf-probe')).toHaveTextContent(
      'doc-22-https://paper.example',
    );
    expect(screen.queryByTestId('cost-line-grid-show-document')).not.toBeInTheDocument();
  });

  it('offers Show document below 1024px and returns focus to it on close', async () => {
    mockGetStatus.mockResolvedValue(ready);
    mockLinks = [link('l1', '2026-01-01T00:00:00Z', 11, null)];
    const { user } = setup(INVOICE_HOST);
    const show = await screen.findByTestId('cost-line-grid-show-document');
    expect(screen.queryByTestId('cost-line-grid-preview')).not.toBeInTheDocument();
    await user.click(show);
    const sheet = await screen.findByTestId('cost-line-grid-document-sheet');
    expect(within(sheet).getByTestId('pdf-probe')).toHaveTextContent('doc-11');
    await user.click(within(sheet).getByRole('button', { name: /close/i }));
    await waitFor(() =>
      expect(screen.queryByTestId('cost-line-grid-document-sheet')).not.toBeInTheDocument(),
    );
    expect(show).toHaveFocus();
  });

  it('opens the document full-screen on narrow screens', async () => {
    media.set('(min-width: 768px)', false);
    mockGetStatus.mockResolvedValue(ready);
    mockLinks = [link('l1', '2026-01-01T00:00:00Z', 11, 'Scan')];
    const { user } = setup(INVOICE_HOST);
    await user.click(await screen.findByTestId('cost-line-grid-show-document'));
    expect(await screen.findByTestId('cost-line-grid-document-sheet')).toBeInTheDocument();
  });

  it.each([
    ['Paperless is not configured', { ...ready, configured: false }, true],
    ['Paperless is unreachable', { ...ready, reachable: false }, true],
    ['no document is linked', ready, false],
  ])('shows no preview when %s', async (_name, status, withLink) => {
    media.set('(min-width: 1024px)', true);
    mockGetStatus.mockResolvedValue(status as PaperlessStatusResponse);
    mockLinks = withLink ? [link('l1', '2026-01-01T00:00:00Z', 11, 'Scan')] : [];
    setup(INVOICE_HOST);
    await screen.findByRole('dialog');
    await waitFor(() => expect(mockGetStatus).toHaveBeenCalled());
    expect(screen.queryByTestId('cost-line-grid-preview')).not.toBeInTheDocument();
    expect(screen.queryByTestId('cost-line-grid-show-document')).not.toBeInTheDocument();
  });

  it('works without a preview when the Paperless status cannot be read', async () => {
    mockGetStatus.mockRejectedValue(new Error('down'));
    mockLinks = [link('l1', '2026-01-01T00:00:00Z', 11, 'Scan')];
    setup(INVOICE_HOST);
    await screen.findByRole('dialog');
    await waitFor(() => expect(mockGetStatus).toHaveBeenCalled());
    expect(screen.queryByTestId('cost-line-grid-show-document')).not.toBeInTheDocument();
  });
});
