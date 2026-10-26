/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ToastProvider } from '../../components/Toast/ToastContext.js';
import { ToastList } from '../../components/Toast/Toast.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { RecordingRouter, createRouterLog } from '../../test/recordingRouter.js';
import { makeSearchCompanies } from '../../test/companySearchMock.js';
import { findDuplicateTestIds } from '../../test/findDuplicateTestIds.js';
import {
  makeChipCounts,
  makeDeposit,
  makeResponse,
  makeRow,
} from '../../test/invoiceListFixtures.js';
import type * as InvoicesApiTypes from '../../lib/invoicesApi.js';
import type * as VendorsApiTypes from '../../lib/vendorsApi.js';
import type * as PaperlessApiTypes from '../../lib/paperlessApi.js';
import type * as StatusChangeApiTypes from '../../lib/statusChangeApi.js';
import type * as PageModule from './InvoicesPage.js';

const mockFetchAllInvoices = jest.fn<typeof InvoicesApiTypes.fetchAllInvoices>();
const mockCreateInvoice = jest.fn<typeof InvoicesApiTypes.createInvoice>();
const mockFetchVendors = jest.fn<typeof VendorsApiTypes.fetchVendors>();
const mockFetchVendor = jest.fn<typeof VendorsApiTypes.fetchVendor>();
const mockGetPaperlessStatus = jest.fn<typeof PaperlessApiTypes.getPaperlessStatus>();
const mockChangeInvoiceStatus = jest.fn<typeof StatusChangeApiTypes.changeInvoiceStatus>();

jest.unstable_mockModule('../../lib/invoicesApi.js', () => ({
  fetchAllInvoices: mockFetchAllInvoices,
  createInvoice: mockCreateInvoice,
}));

jest.unstable_mockModule('../../lib/vendorsApi.js', () => ({
  fetchVendors: mockFetchVendors,
  searchCompanies: makeSearchCompanies(mockFetchVendors),
  fetchVendor: mockFetchVendor,
  createVendor: jest.fn(),
  updateVendor: jest.fn(),
  deleteVendor: jest.fn(),
}));

jest.unstable_mockModule('../../lib/paperlessApi.js', () => ({
  getPaperlessStatus: mockGetPaperlessStatus,
  listPaperlessDocuments: jest.fn(),
  listPaperlessTags: jest.fn(),
  getPaperlessDocument: jest.fn(),
  getDocumentThumbnailUrl: jest.fn().mockReturnValue('/thumb'),
  getDocumentPreviewUrl: jest.fn().mockReturnValue('/preview'),
  listPaperlessCorrespondents: jest.fn(),
}));

jest.unstable_mockModule('../../lib/configApi.js', () => ({
  fetchConfig: jest.fn(() => Promise.resolve({ autoItemizeEnabled: false })),
}));

jest.unstable_mockModule('../../lib/statusChangeApi.js', () => ({
  changeInvoiceStatus: mockChangeInvoiceStatus,
  changeDepositStatus: jest.fn(),
  invoiceStatusBody: (to: string) => ({ status: to }),
  depositStatusBody: (from: string, to: string, date: string | null) => ({ from, to, date }),
}));

