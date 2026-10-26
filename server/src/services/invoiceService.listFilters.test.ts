import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import * as invoiceService from './invoiceService.js';

/**
 * Integration tests for the list filters and sorts of `listAllInvoices()` (date range, due-date
 * range, amount range, sort by status / due date) and for the user and vendor lookups of
 * `toInvoice` / the list. Synthetic data only.
 */
describe('invoiceService.listAllInvoices() filters, sorts and lookups', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;
  let n = 0;
  const NOW = '2026-01-01T00:00:00.000Z';

  beforeEach(() => {
    n = 0;
    sqlite = new Database(':memory:');
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    runMigrations(sqlite);
    db = drizzle(sqlite, { schema });
    db.insert(schema.vendors)
      .values({ id: 'vendor-1', name: 'Company One', createdAt: NOW, updatedAt: NOW })
      .run();
  });

  afterEach(() => {
    sqlite.close();
  });

  function invoice(
    label: string,
    opts: {
      amount?: number;
      date?: string;
      dueDate?: string | null;
      status?: 'pending' | 'paid' | 'claimed';
      vendorId?: string;
    } = {},
  ): string {
    const id = `inv-${label}`;
    db.insert(schema.invoices)
      .values({
        id,
        vendorId: opts.vendorId ?? 'vendor-1',
        invoiceNumber: `NR-${label}`,
        amount: opts.amount ?? 1000,
        date: opts.date ?? '2026-01-10',
        dueDate: opts.dueDate ?? null,
        status: opts.status ?? 'pending',
        createdAt: NOW,
        updatedAt: NOW,
      })
      .run();
    return id;
  }

  function user(userId: string): void {
    db.insert(schema.users)
      .values({
        id: userId,
        email: `${userId}@example.test`,
        displayName: `Person ${userId}`,
        role: 'member',
        authProvider: 'local',
        passwordHash: 'hashed',
        createdAt: NOW,
        updatedAt: NOW,
      })
      .run();
  }

  function deposit(invoiceId: string, createdBy: string | null): void {
    db.insert(schema.invoiceDeposits)
      .values({
        id: `dep-${++n}`,
        invoiceId,
        amount: 100,
        dueDate: '2026-02-01',
        status: 'pending',
        entryType: 'deposit',
        createdBy,
        createdAt: NOW,
        updatedAt: NOW,
      })
      .run();
  }

  const ids = (query: Parameters<typeof invoiceService.listAllInvoices>[1]) =>
    invoiceService
      .listAllInvoices(db, { sortBy: 'amount', sortOrder: 'asc', ...query })
      .invoices.map((i) => i.id);

  describe('filters', () => {
    beforeEach(() => {
      invoice('a', { amount: 100, date: '2026-01-05', dueDate: '2026-02-01' });
      invoice('b', { amount: 200, date: '2026-02-05', dueDate: '2026-03-01' });
      invoice('c', { amount: 300, date: '2026-03-05', dueDate: '2026-04-01' });
    });

    it('dateFrom keeps invoices dated on or after the day', () => {
      expect(ids({ dateFrom: '2026-02-05' })).toEqual(['inv-b', 'inv-c']);
    });

    it('dateTo keeps invoices dated on or before the day', () => {
      expect(ids({ dateTo: '2026-02-05' })).toEqual(['inv-a', 'inv-b']);
    });

    it('dueDateFrom keeps invoices due on or after the day', () => {
      expect(ids({ dueDateFrom: '2026-03-01' })).toEqual(['inv-b', 'inv-c']);
    });

    it('dueDateTo keeps invoices due on or before the day', () => {
      expect(ids({ dueDateTo: '2026-03-01' })).toEqual(['inv-a', 'inv-b']);
    });

    it('amountMin keeps invoices of at least the amount', () => {
      expect(ids({ amountMin: 200 })).toEqual(['inv-b', 'inv-c']);
    });

    it('amountMax keeps invoices of at most the amount', () => {
      expect(ids({ amountMax: 200 })).toEqual(['inv-a', 'inv-b']);
    });

    it('combines a date window with an amount window', () => {
      expect(ids({ dateFrom: '2026-01-20', amountMax: 250 })).toEqual(['inv-b']);
    });

    it('keeps filterMeta amount bounds independent of the amount filter', () => {
      const result = invoiceService.listAllInvoices(db, { amountMin: 250 });
      expect(result.filterMeta.amount).toEqual({ min: 100, max: 300 });
      expect(result.invoices.map((i) => i.id)).toEqual(['inv-c']);
    });
  });

  describe('sorting', () => {
    it('sorts by status', () => {
      invoice('p', { status: 'pending' });
      invoice('x', { status: 'paid' });
      invoice('k', { status: 'claimed' });
      const asc = invoiceService
        .listAllInvoices(db, { sortBy: 'status', sortOrder: 'asc' })
        .invoices.map((i) => i.status);
      expect(asc).toEqual(['claimed', 'paid', 'pending']);
    });

    it('sorts by due date, undated invoices last when ascending', () => {
      invoice('late', { dueDate: '2026-05-01' });
      invoice('early', { dueDate: '2026-03-01' });
      invoice('none', { dueDate: null });
      const asc = invoiceService
        .listAllInvoices(db, { sortBy: 'due_date', sortOrder: 'asc' })
        .invoices.map((i) => i.id);
      expect(asc).toEqual(['inv-early', 'inv-late', 'inv-none']);
    });

    it('sorts by company name', () => {
      db.insert(schema.vendors)
        .values({ id: 'vendor-2', name: 'Another Company', createdAt: NOW, updatedAt: NOW })
        .run();
      invoice('one', { vendorId: 'vendor-1' });
      invoice('two', { vendorId: 'vendor-2' });
      const asc = invoiceService
        .listAllInvoices(db, { sortBy: 'vendor_name', sortOrder: 'asc' })
        .invoices.map((i) => i.id);
      expect(asc).toEqual(['inv-two', 'inv-one']);
    });
  });

  describe('lookups', () => {
    it('names the person who created a deposit, in the list and on a single invoice', () => {
      user('u-1');
      const first = invoice('first');
      const second = invoice('second');
      deposit(first, 'u-1');
      deposit(second, 'u-1');
      deposit(second, null);

      const list = invoiceService.listAllInvoices(db, { openOnly: true });
      const deposits = list.invoices.flatMap((i) => i.deposits);
      expect(deposits.filter((d) => d.createdBy?.id === 'u-1')).toHaveLength(2);
      expect(deposits.filter((d) => d.createdBy === null)).toHaveLength(1);

      const single = invoiceService.getInvoiceById(db, first);
      expect(single.deposits[0]!.createdBy).toMatchObject({ id: 'u-1' });
    });

    it('falls back to "Unknown" for the company name when the company row is gone', () => {
      sqlite.pragma('foreign_keys = OFF');
      invoice('orphan', { vendorId: 'vendor-gone' });
      const row = db.select().from(schema.invoices).all()[0]!;

      expect(invoiceService.toInvoice(db, row).vendorName).toBe('Unknown');
    });
  });
});
