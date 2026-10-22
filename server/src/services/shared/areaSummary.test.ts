/**
 * createAreaResolver: area summaries with ancestors, resolved in memory from one area query.
 *
 * Mutations these tests catch:
 *  - a null or unknown area id returning something other than null;
 *  - ancestors missing, in the wrong order (root first), or including the area itself;
 *  - the cache returning a different object per call, or a stale summary after an area changes
 *    (a resolver is built per request, so a later rename must not leak into an older resolver);
 *  - more than one area query per resolver.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../../db/migrate.js';
import * as schema from '../../db/schema.js';
import { createAreaResolver } from './areaSummary.js';

const STAMP = '2026-03-01T00:00:00.000Z';
const ts = { createdAt: STAMP, updatedAt: STAMP };

describe('createAreaResolver', () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle<typeof schema>>;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    runMigrations(sqlite);
    db = drizzle(sqlite, { schema });
    db.insert(schema.areas)
      .values({
        id: 'a-1',
        name: 'Building',
        parentId: null,
        sortOrder: 0,
        color: '#112233',
        ...ts,
      })
      .run();
    db.insert(schema.areas)
      .values({ id: 'a-2', name: 'Ground floor', parentId: 'a-1', sortOrder: 0, ...ts })
      .run();
    db.insert(schema.areas)
      .values({
        id: 'a-3',
        name: 'Kitchen',
        parentId: 'a-2',
        sortOrder: 0,
        color: '#445566',
        ...ts,
      })
      .run();
  });

  afterEach(() => {
    sqlite.close();
  });

  it('returns null for a null id', () => {
    expect(createAreaResolver(db)(null)).toBeNull();
  });

  it('returns null for an id that matches no area', () => {
    expect(createAreaResolver(db)('a-gone')).toBeNull();
  });

  it('resolves a root area with its colour and no ancestors', () => {
    expect(createAreaResolver(db)('a-1')).toEqual({
      id: 'a-1',
      name: 'Building',
      color: '#112233',
      ancestors: [],
    });
  });

  it('resolves a nested area with its ancestors, root first, and not itself', () => {
    expect(createAreaResolver(db)('a-3')).toEqual({
      id: 'a-3',
      name: 'Kitchen',
      color: '#445566',
      ancestors: [
        { id: 'a-1', name: 'Building', color: '#112233' },
        { id: 'a-2', name: 'Ground floor', color: null },
      ],
    });
  });

  it('returns the same object for repeated lookups of one area (cached)', () => {
    const resolve = createAreaResolver(db);
    expect(resolve('a-2')).toBe(resolve('a-2'));
    expect(resolve('a-2')).not.toBe(resolve('a-3'));
  });

  it('does not cache a miss as a hit, and keeps answering null for it', () => {
    const resolve = createAreaResolver(db);
    expect(resolve('a-gone')).toBeNull();
    expect(resolve('a-gone')).toBeNull();
    expect(resolve('a-1')).not.toBeNull();
  });

  it('loads the areas once per resolver: a later rename does not change an earlier resolver', () => {
    const before = createAreaResolver(db);
    sqlite.prepare("UPDATE areas SET name = 'Renamed' WHERE id = 'a-1'").run();
    expect(before('a-1')?.name).toBe('Building');
    expect(createAreaResolver(db)('a-1')?.name).toBe('Renamed');
  });
});