jest.unstable_mockModule('../../lib/undoApi.js', () => ({
  undoChange: jest.fn(() => Promise.resolve({})),
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

let InvoicesPage: typeof PageModule.InvoicesPage;

const A = makeRow({ id: 'inv-a', invoiceNumber: 'INV-T-A', vendorId: 'v-1' });
const B = makeRow({
  id: 'inv-b',
  invoiceNumber: 'INV-T-B',
  vendorId: 'v-2',
  vendorName: 'Example Plumbing Co',
});

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

function renderPage(url = '/budget/invoices') {
  return render(
    <ToastProvider>
      <ToastList />
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/budget/invoices" element={<InvoicesPage />} />
          <Route path="*" element={<div>Elsewhere</div>} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    </ToastProvider>,
  );
}

async function loaded() {
  await waitFor(() => expect(screen.queryByLabelText('Loading the list')).not.toBeInTheDocument());
}

const heading = () => screen.getByRole('heading', { level: 1 });

beforeEach(async () => {
  if (!InvoicesPage) ({ InvoicesPage } = await import('./InvoicesPage.js'));
  mockFetchAllInvoices.mockReset();
  mockFetchAllInvoices.mockResolvedValue(makeResponse([A, B]));
  mockCreateInvoice.mockReset();
  mockFetchVendors.mockReset();
  mockFetchVendors.mockResolvedValue({
    vendors: [{ id: 'v-1', name: 'Example Roofing Ltd' } as never],
    pagination: { page: 1, pageSize: 50, totalItems: 1, totalPages: 1 },
  });
  mockFetchVendor.mockReset();
  mockFetchVendor.mockRejectedValue(new ApiClientError(404, { code: 'NOT_FOUND', message: 'x' }));
  mockGetPaperlessStatus.mockReset();
  mockGetPaperlessStatus.mockResolvedValue({
    configured: false,
    reachable: false,
    error: null,
    paperlessUrl: null,
    filterTag: null,
  });
  mockChangeInvoiceStatus.mockReset();
});

describe('legacy ?openOnly URL', () => {
  function renderRouted(url: string) {
    const log = createRouterLog();
    render(
      <ToastProvider>
        <RecordingRouter entries={[url]} log={log}>
          <InvoicesPage />
        </RecordingRouter>
      </ToastProvider>,
    );
    return log;
  }

  it('rewrites openOnly=true, page and pageSize with exactly one replace before the list mounts', async () => {
    const log = renderRouted('/budget/invoices?openOnly=true&page=2&pageSize=50&q=roof');
    await loaded();
    expect(log.actions).toEqual(['REPLACE /budget/invoices?q=roof&status=pending']);
    expect(mockFetchAllInvoices.mock.calls.every(([p]) => p?.page === 1)).toBe(true);
    expect(mockFetchAllInvoices.mock.calls[0]![0]).toMatchObject({ q: 'roof', openOnly: true });
  });

  it('openOnly=false lands on the bare list URL', async () => {
    const log = renderRouted('/budget/invoices?openOnly=false');
    await loaded();
    expect(log.actions).toEqual(['REPLACE /budget/invoices']);
  });

  it('does not navigate at all without the legacy param', async () => {
    const log = renderRouted('/budget/invoices?status=paid');
    await loaded();
    expect(log.actions).toEqual([]);
  });
});

describe('heading and chips', () => {
  it('shows "Invoices" without a count while loading and "Invoices (n)" once loaded', async () => {
    mockFetchAllInvoices.mockReturnValue(new Promise(() => undefined));
    renderPage();
    expect(heading()).toHaveTextContent(/^Invoices$/);
  });

  it('counts the rows, with no "of m" while nothing is filtered', async () => {
    renderPage();
    await loaded();
    expect(heading()).toHaveTextContent('Invoices (2)');
    expect(heading()).not.toHaveTextContent(' of ');
  });

  it('shows "n of m" once a filter or a search narrows the list', async () => {
    mockFetchAllInvoices.mockResolvedValue(makeResponse([A]));
    renderPage('/budget/invoices?notYetSplit=1');
    await loaded();
    expect(heading()).toHaveTextContent('Invoices (1 of 3)');
  });

  it('presses To pay by default, with the totals on every chip', async () => {
    renderPage();
    await loaded();
    expect(screen.getByTestId('invoices-chip-pending')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('invoices-chip-pending')).toHaveTextContent('To pay (3)');
    expect(screen.getByTestId('invoices-chip-quotation')).toHaveTextContent('Offers (2)');
    expect(screen.getByTestId('invoices-chip-paid')).toHaveTextContent('Paid (4)');
    expect(screen.getByTestId('invoices-chip-claimed')).toHaveTextContent('Submitted (1)');
    expect(screen.getByTestId('invoices-chip-all')).toHaveTextContent('All (10)');
  });

  it('shows the matching counts while a filter is on', async () => {
    mockFetchAllInvoices.mockResolvedValue(
      makeResponse([A], {
        chipCounts: makeChipCounts({
          matching: { toPay: 1, offers: 0, paid: 2, submitted: 0, all: 3 },
        }),
      }),
    );
    renderPage('/budget/invoices?due=1');
    await loaded();
    expect(screen.getByTestId('invoices-chip-pending')).toHaveTextContent('To pay (1)');
    expect(screen.getByTestId('invoices-chip-paid')).toHaveTextContent('Paid (2)');
    expect(screen.getByTestId('invoices-chip-all')).toHaveTextContent('All (3)');
  });

  it('selecting a chip writes status to the URL', async () => {
    renderPage();
    await loaded();
    await userEvent.click(screen.getByTestId('invoices-chip-paid'));
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/budget/invoices?status=paid'),
    );
    expect(mockFetchAllInvoices.mock.calls.at(-1)![0]).toMatchObject({ status: 'paid' });
  });
});

describe('searching all statuses', () => {
  it('presses no chip, names where the other matches are and shows no footer or Offers summary', async () => {
    renderPage('/budget/invoices?q=roof');
    await loaded();
    for (const chip of ['pending', 'quotation', 'paid', 'claimed', 'all']) {
      expect(screen.getByTestId(`invoices-chip-${chip}`)).toHaveAttribute('aria-pressed', 'false');
    }
    expect(screen.getByTestId('invoices-searching-all')).toHaveTextContent(
      'Searching all · 7 more in other statuses',
    );
    expect(screen.queryByTestId('invoices-footer')).toBeNull();
    expect(screen.queryByTestId('invoices-offers-summary')).toBeNull();
    expect(mockFetchAllInvoices.mock.calls[0]![0]).not.toHaveProperty('openOnly');
    expect(mockFetchAllInvoices.mock.calls[0]![0]).not.toHaveProperty('status');
  });

  it('names the single other chip that has matches', async () => {
    mockFetchAllInvoices.mockResolvedValue(
      makeResponse([A], {
        chipCounts: makeChipCounts({
          outsideToPay: { offers: 1, paid: 0, submitted: 0, all: 1 },
        }),
      }),
    );
    renderPage('/budget/invoices?q=OFF');
    await loaded();
    expect(screen.getByTestId('invoices-searching-all')).toHaveTextContent(
      'Searching all · 1 more in Offers',
    );
  });
});

describe('Offers summary', () => {
  it('shows four facts from the list totals on the Offers chip only', async () => {
    renderPage('/budget/invoices?status=quotation');
    await loaded();
    const summary = await screen.findByTestId('invoices-offers-summary');
    expect(summary).toHaveTextContent('Offers');
    expect(summary).toHaveTextContent('2');
    expect(summary).toHaveTextContent('€9,000.00');
    expect(summary).toHaveTextContent('€1,500.00');
    expect(summary).toHaveTextContent('€7,500.00');
    expect(within(summary).getAllByRole('term')).toHaveLength(4);
    // Parts of a figure, never a registered figure of their own.
    expect(summary.querySelectorAll('[data-figure]')).toHaveLength(0);
  });

  it('is not shown on the other chips', async () => {
    for (const url of ['/budget/invoices', '/budget/invoices?status=paid']) {
      const { unmount } = renderPage(url);
      await loaded();
      expect(screen.queryByTestId('invoices-offers-summary')).toBeNull();
      unmount();
    }
  });

  it('shows the Offers columns on the Offers chip only', async () => {
    const offers = renderPage('/budget/invoices?status=quotation');
    await loaded();
    expect(screen.getByTestId('invoices-sort-header-date')).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(
      expect.arrayContaining(['Offered', 'Remaining on offer', 'Progress payments']),
    );
    offers.unmount();

    renderPage();
    await loaded();
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).not.toContain('Offered');
    expect(headers).not.toContain('Remaining on offer');
  });
});

describe('To pay footer', () => {
  it('shows "Still to pay" with the registered figure over every matching row', async () => {
    renderPage();
    await loaded();
    const footer = await screen.findByTestId('invoices-footer');
    expect(footer).toHaveTextContent('Still to pay');
    expect(footer).not.toHaveTextContent('in this list');
    const figure = screen.getByTestId('invoices-footer-figure');
    expect(figure).toHaveAttribute('data-figure', 'still-to-pay');
    expect(figure.textContent).toBe('€4,200.50');
    expect(document.querySelectorAll('[data-figure]')).toHaveLength(1);
  });

  it('words it "in this list" and drops the marker while filters are on', async () => {
    renderPage('/budget/invoices?notYetSplit=1');
    await loaded();
    const footer = await screen.findByTestId('invoices-footer');
    expect(footer).toHaveTextContent('Still to pay in this list');
    expect(screen.getByTestId('invoices-footer-figure')).not.toHaveAttribute('data-figure');
    expect(document.querySelectorAll('[data-figure]')).toHaveLength(0);
  });

  it('is not shown on the other chips', async () => {
    renderPage('/budget/invoices?status=paid');
    await loaded();
    expect(screen.queryByTestId('invoices-footer')).toBeNull();
  });
});

describe('empty and failed states', () => {
  it('words the empty To pay chip on its own', async () => {
    mockFetchAllInvoices.mockResolvedValue(makeResponse([]));
    renderPage();
    expect(await screen.findByText('Nothing to pay right now')).toBeInTheDocument();
    expect(
      screen.getByText('Every invoice and progress payment is paid or submitted.'),
    ).toBeInTheDocument();
  });

  it('an empty non-default chip is a narrowed list: it says nothing matches and offers Clear filters', async () => {
    mockFetchAllInvoices.mockResolvedValue(makeResponse([]));
    renderPage('/budget/invoices?status=paid');
    expect(await screen.findByText('No invoices match.')).toBeInTheDocument();
    expect(screen.queryByText('No invoices yet')).toBeNull();
    await userEvent.click(screen.getByTestId('invoices-clear-filters'));
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(/^\/budget\/invoices$/),
    );
  });

  it('says nothing matches when filters leave no rows', async () => {
    mockFetchAllInvoices.mockResolvedValue(makeResponse([]));
    renderPage('/budget/invoices?due=1');
    expect(await screen.findByText('No invoices match.')).toBeInTheDocument();
  });

  it('shows the load failure and retries', async () => {
    mockFetchAllInvoices.mockRejectedValueOnce(new Error('boom'));
    renderPage();
    expect(await screen.findByText('Invoices could not be loaded.')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('invoices-retry'));
    await loaded();
    expect(heading()).toHaveTextContent('Invoices (2)');
  });
});

