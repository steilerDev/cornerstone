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
 *  - a second Still-to-pay definition: breaks the invoice-summary and vendor consistency blocks;
 *  - a breakdown view that drops or double-counts a line, orphan or the Not yet split row: breaks
 *    S-C2 (every view sums to the total, to the cent, for every field and scenario);
 *  - a per-line Paid / Still to pay attribution that differs from the project figure: breaks the
 *    S-P table and S-C1 (hand-checked splits of Q1, I1-I5);
 *  - the source filter touching Not yet split or the source list: breaks S-C6;
 *  - an offer line counted at +-5% again: breaks S-C5 (face value in all three scenarios).
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type {
  BudgetBreakdown,
  AttentionResponse,
  BudgetOverviewResponse,
  BreakdownFigures,
  HomePulseResponse,
  MoneyCostFigures,
  MoneyRange,
  MoneySummary,
} from '@cornerstone/shared';
import { buildApp } from '../app.js';
import * as schema from '../db/schema.js';
import * as userService from './userService.js';
import * as sessionService from './sessionService.js';
import { computeProjectMoney, getBreakdownMoney, loadMoneyInput } from './moneyService.js';
import { computeMoney, toMoneyRange } from './shared/moneyEngine.js';
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

const cents = (n: number): number => Math.round(n * 100);

const SCENARIOS = ['expected', 'best', 'worst'] as const;
const RANGE_FIELDS = ['expectedCost', 'expectedGrants', 'afterGrants', 'notYetPaid'] as const;

/** Σ of figures in cents per field and scenario; paid / stillToPay as plain cents. */
function sumFigures(rows: BreakdownFigures[]): Record<string, number> {
  const out: Record<string, number> = { paid: 0, stillToPay: 0 };
  for (const field of RANGE_FIELDS) for (const scen of SCENARIOS) out[`${field}.${scen}`] = 0;
  for (const row of rows) {
    out['paid'] = out['paid']! + cents(row.paid);
    out['stillToPay'] = out['stillToPay']! + cents(row.stillToPay);
    for (const field of RANGE_FIELDS) {
      for (const scen of SCENARIOS) {
        out[`${field}.${scen}`] = out[`${field}.${scen}`]! + cents(row[field][scen]);
      }
    }
  }
  return out;
}

async function getBreakdown(ctx: Ctx, query = ''): Promise<BudgetBreakdown> {
  const body = await getJson<{ breakdown: BudgetBreakdown }>(ctx, `/api/budget/breakdown${query}`);
  return body.breakdown;
}

