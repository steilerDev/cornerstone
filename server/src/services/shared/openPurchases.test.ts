/**
 * listOpenPurchases: the not-yet-delivered purchases with dates, area id and company name.
 *
 * Mutations these tests catch:
 *  - arrived purchases, or ones with an actual delivery date, being listed;
 *  - the status filter dropping `purchased` / `planned` purchases;
 *  - the company join becoming an inner join (purchases without a company vanish);
 *  - a date column mapped to the wrong field name.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../../db/migrate.js';
import * as schema from '../../db/schema.js';
import { listOpenPurchases } from './openPurchases.js';

const STAMP = '2026-03-01T00:00:00.000Z';
const ts = { createdAt: STAMP, updatedAt: STAMP };

describe('listOpenPurchases', () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle<typeof schema>>;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    runMigrations(sqlite);
    db = drizzle(sqlite, { schema });
  });

  afterEach(() => {
    sqlite.close();
  });

  function purchase(id: string, o: Partial<typeof schema.householdItems.$inferInsert> = {}): void {
    db.insert(schema.householdItems)
      .values({
        id,
        name: `Purchase ${id}`,
        categoryId: 'hic-furniture',
        status: 'planned',
        ...ts,
        ...o,
      })
      .run();
  }

  it('is empty for an empty database', () => {
    expect(listOpenPurchases(db)).toEqual([]);
  });

  it('maps every field, with the company name and area id', () => {
    db.insert(schema.vendors)
      .values({ id: 'v-a', name: 'Company A', ...ts })
      .run();
    db.insert(schema.areas)
      .values({ id: 'a-1', name: 'Building', parentId: null, sortOrder: 0, ...ts })
      .run();
    purchase('hi-1', {
      status: 'purchased',
      targetDeliveryDate: '2026-03-10',
      earliestDeliveryDate: '2026-03-11',
      latestDeliveryDate: '2026-03-12',
      vendorId: 'v-a',
      areaId: 'a-1',
    });
    expect(listOpenPurchases(db)).toEqual([
      {
        id: 'hi-1',
        name: 'Purchase hi-1',
        status: 'purchased',
        targetDeliveryDate: '2026-03-10',
        earliestDeliveryDate: '2026-03-11',
        latestDeliveryDate: '2026-03-12',
        actualDeliveryDate: null,
        areaId: 'a-1',
        companyName: 'Company A',
      },
    ]);
  });

  it('keeps a purchase with no company or area, with nulls', () => {
    purchase('hi-1');
    expect(listOpenPurchases(db)).toEqual([
      expect.objectContaining({
        id: 'hi-1',
        companyName: null,
        areaId: null,
        targetDeliveryDate: null,
        earliestDeliveryDate: null,
        latestDeliveryDate: null,
      }),
    ]);
  });

  it('lists planned and purchased purchases but not arrived ones', () => {
    purchase('planned', { status: 'planned' });
    purchase('bought', { status: 'purchased' });
    purchase('arrived', { status: 'arrived' });
    expect(
      listOpenPurchases(db)
        .map((p) => p.id)
        .sort(),
    ).toEqual(['bought', 'planned']);
  });

  it('leaves out a purchase that has an actual delivery date whatever its status', () => {
    purchase('delivered', { status: 'purchased', actualDeliveryDate: '2026-03-05' });
    purchase('open', { status: 'purchased' });
    expect(listOpenPurchases(db).map((p) => p.id)).toEqual(['open']);
  });

  it('does not fan out when a company has several purchases', () => {
    db.insert(schema.vendors)
      .values({ id: 'v-a', name: 'Company A', ...ts })
      .run();
    purchase('one', { vendorId: 'v-a' });
    purchase('two', { vendorId: 'v-a' });
    expect(listOpenPurchases(db)).toHaveLength(2);
  });
});
