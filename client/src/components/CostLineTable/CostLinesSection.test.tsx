/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { render, screen, waitFor, within, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type {
  BaseBudgetLine,
  InvoiceBudgetLineDetailResponse,
  InvoiceStatus,
} from '@cornerstone/shared';
import { ApiClientError, NetworkError } from '../../lib/apiClient.js';
import type * as SectionModule from './CostLinesSection.js';
import type { CostLineHost } from './types.js';

// ─── Module boundaries ───────────────────────────────────────────────────────

jest.unstable_mockModule('../../contexts/LocaleContext.js', () => {
  const localeValue = {
    locale: 'en',
    resolvedLocale: 'en',
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

const mockDeleteWorkItemBudget = jest.fn<(...a: unknown[]) => Promise<void>>();
const mockDeleteHouseholdItemBudget = jest.fn<(...a: unknown[]) => Promise<void>>();
const mockFetchInvoiceBudgetLines = jest.fn<(...a: unknown[]) => Promise<unknown>>();
const mockDeleteInvoiceBudgetLine = jest.fn<(...a: unknown[]) => Promise<void>>();
const mockFetchBudgetSources = jest.fn<(...a: unknown[]) => Promise<unknown>>();

jest.unstable_mockModule('../../lib/workItemBudgetsApi.js', () => ({
  deleteWorkItemBudget: mockDeleteWorkItemBudget,
}));
jest.unstable_mockModule('../../lib/householdItemBudgetsApi.js', () => ({
  deleteHouseholdItemBudget: mockDeleteHouseholdItemBudget,
}));
jest.unstable_mockModule('../../lib/invoiceBudgetLinesApi.js', () => ({
  fetchInvoiceBudgetLines: mockFetchInvoiceBudgetLines,
  deleteInvoiceBudgetLine: mockDeleteInvoiceBudgetLine,
}));
jest.unstable_mockModule('../../lib/budgetSourcesApi.js', () => ({
  fetchBudgetSources: mockFetchBudgetSources,
}));

// FE-B's dialogs are replaced by probes that expose their props.
interface FormProbeProps {
  host: CostLineHost;
  mode: { kind: string; row?: { id: string } };
  copyFrom?: { id: string };
  onSaved: () => void;
  onClose: () => void;
}
jest.unstable_mockModule('../CostLineForm/CostLineForm.js', () => ({
  CostLineForm: (props: FormProbeProps) => (
    <div
      role="dialog"
      aria-label="form-probe"
      data-mode={props.mode.kind}
      data-row={props.mode.row?.id ?? ''}
      data-copy={props.copyFrom?.id ?? ''}
      data-host={props.host.kind}
    >
      <button type="button" onClick={props.onSaved}>
        form-save
      </button>
      <button type="button" onClick={props.onClose}>
        form-close
      </button>
    </div>
  ),
}));
jest.unstable_mockModule('../CostLineForm/CostLineGridDialog.js', () => ({
  CostLineGridDialog: (props: {
    mode: string;
    remainingAmount?: number;
    onSaved: (count: number) => void;
    onClose: () => void;
  }) => (
    <div
      role="dialog"
      aria-label="grid-probe"
      data-mode={props.mode}
      data-remaining={props.remainingAmount ?? ''}
    >
      <button type="button" onClick={() => props.onSaved(1)}>
        grid-save-one
      </button>
      <button type="button" onClick={() => props.onSaved(3)}>
        grid-save-three
      </button>
      <button type="button" onClick={props.onClose}>
        grid-close
      </button>
    </div>
  ),
}));
jest.unstable_mockModule('../CostLineForm/LinkInvoiceForm.js', () => ({
  LinkInvoiceForm: (props: {
    row: { id: string };
    onSaved: (title: string) => void;
    onClose: () => void;
  }) => (
    <div role="dialog" aria-label="link-probe" data-row={props.row.id}>
      <button type="button" onClick={() => props.onSaved('Invoice INV-7')}>
        link-save
      </button>
      <button type="button" onClick={props.onClose}>
        link-close
      </button>
    </div>
  ),
}));

let CostLinesSection: (typeof SectionModule)['CostLinesSection'];

// ─── Fixtures (synthetic) ────────────────────────────────────────────────────

function budgetLine(over: Partial<BaseBudgetLine> & { id: string }): BaseBudgetLine {
  return {
    description: 'Tile the hallway',
    plannedAmount: 1000,
    confidence: 'own_estimate',
    confidenceMargin: 0.2,
    budgetCategory: null,
    budgetSource: null,
    vendor: null,
    actualCost: 0,
    actualCostPaid: 0,
    invoiceCount: 0,
    invoiceLink: null,
    quantity: null,
    unit: null,
    unitPrice: null,
    includesVat: true,
    createdBy: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...over,
  };
}

function linked(status: InvoiceStatus = 'pending'): BaseBudgetLine['invoiceLink'] {
  return {
    invoiceBudgetLineId: 'ibl-3',
    invoiceId: 'inv-1',
    invoiceNumber: 'INV-100',
    invoiceDate: '2026-02-01',
    invoiceStatus: status,
    itemizedAmount: 500,
    vendorId: null,
    vendorName: 'Example Plumbing Co',
  };
}

const ITEM_LINES: BaseBudgetLine[] = [
  budgetLine({ id: 'e1', description: 'Tile the hallway' }),
  budgetLine({ id: 'e2', description: 'Paint the walls' }),
  budgetLine({ id: 'l3', description: 'Fit the sink', invoiceLink: linked() }),
];

const ITEM_HOST: CostLineHost = { kind: 'work_item', id: 'w1', label: 'Renovate the kitchen' };
const HOUSEHOLD_HOST: CostLineHost = { kind: 'household_item', id: 'h1', label: 'Oven' };
const DOC_HOST: CostLineHost = {
  kind: 'invoice',
  id: 'inv-1',
  label: 'Example Plumbing Co · INV-100',
  status: 'pending',
  amount: 1000,
  vendorId: 'v1',
};
const OFFER_HOST: CostLineHost = { ...DOC_HOST, status: 'quotation' } as CostLineHost;

function docLine(over: Partial<InvoiceBudgetLineDetailResponse> & { id: string }) {
  return {
    invoiceId: 'inv-1',
    workItemBudgetId: 'wb-' + over.id,
    householdItemBudgetId: null,
    itemizedAmount: 400,
    budgetLineDescription: 'Fit the sink',
    plannedAmount: 400,
    confidence: 'own_estimate',
    categoryId: null,
    categoryName: null,
    categoryColor: null,
    categoryTranslationKey: null,
    parentItemId: 'w1',
    parentItemTitle: 'Renovate the kitchen',
    parentItemType: 'work_item',
    parentItemArea: null,
    quantity: null,
    unit: null,
    unitPrice: null,
    includesVat: true,
    vendorId: null,
    budgetSourceId: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...over,
  } as InvoiceBudgetLineDetailResponse;
}

const DOC_LINES = [
  docLine({ id: 'd1', budgetLineDescription: 'Fit the sink' }),
  docLine({
    id: 'd2',
    workItemBudgetId: null,
    budgetLineDescription: 'Loose pipe work',
    parentItemId: null,
    parentItemTitle: null,
    parentItemType: 'unassigned',
  }),
];

function docResponse(lines = DOC_LINES, remainingAmount = 0) {
  return { budgetLines: lines, remainingAmount };
}

// ─── Harness ─────────────────────────────────────────────────────────────────

const onChanged = jest.fn<() => Promise<void> | void>();

function Section(props: Partial<React.ComponentProps<typeof CostLinesSection>>) {
  return (
    <MemoryRouter>
      <CostLinesSection host={ITEM_HOST} lines={ITEM_LINES} onChanged={onChanged} {...props} />
    </MemoryRouter>
  );
}

function renderSection(props: Partial<React.ComponentProps<typeof CostLinesSection>> = {}) {
  return render(<Section {...props} />);
}

async function openMenu(id: string, item: string, user = userEvent.setup()) {
  await user.click(screen.getByTestId(`cost-lines-actions-${id}`));
  await user.click(await screen.findByRole('menuitem', { name: item }));
  return user;
}

const status = () => screen.getByTestId('cost-lines-status');

beforeEach(async () => {
  ({ CostLinesSection } = (await import('./CostLinesSection.js')) as typeof SectionModule);
  onChanged.mockReset();
  onChanged.mockResolvedValue(undefined);
  mockDeleteWorkItemBudget.mockReset().mockResolvedValue(undefined);
  mockDeleteHouseholdItemBudget.mockReset().mockResolvedValue(undefined);
  mockDeleteInvoiceBudgetLine.mockReset().mockResolvedValue(undefined);
  mockFetchInvoiceBudgetLines.mockReset().mockResolvedValue(docResponse());
  mockFetchBudgetSources.mockReset().mockResolvedValue({ budgetSources: [] });
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ─── Item host ───────────────────────────────────────────────────────────────

describe('CostLinesSection item host', () => {
  it('renders the heading, both add buttons and the table groups', () => {
    renderSection();
    expect(screen.getByRole('heading', { level: 2, name: 'Cost lines' })).toBeInTheDocument();
    expect(screen.getByTestId('cost-lines-add')).toHaveTextContent('Add cost line');
    expect(screen.getByTestId('cost-lines-add-grid')).toHaveTextContent('Add lines (grid)');
    expect(screen.getByTestId('cost-lines-row-e1')).toBeInTheDocument();
    expect(screen.getByTestId('cost-lines-row-l3')).toBeInTheDocument();
  });

  it('honours headingLevel 3 and a custom testId', () => {
    renderSection({ headingLevel: 3, testId: 'wi-cost' });
    expect(screen.getByRole('heading', { level: 3, name: 'Cost lines' })).toBeInTheDocument();
    expect(screen.getByTestId('wi-cost-section')).toBeInTheDocument();
    expect(screen.getByTestId('wi-cost-row-e1')).toBeInTheDocument();
  });

  it('shows a skeleton while the page is loading its lines', () => {
    renderSection({ lines: undefined, loading: true });
    expect(screen.queryByTestId('cost-lines-row-e1')).toBeNull();
    expect(screen.getByRole('status', { name: /loading/i, hidden: true })).toBeInTheDocument();
  });

  it('shows the item empty state without a Split action', () => {
    renderSection({ lines: [] });
    expect(screen.getByText('There are no cost lines yet')).toBeInTheDocument();
    expect(
      screen.getByText('Add a line with an estimate, or link a line to an offer or invoice.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /split/i })).toBeNull();
  });

  it('treats missing lines (not loading) as an empty list', () => {
    renderSection({ lines: undefined });
    expect(screen.getByText('There are no cost lines yet')).toBeInTheDocument();
  });

  it('create: opens the form for the host, announces the save and reports the change', async () => {
    const user = userEvent.setup();
    renderSection();
    await user.click(screen.getByTestId('cost-lines-add'));
    const dialog = screen.getByRole('dialog', { name: 'form-probe' });
    expect(dialog).toHaveAttribute('data-mode', 'create');
    expect(dialog).toHaveAttribute('data-copy', '');
    expect(dialog).toHaveAttribute('data-host', 'work_item');
    await user.click(within(dialog).getByText('form-save'));
    expect(status()).toHaveTextContent('Saved.');
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    await user.click(within(dialog).getByText('form-close'));
    expect(screen.queryByRole('dialog', { name: 'form-probe' })).toBeNull();
  });

  it('works for a purchase host as well', async () => {
    const user = userEvent.setup();
    renderSection({ host: HOUSEHOLD_HOST });
    await user.click(screen.getByTestId('cost-lines-add'));
    expect(screen.getByRole('dialog', { name: 'form-probe' })).toHaveAttribute(
      'data-host',
      'household_item',
    );
  });

  it('duplicate: opens the create form prefilled from the row', async () => {
    renderSection();
    await openMenu('e1', 'Duplicate');
    const dialog = screen.getByRole('dialog', { name: 'form-probe' });
    expect(dialog).toHaveAttribute('data-mode', 'create');
    expect(dialog).toHaveAttribute('data-copy', 'e1');
  });

  it('edit: opens the form in edit mode for that row', async () => {
    renderSection();
    await openMenu('e2', 'Edit');
    const dialog = screen.getByRole('dialog', { name: 'form-probe' });
    expect(dialog).toHaveAttribute('data-mode', 'edit');
    expect(dialog).toHaveAttribute('data-row', 'e2');
  });

  it('edit: saving announces and reports the change', async () => {
    renderSection();
    const user = await openMenu('e2', 'Edit');
    await user.click(screen.getByText('form-save'));
    expect(status()).toHaveTextContent('Saved.');
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
  });

  it('grid add: saving N lines announces the count and closes on request', async () => {
    const user = userEvent.setup();
    renderSection();
    await user.click(screen.getByTestId('cost-lines-add-grid'));
    const dialog = screen.getByRole('dialog', { name: 'grid-probe' });
    expect(dialog).toHaveAttribute('data-mode', 'add');
    expect(dialog).toHaveAttribute('data-remaining', '');
    await user.click(within(dialog).getByText('grid-save-three'));
    expect(status()).toHaveTextContent('3 lines saved.');
    await user.click(within(dialog).getByText('grid-save-one'));
    await waitFor(() => expect(status()).toHaveTextContent('1 line saved.'));
    await user.click(within(dialog).getByText('grid-close'));
    expect(screen.queryByRole('dialog', { name: 'grid-probe' })).toBeNull();
  });

  it('link to invoice (unlinked row, item host) announces the linked invoice', async () => {
    renderSection();
    const user = await openMenu('e1', 'Link to offer or invoice');
    const dialog = screen.getByRole('dialog', { name: 'link-probe' });
    expect(dialog).toHaveAttribute('data-row', 'e1');
    await user.click(within(dialog).getByText('link-save'));
    expect(status()).toHaveTextContent('Linked to Invoice INV-7.');
    await user.click(within(dialog).getByText('link-close'));
    expect(screen.queryByRole('dialog', { name: 'link-probe' })).toBeNull();
  });

  it('a linked row offers Edit, Duplicate and Unlink, no Delete or Link', async () => {
    const user = userEvent.setup();
    renderSection();
    await user.click(screen.getByTestId('cost-lines-actions-l3'));
    expect(await screen.findByRole('menuitem', { name: 'Unlink' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Delete' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'Link to offer or invoice' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'Assign' })).toBeNull();
  });
});

// ─── Item host: delete / unlink ──────────────────────────────────────────────

describe('CostLinesSection item host delete and unlink', () => {
  beforeEach(() => {
    // jsdom has no layout: report every element as rendered so the first (table) copy is used.
    jest
      .spyOn(HTMLElement.prototype, 'getClientRects')
      .mockReturnValue([{}] as unknown as DOMRectList);
  });

  it('delete: confirms, deletes through the work item API, reloads and focuses the next row', async () => {
    jest.useFakeTimers({ advanceTimers: true });
    renderSection();
    const user = await openMenu(
      'e1',
      'Delete',
      userEvent.setup({ advanceTimers: jest.advanceTimersByTime }),
    );
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Delete Tile the hallway?');
    await user.click(screen.getByTestId('cost-line-delete-confirm'));
    await waitFor(() => expect(mockDeleteWorkItemBudget).toHaveBeenCalledWith('w1', 'e1'));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    act(() => {
      jest.runOnlyPendingTimers();
    });
    expect(screen.getByTestId('cost-lines-actions-e2')).toHaveFocus();
    jest.useRealTimers();
  });

  it('delete on a purchase uses the purchase API; the last row falls back to the previous one', async () => {
    jest.useFakeTimers({ advanceTimers: true });
    renderSection({
      host: HOUSEHOLD_HOST,
      lines: [ITEM_LINES[0] as BaseBudgetLine, ITEM_LINES[1] as BaseBudgetLine],
    });
    const user = await openMenu(
      'e2',
      'Delete',
      userEvent.setup({ advanceTimers: jest.advanceTimersByTime }),
    );
    await user.click(screen.getByTestId('cost-line-delete-confirm'));
    await waitFor(() => expect(mockDeleteHouseholdItemBudget).toHaveBeenCalledWith('h1', 'e2'));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    act(() => {
      jest.runOnlyPendingTimers();
    });
    expect(screen.getByTestId('cost-lines-actions-e1')).toHaveFocus();
    jest.useRealTimers();
  });

  it('does not throw when the section unmounts before the focus timer fires', async () => {
    const held: (() => void)[] = [];
    const original = window.setTimeout.bind(window);
    const spy = jest.spyOn(window, 'setTimeout').mockImplementation(((
      fn: () => void,
      delay?: number,
    ) => {
      // Hold only the row-menu focus callback; everything else schedules normally.
      if (String(fn).includes('getClientRects')) {
        held.push(fn);
        return 0;
      }
      return original(fn, delay);
    }) as typeof window.setTimeout);
    try {
      const view = renderSection({ lines: [ITEM_LINES[0] as BaseBudgetLine] });
      const user = await openMenu('e1', 'Delete', userEvent.setup());
      await user.click(screen.getByTestId('cost-line-delete-confirm'));
      await waitFor(() => expect(held).toHaveLength(1));
      view.unmount();
      expect(() => held[0]?.()).not.toThrow();
    } finally {
      spy.mockRestore();
    }
  });

  it('delete of the only row focuses the section heading', async () => {
    jest.useFakeTimers({ advanceTimers: true });
    renderSection({ lines: [ITEM_LINES[0] as BaseBudgetLine] });
    const user = await openMenu(
      'e1',
      'Delete',
      userEvent.setup({ advanceTimers: jest.advanceTimersByTime }),
    );
    await user.click(screen.getByTestId('cost-line-delete-confirm'));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    act(() => {
      jest.runOnlyPendingTimers();
    });
    expect(screen.getByRole('heading', { name: 'Cost lines' })).toHaveFocus();
    jest.useRealTimers();
  });

  it('focus falls back to the heading when the neighbour row is not rendered', async () => {
    jest.useFakeTimers({ advanceTimers: true });
    jest
      .spyOn(HTMLElement.prototype, 'getClientRects')
      .mockReturnValue([] as unknown as DOMRectList);
    renderSection();
    const user = await openMenu(
      'e1',
      'Delete',
      userEvent.setup({ advanceTimers: jest.advanceTimersByTime }),
    );
    await user.click(screen.getByTestId('cost-line-delete-confirm'));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    act(() => {
      jest.runOnlyPendingTimers();
    });
    expect(screen.getByRole('heading', { name: 'Cost lines' })).toHaveFocus();
    jest.useRealTimers();
  });

  it('delete on the card surface focuses the next card menu', async () => {
    jest.useFakeTimers({ advanceTimers: true });
    jest.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function (
      this: HTMLElement,
    ) {
      const mobile = (this.dataset.testid ?? '').includes('mobile');
      return (mobile ? [{}] : []) as unknown as DOMRectList;
    });
    renderSection();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await user.click(screen.getByTestId('cost-lines-actions-mobile-e1'));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    await user.click(screen.getByTestId('cost-line-delete-confirm'));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
    expect(screen.getByTestId('cost-lines-actions-mobile-e2')).toHaveFocus();
  });

  it('Cancel while a delete is running keeps the dialog open', async () => {
    let finish: () => void = () => undefined;
    mockDeleteWorkItemBudget.mockImplementation(() => new Promise<void>((r) => (finish = r)));
    renderSection();
    const user = await openMenu('e1', 'Delete');
    await user.click(screen.getByTestId('cost-line-delete-confirm'));
    const dialog = screen.getByRole('alertdialog');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    const cancel = within(dialog).queryByRole('button', { name: 'Cancel' });
    if (cancel) fireEvent.click(cancel);
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    finish();
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('a name-less line is titled with the fallback description', async () => {
    renderSection({ lines: [budgetLine({ id: 'e9', description: null })] });
    await openMenu('e9', 'Delete');
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Delete Line without a description?');
  });

  it('409 shows the translated in-use text with no Delete button; Cancel closes', async () => {
    mockDeleteWorkItemBudget.mockRejectedValue(
      new ApiClientError(409, { code: 'BUDGET_LINE_IN_USE', message: 'server prose' }),
    );
    renderSection();
    const user = await openMenu('e1', 'Delete');
    await user.click(screen.getByTestId('cost-line-delete-confirm'));
    const dialog = await screen.findByRole('alertdialog');
    await waitFor(() =>
      expect(dialog).toHaveTextContent(
        'This budget line is linked to an invoice and cannot be deleted.',
      ),
    );
    expect(dialog).not.toHaveTextContent('server prose');
    expect(screen.queryByTestId('cost-line-delete-confirm')).toBeNull();
    await user.click(screen.getByTestId('cost-line-delete-cancel'));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('a non-409 API error keeps Delete available and never shows the server message', async () => {
    mockDeleteWorkItemBudget.mockRejectedValue(
      new ApiClientError(400, { code: 'VALIDATION_ERROR', message: 'raw server text' }),
    );
    renderSection();
    const user = await openMenu('e1', 'Delete');
    await user.click(screen.getByTestId('cost-line-delete-confirm'));
    const dialog = await screen.findByRole('alertdialog');
    await waitFor(() => expect(dialog).toHaveTextContent('The submitted data is invalid'));
    expect(dialog).not.toHaveTextContent('raw server text');
    expect(screen.getByTestId('cost-line-delete-confirm')).toBeInTheDocument();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('a network error shows the network text', async () => {
    mockDeleteWorkItemBudget.mockRejectedValue(new NetworkError('boom internals', new Error('x')));
    renderSection();
    const user = await openMenu('e1', 'Delete');
    await user.click(screen.getByTestId('cost-line-delete-confirm'));
    const dialog = await screen.findByRole('alertdialog');
    await waitFor(() => expect(dialog).not.toHaveTextContent('Deleting'));
    expect(dialog).not.toHaveTextContent('boom internals');
    expect(dialog.textContent?.length).toBeGreaterThan('Delete Tile the hallway?'.length);
  });

  it('an unexpected error shows the fixed failure text', async () => {
    mockDeleteWorkItemBudget.mockRejectedValue(new Error('stack trace words'));
    renderSection();
    const user = await openMenu('e1', 'Delete');
    await user.click(screen.getByTestId('cost-line-delete-confirm'));
    const dialog = await screen.findByRole('alertdialog');
    await waitFor(() => expect(mockDeleteWorkItemBudget).toHaveBeenCalled());
    await waitFor(() => expect(dialog).not.toHaveTextContent('Deleting'));
    expect(dialog).not.toHaveTextContent('stack trace words');
  });

  it('Cancel closes the confirm without a request', async () => {
    renderSection();
    const user = await openMenu('e1', 'Delete');
    await user.click(screen.getByTestId('cost-line-delete-cancel'));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(mockDeleteWorkItemBudget).not.toHaveBeenCalled();
  });

  it('unlink: names the line and the offer or invoice, then removes the link', async () => {
    renderSection();
    const user = await openMenu('l3', 'Unlink');
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('Unlink Fit the sink from Invoice INV-100?');
    expect(dialog).toHaveTextContent('The line stays here as an estimate.');
    await user.click(screen.getByTestId('cost-line-unlink-confirm'));
    await waitFor(() => expect(mockDeleteInvoiceBudgetLine).toHaveBeenCalledWith('inv-1', 'ibl-3'));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('unlink of an offer-linked line without a number titles it with the date', async () => {
    const link = { ...linked('quotation'), invoiceNumber: null } as BaseBudgetLine['invoiceLink'];
    renderSection({
      lines: [budgetLine({ id: 'q1', description: 'Quote line', invoiceLink: link })],
    });
    await openMenu('q1', 'Unlink');
    expect(screen.getByRole('alertdialog')).toHaveTextContent(/Unlink Quote line from Offer/);
  });
});

// ─── Document host ───────────────────────────────────────────────────────────

describe('CostLinesSection document host', () => {
  beforeEach(() => {
    jest
      .spyOn(HTMLElement.prototype, 'getClientRects')
      .mockReturnValue([{}] as unknown as DOMRectList);
  });

  it('shows a skeleton, then the rows with their targets', async () => {
    renderSection({ host: DOC_HOST, lines: undefined });
    expect(screen.queryByTestId('cost-lines-row-wb-d1')).toBeNull();
    expect(await screen.findByTestId('cost-lines-row-wb-d1')).toBeInTheDocument();
    expect(mockFetchInvoiceBudgetLines).toHaveBeenCalledWith('inv-1');
    expect(mockFetchBudgetSources).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText('Renovate the kitchen').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Not assigned').length).toBeGreaterThan(0);
  });

  it('the target link carries the area breadcrumb of the parent item', async () => {
    mockFetchInvoiceBudgetLines.mockResolvedValue(
      docResponse([
        docLine({
          id: 'd1',
          parentItemArea: {
            id: 'a1',
            name: 'Kitchen',
            parentId: null,
            color: null,
            ancestors: [{ id: 'a0', name: 'Ground floor' }],
          } as never,
        }),
      ]),
    );
    renderSection({ host: DOC_HOST });
    await screen.findByTestId('cost-lines-row-wb-d1');
    expect(screen.getAllByText(/Kitchen/).length).toBeGreaterThan(0);
  });

  it('a load error shows translated text and Retry reloads', async () => {
    mockFetchInvoiceBudgetLines.mockRejectedValueOnce(
      new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'db exploded' }),
    );
    const user = userEvent.setup();
    renderSection({ host: DOC_HOST });
    const retry = await screen.findByRole('button', { name: 'Retry' });
    expect(screen.queryByText('db exploded')).toBeNull();
    await user.click(retry);
    expect(await screen.findByTestId('cost-lines-row-wb-d1')).toBeInTheDocument();
    expect(mockFetchInvoiceBudgetLines).toHaveBeenCalledTimes(2);
  });

  it('a non-API load failure shows the fixed load error', async () => {
    mockFetchInvoiceBudgetLines.mockRejectedValueOnce(new Error('weird'));
    renderSection({ host: DOC_HOST });
    expect(await screen.findByText('The cost lines could not be loaded.')).toBeInTheDocument();
  });

  it('a failing budget source lookup does not break the table', async () => {
    mockFetchBudgetSources.mockRejectedValue(new Error('no sources'));
    renderSection({ host: DOC_HOST });
    expect(await screen.findByTestId('cost-lines-row-wb-d1')).toBeInTheDocument();
  });

  it('an unsplit invoice shows the empty state with Split, which opens the split grid', async () => {
    mockFetchInvoiceBudgetLines.mockResolvedValue(docResponse([], 1000));
    const user = userEvent.setup();
    renderSection({ host: DOC_HOST });
    expect(
      await screen.findByText('Split this invoice into cost lines on tasks and purchases.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Split/ }));
    const dialog = screen.getByRole('dialog', { name: 'grid-probe' });
    expect(dialog).toHaveAttribute('data-mode', 'split');
    expect(dialog).toHaveAttribute('data-remaining', '1000');
    await user.click(within(dialog).getByText('grid-close'));
    expect(screen.queryByRole('dialog', { name: 'grid-probe' })).toBeNull();
  });

  it('an unsplit offer uses the offer wording', async () => {
    mockFetchInvoiceBudgetLines.mockResolvedValue(docResponse([], 1000));
    renderSection({ host: OFFER_HOST });
    expect(
      await screen.findByText('Split this offer into cost lines on tasks and purchases.'),
    ).toBeInTheDocument();
  });

  it('a fully split empty document has no Split action', async () => {
    mockFetchInvoiceBudgetLines.mockResolvedValue(docResponse([], 0));
    renderSection({ host: DOC_HOST });
    await screen.findByText('There are no cost lines yet');
    expect(screen.queryByRole('button', { name: /Split/ })).toBeNull();
  });

  it('Not yet split row Split opens the split grid; closing returns focus to Split', async () => {
    jest.useFakeTimers({ advanceTimers: true });
    mockFetchInvoiceBudgetLines.mockResolvedValue(docResponse(DOC_LINES, 300));
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    renderSection({ host: DOC_HOST });
    await screen.findByTestId('cost-lines-row-wb-d1');
    await user.click(screen.getByTestId('cost-lines-split'));
    const dialog = screen.getByRole('dialog', { name: 'grid-probe' });
    expect(dialog).toHaveAttribute('data-mode', 'split');
    await user.click(within(dialog).getByText('grid-close'));
    act(() => {
      jest.runOnlyPendingTimers();
    });
    expect(screen.getByTestId('cost-lines-split')).toHaveFocus();
    jest.useRealTimers();
  });

  it('a grid save reloads the lines and then reports the change', async () => {
    mockFetchInvoiceBudgetLines.mockResolvedValue(docResponse(DOC_LINES, 300));
    const user = userEvent.setup();
    renderSection({ host: DOC_HOST });
    await screen.findByTestId('cost-lines-row-wb-d1');
    await user.click(screen.getByTestId('cost-lines-add-grid'));
    await user.click(screen.getByText('grid-save-three'));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(mockFetchInvoiceBudgetLines).toHaveBeenCalledTimes(2);
    expect(status()).toHaveTextContent('3 lines saved.');
  });

  it('an orphan line offers Assign, which opens the form in assign mode', async () => {
    renderSection({ host: DOC_HOST });
    await screen.findByTestId('cost-lines-row-wb-d1');
    await openMenu('d2', 'Assign');
    const dialog = screen.getByRole('dialog', { name: 'form-probe' });
    expect(dialog).toHaveAttribute('data-mode', 'assign');
    expect(dialog).toHaveAttribute('data-row', 'd2');
  });

  it('an assigned line offers Remove from invoice but not Assign or Link', async () => {
    const user = userEvent.setup();
    renderSection({ host: DOC_HOST });
    await screen.findByTestId('cost-lines-row-wb-d1');
    await user.click(screen.getByTestId('cost-lines-actions-wb-d1'));
    expect(
      await screen.findByRole('menuitem', { name: 'Remove from invoice' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Assign' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'Link to offer or invoice' })).toBeNull();
  });

  it('remove: names the target in the lead, deletes the invoice line and reloads', async () => {
    renderSection({ host: DOC_HOST });
    await screen.findByTestId('cost-lines-row-wb-d1');
    const user = await openMenu('wb-d1', 'Remove from invoice');
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('Remove Fit the sink from Example Plumbing Co · INV-100?');
    expect(dialog).toHaveTextContent('Renovate the kitchen');
    await user.click(screen.getByTestId('cost-line-remove-confirm'));
    await waitFor(() => expect(mockDeleteInvoiceBudgetLine).toHaveBeenCalledWith('inv-1', 'd1'));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(mockFetchInvoiceBudgetLines).toHaveBeenCalledTimes(2);
  });

  it('remove of an orphan uses the no-target lead for an invoice and for an offer', async () => {
    renderSection({ host: DOC_HOST });
    await screen.findByTestId('cost-lines-row-wb-d1');
    const user = await openMenu('d2', 'Remove from invoice');
    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      'The line is removed from this invoice.',
    );
    await user.click(screen.getByTestId('cost-line-remove-cancel'));
  });

  it('remove of an orphan on an offer uses the offer wording', async () => {
    renderSection({ host: OFFER_HOST });
    await screen.findByTestId('cost-lines-row-wb-d1');
    await openMenu('d2', 'Remove from offer');
    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      'The line is removed from this offer.',
    );
  });

  it('remove failure keeps the dialog open with translated text', async () => {
    mockDeleteInvoiceBudgetLine.mockRejectedValue(
      new ApiClientError(404, { code: 'NOT_FOUND', message: 'raw' }),
    );
    renderSection({ host: DOC_HOST });
    await screen.findByTestId('cost-lines-row-wb-d1');
    const user = await openMenu('wb-d1', 'Remove from invoice');
    await user.click(screen.getByTestId('cost-line-remove-confirm'));
    await waitFor(() => expect(screen.getByRole('alertdialog')).not.toHaveTextContent('raw'));
    expect(screen.getByTestId('cost-line-remove-confirm')).toBeInTheDocument();
  });

  it('Edit of a document line opens the form and a close needs no reload', async () => {
    renderSection({ host: DOC_HOST });
    await screen.findByTestId('cost-lines-row-wb-d1');
    const user = await openMenu('wb-d1', 'Edit');
    await user.click(screen.getByText('form-close'));
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('the remove confirm cannot be dismissed while the request is running', async () => {
    let finish: () => void = () => undefined;
    mockDeleteInvoiceBudgetLine.mockImplementation(
      () => new Promise<void>((resolve) => (finish = resolve)),
    );
    renderSection({ host: DOC_HOST });
    await screen.findByTestId('cost-lines-row-wb-d1');
    const user = await openMenu('wb-d1', 'Remove from invoice');
    await user.click(screen.getByTestId('cost-line-remove-confirm'));
    await user.click(screen.getByTestId('cost-line-remove-cancel'));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    await act(async () => finish());
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });
});

// ─── Ported behaviours from the retired components ───────────────────────────

describe('CostLinesSection ported scenarios', () => {
  it('a unit-priced line shows quantity × unit price; a linked line whose estimate differs hides it', () => {
    renderSection({
      lines: [
        budgetLine({
          id: 'u1',
          description: 'Wall paint',
          quantity: 12,
          unit: 'm²',
          unitPrice: 20,
          plannedAmount: 240,
          includesVat: false,
        }),
        budgetLine({
          id: 'u2',
          description: 'Fit the sink',
          quantity: 2,
          unit: 'pcs',
          unitPrice: 10,
          plannedAmount: 20,
          invoiceLink: linked(),
        }),
      ],
    });
    const row = screen.getByTestId('cost-lines-row-u1');
    expect(row).toHaveTextContent('12 m² × €20.00');
    expect(screen.getByTestId('cost-lines-row-u2')).not.toHaveTextContent('2 pcs ×');
  });

  it('a net line shows its VAT gross-up as the gross figure', () => {
    renderSection({
      lines: [budgetLine({ id: 'g1', plannedAmount: 100, includesVat: false })],
    });
    expect(screen.getByTestId('cost-lines-gross-g1')).toHaveTextContent('€119.00');
  });

  it('item-host groups put Estimates before the invoice group', () => {
    renderSection();
    const rows = screen
      .getAllByTestId(/^cost-lines-row-/)
      .map((el) => el.dataset.testid)
      .filter((id) => !id?.includes('mobile'));
    expect(rows).toEqual(['cost-lines-row-e1', 'cost-lines-row-e2', 'cost-lines-row-l3']);
  });

  it('a fully split document shows no Not yet split row and no over row', async () => {
    mockFetchInvoiceBudgetLines.mockResolvedValue(docResponse(DOC_LINES, 0));
    renderSection({ host: DOC_HOST });
    await screen.findByTestId('cost-lines-row-wb-d1');
    expect(screen.queryByTestId('cost-lines-not-yet-split')).toBeNull();
    expect(screen.queryByTestId('cost-lines-over')).toBeNull();
    expect(screen.queryByTestId('cost-lines-split')).toBeNull();
  });

  it('an over-itemized document shows the over row and no Split', async () => {
    mockFetchInvoiceBudgetLines.mockResolvedValue(docResponse(DOC_LINES, -5));
    renderSection({ host: DOC_HOST });
    await screen.findByTestId('cost-lines-row-wb-d1');
    expect(screen.getByTestId('cost-lines-over')).toBeInTheDocument();
    expect(screen.queryByTestId('cost-lines-split')).toBeNull();
  });
});
