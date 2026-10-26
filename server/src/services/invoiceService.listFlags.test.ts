import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import { ValidationError } from '../errors/AppError.js';
import * as invoiceService from './invoiceService.js';
import { NOT_YET_SPLIT_MIN_CENTS } from './shared/moneyEngine.js';
import { PAYMENT_DUE_WINDOW_DAYS } from './shared/attentionRules.js';

/**
 * Story #2238 (P4.6): the new list flags (notYetSplit, withoutDocument, refundsDue, due), the
 * `ids` rules, the invoice_number sort and the NULLs-last / id-tiebreaker ordering, the row
 * fields (deposits, openAmount, paid, remainingOnOffer, notYetSplit) and `listTotals` of
 * `listAllInvoices()`. Synthetic data only.
 *
 * Mutations these tests catch: a `due` window that gains a lower bound or counts refunds or
 * pays-out invoices; `<` instead of `<=` at today+7; a `withoutDocument` that ignores the entity
 * type; a flag that does not narrow filterMeta / chipCounts / listTotals; `ids` that honours
 * paging or filters other than its own; NULLs first in due_date / invoice_number sorts; a missing
 * id tiebreaker; listTotals computed over the page instead of all matching rows.
 */
describe('invoiceService.listAllInvoices() list flags, ids, sorts and totals (#2238)', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;
  let n = 0;
  const NOW = '2026-01-01T00:00:00.000Z';

  /** Local calendar day `offset` days from today, as the server's date('now','localtime'). */
  function day(offset: number): string {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  }

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

  type Status = 'pending' | 'paid' | 'claimed' | 'quotation';

  function invoice(
    label: string,
    opts: {
      amount?: number;
      date?: string;
      dueDate?: string | null;
      status?: Status;
      invoiceNumber?: string | null;
      vendorId?: string;
    } = {},
  ): string {
    const id = `inv-${label}`;
    db.insert(schema.invoices)
      .values({
        id,
        vendorId: opts.vendorId ?? 'vendor-1',
        invoiceNumber: opts.invoiceNumber === undefined ? `NR-${label}` : opts.invoiceNumber,
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

  function entry(
    invoiceId: string,
    opts: {
      amount?: number;
      dueDate?: string;
      status?: 'pending' | 'paid' | 'claimed';
      entryType?: 'deposit' | 'refund';
    } = {},
  ): void {
    const status = opts.status ?? 'pending';
    db.insert(schema.invoiceDeposits)
      .values({
        id: `dep-${++n}`,
        invoiceId,
        amount: opts.amount ?? 100,
        dueDate: opts.dueDate ?? '2026-02-01',
        paidDate: status === 'pending' ? null : '2026-01-20',
        claimedDate: status === 'claimed' ? '2026-01-25' : null,
        status,
        entryType: opts.entryType ?? 'deposit',
        createdAt: NOW,
        updatedAt: NOW,
      })
      .run();
  }

  function itemize(invoiceId: string, itemizedAmount: number): void {
    const budgetId = `wib-${++n}`;
    db.insert(schema.workItemBudgets)
      .values({ id: budgetId, plannedAmount: 0, createdAt: NOW, updatedAt: NOW })
      .run();
    db.insert(schema.invoiceBudgetLines)
      .values({
        id: `ibl-${++n}`,
        invoiceId,
        workItemBudgetId: budgetId,
        itemizedAmount,
        createdAt: NOW,
        updatedAt: NOW,
      })
      .run();
  }

  function linkDocument(
    entityId: string,
    entityType: 'invoice' | 'work_item' = 'invoice',
    documentId = ++n,
  ): void {
    db.insert(schema.documentLinks)
      .values({
        id: `dl-${++n}`,
        entityType,
        entityId,
        paperlessDocumentId: documentId,
        createdAt: NOW,
      })
      .run();
  }

  const list = (query: Parameters<typeof invoiceService.listAllInvoices>[1] = {}) =>
    invoiceService.listAllInvoices(db, query);
  const ids = (query: Parameters<typeof invoiceService.listAllInvoices>[1] = {}) =>
    list(query)
      .invoices.map((i) => i.id)
      .sort();

  describe('constants', () => {
    it('keeps the Not yet split floor at one unit and the due window at seven days', () => {
      expect(NOT_YET_SPLIT_MIN_CENTS).toBe(100);
      expect(PAYMENT_DUE_WINDOW_DAYS).toBe(7);
    });
  });

  describe('due', () => {
    beforeEach(() => {
      invoice('edge7', { dueDate: day(7) });
      invoice('edge8', { dueDate: day(8) });
      invoice('overdue', { dueDate: day(-30) });
      invoice('today', { dueDate: day(0) });
      invoice('undated');
      invoice('paidOverdue', { status: 'paid', dueDate: day(-3) });
      invoice('claimedOverdue', { status: 'claimed', dueDate: day(-3) });
      invoice('offerOverdue', { status: 'quotation', dueDate: day(-3) });
      // pending deposit-type entries decide the record when the record itself is not due
      const depSoon = invoice('depSoon', { dueDate: day(60) });
      entry(depSoon, { dueDate: day(7) });
      const depLate = invoice('depLate', { dueDate: day(60) });
      entry(depLate, { dueDate: day(8) });
      const depOverdue = invoice('depOverdue', { dueDate: day(60) });
      entry(depOverdue, { dueDate: day(-10) });
      const depPaid = invoice('depPaid', { dueDate: day(60) });
      entry(depPaid, { dueDate: day(-10), status: 'paid' });
      const offerDep = invoice('offerDep', { status: 'quotation', dueDate: null });
      entry(offerDep, { dueDate: day(2) });
      // a pending refund never makes a record due, on either route
      const refundOnly = invoice('refundOnly', { status: 'paid', dueDate: day(60) });
      entry(refundOnly, { dueDate: day(-5), entryType: 'refund' });
      const refundPending = invoice('refundPending', { dueDate: day(60) });
      entry(refundPending, { dueDate: day(-5), entryType: 'refund' });
    });

    it('matches records pending with a due date up to today+7 (overdue included) and pending deposits in the window', () => {
      expect(ids({ due: true })).toEqual(
        [
          'inv-edge7',
          'inv-overdue',
          'inv-today',
          'inv-depSoon',
          'inv-depOverdue',
          'inv-offerDep',
        ].sort(),
      );
    });

    it('does not match today+8, undated, paid/claimed/offer records, paid deposits or refunds', () => {
      const matched = ids({ due: true });
      for (const label of [
        'edge8',
        'undated',
        'paidOverdue',
        'claimedOverdue',
        'offerOverdue',
        'depLate',
        'depPaid',
        'refundOnly',
        'refundPending',
      ]) {
        expect(matched).not.toContain(`inv-${label}`);
      }
    });

    it('is a no-op when false or omitted', () => {
      const all = list().pagination.totalItems;
      expect(list({ due: false }).pagination.totalItems).toBe(all);
    });

    it('narrows filterMeta, chipCounts and listTotals to the due set', () => {
      const all = list({ pageSize: 100 });
      const due = list({ due: true, pageSize: 100 });

      expect(due.pagination.totalItems).toBe(6);
      expect(due.chipCounts.matching.all).toBe(6);
      expect(due.chipCounts.matching.all).toBeLessThan(all.chipCounts.matching.all);
      // totals stay "all invoices, no condition"
      expect(due.chipCounts.totals).toEqual(all.chipCounts.totals);
      // pending: edge7, overdue, today, depSoon, depOverdue (offerDep is an offer)
      expect(due.chipCounts.matching.toPay).toBe(6);
      expect(due.chipCounts.matching.offers).toBe(1);
      expect(due.listTotals.offers.count).toBe(1);
      expect(due.listTotals.offers.amount).toBe(1000);
      // 5 pending records at 1000 each; two with a pending 100 deposit; the offer has a pending
      // 100 deposit, and an offer with a progress payment to pay is open
      expect(due.listTotals.openPayable.count).toBe(6);
      expect(due.listTotals.openPayable.totalAmount).toBeLessThan(
        all.listTotals.openPayable.totalAmount,
      );
      expect(due.filterMeta.amount).toEqual({ min: 1000, max: 1000 });
    });
  });

  describe('refundsDue', () => {
    it('matches records with a pending refund only', () => {
      const pending = invoice('pendingRefund', { status: 'paid' });
      entry(pending, { entryType: 'refund', status: 'pending', amount: 40 });
      const settled = invoice('settledRefund', { status: 'paid' });
      entry(settled, { entryType: 'refund', status: 'paid', amount: 40 });
      const deposit = invoice('pendingDeposit');
      entry(deposit, { entryType: 'deposit', status: 'pending' });
      invoice('plain');

      expect(ids({ refundsDue: true })).toEqual(['inv-pendingRefund']);
      expect(list({ refundsDue: true }).chipCounts.matching.all).toBe(1);
      // the same set as summary.refundsDue
      expect(list().summary.refundsDue).toEqual({ count: 1, totalAmount: 40 });
    });

    it('narrows listTotals to the matching rows', () => {
      const a = invoice('a', { status: 'pending', amount: 500 });
      entry(a, { entryType: 'refund', amount: 10 });
      invoice('b', { status: 'pending', amount: 700 });

      const result = list({ refundsDue: true });
      expect(result.listTotals.openPayable).toEqual({ count: 1, totalAmount: 500 });
      expect(list().listTotals.openPayable).toEqual({ count: 2, totalAmount: 1200 });
    });
  });

  describe('withoutDocument', () => {
    beforeEach(() => {
      const linked = invoice('linked');
      linkDocument(linked);
      const linkedTwice = invoice('linkedTwice');
      linkDocument(linkedTwice);
      linkDocument(linkedTwice);
      invoice('bare');
      // a document on a work item with the same id string does not count for the invoice
      const other = invoice('otherType');
      linkDocument(other, 'work_item');
    });

    it('matches records without an invoice document link', () => {
      expect(ids({ withoutDocument: true })).toEqual(['inv-bare', 'inv-otherType']);
    });

    it('narrows chipCounts, listTotals and filterMeta and is a no-op when false', () => {
      const result = list({ withoutDocument: true });
      expect(result.chipCounts.matching.all).toBe(2);
      expect(result.chipCounts.totals.all).toBe(4);
      expect(result.listTotals.openPayable).toEqual({ count: 2, totalAmount: 2000 });
      expect(result.filterMeta.amount).toEqual({ min: 1000, max: 1000 });
      expect(list({ withoutDocument: false }).pagination.totalItems).toBe(4);
    });
  });

  describe('notYetSplit', () => {
    it('matches records whose remainder after itemizing is at least one unit', () => {
      const none = invoice('none', { amount: 1000 }); // no links: remainder 1000
      void none;
      const full = invoice('full', { amount: 1000 });
      itemize(full, 1000); // remainder 0
      const half = invoice('half', { amount: 1000 });
      itemize(half, 500); // remainder 500
      const cents = invoice('cents', { amount: 1000 });
      itemize(cents, 999.5); // remainder 0.50, below one unit
      const edge = invoice('edge', { amount: 1000 });
      itemize(edge, 999); // remainder exactly 1.00
      const offer = invoice('offer', { amount: 300, status: 'quotation' });
      void offer; // an offer with no lines is not yet split too

      expect(ids({ notYetSplit: true })).toEqual(
        ['inv-none', 'inv-half', 'inv-edge', 'inv-offer'].sort(),
      );
    });

    it('sums several itemized lines of one record before comparing', () => {
      const split = invoice('split', { amount: 1000 });
      itemize(split, 600);
      itemize(split, 400); // together 1000: nothing left
      const partly = invoice('partly', { amount: 1000 });
      itemize(partly, 600);
      itemize(partly, 300); // 100 left
      expect(ids({ notYetSplit: true })).toEqual(['inv-partly']);
    });

    it('flags the matching rows and no others', () => {
      invoice('open', { amount: 1000 });
      const done = invoice('done', { amount: 1000 });
      itemize(done, 1000);
      const rows = list({ pageSize: 100 }).invoices;
      expect(rows.find((r) => r.id === 'inv-open')!.notYetSplit).toBe(true);
      expect(rows.find((r) => r.id === 'inv-done')!.notYetSplit).toBe(false);
    });

    it('exposes the id set for other consumers', () => {
      invoice('open', { amount: 1000 });
      const done = invoice('done', { amount: 1000 });
      itemize(done, 1000);
      expect([...invoiceService.notYetSplitInvoiceIds(db)]).toEqual(['inv-open']);
    });

    it('narrows filterMeta, chipCounts and listTotals', () => {
      invoice('small', { amount: 200 });
      const done = invoice('done', { amount: 900 });
      itemize(done, 900);
      const result = list({ notYetSplit: true });
      expect(result.pagination.totalItems).toBe(1);
      expect(result.chipCounts.matching.all).toBe(1);
      expect(result.filterMeta.amount).toEqual({ min: 200, max: 200 });
      expect(result.listTotals.openPayable).toEqual({ count: 1, totalAmount: 200 });
    });

    it('answers an empty list when nothing is unsplit (empty JSON id set)', () => {
      const done = invoice('done', { amount: 900 });
      itemize(done, 900);
      const result = list({ notYetSplit: true });
      expect(result.invoices).toEqual([]);
      expect(result.pagination.totalItems).toBe(0);
      expect(result.listTotals.openPayable).toEqual({ count: 0, totalAmount: 0 });
      expect(result.listTotals.offers.count).toBe(0);
    });

    it('binds ids as data: an id with quotes and SQL text matches only itself', () => {
      const evil = "inv-x'); DROP TABLE invoices;--";
      db.insert(schema.invoices)
        .values({
          id: evil,
          vendorId: 'vendor-1',
          invoiceNumber: 'EVIL',
          amount: 100,
          date: '2026-01-10',
          status: 'pending',
          createdAt: NOW,
          updatedAt: NOW,
        })
        .run();
      invoice('ok', { amount: 100 });
      const done = invoice('done', { amount: 100 });
      itemize(done, 100);
      expect(list({ notYetSplit: true }).invoices.map((i) => i.id)).toEqual(
        expect.arrayContaining([evil, 'inv-ok']),
      );
      expect(list({ notYetSplit: true }).pagination.totalItems).toBe(2);
    });
  });

  describe('flags combine', () => {
    it('applies every flag together with status and amount range', () => {
      const match = invoice('match', { amount: 800, dueDate: day(1) });
      entry(match, { entryType: 'refund', amount: 5 });
      invoice('wrongAmount', { amount: 100, dueDate: day(1) });
      const hasDoc = invoice('hasDoc', { amount: 800, dueDate: day(1) });
      entry(hasDoc, { entryType: 'refund', amount: 5 });
      linkDocument(hasDoc);
      expect(
        ids({
          due: true,
          refundsDue: true,
          withoutDocument: true,
          notYetSplit: true,
          amountMin: 500,
          status: 'pending',
        }),
      ).toEqual(['inv-match']);
    });
  });

  describe('ids', () => {
    beforeEach(() => {
      for (let i = 1; i <= 5; i++) {
        invoice(`r${i}`, { amount: i * 100, date: `2026-01-0${i}` });
      }
    });

    it('returns exactly the named rows, ignoring page and pageSize', () => {
      const result = list({ ids: 'inv-r2,inv-r4', page: 3, pageSize: 1 });
      expect(result.invoices.map((i) => i.id).sort()).toEqual(['inv-r2', 'inv-r4']);
      expect(result.pagination).toEqual({ page: 1, pageSize: 100, totalItems: 2, totalPages: 1 });
    });

    it('trims ids and ignores blank ones', () => {
      const result = list({ ids: ' inv-r1 , ,, inv-r3 ,' });
      expect(result.invoices.map((i) => i.id).sort()).toEqual(['inv-r1', 'inv-r3']);
    });

    it('treats an all-blank value as absent and pages normally', () => {
      const result = list({ ids: ' , ,', pageSize: 2 });
      expect(result.invoices).toHaveLength(2);
      expect(result.pagination).toEqual({ page: 1, pageSize: 2, totalItems: 5, totalPages: 3 });
    });

    it('returns nothing for unknown ids, with zero pages', () => {
      const result = list({ ids: 'inv-nope' });
      expect(result.invoices).toEqual([]);
      expect(result.pagination).toEqual({ page: 1, pageSize: 100, totalItems: 0, totalPages: 0 });
    });

    it('still honours the other filters', () => {
      const result = list({ ids: 'inv-r1,inv-r2,inv-r3', amountMin: 200 });
      expect(result.invoices.map((i) => i.id).sort()).toEqual(['inv-r2', 'inv-r3']);
      expect(result.pagination.totalItems).toBe(2);
    });

    it('accepts exactly 100 ids and rejects 101 with a validation error', () => {
      const hundred = Array.from({ length: 100 }, (_, i) => `x-${i}`);
      expect(() => list({ ids: hundred.join(',') })).not.toThrow();
      expect(() => list({ ids: [...hundred, 'x-100'].join(',') })).toThrow(ValidationError);
    });

    it('counts only usable ids against the limit', () => {
      const hundred = Array.from({ length: 100 }, (_, i) => `x-${i}`);
      expect(() => list({ ids: `${hundred.join(',')},, ,` })).not.toThrow();
    });

    it('does not narrow summary, filterMeta, chipCounts or listTotals', () => {
      const all = list({ pageSize: 100 });
      const byIds = list({ ids: 'inv-r1' });
      expect(byIds.summary).toEqual(all.summary);
      expect(byIds.filterMeta).toEqual(all.filterMeta);
      expect(byIds.chipCounts).toEqual(all.chipCounts);
      expect(byIds.listTotals).toEqual(all.listTotals);
      expect(byIds.listTotals.openPayable.count).toBe(5);
    });
  });

  describe('sorting', () => {
    const order = (query: Parameters<typeof invoiceService.listAllInvoices>[1]) =>
      list({ pageSize: 100, ...query }).invoices.map((i) => i.id);

    it('sorts by invoice number in both directions, records without a number last', () => {
      invoice('b', { invoiceNumber: 'B-2' });
      invoice('a', { invoiceNumber: 'A-1' });
      invoice('c', { invoiceNumber: 'C-3' });
      invoice('none', { invoiceNumber: null });
      expect(order({ sortBy: 'invoice_number', sortOrder: 'asc' })).toEqual([
        'inv-a',
        'inv-b',
        'inv-c',
        'inv-none',
      ]);
      expect(order({ sortBy: 'invoice_number', sortOrder: 'desc' })).toEqual([
        'inv-c',
        'inv-b',
        'inv-a',
        'inv-none',
      ]);
    });

    it('sorts by due date in both directions, undated records last', () => {
      invoice('late', { dueDate: '2026-05-01' });
      invoice('early', { dueDate: '2026-03-01' });
      invoice('none', { dueDate: null });
      expect(order({ sortBy: 'due_date', sortOrder: 'asc' })).toEqual([
        'inv-early',
        'inv-late',
        'inv-none',
      ]);
      expect(order({ sortBy: 'due_date', sortOrder: 'desc' })).toEqual([
        'inv-late',
        'inv-early',
        'inv-none',
      ]);
    });

    it.each([
      ['date', 'asc'],
      ['date', 'desc'],
      ['amount', 'asc'],
      ['amount', 'desc'],
      ['status', 'asc'],
      ['status', 'desc'],
      ['vendor_name', 'asc'],
      ['vendor_name', 'desc'],
      ['due_date', 'asc'],
      ['due_date', 'desc'],
      ['invoice_number', 'asc'],
      ['invoice_number', 'desc'],
    ] as const)('breaks ties of sortBy=%s %s by id ascending', (sortBy, sortOrder) => {
      // identical on every sort column, so only the id decides
      invoice('c', { invoiceNumber: 'SAME', dueDate: '2026-04-01' });
      invoice('a', { invoiceNumber: 'SAME', dueDate: '2026-04-01' });
      invoice('b', { invoiceNumber: 'SAME', dueDate: '2026-04-01' });
      expect(order({ sortBy, sortOrder })).toEqual(['inv-a', 'inv-b', 'inv-c']);
    });

    it('breaks ties among undated records by id in both directions', () => {
      invoice('z', { dueDate: null });
      invoice('y', { dueDate: null });
      invoice('dated', { dueDate: '2026-04-01' });
      expect(order({ sortBy: 'due_date', sortOrder: 'asc' })).toEqual([
        'inv-dated',
        'inv-y',
        'inv-z',
      ]);
      expect(order({ sortBy: 'due_date', sortOrder: 'desc' })).toEqual([
        'inv-dated',
        'inv-y',
        'inv-z',
      ]);
    });

    it('defaults to date descending with the id tiebreaker', () => {
      invoice('old', { date: '2026-01-01' });
      invoice('new2', { date: '2026-02-01' });
      invoice('new1', { date: '2026-02-01' });
      expect(order({})).toEqual(['inv-new1', 'inv-new2', 'inv-old']);
    });

    it('pages deterministically across ties (no row repeated or lost)', () => {
      for (const label of ['e', 'd', 'c', 'b', 'a']) invoice(label, { dueDate: null });
      const seen = [1, 2, 3].flatMap((page) =>
        list({ sortBy: 'due_date', sortOrder: 'asc', page, pageSize: 2 }).invoices.map((i) => i.id),
      );
      expect(seen).toEqual(['inv-a', 'inv-b', 'inv-c', 'inv-d', 'inv-e']);
    });

    it('keeps the earliest-open-due default order for openOnly without sortBy', () => {
      invoice('later', { dueDate: '2026-06-01' });
      invoice('sooner', { dueDate: '2026-03-01' });
      expect(order({ openOnly: true })).toEqual(['inv-sooner', 'inv-later']);
    });
  });

  describe('row fields', () => {
    const row = (id: string) => list({ pageSize: 100 }).invoices.find((r) => r.id === id)!;

    it('always carries deposits and openAmount, with or without openOnly', () => {
      const a = invoice('a', { amount: 500 });
      entry(a, { amount: 100, status: 'paid' });
      entry(a, { amount: 150, status: 'pending' });
      for (const query of [{}, { openOnly: true }]) {
        const found = list({ pageSize: 100, ...query }).invoices.find((r) => r.id === a)!;
        expect(found.deposits).toHaveLength(2);
        // remainder 500 - 250 = 250 final payment + pending deposit 150
        expect(found.openAmount).toBe(400);
      }
    });

    it('paid is the money service Paid of that record, refunds netted', () => {
      invoice('paid', { status: 'paid', amount: 700 });
      invoice('claimed', { status: 'claimed', amount: 300 });
      invoice('pending', { status: 'pending', amount: 900 });
      const partial = invoice('partial', { status: 'pending', amount: 1000 });
      entry(partial, { amount: 200, status: 'paid' });
      entry(partial, { amount: 100, status: 'claimed' });
      entry(partial, { amount: 50, status: 'pending' });
      const refunded = invoice('refunded', { status: 'paid', amount: 600 });
      entry(refunded, { amount: 80, status: 'paid', entryType: 'refund' });
      const pendingRefund = invoice('pendingRefund', { status: 'paid', amount: 400 });
      entry(pendingRefund, { amount: 80, status: 'pending', entryType: 'refund' });

      expect(row('inv-paid').paid).toBe(700);
      expect(row('inv-claimed').paid).toBe(300);
      expect(row('inv-pending').paid).toBe(0);
      expect(row('inv-partial').paid).toBe(300);
      expect(row('inv-refunded').paid).toBe(520);
      expect(row('inv-pendingRefund').paid).toBe(400);
    });

    it('remainingOnOffer is set for offers only, from non-refund progress payments of any status', () => {
      invoice('offerPlain', { status: 'quotation', amount: 1000 });
      const part = invoice('offerPart', { status: 'quotation', amount: 1000 });
      entry(part, { amount: 300, status: 'paid' });
      entry(part, { amount: 200, status: 'pending' });
      entry(part, { amount: 999, status: 'paid', entryType: 'refund' });
      const over = invoice('offerOver', { status: 'quotation', amount: 100 });
      entry(over, { amount: 250, status: 'pending' });
      invoice('invoice', { status: 'pending', amount: 1000 });
      invoice('paidInvoice', { status: 'paid', amount: 1000 });

      expect(row('inv-offerPlain').remainingOnOffer).toBe(1000);
      expect(row('inv-offerPart').remainingOnOffer).toBe(500);
      expect(row('inv-offerOver').remainingOnOffer).toBe(0);
      expect(row('inv-invoice').remainingOnOffer).toBeNull();
      expect(row('inv-paidInvoice').remainingOnOffer).toBeNull();
    });

    it('a row of an offer carries paid for its paid progress payments', () => {
      const offer = invoice('offer', { status: 'quotation', amount: 1000 });
      entry(offer, { amount: 300, status: 'paid' });
      entry(offer, { amount: 200, status: 'pending' });
      expect(row('inv-offer').paid).toBe(300);
    });
  });

  describe('listTotals', () => {
    it('is over every matching row on all pages, not the page', () => {
      for (let i = 1; i <= 5; i++) invoice(`p${i}`, { amount: 100 * i });
      const page = list({ pageSize: 2 });
      expect(page.invoices).toHaveLength(2);
      expect(page.listTotals.openPayable).toEqual({ count: 5, totalAmount: 1500 });
    });

    it('openPayable follows the same rule as summary.openPayable when nothing narrows', () => {
      const a = invoice('a', { amount: 1000 });
      entry(a, { amount: 300, status: 'paid' });
      entry(a, { amount: 100, status: 'pending' });
      invoice('b', { status: 'paid', amount: 500 });
      const c = invoice('c', { status: 'paid', amount: 200 });
      entry(c, { entryType: 'refund', amount: 20 });
      const result = list();
      expect(result.listTotals.openPayable).toEqual(result.summary.openPayable);
      // a: 1000 - 400 final + 100 pending deposit = 700
      expect(result.listTotals.openPayable).toEqual({ count: 1, totalAmount: 700 });
    });

    it('is narrowed by status, search and filters (it is not the global summary)', () => {
      invoice('a', { amount: 100, invoiceNumber: 'AAA' });
      invoice('b', { amount: 400, invoiceNumber: 'BBB' });
      expect(list({ q: 'BBB' }).listTotals.openPayable).toEqual({ count: 1, totalAmount: 400 });
      expect(list({ q: 'BBB' }).summary.openPayable).toEqual({ count: 2, totalAmount: 500 });
      expect(list({ status: 'paid' }).listTotals.openPayable).toEqual({
        count: 0,
        totalAmount: 0,
      });
    });

    it('offers totals match the money service offer figures over the matching offers', () => {
      const one = invoice('one', { status: 'quotation', amount: 1000 });
      entry(one, { amount: 300, status: 'paid' });
      entry(one, { amount: 200, status: 'pending' });
      invoice('two', { status: 'quotation', amount: 500 });
      invoice('plain', { status: 'pending', amount: 9000 });

      expect(list().listTotals.offers).toEqual({
        count: 2,
        amount: 1500,
        paid: 300,
        stillToPay: 200,
        remainingOnOffer: 1000,
      });
      // narrowing to one offer by search
      expect(list({ q: 'NR-two' }).listTotals.offers).toEqual({
        count: 1,
        amount: 500,
        paid: 0,
        stillToPay: 0,
        remainingOnOffer: 500,
      });
    });

    it('is all zeros on an empty database', () => {
      const result = list();
      expect(result.listTotals).toEqual({
        openPayable: { count: 0, totalAmount: 0 },
        offers: { count: 0, amount: 0, paid: 0, stillToPay: 0, remainingOnOffer: 0 },
      });
    });
  });
});
