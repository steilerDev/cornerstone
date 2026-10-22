import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import * as invoiceService from './invoiceService.js';

/**
 * EPIC-21 P4.2: `chipCounts` on `listAllInvoices()`.
 *
 * Synthetic fixture (V1 = "Alpha Works", V2 = "Beta Build"):
 *   #  vendor number status    date        amount deposits              due
 *   1  V1     A-1    pending   2026-01-10  1000   none                  2026-05-01
 *   2  V1     A-2    pending   2026-02-10  2000   one paid deposit
 *   3  V1     A-3    quotation 2026-01-20  3000   none
 *   4  V2     B-1    quotation 2026-03-01  4000   one pending deposit   (toPay + offers)
 *   5  V2     B-2    paid      2026-03-05  5000   one pending refund    (toPay + paid)
 *   6  V2     B-3    paid      2026-03-10  6000   none                  notes "granite countertop"
 *   7  V2     B-4    claimed   2026-03-15  7000   none
 *   8  V1     A-4    claimed   2026-04-01  8000   one pending deposit   (toPay + submitted) due 2026-06-01
 *   9  V1     A-5    quotation 2026-04-05  9000   one paid deposit
 */
describe('invoiceService.listAllInvoices() - chipCounts (EPIC-21 P4.2)', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;
  let seq = 0;
  let v1: string;
  let v2: string;

  function stamp(): string {
    return new Date(Date.UTC(2026, 0, 1, 0, 0, seq++)).toISOString();
  }

  function addVendor(name: string): string {
    const id = `vendor-${seq}`;
    db.insert(schema.vendors).values({ id, name, createdAt: stamp(), updatedAt: stamp() }).run();
    return id;
  }

  function addInvoice(
    vendorId: string,
    o: {
      number: string;
      status: 'pending' | 'paid' | 'claimed' | 'quotation';
      date: string;
      amount: number;
      dueDate?: string;
      notes?: string;
    },
  ): string {
    const id = `invoice-${seq}`;
    db.insert(schema.invoices)
      .values({
        id,
        vendorId,
        invoiceNumber: o.number,
        amount: o.amount,
        date: o.date,
        dueDate: o.dueDate ?? null,
        status: o.status,
        notes: o.notes ?? null,
        createdBy: null,
        createdAt: stamp(),
        updatedAt: stamp(),
      })
      .run();
    return id;
  }

  function addDeposit(
    invoiceId: string,
    status: 'pending' | 'paid',
    entryType: 'deposit' | 'refund' = 'deposit',
  ): void {
    db.insert(schema.invoiceDeposits)
      .values({
        id: `dep-${seq}`,
        invoiceId,
        amount: 100,
        dueDate: '2026-01-01',
        paidDate: status === 'paid' ? '2026-01-01' : null,
        claimedDate: null,
        description: null,
        status,
        entryType,
        createdBy: null,
        createdAt: stamp(),
        updatedAt: stamp(),
      })
      .run();
  }

  function seedFixture(): void {
    v1 = addVendor('Alpha Works');
    v2 = addVendor('Beta Build');
    addInvoice(v1, {
      number: 'A-1',
      status: 'pending',
      date: '2026-01-10',
      amount: 1000,
      dueDate: '2026-05-01',
    });
    const a2 = addInvoice(v1, {
      number: 'A-2',
      status: 'pending',
      date: '2026-02-10',
      amount: 2000,
    });
    addDeposit(a2, 'paid');
    addInvoice(v1, { number: 'A-3', status: 'quotation', date: '2026-01-20', amount: 3000 });
    const b1 = addInvoice(v2, {
      number: 'B-1',
      status: 'quotation',
      date: '2026-03-01',
      amount: 4000,
    });
    addDeposit(b1, 'pending');
    const b2 = addInvoice(v2, { number: 'B-2', status: 'paid', date: '2026-03-05', amount: 5000 });
    addDeposit(b2, 'pending', 'refund');
    addInvoice(v2, {
      number: 'B-3',
      status: 'paid',
      date: '2026-03-10',
      amount: 6000,
      notes: 'granite countertop',
    });
    addInvoice(v2, { number: 'B-4', status: 'claimed', date: '2026-03-15', amount: 7000 });
    const a4 = addInvoice(v1, {
      number: 'A-4',
      status: 'claimed',
      date: '2026-04-01',
      amount: 8000,
      dueDate: '2026-06-01',
    });
    addDeposit(a4, 'pending');
    const a5 = addInvoice(v1, {
      number: 'A-5',
      status: 'quotation',
      date: '2026-04-05',
      amount: 9000,
    });
    addDeposit(a5, 'paid');
  }

  const TOTALS = { toPay: 5, offers: 3, paid: 2, submitted: 2, all: 9 };
  const OUTSIDE_ALL = { offers: 2, paid: 1, submitted: 1, all: 4 };

  const chips = (q: Parameters<typeof invoiceService.listAllInvoices>[1] = {}) =>
    invoiceService.listAllInvoices(db, q).chipCounts;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    runMigrations(sqlite);
    db = drizzle(sqlite, { schema });
    seq = 0;
  });

  afterEach(() => {
    sqlite.close();
  });

  it('returns all-zero counts on an empty database', () => {
    expect(chips()).toEqual({
      matching: { toPay: 0, offers: 0, paid: 0, submitted: 0, all: 0 },
      outsideToPay: { offers: 0, paid: 0, submitted: 0, all: 0 },
      totals: { toPay: 0, offers: 0, paid: 0, submitted: 0, all: 0 },
    });
  });

  it('counts every chip definition and their overlaps with no filter', () => {
    seedFixture();
    const c = chips();
    expect(c.totals).toEqual(TOTALS);
    expect(c.matching).toEqual(TOTALS);
    expect(c.outsideToPay).toEqual(OUTSIDE_ALL);
    expect(c.outsideToPay).not.toHaveProperty('toPay');
  });

  it('counts an offer with a pending progress payment in both To pay and Offers', () => {
    v1 = addVendor('Alpha Works');
    const q = addInvoice(v1, { number: 'Q', status: 'quotation', date: '2026-01-01', amount: 100 });
    addDeposit(q, 'pending');
    const c = chips();
    expect(c.matching).toEqual({ toPay: 1, offers: 1, paid: 0, submitted: 0, all: 1 });
    expect(c.outsideToPay).toEqual({ offers: 0, paid: 0, submitted: 0, all: 0 });
  });

  it('counts a paid invoice with only a pending refund in To pay and Paid', () => {
    v1 = addVendor('Alpha Works');
    const p = addInvoice(v1, { number: 'P', status: 'paid', date: '2026-01-01', amount: 100 });
    addDeposit(p, 'pending', 'refund');
    expect(chips().matching).toEqual({ toPay: 1, offers: 0, paid: 1, submitted: 0, all: 1 });
  });

  it('does not count an offer whose deposits are all paid in To pay', () => {
    v1 = addVendor('Alpha Works');
    const q = addInvoice(v1, { number: 'Q', status: 'quotation', date: '2026-01-01', amount: 100 });
    addDeposit(q, 'paid');
    addDeposit(q, 'paid');
    const c = chips();
    expect(c.matching.toPay).toBe(0);
    expect(c.outsideToPay.offers).toBe(1);
  });

  it('counts an invoice with several pending deposits once (no join duplication)', () => {
    v1 = addVendor('Alpha Works');
    const p = addInvoice(v1, { number: 'P', status: 'pending', date: '2026-01-01', amount: 100 });
    addDeposit(p, 'pending');
    addDeposit(p, 'pending');
    addDeposit(p, 'pending', 'refund');
    expect(chips().matching).toEqual({ toPay: 1, offers: 0, paid: 0, submitted: 0, all: 1 });
  });

  describe('each filter narrows matching and leaves totals alone', () => {
    beforeEach(seedFixture);

    it('vendorId', () => {
      const c = chips({ vendorId: v2 });
      expect(c.matching).toEqual({ toPay: 2, offers: 1, paid: 2, submitted: 1, all: 4 });
      expect(c.outsideToPay).toEqual({ offers: 0, paid: 1, submitted: 1, all: 2 });
      expect(c.totals).toEqual(TOTALS);
    });

    it('q on the invoice number', () => {
      const c = chips({ q: 'B-' });
      expect(c.matching).toEqual({ toPay: 2, offers: 1, paid: 2, submitted: 1, all: 4 });
      expect(c.totals).toEqual(TOTALS);
    });

    it('q on the company name, case-insensitively', () => {
      const c = chips({ q: 'ALPHA' });
      expect(c.matching).toEqual({ toPay: 3, offers: 2, paid: 0, submitted: 1, all: 5 });
      expect(c.outsideToPay).toEqual({ offers: 2, paid: 0, submitted: 0, all: 2 });
      expect(c.totals).toEqual(TOTALS);
    });

    it('q on the description (notes)', () => {
      const c = chips({ q: 'granite' });
      expect(c.matching).toEqual({ toPay: 0, offers: 0, paid: 1, submitted: 0, all: 1 });
      expect(c.outsideToPay).toEqual({ offers: 0, paid: 1, submitted: 0, all: 1 });
      expect(c.totals).toEqual(TOTALS);
    });

    it('q matching nothing yields zero matching but full totals', () => {
      const c = chips({ q: 'zzz-no-match' });
      expect(c.matching).toEqual({ toPay: 0, offers: 0, paid: 0, submitted: 0, all: 0 });
      expect(c.outsideToPay.all).toBe(0);
      expect(c.totals).toEqual(TOTALS);
    });

    it('dateFrom and dateTo', () => {
      const c = chips({ dateFrom: '2026-03-01', dateTo: '2026-03-10' });
      expect(c.matching).toEqual({ toPay: 2, offers: 1, paid: 2, submitted: 0, all: 3 });
      expect(c.totals).toEqual(TOTALS);
    });

    it('dueDateFrom', () => {
      const c = chips({ dueDateFrom: '2026-05-15' });
      expect(c.matching).toEqual({ toPay: 1, offers: 0, paid: 0, submitted: 1, all: 1 });
      expect(c.totals).toEqual(TOTALS);
    });

    it('dueDateTo', () => {
      const c = chips({ dueDateTo: '2026-05-31' });
      expect(c.matching).toEqual({ toPay: 1, offers: 0, paid: 0, submitted: 0, all: 1 });
      expect(c.totals).toEqual(TOTALS);
    });

    it('amountMin and amountMax together', () => {
      const c = chips({ amountMin: 6000, amountMax: 8000 });
      expect(c.matching).toEqual({ toPay: 1, offers: 0, paid: 1, submitted: 2, all: 3 });
      expect(c.totals).toEqual(TOTALS);
    });

    it('amountMin alone', () => {
      expect(chips({ amountMin: 8000 }).matching.all).toBe(2);
    });

    it('amountMax alone', () => {
      expect(chips({ amountMax: 2000 }).matching).toEqual({
        toPay: 2,
        offers: 0,
        paid: 0,
        submitted: 0,
        all: 2,
      });
    });

    it('combined filters intersect', () => {
      const c = chips({ vendorId: v2, q: 'B-', amountMin: 5000, dateFrom: '2026-03-05' });
      expect(c.matching).toEqual({ toPay: 1, offers: 0, paid: 2, submitted: 1, all: 3 });
      expect(c.totals).toEqual(TOTALS);
    });
  });

  describe('status and openOnly change rows, never chipCounts', () => {
    beforeEach(seedFixture);

    it.each(['pending', 'paid', 'claimed', 'quotation'] as const)(
      'status=%s leaves chipCounts equal to the unfiltered result',
      (status) => {
        const base = chips();
        const r = invoiceService.listAllInvoices(db, { status });
        expect(r.chipCounts).toEqual(base);
        expect(r.pagination.totalItems).toBeLessThan(9);
      },
    );

    it('openOnly=true leaves chipCounts equal to the unfiltered result while narrowing rows', () => {
      const base = chips();
      const r = invoiceService.listAllInvoices(db, { openOnly: true });
      expect(r.chipCounts).toEqual(base);
      expect(r.pagination.totalItems).toBe(TOTALS.toPay);
    });

    it('status plus a filter counts the filter but not the status', () => {
      const withStatus = chips({ status: 'paid', q: 'alpha' });
      expect(withStatus).toEqual(chips({ q: 'alpha' }));
      expect(withStatus.matching.all).toBe(5);
    });

    it('openOnly with a vendor filter keeps matching at the vendor scope', () => {
      const c = chips({ openOnly: true, vendorId: v2 });
      expect(c.matching.all).toBe(4);
      expect(c.outsideToPay.all).toBe(2);
    });

    it('pagination does not change chipCounts', () => {
      expect(chips({ page: 2, pageSize: 2 })).toEqual(chips());
    });
  });

  it('keeps the matching counts consistent with the rows the list returns', () => {
    seedFixture();
    const rows = invoiceService.listAllInvoices(db, { q: 'alpha', pageSize: 100 });
    expect(rows.invoices).toHaveLength(rows.chipCounts.matching.all);
    const offers = invoiceService.listAllInvoices(db, { q: 'alpha', status: 'quotation' });
    expect(offers.invoices).toHaveLength(rows.chipCounts.matching.offers);
  });

  it('handles 60 invoices (large dataset) in one pass', () => {
    v1 = addVendor('Alpha Works');
    for (let i = 0; i < 60; i++) {
      addInvoice(v1, {
        number: `N-${i}`,
        status: (['pending', 'paid', 'claimed', 'quotation'] as const)[i % 4]!,
        date: '2026-01-01',
        amount: 100 + i,
      });
    }
    const c = chips();
    expect(c.totals).toEqual({ toPay: 15, offers: 15, paid: 15, submitted: 15, all: 60 });
    expect(c.outsideToPay).toEqual({ offers: 15, paid: 15, submitted: 15, all: 45 });
  });
});
