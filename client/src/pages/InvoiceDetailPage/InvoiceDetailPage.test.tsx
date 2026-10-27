/**
 * @jest-environment jsdom
 *
 * The offer and invoice page (#2239). Module boundaries: the API client functions, the cost line section, the Documents host and the edit dialog (each has
 * its own test). The header, summary strip, tabs, Payments and History panels are real.
 *
 * Mutations these tests catch (each assertion below fails when the named change is made):
 *  - D-07: rendering the chip as a bare span instead of the shared Badge, or an Offer chip;
 *  - an offer whose primary is not Add progress payment, or whose secondary is not a Convert link
 *    to the Convert page carrying the offer as origin;
 *  - bank report `sourceId` sent with zero or several sources;
 *  - `?payment=` ignored without `?tab=`: the Payments tab would not be selected;
 *  - the delete navigating with push instead of replace.
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, screen, waitFor, act, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { InvoiceDetail, UndoToken } from '@cornerstone/shared';
import { RecordingRouter, createRouterLog } from '../../test/recordingRouter.js';
import { OriginProbe, probedOrigin, probedPath } from '../../test/originProbe.js';
import { LocaleProvider } from '../../contexts/LocaleContext.js';
import { ApiClientError } from '../../lib/apiClient.js';
import * as statusChangeActual from '../../lib/statusChangeApi.js';
import * as houseNameActual from '../../contexts/HouseNameContext.js';
import {
  makeBudgetSource,
  makeCostLine,
  makeInvoiceDetail,
  makePayment,
} from '../../test/invoiceDetailFixtures.js';
import type * as PageModule from './InvoiceDetailPage.js';

// ─── Module boundaries ───────────────────────────────────────────────────────

const TOKEN: UndoToken = { token: `u_${'a'.repeat(32)}`, expiresAt: '2026-08-07T10:00:30.000Z' };

const mockFetchInvoiceById = jest.fn<(id: string) => Promise<InvoiceDetail>>();
const mockDeleteInvoice = jest.fn<(vendorId: string, id: string) => Promise<void>>();
jest.unstable_mockModule('../../lib/invoicesApi.js', () => ({
  fetchInvoiceById: mockFetchInvoiceById,
  deleteInvoice: mockDeleteInvoice,
  updateInvoice: jest.fn(),
}));

const mockChangeInvoiceStatus =
  jest.fn<(vendorId: string, id: string, body: unknown) => Promise<unknown>>();
jest.unstable_mockModule('../../lib/statusChangeApi.js', () => ({
  ...statusChangeActual,
  changeInvoiceStatus: mockChangeInvoiceStatus,
  changeDepositStatus: jest.fn(),
}));
jest.unstable_mockModule('../../lib/undoApi.js', () => ({ undoChange: jest.fn() }));
jest.unstable_mockModule('../../lib/invoiceDepositsApi.js', () => ({ deleteDeposit: jest.fn() }));

const mockFetchCostLines = jest.fn<(id: string) => Promise<unknown>>();
jest.unstable_mockModule('../../lib/invoiceBudgetLinesApi.js', () => ({
  fetchInvoiceBudgetLines: mockFetchCostLines,
}));
const mockFetchBudgetSources = jest.fn<() => Promise<unknown>>();
jest.unstable_mockModule('../../lib/budgetSourcesApi.js', () => ({
  fetchBudgetSources: mockFetchBudgetSources,
}));
const mockListHistory = jest.fn<(...a: unknown[]) => Promise<unknown>>();
jest.unstable_mockModule('../../lib/historyApi.js', () => ({ listHistory: mockListHistory }));
const mockFetchDeleteImpact = jest.fn<(...a: unknown[]) => Promise<unknown>>();
jest.unstable_mockModule('../../lib/deleteImpactApi.js', () => ({
  fetchDeleteImpact: mockFetchDeleteImpact,
}));

const mockShowToast = jest.fn();
const mockShowUndoToast = jest.fn();
jest.unstable_mockModule('../../components/Toast/ToastContext.js', () => ({
  ToastProvider: ({ children }: { children: unknown }) => children,
  useToast: () => ({
    toasts: [],
    showToast: mockShowToast,
    showUndoToast: mockShowUndoToast,
    dismissToast: jest.fn(),
  }),
}));
jest.unstable_mockModule('../../contexts/HouseNameContext.js', () => ({
  ...houseNameActual,
  useEntriesLanguage: () => 'en',
}));

/** Mount counters and props the stubs expose. */
let lastCostSectionProps: {
  host: { id: string; status: string; amount: number; vendorId: string | null; label: string };
  documentLines?: { lines: unknown[]; reload: () => Promise<void> };
  onChanged: () => Promise<void> | void;
  linkState?: unknown;
} | null = null;
jest.unstable_mockModule('../../components/CostLineTable/index.js', () => ({
  CostLinesSection: (props: NonNullable<typeof lastCostSectionProps>) => {
    lastCostSectionProps = props;
    return (
      <div
        data-testid="invoice-budget-lines-section"
        data-host-status={props.host.status}
        data-host-label={props.host.label}
        data-has-controller={String(props.documentLines !== undefined)}
        data-link-state={JSON.stringify(props.linkState ?? null)}
      >
        <button type="button" onClick={() => void props.onChanged()}>
          stub-changed
        </button>
      </div>
    );
  },
}));

let documentsFact: unknown = null;
jest.unstable_mockModule('../../components/DocumentsPanel/index.js', () => ({
  useDocumentsPanel: (entityType: string, entityId: string) => ({
    fact: documentsFact,
    panel: <div data-testid="documents-panel" data-type={entityType} data-id={entityId} />,
  }),
}));

