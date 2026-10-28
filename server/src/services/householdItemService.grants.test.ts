/**
 * householdItemService (#2242): `grants` chips on list rows (AC6) and the remaining branches of
 * the file (nullable updates, delivery-date cross-validation, area validation, sort keys,
 * budget-line-count and actual-cost filters).
 *
 * Mutations these tests catch:
 *  - a rejected grant still shown as a chip; chips unsorted; no `grants: []` for an item without;
 *  - one grant query per row instead of one per response;
 *  - a task's grant leaking into a purchase row.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import { ValidationError } from '../errors/AppError.js';
import {
  createHouseholdItem,
  getHouseholdItemById,
  listHouseholdItemRows,
  updateHouseholdItem,
} from './householdItemService.js';
import { createMoneySeed } from '../test/moneyDb.js';
import type { MoneySeed } from '../test/moneyDb.js';

const VAT = 0.19;

describe('householdItemService: grant chips and remaining branches (#2242)', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;
  let seed: MoneySeed;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    runMigrations(sqlite);
    db = drizzle(sqlite, { schema });
    seed = createMoneySeed(db);
  });

  afterEach(() => {
    sqlite.close();
  });

  const list = (query: Parameters<typeof listHouseholdItemRows>[1] = {}) =>
    listHouseholdItemRows(db, { page: 1, pageSize: 100, ...query }, { vatRate: VAT });

  describe('grants on list rows', () => {
    it('attaches every non-rejected grant, ordered by name, and [] when there is none', () => {
      seed.householdItem('hi-1', null, 'Oven');
      seed.householdItem('hi-2', null, 'Sink');
      seed.householdItem('hi-3', null, 'Lamp');
      seed.grant('sp-b', { value: 20, householdItems: ['hi-1'] });
      seed.grant('sp-a', { value: 15, householdItems: ['hi-1', 'hi-2'] });
      seed.grant('sp-rej', { status: 'rejected', value: 50, householdItems: ['hi-1'] });
      seed.grant('sp-fix', {
        type: 'fixed',
        value: 300,
        householdItems: ['hi-2'],
        status: 'applied',
      });
      // A task-only link must not leak into a purchase row
      seed.workItem('wi-1');
      seed.grant('sp-wi', { workItems: ['wi-1'] });

      const byName = new Map(list().items.map((i) => [i.name, i.grants]));

      expect(byName.get('Oven')).toEqual([
        { id: 'sp-a', name: 'Grant sp-a', reductionType: 'percentage', rate: 15 },
        { id: 'sp-b', name: 'Grant sp-b', reductionType: 'percentage', rate: 20 },
      ]);
      expect(byName.get('Sink')).toEqual([
        { id: 'sp-a', name: 'Grant sp-a', reductionType: 'percentage', rate: 15 },
        { id: 'sp-fix', name: 'Grant sp-fix', reductionType: 'fixed', rate: 300 },
      ]);
      expect(byName.get('Lamp')).toEqual([]);
    });

    it('is one grant query per response, not one per row', () => {
      for (let i = 0; i < 12; i++) seed.householdItem(`hi-${i}`, null, `Purchase ${i}`);
      seed.grant('sp-1', { householdItems: ['hi-0', 'hi-5', 'hi-11'] });
      const statements: string[] = [];
      const logged = drizzle(sqlite, {
        schema,
        logger: { logQuery: (q: string) => statements.push(q) },
      });

      listHouseholdItemRows(logged, { page: 1, pageSize: 100 }, { vatRate: VAT });

      expect(statements.filter((q) => q.includes('link.household_item_id'))).toHaveLength(1);
    });
  });

  describe('remaining branches', () => {
    it('create validates the area and the delivery-date order', () => {
      expect(() =>
        createHouseholdItem(db, 'u', { name: 'X', areaId: 'nope' } as never, VAT),
      ).toThrow(ValidationError);
      expect(() =>
        createHouseholdItem(
          db,
          'u',
          { name: 'X', earliestDeliveryDate: '2026-06-02', latestDeliveryDate: '2026-06-01' },
          VAT,
        ),
      ).toThrow(ValidationError);
    });

    it('update validates the delivery-date order and clears nullable fields with null', () => {
      seed.householdItem('hi-1');
      expect(() =>
        updateHouseholdItem(
          db,
          'hi-1',
          { earliestDeliveryDate: '2026-06-02', latestDeliveryDate: '2026-06-01' },
          VAT,
        ),
      ).toThrow(ValidationError);

      updateHouseholdItem(
        db,
        'hi-1',
        {
          description: 'Text',
          url: 'https://example.test/x',
          latestDeliveryDate: '2026-07-01',
          actualDeliveryDate: '2026-06-20',
        },
        VAT,
      );
      const cleared = updateHouseholdItem(
        db,
        'hi-1',
        {
          description: null,
          vendorId: null,
          url: null,
          latestDeliveryDate: null,
          actualDeliveryDate: null,
        },
        VAT,
      );
      expect([
        cleared.description,
        cleared.url,
        cleared.latestDeliveryDate,
        cleared.actualDeliveryDate,
      ]).toEqual([null, null, null, null]);
      expect(getHouseholdItemById(db, 'hi-1', VAT).description).toBeNull();
    });

    it('create accepts an actual delivery date and a known area', () => {
      seed.area('ar-1', 'Kitchen');
      db.insert(schema.users)
        .values({
          id: 'u-1',
          email: 'member@example.test',
          displayName: 'Member',
          role: 'member',
          authProvider: 'local',
          createdAt: 'x',
          updatedAt: 'x',
        })
        .run();
      const created = createHouseholdItem(
        db,
        'u-1',
        { name: 'With area', areaId: 'ar-1', actualDeliveryDate: '2026-06-01' } as never,
        VAT,
      );
      expect(created.actualDeliveryDate).toBe('2026-06-01');
      expect(created.area?.id).toBe('ar-1');
    });

    it.each([
      'name',
      'category',
      'status',
      'order_date',
      'target_delivery_date',
      'updated_at',
      'created_at',
    ] as const)('lists sorted by %s in both directions', (sortBy) => {
      seed.householdItem('hi-1', null, 'A');
      seed.householdItem('hi-2', null, 'B');
      for (const sortOrder of ['asc', 'desc'] as const) {
        const ids = list({ sortBy, sortOrder }).items.map((i) => i.id);
        expect([...ids].sort()).toEqual(['hi-1', 'hi-2']);
      }
    });

    it('filters by the number of budget lines and by actual cost', () => {
      db.insert(schema.vendors)
        .values({ id: 'vendor', name: 'Company One', createdAt: 'x', updatedAt: 'x' })
        .run();
      seed.householdItem('hi-0', null, 'No lines');
      seed.householdItem('hi-2', null, 'Two lines');
      seed.hiLine('l-1', 'hi-2', { planned: 100, confidence: 'own_estimate' });
      seed.hiLine('l-2', 'hi-2', { planned: 100, confidence: 'own_estimate' });
      seed.invoice('inv-1', 80, 'paid');
      seed.link('inv-1', 'l-1', 'household_item', 80);

      expect(list({ budgetLinesMin: 1 }).items.map((i) => i.name)).toEqual(['Two lines']);
      expect(list({ budgetLinesMax: 1 }).items.map((i) => i.name)).toEqual(['No lines']);
      expect(list({ actualCostMin: 50 }).items.map((i) => i.name)).toEqual(['Two lines']);
      expect(list({ actualCostMax: 50 }).items.map((i) => i.name)).toEqual(['No lines']);
    });

    it('summary rows resolve the vendor and creator; update assigns a vendor and an unknown filter area', () => {
      db.insert(schema.vendors)
        .values({ id: 'v-1', name: 'Company One', createdAt: 'x', updatedAt: 'x' })
        .run();
      db.insert(schema.users)
        .values({
          id: 'u-2',
          email: 'creator@example.test',
          displayName: 'Creator',
          role: 'member',
          authProvider: 'local',
          createdAt: 'x',
          updatedAt: 'x',
        })
        .run();
      const created = createHouseholdItem(
        db,
        'u-2',
        { name: 'Owned', vendorId: 'v-1', actualDeliveryDate: null } as never,
        VAT,
      );
      const row = list().items.find((i) => i.id === created.id)!;
      expect(row.vendor?.id).toBe('v-1');
      expect(row.createdBy?.id).toBe('u-2');

      seed.householdItem('hi-9');
      expect(updateHouseholdItem(db, 'hi-9', { vendorId: 'v-1' }, VAT).vendor?.id).toBe('v-1');
    });

    it('an empty table lists nothing and reports zero totals', () => {
      const result = list();
      expect(result.items).toEqual([]);
      expect(result.pagination.totalItems).toBe(0);
      expect(result.scopeTotal).toBe(0);
      expect(result.totals).toEqual({ expectedCost: 0, invoiced: 0, paid: 0 });
    });

    it('an area filter with no meaningful input (only separators) filters nothing', () => {
      seed.householdItem('hi-1');
      seed.householdItem('hi-2');
      expect(list({ areaId: ' , ' } as never).items).toHaveLength(2);
    });

    it('an unknown area id in the filter yields an empty result', () => {
      seed.householdItem('hi-1');
      expect(list({ areaId: 'nope' } as never).items).toEqual([]);
    });
  });
});
