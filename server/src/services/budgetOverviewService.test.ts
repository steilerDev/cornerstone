/**
 * Tests of the grant summary behind `GET /api/budget/overview` (#2237, contract 25): the overview
 * is `{ subsidySummary }` only; every other project figure comes from the money service. Fresh
 * in-memory database per test with the real migrations. The AC8 fixture (capped grant, counted
 * statuses, step 2) is in `moneyService.fixture.test.ts`.
 *
 * Mutations these tests catch:
 *  - an eligible or applied grant counted in the payback range (only approved / received count);
 *  - a rejected grant counted in activeSubsidyCount or paying back;
 *  - a net line not grossed up with the configured VAT rate before the grant is applied;
 *  - a linked line using its planned amount instead of the itemized amount as the grant base;
 *  - the eligible-costs cap missing from the payout or from oversubscribedSubsidies;
 *  - `project` ignored (a second engine run) or the legacy fields coming back on the overview.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type Database from 'better-sqlite3';
import { openMoneyDb, type MoneySeed, type MoneyTestDb } from '../test/moneyDb.js';
import { getBudgetOverview } from './budgetOverviewService.js';
import { computeProjectMoney } from './moneyService.js';
import * as schema from '../db/schema.js';
import { eq } from 'drizzle-orm';

const VAT = 0.19;

describe('getBudgetOverview', () => {
  let sqlite: Database.Database;
  let db: MoneyTestDb;
  let seed: MoneySeed;

  beforeEach(() => {
    ({ sqlite, db, seed } = openMoneyDb());
  });

  afterEach(() => {
    sqlite.close();
  });

  const summary = (rate = VAT) => getBudgetOverview(db, rate).subsidySummary;
  const payback = (rate = VAT) => {
    const s = summary(rate);
    return [s.totalReductions, s.minTotalPayback, s.maxTotalPayback];
  };

  describe('shape', () => {
    it('is the grant summary only, with every legacy project field gone', () => {
      expect(Object.keys(getBudgetOverview(db, VAT))).toEqual(['subsidySummary']);
      expect(Object.keys(getBudgetOverview(db, VAT).subsidySummary).sort()).toEqual([
        'activeSubsidyCount',
        'maxTotalPayback',
        'minTotalPayback',
        'oversubscribedSubsidies',
        'totalReductions',
      ]);
    });

    it('is all zero for an empty database', () => {
      expect(summary()).toEqual({
        totalReductions: 0,
        activeSubsidyCount: 0,
        minTotalPayback: 0,
        maxTotalPayback: 0,
        oversubscribedSubsidies: [],
      });
    });

    it('takes the figures from the given project run without computing a second one', () => {
      seed.workItem('wi-1');
      seed.wiLine('l1', 'wi-1', { planned: 1000, confidence: 'own_estimate' });
      seed.grant('sp-1', { workItems: ['wi-1'], value: 10 });
      const project = computeProjectMoney(db, VAT);
      // the data changes after the run: the summary must still describe the given run
      db.update(schema.workItemBudgets)
        .set({ plannedAmount: 5000 })
        .where(eq(schema.workItemBudgets.id, 'l1'))
        .run();
      const reused = getBudgetOverview(db, VAT, project).subsidySummary;
      expect([reused.totalReductions, reused.minTotalPayback, reused.maxTotalPayback]).toEqual([
        100, 80, 120,
      ]);
      expect(payback()).toEqual([500, 400, 600]);
    });
  });

  describe('activeSubsidyCount', () => {
    it('counts every program that is not rejected, whatever its status or links', () => {
      seed.grant('sp-1', { status: 'eligible' });
      seed.grant('sp-2', { status: 'applied' });
      seed.grant('sp-3', { status: 'approved' });
      seed.grant('sp-4', { status: 'received' });
      seed.grant('sp-5', { status: 'rejected' });
      expect(summary().activeSubsidyCount).toBe(4);
    });
  });

  describe('counted grants and scenarios', () => {
    beforeEach(() => {
      seed.workItem('wi-1');
      seed.wiLine('l1', 'wi-1', { planned: 1000, confidence: 'own_estimate' });
    });

    it('counts approved and received grants: expected -> totalReductions, best -> min, worst -> max', () => {
      seed.grant('sp-1', { status: 'approved', workItems: ['wi-1'], value: 10 });
      expect(payback()).toEqual([100, 80, 120]);
      seed.grant('sp-2', { status: 'received', workItems: ['wi-1'], value: 5 });
      expect(payback()).toEqual([150, 120, 180]);
    });

    it.each(['eligible', 'applied', 'rejected'] as const)('does not count a %s grant', (status) => {
      seed.grant('sp-1', { status, workItems: ['wi-1'], value: 10 });
      expect(payback()).toEqual([0, 0, 0]);
    });

    it('pays nothing for a grant that is not linked to any item', () => {
      seed.grant('sp-1', { status: 'approved', value: 10 });
      expect(payback()).toEqual([0, 0, 0]);
    });

    it('pays the flat value of a fixed grant in every scenario', () => {
      seed.grant('sp-1', { type: 'fixed', value: 15, workItems: ['wi-1'] });
      expect(payback()).toEqual([15, 15, 15]);
    });

    it('only applies a category-scoped grant to lines of that category', () => {
      seed.category('bc-1', 'Category One');
      seed.category('bc-2', 'Category Two');
      seed.wiLine('l2', 'wi-1', { planned: 1000, confidence: 'invoice', category: 'bc-1' });
      seed.wiLine('l3', 'wi-1', { planned: 1000, confidence: 'invoice', category: 'bc-2' });
      seed.grant('sp-1', { workItems: ['wi-1'], value: 10, categories: ['bc-1'] });
      // only l2 (1,000, no margin): 100
      expect(payback()).toEqual([100, 100, 100]);
    });

    it('applies the grant of a household item', () => {
      seed.householdItem('hi-1');
      seed.hiLine('h1', 'hi-1', { planned: 200, confidence: 'invoice' });
      seed.grant('sp-1', { householdItems: ['hi-1'], value: 50 });
      expect(payback()).toEqual([100, 100, 100]);
    });
  });

  describe('cost basis', () => {
    it('grosses a net line up with the configured VAT rate before applying the grant', () => {
      seed.workItem('wi-1');
      seed.wiLine('l1', 'wi-1', { planned: 100, includesVat: false, confidence: 'own_estimate' });
      seed.grant('sp-1', { workItems: ['wi-1'], value: 10 });
      expect(payback(0.19)).toEqual([11.9, 9.52, 14.28]);
      expect(payback(0.2)).toEqual([12, 9.6, 14.4]);
    });

    it('uses the itemized amount of a linked line (offers included), not the planned amount', () => {
      seed.workItem('wi-1');
      seed.wiLine('l1', 'wi-1', { planned: 1000, confidence: 'own_estimate' });
      seed.invoice('inv-1', 800, 'pending');
      seed.link('inv-1', 'l1', 'work_item', 800);
      seed.grant('sp-1', { workItems: ['wi-1'], value: 10 });
      expect(payback()).toEqual([80, 80, 80]);
      seed.workItem('wi-2');
      seed.wiLine('l2', 'wi-2', { planned: 1000, confidence: 'quote' });
      seed.invoice('q1', 1200, 'quotation');
      seed.link('q1', 'l2', 'work_item', 1100);
      seed.grant('sp-2', { workItems: ['wi-2'], value: 10 });
      expect(payback()).toEqual([190, 190, 190]);
    });

    it('averages nothing across items: the payback is the sum of the item shares', () => {
      seed.workItem('wi-1');
      seed.workItem('wi-2');
      seed.wiLine('l1', 'wi-1', { planned: 100, confidence: 'invoice' });
      seed.wiLine('l2', 'wi-2', { planned: 300, confidence: 'invoice' });
      seed.grant('sp-1', { workItems: ['wi-1', 'wi-2'], value: 10 });
      expect(payback()).toEqual([40, 40, 40]);
    });
  });

  describe('oversubscribed grants (cap on eligible costs)', () => {
    beforeEach(() => {
      seed.workItem('wi-1');
      seed.wiLine('l1', 'wi-1', { planned: 4000, confidence: 'invoice' });
    });

    it('caps the payout at the rate times the cap and reports the excess', () => {
      seed.grant('sp-1', { workItems: ['wi-1'], value: 20, cap: 1000 });
      const s = summary();
      expect([s.totalReductions, s.minTotalPayback, s.maxTotalPayback]).toEqual([200, 200, 200]);
      expect(s.oversubscribedSubsidies).toEqual([
        {
          subsidyProgramId: 'sp-1',
          name: 'Grant sp-1',
          maximumAmount: 1000,
          maxPayout: 200,
          uncappedMinPayback: 800,
          uncappedMaxPayback: 800,
          minExcess: 600,
          maxExcess: 600,
        },
      ]);
    });

    it('does not list a grant whose cap is not reached, or one without a cap', () => {
      seed.grant('sp-1', { workItems: ['wi-1'], value: 20, cap: 100000 });
      seed.grant('sp-2', { workItems: ['wi-1'], value: 5 });
      expect(summary().oversubscribedSubsidies).toEqual([]);
      expect(payback()).toEqual([1000, 1000, 1000]);
    });

    it('reports a different excess per scenario when the margin moves the cost across the cap', () => {
      seed.wiLine('l2', 'wi-1', { planned: 1000, confidence: 'own_estimate' });
      seed.grant('sp-1', { workItems: ['wi-1'], value: 10, cap: 4800 });
      // eligible cost 5,000 / 4,800 / 5,200 -> only the expected and worst scenarios exceed 4,800
      const s = summary();
      expect(s.oversubscribedSubsidies).toHaveLength(1);
      const o = s.oversubscribedSubsidies[0]!;
      expect(o.maxExcess).toBeGreaterThan(o.minExcess);
      expect(o.minExcess).toBe(0);
    });
  });
});
