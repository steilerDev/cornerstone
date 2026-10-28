/**
 * @jest-environment jsdom
 */
/**
 * Page tests for the Company page (VendorDetailPage.tsx, rebuilt in #2244). All data is synthetic.
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type {
  DiaryEntrySummary,
  InvoiceListRow,
  InvoiceStatus,
  VendorContact,
  VendorDetail,
} from '@cornerstone/shared';
import {
  CreateMenuProvider,
  useCreatePrefill,
} from '../../components/CreateMenu/CreateMenuContext.js';
import { ToastProvider } from '../../components/Toast/ToastContext.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { notifyObjectCreated } from '../../lib/objectCreatedEvents.js';
import { InvoiceCreateContext } from '../../objectForms/invoiceCreateContext.js';
import type { OpenInvoiceForm } from '../../objectForms/invoiceCreateContext.js';
import { OriginProbe, probedOrigin, probedPath } from '../../test/originProbe.js';
import { installMatchMedia } from '../../test/matchMediaControl.js';
import type { MatchMediaControl } from '../../test/matchMediaControl.js';
import type * as VendorsApiTypes from '../../lib/vendorsApi.js';
import type * as InvoicesApiTypes from '../../lib/invoicesApi.js';
import type * as DeleteImpactApiTypes from '../../lib/deleteImpactApi.js';
import type * as RelationsApiTypes from '../../lib/vendorRelationsApi.js';
import type * as DiaryApiTypes from '../../lib/diaryApi.js';
import type * as HistoryApiTypes from '../../lib/historyApi.js';

const mockWhenReady = jest.fn<() => () => void>(() => () => {});
jest.unstable_mockModule('../../lib/focusPageHeading.js', () => ({
  focusPageHeading: jest.fn(),
  focusPageHeadingWhenReady: mockWhenReady,
}));

const mockFetchVendor = jest.fn<typeof VendorsApiTypes.fetchVendor>();
const mockUpdateVendor = jest.fn<typeof VendorsApiTypes.updateVendor>();
const mockDeleteVendor = jest.fn<typeof VendorsApiTypes.deleteVendor>();
jest.unstable_mockModule('../../lib/vendorsApi.js', () => ({
  fetchVendors: jest.fn(),
  searchCompanies: jest.fn(async () => []),
  fetchVendor: mockFetchVendor,
  createVendor: jest.fn(),
  updateVendor: mockUpdateVendor,
  deleteVendor: mockDeleteVendor,
}));

const mockFetchDeleteImpact = jest.fn<typeof DeleteImpactApiTypes.fetchDeleteImpact>();
jest.unstable_mockModule('../../lib/deleteImpactApi.js', () => ({
  fetchDeleteImpact: mockFetchDeleteImpact,
}));

const mockFetchAllInvoices = jest.fn<typeof InvoicesApiTypes.fetchAllInvoices>();
const mockDeleteInvoice = jest.fn<typeof InvoicesApiTypes.deleteInvoice>();
jest.unstable_mockModule('../../lib/invoicesApi.js', () => ({
  fetchAllInvoices: mockFetchAllInvoices,
  deleteInvoice: mockDeleteInvoice,
  createInvoice: jest.fn(),
}));

const mockFetchRelations = jest.fn<typeof RelationsApiTypes.fetchVendorRelations>();
jest.unstable_mockModule('../../lib/vendorRelationsApi.js', () => ({
  fetchVendorRelations: mockFetchRelations,
}));

const mockListDiary = jest.fn<typeof DiaryApiTypes.listDiaryEntries>();
jest.unstable_mockModule('../../lib/diaryApi.js', () => ({ listDiaryEntries: mockListDiary }));

const mockListHistory = jest.fn<typeof HistoryApiTypes.listHistory>();
jest.unstable_mockModule('../../lib/historyApi.js', () => ({ listHistory: mockListHistory }));

jest.unstable_mockModule('../../lib/vendorContactsApi.js', () => ({
  createVendorContact: jest.fn(),
  updateVendorContact: jest.fn(),
  deleteVendorContact: jest.fn(),
}));

jest.unstable_mockModule('../../lib/tradesApi.js', () => ({
  fetchTrades: jest.fn(async () => ({ trades: [] })),
  createTrade: jest.fn(),
  updateTrade: jest.fn(),
  deleteTrade: jest.fn(),
  mergeTrade: jest.fn(),
}));

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

let VendorDetailPage: React.ComponentType;
let media: MatchMediaControl;
const mockOpenForm = jest.fn<OpenInvoiceForm>();

// ─── Fixtures ────────────────────────────────────────────────────────────────

const AT = '2026-01-01T00:00:00.000Z';

const contact = (id: string, phone: string | null, name = `Person ${id}`): VendorContact => ({
  id,
  vendorId: 'v1',
  firstName: name,
  lastName: null,
  name,
  role: null,
  phone,
  email: null,
  notes: null,
  createdAt: AT,
  updatedAt: AT,
});

function vendor(over: Partial<VendorDetail> = {}): VendorDetail {
  return {
    id: 'v1',
    name: 'Smith Plumbing',
    trade: { id: 't-plumb', name: 'Plumbing', color: null, translationKey: null },
    phone: '+1 555-1234',
    email: 'smith@plumbing.example',
    address: '123 Main St',
    notes: 'Very reliable.',
    createdBy: { id: 'u1', displayName: 'Admin User', email: 'admin@example.com' },
    createdAt: AT,
    updatedAt: AT,
    invoiceCount: 3,
    stillToPay: 600,
    paid: 900,
    offers: { count: 2, amount: 5000, paid: 1200, stillToPay: 0, remainingOnOffer: 3800 },
    openTaskCount: 2,
    onSiteDays: 4,
    lastOnSite: '2026-03-05',
    contacts: [],
    ...over,
  } as VendorDetail;
}

const BARE = vendor({
  trade: null,
  phone: null,
  email: null,
  address: null,
  notes: null,
  createdBy: null,
  invoiceCount: 0,
  stillToPay: 0,
  paid: 0,
  offers: { count: 0, amount: 0, paid: 0, stillToPay: 0, remainingOnOffer: 0 },
  openTaskCount: 0,
  onSiteDays: 0,
  lastOnSite: null,
});

function invoice(id: string, status: InvoiceStatus, over: Record<string, unknown> = {}) {
  return {
    id,
    vendorId: 'v1',
    invoiceNumber: `R-${id}`,
    amount: 1000,
    date: '2026-02-01',
    dueDate: null,
    status,
    paid: 0,
    openAmount: 1000,
    remainingOnOffer: 500,
    deposits: [],
    ...over,
  } as unknown as InvoiceListRow;
}

const page = (rows: InvoiceListRow[]) => ({
  invoices: rows,
  pagination: { page: 1, pageSize: 100, totalItems: rows.length, totalPages: 1 },
  summary: {} as never,
});

const diaryEntry = (id: string) =>
  ({
    id,
    entryType: 'daily_log',
    entryDate: '2026-03-01',
    title: `Log ${id}`,
    body: 'On site',
    status: 'saved',
    isAutomatic: false,
    photoCount: 0,
    thumbnails: [],
    metadata: null,
    sourceEntityType: null,
    sourceEntityId: null,
  }) as unknown as DiaryEntrySummary;

function renderPage(
  options: {
    initial?: string;
    withOpener?: boolean;
    probe?: boolean;
    vendorPath?: string;
  } = {},
) {
  const tree = (
    <ToastProvider>
      <MemoryRouter initialEntries={[options.initial ?? '/companies/v1']}>
        {options.probe ? <OriginProbe /> : null}
        <Routes>
          <Route path={options.vendorPath ?? '/companies/:id'} element={<VendorDetailPage />} />
          <Route path="/companies" element={<div>Companies List Page</div>} />
          <Route path="/budget/invoices/:id" element={<div>Invoice Detail</div>} />
          <Route path="*" element={<div>Other</div>} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>
  );
  return render(
    options.withOpener === false ? (
      tree
    ) : (
      <InvoiceCreateContext value={mockOpenForm}>{tree}</InvoiceCreateContext>
    ),
  );
}

async function loaded(name = 'Smith Plumbing') {
  await screen.findByRole('heading', { level: 1, name });
}

const tab = (name: RegExp) => screen.getByRole('tab', { name });

beforeEach(async () => {
  if (!VendorDetailPage) {
    ({ default: VendorDetailPage } = await import('./VendorDetailPage.js'));
  }
  for (const mock of [
    mockFetchVendor,
    mockUpdateVendor,
    mockDeleteVendor,
    mockFetchDeleteImpact,
    mockFetchAllInvoices,
    mockDeleteInvoice,
    mockFetchRelations,
    mockListDiary,
    mockListHistory,
    mockOpenForm,
  ] as Array<jest.Mock>) {
    mock.mockReset();
  }
  mockFetchVendor.mockResolvedValue(vendor());
  mockFetchDeleteImpact.mockResolvedValue({ entityType: 'vendor', id: 'v1', effects: [] });
  mockFetchAllInvoices.mockResolvedValue(page([]) as never);
  mockFetchRelations.mockResolvedValue({ workItems: [], householdItems: [], budgetLines: [] });
  mockListDiary.mockResolvedValue({
    items: [],
    pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 },
  } as never);
  mockListHistory.mockResolvedValue({
    items: [],
    pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 },
    hiddenCount: 0,
    object: null,
  } as never);
  mockDeleteVendor.mockResolvedValue(undefined);
  mockDeleteInvoice.mockResolvedValue(undefined);
  media = installMatchMedia({ '(min-width: 768px)': true });
});

afterEach(() => media.restore());

// ─── States ──────────────────────────────────────────────────────────────────

describe('VendorDetailPage states', () => {
  it('shows a loading status and one screen-reader h1 "Company" while fetching', () => {
    mockFetchVendor.mockReturnValue(new Promise(() => {}));
    renderPage();

    expect(screen.getByRole('status', { name: 'Loading company' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Company' })).toBeInTheDocument();
  });

  it('redirects to the Companies list when the route has no id', async () => {
    renderPage({ initial: '/x', vendorPath: '/x' });

    expect(await screen.findByText('Companies List Page')).toBeInTheDocument();
    expect(mockFetchVendor).not.toHaveBeenCalled();
  });

  it('shows the not-found text for a 404, with Back to Companies and Try again', async () => {
    const user = userEvent.setup();
    mockFetchVendor.mockRejectedValue(
      new ApiClientError(404, { code: 'NOT_FOUND', message: 'Vendor not found' }),
    );
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This company does not exist or was deleted.',
    );
    mockFetchVendor.mockResolvedValue(vendor());
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await loaded();
  });

  it('shows the generic load error for a network failure and goes back to the list', async () => {
    const user = userEvent.setup();
    mockFetchVendor.mockRejectedValue(new Error('net'));
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This company could not be loaded. Try again.',
    );
    await user.click(screen.getByRole('button', { name: /Back to Companies/ }));

    expect(await screen.findByText('Companies List Page')).toBeInTheDocument();
  });
});

// ─── Header, strip ───────────────────────────────────────────────────────────

describe('VendorDetailPage header', () => {
  it('shows the company name as the one h1 and the Call primary with the company number', async () => {
    renderPage();
    await loaded();

    const call = screen.getByTestId('company-primary-call');
    expect(call).toHaveAttribute('href', 'tel:+15551234');
    expect(call).toHaveAccessibleName('Call Smith Plumbing on +1 555-1234');
    expect(call).toHaveTextContent('Call');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.queryByTestId('company-primary-add-phone')).toBeNull();
  });

  // Mutation: naming the company for a person's number would announce the wrong callee.
  it('falls back to the first contact person with a number and names that person', async () => {
    mockFetchVendor.mockResolvedValue(
      vendor({ phone: null, contacts: [contact('c1', null), contact('c2', '555-0199', 'Pat')] }),
    );
    renderPage();
    await loaded();

    const call = screen.getByTestId('company-primary-call');
    expect(call).toHaveAttribute('href', 'tel:5550199');
    expect(call).toHaveAccessibleName('Call Pat on 555-0199');
  });

  it('offers Add phone number without any number, which opens the Phone and e-mail card on focus', async () => {
    const user = userEvent.setup();
    mockFetchVendor.mockResolvedValue(BARE);
    renderPage();
    await loaded();
    expect(screen.queryByTestId('company-primary-call')).toBeNull();

    await user.click(screen.getByTestId('company-primary-add-phone'));

    expect(await screen.findByTestId('company-phone-email-form')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('company-field-phone')).toHaveFocus());
  });

  it('Add phone number from another tab selects Overview first, then opens the card', async () => {
    const user = userEvent.setup();
    mockFetchVendor.mockResolvedValue(BARE);
    renderPage({ initial: '/companies/v1?tab=work' });
    await loaded();
    expect(tab(/Work/)).toHaveAttribute('aria-selected', 'true');

    await user.click(screen.getByTestId('company-primary-add-phone'));

    expect(await screen.findByTestId('company-phone-email-form')).toBeInTheDocument();
    expect(tab(/Overview/)).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => expect(screen.getByTestId('company-field-phone')).toHaveFocus());
  });

  it('registers the company for the New menu', async () => {
    function PrefillProbe() {
      return <output data-testid="prefill">{JSON.stringify(useCreatePrefill())}</output>;
    }
    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/companies/v1']}>
          <CreateMenuProvider moneyPage={false} wide sheetOpen={false} onSheetOpenChange={() => {}}>
            <Routes>
              <Route path="/companies/:id" element={<VendorDetailPage />} />
            </Routes>
            <PrefillProbe />
          </CreateMenuProvider>
        </MemoryRouter>
      </ToastProvider>,
    );
    await loaded();

    await waitFor(() => expect(screen.getByTestId('prefill').textContent).toContain('v1'));
  });
});

describe('VendorDetailPage summary strip', () => {
  it('shows trade, still to pay, offers, tasks and on-site days', async () => {
    renderPage({ probe: true });
    await loaded();

    const strip = screen.getByTestId('company-summary');
    const fact = (id: string) => within(strip).getByTestId(`summary-fact-${id}`);
    expect(fact('trade')).toHaveTextContent('Plumbing');
    expect(fact('stillToPay')).toHaveTextContent('€600.00');
    expect(fact('offers')).toHaveTextContent('€5,000.00');
    expect(fact('offers')).toHaveTextContent('€1,200.00 paid');
    expect(fact('tasks')).toHaveTextContent('2 open');
    expect(fact('onSite')).toHaveTextContent('4 days');
    expect(fact('onSite')).toHaveTextContent('last');
  });

  it('marks Still to pay as the registry figure', async () => {
    renderPage();
    await loaded();

    expect(
      within(screen.getByTestId('company-summary'))
        .getByTestId('summary-fact-stillToPay')
        .querySelector('[data-figure="still-to-pay"], [data-figure]') ??
        screen.getByTestId('company-summary').querySelector('[data-figure="still-to-pay"]'),
    ).not.toBeNull();
  });

  it('links the trade to the filtered Companies list with the page as origin', async () => {
    const user = userEvent.setup();
    renderPage({ probe: true });
    await loaded();

    await user.click(
      within(screen.getByTestId('company-summary')).getByRole('link', { name: /Plumbing/ }),
    );

    expect(probedPath()).toBe('/companies');
    expect(screen.getByTestId('probe-search')).toHaveTextContent('tradeId=t-plumb');
    expect(probedOrigin()).toMatchObject({ to: '/companies/v1' });
  });

  it('shows empty values for a company without trade, offers, tasks and visits', async () => {
    mockFetchVendor.mockResolvedValue(BARE);
    renderPage();
    await loaded();

    const strip = screen.getByTestId('company-summary');
    expect(within(strip).getByTestId('summary-fact-offers')).toHaveTextContent('None');
    expect(within(strip).getByTestId('summary-fact-tasks')).toHaveTextContent('None open');
    expect(within(strip).getByTestId('summary-fact-onSite')).toHaveTextContent('None yet');
    expect(within(strip).getByTestId('summary-fact-stillToPay')).toHaveTextContent('€0.00');
    expect(within(strip).queryByRole('link', { name: /Plumbing/ })).toBeNull();
  });

  it('a fact selects its tab: Still to pay opens Payments, Tasks opens Work, On site opens Site diary', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();

    await user.click(screen.getByTestId('summary-fact-stillToPay'));
    await waitFor(() => expect(tab(/Payments/)).toHaveAttribute('aria-selected', 'true'));
    await user.click(screen.getByTestId('summary-fact-tasks'));
    await waitFor(() => expect(tab(/Work/)).toHaveAttribute('aria-selected', 'true'));
    await user.click(screen.getByTestId('summary-fact-onSite'));
    await waitFor(() => expect(tab(/Site diary/)).toHaveAttribute('aria-selected', 'true'));
  });
});

// ─── Tabs ────────────────────────────────────────────────────────────────────

describe('VendorDetailPage tabs', () => {
  it('shows Overview first with contact persons and the three cards, and loads nothing for the other tabs', async () => {
    mockFetchVendor.mockResolvedValue(vendor({ contacts: [contact('c1', '555-0100', 'Pat')] }));
    renderPage();
    await loaded();

    expect(screen.getByTestId('company-contacts')).toBeInTheDocument();
    expect(screen.getByTestId('company-contacts-row-c1')).toHaveTextContent('Pat');
    for (const id of ['company-phone-email', 'company-address', 'company-about']) {
      expect(screen.getByTestId(id)).toBeInTheDocument();
    }
    expect(mockFetchAllInvoices).not.toHaveBeenCalled();
    expect(mockFetchRelations).not.toHaveBeenCalled();
    expect(mockListHistory).not.toHaveBeenCalled();
  });

  it('counts Payments from the record and Site diary from the diary query loaded at mount', async () => {
    mockListDiary.mockResolvedValue({
      items: [diaryEntry('e1')],
      pagination: { page: 1, pageSize: 20, totalItems: 7, totalPages: 1 },
    } as never);
    renderPage();
    await loaded();

    expect(tab(/Payments/)).toHaveTextContent('3');
    await waitFor(() => expect(tab(/Site diary/)).toHaveTextContent('7'));
    expect(mockListDiary).toHaveBeenCalledWith(
      expect.objectContaining({ vendorId: 'v1', automatic: false, status: 'saved' }),
    );
  });

  // D-07 is pinned in plan/restructure/defects.json: invoice status Badges on the Payments rows.
  it('D-07: the Payments tab shows each invoice with its status Badge, the totals and the figure markers', async () => {
    const user = userEvent.setup();
    mockFetchAllInvoices.mockResolvedValue(
      page([invoice('p', 'pending'), invoice('c', 'claimed'), invoice('d', 'paid')]) as never,
    );
    renderPage();
    await loaded();

    await user.click(tab(/Payments/));

    const list = await screen.findByTestId('company-invoices');
    expect(within(list).getByText('To pay')).toBeInTheDocument();
    expect(within(list).getByText('Submitted')).toBeInTheDocument();
    expect(within(list).getByText('Paid')).toBeInTheDocument();
    expect(screen.getByTestId('company-payments-totals')).toHaveTextContent(
      'Paid €900.00 · Still to pay €600.00',
    );
    expect(screen.getByTestId('company-paid-figure')).toHaveAttribute('data-figure', 'paid');
    expect(screen.getByTestId('company-still-to-pay-figure')).toHaveAttribute(
      'data-figure',
      'still-to-pay',
    );
    expect(mockFetchAllInvoices).toHaveBeenCalledWith(
      expect.objectContaining({ vendorId: 'v1', pageSize: 100, page: 1 }),
    );
  });

  it('opens the Payments tab straight from ?tab=payments', async () => {
    mockFetchAllInvoices.mockResolvedValue(page([invoice('p', 'pending')]) as never);
    renderPage({ initial: '/companies/v1?tab=payments' });
    await loaded();

    expect(await screen.findByTestId('company-invoices-row-p')).toBeInTheDocument();
    expect(tab(/Payments/)).toHaveAttribute('aria-selected', 'true');
  });

  it('shows the Work tab lists from the relations endpoint', async () => {
    const user = userEvent.setup();
    mockFetchRelations.mockResolvedValue({
      workItems: [
        { id: 'w1', title: 'Screed', status: 'in_progress', startDate: null, endDate: null },
      ],
      householdItems: [],
      budgetLines: [],
    });
    renderPage();
    await loaded();

    await user.click(tab(/Work/));

    expect(await screen.findByTestId('company-tasks-row-w1')).toHaveTextContent('Screed');
    expect(mockFetchRelations).toHaveBeenCalledWith('v1');
  });

  it('shows the Site diary tab entries', async () => {
    const user = userEvent.setup();
    mockListDiary.mockResolvedValue({
      items: [diaryEntry('e1')],
      pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
    } as never);
    renderPage();
    await loaded();

    await user.click(tab(/Site diary/));

    expect(await screen.findByTestId('company-diary')).toHaveTextContent('Log e1');
    expect(screen.queryByTestId('company-diary-show-all')).toBeNull();
  });

  it('shows the History tab for the company', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();

    await user.click(tab(/History/));

    expect(
      await screen.findByText("Nothing has happened to this company's offers and invoices yet."),
    ).toBeInTheDocument();
    expect(mockListHistory).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'vendor', entityId: 'v1' }),
      expect.anything(),
    );
  });
});

// ─── Refresh ─────────────────────────────────────────────────────────────────

describe('VendorDetailPage refresh', () => {
  it('saving a card refreshes the record (revision) and the Payments rows reload with it', async () => {
    const user = userEvent.setup();
    mockUpdateVendor.mockResolvedValue(vendor());
    mockFetchAllInvoices.mockResolvedValue(page([invoice('p', 'pending')]) as never);
    renderPage({ initial: '/companies/v1?tab=payments' });
    await loaded();
    await screen.findByTestId('company-invoices-row-p');
    const invoiceCalls = mockFetchAllInvoices.mock.calls.length;

    await user.click(tab(/Overview/));
    await user.click(screen.getByTestId('company-address-edit'));
    await user.type(screen.getByTestId('company-field-address'), 'x');
    await user.click(screen.getByTestId('company-address-save'));

    await waitFor(() => expect(mockFetchVendor).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(mockFetchAllInvoices.mock.calls.length).toBeGreaterThan(invoiceCalls),
    );
    expect(mockUpdateVendor).toHaveBeenCalledWith('v1', { address: '123 Main Stx' });
  });

  it.each(['invoice', 'offer'])(
    'an %s created from the dialog refreshes the page record',
    async (kind) => {
      renderPage();
      await loaded();
      expect(mockFetchVendor).toHaveBeenCalledTimes(1);

      act(() => notifyObjectCreated(kind));

      await waitFor(() => expect(mockFetchVendor).toHaveBeenCalledTimes(2));
    },
  );

  it('ignores the creation of another kind of object', async () => {
    renderPage();
    await loaded();

    act(() => notifyObjectCreated('task'));

    expect(mockFetchVendor).toHaveBeenCalledTimes(1);
  });
});

// ─── Delete ──────────────────────────────────────────────────────────────────

describe('VendorDetailPage delete', () => {
  async function openDelete(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByTestId('object-header-menu'));
    await user.click(await screen.findByTestId('object-header-delete'));
    await screen.findByRole('alertdialog');
  }
  const confirm = async (user: ReturnType<typeof userEvent.setup>) => {
    const button = await screen.findByTestId('vendor-delete-confirm');
    await waitFor(() => expect(button).not.toHaveAttribute('aria-disabled'));
    await user.click(button);
  };

  it('asks first, naming the company, and loads what else the delete affects', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();

    await openDelete(user);

    expect(screen.getByRole('alertdialog')).toHaveTextContent('Delete Smith Plumbing?');
    expect(mockFetchDeleteImpact).toHaveBeenCalledWith('vendor', 'v1');
    expect(mockDeleteVendor).not.toHaveBeenCalled();
  });

  it('deletes, replaces the page with the Companies list and hands focus to the heading', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await openDelete(user);

    await confirm(user);

    expect(await screen.findByText('Companies List Page')).toBeInTheDocument();
    expect(mockDeleteVendor).toHaveBeenCalledWith('v1');
    expect(mockWhenReady).toHaveBeenCalled();
  });

  it('Cancel closes the dialog and returns focus to the heading', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await openDelete(user);

    await user.click(screen.getByTestId('vendor-delete-cancel'));

    expect(screen.queryByRole('alertdialog')).toBeNull();
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1, name: 'Smith Plumbing' })).toHaveFocus(),
    );
  });

  it('a 409 shows the blocked text and removes the confirm action', async () => {
    const user = userEvent.setup();
    mockDeleteVendor.mockRejectedValue(
      new ApiClientError(409, { code: 'VENDOR_IN_USE', message: 'in use' }),
    );
    renderPage();
    await loaded();
    await openDelete(user);

    await confirm(user);

    await waitFor(() => expect(screen.queryByTestId('vendor-delete-confirm')).toBeNull());
    expect(screen.getByRole('alertdialog')).toHaveTextContent(/./);
    expect(screen.queryByText('Companies List Page')).toBeNull();
  });

  it('another API error shows its translated text and keeps the confirm action', async () => {
    const user = userEvent.setup();
    mockDeleteVendor.mockRejectedValue(
      new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'x' }),
    );
    renderPage();
    await loaded();
    await openDelete(user);

    await confirm(user);

    await waitFor(() => expect(screen.getByRole('alertdialog')).toHaveTextContent(/./));
    expect(screen.getByTestId('vendor-delete-confirm')).toBeInTheDocument();
    expect(screen.queryByText('Companies List Page')).toBeNull();
  });

  it('a non-API failure shows the generic delete error', async () => {
    const user = userEvent.setup();
    mockDeleteVendor.mockRejectedValue(new Error('net'));
    renderPage();
    await loaded();
    await openDelete(user);

    await confirm(user);

    expect(
      await screen.findByText('The company could not be deleted. Try again.'),
    ).toBeInTheDocument();
  });

  it('ignores Cancel while the delete is running', async () => {
    const user = userEvent.setup();
    let finish!: () => void;
    mockDeleteVendor.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    renderPage();
    await loaded();
    await openDelete(user);
    await confirm(user);

    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });

    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    finish();
    expect(await screen.findByText('Companies List Page')).toBeInTheDocument();
  });
});