jest.unstable_mockModule('./InvoiceEditDialog.js', () => ({
  InvoiceEditDialog: (props: { onSaved: () => Promise<unknown>; onClose: () => void }) => (
    <div role="dialog" aria-label="edit-probe">
      <button type="button" onClick={() => void props.onSaved()}>
        edit-saved
      </button>
      <button type="button" onClick={props.onClose}>
        edit-close
      </button>
    </div>
  ),
}));

interface PaymentProbeProps {
  mode: string;
  initialValues?: { entryType?: string };
  name?: string;
  onClose: () => void;
  onSaved: (d: unknown) => void;
}
jest.unstable_mockModule('./InvoiceDepositFormModal.js', () => ({
  getEmptyForm: () => ({}),
  InvoiceDepositFormModal: (props: PaymentProbeProps) => (
    <div
      role="dialog"
      aria-label="payment-probe"
      data-mode={props.mode}
      data-entry={props.initialValues?.entryType ?? ''}
      data-name={props.name ?? ''}
    >
      <button type="button" onClick={props.onClose}>
        payment-close
      </button>
      <button type="button" onClick={() => props.onSaved({})}>
        payment-saved
      </button>
    </div>
  ),
}));

let InvoiceDetailPage: (typeof PageModule)['InvoiceDetailPage'];

// ─── Fixtures and harness ────────────────────────────────────────────────────

const ID = 'inv-001';

function record(over: Partial<InvoiceDetail> = {}): InvoiceDetail {
  return makeInvoiceDetail({
    id: ID,
    vendorId: 'vendor-1',
    vendorName: 'Acme Construction',
    invoiceNumber: 'INV-2026-001',
    ...over,
  });
}

function costLinesResponse(
  lines: ReturnType<typeof makeCostLine>[] = [],
  remainingAmount = 0,
): unknown {
  return { budgetLines: lines, remainingAmount };
}

const HEADING = 'Acme Construction · INV-2026-001';

function routes(extra?: React.ReactNode) {
  return (
    <LocaleProvider>
      <Routes>
        <Route path="/budget/invoices/:id" element={<InvoiceDetailPage />} />
        <Route path="/budget/invoices" element={<div>Invoice List Page</div>} />
        <Route path="*" element={<div>Elsewhere</div>} />
      </Routes>
      {extra}
    </LocaleProvider>
  );
}

function renderPage(entry = `/budget/invoices/${ID}`) {
  return render(<MemoryRouter initialEntries={[entry]}>{routes(<OriginProbe />)}</MemoryRouter>);
}

function renderRouted(entry: string | { url: string; state?: unknown } = `/budget/invoices/${ID}`) {
  const log = createRouterLog();
  render(
    <RecordingRouter entries={[entry]} log={log}>
      {routes()}
    </RecordingRouter>,
  );
  return log;
}

async function loaded(over: Partial<InvoiceDetail> = {}, entry?: string) {
  mockFetchInvoiceById.mockResolvedValue(record(over));
  renderPage(entry);
  await screen.findByRole('heading', { level: 1, name: /Acme Construction/ });
}

async function enabledConfirm(prefix: string): Promise<HTMLElement> {
  const btn = await screen.findByTestId(`${prefix}-confirm`);
  await waitFor(() => expect(btn).not.toHaveAttribute('aria-disabled'));
  return btn;
}

const openMenu = () => fireEvent.click(screen.getByRole('button', { name: 'Page actions' }));

