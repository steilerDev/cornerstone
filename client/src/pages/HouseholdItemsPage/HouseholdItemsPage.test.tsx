/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { HOUSEHOLD_ITEM_STATUSES } from '@cornerstone/shared';
import { ToastProvider } from '../../components/Toast/ToastContext.js';
import { ShortcutRegistryProvider } from '../../hooks/shortcutRegistry.js';
import { ApiClientError, NetworkError } from '../../lib/apiClient.js';
import { notifyObjectCreated } from '../../lib/objectCreatedEvents.js';
import { makeSearchCompanies } from '../../test/companySearchMock.js';
import { findDuplicateTestIds } from '../../test/findDuplicateTestIds.js';
import {
  APPLIANCES,
  FURNITURE,
  makePurchaseResponse,
  makePurchaseRow,
} from '../../test/purchaseListFixtures.js';
import enCommon from '../../i18n/en/common.json';
import type * as HouseholdItemsApiTypes from '../../lib/householdItemsApi.js';
import type * as CategoriesApiTypes from '../../lib/householdItemCategoriesApi.js';
import type * as VendorsApiTypes from '../../lib/vendorsApi.js';
import type * as DeleteImpactApiTypes from '../../lib/deleteImpactApi.js';
import type * as PageModule from './HouseholdItemsPage.js';

const mockListRows = jest.fn<typeof HouseholdItemsApiTypes.listHouseholdItemRows>();
const mockDelete = jest.fn<typeof HouseholdItemsApiTypes.deleteHouseholdItem>();
const mockFetchCategories = jest.fn<typeof CategoriesApiTypes.fetchHouseholdItemCategories>();
const mockFetchVendors = jest.fn<typeof VendorsApiTypes.fetchVendors>();
const mockFetchVendor = jest.fn<typeof VendorsApiTypes.fetchVendor>();
const mockFetchDeleteImpact = jest.fn<typeof DeleteImpactApiTypes.fetchDeleteImpact>();