/** Σ of every view's rows plus Not yet split, to compare with the breakdown total. */
function viewSums(b: BudgetBreakdown): Record<string, Record<string, number>> {
  const extra = b.notYetSplit ? [b.notYetSplit] : [];
  return {
    lines: sumFigures([...b.lines.map((l) => l.figures), ...extra]),
    items: sumFigures([
      ...b.items.map((i) => i.figures),
      ...(b.orphanLines ? [b.orphanLines] : []),
      ...extra,
    ]),
    area: sumFigures([
      ...b.byArea.filter((a) => a.parentId === null).map((a) => a.figures),
      ...(b.noArea ? [b.noArea] : []),
      ...extra,
    ]),
    type: sumFigures([b.byType.work_items, b.byType.household_items, ...extra]),
    category: sumFigures([...b.byCategory.map((c) => c.figures), ...extra]),
    source: sumFigures([...b.bySource.map((s) => s.figures), ...extra]),
  };
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
    it('1. GET /api/budget/overview: money equals the service; the overview is the grant summary only (S-C5)', async () => {
      const ctx = getCtx();
      const body = await getJson<BudgetOverviewResponse>(ctx, '/api/budget/overview');
      const money = computeProjectMoney(ctx.app.db, VAT).summary;
      expect(body.money).toEqual(money);
      expect(Object.keys(body.overview)).toEqual(['subsidySummary']);
      expect(body.overview.subsidySummary.totalReductions).toBe(money.expectedGrants.expected);
      expect(body.overview.subsidySummary.minTotalPayback).toBe(money.expectedGrants.best);
      expect(body.overview.subsidySummary.maxTotalPayback).toBe(money.expectedGrants.worst);
    });

    describe.each([
      ['unfiltered', ''],
      ['with bs-b deselected', '?deselectedSources=bs-b'],
    ])('2. GET /api/budget/breakdown %s', (_name, query) => {
      const filtered = query !== '';

      /** The reference: the money service, or the engine run without the bs-b lines. */
      function reference(ctx: Ctx) {
        const money = computeProjectMoney(ctx.app.db, VAT).summary;
        if (!filtered) {
          return {
            expectedCost: money.expectedCost,
            expectedGrants: money.expectedGrants,
            afterGrants: money.afterGrants,
          };
        }
        const run = computeMoney(loadMoneyInput(ctx.app.db, VAT), {
          includeLine: (l) => l.budgetSourceId !== 'bs-b',
        });
        return {
          expectedCost: toMoneyRange(run.expectedCost),
          expectedGrants: toMoneyRange(run.expectedGrants),
          afterGrants: toMoneyRange(run.afterGrants),
        };
      }

      it('S-C1: the total equals the money service in every scenario (the filter removes the bs-b lines)', async () => {
        const ctx = getCtx();
        const b = await getBreakdown(ctx, query);
        const money = computeProjectMoney(ctx.app.db, VAT).summary;
        const ref = reference(ctx);
        expect(b.total.expectedCost).toEqual(ref.expectedCost);
        expect(b.total.expectedGrants).toEqual(ref.expectedGrants);
        expect(b.total.afterGrants).toEqual(ref.afterGrants);
        if (!filtered) {
          expect(b.total.notYetPaid).toEqual(money.notYetPaid);
          expect(b.total.paid).toBe(money.paid);
          expect(b.total.stillToPay).toBe(money.stillToPay);
          return;
        }
        // Paid and Still to pay of the surviving lines are what they are unfiltered
        const all = await getBreakdown(ctx);
        const gone = all.lines.filter((l) => l.budgetSourceId === 'bs-b');
        expect(gone.length).toBeGreaterThan(0);
        expect(cents(b.total.paid)).toBe(
          cents(money.paid) - gone.reduce((sum, l) => sum + cents(l.figures.paid), 0),
        );
        expect(cents(b.total.stillToPay)).toBe(
          cents(money.stillToPay) - gone.reduce((sum, l) => sum + cents(l.figures.stillToPay), 0),
        );
        for (const scen of SCENARIOS) {
          expect(cents(b.total.notYetPaid[scen])).toBe(
            cents(b.total.expectedCost[scen]) - cents(b.total.paid),
          );
        }
      });

      it('S-C2: every view, with Not yet split, sums to the total for every field and scenario', async () => {
        const ctx = getCtx();
        const b = await getBreakdown(ctx, query);
        const total = sumFigures([b.total]);
        const views = viewSums(b);
        for (const [name, sums] of Object.entries(views)) {
          expect([name, sums]).toEqual([name, total]);
        }
        if (!filtered) {
          const money = computeProjectMoney(ctx.app.db, VAT).summary;
          for (const sums of Object.values(views)) {
            expect(sums['paid']).toBe(cents(money.paid));
            expect(sums['stillToPay']).toBe(cents(money.stillToPay));
          }
        }
      });

      it('S-C6 / filter rule: the bs-b lines and row are gone, Not yet split and the options are unchanged', async () => {
        const ctx = getCtx();
        const all = await getBreakdown(ctx);
        const b = await getBreakdown(ctx, query);
        expect(b.notYetSplit).toEqual(all.notYetSplit);
        expect(b.sourceOptions).toEqual(all.sourceOptions);
        expect(b.hasUnassignedLines).toBe(all.hasUnassignedLines);
        if (!filtered) {
          expect(b).toEqual(all);
          return;
        }
        const goneCost = all.lines
          .filter((l) => l.budgetSourceId === 'bs-b')
          .reduce((sum, l) => sum + cents(l.figures.expectedCost.expected), 0);
        expect(goneCost).toBe(1800000); // l-4 4,000 + l-5 12,000 + l-9 2,000
        expect(cents(b.total.expectedCost.expected)).toBe(
          cents(all.total.expectedCost.expected) - goneCost,
        );
        expect(b.bySource.some((r) => r.budgetSourceId === 'bs-b')).toBe(false);
        expect(b.lines.some((l) => l.budgetSourceId === 'bs-b')).toBe(false);
        expect(b.lines.length).toBe(all.lines.length - 3);
        // wi-3 had only a bs-b line: it drops out of the items
        expect(b.items.some((i) => i.id === 'wi-3')).toBe(false);
        expect(all.items.some((i) => i.id === 'wi-3')).toBe(true);
      });
    });

    it("S-C3: a source row's expected cost equals the source allocation; a source without lines has 0", async () => {
      const ctx = getCtx();
      const b = await getBreakdown(ctx);
      const money = computeProjectMoney(ctx.app.db, VAT).summary;
      for (const source of money.sources) {
        const row = b.bySource.find((r) => r.budgetSourceId === source.id);
        expect(row?.figures.expectedCost.expected ?? 0).toBe(source.allocated);
      }
      expect(b.bySource.find((r) => r.budgetSourceId === 'bs-c')).toBeUndefined();
      expect(money.sources.find((x) => x.id === 'bs-c')!.allocated).toBe(0);
    });

    it('S-C4: type rows equal money.byType and area rows equal money.byArea (same ids, same order)', async () => {
      const ctx = getCtx();
      const b = await getBreakdown(ctx);
      const money = computeProjectMoney(ctx.app.db, VAT).summary;
      for (const key of ['work_items', 'household_items'] as const) {
        expect(figures(b.byType[key])).toEqual(figures(money.byType[key]));
      }
      const rows = [
        ...b.byArea.map((a) => ({ areaId: a.areaId as string | null, f: a.figures })),
        ...(b.noArea ? [{ areaId: null as string | null, f: b.noArea }] : []),
      ];
      expect(rows.map((r) => r.areaId)).toEqual(money.byArea.map((a) => a.areaId));
      rows.forEach((row, i) => expect(figures(row.f)).toEqual(figures(money.byArea[i]!)));
    });

    it('S-C5 (AC9): an offer-linked line counts at face value, with no +-5%', async () => {
      const ctx = getCtx();
      const b = await getBreakdown(ctx);
      const line = (id: string) => b.lines.find((l) => l.id === id)!;
      expect(line('l-1').figures.expectedCost).toEqual({
        expected: 23800,
        best: 23800,
        worst: 23800,
      });
      expect(line('l-1').linkStatus).toBe('quotation');
      // l-3 is an estimate line linked to a pending record: also face value
      expect(line('l-3').figures.expectedCost).toEqual({
        expected: 11900,
        best: 11900,
        worst: 11900,
      });
      expect(line('l-3').linkStatus).toBe('pending');
      // an unlinked estimate keeps its margin
      expect(line('l-5').figures.expectedCost).toEqual({
        expected: 12000,
        best: 9600,
        worst: 14400,
      });
      expect(line('l-5').linkStatus).toBeNull();
    });

    it('S-P: Paid and Still to pay are split over the lines as hand-checked (Q1, I1-I5)', async () => {
      const ctx = getCtx();
      const b = await getBreakdown(ctx);
      const pay = (id: string) => {
        const f = b.lines.find((l) => l.id === id)!.figures;
        return [f.paid, f.stillToPay];
      };
      expect(pay('l-1')).toEqual([4760, 3808]); // Q1: 5,000 / 4,000 over 23,800 : 1,200
      expect(pay('l-3')).toEqual([2000, 9900]); // I1 pending 11,900, D3 2,000 paid
      expect(pay('l-6')).toEqual([3000.5, 0]); // I2: the 0.50 stays on the line
      expect(pay('l-7')).toEqual([14500, 0]); // I3 claimed
      expect(pay('l-9')).toEqual([0, 2000]); // I4 pending 2,600, 2,000 itemized
      for (const id of ['l-2', 'l-4', 'l-5', 'l-8']) expect(pay(id)).toEqual([0, 0]);
      expect(b.notYetSplit).toMatchObject({
        expectedCost: { expected: 2600, best: 2600, worst: 2600 },
        paid: 1040, // Q1 240 + I5 800
        stillToPay: 792, // Q1 192 + I4 600
        notYetPaid: { expected: 1560, best: 1560, worst: 1560 },
      });
      expect(b.total.paid).toBe(25300.5);
      expect(b.total.stillToPay).toBe(16500);
    });

    it('a record paid more than its line costs shows a negative Not yet paid on the line, unclamped', async () => {
      const ctx = getCtx();
      const b = await getBreakdown(ctx);
      const l6 = b.lines.find((l) => l.id === 'l-6')!.figures;
      expect(l6.notYetPaid).toEqual({ expected: -0.5, best: -0.5, worst: -0.5 });
      expect(Math.min(...b.lines.map((l) => l.figures.notYetPaid.expected))).toBe(-0.5);
    });

    it('3. every item subsidy-payback endpoint agrees with the breakdown items and the money service', async () => {
      const ctx = getCtx();
      const b = await getBreakdown(ctx);
      const money = getBreakdownMoney(computeProjectMoney(ctx.app.db, VAT));
      let expectedSum = 0;
      for (const item of b.items) {
        const url =
          item.kind === 'work_item'
            ? `/api/work-items/${item.id}/subsidy-payback`
            : `/api/household-items/${item.id}/subsidy-payback`;
        const p = await getJson<{
          minTotalPayback: number;
          maxTotalPayback: number;
          expectedTotalPayback: number;
        }>(ctx, url);
        const grants = item.figures.expectedGrants;
        expect(p.maxTotalPayback).toBe(grants.worst);
        expect(p.minTotalPayback).toBe(grants.best);
        expect(p.expectedTotalPayback).toBe(grants.expected);
        const fromMoney =
          item.kind === 'work_item' ? money.workItems[item.id] : money.householdItems[item.id];
        expect(p.expectedTotalPayback).toBe(fromMoney!.expectedGrants.expected);
        expectedSum += cents(p.expectedTotalPayback);
      }
      const summary = computeProjectMoney(ctx.app.db, VAT).summary;
      expect(expectedSum).toBe(cents(summary.expectedGrants.expected));
    });

    it('4. GET /api/household-items: budgetSummary.subsidyReduction is the counted expected share', async () => {
      const ctx = getCtx();
      const b = await getBreakdown(ctx);
      const list = await getJson<{
        items: Array<{ id: string; budgetSummary: { subsidyReduction: number } }>;
      }>(ctx, '/api/household-items');
      expect(list.items.length).toBe(2);
      for (const item of list.items) {
        const row = b.items.find((i) => i.kind === 'household_item' && i.id === item.id);
        expect(item.budgetSummary.subsidyReduction).toBe(row?.figures.expectedGrants.expected ?? 0);
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

    it('9. GET /api/home/pulse: left to spend, still to pay and its count are the money service figures (#2232)', async () => {
      const ctx = getCtx();
      const money = computeProjectMoney(ctx.app.db, VAT).summary;
      const pulse = await getJson<HomePulseResponse>(ctx, '/api/home/pulse');
      expect(pulse.leftToSpend).toEqual(money.leftToSpend);
      expect(pulse.stillToPay).toBe(money.stillToPay);
      expect(pulse.stillToPayCount).toBe(money.stillToPayCount);
    });

    it('10. GET /api/invoices summary.claimable is the money service ready to submit (#2232)', async () => {
      const ctx = getCtx();
      const money = computeProjectMoney(ctx.app.db, VAT).summary;
      const body = await getJson<{
        summary: {
          claimable: { count: number; totalAmount: number };
          pending: { count: number; totalAmount: number };
          paid: { count: number; totalAmount: number };
        };
      }>(ctx, '/api/invoices');
      expect(body.summary.claimable).toEqual({
        count: money.readyToSubmit.count,
        totalAmount: money.readyToSubmit.amount,
      });
      // pins the discriminating shape: the fixture has pending and paid invoices that are NOT
      // ready to submit (own funds, unfunded, discretionary rail), so the all-invoices totals
      // must exceed the ready-to-submit figure; a "pending + paid" definition would equal them
      const { pending, paid, claimable } = body.summary;
      expect(pending.totalAmount + paid.totalAmount).toBeGreaterThan(claimable.totalAmount);
      expect(pending.count + paid.count).toBeGreaterThan(claimable.count);
      expect(claimable.count).toBeGreaterThan(0);
    });

    it('11. GET /api/attention: the N8 rows add up to ready to submit, each equal to its source (#2232)', async () => {
      const ctx = getCtx();
      const money = computeProjectMoney(ctx.app.db, VAT).summary;
      const body = await getJson<AttentionResponse>(ctx, '/api/attention');
      const rows = [...body.rows, ...body.tidyUp].filter((r) => r.rule === 'N8');
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        const source = money.sources.find((x) => x.id === row.subject.id)!;
        expect(row.amount).toBe(source.readyToSubmit.amount);
        expect(row.params).toMatchObject({ count: source.readyToSubmit.count });
      }
      const cents = rows.reduce((acc, r) => acc + Math.round((r.amount ?? 0) * 100), 0);
      expect(cents).toBe(Math.round(money.readyToSubmit.amount * 100));
    });

    it('12. GET /api/invoices (#2238): listTotals, per-record Paid and the Not yet split filter equal the money service', async () => {
      const ctx = getCtx();
      const money = computeProjectMoney(ctx.app.db, VAT).summary;
      type ListBody = {
        invoices: { id: string; paid: number; notYetSplit: boolean }[];
        pagination: { totalItems: number };
        listTotals: {
          openPayable: { count: number; totalAmount: number };
          offers: {
            count: number;
            amount: number;
            paid: number;
            stillToPay: number;
            remainingOnOffer: number;
          };
        };
      };
      const stillToPay = { count: money.stillToPayCount, totalAmount: money.stillToPay };

      // To pay chip: the footer is Still to pay (a page of one row changes nothing)
      const open = await getJson<ListBody>(ctx, '/api/invoices?openOnly=true&pageSize=1');
      expect(open.listTotals.openPayable).toEqual(stillToPay);
      // unfiltered: the same figure
      const all = await getJson<ListBody>(ctx, '/api/invoices?pageSize=1');
      expect(all.listTotals.openPayable).toEqual(stillToPay);

      // Offers summary equals money.records.offers, field by field
      const offers = await getJson<ListBody>(ctx, '/api/invoices?status=quotation&pageSize=1');
      expect(offers.listTotals.offers).toEqual(money.records.offers);
      expect(all.listTotals.offers).toEqual(money.records.offers);

      // Σ per-record Paid over every row is the project's Paid, to the cent
      const everything = await getJson<ListBody>(ctx, '/api/invoices?pageSize=100');
      expect(everything.invoices.length).toBe(everything.pagination.totalItems);
      const paidCents = everything.invoices.reduce((acc, r) => acc + Math.round(r.paid * 100), 0);
      expect(paidCents).toBe(Math.round(money.paid * 100));

      // Not yet split: rows flagged, rows returned and the filter's total are the money service count
      expect(everything.invoices.filter((r) => r.notYetSplit).length).toBe(
        money.notYetSplit.recordCount,
      );
      const split = await getJson<ListBody>(ctx, '/api/invoices?notYetSplit=true&pageSize=100');
      expect(split.pagination.totalItems).toBe(money.notYetSplit.recordCount);
      expect(split.invoices.length).toBe(money.notYetSplit.recordCount);
      expect(split.invoices.every((r) => r.notYetSplit)).toBe(true);
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

    it('breakdown (unfiltered): grant shares per item, per source and per line', async () => {
      const breakdown = await getBreakdown(ctx);
      const wi1 = breakdown.items.find((i) => i.id === 'wi-1')!;
      expect(range(wi1.figures.expectedGrants)).toEqual([2634.69, 2644.45, 2625]);
      const src = (id: string | null) => breakdown.bySource.find((r) => r.budgetSourceId === id)!;
      const grants = (id: string | null) => {
        const g = src(id).figures.expectedGrants;
        return [g.best, g.worst];
      };
      expect(grants('bs-a')).toEqual([5577.78, 5536.76]);
      expect(grants('bs-b')).toEqual([1382.22, 1903.24]);
      expect(grants('discretionary-system')).toEqual([0, 0]);
      expect(grants(null)).toEqual([0, 0]);
      expect(breakdown.total.expectedGrants).toEqual({ expected: 7200, best: 6960, worst: 7440 });
    });

    it('breakdown with bs-b deselected: grants recomputed on the surviving lines', async () => {
      const breakdown = await getBreakdown(ctx, '?deselectedSources=bs-b');
      // sp-1 eligible = l-1, l-3, l-7 = 50,200 in all scenarios: payout 10,040 below the 30,000 cap
      // on eligible costs, so nothing is capped and the three scenarios agree
      const item = (id: string, kind: 'work_item' | 'household_item' = 'work_item') =>
        breakdown.items.find((i) => i.kind === kind && i.id === id)!;
      expect(range(item('wi-1').figures.expectedGrants)).toEqual([2844.62, 2844.62, 2844.62]);
      expect(range(item('wi-2').figures.expectedGrants)).toEqual([1422.31, 1422.31, 1422.31]);
      expect(range(item('hi-1', 'household_item').figures.expectedGrants)).toEqual([
        1733.07, 1733.07, 1733.07,
      ]);
      // wi-3 had only a bs-b line: it drops out, and Grant Two pays nothing
      expect(breakdown.items.some((i) => i.id === 'wi-3')).toBe(false);
      const wiGrants = breakdown.items
        .filter((i) => i.kind === 'work_item')
        .reduce((sum, i) => sum + cents(i.figures.expectedGrants.expected), 0);
      expect(wiGrants).toBe(cents(2844.62 + 1422.31));
      const src = (id: string) => breakdown.bySource.find((r) => r.budgetSourceId === id)!;
      expect([
        src('bs-a').figures.expectedGrants.best,
        src('bs-a').figures.expectedGrants.worst,
      ]).toEqual([6000, 6000]);
      // the unfiltered money service is untouched by the filter
      expect(computeProjectMoney(ctx.app.db, VAT).summary.expectedGrants.expected).toBe(7200);
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