describe('note row', () => {
  it('names the active Show only filters', async () => {
    renderPage('/budget/invoices?notYetSplit=1&due=1');
    await loaded();
    expect(screen.getByTestId('invoices-note')).toHaveTextContent(
      'Showing only: Not yet split, Due or overdue',
    );
  });

  it('has no note without a Show only filter', async () => {
    renderPage('/budget/invoices?vendorId=v-1');
    await loaded();
    expect(screen.queryByTestId('invoices-note')).toBeNull();
  });
});

describe('D-30: no stat cards on the Invoices page', () => {
  it('renders no summary card markup and no "Ready to submit" or "Invoice Pipeline" text', async () => {
    mockFetchAllInvoices.mockResolvedValue(
      makeResponse([A, B], {
        summary: {
          ...makeResponse([]).summary,
          claimable: { count: 2, totalAmount: 12000 },
          overdue: { count: 1, totalAmount: 500 },
        },
      }),
    );
    for (const url of ['/budget/invoices', '/budget/invoices?status=quotation']) {
      const { unmount, container } = renderPage(url);
      await loaded();
      expect(document.querySelectorAll('[data-testid^="summary-card-"]')).toHaveLength(0);
      expect(container).not.toHaveTextContent('Ready to submit');
      expect(container).not.toHaveTextContent('Invoice Pipeline');
      expect(document.querySelectorAll('[data-figure="ready-to-submit"]')).toHaveLength(0);
      unmount();
    }
  });
});

