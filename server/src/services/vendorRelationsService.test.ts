import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import { registerSqlFunctions } from '../db/sqlFunctions.js';
import { NotFoundError } from '../errors/AppError.js';
import { getVendorRelations } from './vendorRelationsService.js';

describe('vendorRelationsService.getVendorRelations (#2244)', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;
  const AT = '2026-01-01T00:00:00.000Z';

  function addVendor(id: string) {
    db.insert(schema.vendors).values({ id, name: id, createdAt: AT, updatedAt: AT }).run();
  }

  function addTask(
    id: string,
    vendorId: string | null,
    o: { title?: string; status?: 'not_started' | 'completed'; end?: string | null } = {},
  ) {
    db.insert(schema.workItems)
      .values({
        id,
        title: o.title ?? id,
        status: o.status ?? 'not_started',
        startDate: '2026-02-01',
        endDate: o.end ?? null,
        assignedVendorId: vendorId,
        createdAt: AT,
        updatedAt: AT,
      })
      .run();
  }

  function addPurchase(
    id: string,
    vendorId: string | null,
    o: { name?: string; target?: string | null; actual?: string | null } = {},
  ) {
    const category = db.select().from(schema.householdItemCategories).limit(1).get();
    db.insert(schema.householdItems)
      .values({
        id,
        name: o.name ?? id,
        categoryId: category?.id ?? 'hic-furniture',
        vendorId,
        targetDeliveryDate: o.target ?? null,
        actualDeliveryDate: o.actual ?? null,
        createdAt: AT,
        updatedAt: AT,
      })
      .run();
  }

  function addWorkLine(
    id: string,
    vendorId: string,
    workItemId: string | null,
    o: { createdAt?: string; description?: string | null; planned?: number } = {},
  ) {
    db.insert(schema.workItemBudgets)
      .values({
        id,
        workItemId,
        vendorId,
        description: o.description ?? null,
        plannedAmount: o.planned ?? 10,
        createdAt: o.createdAt ?? AT,
        updatedAt: AT,
      })
      .run();
  }

  function addHouseholdLine(id: string, vendorId: string, householdItemId: string, createdAt = AT) {
    db.insert(schema.householdItemBudgets)
      .values({ id, householdItemId, vendorId, plannedAmount: 5, createdAt, updatedAt: AT })
      .run();
  }

  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    registerSqlFunctions(sqlite);
    runMigrations(sqlite);
    db = drizzle(sqlite, { schema });
    addVendor('v1');
    addVendor('v2');
  });

  afterEach(() => {
    sqlite.close();
  });

  it('throws NotFoundError for an unknown company', () => {
    expect(() => getVendorRelations(db, 'missing')).toThrow(NotFoundError);
    expect(() => getVendorRelations(db, 'missing')).toThrow('Vendor not found');
  });

  it('returns three empty arrays for a company with nothing attached', () => {
    expect(getVendorRelations(db, 'v1')).toEqual({
      workItems: [],
      householdItems: [],
      budgetLines: [],
    });
  });

  it('lists only this company records with the documented fields', () => {
    addTask('t1', 'v1', { title: 'Plaster', end: '2026-05-01' });
    addTask('t2', 'v2');
    addTask('t3', null);
    addPurchase('h1', 'v1', { name: 'Sofa', target: '2026-06-01' });
    addPurchase('h2', 'v2');

    const result = getVendorRelations(db, 'v1');

    expect(result.workItems).toEqual([
      {
        id: 't1',
        title: 'Plaster',
        status: 'not_started',
        startDate: '2026-02-01',
        endDate: '2026-05-01',
      },
    ]);
    expect(result.householdItems).toEqual([
      {
        id: 'h1',
        name: 'Sofa',
        status: expect.any(String),
        targetDeliveryDate: '2026-06-01',
        actualDeliveryDate: null,
      },
    ]);
  });

  // Mutation: dropping the status term sorts a completed early task first; dropping the
  // NULL-last term sorts undated tasks first.
  it('orders tasks: open before completed, then end date with undated last, then title, then id', () => {
    addTask('done', 'v1', { title: 'A done', status: 'completed', end: '2026-01-05' });
    addTask('undated', 'v1', { title: 'Undated' });
    addTask('late', 'v1', { title: 'Late', end: '2026-09-01' });
    addTask('early', 'v1', { title: 'Early', end: '2026-03-01' });
    addTask('tie-b', 'v1', { title: 'Same', end: '2026-04-01' });
    addTask('tie-a', 'v1', { title: 'Same', end: '2026-04-01' });
    addTask('tie-z', 'v1', { title: 'Aaa', end: '2026-04-01' });

    expect(getVendorRelations(db, 'v1').workItems.map((w) => w.id)).toEqual([
      'early',
      'tie-z',
      'tie-a',
      'tie-b',
      'late',
      'undated',
      'done',
    ]);
  });

  // Mutation: ordering by target only ignores a delivered item; missing NULL-last puts undated first.
  it('orders purchases by actual-else-target delivery date, undated last, then name, then id', () => {
    addPurchase('p-undated', 'v1', { name: 'Aaa' });
    addPurchase('p-target', 'v1', { name: 'Target', target: '2026-05-01' });
    addPurchase('p-actual', 'v1', { name: 'Actual', target: '2026-09-01', actual: '2026-04-01' });
    addPurchase('p-tie-b', 'v1', { name: 'Same', target: '2026-07-01' });
    addPurchase('p-tie-a', 'v1', { name: 'Same', target: '2026-07-01' });
    addPurchase('p-name', 'v1', { name: 'Alpha', target: '2026-07-01' });

    expect(getVendorRelations(db, 'v1').householdItems.map((h) => h.id)).toEqual([
      'p-actual',
      'p-target',
      'p-name',
      'p-tie-a',
      'p-tie-b',
      'p-undated',
    ]);
  });

  it('lists budget lines of both kinds with their parent, and an orphan line with parent null', () => {
    addTask('t1', 'v2', { title: 'Wall' });
    addPurchase('h1', 'v2', { name: 'Lamp' });
    addWorkLine('wl', 'v1', 't1', { description: 'Plaster', planned: 120 });
    addHouseholdLine('hl', 'v1', 'h1');
    addWorkLine('orphan', 'v1', null, { description: null });
    addWorkLine('other', 'v2', 't1');

    const lines = getVendorRelations(db, 'v1').budgetLines;

    expect(lines).toEqual([
      {
        id: 'hl',
        description: null,
        plannedAmount: 5,
        parent: { type: 'household_item', id: 'h1', title: 'Lamp' },
      },
      {
        id: 'wl',
        description: 'Plaster',
        plannedAmount: 120,
        parent: { type: 'work_item', id: 't1', title: 'Wall' },
      },
      { id: 'orphan', description: null, plannedAmount: 10, parent: null },
    ]);
  });

  // Mutation: title compare reversed, created_at ignored, or id tie-break dropped.
  it('orders lines by parent title, then created_at, then id; orphans last, tied among themselves', () => {
    addTask('ta', 'v2', { title: 'Bravo' });
    addTask('tb', 'v2', { title: 'Alpha' });
    addPurchase('hp', 'v2', { name: 'Alpha' });
    addWorkLine('w-late', 'v1', 'ta', { createdAt: '2026-02-01T00:00:00.000Z' });
    addWorkLine('w-early', 'v1', 'ta', { createdAt: '2026-01-01T00:00:00.000Z' });
    addWorkLine('a-2', 'v1', 'tb');
    addWorkLine('a-1', 'v1', 'tb');
    addHouseholdLine('a-h', 'v1', 'hp');
    addWorkLine('o-2', 'v1', null, { createdAt: '2026-03-01T00:00:00.000Z' });
    addWorkLine('o-1', 'v1', null, { createdAt: '2026-01-01T00:00:00.000Z' });

    const ids = getVendorRelations(db, 'v1').budgetLines.map((l) => l.id);

    expect(ids).toEqual(['a-1', 'a-2', 'a-h', 'w-early', 'w-late', 'o-1', 'o-2']);
  });

  it('sorts regardless of insertion order (orphan inserted first, newer line inserted first/last)', () => {
    addTask('ta', 'v2', { title: 'Bravo' });
    addWorkLine('z-orphan', 'v1', null);
    addWorkLine('b-old', 'v1', 'ta', { createdAt: '2026-01-01T00:00:00.000Z' });
    addWorkLine('a-new', 'v1', 'ta', { createdAt: '2026-05-01T00:00:00.000Z' });
    addWorkLine('c-same-2', 'v1', 'ta', { createdAt: '2026-06-01T00:00:00.000Z' });
    addWorkLine('c-same-1', 'v1', 'ta', { createdAt: '2026-06-01T00:00:00.000Z' });

    expect(getVendorRelations(db, 'v1').budgetLines.map((l) => l.id)).toEqual([
      'b-old',
      'a-new',
      'c-same-1',
      'c-same-2',
      'z-orphan',
    ]);
  });

  it('orders parent titles ascending when the later title was inserted last', () => {
    addTask('t-a', 'v2', { title: 'Alpha' });
    addTask('t-b', 'v2', { title: 'Bravo' });
    addWorkLine('on-alpha', 'v1', 't-a');
    addWorkLine('on-bravo', 'v1', 't-b');

    expect(getVendorRelations(db, 'v1').budgetLines.map((l) => l.id)).toEqual([
      'on-alpha',
      'on-bravo',
    ]);
  });
});
