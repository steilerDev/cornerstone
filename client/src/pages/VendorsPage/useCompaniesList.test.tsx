/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { TradeListItem, VendorListItem } from '@cornerstone/shared';
import type * as VendorsApiTypes from '../../lib/vendorsApi.js';
import type * as ListModule from './useCompaniesList.js';

const mockFetchVendors = jest.fn<typeof VendorsApiTypes.fetchVendors>();
jest.unstable_mockModule('../../lib/vendorsApi.js', () => ({ fetchVendors: mockFetchVendors }));

let useCompaniesList: typeof ListModule.useCompaniesList;

const trade = (id: string, name: string, vendorCount: number): TradeListItem =>
  ({ id, name, translationKey: null, vendorCount }) as TradeListItem;
const TRADES = [
  trade('t-roof', 'Roofing', 5),
  trade('t-tile', 'Tiling', 4),
  trade('t-elec', 'Electrical', 3),
  trade('t-plum', 'Plumbing', 2),
  trade('t-wall', 'Walls', 1),
  trade('t-none', 'Unused', 0),
];
const displayName: ListModule.TradeDisplayName = (t) => t.name;

const company = (over: Partial<VendorListItem> = {}): VendorListItem =>
  ({
    id: 'c1',
    name: 'Sample Roofing Co',
    trade: null,
    phone: null,
    email: null,
    address: null,
    notes: null,
    createdBy: null,
    createdAt: '2026-01-02T00:00:00.000Z',
    updatedAt: '2026-01-03T00:00:00.000Z',
    ...over,
  }) as VendorListItem;

function response(vendors: VendorListItem[], scopeTotal = vendors.length) {
  return {
    vendors,
    pagination: { page: 1, pageSize: 100, totalItems: vendors.length, totalPages: 1 },
    scopeTotal,
  };
}

function setup(url = '/companies', options: Partial<ListModule.UseCompaniesListOptions> = {}) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>
  );
  return renderHook(
    () => useCompaniesList({ trades: TRADES, tradesFailed: false, displayName, ...options }),
    { wrapper },
  );
}

async function loaded(result: { current: ListModule.UseCompaniesListResult }) {
  await waitFor(() => expect(result.current.list.totalItems).not.toBeNull());
}

beforeEach(async () => {
  if (!useCompaniesList) ({ useCompaniesList } = await import('./useCompaniesList.js'));
  mockFetchVendors.mockReset();
  mockFetchVendors.mockResolvedValue(response([company()], 12));
});

describe('fetchPage mapping', () => {
  it('requests the companies with the default sort, page and pageSize, and maps the response', async () => {
    const { result } = setup();
    await loaded(result);

    expect(mockFetchVendors.mock.calls[0]![0]).toEqual({
      sortBy: 'name',
      sortOrder: 'asc',
      page: 1,
      pageSize: 100,
    });
    expect(result.current.list.items.map((r) => r.id)).toEqual(['c1']);
    expect(result.current.list.totalItems).toBe(1);
    expect(result.current.list.meta).toEqual({ scopeTotal: 12 });
    expect(result.current.scopeTotal).toBe(12);
  });

  it('has no scope total before the first batch', () => {
    mockFetchVendors.mockReturnValue(new Promise(() => undefined));
    const { result } = setup();

    expect(result.current.scopeTotal).toBeNull();
  });

  it('sends the trade chip, the search and the trades whose name matches the search', async () => {
    const { result } = setup('/companies?tradeId=t-roof&q=ti&sortBy=still_to_pay&sortOrder=desc');
    await loaded(result);

    expect(mockFetchVendors.mock.calls[0]![0]).toMatchObject({
      tradeId: 't-roof',
      q: 'ti',
      tradeIds: 't-tile',
      sortBy: 'still_to_pay',
      sortOrder: 'desc',
    });
  });

  it('absorbs an old ?page=3&pageSize=10 URL without an error', async () => {
    const { result } = setup('/companies?page=3&pageSize=10');
    await loaded(result);

    expect(mockFetchVendors.mock.calls[0]![0]).toMatchObject({ page: 1, pageSize: 100 });
  });
});

