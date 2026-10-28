/**
 * DB-level tests of the money service (ADR-039, #2228): the queries, orphans, ordering, funding
 * sources, ready to submit and the per-item payback. Fresh in-memory database per test with the
 * real migrations. The AC8 fixture and the cross-consumer consistency test are in
 * `moneyService.fixture.test.ts`.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import {
  computeProjectMoney,
  getBreakdownMoney,
  getExpectedCostByWorkItem,
  getExpectedGrantsByHouseholdItem,
  getItemGrantPayback,
  getReadyToSubmit,
  listOpenPayments,
  loadMoneyInput,
} from './moneyService.js';
import { getBudgetSourceById } from './budgetSourceService.js';
import { listAllInvoices } from './invoiceService.js';
import { getSourceReport } from './sourceReportService.js';

const VAT = 0.19;
const NOW = '2026-01-01T00:00:00.000Z';
const ts = { createdAt: NOW, updatedAt: NOW };

type Conf = 'own_estimate' | 'professional_estimate' | 'quote' | 'invoice';
type SourceType = 'bank_loan' | 'credit_line' | 'savings' | 'other';

describe('moneyService', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;
  let n = 0;
  const id = (prefix: string) => `${prefix}-${++n}`;

  beforeEach(() => {
    n = 0;
    sqlite = new Database(':memory:');
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    runMigrations(sqlite);
    db = drizzle(sqlite, { schema });
    db.insert(schema.vendors)
      .values({ id: 'vendor', name: 'Company One', ...ts })
      .run();
  });

  afterEach(() => {
    sqlite.close();
  });

  // ─── Seed helpers ──────────────────────────────────────────────────────────

  function source(
    sourceId: string,
    sourceType: SourceType,
    totalAmount: number,
    status: 'active' | 'exhausted' | 'closed' = 'active',
  ): string {
    db.insert(schema.budgetSources)
      .values({ id: sourceId, name: `Source ${sourceId}`, sourceType, totalAmount, status, ...ts })
      .run();
    return sourceId;
  }

  function workItem(itemId = id('wi'), areaId: string | null = null): string {
    db.insert(schema.workItems)
      .values({ id: itemId, title: `Task ${itemId}`, status: 'not_started', areaId, ...ts })
      .run();
    return itemId;
  }

  function householdItem(itemId = id('hi'), areaId: string | null = null): string {
    db.insert(schema.householdItems)
      .values({
        id: itemId,
        name: `Purchase ${itemId}`,
        categoryId: 'hic-furniture',
        areaId,
        ...ts,
      })
      .run();
    return itemId;
  }

  interface LineOpts {
    planned?: number;
    confidence?: Conf;
    includesVat?: boolean;
    source?: string | null;
    category?: string | null;
  }

  function wiLine(workItemId: string | null, opts: LineOpts = {}): string {
    const lineId = id('wl');
    db.insert(schema.workItemBudgets)
      .values({
        id: lineId,
        workItemId,
        plannedAmount: opts.planned ?? 1000,
        confidence: opts.confidence ?? 'invoice',
        includesVat: opts.includesVat ?? true,
        budgetSourceId: opts.source ?? null,
        budgetCategoryId: opts.category ?? null,
        ...ts,
      })
      .run();
    return lineId;
  }

  function hiLine(householdItemId: string, opts: LineOpts = {}): string {
    const lineId = id('hl');
    db.insert(schema.householdItemBudgets)
      .values({
        id: lineId,
        householdItemId,
        plannedAmount: opts.planned ?? 1000,
        confidence: opts.confidence ?? 'invoice',
        includesVat: opts.includesVat ?? true,
        budgetSourceId: opts.source ?? null,
        budgetCategoryId: opts.category ?? null,
        ...ts,
      })
      .run();
    return lineId;
  }

  function invoice(
    amount: number,
    status: 'quotation' | 'pending' | 'paid' | 'claimed' = 'pending',
  ): string {
    const invoiceId = id('inv');
    db.insert(schema.invoices)
      .values({ id: invoiceId, vendorId: 'vendor', amount, status, date: '2026-01-10', ...ts })
      .run();
    return invoiceId;
  }

  function link(
    invoiceId: string,
    lineId: string,
    kind: 'work_item' | 'household_item',
    itemizedAmount: number,
  ): void {
    db.insert(schema.invoiceBudgetLines)
      .values({
        id: id('ibl'),
        invoiceId,
        workItemBudgetId: kind === 'work_item' ? lineId : null,
        householdItemBudgetId: kind === 'household_item' ? lineId : null,
        itemizedAmount,
        ...ts,
      })
      .run();
  }

  function deposit(
    invoiceId: string,
    amount: number,
    status: 'pending' | 'paid' | 'claimed',
    opts: { entryType?: 'deposit' | 'refund'; sourceId?: string | null } = {},
  ): void {
    db.insert(schema.invoiceDeposits)
      .values({
        id: id('dep'),
        invoiceId,
        amount,
        status,
        entryType: opts.entryType ?? 'deposit',
        budgetSourceId: opts.sourceId ?? null,
        dueDate: '2026-02-01',
        ...ts,
      })
      .run();
  }

  function grant(
    grantId: string,
    opts: {
      status?: 'eligible' | 'applied' | 'approved' | 'received' | 'rejected';
      type?: 'percentage' | 'fixed';
      value?: number;
      cap?: number | null;
      workItems?: string[];
      householdItems?: string[];
      categories?: string[];
      noCategory?: boolean;
    } = {},
  ): void {
    db.insert(schema.subsidyPrograms)
      .values({
        id: grantId,
        name: `Grant ${grantId}`,
        reductionType: opts.type ?? 'percentage',
        reductionValue: opts.value ?? 10,
        maximumAmount: opts.cap ?? null,
        applicationStatus: opts.status ?? 'approved',
        includesNoCategoryItems: opts.noCategory ? 1 : 0,
        ...ts,
      })
      .run();
    for (const budgetCategoryId of opts.categories ?? []) {
      db.insert(schema.subsidyProgramCategories)
        .values({ subsidyProgramId: grantId, budgetCategoryId })
        .run();
    }
    for (const workItemId of opts.workItems ?? []) {
      db.insert(schema.workItemSubsidies).values({ workItemId, subsidyProgramId: grantId }).run();
    }
    for (const householdItemId of opts.householdItems ?? []) {
      db.insert(schema.householdItemSubsidies)
        .values({ householdItemId, subsidyProgramId: grantId })
        .run();
    }
  }

  const summary = () => computeProjectMoney(db, VAT).summary;

  // ─── Empty database ────────────────────────────────────────────────────────

  describe('empty database', () => {
    it('has every figure at 0, no verdict, and only the seeded discretionary source', () => {
      const s = summary();
      expect(s.expectedCost).toEqual({ expected: 0, best: 0, worst: 0 });
      expect(s.expectedGrants).toEqual({ expected: 0, best: 0, worst: 0 });
      expect(s.possibleGrants).toEqual({ expected: 0, best: 0, worst: 0 });
      expect(s.afterGrants).toEqual({ expected: 0, best: 0, worst: 0 });
      expect(s.leftToSpend).toEqual({ expected: 0, best: 0, worst: 0, verdict: null });
      expect(s.fundingTotal).toBe(0);
      expect(s.paid).toBe(0);
      expect(s.stillToPay).toBe(0);
      expect(s.stillToPayCount).toBe(0);
      expect(s.notYetSplit).toEqual({ amount: 0, recordCount: 0 });
      expect(s.readyToSubmit).toEqual({ count: 0, amount: 0 });
      expect(s.records.offers).toEqual({
        count: 0,
        amount: 0,
        paid: 0,
        stillToPay: 0,
        remainingOnOffer: 0,
      });
      expect(s.records.invoices.count).toBe(0);
      expect(s.grants).toEqual([]);
      expect(s.byArea).toEqual([]);
      expect(s.byType.work_items.expectedCost.expected).toBe(0);
      expect(s.sources).toHaveLength(1);
      expect(s.sources[0]).toMatchObject({
        id: 'discretionary-system',
        isDiscretionary: true,
        amount: 0,
        allocated: 0,
        readyToSubmit: { count: 0, amount: 0 },
      });
      expect(Object.is(s.leftToSpend.expected, 0)).toBe(true);
    });

    it('returns empty breakdown money and an empty grant map', () => {
      const bm = getBreakdownMoney(computeProjectMoney(db, VAT));
      expect(bm.workItems).toEqual({});
      expect(bm.householdItems).toEqual({});
      expect(bm.orphanLines.expectedCost.expected).toBe(0);
      expect(getExpectedGrantsByHouseholdItem(db, VAT).size).toBe(0);
    });
  });

  // ─── Lines, orphans, VAT ───────────────────────────────────────────────────

  describe('lines', () => {
    it('counts orphan work-item lines in cost, by type, the null area and the source allocation', () => {
      source('src-a', 'bank_loan', 10000);
      const wi = workItem();
      wiLine(wi, { planned: 500, source: 'src-a' });
      wiLine(null, { planned: 200, source: 'src-a' });
      const s = summary();
      expect(s.expectedCost.expected).toBe(700);
      expect(s.byType.work_items.expectedCost.expected).toBe(700);
      expect(s.byType.household_items.expectedCost.expected).toBe(0);
      expect(s.byArea).toHaveLength(1);
      expect(s.byArea[0]).toMatchObject({ areaId: null });
      expect(s.byArea[0]!.expectedCost.expected).toBe(700);
      expect(s.sources.find((x) => x.id === 'src-a')!.allocated).toBe(700);
      const bm = getBreakdownMoney(computeProjectMoney(db, VAT));
      expect(bm.orphanLines.expectedCost.expected).toBe(200);
      expect(bm.workItems[wi]!.expectedCost.expected).toBe(500);
    });

    it('grosses up a net line with the VAT rate and keeps a gross line as stored', () => {
      const wi = workItem();
      wiLine(wi, { planned: 100, includesVat: false });
      wiLine(wi, { planned: 100, includesVat: true });
      expect(summary().expectedCost.expected).toBe(219);
    });

    it('uses the itemized amount of a linked line (offers included) at face value', () => {
      const wi = workItem();
      const line = wiLine(wi, { planned: 5000, confidence: 'quote' });
      const offer = invoice(1200, 'quotation');
      link(offer, line, 'work_item', 1100);
      const s = summary();
      // the line costs 1,100.00 in every scenario; the 100.00 left on the offer is not yet split
      expect(s.expectedCost).toEqual({ expected: 1200, best: 1200, worst: 1200 });
      expect(getBreakdownMoney(computeProjectMoney(db, VAT)).workItems[wi]!.expectedCost).toEqual({
        expected: 1100,
        best: 1100,
        worst: 1100,
      });
      expect(s.notYetSplit).toEqual({ amount: 100, recordCount: 1 });
    });

    it('loads areas, items and funding into the input', () => {
      db.insert(schema.areas)
        .values({ id: 'ar-1', name: 'Area One', parentId: null, sortOrder: 2, ...ts })
        .run();
      workItem('wi-x', 'ar-1');
      householdItem('hi-x', null);
      source('src-a', 'bank_loan', 1000);
      const input = loadMoneyInput(db, VAT);
      expect(input.areas).toEqual([{ id: 'ar-1', parentId: null, sortOrder: 2, name: 'Area One' }]);
      expect(input.items).toEqual(
        expect.arrayContaining([
          { kind: 'work_item', id: 'wi-x', areaId: 'ar-1' },
          { kind: 'household_item', id: 'hi-x', areaId: null },
        ]),
      );
      expect(input.activeSourceCount).toBe(2);
      expect(input.fundingTotalCents).toBe(100000);
    });

    it('rolls an item up into its area', () => {
      db.insert(schema.areas)
        .values({ id: 'ar-1', name: 'Area One', parentId: null, ...ts })
        .run();
      wiLine(workItem('wi-x', 'ar-1'), { planned: 300 });
      hiLine(householdItem('hi-x', 'ar-1'), { planned: 50 });
      const s = summary();
      expect(s.byArea.map((a) => a.areaId)).toEqual(['ar-1']);
      expect(s.byArea[0]!.expectedCost.expected).toBe(350);
    });
  });

  // ─── Funding and sources ───────────────────────────────────────────────────

  describe('funding total and source listing', () => {
    it('sums active sources only (own funds included) but lists closed and exhausted ones', () => {
      sqlite
        .prepare("UPDATE budget_sources SET total_amount = 250 WHERE id = 'discretionary-system'")
        .run();
      source('src-a', 'bank_loan', 1000);
      source('src-b', 'credit_line', 500, 'exhausted');
      source('src-c', 'savings', 700, 'closed');
      const s = summary();
      expect(s.fundingTotal).toBe(1250);
      expect(s.activeSourceCount).toBe(2);
      expect(s.sources.map((x) => x.id).sort()).toEqual(
        ['discretionary-system', 'src-a', 'src-b', 'src-c'].sort(),
      );
      expect(s.sources.find((x) => x.id === 'src-c')).toMatchObject({
        status: 'closed',
        sourceType: 'savings',
        amount: 700,
        unallocated: 700,
        overAllocated: 0,
      });
    });

    it('orders sources by name, then id', () => {
      db.insert(schema.budgetSources)
        .values([
          { id: 'z', name: 'Same', sourceType: 'other', totalAmount: 1, ...ts },
          { id: 'a', name: 'Same', sourceType: 'other', totalAmount: 1, ...ts },
          { id: 'm', name: 'Alpha', sourceType: 'other', totalAmount: 1, ...ts },
        ])
        .run();
      expect(summary().sources.map((x) => x.id)).toEqual(['m', 'discretionary-system', 'a', 'z']);
    });

    it('shows over-allocation as it is, and unallocated never negative', () => {
      source('src-a', 'bank_loan', 100);
      wiLine(workItem(), { planned: 350, source: 'src-a' });
      const row = summary().sources.find((x) => x.id === 'src-a')!;
      expect(row.allocated).toBe(350);
      expect(row.overAllocated).toBe(250);
      expect(row.unallocated).toBe(0);
    });

    it('allocated equals usedAmount of the funding-source service for mixed net/gross, linked/unlinked lines', () => {
      source('src-a', 'bank_loan', 50000);
      const wi = workItem();
      const hi = householdItem();
      wiLine(wi, { planned: 100, includesVat: false, confidence: 'own_estimate', source: 'src-a' });
      wiLine(wi, { planned: 250.5, includesVat: true, confidence: 'quote', source: 'src-a' });
      wiLine(null, { planned: 80, source: 'src-a' });
      const linked = hiLine(hi, { planned: 999, includesVat: false, source: 'src-a' });
      const inv = invoice(777.77, 'pending');
      link(inv, linked, 'household_item', 700.7);
      const row = summary().sources.find((x) => x.id === 'src-a')!;
      expect(row.allocated).toBe(getBudgetSourceById(db, 'src-a', VAT).usedAmount);
      expect(row.allocated).toBe(119 + 250.5 + 80 + 700.7);
    });

    it('reports paid and submitted from the funding-source rails (loan and discretionary)', () => {
      source('src-a', 'bank_loan', 5000);
      const lineA = wiLine(workItem(), { planned: 1000, source: 'src-a' });
      // a line without a source is funded by the discretionary rails
      const lineD = wiLine(workItem(), { planned: 400, source: null });
      link(invoice(1000, 'paid'), lineA, 'work_item', 1000);
      link(invoice(400, 'claimed'), lineD, 'work_item', 400);
      const s = summary();
      expect(s.sources.find((x) => x.id === 'src-a')).toMatchObject({ paid: 1000, submitted: 0 });
      expect(s.sources.find((x) => x.id === 'discretionary-system')).toMatchObject({
        paid: 400,
        submitted: 400,
      });
    });
  });

  // ─── Ready to submit ───────────────────────────────────────────────────────

  describe('ready to submit', () => {
    function fundedInvoice(
      sourceId: string,
      amount: number,
      status: 'quotation' | 'pending' | 'paid' | 'claimed',
    ): string {
      const line = wiLine(workItem(), { planned: amount, source: sourceId });
      const inv = invoice(amount, status);
      link(inv, line, 'work_item', amount);
      return inv;
    }

    it('lists pending and paid invoices of loan and credit-line sources, never claimed ones or offers', () => {
      source('loan', 'bank_loan', 50000);
      source('credit', 'credit_line', 50000);
      fundedInvoice('loan', 5000, 'pending');
      fundedInvoice('loan', 3000, 'paid');
      fundedInvoice('loan', 2000, 'claimed');
      fundedInvoice('loan', 900, 'quotation');
      fundedInvoice('credit', 700, 'pending');
      const s = summary();
      expect(s.sources.find((x) => x.id === 'loan')!.readyToSubmit).toEqual({
        count: 2,
        amount: 8000,
      });
      expect(s.sources.find((x) => x.id === 'credit')!.readyToSubmit).toEqual({
        count: 1,
        amount: 700,
      });
      expect(s.readyToSubmit).toEqual({ count: 3, amount: 8700 });
    });

    it('is { 0, 0 } for savings, other and own funds even with pending items', () => {
      source('save', 'savings', 50000);
      source('misc', 'other', 50000);
      fundedInvoice('save', 100, 'pending');
      fundedInvoice('misc', 200, 'paid');
      fundedInvoice('discretionary-system', 300, 'pending');
      const s = summary();
      for (const sourceId of ['save', 'misc', 'discretionary-system']) {
        expect(s.sources.find((x) => x.id === sourceId)!.readyToSubmit).toEqual({
          count: 0,
          amount: 0,
        });
      }
      expect(s.readyToSubmit).toEqual({ count: 0, amount: 0 });
    });

    it('includes a deposit tagged to the source (Rail B) on an invoice without lines of that source', () => {
      source('loan', 'bank_loan', 50000);
      const inv = invoice(2000, 'pending');
      deposit(inv, 500, 'paid', { sourceId: 'loan' });
      const row = summary().sources.find((x) => x.id === 'loan')!;
      expect(row.readyToSubmit).toEqual({ count: 1, amount: 500 });
      expect(row.paid).toBe(500);
    });

    it('lets a refund adjustment reduce the amount without counting as an invoice', () => {
      source('loan', 'bank_loan', 50000);
      fundedInvoice('loan', 1000, 'paid');
      const other = invoice(300, 'paid');
      deposit(other, 100, 'paid', { entryType: 'refund', sourceId: 'loan' });
      const row = summary().sources.find((x) => x.id === 'loan')!;
      expect(row.readyToSubmit).toEqual({ count: 1, amount: 900 });
    });

    it('matches the claim bank report for the same source', async () => {
      source('loan', 'bank_loan', 50000);
      fundedInvoice('loan', 1000, 'pending');
      fundedInvoice('loan', 250.25, 'paid');
      const inv = invoice(400, 'pending');
      deposit(inv, 40, 'paid', { sourceId: 'loan' });
      const row = summary().sources.find((x) => x.id === 'loan')!;
      const report = await getSourceReport(db, 'claim', 'loan', { paperlessEnabled: false });
      expect(row.readyToSubmit.amount).toBe(report.totalAmount);
      expect(row.readyToSubmit.count).toBe(
        report.invoices.filter((i) => i.lineKind === 'invoice').length,
      );
    });

    it('counts an invoice split across two loan sources once at project level', () => {
      source('loan-1', 'bank_loan', 50000);
      source('loan-2', 'bank_loan', 50000);
      const inv = invoice(1000, 'pending');
      link(inv, wiLine(workItem(), { planned: 600, source: 'loan-1' }), 'work_item', 600);
      link(inv, wiLine(workItem(), { planned: 400, source: 'loan-2' }), 'work_item', 400);
      const s = summary();
      expect(s.sources.find((x) => x.id === 'loan-1')!.readyToSubmit).toEqual({
        count: 1,
        amount: 600,
      });
      expect(s.sources.find((x) => x.id === 'loan-2')!.readyToSubmit).toEqual({
        count: 1,
        amount: 400,
      });
      expect(s.readyToSubmit).toEqual({ count: 1, amount: 1000 });
    });
  });

  describe('getReadyToSubmit (#2232)', () => {
    function fundedInvoice(sourceId: string, amount: number, status: 'pending' | 'paid'): string {
      const line = wiLine(workItem(), { planned: amount, source: sourceId });
      const inv = invoice(amount, status);
      link(inv, line, 'work_item', amount);
      return inv;
    }

    it('is zero with an empty bySource map when there are no sources', () => {
      expect(getReadyToSubmit(db)).toEqual({ count: 0, amount: 0, bySource: new Map() });
    });

    it('is zero when only savings and other sources exist, and leaves them out of bySource', () => {
      source('save', 'savings', 50000);
      source('misc', 'other', 50000);
      fundedInvoice('save', 100, 'pending');
      fundedInvoice('misc', 200, 'paid');
      const result = getReadyToSubmit(db);
      expect(result.count).toBe(0);
      expect(result.amount).toBe(0);
      expect(result.bySource.size).toBe(0);
    });

    it('reports loan and credit-line sources separately and adds them up', () => {
      source('loan', 'bank_loan', 50000);
      source('credit', 'credit_line', 50000);
      source('save', 'savings', 50000);
      fundedInvoice('loan', 5000, 'pending');
      fundedInvoice('loan', 3000, 'paid');
      fundedInvoice('credit', 700.5, 'pending');
      fundedInvoice('save', 999, 'pending');
      const result = getReadyToSubmit(db);
      expect(result.bySource.get('loan')).toEqual({ count: 2, amount: 8000 });
      expect(result.bySource.get('credit')).toEqual({ count: 1, amount: 700.5 });
      expect(result.bySource.has('save')).toBe(false);
      expect(result.count).toBe(3);
      expect(result.amount).toBe(8700.5);
    });

    it('counts an invoice shared by two loan sources once, while each source keeps its share', () => {
      source('loan-1', 'bank_loan', 50000);
      source('loan-2', 'bank_loan', 50000);
      const inv = invoice(1000, 'pending');
      link(inv, wiLine(workItem(), { planned: 600, source: 'loan-1' }), 'work_item', 600);
      link(inv, wiLine(workItem(), { planned: 400, source: 'loan-2' }), 'work_item', 400);
      const result = getReadyToSubmit(db);
      expect(result.count).toBe(1);
      expect(result.amount).toBe(1000);
      expect(result.bySource.get('loan-1')).toEqual({ count: 1, amount: 600 });
      expect(result.bySource.get('loan-2')).toEqual({ count: 1, amount: 400 });
    });

    it('keeps a loan source without invoices in bySource as zero', () => {
      source('loan', 'bank_loan', 50000);
      expect(getReadyToSubmit(db).bySource.get('loan')).toEqual({ count: 0, amount: 0 });
    });

    it('matches computeProjectMoney readyToSubmit for the same data', () => {
      source('loan', 'bank_loan', 50000);
      fundedInvoice('loan', 1234.56, 'pending');
      const s = summary();
      const result = getReadyToSubmit(db);
      expect({ count: result.count, amount: result.amount }).toEqual(s.readyToSubmit);
    });
  });

  describe('Invoices summary.claimable follows ready to submit (#2232)', () => {
    function fundedInvoice(sourceId: string | null, amount: number): string {
      const line = wiLine(workItem(), { planned: amount, source: sourceId });
      const inv = invoice(amount, 'pending');
      link(inv, line, 'work_item', amount);
      return inv;
    }

    it('does not count a pending invoice funded by own funds or by a savings source', () => {
      source('save', 'savings', 50000);
      fundedInvoice(null, 400);
      fundedInvoice('save', 300);
      fundedInvoice('discretionary-system', 200);
      const summaryOut = listAllInvoices(db, {}).summary;
      expect(summaryOut.claimable).toEqual({ count: 0, totalAmount: 0 });
    });

    it('counts a loan-funded pending invoice and equals the money service figure', () => {
      source('loan', 'bank_loan', 50000);
      fundedInvoice('loan', 900);
      fundedInvoice(null, 400);
      const claimable = listAllInvoices(db, {}).summary.claimable;
      const money = summary().readyToSubmit;
      expect(claimable).toEqual({ count: 1, totalAmount: 900 });
      expect(claimable).toEqual({ count: money.count, totalAmount: money.amount });
    });

    it('stays global when the listing is filtered', () => {
      source('loan', 'bank_loan', 50000);
      fundedInvoice('loan', 900);
      const filtered = listAllInvoices(db, { status: 'paid' });
      expect(filtered.invoices).toHaveLength(0);
      expect(filtered.summary.claimable).toEqual({ count: 1, totalAmount: 900 });
    });
  });

  // ─── Payments ──────────────────────────────────────────────────────────────

  describe('payments', () => {
    it('derives Paid, Still to pay and Not yet paid from the invoice rows', () => {
      const wi = workItem();
      wiLine(wi, { planned: 1000, confidence: 'own_estimate' });
      invoice(300, 'paid');
      invoice(200, 'pending');
      invoice(100, 'claimed');
      const s = summary();
      expect(s.paid).toBe(400);
      expect(s.stillToPay).toBe(200);
      // expected cost = 1000 + 600 not yet split
      expect(s.expectedCost.expected).toBe(1600);
      expect(s.notYetPaid).toEqual({ expected: 1200, best: 1000, worst: 1400 });
      expect(s.records.invoices).toEqual({ count: 3, amount: 600, paid: 400, stillToPay: 200 });
    });
  });

  // Mutations: counting paid / claimed invoices, counting a refund-only invoice, counting an
  // invoice once per deposit row, dropping the offers, or a count that drifts from the Invoices
  // open-payable count (#2230: the Home "n invoices" link must equal the list it opens).
  describe('stillToPayCount (#2230)', () => {
    const openPayableCount = () => listAllInvoices(db, {}).summary.openPayable.count;

    it('is 0 with nothing to pay', () => {
      invoice(300, 'paid');
      invoice(100, 'claimed');
      expect(summary().stillToPayCount).toBe(0);
      expect(openPayableCount()).toBe(0);
    });

    it('counts each pending invoice once, however many deposits it has', () => {
      const a = invoice(1000, 'pending');
      deposit(a, 100, 'paid');
      deposit(a, 100, 'pending');
      deposit(a, 100, 'pending');
      invoice(200, 'pending');
      invoice(50, 'paid');
      const s = summary();
      expect(s.stillToPayCount).toBe(2);
      expect(s.stillToPay).toBe(s.records.invoices.stillToPay);
      expect(openPayableCount()).toBe(2);
    });

    it('counts an offer that has a pending progress payment, not one with none', () => {
      const withPending = invoice(2000, 'quotation');
      deposit(withPending, 300, 'pending');
      const settled = invoice(1000, 'quotation');
      deposit(settled, 300, 'paid');
      invoice(500, 'quotation');
      const s = summary();
      expect(s.stillToPayCount).toBe(1);
      expect(s.records.offers.stillToPay).toBe(300);
      expect(openPayableCount()).toBe(1);
    });

    it('does not count a paid invoice that only has a refund', () => {
      const refunded = invoice(800, 'paid');
      deposit(refunded, 100, 'pending', { entryType: 'refund' });
      const s = summary();
      expect(s.stillToPayCount).toBe(0);
      expect(s.stillToPay).toBe(0);
      expect(openPayableCount()).toBe(0);
    });

    it('adds offers and invoices (disjoint records) and equals the Invoices open-payable count', () => {
      invoice(400, 'pending');
      invoice(100, 'pending');
      const offer = invoice(2000, 'quotation');
      deposit(offer, 300, 'pending');
      deposit(offer, 50, 'pending');
      const s = summary();
      expect(s.stillToPayCount).toBe(3);
      expect(s.stillToPayCount).toBe(openPayableCount());
      const open = listAllInvoices(db, {}).summary.openPayable.totalAmount;
      expect(s.stillToPay).toBe(open);
    });
  });

  describe('own-funds paid and submitted add up to the project figures', () => {
    it('a linked own-funds line + a no-source line + a remainder: sources sum to Paid and the claimed share', () => {
      // Rule: the own-funds rail counts lines assigned to discretionary-system as well as NULL.
      const linked = wiLine(workItem(), { planned: 500, source: 'discretionary-system' });
      const noSource = wiLine(workItem(), { planned: 300, source: null });
      link(invoice(500, 'paid'), linked, 'work_item', 500);
      link(invoice(300, 'claimed'), noSource, 'work_item', 300);
      invoice(200, 'paid'); // unitemized remainder

      const s = summary();

      const sumPaid = s.sources.reduce((acc, x) => acc + Math.round(x.paid * 100), 0);
      const sumSubmitted = s.sources.reduce((acc, x) => acc + Math.round(x.submitted * 100), 0);
      expect(s.paid).toBe(1000);
      expect(sumPaid).toBe(Math.round(s.paid * 100));
      expect(sumSubmitted).toBe(30000);
      expect(s.sources.find((x) => x.id === 'discretionary-system')).toMatchObject({
        paid: 1000,
        submitted: 300,
      });
    });
  });

  // ─── Grants, per item ──────────────────────────────────────────────────────

  describe('grants', () => {
    it('lists the non-rejected grants in name order and flags capped / counted', () => {
      const wi = workItem();
      wiLine(wi, { planned: 1000 });
      grant('b-grant', { status: 'applied', workItems: [wi] });
      grant('a-grant', { status: 'approved', cap: 500, workItems: [wi], value: 20 });
      grant('c-grant', { status: 'rejected', workItems: [wi] });
      const s = summary();
      expect(s.grants.map((g) => g.id)).toEqual(['a-grant', 'b-grant']);
      expect(s.grants[0]).toMatchObject({
        counted: true,
        capped: true,
        eligibleCostCap: 500,
        rate: 20,
        reductionType: 'percentage',
        eligibleItemCount: 1,
      });
      expect(s.grants[0]!.expected.expected).toBe(100);
      expect(s.grants[1]).toMatchObject({ counted: false, capped: false });
      expect(s.expectedGrants.expected).toBe(100);
      expect(s.possibleGrants.expected).toBe(100);
    });

    it('applies the category filter and the includes-no-category flag read from the database', () => {
      db.insert(schema.budgetCategories)
        .values({ id: 'bc-1', name: 'Category One', ...ts })
        .run();
      const wi = workItem();
      wiLine(wi, { planned: 1000, category: 'bc-1' });
      wiLine(wi, { planned: 200, category: null });
      grant('g1', { workItems: [wi], categories: ['bc-1'], value: 10 });
      expect(summary().expectedGrants.expected).toBe(100);
      db.update(schema.subsidyPrograms).set({ includesNoCategoryItems: 1 }).run();
      expect(summary().expectedGrants.expected).toBe(120);
    });

    it('reads several categories of one grant', () => {
      db.insert(schema.budgetCategories)
        .values([
          { id: 'bc-1', name: 'Category One', ...ts },
          { id: 'bc-2', name: 'Category Two', ...ts },
        ])
        .run();
      const wi = workItem();
      wiLine(wi, { planned: 1000, category: 'bc-1' });
      wiLine(wi, { planned: 500, category: 'bc-2' });
      wiLine(wi, { planned: 4000, category: null });
      grant('g1', { workItems: [wi], categories: ['bc-1', 'bc-2'], value: 10 });
      expect(summary().expectedGrants.expected).toBe(150);
    });

    it('computes a legacy fixed grant per linked item from the database', () => {
      const wi1 = workItem();
      const wi2 = workItem();
      wiLine(wi1);
      wiLine(wi2);
      grant('fixed', { type: 'fixed', value: 300, cap: 500, workItems: [wi1, wi2] });
      const s = summary();
      expect(s.grants[0]).toMatchObject({ reductionType: 'fixed', capped: true });
      expect(s.expectedGrants.expected).toBe(500);
    });
  });

  describe('getItemGrantPayback', () => {
    it('is empty for an unknown or unlinked item', () => {
      grant('g1', { workItems: [] });
      expect(getItemGrantPayback(db, VAT, 'work_item', 'nope')).toEqual({
        minTotalPayback: 0,
        maxTotalPayback: 0,
        expectedTotalPayback: 0,
        subsidies: [],
      });
    });

    it('lists every non-rejected linked grant but sums the counted ones only', () => {
      const wi = workItem();
      wiLine(wi, { planned: 1000, confidence: 'own_estimate' });
      grant('g-approved', { status: 'approved', value: 10, workItems: [wi] });
      grant('g-eligible', { status: 'eligible', value: 50, workItems: [wi] });
      grant('g-rejected', { status: 'rejected', value: 90, workItems: [wi] });
      grant('g-other', { status: 'approved', value: 90, workItems: [] });
      const p = getItemGrantPayback(db, VAT, 'work_item', wi);
      expect(p.subsidies.map((x) => x.subsidyProgramId)).toEqual(['g-approved', 'g-eligible']);
      expect(p.subsidies[0]).toMatchObject({
        minPayback: 80,
        maxPayback: 120,
        expectedPayback: 100,
        counted: true,
        reductionType: 'percentage',
        reductionValue: 10,
      });
      expect(p.subsidies[1]).toMatchObject({ expectedPayback: 500, counted: false });
      expect(p.minTotalPayback).toBe(80);
      expect(p.maxTotalPayback).toBe(120);
      expect(p.expectedTotalPayback).toBe(100);
    });

    it('lists a linked grant with a zero share when the item has no eligible line', () => {
      const wi = workItem();
      grant('g1', { workItems: [wi], value: 25 });
      const p = getItemGrantPayback(db, VAT, 'work_item', wi);
      expect(p.subsidies).toHaveLength(1);
      expect(p.subsidies[0]).toMatchObject({ minPayback: 0, maxPayback: 0, expectedPayback: 0 });
      expect(p.expectedTotalPayback).toBe(0);
    });

    it('uses the itemized amount of an invoice-linked household line', () => {
      const hi = householdItem();
      const line = hiLine(hi, { planned: 5000, confidence: 'own_estimate' });
      link(invoice(2000, 'pending'), line, 'household_item', 2000);
      grant('g1', { value: 10, householdItems: [hi] });
      const p = getItemGrantPayback(db, VAT, 'household_item', hi);
      expect(p.expectedTotalPayback).toBe(200);
      expect(p.minTotalPayback).toBe(200);
      expect(p.maxTotalPayback).toBe(200);
    });

    it('does not mix up a work item and a household item with the same id', () => {
      workItem('same');
      householdItem('same');
      wiLine('same', { planned: 1000 });
      grant('g1', { value: 10, workItems: ['same'] });
      expect(getItemGrantPayback(db, VAT, 'work_item', 'same').expectedTotalPayback).toBe(100);
      expect(getItemGrantPayback(db, VAT, 'household_item', 'same').subsidies).toEqual([]);
    });
  });

  describe('getExpectedGrantsByHouseholdItem', () => {
    it('equals the per-item expectedTotalPayback for every household item', () => {
      const hi1 = householdItem();
      const hi2 = householdItem();
      const wi = workItem();
      hiLine(hi1, { planned: 1234.56, confidence: 'own_estimate' });
      hiLine(hi2, { planned: 777.77 });
      wiLine(wi, { planned: 500 });
      grant('g1', { value: 15, householdItems: [hi1, hi2], workItems: [wi] });
      grant('g2', { status: 'applied', value: 50, householdItems: [hi1] });
      const map = getExpectedGrantsByHouseholdItem(db, VAT);
      for (const hi of [hi1, hi2]) {
        expect(map.get(hi)).toBe(
          getItemGrantPayback(db, VAT, 'household_item', hi).expectedTotalPayback,
        );
      }
      expect(map.has(wi)).toBe(false);
      expect(map.get(hi1)! + map.get(hi2)!).toBeCloseTo(
        Math.round((1234.56 + 777.77) * 15) / 100,
        2,
      );
    });
  });

  describe('getExpectedCostByWorkItem (#2245)', () => {
    it('is empty for an empty database', () => {
      expect(getExpectedCostByWorkItem(db, VAT).size).toBe(0);
    });

    it('maps each task to its expected cost and equals the breakdown money', () => {
      const wi1 = workItem();
      const wi2 = workItem();
      const hi = householdItem();
      wiLine(wi1, { planned: 1234.56, confidence: 'own_estimate' });
      wiLine(wi1, { planned: 100 });
      wiLine(wi2, { planned: 800, includesVat: false });
      hiLine(hi, { planned: 999 });
      const map = getExpectedCostByWorkItem(db, VAT);
      const breakdown = getBreakdownMoney(computeProjectMoney(db, VAT)).workItems;
      for (const wi of [wi1, wi2]) {
        expect(map.get(wi)).toBe(breakdown[wi]!.expectedCost.expected);
      }
      expect(map.get(wi2)).toBe(952);
      expect(map.has(hi)).toBe(false);
    });

    it('does not mix up a task and a purchase with the same id', () => {
      workItem('same');
      householdItem('same');
      wiLine('same', { planned: 500 });
      hiLine('same', { planned: 9000 });
      expect(getExpectedCostByWorkItem(db, VAT).get('same')).toBe(500);
    });
  });

  // #2229: per-due-date decomposition of "still to pay" (attention rules N4-N6).
  // Mutations: a second still-to-pay definition (Σ items != summary.stillToPay), a lost vendor
  // name or due date, a missing offer progress payment, a refund leaking in.
  describe('listOpenPayments', () => {
    it('is empty for an empty database', () => {
      expect(listOpenPayments(db)).toEqual([]);
    });

    it('returns final and progress items with vendor name, number and both due dates', () => {
      const inv = invoice(3000, 'pending');
      sqlite
        .prepare('UPDATE invoices SET invoice_number = ?, due_date = ?, date = ? WHERE id = ?')
        .run('AB-77', '2026-03-01', '2026-02-10', inv);
      deposit(inv, 400, 'pending');
      deposit(inv, 500, 'paid');
      const items = listOpenPayments(db);
      expect(items).toHaveLength(2);
      expect(items[0]).toEqual({
        kind: 'final',
        invoiceId: inv,
        depositId: null,
        invoiceStatus: 'pending',
        invoiceNumber: 'AB-77',
        vendorId: 'vendor',
        vendorName: 'Company One',
        invoiceDate: '2026-02-10',
        dueDate: '2026-03-01',
        amount: 2100,
      });
      expect(items[1]).toMatchObject({
        kind: 'progress',
        invoiceId: inv,
        invoiceNumber: 'AB-77',
        vendorName: 'Company One',
        dueDate: '2026-02-01',
        amount: 400,
      });
      expect(items[1]!.depositId).not.toBeNull();
    });

    it('includes the pending progress payment of an offer and no final item for it', () => {
      const offer = invoice(2000, 'quotation');
      deposit(offer, 300, 'pending');
      deposit(offer, 100, 'paid');
      const items = listOpenPayments(db);
      expect(items.map((i) => [i.kind, i.invoiceStatus, i.amount])).toEqual([
        ['progress', 'quotation', 300],
      ]);
    });

    it('ignores pending refunds', () => {
      const inv = invoice(1000, 'pending');
      deposit(inv, 300, 'pending', { entryType: 'refund' });
      expect(listOpenPayments(db).map((i) => [i.kind, i.amount])).toEqual([['final', 1000]]);
    });

    it('does not list paid or claimed invoices without pending entries', () => {
      invoice(500, 'paid');
      invoice(500, 'claimed');
      expect(listOpenPayments(db)).toEqual([]);
    });

    it('Σ of all items equals the summary Still to pay (to the cent)', () => {
      const a = invoice(1000, 'pending');
      deposit(a, 250, 'pending');
      deposit(a, 100.5, 'paid');
      const b = invoice(333.33, 'pending');
      const offer = invoice(5000, 'quotation');
      deposit(offer, 1200, 'pending');
      deposit(offer, 800, 'pending');
      invoice(700, 'paid');
      const c = invoice(900, 'pending');
      deposit(c, 100, 'pending', { entryType: 'refund' });
      expect(b).toBeDefined();
      const total = listOpenPayments(db).reduce((sum, i) => sum + Math.round(i.amount * 100), 0);
      expect(total).toBe(Math.round(summary().stillToPay * 100));
      expect(total).toBeGreaterThan(0);
    });
  });
});
