/**
 * Tests for diaryService.resolveSourceEntity: the title and existence of a History/diary source
 * entity per type, including the `vendor` subject added by #2244. Real in-memory SQLite.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import { resolveSourceEntity } from './diaryService.js';

describe('diaryService.resolveSourceEntity', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;
  const AT = '2026-01-01T00:00:00.000Z';

  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    runMigrations(sqlite);
    db = drizzle(sqlite, { schema });
    db.insert(schema.vendors)
      .values({ id: 'co-1', name: 'Company One', createdAt: AT, updatedAt: AT })
      .run();
  });

  afterEach(() => {
    if (sqlite.open) sqlite.close();
  });

  // Mutation: a missing `vendor` case falls to the default and returns exists undefined.
  it("resolves a 'vendor' to the company name", () => {
    expect(resolveSourceEntity(db, 'vendor', 'co-1')).toEqual({
      title: 'Company One',
      exists: true,
    });
  });

  it("reports a deleted 'vendor' as not existing with no title", () => {
    expect(resolveSourceEntity(db, 'vendor', 'co-gone')).toEqual({ title: null, exists: false });
  });

  it('resolves the other subject types by their title field', () => {
    db.insert(schema.workItems)
      .values({ id: 'wi-1', title: 'Screed', status: 'not_started', createdAt: AT, updatedAt: AT })
      .run();
    db.insert(schema.invoices)
      .values({
        id: 'inv-1',
        vendorId: 'co-1',
        amount: 1,
        date: '2026-01-01',
        status: 'pending',
        invoiceNumber: 'R-1',
        createdAt: AT,
        updatedAt: AT,
      })
      .run();
    db.insert(schema.budgetSources)
      .values({
        id: 'src-1',
        name: 'Loan Alpha',
        sourceType: 'bank_loan',
        totalAmount: 1,
        isDiscretionary: false,
        status: 'active',
        createdAt: AT,
        updatedAt: AT,
      })
      .run();

    expect(resolveSourceEntity(db, 'work_item', 'wi-1')).toEqual({ title: 'Screed', exists: true });
    expect(resolveSourceEntity(db, 'invoice', 'inv-1')).toEqual({ title: 'R-1', exists: true });
    expect(resolveSourceEntity(db, 'budget_source', 'src-1')).toEqual({
      title: 'Loan Alpha',
      exists: true,
    });
    expect(resolveSourceEntity(db, 'milestone', '99')).toEqual({ title: null, exists: false });
    expect(resolveSourceEntity(db, 'subsidy_program', 'sp-x')).toEqual({
      title: null,
      exists: false,
    });
  });

  it('returns exists undefined for an unknown type, null type or null id', () => {
    expect(resolveSourceEntity(db, 'unknown_type', 'x')).toEqual({
      title: null,
      exists: undefined,
    });
    expect(resolveSourceEntity(db, null, 'x')).toEqual({ title: null, exists: undefined });
    expect(resolveSourceEntity(db, 'vendor', null)).toEqual({ title: null, exists: undefined });
  });

  it('resolves nothing instead of throwing when the lookup fails', () => {
    sqlite.close();

    expect(resolveSourceEntity(db, 'vendor', 'co-1')).toEqual({ title: null, exists: undefined });
  });
});
