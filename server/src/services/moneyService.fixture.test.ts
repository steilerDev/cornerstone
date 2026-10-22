/**
 * AC8 regression fixture and consistency test of the money service (ADR-039, #2228).
 *
 * Synthetic data only (invented names, round amounts), VAT_RATE 0.19. Every expected figure is
 * asserted with `toBe` to the cent. The second half compares the money service against every
 * server consumer of the same figures with no tolerance.
 *
 * Mutations these blocks catch:
 *  - reverting the offer face-value rule (a linked offer line at +-5% again): changes l-1's best and
 *    worst and breaks the expectedCost row;
 *  - counting eligible / applied grants: breaks expectedGrants / possibleGrants and sp-3 counted;
 *  - dropping the eligible-costs cap: breaks the sp-1 row (capped, 6,000) and oversubscribedSubsidies;
 *  - a non-largest-remainder split (floor or round per line): breaks the sp-1 line-share table;
 *  - ignoring orphan lines: breaks expectedCost, the over-allocated source and the null area;
 *  - a symmetric Tight verdict: breaks the verdict row (worst < 0 but expected >= 0 is on_budget)
 *    and step 2 (best > 0 but expected < 0 is over_budget);
 *  - a second Ready-to-submit predicate: breaks the bank-report consistency block;
 *  - a second Still-to-pay definition: breaks the invoice-summary and vendor consistency blocks.
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type {
  BudgetBreakdown,
  BudgetOverviewResponse,
  BreakdownArea,
  MoneyCostFigures,
  MoneyRange,
  MoneySummary,
} from '@cornerstone/shared';
import { buildApp } from '../app.js';
import * as schema from '../db/schema.js';
import * as userService from './userService.js';
import * as sessionService from './sessionService.js';
import { computeProjectMoney, getBreakdownMoney } from './moneyService.js';
import { getSourceReport } from './sourceReportService.js';

const VAT = 0.19;
const NOW = '2026-01-01T00:00:00.000Z';

// ─── Seeding ─────────────────────────────────────────────────────────────────

function seedFixture(app: FastifyInstance): void {
  const db = app.db;
  const ts = { createdAt: NOW, updatedAt: NOW };

  for (const [id, name, parentId, sortOrder] of [
    ['ar-n', 'Area North', null, 0],
    ['ar-n1', 'Area North Level 1', 'ar-n', 0],
    ['ar-s', 'Area South', null, 1],
  ] as const) {
    db.insert(schema.areas)
      .values({ id, name, parentId, sortOrder, ...ts })
      .run();
  }

  for (const [id, name] of [
    ['bc-1', 'Category One'],
    ['bc-2', 'Category Two'],
  ] as const) {
    db.insert(schema.budgetCategories)
      .values({ id, name, ...ts })
      .run();
  }

  for (const [id, name] of [
    ['v-1', 'Company One'],
    ['v-2', 'Company Two'],
    ['v-3', 'Company Three'],
  ] as const) {
    db.insert(schema.vendors)
      .values({ id, name, ...ts })
      .run();
  }

  // Sources (the seeded discretionary row gets 1,500.00)
  db.update(schema.budgetSources)
    .set({ totalAmount: 1500 })
    .where(eq(schema.budgetSources.id, 'discretionary-system'))
    .run();
  for (const [id, name, sourceType, status, totalAmount] of [
    ['bs-a', 'Loan Alpha', 'bank_loan', 'active', 60000],
    ['bs-b', 'Credit Beta', 'credit_line', 'active', 15000],
    ['bs-c', 'Loan Closed', 'bank_loan', 'closed', 10000],
  ] as const) {
    db.insert(schema.budgetSources)
      .values({ id, name, sourceType, status, totalAmount, ...ts })
      .run();
  }

  // Items
  for (const [id, title, areaId] of [
    ['wi-1', 'Task Roof', 'ar-n'],
    ['wi-2', 'Task Windows', 'ar-n1'],
    ['wi-3', 'Task Garden', 'ar-s'],
    ['wi-4', 'Task Wiring', null],
  ] as const) {
    db.insert(schema.workItems)
      .values({ id, title, status: 'not_started', areaId, ...ts })
      .run();
  }
  for (const [id, name, areaId] of [
    ['hi-1', 'Purchase Heat Pump', 'ar-n1'],
    ['hi-2', 'Purchase Lamps', 'ar-s'],
  ] as const) {
    db.insert(schema.householdItems)
      .values({ id, name, categoryId: 'hic-furniture', areaId, ...ts })
      .run();
  }

  // Lines: [id, kind, itemId, planned, includesVat, confidence, category, source]
  type Conf = 'own_estimate' | 'professional_estimate' | 'quote' | 'invoice';
  const wiLines: Array<
    [string, string | null, number, boolean, Conf, string | null, string | null]
  > = [
    ['l-1', 'wi-1', 20000, true, 'quote', 'bc-1', 'bs-a'],
    ['l-2', 'wi-1', 5000, false, 'own_estimate', 'bc-2', 'bs-a'],
    ['l-3', 'wi-2', 10000, false, 'professional_estimate', 'bc-1', 'bs-a'],
    ['l-4', 'wi-2', 4000, true, 'quote', 'bc-1', 'bs-b'],
    ['l-5', 'wi-3', 12000, true, 'own_estimate', 'bc-2', 'bs-b'],
    ['l-6', 'wi-4', 3000, true, 'invoice', null, null],
    ['l-9', null, 2000, true, 'invoice', null, 'bs-b'],
  ];
  for (const [id, workItemId, plannedAmount, includesVat, confidence, cat, src] of wiLines) {
    db.insert(schema.workItemBudgets)
      .values({
        id,
        workItemId,
        plannedAmount,
        includesVat,
        confidence,
        budgetCategoryId: cat,
        budgetSourceId: src,
        ...ts,
      })
      .run();
  }
  for (const [id, householdItemId, plannedAmount, includesVat, confidence, cat, src] of [
    ['l-7', 'hi-1', 15000, true, 'professional_estimate', 'bc-1', 'bs-a'],
    ['l-8', 'hi-2', 1000, false, 'own_estimate', null, 'discretionary-system'],
  ] as const) {
    db.insert(schema.householdItemBudgets)
      .values({
        id,
        householdItemId,
        plannedAmount,
        includesVat,
        confidence,
        budgetCategoryId: cat,
        budgetSourceId: src,
        ...ts,
      })
      .run();
  }

  // Records
  for (const [id, vendorId, status, amount] of [
    ['Q1', 'v-1', 'quotation', 25000],
    ['I1', 'v-2', 'pending', 11900],
    ['I2', 'v-2', 'paid', 3000.5],
    ['I3', 'v-3', 'claimed', 14500],
    ['I4', 'v-3', 'pending', 2600],
    ['I5', 'v-1', 'paid', 800],
  ] as const) {
    db.insert(schema.invoices)
      .values({ id, vendorId, status, amount, date: '2026-01-15', ...ts })
      .run();
  }
  for (const [id, invoiceId, amount, status] of [
    ['D1', 'Q1', 5000, 'paid'],
    ['D2', 'Q1', 4000, 'pending'],
    ['D3', 'I1', 2000, 'paid'],
  ] as const) {
    db.insert(schema.invoiceDeposits)
      .values({ id, invoiceId, amount, status, dueDate: '2026-02-01', ...ts })
      .run();
  }
  for (const [id, invoiceId, wib, hib, itemizedAmount] of [
    ['ibl-1', 'Q1', 'l-1', null, 23800],
    ['ibl-3', 'I1', 'l-3', null, 11900],
    ['ibl-6', 'I2', 'l-6', null, 3000],
    ['ibl-7', 'I3', null, 'l-7', 14500],
    ['ibl-9', 'I4', 'l-9', null, 2000],
  ] as const) {
    db.insert(schema.invoiceBudgetLines)
      .values({
        id,
        invoiceId,
        workItemBudgetId: wib,
        householdItemBudgetId: hib,
        itemizedAmount,
        ...ts,
      })
      .run();
  }

  // Grants
  for (const [id, name, rate, cap, status, categories, workItemIds, householdIds] of [
    ['sp-1', 'Grant One', 20, 30000, 'approved', ['bc-1'], ['wi-1', 'wi-2'], ['hi-1']],
    ['sp-2', 'Grant Two', 10, null, 'received', [], ['wi-3'], []],
    ['sp-3', 'Grant Three', 15, null, 'applied', [], ['wi-4'], ['hi-2']],
    ['sp-4', 'Grant Four', 50, null, 'approved', ['bc-2'], [], []],
    ['sp-5', 'Grant Five', 30, null, 'rejected', [], ['wi-1'], []],
  ] as const) {
    db.insert(schema.subsidyPrograms)
      .values({
        id,
        name,
        reductionType: 'percentage',
        reductionValue: rate,
        maximumAmount: cap,
        applicationStatus: status,
        ...ts,
      })
      .run();
    for (const budgetCategoryId of categories) {
      db.insert(schema.subsidyProgramCategories)
        .values({ subsidyProgramId: id, budgetCategoryId })
        .run();
    }
    for (const workItemId of workItemIds) {
      db.insert(schema.workItemSubsidies).values({ workItemId, subsidyProgramId: id }).run();
    }
    for (const householdItemId of householdIds) {
      db.insert(schema.householdItemSubsidies)
        .values({ householdItemId, subsidyProgramId: id })
        .run();
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface Ctx {
  app: FastifyInstance;
  cookie: string;
}

async function getJson<T>(ctx: Ctx, url: string): Promise<T> {
  const res = await ctx.app.inject({ method: 'GET', url, headers: { cookie: ctx.cookie } });
  expect(res.statusCode).toBe(200);
  return res.json<T>();
}

function range(r: MoneyRange): [number, number, number] {
  return [r.expected, r.best, r.worst];
}

function figures(f: MoneyCostFigures): {
  cost: [number, number, number];
  grants: [number, number, number];
  after: [number, number, number];
} {
  return {
    cost: range(f.expectedCost),
    grants: range(f.expectedGrants),
    after: range(f.afterGrants),
  };
}

function flattenItems<T>(areas: BreakdownArea<T>[]): T[] {
  return areas.flatMap((a) => [...a.items, ...flattenItems(a.children)]);
}

async function createCtx(): Promise<{ ctx: Ctx; tempDir: string; env: NodeJS.ProcessEnv }> {
  const env = { ...process.env };
  const tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-money-fixture-'));
  process.env.DATABASE_URL = join(tempDir, 'test.db');
  process.env.SECURE_COOKIES = 'false';
  process.env.VAT_RATE = String(VAT);
  const app = await buildApp();
  const user = await userService.createLocalUser(
    app.db,
    'member@example.test',
    'Fixture Member',
    'a-long-test-password-1',
    'member',
  );
  const token = sessionService.createSession(app.db, user.id, 3600);
  return { ctx: { app, cookie: `cornerstone_session=${token}` }, tempDir, env };
}

// ─── Consistency (shared by the base fixture and step 2) ─────────────────────

function describeConsistency(getCtx: () => Ctx): void {
  describe('consistency: the money service against every server consumer', () => {
    it('1. GET /api/budget/overview: money equals the service; legacy grant fields derive from it', async () => {
      const ctx = getCtx();
      const body = await getJson<BudgetOverviewResponse>(ctx, '/api/budget/overview');
      const money = computeProjectMoney(ctx.app.db, VAT).summary;
      expect(body.money).toEqual(money);
      expect(body.overview.availableFunds).toBe(money.fundingTotal);
      expect(body.overview.sourceCount).toBe(money.activeSourceCount);
      expect(body.overview.subsidySummary.totalReductions).toBe(money.expectedGrants.expected);
      expect(body.overview.subsidySummary.minTotalPayback).toBe(money.expectedGrants.best);
      expect(body.overview.subsidySummary.maxTotalPayback).toBe(money.expectedGrants.worst);
    });

    it('2. GET /api/budget/breakdown: money equals the service; item sums equal the project figures', async () => {
      const ctx = getCtx();
      const body = await getJson<{ breakdown: BudgetBreakdown }>(ctx, '/api/budget/breakdown');
      const project = computeProjectMoney(ctx.app.db, VAT);
      const money = project.summary;
      const bm = body.breakdown.money;
      expect(bm).toEqual(getBreakdownMoney(project));

      const all = [...Object.values(bm.workItems), ...Object.values(bm.householdItems)].map(
        figures,
      );
      const scenarios = [0, 1, 2] as const;
      for (const i of scenarios) {
        const cost =
          all.reduce((s, f) => s + Math.round(f.cost[i] * 100), 0) +
          Math.round(figures({ ...bm.orphanLines }).cost[i] * 100) +
          Math.round(bm.notYetSplit.amount * 100);
        expect(cost).toBe(Math.round(range(money.expectedCost)[i]! * 100));
        const grants = all.reduce((s, f) => s + Math.round(f.grants[i] * 100), 0);
        expect(grants).toBe(Math.round(range(money.expectedGrants)[i]! * 100));
      }

      const wi = flattenItems(body.breakdown.workItems.areas);
      const hi = flattenItems(body.breakdown.householdItems.areas);
      const items = [...wi, ...hi];
      const cents = (n: number) => Math.round(n * 100);
      expect(items.reduce((s, i) => s + cents(i.subsidyPayback), 0)).toBe(
        cents(money.expectedGrants.worst),
      );
      expect(items.reduce((s, i) => s + cents(i.minSubsidyPayback), 0)).toBe(
        cents(money.expectedGrants.best),
      );
      expect(body.breakdown.budgetSources.reduce((s, b) => s + cents(b.subsidyPaybackMin), 0)).toBe(
        cents(money.expectedGrants.best),
      );
      expect(body.breakdown.budgetSources.reduce((s, b) => s + cents(b.subsidyPaybackMax), 0)).toBe(
        cents(money.expectedGrants.worst),
      );
    });

    it('3. every item subsidy-payback endpoint agrees with the breakdown and the money service', async () => {
      const ctx = getCtx();
      const bodyB = await getJson<{ breakdown: BudgetBreakdown }>(ctx, '/api/budget/breakdown');
      const money = bodyB.breakdown.money;
      const cents = (n: number) => Math.round(n * 100);
      let expectedSum = 0;
      for (const item of flattenItems(bodyB.breakdown.workItems.areas)) {
        const p = await getJson<{
          minTotalPayback: number;
          maxTotalPayback: number;
          expectedTotalPayback: number;
        }>(ctx, `/api/work-items/${item.workItemId}/subsidy-payback`);
        expect(p.maxTotalPayback).toBe(item.subsidyPayback);
        expect(p.minTotalPayback).toBe(item.minSubsidyPayback);
        expect(p.expectedTotalPayback).toBe(
          money.workItems[item.workItemId]!.expectedGrants.expected,
        );
        expectedSum += cents(p.expectedTotalPayback);
      }
      for (const item of flattenItems(bodyB.breakdown.householdItems.areas)) {
        const p = await getJson<{
          minTotalPayback: number;
          maxTotalPayback: number;
          expectedTotalPayback: number;
        }>(ctx, `/api/household-items/${item.householdItemId}/subsidy-payback`);
        expect(p.maxTotalPayback).toBe(item.subsidyPayback);
        expect(p.minTotalPayback).toBe(item.minSubsidyPayback);
        expect(p.expectedTotalPayback).toBe(
          money.householdItems[item.householdItemId]!.expectedGrants.expected,
        );
        expectedSum += cents(p.expectedTotalPayback);
      }
      const summary = computeProjectMoney(ctx.app.db, VAT).summary;
      expect(expectedSum).toBe(cents(summary.expectedGrants.expected));
    });

    it('4. GET /api/household-items: budgetSummary.subsidyReduction is the counted expected share', async () => {
      const ctx = getCtx();
      const bodyB = await getJson<{ breakdown: BudgetBreakdown }>(ctx, '/api/budget/breakdown');
      const list = await getJson<{
        items: Array<{ id: string; budgetSummary: { subsidyReduction: number } }>;
      }>(ctx, '/api/household-items');
      expect(list.items.length).toBe(2);
      for (const item of list.items) {
        const share = bodyB.breakdown.money.householdItems[item.id]?.expectedGrants.expected ?? 0;
        expect(item.budgetSummary.subsidyReduction).toBe(share);
      }
    });

    it('5. GET /api/budget-sources: usedAmount, paidAmount, claimedAmount equal allocated, paid, submitted', async () => {
      const ctx = getCtx();
      const money = computeProjectMoney(ctx.app.db, VAT).summary;
      const { budgetSources } = await getJson<{
        budgetSources: Array<{
          id: string;
          usedAmount: number;
          paidAmount: number;
          claimedAmount: number;
        }>;
      }>(ctx, '/api/budget-sources');
      expect(budgetSources.length).toBe(money.sources.length);
      for (const s of money.sources) {
        const legacy = budgetSources.find((b) => b.id === s.id)!;
        expect(legacy.usedAmount).toBe(s.allocated);
        expect(legacy.paidAmount).toBe(s.paid);
        expect(legacy.claimedAmount).toBe(s.submitted);
      }
      // Holds on this fixture by construction: the discretionary rails pick up exactly the paid
      // records that no loan or credit line funds, so the per-source paid amounts add up to Paid.
      const sum = money.sources.reduce((acc, s) => acc + Math.round(s.paid * 100), 0);
      expect(sum).toBe(Math.round(money.paid * 100));
    });

    it('6. the claim bank report lists exactly the ready-to-submit set', async () => {
      const ctx = getCtx();
      const money = computeProjectMoney(ctx.app.db, VAT).summary;
      for (const id of ['bs-a', 'bs-b', 'bs-c']) {
        const report = await getSourceReport(ctx.app.db, 'claim', id, { paperlessEnabled: false });
        const source = money.sources.find((s) => s.id === id)!;
        expect(report.totalAmount).toBe(source.readyToSubmit.amount);
        expect(report.invoices.filter((i) => i.lineKind === 'invoice').length).toBe(
          source.readyToSubmit.count,
        );
      }
    });

    it('7. GET /api/invoices summary: open payable, paid + claimed and offers equal the money service', async () => {
      const ctx = getCtx();
      const money = computeProjectMoney(ctx.app.db, VAT).summary;
      const body = await getJson<{
        summary: {
          openPayable: { totalAmount: number; count: number };
          paid: { totalAmount: number };
          claimed: { totalAmount: number };
          quotation: { count: number };
        };
      }>(ctx, '/api/invoices');
      expect(body.summary.openPayable.totalAmount).toBe(money.stillToPay);
      // #2230: Home's "n invoices" link counts the same set the Invoices open-only list shows
      expect(body.summary.openPayable.count).toBe(money.stillToPayCount);
      expect(
        Math.round(body.summary.paid.totalAmount * 100) +
          Math.round(body.summary.claimed.totalAmount * 100),
      ).toBe(Math.round(money.paid * 100));
      expect(body.summary.quotation.count).toBe(money.records.offers.count);
    });

    it('8. GET /api/vendors/:id: the outstanding balances add up to Still to pay', async () => {
      const ctx = getCtx();
      const money = computeProjectMoney(ctx.app.db, VAT).summary;
      let sum = 0;
      for (const id of ['v-1', 'v-2', 'v-3']) {
        const { vendor } = await getJson<{ vendor: { outstandingBalance: number } }>(
          ctx,
          `/api/vendors/${id}`,
        );
        sum += Math.round(vendor.outstandingBalance * 100);
      }
      expect(sum).toBe(Math.round(money.stillToPay * 100));
    });
  });
}

// ─── The fixture ─────────────────────────────────────────────────────────────

describe('money service: AC8 synthetic fixture', () => {
  let ctx: Ctx;
  let tempDir: string;
  let env: NodeJS.ProcessEnv;
  let summary: MoneySummary;

  beforeAll(async () => {
    ({ ctx, tempDir, env } = await createCtx());
    seedFixture(ctx.app);
    summary = computeProjectMoney(ctx.app.db, VAT).summary;
  });

  afterAll(async () => {
    await ctx.app.close();
    process.env = env;
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('totals', () => {
    it('counts 3 records not yet split (I2 remainder 0.50 below one unit) of 2,600.00', () => {
      expect(summary.notYetSplit).toEqual({ amount: 2600, recordCount: 3 });
    });

    it('expected cost, grants, possible grants and after grants in the three scenarios', () => {
      expect(range(summary.expectedCost)).toEqual([80940, 76912, 84968]);
      expect(range(summary.expectedGrants)).toEqual([7200, 6960, 7440]);
      expect(range(summary.possibleGrants)).toEqual([628.5, 592.8, 664.2]);
      expect(range(summary.afterGrants)).toEqual([73740, 69952, 77528]);
    });

    it('funding total, left to spend and the strict verdict', () => {
      expect(summary.fundingTotal).toBe(76500);
      expect(summary.activeSourceCount).toBe(3);
      expect(range(summary.leftToSpend)).toEqual([2760, 6548, -1028]);
      // worst < 0 but expected >= 0: a symmetric rule would say Tight
      expect(summary.leftToSpend.verdict).toBe('on_budget');
    });

    it('paid, still to pay and not yet paid', () => {
      expect(summary.paid).toBe(25300.5);
      expect(summary.stillToPay).toBe(16500);
      expect(range(summary.notYetPaid)).toEqual([55639.5, 51611.5, 59667.5]);
    });

    it('ready to submit over the loan and credit-line sources', () => {
      expect(summary.readyToSubmit).toEqual({ count: 3, amount: 22468 });
    });

    it('records: offers and invoices', () => {
      expect(summary.records.offers).toEqual({
        count: 1,
        amount: 25000,
        paid: 5000,
        stillToPay: 4000,
        remainingOnOffer: 16000,
      });
      expect(summary.records.invoices).toEqual({
        count: 5,
        amount: 32800.5,
        paid: 20300.5,
        stillToPay: 12500,
      });
      expect(summary.records.offers.paid + summary.records.invoices.paid).toBe(summary.paid);
      expect(summary.records.offers.stillToPay + summary.records.invoices.stillToPay).toBe(
        summary.stillToPay,
      );
    });
  });

  describe('sources (Credit Beta, Discretionary Funding, Loan Alpha, Loan Closed)', () => {
    it('lists every source in name order, any status', () => {
      expect(summary.sources.map((s) => s.id)).toEqual([
        'bs-b',
        'discretionary-system',
        'bs-a',
        'bs-c',
      ]);
    });

    it.each([
      ['bs-b', 15000, 18000, 0, 3000, 0, 0, 1, 2000],
      ['discretionary-system', 1500, 1190, 310, 0, 4040.5, 0, 0, 0],
      ['bs-a', 60000, 56150, 3850, 0, 21260, 14500, 2, 20468],
      ['bs-c', 10000, 0, 10000, 0, 0, 0, 0, 0],
    ])(
      'source %s: amount, allocated, unallocated, over-allocated, paid, submitted, ready to submit',
      (
        id,
        amount,
        allocated,
        unallocated,
        overAllocated,
        paid,
        submitted,
        readyCount,
        readyAmt,
      ) => {
        const s = summary.sources.find((x) => x.id === id)!;
        expect(s.amount).toBe(amount);
        expect(s.allocated).toBe(allocated);
        expect(s.unallocated).toBe(unallocated);
        expect(s.overAllocated).toBe(overAllocated);
        expect(s.paid).toBe(paid);
        expect(s.submitted).toBe(submitted);
        expect(s.readyToSubmit).toEqual({ count: readyCount, amount: readyAmt });
      },
    );
  });

  describe('grants (Grant Four, Grant One, Grant Three, Grant Two; Grant Five rejected, absent)', () => {
    it('lists the four non-rejected grants in name order', () => {
      expect(summary.grants.map((g) => g.id)).toEqual(['sp-4', 'sp-1', 'sp-3', 'sp-2']);
    });

    it.each([
      ['sp-4', 0, [0, 0, 0], [0, 0, 0], [0, 0, 0], false, true],
      ['sp-1', 3, [54200, 54000, 54400], [10840, 10800, 10880], [6000, 6000, 6000], true, true],
      ['sp-3', 2, [4190, 3952, 4428], [628.5, 592.8, 664.2], [628.5, 592.8, 664.2], false, false],
      ['sp-2', 1, [12000, 9600, 14400], [1200, 960, 1440], [1200, 960, 1440], false, true],
    ])(
      'grant %s: items, eligible cost, uncapped, expected payout, capped, counted',
      (id, count, eligible, uncapped, expected, capped, counted) => {
        const g = summary.grants.find((x) => x.id === id)!;
        expect(g.eligibleItemCount).toBe(count);
        expect(range(g.eligibleCost)).toEqual(eligible);
        expect(range(g.uncappedPayout)).toEqual(uncapped);
        expect(range(g.expected)).toEqual(expected);
        expect(g.capped).toBe(capped);
        expect(g.counted).toBe(counted);
      },
    );
  });

  describe('pro-rata line shares (largest remainder)', () => {
    it('splits Grant One over l-1, l-3, l-4, l-7 in three scenarios', () => {
      const { result } = computeProjectMoney(ctx.app.db, VAT);
      const sp1 = result.grants.find((g) => g.input.id === 'sp-1')!;
      const share = (lineId: string) => {
        const s = sp1.lineShares.get(lineId)!;
        return [s.expected / 100, s.best / 100, s.worst / 100];
      };
      expect(share('l-1')).toEqual([2634.69, 2644.45, 2625]);
      expect(share('l-3')).toEqual([1317.34, 1322.22, 1312.5]);
      expect(share('l-4')).toEqual([442.8, 422.22, 463.24]);
      expect(share('l-7')).toEqual([1605.17, 1611.11, 1599.26]);
    });

    it('splits the possible Grant Three over l-6 and l-8', () => {
      const { result } = computeProjectMoney(ctx.app.db, VAT);
      const sp3 = result.grants.find((g) => g.input.id === 'sp-3')!;
      const share = (lineId: string) => {
        const s = sp3.lineShares.get(lineId)!;
        return [s.expected / 100, s.best / 100, s.worst / 100];
      };
      expect(share('l-6')).toEqual([450, 450, 450]);
      expect(share('l-8')).toEqual([178.5, 142.8, 214.2]);
    });
  });

  describe('breakdown money (unfiltered): items, orphan lines', () => {
    const triple = (a: number, b: number, c: number): [number, number, number] => [a, b, c];

    it.each([
      [
        'wi-1',
        triple(29750, 28560, 30940),
        triple(2634.69, 2644.45, 2625),
        triple(27115.31, 25915.55, 28315),
      ],
      [
        'wi-2',
        triple(15900, 15700, 16100),
        triple(1760.14, 1744.44, 1775.74),
        triple(14139.86, 13955.56, 14324.26),
      ],
      ['wi-3', triple(12000, 9600, 14400), triple(1200, 960, 1440), triple(10800, 8640, 12960)],
      ['wi-4', triple(3000, 3000, 3000), triple(0, 0, 0), triple(3000, 3000, 3000)],
    ])('work item %s', (id, cost, grants, after) => {
      const f = figures(getBreakdownMoney(computeProjectMoney(ctx.app.db, VAT)).workItems[id]!);
      expect(f).toEqual({ cost, grants, after });
    });

    it.each([
      [
        'hi-1',
        triple(14500, 14500, 14500),
        triple(1605.17, 1611.11, 1599.26),
        triple(12894.83, 12888.89, 12900.74),
      ],
      ['hi-2', triple(1190, 952, 1428), triple(0, 0, 0), triple(1190, 952, 1428)],
    ])('household item %s', (id, cost, grants, after) => {
      const f = figures(
        getBreakdownMoney(computeProjectMoney(ctx.app.db, VAT)).householdItems[id]!,
      );
      expect(f).toEqual({ cost, grants, after });
    });

    it('orphan lines and the not-yet-split remainder', () => {
      const bm = getBreakdownMoney(computeProjectMoney(ctx.app.db, VAT));
      expect(figures(bm.orphanLines)).toEqual({
        cost: [2000, 2000, 2000],
        grants: [0, 0, 0],
        after: [2000, 2000, 2000],
      });
      expect(bm.notYetSplit).toEqual({ amount: 2600, recordCount: 3 });
    });
  });

  describe('by type and by area', () => {
    it('by type', () => {
      expect(figures(summary.byType.work_items)).toEqual({
        cost: [62650, 58860, 66440],
        grants: [5594.83, 5348.89, 5840.74],
        after: [57055.17, 53511.11, 60599.26],
      });
      expect(figures(summary.byType.household_items)).toEqual({
        cost: [15690, 15452, 15928],
        grants: [1605.17, 1611.11, 1599.26],
        after: [14084.83, 13840.89, 14328.74],
      });
    });

    it('by area in tree order with the null bucket last', () => {
      expect(summary.byArea.map((a) => a.areaId)).toEqual(['ar-n', 'ar-n1', 'ar-s', null]);
      const by = (id: string | null) => figures(summary.byArea.find((a) => a.areaId === id)!);
      expect(by('ar-n')).toEqual({
        cost: [60150, 58760, 61540],
        grants: [6000, 6000, 6000],
        after: [54150, 52760, 55540],
      });
      expect(by('ar-n1')).toEqual({
        cost: [30400, 30200, 30600],
        grants: [3365.31, 3355.55, 3375],
        after: [27034.69, 26844.45, 27225],
      });
      expect(by('ar-s')).toEqual({
        cost: [13190, 10552, 15828],
        grants: [1200, 960, 1440],
        after: [11990, 9592, 14388],
      });
      expect(by(null)).toEqual({
        cost: [5000, 5000, 5000],
        grants: [0, 0, 0],
        after: [5000, 5000, 5000],
      });
    });
  });

  describe('per-item payback endpoint', () => {
    it('work item with a counted, capped grant (rejected grant absent)', async () => {
      const body = await getJson<{
        workItemId: string;
        minTotalPayback: number;
        maxTotalPayback: number;
        expectedTotalPayback: number;
        subsidies: Array<{
          subsidyProgramId: string;
          minPayback: number;
          maxPayback: number;
          expectedPayback: number;
          counted: boolean;
        }>;
      }>(ctx, '/api/work-items/wi-1/subsidy-payback');
      expect(body.subsidies).toHaveLength(1);
      expect(body.subsidies[0]).toMatchObject({
        subsidyProgramId: 'sp-1',
        minPayback: 2644.45,
        maxPayback: 2625,
        expectedPayback: 2634.69,
        counted: true,
      });
      expect([body.minTotalPayback, body.maxTotalPayback, body.expectedTotalPayback]).toEqual([
        2644.45, 2625, 2634.69,
      ]);
    });

    it('work item with a not-counted grant: entry listed, totals 0', async () => {
      const body = await getJson<{
        minTotalPayback: number;
        maxTotalPayback: number;
        expectedTotalPayback: number;
        subsidies: Array<{
          minPayback: number;
          maxPayback: number;
          expectedPayback: number;
          counted: boolean;
        }>;
      }>(ctx, '/api/work-items/wi-4/subsidy-payback');
      expect(body.subsidies).toHaveLength(1);
      expect(body.subsidies[0]).toMatchObject({
        minPayback: 450,
        maxPayback: 450,
        expectedPayback: 450,
        counted: false,
      });
      expect([body.minTotalPayback, body.maxTotalPayback, body.expectedTotalPayback]).toEqual([
        0, 0, 0,
      ]);
    });

    it('household item with a not-counted grant uses the scenario shares', async () => {
      const body = await getJson<{
        minTotalPayback: number;
        expectedTotalPayback: number;
        subsidies: Array<{
          minPayback: number;
          maxPayback: number;
          expectedPayback: number;
          counted: boolean;
        }>;
      }>(ctx, '/api/household-items/hi-2/subsidy-payback');
      expect(body.subsidies[0]).toMatchObject({
        minPayback: 142.8,
        maxPayback: 214.2,
        expectedPayback: 178.5,
        counted: false,
      });
      expect(body.minTotalPayback).toBe(0);
      expect(body.expectedTotalPayback).toBe(0);
    });

    it('Purchases list budgetSummary.subsidyReduction and netCost', async () => {
      const list = await getJson<{
        items: Array<{ id: string; budgetSummary: { subsidyReduction: number; netCost: number } }>;
      }>(ctx, '/api/household-items');
      const hi1 = list.items.find((i) => i.id === 'hi-1')!;
      const hi2 = list.items.find((i) => i.id === 'hi-2')!;
      expect(hi1.budgetSummary.subsidyReduction).toBe(1605.17);
      expect(hi1.budgetSummary.netCost).toBe(13394.83);
      expect(hi2.budgetSummary.subsidyReduction).toBe(0);
    });
  });

  describe('legacy fields switched to the money service', () => {
    it('overview subsidySummary and oversubscribedSubsidies', async () => {
      const body = await getJson<BudgetOverviewResponse>(ctx, '/api/budget/overview');
      expect(body.overview.subsidySummary).toMatchObject({
        totalReductions: 7200,
        minTotalPayback: 6960,
        maxTotalPayback: 7440,
        activeSubsidyCount: 4,
      });
      expect(body.overview.subsidySummary.oversubscribedSubsidies).toEqual([
        {
          subsidyProgramId: 'sp-1',
          name: 'Grant One',
          maximumAmount: 30000,
          maxPayout: 6000,
          uncappedMinPayback: 10800,
          uncappedMaxPayback: 10880,
          minExcess: 4800,
          maxExcess: 4880,
        },
      ]);
    });

    it('breakdown (unfiltered): worst / best scenario shares per item and per source', async () => {
      const { breakdown } = await getJson<{ breakdown: BudgetBreakdown }>(
        ctx,
        '/api/budget/breakdown',
      );
      const wi1 = flattenItems(breakdown.workItems.areas).find((i) => i.workItemId === 'wi-1')!;
      expect(wi1.subsidyPayback).toBe(2625);
      expect(wi1.minSubsidyPayback).toBe(2644.45);
      const src = (id: string) => breakdown.budgetSources.find((b) => b.id === id)!;
      expect([src('bs-a').subsidyPaybackMin, src('bs-a').subsidyPaybackMax]).toEqual([
        5577.78, 5536.76,
      ]);
      expect([src('bs-b').subsidyPaybackMin, src('bs-b').subsidyPaybackMax]).toEqual([
        1382.22, 1903.24,
      ]);
      expect([
        src('discretionary-system').subsidyPaybackMin,
        src('discretionary-system').subsidyPaybackMax,
      ]).toEqual([0, 0]);
      expect([src('unassigned').subsidyPaybackMin, src('unassigned').subsidyPaybackMax]).toEqual([
        0, 0,
      ]);
      expect(breakdown.subsidyAdjustments).toEqual([
        expect.objectContaining({
          subsidyProgramId: 'sp-1',
          maximumAmount: 30000,
          maxPayout: 6000,
        }),
      ]);
    });

    it('breakdown with bs-b deselected: grants recomputed on the surviving lines, money unchanged', async () => {
      const { breakdown } = await getJson<{ breakdown: BudgetBreakdown }>(
        ctx,
        '/api/budget/breakdown?deselectedSources=bs-b',
      );
      // sp-1 eligible = l-1, l-3, l-7 = 50,200 in all scenarios: payout 10,040 below the 30,000 cap
      // on eligible costs, so nothing is capped and the three scenarios agree
      const wi = (id: string) =>
        flattenItems(breakdown.workItems.areas).find((i) => i.workItemId === id)!;
      const hi1 = flattenItems(breakdown.householdItems.areas).find(
        (i) => i.householdItemId === 'hi-1',
      )!;
      expect([wi('wi-1').subsidyPayback, wi('wi-1').minSubsidyPayback]).toEqual([2844.62, 2844.62]);
      expect([wi('wi-2').subsidyPayback, wi('wi-2').minSubsidyPayback]).toEqual([1422.31, 1422.31]);
      expect([hi1.subsidyPayback, hi1.minSubsidyPayback]).toEqual([1733.07, 1733.07]);
      // wi-3 had only a bs-b line: it drops out of the filtered rows, and Grant Two pays nothing
      expect(flattenItems(breakdown.workItems.areas).some((i) => i.workItemId === 'wi-3')).toBe(
        false,
      );
      expect(breakdown.workItems.totals.subsidyPayback).toBe(
        Math.round((2844.62 + 1422.31) * 100) / 100,
      );
      const src = (id: string) => breakdown.budgetSources.find((b) => b.id === id)!;
      expect([src('bs-a').subsidyPaybackMin, src('bs-a').subsidyPaybackMax]).toEqual([6000, 6000]);
      expect([src('bs-b').subsidyPaybackMin, src('bs-b').subsidyPaybackMax]).toEqual([0, 0]);
      const unfiltered = getBreakdownMoney(computeProjectMoney(ctx.app.db, VAT));
      expect(breakdown.money).toEqual(unfiltered);
      expect(figures(breakdown.money.workItems['wi-1']!).grants).toEqual([2634.69, 2644.45, 2625]);
    });
  });

  describeConsistency(() => ctx);
});

describe('money service: AC8 step 2 (Loan Alpha reduced to 57,000.00)', () => {
  let ctx: Ctx;
  let tempDir: string;
  let env: NodeJS.ProcessEnv;
  let summary: MoneySummary;

  beforeAll(async () => {
    ({ ctx, tempDir, env } = await createCtx());
    seedFixture(ctx.app);
    ctx.app.db
      .update(schema.budgetSources)
      .set({ totalAmount: 57000 })
      .where(eq(schema.budgetSources.id, 'bs-a'))
      .run();
    summary = computeProjectMoney(ctx.app.db, VAT).summary;
  });

  afterAll(async () => {
    await ctx.app.close();
    process.env = env;
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('flips to over_budget although the best scenario is positive (strict rule, no Tight)', () => {
    expect(summary.fundingTotal).toBe(73500);
    expect(range(summary.leftToSpend)).toEqual([-240, 3548, -4028]);
    expect(summary.leftToSpend.verdict).toBe('over_budget');
  });

  it('shows the freed-up allocation on the reduced source', () => {
    expect(summary.sources.find((s) => s.id === 'bs-a')!.unallocated).toBe(850);
  });

  it('leaves every other figure identical to the base fixture', () => {
    expect(range(summary.expectedCost)).toEqual([80940, 76912, 84968]);
    expect(range(summary.expectedGrants)).toEqual([7200, 6960, 7440]);
    expect(summary.paid).toBe(25300.5);
    expect(summary.stillToPay).toBe(16500);
    expect(summary.readyToSubmit).toEqual({ count: 3, amount: 22468 });
  });

  describeConsistency(() => ctx);
});