beforeEach(async () => {
  mockFetchInvoiceById.mockReset().mockResolvedValue(record());
  mockDeleteInvoice.mockReset().mockResolvedValue(undefined);
  mockChangeInvoiceStatus.mockReset();
  mockFetchCostLines.mockReset().mockResolvedValue(costLinesResponse());
  mockFetchBudgetSources.mockReset().mockResolvedValue({ budgetSources: [] });
  mockListHistory
    .mockReset()
    .mockResolvedValue({ items: [], pagination: { page: 1, pageSize: 20, totalItems: 0 } });
  mockFetchDeleteImpact
    .mockReset()
    .mockResolvedValue({ entityType: 'invoice', id: ID, effects: [] });
  mockShowToast.mockReset();
  mockShowUndoToast.mockReset();
  documentsFact = null;
  lastCostSectionProps = null;
  document.title = 'initial';
  ({ InvoiceDetailPage } = (await import('./InvoiceDetailPage.js')) as typeof PageModule);
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ─── States ──────────────────────────────────────────────────────────────────

describe('InvoiceDetailPage states (S11)', () => {
  function trail(): string[] {
    const nav = screen.getByRole('navigation', { name: 'You are here' });
    return within(nav)
      .getAllByRole('link')
      .map((a) => (a.textContent ?? '').replace('‹', ''));
  }

  it('loading: one "Invoice" h1, the Money > Invoices trail, the tab title and a skeleton', () => {
    mockFetchInvoiceById.mockImplementation(() => new Promise(() => {}));
    renderPage();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Invoice' })).toBeInTheDocument();
    expect(trail()).toEqual(['Money', 'Invoices']);
    expect(document.title).toBe('Invoice · Money · Cornerstone');
    expect(screen.getByRole('status', { name: 'Loading invoice...' })).toBeInTheDocument();
  });

  it('not found: "Invoice not found" is the only h1, with the trail, the tab title and no error h2', async () => {
    mockFetchInvoiceById.mockRejectedValue(
      new ApiClientError(404, { code: 'NOT_FOUND', message: 'x' }),
    );
    renderPage();
    await screen.findByRole('heading', { level: 1, name: 'Invoice not found' });
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull();
    expect(trail()).toEqual(['Money', 'Invoices']);
    await waitFor(() => expect(document.title).toBe('Invoice not found · Money · Cornerstone'));
    expect(screen.getByRole('alert')).toHaveTextContent('Invoice not found.');
  });

  it('server error: "Invoice" h1 plus the card h2 "Error", the trail and a translated message', async () => {
    mockFetchInvoiceById.mockRejectedValue(
      new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'raw prose' }),
    );
    renderPage();
    await screen.findByRole('heading', { level: 2, name: 'Error' });
    expect(screen.getByRole('heading', { level: 1, name: 'Invoice' })).toBeInTheDocument();
    expect(trail()).toEqual(['Money', 'Invoices']);
    expect(screen.getByRole('alert')).not.toHaveTextContent('raw prose');
  });

  it('a network failure shows the not-found text under an "Invoice" h1', async () => {
    mockFetchInvoiceById.mockRejectedValue(new Error('offline'));
    renderPage();
    await screen.findByRole('heading', { level: 2, name: 'Error' });
    expect(screen.getByRole('alert')).toHaveTextContent('Invoice not found.');
  });

  it('Retry on the error card loads the invoice again', async () => {
    mockFetchInvoiceById.mockRejectedValue(
      new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'x' }),
    );
    renderPage();
    const retry = await screen.findByRole('button', { name: 'Retry' });
    mockFetchInvoiceById.mockResolvedValue(record());
    await userEvent.click(retry);
    await screen.findByRole('heading', { level: 1, name: HEADING });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('"Back to Invoices" on the error card navigates to the Invoices list (push)', async () => {
    mockFetchInvoiceById.mockRejectedValue(
      new ApiClientError(404, { code: 'NOT_FOUND', message: 'x' }),
    );
    const log = renderRouted();
    await userEvent.click(await screen.findByRole('button', { name: 'Back to Invoices' }));
    expect(log.actions).toEqual(['PUSH /budget/invoices']);
    expect(await screen.findByText('Invoice List Page')).toBeInTheDocument();
  });

  it('error actions are secondary buttons, not primary', async () => {
    mockFetchInvoiceById.mockRejectedValue(
      new ApiClientError(404, { code: 'NOT_FOUND', message: 'x' }),
    );
    renderPage();
    for (const name of ['Back to Invoices', 'Retry']) {
      const button = await screen.findByRole('button', { name });
      expect(button.className).toContain('btnSecondary');
      expect(button.className).not.toContain('btnPrimary');
    }
  });

  it('redirects to the Invoices list when the route has no id', async () => {
    render(
      <MemoryRouter initialEntries={['/no-id']}>
        <Routes>
          <Route path="/no-id" element={<InvoiceDetailPage />} />
          <Route path="/budget/invoices" element={<div>Invoice List Page</div>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText('Invoice List Page')).toBeInTheDocument();
    expect(mockFetchInvoiceById).not.toHaveBeenCalled();
  });

  it('does not navigate on mount and replaces nothing', async () => {
    const log = renderRouted();
    await screen.findByRole('heading', { level: 1, name: HEADING });
    expect(log.actions).toEqual([]);
  });
});

// ─── Header ──────────────────────────────────────────────────────────────────

describe('InvoiceDetailPage header (S11)', () => {
  it('shows company and number as the one h1 and tab title, with the trail and no Back link', async () => {
    await loaded();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: HEADING })).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe(`${HEADING} · Money · Cornerstone`));
    expect(screen.queryByTestId('breadcrumbs-back')).toBeNull();
  });

  it('marks the h1 as user text when the company or the number has content, and not otherwise', async () => {
    await loaded();
    expect(screen.getByRole('heading', { level: 1 })).toHaveAttribute('lang', 'en');
  });

  it('a blank company and number make the h1 a translated fallback with no language', async () => {
    mockFetchInvoiceById.mockResolvedValue(record({ vendorName: '  ', invoiceNumber: null }));
    renderPage();
    expect(await screen.findByRole('heading', { level: 1, name: 'Invoice' })).not.toHaveAttribute(
      'lang',
    );
    await screen.findByTestId('invoice-header');
  });

  it('a blank company with a number still makes the h1 user text', async () => {
    mockFetchInvoiceById.mockResolvedValue(record({ vendorName: '', invoiceNumber: 'INV-7' }));
    renderPage();
    await screen.findByTestId('invoice-header');
    expect(screen.getByRole('heading', { level: 1 })).toHaveAttribute('lang', 'en');
  });

  it('an offer without a number: company and "Offer"', async () => {
    await loaded({ status: 'quotation', invoiceNumber: null });
    expect(
      screen.getByRole('heading', { level: 1, name: 'Acme Construction · Offer' }),
    ).toBeInTheDocument();
  });

  it('offers Back to the company the invoice was opened from', async () => {
    mockFetchInvoiceById.mockResolvedValue(record());
    const log = renderRouted({
      url: `/budget/invoices/${ID}`,
      state: { origin: { to: '/companies/vendor-1', name: 'Acme Construction' } },
    });
    const back = await screen.findByTestId('breadcrumbs-back');
    expect(back).toHaveAttribute('href', '/companies/vendor-1');
    expect(log.actions).toEqual([]);
  });

  it('puts the company link and the notes in the description, the link carrying this page as origin', async () => {
    await loaded({ notes: 'Roof tiles for the garage' });
    const description = screen.getByTestId('invoice-header-description');
    expect(description).toHaveTextContent('Acme Construction · Roof tiles for the garage');
    const link = within(description).getByTestId('invoice-company-link');
    expect(link).toHaveAttribute('href', '/companies/vendor-1');
    expect(link).toHaveAttribute('lang', 'en');
    await userEvent.click(link);
    await screen.findByText('Elsewhere');
    expect(probedOrigin()).toEqual({ to: `/budget/invoices/${ID}`, name: HEADING });
  });

  it('shows only the company link without notes', async () => {
    await loaded({ notes: null });
    expect(screen.getByTestId('invoice-header-description')).toHaveTextContent(
      /^Acme Construction$/,
    );
  });

  it('hands the cost lines section the invoice as host, the page controller and the origin', async () => {
    await loaded({ amount: 1500, vendorId: 'vendor-9' });
    const section = screen.getByTestId('invoice-budget-lines-section');
    expect(section).toHaveAttribute('data-has-controller', 'true');
    expect(lastCostSectionProps?.host).toMatchObject({
      id: ID,
      status: 'pending',
      amount: 1500,
      vendorId: 'vendor-9',
      label: HEADING,
    });
    expect(JSON.parse(section.getAttribute('data-link-state') ?? 'null')).toEqual({
      origin: { to: `/budget/invoices/${ID}`, name: HEADING },
    });
  });

  describe('D-07 status chip through the shared Badge', () => {
    it('D-07: an invoice header chip renders through the shared Badge with the To pay class', async () => {
      await loaded({ status: 'pending' });
      const chip = screen.getByTestId('invoice-status-badge');
      expect(chip.tagName).toBe('BUTTON');
      expect(chip).toHaveTextContent('To pay');
      expect(chip.className).toContain('chip');
      expect(chip.className).toContain('pending');
    });

    it('D-07: an offer shows no chip, and its final-payment row Badge reads "Offer" with the offer class', async () => {
      await loaded(
        {
          status: 'quotation',
          deposits: [makePayment({ id: 'p1', invoiceId: ID })],
        },
        `/budget/invoices/${ID}?tab=payments`,
      );
      expect(screen.queryByTestId('invoice-status-badge')).toBeNull();
      const row = await screen.findByTestId('invoice-progress-payments-row-final-payment');
      const badge = within(row).getByText('Offer');
      expect(badge.className).toContain('badge');
      expect(badge.className).toContain('offer');
      expect(badge.className).not.toContain('quotation');
    });
  });

  describe('invoice vs offer', () => {
    it('an offer: Add progress payment is the one primary, Convert is the secondary, and there is no chip', async () => {
      await loaded({ status: 'quotation' });
      const primary = screen.getByTestId('invoice-primary-add-payment');
      expect(primary).toHaveTextContent('Add progress payment');
      expect(primary.className).toContain('primary');
      const secondary = screen.getByTestId('convert-quotation-button');
      expect(secondary).toHaveTextContent('Convert to final invoice');
      expect(secondary.tagName).toBe('A');
      expect(secondary.className).toContain('convertLink');
      expect(secondary.className).not.toContain('primary');
      expect(screen.queryByTestId('invoice-secondary-add-payment')).toBeNull();
      expect(screen.queryByTestId('invoice-status-badge')).toBeNull();
      expect(screen.getByTestId('invoice-header').querySelectorAll('.primary')).toHaveLength(1);
    });

    it('Convert is a link to the Convert page, and no conversion dialog renders', async () => {
      await loaded({ status: 'quotation' });
      const link = screen.getByTestId('convert-quotation-button');
      expect(link.tagName).toBe('A');
      expect(link).toHaveAttribute('href', `/budget/invoices/${ID}/convert`);
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('Convert carries this offer as the origin so the Convert page can step back', async () => {
      await loaded({ status: 'quotation' });
      await userEvent.click(screen.getByTestId('convert-quotation-button'));
      expect(probedPath()).toBe(`/budget/invoices/${ID}/convert`);
      expect(probedOrigin()).toEqual({ to: `/budget/invoices/${ID}`, name: HEADING });
    });

    it('an invoice has no Convert button', async () => {
      await loaded({ status: 'pending' });
      expect(screen.queryByTestId('convert-quotation-button')).toBeNull();
    });

    it('names the strip and the tabs after the type: "Offer summary" and "Invoice summary"', async () => {
      await loaded({ status: 'quotation' });
      expect(screen.getByRole('region', { name: 'Offer summary' })).toBeInTheDocument();
    });

    it('an invoice strip is "Invoice summary"', async () => {
      await loaded();
      expect(screen.getByRole('region', { name: 'Invoice summary' })).toBeInTheDocument();
    });

    it.each([
      ['pending', 'invoice-primary-mark-paid'],
      ['paid', 'invoice-primary-bank-report'],
      ['claimed', 'invoice-primary-add-payment'],
    ] as const)('a %s invoice has the primary %s', async (status, testId) => {
      await loaded({ status });
      expect(screen.getByTestId(testId)).toBeInTheDocument();
      for (const other of [
        'invoice-primary-mark-paid',
        'invoice-primary-bank-report',
        'invoice-primary-add-payment',
      ].filter((id) => id !== testId)) {
        expect(screen.queryByTestId(other)).toBeNull();
      }
    });

    it.each(['pending', 'paid'] as const)(
      'a %s invoice has Add progress payment as its secondary; claimed has none',
      async (status) => {
        await loaded({ status });
        expect(screen.getByTestId('invoice-secondary-add-payment')).toHaveTextContent(
          'Add progress payment',
        );
      },
    );

    it('a submitted invoice has no secondary and shows no chip menu', async () => {
      await loaded({ status: 'claimed' });
      expect(screen.queryByTestId('invoice-secondary-add-payment')).toBeNull();
      expect(screen.getByTestId('invoice-status-badge').tagName).toBe('SPAN');
    });
  });

  describe('status change', () => {
    it('Mark paid (primary) applies at once with no date step, and offers Undo', async () => {
      mockChangeInvoiceStatus.mockResolvedValue({
        record: record({ status: 'paid' }),
        undo: TOKEN,
      });
      await loaded({ status: 'pending' });
      await userEvent.click(screen.getByTestId('invoice-primary-mark-paid'));
      await waitFor(() => expect(mockChangeInvoiceStatus).toHaveBeenCalledTimes(1));
      expect(mockChangeInvoiceStatus).toHaveBeenCalledWith('vendor-1', ID, { status: 'paid' });
      expect(screen.queryByRole('dialog')).toBeNull();
      await waitFor(() => expect(mockShowUndoToast).toHaveBeenCalledTimes(1));
      expect(mockShowUndoToast.mock.calls[0]![0]).toMatchObject({
        dedupeKey: `invoice:${ID}`,
        message: expect.stringContaining(HEADING),
      });
    });

    it('refreshes the record silently after a change, without a skeleton', async () => {
      mockChangeInvoiceStatus.mockResolvedValue({ record: record({ status: 'paid' }), undo: null });
      await loaded({ status: 'pending' });
      mockFetchInvoiceById.mockResolvedValue(record({ status: 'paid', paid: 1000, openAmount: 0 }));
      await userEvent.click(screen.getByTestId('invoice-primary-mark-paid'));
      await waitFor(() => expect(screen.getByTestId('invoice-primary-bank-report')).toBeVisible());
      expect(screen.queryByRole('status', { name: 'Loading invoice...' })).toBeNull();
      expect(screen.getByTestId('invoice-status-badge')).toHaveTextContent('Paid');
    });

    it('the chip menu offers the way back from Paid', async () => {
      mockChangeInvoiceStatus.mockResolvedValue({ record: record(), undo: null });
      await loaded({ status: 'paid' });
      fireEvent.click(screen.getByTestId('invoice-status-badge'));
      expect(screen.getAllByRole('menuitem').map((r) => r.textContent)).toEqual([
        'Back to “To pay”',
      ]);
      fireEvent.click(screen.getByTestId('invoice-status-badge-option-pending'));
      await waitFor(() =>
        expect(mockChangeInvoiceStatus).toHaveBeenCalledWith('vendor-1', ID, { status: 'pending' }),
      );
    });

    it('a failed change toasts the generic copy and keeps the status', async () => {
      mockChangeInvoiceStatus.mockRejectedValue(new Error('RAW'));
      await loaded({ status: 'pending' });
      await userEvent.click(screen.getByTestId('invoice-primary-mark-paid'));
      await waitFor(() =>
        expect(mockShowToast).toHaveBeenCalledWith('error', 'The status could not be changed.'),
      );
      expect(mockShowUndoToast).not.toHaveBeenCalled();
      expect(screen.getByTestId('invoice-status-badge')).toHaveTextContent('To pay');
    });

    it('Undo refreshes the record', async () => {
      mockChangeInvoiceStatus.mockResolvedValue({
        record: record({ status: 'paid' }),
        undo: TOKEN,
      });
      await loaded({ status: 'pending' });
      await userEvent.click(screen.getByTestId('invoice-primary-mark-paid'));
      await waitFor(() => expect(mockShowUndoToast).toHaveBeenCalled());
      const before = mockFetchInvoiceById.mock.calls.length;
      const options = mockShowUndoToast.mock.calls[0]![0] as { onUndo: () => Promise<void> };
      await act(async () => {
        await options.onUndo();
      });
      expect(mockFetchInvoiceById.mock.calls.length).toBeGreaterThan(before);
    });
  });

  describe('Prepare bank report', () => {
    const SOURCES = [
      makeBudgetSource({ id: 's1', name: 'Loan Alpha' }),
      makeBudgetSource({ id: 's2', name: 'Savings Beta' }),
    ];

    async function paidWith(lines: ReturnType<typeof makeCostLine>[]) {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: SOURCES });
      mockFetchCostLines.mockResolvedValue(costLinesResponse(lines));
      await loaded({ status: 'paid' });
      // the cost lines and sources load after the page: wait for the funding source fact
      await waitFor(() =>
        expect(screen.getByTestId('summary-fact-fundingSource')).not.toHaveTextContent('–'),
      ).catch(() => undefined);
      return screen.getByTestId('invoice-primary-bank-report');
    }

    it('includes sourceId when exactly one source funds the cost lines, and carries the origin', async () => {
      await paidWith([makeCostLine({ budgetSourceId: 's1' })]);
      await waitFor(() =>
        expect(screen.getByTestId('invoice-primary-bank-report').getAttribute('href')).toContain(
          'sourceId=s1',
        ),
      );
      expect(screen.getByTestId('invoice-primary-bank-report').getAttribute('href')).toBe(
        '/budget/reports?sourceId=s1',
      );
    });

    it('sends no sourceId with several sources', async () => {
      await paidWith([
        makeCostLine({ id: 'a', budgetSourceId: 's1' }),
        makeCostLine({ id: 'b', budgetSourceId: 's2' }),
      ]);
      await waitFor(() =>
        expect(screen.getByTestId('summary-fact-fundingSource')).toHaveTextContent('+1'),
      );
      expect(screen.getByTestId('invoice-primary-bank-report').getAttribute('href')).toBe(
        '/budget/reports',
      );
    });

    it('sends no sourceId with no source at all', async () => {
      const link = await paidWith([makeCostLine({ budgetSourceId: null })]);
      expect(link.getAttribute('href')).toBe('/budget/reports');
    });

    it('follows the link with this page as origin', async () => {
      const link = await paidWith([]);
      await userEvent.click(link);
      await screen.findByText('Elsewhere');
      expect(probedOrigin()).toEqual({ to: `/budget/invoices/${ID}`, name: HEADING });
    });
  });

  describe('Add progress payment', () => {
    it('the secondary opens the Add progress payment dialog', async () => {
      await loaded({ status: 'pending' });
      await userEvent.click(screen.getByTestId('invoice-secondary-add-payment'));
      const dialog = await screen.findByRole('dialog', { name: 'payment-probe' });
      expect(dialog).toHaveAttribute('data-mode', 'add');
      expect(dialog).toHaveAttribute('data-entry', 'deposit');
    });

    it('the primary of a submitted invoice opens it too, and closing returns focus to the button', async () => {
      await loaded({ status: 'claimed' });
      const primary = screen.getByTestId('invoice-primary-add-payment');
      await userEvent.click(primary);
      await userEvent.click(await screen.findByText('payment-close'));
      await waitFor(() => expect(primary).toHaveFocus());
    });

    it('opens with no opener when focus sits on a non-HTML element', async () => {
      await loaded({ status: 'claimed' });
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('tabindex', '0');
      document.body.appendChild(svg);
      svg.focus();
      expect(document.activeElement).toBe(svg);
      fireEvent.click(screen.getByTestId('invoice-primary-add-payment'));
      expect(await screen.findByRole('dialog', { name: 'payment-probe' })).toBeInTheDocument();
      svg.remove();
    });

    it('saving a payment refreshes the record', async () => {
      await loaded({ status: 'pending' });
      await userEvent.click(screen.getByTestId('invoice-secondary-add-payment'));
      const before = mockFetchInvoiceById.mock.calls.length;
      await userEvent.click(await screen.findByText('payment-saved'));
      await waitFor(() => expect(mockFetchInvoiceById.mock.calls.length).toBeGreaterThan(before));
    });
  });

  describe('⋯ menu', () => {
    it('Edit details opens the edit dialog; saving refreshes the record; Close closes it', async () => {
      await loaded();
      openMenu();
      fireEvent.click(screen.getByTestId('invoice-menu-edit'));
      expect(await screen.findByRole('dialog', { name: 'edit-probe' })).toBeInTheDocument();
      const before = mockFetchInvoiceById.mock.calls.length;
      await userEvent.click(screen.getByText('edit-saved'));
      await waitFor(() => expect(mockFetchInvoiceById.mock.calls.length).toBeGreaterThan(before));
      await userEvent.click(screen.getByText('edit-close'));
      expect(screen.queryByRole('dialog', { name: 'edit-probe' })).toBeNull();
    });

    it('offers Edit details and Delete', async () => {
      await loaded();
      openMenu();
      expect(screen.getByTestId('invoice-menu-edit')).toHaveTextContent('Edit details');
      expect(screen.getByTestId('object-header-delete')).toBeInTheDocument();
    });
  });

  describe('delete', () => {
    async function openDelete() {
      await loaded();
      openMenu();
      await act(async () => {
        fireEvent.click(screen.getByTestId('object-header-delete'));
      });
    }

    it('opens an alertdialog with Cancel focused and loads what the delete also removes', async () => {
      mockFetchDeleteImpact.mockResolvedValue({
        entityType: 'invoice',
        id: ID,
        effects: [
          { kind: 'progressPayments', count: 2 },
          { kind: 'documentLinks', count: 0 },
        ],
      });
      await openDelete();
      expect(await screen.findByRole('alertdialog')).toHaveAccessibleName(/^Delete /);
      expect(screen.getByTestId('invoice-delete-cancel')).toHaveFocus();
      await waitFor(() =>
        expect(screen.getByTestId('invoice-delete-consequences')).toHaveTextContent(
          'Progress payments deleted with it: 2',
        ),
      );
      expect(screen.queryByText(/Linked documents/)).toBeNull();
      expect(mockFetchDeleteImpact).toHaveBeenCalledWith('invoice', ID);
    });

    it('does not load the impact until the dialog is opened', async () => {
      await loaded();
      expect(mockFetchDeleteImpact).not.toHaveBeenCalled();
    });

    it('deleting replaces the history entry with the Invoices list', async () => {
      const log = renderRouted();
      await screen.findByRole('heading', { level: 1, name: HEADING });
      openMenu();
      await act(async () => {
        fireEvent.click(screen.getByTestId('object-header-delete'));
      });
      await act(async () => {
        fireEvent.click(await enabledConfirm('invoice-delete'));
      });
      await waitFor(() => expect(log.actions).toEqual(['REPLACE /budget/invoices']));
      expect(log.entries).toEqual(['/budget/invoices']);
      expect(mockDeleteInvoice).toHaveBeenCalledWith('vendor-1', ID);
    });

    it('Cancel closes the dialog without deleting', async () => {
      await openDelete();
      await act(async () => {
        fireEvent.click(await screen.findByTestId('invoice-delete-cancel'));
      });
      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(mockDeleteInvoice).not.toHaveBeenCalled();
    });

    it('a 409 shows the translated error and hides the action', async () => {
      mockDeleteInvoice.mockRejectedValue(
        new ApiClientError(409, { code: 'CONFLICT', message: 'raw prose' }),
      );
      await openDelete();
      await act(async () => {
        fireEvent.click(await enabledConfirm('invoice-delete'));
      });
      await waitFor(() => expect(screen.queryByTestId('invoice-delete-confirm')).toBeNull());
      expect(screen.getByRole('alert')).not.toHaveTextContent('raw prose');
      expect(screen.getByTestId('invoice-delete-cancel')).toBeInTheDocument();
    });

    it('another API error keeps the action for a retry and shows the translated text', async () => {
      mockDeleteInvoice.mockRejectedValue(
        new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'raw prose' }),
      );
      await openDelete();
      await act(async () => {
        fireEvent.click(await enabledConfirm('invoice-delete'));
      });
      const alert = await screen.findByRole('alert');
      expect(alert).not.toHaveTextContent('raw prose');
      expect(screen.getByTestId('invoice-delete-confirm')).toBeInTheDocument();
    });

    it('a non-API failure shows the generic delete error and keeps the action', async () => {
      mockDeleteInvoice.mockRejectedValue(new Error('boom'));
      await openDelete();
      await act(async () => {
        fireEvent.click(await enabledConfirm('invoice-delete'));
      });
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Failed to delete invoice. Please try again.',
      );
      expect(screen.getByTestId('invoice-delete-confirm')).toBeInTheDocument();
    });

    it('ignores Cancel and Escape while the delete request is running', async () => {
      mockDeleteInvoice.mockImplementation(() => new Promise(() => {}));
      await openDelete();
      await screen.findByRole('alertdialog');
      await act(async () => {
        fireEvent.click(await enabledConfirm('invoice-delete'));
      });
      await act(async () => {
        fireEvent.click(screen.getByTestId('invoice-delete-cancel'));
        fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' });
      });
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    });

    it('re-opening after a failure starts without the old error', async () => {
      mockDeleteInvoice.mockRejectedValueOnce(new Error('boom'));
      await openDelete();
      await act(async () => {
        fireEvent.click(await enabledConfirm('invoice-delete'));
      });
      await screen.findByRole('alert');
      await act(async () => {
        fireEvent.click(screen.getByTestId('invoice-delete-cancel'));
      });
      openMenu();
      await act(async () => {
        fireEvent.click(screen.getByTestId('object-header-delete'));
      });
      await screen.findByRole('alertdialog');
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });
});