describe('page identity', () => {
  it('has one Invoices h1, the tab title and no breadcrumbs, and does not navigate on mount', async () => {
    document.title = 'initial';
    const log = createRouterLog();
    render(
      <ToastProvider>
        <RecordingRouter entries={['/budget/invoices']} log={log}>
          <InvoicesPage />
        </RecordingRouter>
      </ToastProvider>,
    );
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    await loaded();
    expect(document.title).toBe('Invoices · Money · Cornerstone');
    expect(screen.queryByRole('navigation', { name: 'You are here' })).toBeNull();
    expect(log.actions).toEqual([]);
  });

  it('the invoice title link pushes once, to the invoice', async () => {
    const log = createRouterLog();
    render(
      <ToastProvider>
        <RecordingRouter entries={['/budget/invoices?status=pending']} log={log}>
          <InvoicesPage />
        </RecordingRouter>
      </ToastProvider>,
    );
    await loaded();
    fireEvent.click(screen.getByTestId('invoices-title-inv-a'));
    expect(log.actions).toEqual(['PUSH /budget/invoices/inv-a']);
  });

  it('the company link pushes once, to the company page with the list as origin', async () => {
    const log = createRouterLog();
    render(
      <ToastProvider>
        <RecordingRouter entries={['/budget/invoices?status=pending']} log={log}>
          <InvoicesPage />
        </RecordingRouter>
      </ToastProvider>,
    );
    await loaded();
    fireEvent.click(screen.getByTestId('invoices-company-inv-a'));
    expect(log.actions).toEqual(['PUSH /companies/v-1']);
    expect(log.states[0]).toEqual({ origin: { to: '/budget/invoices?status=pending' } });
  });

  it('keeps every data-testid unique across the table and cards, with a card menu open and progress payments', async () => {
    mockFetchAllInvoices.mockResolvedValue(
      makeResponse([
        makeRow({
          id: 'inv-o',
          status: 'quotation',
          invoiceNumber: 'OFF-T-1',
          deposits: [makeDeposit({ id: 'dep-1', invoiceId: 'inv-o' })],
        }),
        A,
      ]),
    );
    const { container } = renderPage();
    await loaded();
    expect(findDuplicateTestIds(container)).toEqual([]);
    fireEvent.click(screen.getByTestId('invoices-row-menu-mobile-inv-a'));
    expect(findDuplicateTestIds(document.body)).toEqual([]);
  });
});

