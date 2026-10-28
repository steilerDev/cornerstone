/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { act, renderHook, waitFor } from '@testing-library/react';
import { makeSearchCompanies } from '../../test/companySearchMock.js';
import {
  APPLIANCES,
  FURNITURE,
  makePurchaseResponse,
  makePurchaseRow,
} from '../../test/purchaseListFixtures.js';
import type * as HouseholdItemsApiTypes from '../../lib/householdItemsApi.js';
import type * as VendorsApiTypes from '../../lib/vendorsApi.js';
import type * as ListModule from './usePurchasesList.js';

const mockListRows = jest.fn<typeof HouseholdItemsApiTypes.listHouseholdItemRows>();
const mockFetchVendors = jest.fn<typeof VendorsApiTypes.fetchVendors>();

jest.unstable_mockModule('../../lib/householdItemsApi.js', () => ({
  listHouseholdItemRows: mockListRows,
  listHouseholdItems: jest.fn(),
  deleteHouseholdItem: jest.fn(),
}));
jest.unstable_mockModule('../../lib/vendorsApi.js', () => ({
  fetchVendors: mockFetchVendors,
  searchCompanies: makeSearchCompanies(mockFetchVendors),
  fetchVendor: jest.fn(),
}));
jest.unstable_mockModule('../../hooks/useAreas.js', () => ({
  useAreas: () => ({ areas: [], isLoading: false, error: null, refetch: jest.fn() }),
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

let usePurchasesList: typeof ListModule.usePurchasesList;

const A = makePurchaseRow({ id: 'hi-a', name: 'Sofa', status: 'planned' });
const B = makePurchaseRow({ id: 'hi-b', name: 'Oven', status: 'purchased' });
const C = makePurchaseRow({ id: 'hi-c', name: 'Lamp', status: 'arrived' });

const categories = { categories: [FURNITURE, APPLIANCES], failure: null };

function setup(url = '/project/household-items') {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>
  );
  return renderHook(() => usePurchasesList(categories), { wrapper });
}

async function loaded(result: { current: ListModule.UsePurchasesListResult }) {
  await waitFor(() => expect(result.current.list.totalItems).not.toBeNull());
}

beforeEach(async () => {
  if (!usePurchasesList) ({ usePurchasesList } = await import('./usePurchasesList.js'));
  mockListRows.mockReset();
  mockListRows.mockResolvedValue(
    makePurchaseResponse([A, B, C], {
      scopeTotal: 9,
      totals: { expectedCost: 900, invoiced: 400, paid: 100 },
    }),
  );
  mockFetchVendors.mockReset();
  mockFetchVendors.mockResolvedValue({
    vendors: [],
    pagination: { page: 1, pageSize: 50, totalItems: 0, totalPages: 0 },
  });
});

describe('fetchPage mapping', () => {
  it('requests the rows with the status grouping, page and pageSize, and maps the response', async () => {
    const { result } = setup();
    await loaded(result);

    expect(mockListRows.mock.calls[0]![0]).toEqual({
      sortBy: 'name',
      sortOrder: 'asc',
      group: 'status',
      page: 1,
      pageSize: 100,
    });
    expect(result.current.list.items.map((r) => r.id)).toEqual(['hi-a', 'hi-b', 'hi-c']);
    expect(result.current.list.totalItems).toBe(3);
    expect(result.current.list.groupCounts).toEqual({
      planned: 1,
      purchased: 1,
      scheduled: 0,
      arrived: 1,
    });
    expect(result.current.list.meta).toEqual({
      scopeTotal: 9,
      totals: { expectedCost: 900, invoiced: 400, paid: 100 },
    });
    expect(result.current.scopeTotal).toBe(9);
  });

  it('keys rows by id, so one row can be updated in place', async () => {
    const { result } = setup();
    await loaded(result);

    act(() => result.current.list.updateItem('hi-b', (row) => ({ ...row, name: 'Renamed oven' })));

    expect(result.current.list.items.map((r) => r.name)).toEqual(['Sofa', 'Renamed oven', 'Lamp']);
  });

  it('has no scope total before the first batch', () => {
    mockListRows.mockReturnValue(new Promise(() => undefined));
    const { result } = setup();

    expect(result.current.scopeTotal).toBeNull();
  });

  it('sends no group for a client-side grouping, and the chip, search, sort and filters of the URL', async () => {
    const { result } = setup(
      '/project/household-items?group=area&status=arrived&q=sofa&sortBy=expected_cost&sortOrder=desc&category=hic-furniture',
    );
    await loaded(result);

    const sent = mockListRows.mock.calls[0]![0]!;
    expect(sent).not.toHaveProperty('group');
    expect(sent).toMatchObject({
      status: 'arrived',
      q: 'sofa',
      sortBy: 'expected_cost',
      sortOrder: 'desc',
      category: 'hic-furniture',
    });
  });

  it('drops old page / pageSize URLs and a comma-separated status without an error', async () => {
    const { result } = setup(
      '/project/household-items?page=2&pageSize=10&status=planned,purchased',
    );
    await loaded(result);

    const sent = mockListRows.mock.calls[0]![0]!;
    expect(sent).toMatchObject({ page: 1, pageSize: 100 });
    expect(sent).not.toHaveProperty('status');
    expect(result.current.list.status).not.toBe('error');
  });
});

describe('config and labels', () => {
  it('defines the status chips, the three groupings, sorts and the legacy column keys', async () => {
    const { result } = setup();
    await loaded(result);
    const { config } = result.current;

    expect(config.listKey).toBe('householdItems');
    expect(config.testIdPrefix).toBe('purchases');
    expect(config.chips!.options.map((o) => [o.value, o.label])).toEqual([
      ['planned', 'Planned'],
      ['purchased', 'Ordered'],
      ['scheduled', 'Delivery scheduled'],
      ['arrived', 'Delivered'],
    ]);
    expect(config.groupBy!.defaultValue).toBe('status');
    expect(config.groupBy!.options.map((o) => o.value)).toEqual(['status', 'area', 'company']);
    expect(config.sort.options.map((o) => o.value)).toEqual([
      'name',
      'status',
      'category',
      'delivery',
      'target_delivery_date',
      'actual_delivery_date',
      'order_date',
      'expected_cost',
      'invoiced',
    ]);
    expect(config.sort.defaultValue).toBe('name');
    expect(config.sort.defaultOrder).toBe('asc');
    expect(config.legacyColumnKeys).toMatchObject({ vendor: 'company', actualCost: null });
    expect(config.filters!.map((f) => f.param)).toEqual([
      'category',
      'areaId',
      'vendorId',
      'targetDelivery',
      'actualDelivery',
      'plannedCost',
      'actualCost',
      'grants',
      'afterGrants',
      'budgetLines',
    ]);
  });

  it('status groups are server-ordered, show the word only, and Delivered is done', async () => {
    const { result } = setup();
    await loaded(result);
    const status = result.current.config.groupBy!.options[0]!;

    expect(status.server).toBe(true);
    expect(status.order).toEqual(['planned', 'purchased', 'scheduled', 'arrived']);
    expect(status.groupOf(A)).toEqual({ key: 'planned', label: 'Planned', done: false });
    expect(status.groupOf(C)).toEqual({ key: 'arrived', label: 'Delivered', done: true });
  });

  it('area groups use the full path and send No area last; company groups likewise', async () => {
    const { result } = setup();
    await loaded(result);
    const [, area, company] = result.current.config.groupBy!.options;
    const kitchen = makePurchaseRow({
      area: {
        id: 'area-kitchen',
        name: 'Kitchen',
        color: null,
        ancestors: [{ id: 'area-ground', name: 'Ground floor', color: null }],
      },
      vendor: { id: 'v-1', name: 'Example Carpentry Co' } as never,
    });

    expect(area!.last).toEqual(['__none__']);
    expect(area!.groupOf(kitchen)).toEqual({
      key: 'area-kitchen',
      label: 'Ground floor › Kitchen',
    });
    expect(area!.groupOf(A)).toEqual({ key: '__none__', label: 'No area' });
    expect(company!.last).toEqual(['__none__']);
    expect(company!.groupOf(kitchen)).toEqual({ key: 'v-1', label: 'Example Carpentry Co' });
    expect(company!.groupOf(A)).toEqual({ key: '__none__', label: 'No company' });
  });

  it('labels the list', async () => {
    const { result } = setup();
    await loaded(result);
    const { labels } = result.current;

    expect(labels.title).toBe('Purchases');
    expect(labels.search).toEqual(expect.any(String));
    expect(labels.resultCount(1)).toEqual(expect.stringContaining('1'));
    expect(labels.empty).toEqual(expect.any(String));
    expect(labels.noMatch).toEqual(expect.any(String));
    expect(labels.loadFailed).toEqual(expect.any(String));
  });
});