// ─── Summary strip, tabs and panels ──────────────────────────────────────────

describe('InvoiceDetailPage body (S11)', () => {
  it('shows the facts from the loaded record, with Paid and Still to pay from the money service', async () => {
    await loaded({ amount: 1000, paid: 200, openAmount: 800 });
    const strip = screen.getByTestId('invoice-summary');
    expect(within(strip).getByTestId('summary-fact-amount')).toHaveTextContent('€1,000.00');
    expect(within(strip).getByTestId('summary-fact-paid')).toHaveTextContent('€200.00');
    expect(within(strip).getByTestId('summary-fact-stillToPay')).toHaveTextContent('€800.00');
  });

  it('an offer strip shows Remaining on offer instead of Still to pay', async () => {
    await loaded({ status: 'quotation', remainingOnOffer: 650 });
    expect(screen.getByTestId('summary-fact-remainingOnOffer')).toHaveTextContent('€650.00');
    expect(screen.queryByTestId('summary-fact-stillToPay')).toBeNull();
  });

  it('appends the Documents fact from the Documents host and renders its panel', async () => {
    documentsFact = { id: 'documents', kind: 'static', label: 'Documents', value: '3' };
    await loaded();
    expect(screen.getByTestId('summary-fact-documents')).toHaveTextContent('3');
    expect(screen.getByTestId('documents-panel')).toHaveAttribute('data-type', 'invoice');
    expect(screen.getByTestId('documents-panel')).toHaveAttribute('data-id', ID);
  });

  it('has no Documents fact while the host has none', async () => {
    await loaded();
    expect(screen.queryByTestId('summary-fact-documents')).toBeNull();
  });

  it('opens on the Cost tab with the counts of lines and payments', async () => {
    mockFetchCostLines.mockResolvedValue(
      costLinesResponse([makeCostLine({ id: 'a' }), makeCostLine({ id: 'b' })]),
    );
    await loaded({ deposits: [makePayment({ id: 'p1', invoiceId: ID })] });
    expect(screen.getByRole('tab', { name: /Cost/ })).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => expect(screen.getByRole('tab', { name: /Cost.*2/ })).toBeInTheDocument());
    expect(screen.getByRole('tab', { name: /Payments.*1/ })).toBeInTheDocument();
    expect(screen.getByTestId('invoice-budget-lines-section')).toBeInTheDocument();
  });

  it('the Cost tab hides the count while its lines load', async () => {
    mockFetchCostLines.mockImplementation(() => new Promise(() => {}));
    await loaded();
    expect(screen.getByRole('tab', { name: 'Cost' })).toBeInTheDocument();
  });

  it('the Paid fact opens the Payments tab and the panel shows both lists', async () => {
    await loaded({ deposits: [makePayment({ id: 'p1', invoiceId: ID })] });
    await userEvent.click(screen.getByTestId('summary-fact-paid'));
    expect(await screen.findByTestId('invoice-progress-payments')).toBeInTheDocument();
    expect(screen.getByTestId('invoice-refunds')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Payments/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('invoice-budget-lines-section')).not.toBeVisible();
  });

  it('the History tab loads the invoice history', async () => {
    await loaded({}, `/budget/invoices/${ID}?tab=history`);
    expect(await screen.findByRole('heading', { name: 'History' })).toBeInTheDocument();
    expect(mockListHistory).toHaveBeenCalledWith(
      { entityType: 'invoice', entityId: ID, pageSize: 20 },
      expect.any(AbortSignal),
    );
  });

  it('a change reported by the cost lines section refreshes the record, and a failed refresh falls back to a reload', async () => {
    await loaded();
    const before = mockFetchInvoiceById.mock.calls.length;
    await userEvent.click(screen.getByText('stub-changed'));
    await waitFor(() => expect(mockFetchInvoiceById.mock.calls.length).toBe(before + 1));

    mockFetchInvoiceById.mockRejectedValueOnce(new Error('offline'));
    mockFetchInvoiceById.mockResolvedValue(record({ amount: 2222 }));
    await userEvent.click(screen.getByText('stub-changed'));
    await waitFor(() =>
      expect(screen.getByTestId('summary-fact-amount')).toHaveTextContent('€2,222.00'),
    );
  });

  it('the payments panel refresh reloads the figures: a new Paid shows without a skeleton', async () => {
    await loaded({ paid: 0 }, `/budget/invoices/${ID}?tab=payments`);
    mockFetchInvoiceById.mockResolvedValue(record({ paid: 300, openAmount: 700 }));
    const list = await screen.findByTestId('invoice-progress-payments');
    await userEvent.click(within(list).getByRole('button', { name: 'Add progress payment' }));
    await userEvent.click(await screen.findByText('payment-saved'));
    await waitFor(() =>
      expect(screen.getByTestId('summary-fact-paid')).toHaveTextContent('€300.00'),
    );
    expect(screen.queryByRole('status', { name: 'Loading invoice...' })).toBeNull();
  });
});