describe('config', () => {
  it('offers the four busiest trades as chips and the rest in the More trades menu', async () => {
    const { result } = setup();
    await loaded(result);
    const { chips } = result.current.config;

    expect(chips!.param).toBe('tradeId');
    expect(chips!.ariaLabel).toEqual(expect.any(String));
    expect(chips!.options.map((o) => o.label)).toEqual([
      'Electrical',
      'Plumbing',
      'Roofing',
      'Tiling',
    ]);
    expect(chips!.overflow!.label).toBe('More trades');
    expect(chips!.overflow!.options.map((o) => o.label)).toEqual([
      'Electrical',
      'Plumbing',
      'Roofing',
      'Tiling',
      'Walls',
    ]);
  });

  it('shows the selected trade outside the top four as a fifth chip', async () => {
    const { result } = setup('/companies?tradeId=t-wall');
    await loaded(result);

    expect(result.current.config.chips!.options.map((o) => o.label)).toContain('Walls');
    expect(result.current.config.chips!.options).toHaveLength(5);
  });

  it('has no chips when the trades could not be loaded, or none has a company', async () => {
    const failed = setup('/companies', { tradesFailed: true });
    await loaded(failed.result);
    expect(failed.result.current.config.chips).toBeUndefined();

    const none = setup('/companies', { trades: [trade('t-1', 'Unused', 0)] });
    await loaded(none.result);
    expect(none.result.current.config.chips).toBeUndefined();
  });

  it('defines Group by Trade, the sorts and the legacy column keys', async () => {
    const { result } = setup();
    await loaded(result);
    const { config } = result.current;

    expect(config.listKey).toBe('companies');
    expect(config.testIdPrefix).toBe('companies');
    expect(config.groupBy!.options.map((o) => o.value)).toEqual(['trade']);
    expect(config.sort.options.map((o) => o.value)).toEqual([
      'name',
      'trade',
      'still_to_pay',
      'last_on_site',
      'created_at',
      'updated_at',
    ]);
    expect(config.sort.defaultValue).toBe('name');
    expect(config.legacyColumnKeys).toEqual({ name: null });
    expect(config.filters).toBeUndefined();
  });

  it('groups by trade name with Not set last for a company without a trade', async () => {
    const { result } = setup();
    await loaded(result);
    const trade = result.current.config.groupBy!.options[0]!;

    expect(trade.last).toEqual(['__none__']);
    expect(trade.groupOf(company({ trade: { id: 't-roof', name: 'Roofing' } as never }))).toEqual({
      key: 't-roof',
      label: 'Roofing',
    });
    expect(trade.groupOf(company())).toEqual({ key: '__none__', label: 'No trade' });
  });

  it('labels the list', async () => {
    const { result } = setup();
    await loaded(result);
    const { labels } = result.current;

    expect(labels.title).toBe('Companies');
    expect(labels.search).toEqual(expect.any(String));
    expect(labels.resultCount(2)).toEqual(expect.stringContaining('2'));
    expect(labels.empty).toEqual(expect.any(String));
    expect(labels.noMatch).toEqual(expect.any(String));
    expect(labels.loadFailed).toEqual(expect.any(String));
  });

  it('keys rows by id, so one row can be updated in place', async () => {
    const { result } = setup();
    await loaded(result);

    act(() => result.current.list.updateItem('c1', (row) => ({ ...row, name: 'Renamed' })));

    expect(result.current.list.items[0]!.name).toBe('Renamed');
  });

  it('does not reload when only the trades change', async () => {
    const view = setup();
    await loaded(view.result);
    mockFetchVendors.mockClear();

    view.rerender();

    expect(mockFetchVendors).not.toHaveBeenCalled();
  });
});
