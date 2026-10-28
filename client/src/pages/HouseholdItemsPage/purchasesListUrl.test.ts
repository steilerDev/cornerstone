import { describe, it, expect } from '@jest/globals';
import type { ObjectListQuery } from '../../components/ObjectList/types.js';
import {
  NONE_KEY,
  PURCHASE_DEFAULT_SORT,
  PURCHASE_FILTER_PARAMS,
  PURCHASE_LEGACY_COLUMN_KEYS,
  PURCHASE_SORTS,
  purchasesListApiParams,
} from './purchasesListUrl.js';

function query(overrides: Partial<ObjectListQuery> = {}): ObjectListQuery {
  return {
    q: '',
    chip: 'all',
    searchingAll: false,
    serverGroup: null,
    sortBy: 'name',
    sortOrder: 'asc',
    isDefaultSort: true,
    filters: {},
    ...overrides,
  };
}

describe('purchasesListApiParams', () => {
  it('sends only the sort for a bare list, never page or pageSize', () => {
    const params = purchasesListApiParams(query());

    expect(params).toEqual({ sortBy: 'name', sortOrder: 'asc' });
    expect(params).not.toHaveProperty('page');
    expect(params).not.toHaveProperty('pageSize');
  });

  it('sends the search text and the status chip', () => {
    expect(purchasesListApiParams(query({ q: 'oak', chip: 'arrived' }))).toMatchObject({
      q: 'oak',
      status: 'arrived',
    });
  });

  it('drops a chip that is not a status (an old comma-separated value, All)', () => {
    expect(purchasesListApiParams(query({ chip: 'planned,arrived' }))).not.toHaveProperty('status');
    expect(purchasesListApiParams(query({ chip: 'all' }))).not.toHaveProperty('status');
  });

  it('asks the server to group by status only for the status group', () => {
    expect(purchasesListApiParams(query({ serverGroup: 'status' })).group).toBe('status');
    expect(purchasesListApiParams(query({ serverGroup: null }))).not.toHaveProperty('group');
    expect(purchasesListApiParams(query({ serverGroup: 'area' }))).not.toHaveProperty('group');
  });

  it.each(PURCHASE_SORTS)('passes the %s sort through with its direction', (sortBy) => {
    expect(purchasesListApiParams(query({ sortBy, sortOrder: 'desc' }))).toMatchObject({
      sortBy,
      sortOrder: 'desc',
    });
  });

  it('falls back to the default sort for a sort the server does not know', () => {
    expect(purchasesListApiParams(query({ sortBy: 'created_at' })).sortBy).toBe(
      PURCHASE_DEFAULT_SORT,
    );
  });

  it('sends category, area and company; a legacy comma-separated category uses its first id', () => {
    expect(
      purchasesListApiParams(
        query({ filters: { category: 'hic-furniture', areaId: `a1,${NONE_KEY}`, vendorId: 'v1' } }),
      ),
    ).toMatchObject({ category: 'hic-furniture', areaId: `a1,${NONE_KEY}`, vendorId: 'v1' });
    expect(
      purchasesListApiParams(query({ filters: { category: 'hic-furniture,hic-appliances' } }))
        .category,
    ).toBe('hic-furniture');
  });

  it('maps the delivery date ranges, each side on its own', () => {
    const params = purchasesListApiParams(
      query({
        filters: {
          targetDelivery: 'from:2026-03-01,to:2026-03-31',
          actualDelivery: 'to:2026-04-30',
        },
      }),
    );

    expect(params).toMatchObject({
      targetDeliveryFrom: '2026-03-01',
      targetDeliveryTo: '2026-03-31',
      actualDeliveryTo: '2026-04-30',
    });
    expect(params).not.toHaveProperty('actualDeliveryFrom');
  });

  it('ignores an invalid date range', () => {
    const params = purchasesListApiParams(
      query({ filters: { targetDelivery: 'from:2026-13-40', actualDelivery: 'garbage' } }),
    );

    expect(params).not.toHaveProperty('targetDeliveryFrom');
    expect(params).not.toHaveProperty('actualDeliveryFrom');
  });

  it('maps the money ranges: Expected cost, Invoiced, Grants and After grants', () => {
    expect(
      purchasesListApiParams(
        query({
          filters: {
            plannedCost: 'min:100,max:900.5',
            actualCost: 'min:10',
            grants: 'max:50',
            afterGrants: 'min:0,max:300',
          },
        }),
      ),
    ).toMatchObject({
      expectedCostMin: 100,
      expectedCostMax: 900.5,
      actualCostMin: 10,
      grantsMax: 50,
      afterGrantsMin: 0,
      afterGrantsMax: 300,
    });
  });

  it('keeps a zero bound and omits a missing or non-numeric side', () => {
    const params = purchasesListApiParams(
      query({ filters: { plannedCost: 'min:0,max:abc', grants: 'nope' } }),
    );

    expect(params.expectedCostMin).toBe(0);
    expect(params).not.toHaveProperty('expectedCostMax');
    expect(params).not.toHaveProperty('grantsMin');
    expect(params).not.toHaveProperty('grantsMax');
  });

  it('maps the cost-line count bounds when they are whole numbers of at least 0', () => {
    expect(
      purchasesListApiParams(query({ filters: { budgetLines: 'min:1,max:4' } })),
    ).toMatchObject({ budgetLinesMin: 1, budgetLinesMax: 4 });
    expect(
      purchasesListApiParams(query({ filters: { budgetLines: 'min:0' } })).budgetLinesMin,
    ).toBe(0);
  });

  it('omits a cost-line bound that is fractional or negative', () => {
    const params = purchasesListApiParams(query({ filters: { budgetLines: 'min:1.5,max:-2' } }));

    expect(params).not.toHaveProperty('budgetLinesMin');
    expect(params).not.toHaveProperty('budgetLinesMax');
  });
});

describe('purchases list constants', () => {
  it('lists the filter params of the panel in order', () => {
    expect(PURCHASE_FILTER_PARAMS).toEqual([
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

  it('maps the old table column keys onto the new ones; Actual cost maps to null so Invoiced keeps its default', () => {
    expect(PURCHASE_LEGACY_COLUMN_KEYS).toMatchObject({
      name: null,
      status: null,
      vendor: 'company',
      plannedCost: 'expectedCost',
      targetDelivery: 'delivery',
      actualDelivery: 'delivery',
      actualCost: null,
      subsidyReduction: 'grants',
      netCost: 'afterGrants',
      budgetLines: 'costLines',
    });
  });
});
