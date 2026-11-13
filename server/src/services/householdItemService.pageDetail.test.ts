/**
 * getHouseholdItemPageDetail (#2249): the purchase page's detail. Same money figures as the
 * Purchases list row, the company's phone, the category entry, the cost lines and the first
 * unfinished predecessor.
 *
 * Mutations these tests catch:
 *  - expected cost or grants computed apart from the list helper (the strip would disagree
 *    with the Purchases list);
 *  - a rejected grant shown; a purchase without cost lines showing 0 instead of not set (null);
 *  - the company phone missing or taken from another company;
 *  - a completed milestone or task still reported as waiting.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import { NotFoundError } from '../errors/AppError.js';
import { getHouseholdItemPageDetail, listHouseholdItemRows } from './householdItemService.js';
import { createMoneySeed } from '../test/moneyDb.js';
import type { MoneySeed } from '../test/moneyDb.js';

const VAT = 0.19;
const NOW = '2026-01-01T00:00:00.000Z';

describe('getHouseholdItemPageDetail (#2249)', () => {
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

  const page = (id: string) => getHouseholdItemPageDetail(db, id, { vatRate: VAT });

  const vendor = (id: string, name: string, phone: string | null) => {
    db.insert(schema.vendors).values({ id, name, phone, createdAt: NOW, updatedAt: NOW }).run();
  };
  const assignVendor = (itemId: string, vendorId: string) => {
    db.update(schema.householdItems)
      .set({ vendorId })
      .where(eq(schema.householdItems.id, itemId))
      .run();
  };
  const milestone = (title: string, targetDate: string, isCompleted = false): number =>
    db
      .insert(schema.milestones)
      .values({ title, targetDate, isCompleted, createdAt: NOW, updatedAt: NOW })
      .returning({ id: schema.milestones.id })
      .get().id;
  const dep = (itemId: string, type: 'work_item' | 'milestone', predecessorId: string) => {
    db.insert(schema.householdItemDeps)
      .values({ householdItemId: itemId, predecessorType: type, predecessorId })
      .run();
  };

  it('throws NotFoundError for an unknown purchase', () => {
    expect(() => page('missing')).toThrow(NotFoundError);
    expect(() => page('missing')).toThrow('Household item not found');
  });

  describe('company', () => {
    it('is null without a company', () => {
      seed.householdItem('hi-1', null, 'Oven');
      expect(page('hi-1').vendor).toBeNull();
    });

    it('carries the company summary with its phone', () => {
      seed.householdItem('hi-1', null, 'Oven');
      vendor('v-1', 'Company One', '+49 30 1234567');
      vendor('v-2', 'Company Two', '+49 40 7654321');
      assignVendor('hi-1', 'v-1');
      expect(page('hi-1').vendor).toMatchObject({
        id: 'v-1',
        name: 'Company One',
        phone: '+49 30 1234567',
      });
    });

    it('has a null phone when the company has none', () => {
      seed.householdItem('hi-1', null, 'Oven');
      vendor('v-1', 'Company One', null);
      assignVendor('hi-1', 'v-1');
      expect(page('hi-1').vendor).toMatchObject({ id: 'v-1', phone: null });
    });
  });

  describe('category', () => {
    it('returns the category entry with its translation key', () => {
      seed.householdItem('hi-1', null, 'Oven');
      db.update(schema.householdItems)
        .set({ categoryId: 'hic-appliances' })
        .where(eq(schema.householdItems.id, 'hi-1'))
        .run();
      const entry = db
        .select()
        .from(schema.householdItemCategories)
        .where(eq(schema.householdItemCategories.id, 'hic-appliances'))
        .get()!;
      expect(page('hi-1').categoryEntry).toEqual({
        id: 'hic-appliances',
        name: entry.name,
        translationKey: entry.translationKey,
      });
      expect(page('hi-1').category).toBe('hic-appliances');
    });
  });

  describe('money', () => {
    it('has a null expected cost and no grants without cost lines', () => {
      seed.householdItem('hi-1', null, 'Oven');
      const detail = page('hi-1');
      expect(detail.expectedCost).toBeNull();
      expect(detail.grants).toEqual([]);
      expect(detail.budgets).toEqual([]);
    });

    it('lists the cost lines and the engine expected cost', () => {
      seed.householdItem('hi-1', null, 'Oven');
      seed.hiLine('l-1', 'hi-1', { planned: 300, confidence: 'own_estimate' });
      seed.hiLine('l-2', 'hi-1', { planned: 200, confidence: 'own_estimate' });
      const detail = page('hi-1');
      expect(detail.expectedCost).toBe(500);
      expect(detail.budgets.map((line) => line.id).sort()).toEqual(['l-1', 'l-2']);
    });

    it('shows the grants that cover it and leaves out a rejected one', () => {
      seed.householdItem('hi-1', null, 'Oven');
      seed.hiLine('l-1', 'hi-1', { planned: 500, confidence: 'own_estimate' });
      seed.grant('g-b', { value: 10, householdItems: ['hi-1'] });
      seed.grant('g-a', { value: 15, householdItems: ['hi-1'] });
      seed.grant('g-rej', { status: 'rejected', value: 50, householdItems: ['hi-1'] });
      expect(page('hi-1').grants.map((g) => g.name)).toEqual(['Grant g-a', 'Grant g-b']);
    });

    it('matches the Purchases list row for expected cost, grants and invoiced', () => {
      vendor('vendor', 'Invoicing company', null);
      seed.householdItem('hi-1', null, 'Oven');
      seed.householdItem('hi-2', null, 'Sink');
      seed.hiLine('l-1', 'hi-1', { planned: 200, confidence: 'invoice' });
      seed.invoice('inv-1', 100, 'paid');
      seed.link('inv-1', 'l-1', 'household_item', 100);
      seed.grant('g-1', { value: 10, householdItems: ['hi-1'] });
      const rows = listHouseholdItemRows(db, { page: 1, pageSize: 50 }, { vatRate: VAT }).items;
      for (const id of ['hi-1', 'hi-2']) {
        const row = rows.find((r) => r.id === id)!;
        const detail = page(id);
        expect(detail.expectedCost).toBe(row.expectedCost);
        expect(detail.grants).toEqual(row.grants);
        expect(detail.budgetSummary.totalActual).toBe(row.budgetSummary.totalActual);
      }
    });
  });

  describe('waitsFor', () => {
    beforeEach(() => {
      seed.householdItem('hi-1', null, 'Oven');
    });

    it('is null without dependencies', () => {
      expect(page('hi-1').waitsFor).toBeNull();
    });

    it('is the unfinished task with the latest end date and counts the others', () => {
      seed.workItem('wi-1', null, 'Plaster');
      seed.workItem('wi-2', null, 'Paint');
      db.update(schema.workItems)
        .set({ endDate: '2026-03-01', status: 'in_progress' })
        .where(eq(schema.workItems.id, 'wi-1'))
        .run();
      db.update(schema.workItems)
        .set({ endDate: '2026-04-01', status: 'in_progress' })
        .where(eq(schema.workItems.id, 'wi-2'))
        .run();
      dep('hi-1', 'work_item', 'wi-1');
      dep('hi-1', 'work_item', 'wi-2');
      expect(page('hi-1').waitsFor).toEqual({
        type: 'work_item',
        id: 'wi-2',
        title: 'Paint',
        more: 1,
      });
    });

    it('ignores a completed task', () => {
      seed.workItem('wi-1', null, 'Plaster');
      db.update(schema.workItems)
        .set({ status: 'completed' })
        .where(eq(schema.workItems.id, 'wi-1'))
        .run();
      dep('hi-1', 'work_item', 'wi-1');
      expect(page('hi-1').waitsFor).toBeNull();
    });

    it('waits for an unfinished milestone and ignores a completed one', () => {
      const open = milestone('Shell done', '2026-05-01');
      const done = milestone('Roof done', '2026-06-01', true);
      dep('hi-1', 'milestone', String(open));
      dep('hi-1', 'milestone', String(done));
      expect(page('hi-1').waitsFor).toEqual({
        type: 'milestone',
        id: String(open),
        title: 'Shell done',
        more: 0,
      });
    });

    it('is null when its only milestone is completed', () => {
      const done = milestone('Roof done', '2026-06-01', true);
      dep('hi-1', 'milestone', String(done));
      expect(page('hi-1').waitsFor).toBeNull();
      expect(page('hi-1').dependencies).toHaveLength(1);
    });
  });
});