jest.unstable_mockModule('../../lib/householdItemsApi.js', () => ({
  listHouseholdItemRows: mockListRows,
  listHouseholdItems: jest.fn(),
  getHouseholdItem: jest.fn(),
  createHouseholdItem: jest.fn(),
  updateHouseholdItem: jest.fn(),
  deleteHouseholdItem: mockDelete,
}));
jest.unstable_mockModule('../../lib/householdItemCategoriesApi.js', () => ({
  fetchHouseholdItemCategories: mockFetchCategories,
}));
jest.unstable_mockModule('../../lib/vendorsApi.js', () => ({
  fetchVendors: mockFetchVendors,
  searchCompanies: makeSearchCompanies(mockFetchVendors),
  fetchVendor: mockFetchVendor,
  createVendor: jest.fn(),
  updateVendor: jest.fn(),
  deleteVendor: jest.fn(),
}));
jest.unstable_mockModule('../../lib/deleteImpactApi.js', () => ({
  fetchDeleteImpact: mockFetchDeleteImpact,
}));
jest.unstable_mockModule('../../hooks/useAreas.js', () => ({
  useAreas: () => ({
    areas: [],
    isLoading: false,
    error: null,
    refetch: jest.fn(),
    createArea: jest.fn(),
    updateArea: jest.fn(),
    deleteArea: jest.fn(),
  }),
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

let HouseholdItemsPage: typeof PageModule.HouseholdItemsPage;

const KITCHEN = {
  id: 'area-kitchen',
  name: 'Kitchen',
  color: null,
  ancestors: [{ id: 'area-gf', name: 'Ground Floor', color: null }],
};
const planned = (over = {}) =>
  makePurchaseRow({ id: 'hi-sofa', name: 'Living room sofa', ...over });
const SOFA = planned({
  area: KITCHEN,
  expectedCost: 1200,
  targetDeliveryDate: '2026-05-01',
  vendor: { id: 'v-1', name: 'Example Carpentry Co' } as never,
  category: 'hic-furniture',
});
const OVEN = makePurchaseRow({
  id: 'hi-oven',
  name: 'Built-in oven',
  status: 'purchased',
  category: 'hic-appliances',
  expectedCost: 800,
});
const LAMP = makePurchaseRow({
  id: 'hi-lamp',
  name: 'Hall lamp',
  status: 'arrived',
  actualDeliveryDate: '2026-04-02',
});
const ALL = [SOFA, OVEN, LAMP];
const TOTALS = { expectedCost: 2000, invoiced: 450, paid: 300 };

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

function renderPage(url = '/project/household-items') {
  return render(
    <ToastProvider>
      <ShortcutRegistryProvider>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/project/household-items" element={<HouseholdItemsPage />} />
            <Route path="*" element={<div>Elsewhere</div>} />
          </Routes>
          <LocationProbe />
        </MemoryRouter>
      </ShortcutRegistryProvider>
    </ToastProvider>,
  );
}

async function loaded() {
  await waitFor(() => expect(screen.queryByLabelText('Loading the list')).not.toBeInTheDocument());
}

const heading = () => screen.getByRole('heading', { level: 1 });
const location = () => screen.getByTestId('location').textContent;
const footer = () => screen.queryByTestId('purchases-footer');

beforeEach(async () => {
  if (!HouseholdItemsPage) ({ HouseholdItemsPage } = await import('./HouseholdItemsPage.js'));
  window.sessionStorage.clear();
  window.localStorage.clear();
  mockListRows.mockReset();
  mockListRows.mockResolvedValue(makePurchaseResponse(ALL, { totals: TOTALS }));
  mockDelete.mockReset();
  mockFetchCategories.mockReset();
  mockFetchCategories.mockResolvedValue({ categories: [FURNITURE, APPLIANCES] });
  mockFetchVendors.mockReset();
  mockFetchVendors.mockResolvedValue({
    vendors: [],
    pagination: { page: 1, pageSize: 50, totalItems: 0, totalPages: 0 },
  });
  mockFetchVendor.mockReset();
  mockFetchVendor.mockRejectedValue(new ApiClientError(404, { code: 'NOT_FOUND', message: 'x' }));
  mockFetchDeleteImpact.mockReset();
  mockFetchDeleteImpact.mockResolvedValue({
    entityType: 'household_item',
    id: 'hi-1',
    effects: [],
  });
});

describe('states', () => {
  it('shows the skeleton, then the rows', async () => {
    renderPage();
    expect(screen.getByLabelText('Loading the list')).toBeInTheDocument();
    await loaded();
    expect(screen.getByTestId('purchases-row-hi-oven')).toBeInTheDocument();
  });

  it('shows the load failure with Retry', async () => {
    mockListRows.mockRejectedValueOnce(new Error('boom'));
    renderPage();
    expect(await screen.findByText('The purchases could not be loaded.')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('purchases-retry'));
    await loaded();
    expect(screen.getByTestId('purchases-row-hi-sofa')).toBeInTheDocument();
  });

  it('shows the empty state and no footer', async () => {
    mockListRows.mockResolvedValue(makePurchaseResponse([]));
    renderPage();
    expect(await screen.findByText('No purchases yet')).toBeInTheDocument();
    expect(footer()).toBeNull();
  });

  it('shows the no-match state when a search finds nothing', async () => {
    mockListRows.mockResolvedValue(makePurchaseResponse([], { scopeTotal: 3 }));
    renderPage('/project/household-items?q=zzz');
    expect(await screen.findByText('No purchases match.')).toBeInTheDocument();
    expect(footer()).toBeNull();
  });
});

describe('heading, chips and legacy URLs', () => {
  it('always shows the purchase count', async () => {
    renderPage();
    await loaded();
    expect(heading()).toHaveTextContent('Purchases (3)');
  });

  it('a search shows "(n of m)" with the scope total', async () => {
    mockListRows.mockResolvedValue(makePurchaseResponse([SOFA], { scopeTotal: 9 }));
    renderPage('/project/household-items?q=sofa');
    await loaded();
    expect(heading()).toHaveTextContent('Purchases (1 of 9)');
  });

  it('offers a chip per status and sends the chip, sort and filters of the URL', async () => {
    renderPage(
      '/project/household-items?status=arrived&sortBy=expected_cost&sortOrder=desc&category=hic-furniture',
    );
    await loaded();
    for (const status of HOUSEHOLD_ITEM_STATUSES) {
      expect(screen.getByTestId(`purchases-chip-${status}`)).toHaveTextContent(
        enCommon.statusVocabulary.purchase[status],
      );
    }
    expect(mockListRows.mock.calls[0]![0]).toMatchObject({
      status: 'arrived',
      sortBy: 'expected_cost',
      sortOrder: 'desc',
      category: 'hic-furniture',
      group: 'status',
      page: 1,
      pageSize: 100,
    });
  });

  it('absorbs an old ?page=2&pageSize=10 URL and a comma-separated status without an error', async () => {
    renderPage('/project/household-items?page=2&pageSize=10&status=planned,arrived');
    await loaded();

    expect(mockListRows.mock.calls[0]![0]).toMatchObject({ page: 1, pageSize: 100 });
    expect(mockListRows.mock.calls[0]![0]).not.toHaveProperty('status');
    expect(location()).not.toContain('page=');
    expect(location()).not.toContain('status=');
    expect(screen.getByTestId('purchases-row-hi-oven')).toBeInTheDocument();
  });

  it('a legacy comma-separated category is sent as its first id', async () => {
    renderPage('/project/household-items?category=hic-appliances,hic-furniture');
    await loaded();

    expect(mockListRows.mock.calls[0]![0]).toMatchObject({ category: 'hic-appliances' });
  });
});

describe('groups', () => {
  it('groups by status in status order with counts, and Delivered starts collapsed', async () => {
    renderPage();
    await loaded();
    const toggles = screen
      .getAllByTestId(/^purchases-group-toggle-(?!mobile)/)
      .map((el) => el.getAttribute('data-testid'));
    expect(toggles).toEqual([
      'purchases-group-toggle-planned',
      'purchases-group-toggle-purchased',
      'purchases-group-toggle-arrived',
    ]);
    const planned = screen.getByTestId('purchases-group-toggle-planned');
    expect(planned).toHaveTextContent('Planned');
    expect(planned).toHaveTextContent('(1)');
    expect(planned.querySelector('[class*="badge"]')).toBeNull();
    const delivered = screen.getByTestId('purchases-group-toggle-arrived');
    expect(delivered).toHaveTextContent('Delivered');
    expect(delivered).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(delivered);
    expect(delivered).toHaveAttribute('aria-expanded', 'true');
  });

  it('Delivered is open when it is the only group', async () => {
    mockListRows.mockResolvedValue(makePurchaseResponse([LAMP]));
    renderPage();
    await loaded();

    expect(screen.getByTestId('purchases-group-toggle-arrived')).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('groups by area with No area last, and by company with No company last', async () => {
    renderPage('/project/household-items?group=area');
    await loaded();
    const toggles = screen
      .getAllByTestId(/^purchases-group-toggle-(?!mobile)/)
      .map((el) => el.getAttribute('data-testid'));
    expect(toggles).toEqual([
      'purchases-group-toggle-area-kitchen',
      'purchases-group-toggle-__none__',
    ]);
    expect(screen.getByTestId('purchases-group-toggle-area-kitchen')).toHaveTextContent(
      'Ground Floor › Kitchen',
    );
  });

  it('groups by company', async () => {
    renderPage('/project/household-items?group=company');
    await loaded();

    expect(screen.getByTestId('purchases-group-toggle-v-1')).toHaveTextContent(
      'Example Carpentry Co',
    );
    expect(screen.getByTestId('purchases-group-toggle-__none__')).toHaveTextContent('No company');
  });
});

describe('rows', () => {
  it('shows the title link, area, company, delivery and expected cost', async () => {
    renderPage();
    await loaded();
    const row = screen.getByTestId('purchases-row-hi-sofa');

    expect(within(row).getByTestId('purchases-title-hi-sofa')).toHaveAttribute(
      'href',
      '/project/household-items/hi-sofa',
    );
    expect(within(row).getByTestId('purchases-area-hi-sofa')).toHaveTextContent(
      'Ground Floor › Kitchen',
    );
    expect(within(row).getByTestId('purchases-company-hi-sofa')).toHaveTextContent(
      'Example Carpentry Co',
    );
    expect(row).toHaveTextContent('€1,200.00');
    expect(row).toHaveTextContent(/Target.*May 1, 2026/);
  });

  it('has no duplicate test ids with the menus open', async () => {
    const { container } = renderPage();
    await loaded();
    await userEvent.click(screen.getByTestId('purchases-row-menu-hi-oven'));
    expect(findDuplicateTestIds(container)).toEqual([]);
  });

  // D-08 (#2195): the status badge carries the shared Badge class for its status, never a dead
  // badge-<status> class, and the canonical purchase word.
  it.each(HOUSEHOLD_ITEM_STATUSES)(
    'renders the %s status badge with the shared Badge class and canonical word (D-08)',
    async (status) => {
      mockListRows.mockResolvedValueOnce(
        makePurchaseResponse([makePurchaseRow({ id: 'hi-1', name: 'Sample Sofa', status })]),
      );
      renderPage();
      await loaded();
      const badge = screen.getByTestId('purchases-status-hi-1');

      expect(badge).toHaveTextContent(enCommon.statusVocabulary.purchase[status]);
      expect(badge.className).toContain(status);
      expect(badge.className).not.toContain('badge-');
    },
  );
});

describe('totals footer', () => {
  it('shows Expected cost, Invoiced and Paid from the server totals', async () => {
    renderPage();
    await loaded();

    expect(footer()).toHaveAttribute('aria-label', 'Totals');
    expect(screen.getByTestId('purchases-footer-expected')).toHaveTextContent('€2,000.00');
    expect(screen.getByTestId('purchases-footer-invoiced')).toHaveTextContent('€450.00');
    expect(screen.getByTestId('purchases-footer-paid')).toHaveTextContent('€300.00');
    expect(footer()).toHaveTextContent('Expected cost');
  });

  it('says "Totals (filtered)" when a search narrows the list', async () => {
    renderPage('/project/household-items?q=sofa');
    await loaded();

    expect(footer()).toHaveAttribute('aria-label', 'Totals (filtered)');
  });

  it('says "Totals (filtered)" when a status chip narrows the list', async () => {
    renderPage('/project/household-items?status=arrived');
    await loaded();

    expect(footer()).toHaveAttribute('aria-label', 'Totals (filtered)');
  });

  it('says "Totals (filtered)" when a filter is active', async () => {
    renderPage('/project/household-items?category=hic-furniture');
    await loaded();

    expect(footer()).toHaveAttribute('aria-label', 'Totals (filtered)');
  });

  it('has no figure markers on the footer numbers', async () => {
    renderPage();
    await loaded();

    expect(footer()!.querySelector('[data-figure]')).toBeNull();
  });
});

describe('delete', () => {
  async function openDelete(id = 'hi-oven') {
    await userEvent.click(screen.getByTestId(`purchases-row-menu-${id}`));
    await userEvent.click(await screen.findByTestId(`purchases-delete-${id}`));
    return screen.findByRole('alertdialog');
  }

  it('confirms, deletes, refreshes the list and the footer, and puts focus on the heading', async () => {
    mockDelete.mockResolvedValue(undefined as never);
    renderPage();
    await loaded();
    const dialog = await openDelete();
    expect(dialog).toHaveTextContent('Built-in oven');
    mockListRows.mockResolvedValue(
      makePurchaseResponse([SOFA, LAMP], { totals: { expectedCost: 1200, invoiced: 0, paid: 0 } }),
    );

    await userEvent.click(within(dialog).getByRole('button', { name: /^delete$/i }));

    await waitFor(() => expect(screen.queryByTestId('purchases-row-hi-oven')).toBeNull());
    expect(mockDelete).toHaveBeenCalledWith('hi-oven');
    expect(screen.getByTestId('purchases-footer-expected')).toHaveTextContent('€1,200.00');
    await waitFor(() => expect(heading()).toHaveFocus());
  });

  it('keeps the dialog in its blocked state on a 409', async () => {
    mockDelete.mockRejectedValue(new ApiClientError(409, { code: 'CONFLICT', message: 'x' }));
    renderPage();
    await loaded();
    const dialog = await openDelete();

    await userEvent.click(within(dialog).getByRole('button', { name: /^delete$/i }));

    await waitFor(() => expect(within(dialog).getByRole('alert')).toBeInTheDocument());
    expect(screen.getByTestId('purchases-row-hi-oven')).toBeInTheDocument();
  });

  it('shows a network error in the dialog and keeps it open', async () => {
    mockDelete.mockRejectedValue(new NetworkError('offline', null));
    renderPage();
    await loaded();
    const dialog = await openDelete();

    await userEvent.click(within(dialog).getByRole('button', { name: /^delete$/i }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      "Can't reach the server. Check your connection and try again.",
    );
  });

  it('cancel closes the dialog without deleting and puts focus on the heading', async () => {
    renderPage();
    await loaded();
    const dialog = await openDelete();

    await userEvent.click(within(dialog).getByRole('button', { name: /cancel/i }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(mockDelete).not.toHaveBeenCalled();
    await waitFor(() => expect(heading()).toHaveFocus());
  });

  it('cancel is ignored while the delete is running', async () => {
    let finish: () => void = () => undefined;
    mockDelete.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    renderPage();
    await loaded();
    const dialog = await openDelete();

    await userEvent.click(within(dialog).getByRole('button', { name: /^delete$|deleting/i }));
    fireEvent.keyDown(dialog, { key: 'Escape' });

    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    await act(async () => finish());
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });
});

describe('shortcut and create', () => {
  it('the New purchase button opens the create dialog route', async () => {
    renderPage();
    await loaded();
    await userEvent.click(screen.getByTestId('new-household-item-button'));
    expect(location()).toContain('/project/household-items/new');
  });

  it('the n shortcut does the same', async () => {
    renderPage();
    await loaded();
    await userEvent.keyboard('n');
    expect(location()).toContain('/project/household-items/new');
  });

  it('reloads when a purchase is created elsewhere', async () => {
    renderPage();
    await loaded();
    mockListRows.mockClear();
    act(() => notifyObjectCreated('purchase'));
    await waitFor(() => expect(mockListRows).toHaveBeenCalled());
  });
});

describe('filters', () => {
  it('opens the Filters panel with Category, Area, Company, the date ranges and the amounts', async () => {
    renderPage();
    await loaded();
    fireEvent.click(screen.getByTestId('purchases-filters-button'));

    expect(await screen.findByTestId('purchases-filter-category')).toBeInTheDocument();
    expect(screen.getByTestId('purchases-filter-targetDelivery-from')).toBeInTheDocument();
    expect(screen.getByTestId('purchases-filter-actualDelivery-from')).toBeInTheDocument();
    expect(screen.getByTestId('purchases-filter-plannedCost-min')).toBeInTheDocument();
    expect(screen.getByTestId('purchases-filter-actualCost-min')).toBeInTheDocument();
    expect(screen.getByTestId('purchases-filter-grants-min')).toBeInTheDocument();
    expect(screen.getByTestId('purchases-filter-afterGrants-min')).toBeInTheDocument();
    expect(screen.getByTestId('purchases-filter-budgetLines-min')).toBeInTheDocument();
  });
});
