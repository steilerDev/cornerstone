/**
 * listHouseholdItemRows (#2246): the Purchases list's filters (incl. engine-valued ranges with
 * null treated as 0), every sort (nulls last in both directions, ties by name then id),
 * group=status order and groupCounts, scopeTotal (status chip only), totals over the whole
 * filtered set, and paging clamps.
 *
 * Mutations these tests catch:
 *  - totals summed over the page instead of the filtered set;
 *  - scopeTotal narrowed by q / filters instead of the status chip only;
 *  - nulls sorted first in descending order;
 *  - a purchase without cost lines dropped (or crashing) instead of counting as 0.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import { listHouseholdItemRows } from './householdItemService.js';
import { createMoneySeed } from '../test/moneyDb.js';
import type { MoneySeed } from '../test/moneyDb.js';
import type { HouseholdItemListQuery, HouseholdItemListSort } from '@cornerstone/shared';

const VAT = 0.19;

describe('listHouseholdItemRows (#2246)', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;
  let seed: MoneySeed;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    runMigrations(sqlite);
    db = drizzle(sqlite, { schema });
    seed = createMoneySeed(db);
    db.insert(schema.vendors)
      .values({
        id: 'vendor',
        name: 'Company One',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      })
      .run();
  });

  afterEach(() => {
    sqlite.close();
  });

  const list = (query: HouseholdItemListQuery = {}) =>
    listHouseholdItemRows(db, { page: 1, pageSize: 100, ...query }, { vatRate: VAT });
  const ids = (query: HouseholdItemListQuery = {}) => list(query).items.map((i) => i.id);

  const patch = (id: string, values: Partial<typeof schema.householdItems.$inferInsert>) => {
    db.update(schema.householdItems).set(values).where(eq(schema.householdItems.id, id)).run();
  };

  /**
   * hi-a Alpha   planned   hic-furniture    line 300                       created 01
   * hi-b Bravo   purchased hic-appliances   invoice-grade line, 100 invoiced+paid (expected 100)    created 02, order 2026-02-01
   * hi-c Charlie scheduled hic-furniture    no cost lines                  created 03, target 2026-03-10
   * hi-d Delta   arrived   hic-appliances   line 500, 10% grant            created 04, target 03-01, actual 03-05
   */
  const seedFour = () => {
    seed.householdItem('hi-a', null, 'Alpha');
    seed.householdItem('hi-b', null, 'Bravo');
    seed.householdItem('hi-c', null, 'Charlie');
    seed.householdItem('hi-d', null, 'Delta');
    patch('hi-a', { status: 'planned', createdAt: '2026-01-01T00:00:01.000Z' });
    patch('hi-b', {
      status: 'purchased',
      categoryId: 'hic-appliances',
      orderDate: '2026-02-01',
      createdAt: '2026-01-01T00:00:02.000Z',
    });
    patch('hi-c', {
      status: 'scheduled',
      targetDeliveryDate: '2026-03-10',
      createdAt: '2026-01-01T00:00:03.000Z',
    });
    patch('hi-d', {
      status: 'arrived',
      categoryId: 'hic-appliances',
      targetDeliveryDate: '2026-03-01',
      actualDeliveryDate: '2026-03-05',
      createdAt: '2026-01-01T00:00:04.000Z',
    });
    seed.hiLine('l-a', 'hi-a', { planned: 300, confidence: 'own_estimate' });
    seed.hiLine('l-b', 'hi-b', { planned: 200, confidence: 'invoice' });
    seed.hiLine('l-d1', 'hi-d', { planned: 300, confidence: 'own_estimate' });
    seed.hiLine('l-d2', 'hi-d', { planned: 200, confidence: 'own_estimate' });
    seed.invoice('inv-1', 100, 'paid');
    seed.link('inv-1', 'l-b', 'household_item', 100);
    seed.grant('g-1', { type: 'percentage', value: 10, householdItems: ['hi-d'] });
  };

  describe('rows and money', () => {
    it('gives every row its engine expected cost, paid and after-grants amounts', () => {
      seedFour();
      const byId = new Map(list().items.map((i) => [i.id, i]));

      expect(byId.get('hi-a')!.expectedCost).toBe(300);
      expect(byId.get('hi-b')!.paid).toBe(100);
      expect(byId.get('hi-b')!.budgetSummary.totalActual).toBe(100);
      expect(byId.get('hi-d')!.expectedCost).toBe(500);
      expect(byId.get('hi-d')!.afterGrants).toBe(450);
      expect(byId.get('hi-d')!.grants.map((g) => g.name)).toEqual(['Grant g-1']);
    });

    it('shows a purchase without cost lines as not set (null) with zero paid', () => {
      seedFour();
      const row = list().items.find((i) => i.id === 'hi-c')!;

      expect(row.expectedCost).toBeNull();
      expect(row.afterGrants).toBeNull();
      expect(row.paid).toBe(0);
    });

    it('computes totals over every matching row, not just the page', () => {
      seedFour();
      const result = list({ pageSize: 1 });

      expect(result.items).toHaveLength(1);
      expect(result.pagination.totalItems).toBe(4);
      expect(result.totals).toEqual({ expectedCost: 900, invoiced: 100, paid: 100 });
    });

    it('totals equal the sums of the unpaged rows and follow the filters', () => {
      seedFour();
      const all = list().items;
      const sum = (pick: (i: (typeof all)[number]) => number) =>
        all.reduce((total, i) => total + pick(i), 0);
      const totals = list().totals;

      expect(totals.expectedCost).toBe(sum((i) => i.expectedCost ?? 0));
      expect(totals.invoiced).toBe(sum((i) => i.budgetSummary.totalActual));
      expect(totals.paid).toBe(sum((i) => i.paid));
      expect(list({ category: 'hic-appliances' }).totals).toEqual({
        expectedCost: 600,
        invoiced: 100,
        paid: 100,
      });
    });

    it('lists nothing and totals zero for an empty table', () => {
      const result = list();

      expect(result.items).toEqual([]);
      expect(result.pagination).toEqual({ page: 1, pageSize: 100, totalItems: 0, totalPages: 0 });
      expect(result.totals).toEqual({ expectedCost: 0, invoiced: 0, paid: 0 });
      expect(result.groupCounts).toBeUndefined();
    });
  });

  describe('filters', () => {
    beforeEach(seedFour);

    it('filters by delivery date ranges, inclusive, excluding purchases without the date', () => {
      expect(ids({ targetDeliveryFrom: '2026-03-10' })).toEqual(['hi-c']);
      expect(ids({ targetDeliveryTo: '2026-03-01', sortBy: 'name', sortOrder: 'asc' })).toEqual([
        'hi-d',
      ]);
      expect(ids({ actualDeliveryFrom: '2026-03-05', actualDeliveryTo: '2026-03-05' })).toEqual([
        'hi-d',
      ]);
      expect(ids({ actualDeliveryFrom: '2026-03-06' })).toEqual([]);
      expect(ids({ actualDeliveryTo: '2026-03-04' })).toEqual([]);
    });

    it('filters by expected cost, treating a purchase without cost lines as 0', () => {
      expect(ids({ expectedCostMin: 1, sortBy: 'name', sortOrder: 'asc' })).toEqual([
        'hi-a',
        'hi-b',
        'hi-d',
      ]);
      expect(ids({ expectedCostMax: 0 })).toEqual(['hi-c']);
      expect(ids({ expectedCostMin: 0, expectedCostMax: 200 }).sort()).toEqual(['hi-b', 'hi-c']);
      expect(ids({ expectedCostMin: 500 })).toEqual(['hi-d']);
    });

    it('filters by grants', () => {
      expect(ids({ grantsMin: 1 })).toEqual(['hi-d']);
      expect(ids({ grantsMax: 0 }).sort()).toEqual(['hi-a', 'hi-b', 'hi-c']);
      expect(ids({ grantsMin: 51 })).toEqual([]);
    });

    it('filters by after-grants, treating not set as 0', () => {
      expect(ids({ afterGrantsMin: 400 })).toEqual(['hi-d']);
      expect(ids({ afterGrantsMax: 0 })).toEqual(['hi-c']);
      expect(ids({ afterGrantsMin: 100, afterGrantsMax: 300 }).sort()).toEqual(['hi-a', 'hi-b']);
    });

    it('filters by planned cost, invoiced amount and cost-line count', () => {
      expect(ids({ plannedCostMin: 400 })).toEqual(['hi-d']);
      expect(ids({ plannedCostMax: 0 })).toEqual(['hi-c']);
      expect(ids({ actualCostMin: 50 })).toEqual(['hi-b']);
      expect(ids({ actualCostMax: 0 }).sort()).toEqual(['hi-a', 'hi-c', 'hi-d']);
      expect(ids({ budgetLinesMin: 2 })).toEqual(['hi-d']);
      expect(ids({ budgetLinesMax: 0 })).toEqual(['hi-c']);
    });

    it('combines status, category, vendor and search filters', () => {
      patch('hi-a', { vendorId: 'vendor', description: 'Oak finish' });

      expect(ids({ status: 'arrived', category: 'hic-appliances' })).toEqual(['hi-d']);
      expect(ids({ vendorId: 'vendor' })).toEqual(['hi-a']);
      expect(ids({ q: 'oak' })).toEqual(['hi-a']);
      expect(ids({ q: 'oak', status: 'arrived' })).toEqual([]);
    });
  });

  describe('sorting', () => {
    beforeEach(seedFour);

    const order = (sortBy: HouseholdItemListSort, sortOrder: 'asc' | 'desc') =>
      ids({ sortBy, sortOrder });

    it.each<[HouseholdItemListSort, string[], string[]]>([
      ['name', ['hi-a', 'hi-b', 'hi-c', 'hi-d'], ['hi-d', 'hi-c', 'hi-b', 'hi-a']],
      ['status', ['hi-a', 'hi-b', 'hi-c', 'hi-d'], ['hi-d', 'hi-c', 'hi-b', 'hi-a']],
      ['category', ['hi-b', 'hi-d', 'hi-a', 'hi-c'], ['hi-a', 'hi-c', 'hi-b', 'hi-d']],
      ['created_at', ['hi-a', 'hi-b', 'hi-c', 'hi-d'], ['hi-d', 'hi-c', 'hi-b', 'hi-a']],
      ['updated_at', ['hi-a', 'hi-b', 'hi-c', 'hi-d'], ['hi-a', 'hi-b', 'hi-c', 'hi-d']],
    ])('sorts by %s ascending and descending', (sortBy, asc, desc) => {
      if (sortBy === 'updated_at') {
        patch('hi-a', { updatedAt: '2026-05-01T00:00:01.000Z' });
        patch('hi-b', { updatedAt: '2026-05-01T00:00:02.000Z' });
        patch('hi-c', { updatedAt: '2026-05-01T00:00:03.000Z' });
        patch('hi-d', { updatedAt: '2026-05-01T00:00:04.000Z' });
        expect(order(sortBy, 'asc')).toEqual(asc);
        expect(order(sortBy, 'desc')).toEqual(['hi-d', 'hi-c', 'hi-b', 'hi-a']);
        return;
      }
      expect(order(sortBy, 'asc')).toEqual(asc);
      expect(order(sortBy, 'desc')).toEqual(desc);
    });

    it('puts null dates last in both directions', () => {
      expect(order('order_date', 'asc')).toEqual(['hi-b', 'hi-a', 'hi-c', 'hi-d']);
      expect(order('order_date', 'desc')).toEqual(['hi-b', 'hi-a', 'hi-c', 'hi-d']);
      expect(order('target_delivery_date', 'asc')).toEqual(['hi-d', 'hi-c', 'hi-a', 'hi-b']);
      expect(order('target_delivery_date', 'desc')).toEqual(['hi-c', 'hi-d', 'hi-a', 'hi-b']);
      expect(order('actual_delivery_date', 'asc')).toEqual(['hi-d', 'hi-a', 'hi-b', 'hi-c']);
      expect(order('actual_delivery_date', 'desc')).toEqual(['hi-d', 'hi-a', 'hi-b', 'hi-c']);
    });

    it('sorts by delivery (actual, else target) with undelivered purchases last', () => {
      // hi-d actual 03-05, hi-c target 03-10, hi-a / hi-b none
      expect(order('delivery', 'asc')).toEqual(['hi-d', 'hi-c', 'hi-a', 'hi-b']);
      expect(order('delivery', 'desc')).toEqual(['hi-c', 'hi-d', 'hi-a', 'hi-b']);
    });

    it('sorts by expected cost with not-set last in both directions', () => {
      expect(order('expected_cost', 'asc')).toEqual(['hi-b', 'hi-a', 'hi-d', 'hi-c']);
      expect(order('expected_cost', 'desc')).toEqual(['hi-d', 'hi-a', 'hi-b', 'hi-c']);
    });

    it('sorts by invoiced amount', () => {
      expect(order('invoiced', 'desc')[0]).toBe('hi-b');
      expect(order('invoiced', 'asc').at(-1)).toBe('hi-b');
    });

    it('breaks ties by name, then by id, regardless of direction', () => {
      seed.householdItem('hi-e', null, 'Alpha');
      patch('hi-e', { createdAt: '2026-01-01T00:00:01.000Z' });

      // hi-a and hi-e tie on created_at and on name -> id ascending
      expect(order('created_at', 'asc').slice(0, 2)).toEqual(['hi-a', 'hi-e']);
      expect(order('created_at', 'desc').at(-2)).toBe('hi-a');
      // tie on category -> name
      expect(order('category', 'asc').slice(2)).toEqual(['hi-a', 'hi-e', 'hi-c']);
    });
  });

  describe('group=status', () => {
    beforeEach(seedFour);

    it('orders rows by status rank first, then by the chosen sort, with groupCounts', () => {
      seed.householdItem('hi-e', null, 'Echo');
      patch('hi-e', { status: 'planned', createdAt: '2026-01-01T00:00:00.500Z' });

      const result = list({ group: 'status', sortBy: 'name', sortOrder: 'desc' });

      expect(result.items.map((i) => i.id)).toEqual(['hi-e', 'hi-a', 'hi-b', 'hi-c', 'hi-d']);
      expect(result.groupCounts).toEqual({ planned: 2, purchased: 1, scheduled: 1, arrived: 1 });
    });

    it('counts groups over the matching rows, zero for empty statuses', () => {
      const result = list({ group: 'status', category: 'hic-appliances' });

      expect(result.groupCounts).toEqual({ planned: 0, purchased: 1, scheduled: 0, arrived: 1 });
    });

    it('omits groupCounts without group', () => {
      expect(list().groupCounts).toBeUndefined();
    });
  });

  describe('scopeTotal', () => {
    beforeEach(seedFour);

    it('counts every purchase when no status chip is set', () => {
      expect(list().scopeTotal).toBe(4);
    });

    it('is narrowed by the status chip only, never by search or filters', () => {
      const result = list({ status: 'planned', q: 'nothing matches', category: 'hic-appliances' });

      expect(result.items).toEqual([]);
      expect(result.pagination.totalItems).toBe(0);
      expect(result.scopeTotal).toBe(1);
    });
  });

  describe('paging', () => {
    beforeEach(seedFour);

    it('returns the requested page with the matching page count', () => {
      const result = list({ page: 2, pageSize: 3, sortBy: 'name', sortOrder: 'asc' });

      expect(result.items.map((i) => i.id)).toEqual(['hi-d']);
      expect(result.pagination).toEqual({ page: 2, pageSize: 3, totalItems: 4, totalPages: 2 });
    });

    it('clamps page to 1 and pageSize to 1..100', () => {
      expect(list({ page: 0, pageSize: 0 }).pagination).toMatchObject({ page: 1, pageSize: 1 });
      expect(list({ pageSize: 500 }).pagination.pageSize).toBe(100);
    });

    it('defaults to page 1, 25 per page, newest first', () => {
      const result = listHouseholdItemRows(db, {}, { vatRate: VAT });

      expect(result.pagination.pageSize).toBe(25);
      expect(result.items.map((i) => i.id)).toEqual(['hi-d', 'hi-c', 'hi-b', 'hi-a']);
    });

    it('returns an empty page past the end', () => {
      const result = list({ page: 9, pageSize: 2 });

      expect(result.items).toEqual([]);
      expect(result.pagination.totalItems).toBe(4);
    });
  });
});