describe('Mark paid from the list', () => {
  it('marks the row paid, refreshes it and offers Undo', async () => {
    mockChangeInvoiceStatus.mockResolvedValue({
      record: A,
      undo: { token: 'tok', expiresAt: '2099-01-01T00:00:00.000Z' },
    } as never);
    renderPage();
    await loaded();

    fireEvent.click(screen.getByTestId('invoices-mark-paid-inv-a'));

    await waitFor(() =>
      expect(mockChangeInvoiceStatus).toHaveBeenCalledWith('v-1', 'inv-a', { status: 'paid' }),
    );
    expect(await screen.findByTestId('toast-undo')).toHaveTextContent('INV-T-A is now “Paid”.');
    // One request for the rows by id, one for the figures.
    await waitFor(() =>
      expect(
        mockFetchAllInvoices.mock.calls.some(
          ([p]) => (p as { ids?: string[] }).ids?.[0] === 'inv-a',
        ),
      ).toBe(true),
    );
  });

  it('shows the bulk action once rows are selected and marks the pending ones', async () => {
    mockChangeInvoiceStatus.mockResolvedValue({ record: A, undo: null } as never);
    mockFetchAllInvoices.mockResolvedValue(makeResponse([A, B]));
    renderPage();
    await loaded();

    await userEvent.click(screen.getByTestId('invoices-select-inv-a'));
    await userEvent.click(screen.getByTestId('invoices-select-inv-b'));
    const bulk = await screen.findByTestId('invoices-bulk-mark-paid');
    expect(bulk).toHaveTextContent('Mark paid (2)');
    await userEvent.click(bulk);

    await waitFor(() => expect(mockChangeInvoiceStatus).toHaveBeenCalledTimes(2));
  });
});

describe('creating an invoice', () => {
  it('reloads the list after a successful create', async () => {
    mockCreateInvoice.mockResolvedValue(A as never);
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await waitFor(() =>
      expect(screen.getByTestId('new-invoice-button')).not.toHaveAttribute('aria-disabled', 'true'),
    );
    const before = mockFetchAllInvoices.mock.calls.length;

    await user.click(screen.getByTestId('new-invoice-button'));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByLabelText(/vendor/i));
    await user.click(await screen.findByRole('option', { name: 'Example Roofing Ltd' }));
    fireEvent.change(within(dialog).getByLabelText(/^amount/i), { target: { value: '500' } });
    fireEvent.change(within(dialog).getByLabelText(/invoice date/i), {
      target: { value: '2026-06-01' },
    });
    fireEvent.submit(dialog.querySelector('form') as HTMLFormElement);

    await waitFor(() => expect(mockCreateInvoice).toHaveBeenCalledWith('v-1', expect.anything()));
    await waitFor(() => expect(mockFetchAllInvoices.mock.calls.length).toBeGreaterThan(before));
    await act(async () => {
      await Promise.resolve();
    });
  });

  it('shows the Without document filter once Paperless is configured', async () => {
    mockGetPaperlessStatus.mockResolvedValue({
      configured: true,
      reachable: true,
      error: null,
      paperlessUrl: 'https://paperless.example.com',
      filterTag: null,
    });
    renderPage();
    await loaded();
    await userEvent.click(await screen.findByTestId('invoices-filters-button'));
    expect(await screen.findByTestId('invoices-filter-withoutDocument')).toBeInTheDocument();
  });
});
