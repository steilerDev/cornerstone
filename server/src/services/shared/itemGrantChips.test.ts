/**
 * loadGrantChips (#2242, AC6): batched grant chips for task / purchase list pages.
 *
 * Mutations these tests catch: rejected grants kept; chips unsorted; an id without grants missing
 * from the map; the wrong link table queried per kind; ids of another page leaking in.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../../db/migrate.js';
import * as schema from '../../db/schema.js';
import { createMoneySeed } from '../../test/moneyDb.js';
import { loadGrantChips } from './itemGrantChips.js';

describe('loadGrantChips', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    runMigrations(sqlite);
    db = drizzle(sqlite, { schema });
    const seed = createMoneySeed(db);
    seed.workItem('wi-1');
    seed.workItem('wi-2');
    seed.workItem('wi-3');
    seed.householdItem('hi-1');
    seed.grant('sp-2', { value: 20, workItems: ['wi-1'], householdItems: ['hi-1'] });
    seed.grant('sp-1', { value: 10, type: 'fixed', workItems: ['wi-1', 'wi-3'] });
    seed.grant('sp-x', { status: 'rejected', workItems: ['wi-1'] });
  });

  afterEach(() => {
    sqlite.close();
  });

  it('returns an empty map without touching the database for no ids', () => {
    expect(loadGrantChips(db, 'work_item', []).size).toBe(0);
  });

  it('gives every requested id an entry, sorted by grant name, rejected grants excluded', () => {
    const chips = loadGrantChips(db, 'work_item', ['wi-1', 'wi-2']);

    expect([...chips.keys()]).toEqual(['wi-1', 'wi-2']);
    expect(chips.get('wi-1')).toEqual([
      { id: 'sp-1', name: 'Grant sp-1', reductionType: 'fixed', rate: 10 },
      { id: 'sp-2', name: 'Grant sp-2', reductionType: 'percentage', rate: 20 },
    ]);
    expect(chips.get('wi-2')).toEqual([]);
  });

  it('only loads the requested page of ids', () => {
    expect(loadGrantChips(db, 'work_item', ['wi-3']).get('wi-3')).toHaveLength(1);
    expect(loadGrantChips(db, 'work_item', ['wi-3']).has('wi-1')).toBe(false);
  });

  it('reads the purchase link table for household items', () => {
    const chips = loadGrantChips(db, 'household_item', ['hi-1']);
    expect(chips.get('hi-1')?.map((c) => c.id)).toEqual(['sp-2']);
  });
});
