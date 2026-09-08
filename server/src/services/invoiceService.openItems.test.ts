import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import * as invoiceService from './invoiceService.js';
import { computeFinalPaymentAmount } from './shared/depositAggregateUtils.js';

/**
 * Integration tests for Story #2046's `openOnly` filter on `listAllInvoices()`.
 *
 * Canonical fixture set (from GitHub issue steilerDev/cornerstone#2046, UAT
 * comment 5230438835):
 *   INV-A: pending 15000, two pending deposits (5000 each) + one paid deposit (5000) -> openAmount 10000
 *   INV-B: pending 2310, no deposits -> openAmount 2310
 *   INV-C: quotation, face value 40000, one pending deposit 8000 -> openAmount 8000 (face value contributes nothing)
 *   INV-D: paid, no deposits -> excluded entirely
 *   INV-E: pending 1000, no deposits -> openAmount 1000
 *   INV-F: pending 4000, one pending refund 1200 -> openAmount 4000, refundsDue +1200
 *   Full set -> openPayable = { count: 5, totalAmount: 25310 }, refundsDue = { count: 1, totalAmount: 1200 }
 *
 * Due dates are chosen deliberately so the AC22 earliest-open-due default order
 * is A, C, B, F, E (see insertFixtureSet below).
 */
describe('invoiceService.listAllInvoices() — openOnly (Story #2046)', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;
  let timestampOffset = 0;

  function createTestDb() {
    const sqliteDb = new Database(':memory:');
    sqliteDb.pragma('journal_mode = WAL');
    sqliteDb.pragma('foreign_keys = ON');
    runMigrations(sqliteDb);
    return { sqlite: sqliteDb, db: drizzle(sqliteDb, { schema }) };
  }

  function createTestUser(email: string, displayName: string): string {
    const id = `user-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const timestamp = new Date(Date.now() + timestampOffset++).toISOString();
    db.insert(schema.users)
      .values({
        id,
        email,
        displayName,
        role: 'member',
        authProvider: 'local',
        passwordHash: 'hashed',
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run();
    return id;
  }

  function createTestVendor(name: string): string {
    const id = `vendor-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const timestamp = new Date(Date.now() + timestampOffset++).toISOString();
    db.insert(schema.vendors)
      .values({
        id,
        name,
        tradeId: null,
        phone: null,
        email: null,
        address: null,
        notes: null,
        createdBy: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run();
    return id;
  }

  function insertRawInvoice(
    vendorId: string,
    options: {
      invoiceNumber?: string | null;
      amount?: number;
      date?: string;
      dueDate?: string | null;
      status?: 'pending' | 'paid' | 'claimed';
      notes?: string | null;
    } = {},
  ): string {
    const id = `invoice-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const timestamp = new Date(Date.now() + timestampOffset++).toISOString();
    db.insert(schema.invoices)
      .values({
        id,
        vendorId,
        invoiceNumber: options.invoiceNumber ?? null,
        amount: options.amount ?? 1000,
        date: options.date ?? '2026-01-01',
        dueDate: options.dueDate ?? null,
        status: options.status ?? 'pending',
        notes: options.notes ?? null,
        createdBy: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run();
    return id;
  }

  /** Sets an invoice's status to 'quotation' — Drizzle's insert type only allows pending/paid/claimed. */
  function markQuotation(invoiceId: string): void {
    sqlite.prepare(`UPDATE invoices SET status = 'quotation' WHERE id = ?`).run(invoiceId);
  }

  function insertRawDeposit(
    invoiceId: string,
    amount: number,
    status: 'pending' | 'paid' | 'claimed',
    options: { dueDate?: string; entryType?: 'deposit' | 'refund'; createdBy?: string } = {},
  ): string {
    const id = `dep-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const ts = new Date(Date.now() + timestampOffset++).toISOString();
    db.insert(schema.invoiceDeposits)
      .values({
        id,
        invoiceId,
        amount,
        dueDate: options.dueDate ?? '2026-01-01',
        paidDate: status === 'paid' || status === 'claimed' ? '2026-01-01' : null,
        claimedDate: status === 'claimed' ? '2026-01-01' : null,
        description: null,
        status,
        entryType: options.entryType ?? 'deposit',
        createdBy: options.createdBy ?? null,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    return id;
  }

  /**
   * Inserts the canonical INV-A..F fixture set on one vendor. Due dates are
   * chosen so the AC22 default open-items order is A, C, B, F, E:
   *   A: earliest-open-due 2026-01-01 (from its earliest pending deposit)
   *   C: earliest-open-due 2026-02-01 (from its pending deposit; C is not itself pending)
   *   B: earliest-open-due 2026-03-01 (its own dueDate; no deposits)
   *   F: earliest-open-due 2026-04-01 (its own dueDate; its pending refund is due later, 2026-05-01)
   *   E: earliest-open-due 2026-06-01 (its own dueDate; no deposits)
   *   D: excluded entirely (paid, no deposits) — its due date is irrelevant.
   */
  function insertFixtureSet(vendorId: string): Record<'A' | 'B' | 'C' | 'D' | 'E' | 'F', string> {
    const a = insertRawInvoice(vendorId, {
      invoiceNumber: 'INV-A',
      status: 'pending',
      amount: 15000,
      dueDate: '2026-12-31',
    });
    insertRawDeposit(a, 5000, 'pending', { dueDate: '2026-01-01' });
    insertRawDeposit(a, 5000, 'pending', { dueDate: '2026-01-15' });
    insertRawDeposit(a, 5000, 'paid', { dueDate: '2025-12-01' });

    const b = insertRawInvoice(vendorId, {
      invoiceNumber: 'INV-B',
      status: 'pending',
      amount: 2310,
      dueDate: '2026-03-01',
    });

    const c = insertRawInvoice(vendorId, {
      invoiceNumber: 'INV-C',
      status: 'pending', // overridden to quotation below
      amount: 40000,
      dueDate: '2099-01-01', // irrelevant: C is not pending, its own dueDate never contributes
    });
    markQuotation(c);
    insertRawDeposit(c, 8000, 'pending', { dueDate: '2026-02-01' });

    const d = insertRawInvoice(vendorId, {
      invoiceNumber: 'INV-D',
      status: 'paid',
      amount: 9999,
      dueDate: '2026-01-01',
    });

    const e = insertRawInvoice(vendorId, {
      invoiceNumber: 'INV-E',
      status: 'pending',
      amount: 1000,
      dueDate: '2026-06-01',
    });

    const f = insertRawInvoice(vendorId, {
      invoiceNumber: 'INV-F',
      status: 'pending',
      amount: 4000,
      dueDate: '2026-04-01',
    });
    insertRawDeposit(f, 1200, 'pending', { dueDate: '2026-05-01', entryType: 'refund' });

    return { A: a, B: b, C: c, D: d, E: e, F: f };
  }

  beforeEach(() => {
    const testDb = createTestDb();
    sqlite = testDb.sqlite;
    db = testDb.db;
    timestampOffset = 0;
  });

  afterEach(() => {
    sqlite.close();
  });

  // ─── AC1/AC2/AC4/AC5: filtering ─────────────────────────────────────────────

  it('scenario 13: openOnly=true returns exactly {A, B, C, E, F}; D is absent', () => {
    const vendorId = createTestVendor('Open Items Vendor');
    const ids = insertFixtureSet(vendorId);

    const result = invoiceService.listAllInvoices(db, { openOnly: true, pageSize: 25 });

    const returnedIds = new Set(result.invoices.map((inv) => inv.id));
    expect(returnedIds).toEqual(new Set([ids.A, ids.B, ids.C, ids.E, ids.F]));
    expect(returnedIds.has(ids.D)).toBe(false);
  });

  it('scenario 14: openOnly omitted is unchanged from pre-story behavior — deposits:[], no openAmount property', () => {
    const vendorId = createTestVendor('Regression Vendor');
    insertFixtureSet(vendorId);

    const withFlagOmitted = invoiceService.listAllInvoices(db, {});
    const withFlagUndefined = invoiceService.listAllInvoices(db, { openOnly: undefined });

    expect(withFlagOmitted.pagination.totalItems).toBe(withFlagUndefined.pagination.totalItems);
    expect(withFlagOmitted.invoices).toHaveLength(6); // all 6 invoices, unfiltered
    for (const inv of withFlagOmitted.invoices) {
      expect(inv.deposits).toEqual([]);
      expect(inv).not.toHaveProperty('openAmount');
    }
  });

  it('scenario 15: openOnly=true — deposits[] contains ALL of a invoice A entries incl. the paid one, ordered by dueDate then createdAt', () => {
    const vendorId = createTestVendor('Deposits Population Vendor');
    const ids = insertFixtureSet(vendorId);

    const result = invoiceService.listAllInvoices(db, { openOnly: true, pageSize: 25 });
    const invoiceA = result.invoices.find((inv) => inv.id === ids.A)!;

    expect(invoiceA.deposits).toHaveLength(3); // 2 pending + 1 paid, not pending-only
    expect(invoiceA.deposits.map((d) => d.status)).toEqual(
      expect.arrayContaining(['pending', 'pending', 'paid']),
    );
    // Ordered by dueDate ascending: paid one (2025-12-01) first, then the two pending (01-01, 01-15)
    expect(invoiceA.deposits.map((d) => d.dueDate)).toEqual([
      '2025-12-01',
      '2026-01-01',
      '2026-01-15',
    ]);
  });

  it('scenario 15b: deposit createdBy is resolved to a user summary, and the memoisation cache is exercised when two deposits share the same creator', () => {
    const vendorId = createTestVendor('Deposit CreatedBy Vendor');
    const userId = createTestUser('depositor@test.com', 'Depositor User');
    const invoiceId = insertRawInvoice(vendorId, {
      invoiceNumber: 'INV-CREATOR',
      status: 'pending',
      amount: 1000,
      dueDate: '2026-01-01',
    });
    // Two deposits from the SAME user: the first is a cache miss (queries `users`),
    // the second is a cache hit (resolveCreatedBy's userCache short-circuit) — this
    // exercises both branches of that memoisation helper in listAllInvoices().
    insertRawDeposit(invoiceId, 100, 'pending', { dueDate: '2026-01-01', createdBy: userId });
    insertRawDeposit(invoiceId, 200, 'pending', { dueDate: '2026-01-02', createdBy: userId });

    const result = invoiceService.listAllInvoices(db, { openOnly: true, pageSize: 25 });
    const invoice = result.invoices.find((inv) => inv.id === invoiceId)!;

    expect(invoice.deposits).toHaveLength(2);
    for (const deposit of invoice.deposits) {
      expect(deposit.createdBy).toEqual({
        id: userId,
        displayName: 'Depositor User',
        email: 'depositor@test.com',
      });
    }
  });

  // ─── AC22/AC23/AC24: ordering ───────────────────────────────────────────────

  it('scenario 16: default order with openOnly=true and no explicit sortBy is A, C, B, F, E (earliest-open-due ascending)', () => {
    const vendorId = createTestVendor('Ordering Vendor');
    const ids = insertFixtureSet(vendorId);

    const result = invoiceService.listAllInvoices(db, { openOnly: true, pageSize: 25 });

    expect(result.invoices.map((inv) => inv.id)).toEqual([ids.A, ids.C, ids.B, ids.F, ids.E]);
  });

  it('scenario 17: explicit sortBy=amount,desc overrides the AC22 default order', () => {
    const vendorId = createTestVendor('Explicit Sort Vendor');
    const ids = insertFixtureSet(vendorId);

    const result = invoiceService.listAllInvoices(db, {
      openOnly: true,
      sortBy: 'amount',
      sortOrder: 'desc',
      pageSize: 25,
    });

    // Amount desc: C(40000) > A(15000) > F(4000) > B(2310) > E(1000)
    expect(result.invoices.map((inv) => inv.id)).toEqual([ids.C, ids.A, ids.F, ids.B, ids.E]);
    expect(result.invoices.map((inv) => inv.id)).not.toEqual([ids.A, ids.C, ids.B, ids.F, ids.E]);
  });

  it('scenario 18: sortOrder=desc with no sortBy does NOT leak into the default order — still ascending earliest-open-due', () => {
    const vendorId = createTestVendor('SortOrder Leak Guard Vendor');
    const ids = insertFixtureSet(vendorId);

    const result = invoiceService.listAllInvoices(db, {
      openOnly: true,
      sortOrder: 'desc',
      pageSize: 25,
    });

    expect(result.invoices.map((inv) => inv.id)).toEqual([ids.A, ids.C, ids.B, ids.F, ids.E]);
  });

  it('scenario 23 (via fixture): null-dueDate open invoice with no pending-deposit due dates sorts last', () => {
    const vendorId = createTestVendor('Null Due Date Vendor');
    const dated = insertRawInvoice(vendorId, {
      invoiceNumber: 'DATED',
      status: 'pending',
      amount: 100,
      dueDate: '2026-01-01',
    });
    const undated = insertRawInvoice(vendorId, {
      invoiceNumber: 'UNDATED',
      status: 'pending',
      amount: 200,
      dueDate: null,
    });

    const result = invoiceService.listAllInvoices(db, { openOnly: true, pageSize: 25 });

    expect(result.invoices.map((inv) => inv.id)).toEqual([dated, undated]);
  });

  // ─── AC4: pagination ────────────────────────────────────────────────────────

  it('scenario 19: 30 open invoices with 2 pending deposits each — pagination counts invoices only, not deposit rows', () => {
    const vendorId = createTestVendor('Pagination Vendor');
    for (let i = 0; i < 30; i++) {
      const invId = insertRawInvoice(vendorId, {
        invoiceNumber: `PG-${i}`,
        status: 'pending',
        amount: 100 + i,
        dueDate: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
      });
      insertRawDeposit(invId, 10, 'pending', { dueDate: '2026-02-01' });
      insertRawDeposit(invId, 20, 'pending', { dueDate: '2026-02-02' });
    }

    const result = invoiceService.listAllInvoices(db, { openOnly: true, page: 1, pageSize: 25 });

    expect(result.pagination.totalItems).toBe(30);
    expect(result.pagination.totalPages).toBe(2);
    expect(result.invoices).toHaveLength(25);
  });

  it('scenario 20: pagination order is deterministic across repeated calls (invoice-id tiebreak on identical earliest-open-due)', () => {
    const vendorId = createTestVendor('Tiebreak Vendor');
    const id1 = insertRawInvoice(vendorId, {
      invoiceNumber: 'TIE-1',
      status: 'pending',
      amount: 100,
      dueDate: '2026-05-01',
    });
    const id2 = insertRawInvoice(vendorId, {
      invoiceNumber: 'TIE-2',
      status: 'pending',
      amount: 200,
      dueDate: '2026-05-01', // identical earliest-open-due to id1
    });

    const call1 = invoiceService.listAllInvoices(db, { openOnly: true, pageSize: 25 });
    const call2 = invoiceService.listAllInvoices(db, { openOnly: true, pageSize: 25 });

    const order1 = call1.invoices.map((inv) => inv.id);
    const order2 = call2.invoices.map((inv) => inv.id);
    expect(order1).toEqual(order2);

    const expectedTieOrder = [id1, id2].sort();
    const tieOrderInResult = order1.filter((id) => id === id1 || id === id2);
    expect(tieOrderInResult).toEqual(expectedTieOrder);
  });

  // ─── AC8/AC16: composition with other filters; summary stays global ────────

  it('scenario 21: openOnly composed with vendorId narrows the rows but summary.openPayable stays global', () => {
    const vendorA = createTestVendor('Vendor A (filtered)');
    const vendorB = createTestVendor('Vendor B (other)');
    insertFixtureSet(vendorA);
    const otherOpen = insertRawInvoice(vendorB, {
      invoiceNumber: 'OTHER-OPEN',
      status: 'pending',
      amount: 500,
      dueDate: '2026-01-01',
    });

    const filtered = invoiceService.listAllInvoices(db, {
      openOnly: true,
      vendorId: vendorA,
      pageSize: 25,
    });
    const unfiltered = invoiceService.listAllInvoices(db, { openOnly: true, pageSize: 25 });

    // Filtered rows: only vendorA's open invoices (5, from the fixture set)
    expect(filtered.invoices).toHaveLength(5);
    expect(filtered.invoices.some((inv) => inv.id === otherOpen)).toBe(false);

    // Summary is global — identical between the filtered and unfiltered calls
    expect(filtered.summary.openPayable).toEqual(unfiltered.summary.openPayable);
    expect(filtered.summary.refundsDue).toEqual(unfiltered.summary.refundsDue);
  });

  it('scenario 22: summary.openPayable/refundsDue are byte-identical across four filter combinations', () => {
    const vendorId = createTestVendor('Summary Stability Vendor');
    insertFixtureSet(vendorId);

    const callA = invoiceService.listAllInvoices(db, {});
    const callB = invoiceService.listAllInvoices(db, { openOnly: true });
    const callC = invoiceService.listAllInvoices(db, { status: 'pending' });
    const callD = invoiceService.listAllInvoices(db, { openOnly: true, vendorId });

    expect(callB.summary.openPayable).toEqual(callA.summary.openPayable);
    expect(callC.summary.openPayable).toEqual(callA.summary.openPayable);
    expect(callD.summary.openPayable).toEqual(callA.summary.openPayable);

    expect(callB.summary.refundsDue).toEqual(callA.summary.refundsDue);
    expect(callC.summary.refundsDue).toEqual(callA.summary.refundsDue);
    expect(callD.summary.refundsDue).toEqual(callA.summary.refundsDue);

    expect(callA.summary.openPayable).toEqual({ count: 5, totalAmount: 25310 });
    expect(callA.summary.refundsDue).toEqual({ count: 1, totalAmount: 1200 });
  });

  it('scenario 22b: summary.pending/summary.overdue are unaffected by the new openOnly code path', () => {
    const vendorId = createTestVendor('Pending Overdue Unaffected Vendor');
    insertFixtureSet(vendorId);

    const withoutOpenOnly = invoiceService.listAllInvoices(db, {});
    const withOpenOnly = invoiceService.listAllInvoices(db, { openOnly: true });

    expect(withOpenOnly.summary.pending).toEqual(withoutOpenOnly.summary.pending);
    expect(withOpenOnly.summary.overdue).toEqual(withoutOpenOnly.summary.overdue);
  });

  // ─── AC35: finalPaymentAmount unchanged ────────────────────────────────────

  it('scenario 24: finalPaymentAmount on every returned invoice matches computeFinalPaymentAmount independently', () => {
    const vendorId = createTestVendor('Final Payment Cross-Check Vendor');
    insertFixtureSet(vendorId);

    const result = invoiceService.listAllInvoices(db, { openOnly: true, pageSize: 25 });

    for (const inv of result.invoices) {
      const expected = computeFinalPaymentAmount(
        inv.amount,
        inv.deposits.map((d) => ({ amount: d.amount, status: d.status, entryType: d.entryType })),
      );
      expect(inv.finalPaymentAmount).toBe(expected);
    }

    // Spot-check INV-A specifically: 15000 - (5000+5000+5000 deposit-type, any status) = 0
    const invoiceA = result.invoices.find((inv) => inv.invoiceNumber === 'INV-A')!;
    expect(invoiceA.finalPaymentAmount).toBe(0);
  });
});