// ─── ?payment= deep link ─────────────────────────────────────────────────────

describe('InvoiceDetailPage payment deep link (S11)', () => {
  beforeEach(() => {
    HTMLElement.prototype.scrollIntoView = jest.fn() as never;
  });
  afterEach(() => {
    delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  const withPayment = () =>
    mockFetchInvoiceById.mockResolvedValue(
      record({ deposits: [makePayment({ id: 'dep-1', invoiceId: ID, status: 'paid' })] }),
    );

  function renderAt(search: string, state: unknown = { origin: { to: '/diary' } }) {
    const log = createRouterLog();
    render(
      <RecordingRouter entries={[{ url: `/budget/invoices/${ID}${search}`, state }]} log={log}>
        {routes()}
      </RecordingRouter>,
    );
    return log;
  }

  it('?payment= without ?tab= selects Payments, highlights and focuses the row link, then drops the param keeping the origin', async () => {
    withPayment();
    const log = renderAt('?payment=dep-1');
    const link = await screen.findByTestId('invoice-progress-payments-link-dep-1');
    await waitFor(() => expect(link).toHaveFocus());
    expect(link.className).toContain('paymentTarget');
    expect(screen.getByRole('tab', { name: /Payments/ })).toHaveAttribute('aria-selected', 'true');
    // one replace to select the tab (keeps the param), one to drop the param
    await waitFor(() => expect(log.actions.length).toBeGreaterThanOrEqual(2));
    expect(log.actions.every((a) => a.startsWith('REPLACE'))).toBe(true);
    expect(log.actions.at(-1)).toBe(`REPLACE /budget/invoices/${ID}?tab=payments`);
    expect(mockShowToast).not.toHaveBeenCalled();
  });

  it('?payment= without ?tab= keeps the origin state through the tab selection', async () => {
    withPayment();
    const log = renderAt('?payment=dep-1');
    await waitFor(() => expect(log.actions.length).toBeGreaterThanOrEqual(2));
    expect(log.states.at(-1)).toEqual({ origin: { to: '/diary' } });
  });

  it('with ?tab=payments the dropped payment param keeps the origin state', async () => {
    withPayment();
    const log = renderAt('?tab=payments&payment=dep-1');
    await waitFor(() => expect(log.actions).toHaveLength(1));
    expect(log.states[0]).toEqual({ origin: { to: '/diary' } });
  });

  it('with ?tab=payments&payment= it highlights and drops only the payment param', async () => {
    withPayment();
    const log = renderAt('?tab=payments&payment=dep-1');
    await waitFor(() => expect(log.actions).toHaveLength(1));
    expect(log.actions[0]).toBe(`REPLACE /budget/invoices/${ID}?tab=payments`);
    expect(await screen.findByTestId('invoice-progress-payments-link-dep-1')).toHaveFocus();
  });

  it('finds a refund too', async () => {
    mockFetchInvoiceById.mockResolvedValue(
      record({
        deposits: [makePayment({ id: 'ref-1', invoiceId: ID, entryType: 'refund' })],
      }),
    );
    renderAt('?payment=ref-1');
    const link = await screen.findByTestId('invoice-refunds-link-ref-1');
    await waitFor(() => expect(link).toHaveFocus());
  });

  it('a missing payment shows the "no longer exists" toast and drops the param', async () => {
    withPayment();
    const log = renderAt('?payment=missing-id');
    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith('info', 'That progress payment no longer exists.'),
    );
    expect(log.actions.at(-1)).toBe(`REPLACE /budget/invoices/${ID}?tab=payments`);
    expect(document.querySelector('.paymentTarget')).toBeNull();
  });

  it('without the param it stays on the Cost tab and never replaces the URL', async () => {
    withPayment();
    const log = renderAt('');
    await screen.findByRole('heading', { level: 1, name: HEADING });
    expect(screen.getByRole('tab', { name: /Cost/ })).toHaveAttribute('aria-selected', 'true');
    expect(log.actions).toEqual([]);
    expect(mockShowToast).not.toHaveBeenCalled();
  });

  it('does not run before the invoice has loaded', async () => {
    let resolve!: (invoice: InvoiceDetail) => void;
    mockFetchInvoiceById.mockImplementation(
      () =>
        new Promise((res) => {
          resolve = res;
        }),
    );
    const log = renderAt('?payment=dep-1');
    expect(log.actions).toEqual([]);
    await act(async () => {
      resolve(record({ deposits: [makePayment({ id: 'dep-1', invoiceId: ID })] }));
    });
    await waitFor(() => expect(log.actions.length).toBeGreaterThan(0));
  });

  it('has no live region of its own: the old payment status region and header badge test ids are gone', async () => {
    withPayment();
    renderAt('?payment=dep-1');
    await screen.findByTestId('invoice-progress-payments-link-dep-1');
    expect(screen.queryByTestId('invoice-payment-status')).toBeNull();
    expect(screen.queryByTestId('invoice-detail-status-badge')).toBeNull();
  });
});
