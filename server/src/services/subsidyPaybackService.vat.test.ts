/**
 * VAT-rate regression tests for the per-item subsidy payback services.
 *
 * A net-stored budget line (includes_vat = 0) of 100 is grossed up to 120 at vatRate=0.2 before
 * the subsidy engine runs, so a 10% subsidy on an own_estimate (+-20%) line pays back 9.6 - 14.4
 * (not 9.52 - 14.28 as at 0.19). The per-item services must agree with getBudgetOverview and
 * getBudgetBreakdown for the same data.
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import { getWorkItemSubsidyPayback } from './subsidyPaybackService.js';
import { getHouseholdItemSubsidyPayback } from './householdItemSubsidyPaybackService.js';
import { getBudgetOverview } from './budgetOverviewService.js';
import { getBudgetBreakdown } from './budgetBreakdownService.js';

describe('subsidy payback services — configured VAT rate', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;
  let idCounter = 0;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    runMigrations(sqlite);
    db = drizzle(sqlite, { schema });
    idCounter = 0;
  });

  afterEach(() => {
    sqlite.close();
  });

  function insertSubsidy(opts: {
    reductionType: 'percentage' | 'fixed';
    reductionValue: number;
  }): string {
    const id = `sp-vat-${++idCounter}`;
    const now = new Date().toISOString();
    db.insert(schema.subsidyPrograms)
      .values({
        id,
        name: `Subsidy ${id}`,
        reductionType: opts.reductionType,
        reductionValue: opts.reductionValue,
        applicationStatus: 'eligible',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  function insertWorkItem(includesVat: boolean, subsidyId: string): string {
    const id = `wi-vat-${++idCounter}`;
    const now = new Date().toISOString();
    db.insert(schema.workItems)
      .values({ id, title: id, status: 'not_started', createdAt: now, updatedAt: now })
      .run();
    db.insert(schema.workItemBudgets)
      .values({
        id: `wib-vat-${++idCounter}`,
        workItemId: id,
        plannedAmount: 100,
        confidence: 'own_estimate',
        includesVat,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    db.insert(schema.workItemSubsidies)
      .values({ workItemId: id, subsidyProgramId: subsidyId })
      .run();
    return id;
  }

  function insertHouseholdItem(includesVat: boolean, subsidyId: string): string {
    const id = `hi-vat-${++idCounter}`;
    const now = new Date().toISOString();
    db.insert(schema.householdItems)
      .values({
        id,
        name: id,
        categoryId: 'hic-furniture',
        status: 'planned',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    db.insert(schema.householdItemBudgets)
      .values({
        id: `hib-vat-${++idCounter}`,
        householdItemId: id,
        plannedAmount: 100,
        confidence: 'own_estimate',
        includesVat,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    db.insert(schema.householdItemSubsidies)
      .values({ householdItemId: id, subsidyProgramId: subsidyId })
      .run();
    return id;
  }

  describe.each([
    [0.2, 9.6, 14.4],
    [0.19, 9.52, 14.28],
  ])('vatRate=%s (percentage subsidy 10% on a net own_estimate line of 100)', (rate, min, max) => {
    it('work item payback is based on the grossed-up amount', () => {
      const workItemId = insertWorkItem(
        false,
        insertSubsidy({ reductionType: 'percentage', reductionValue: 10 }),
      );

      const result = getWorkItemSubsidyPayback(db, workItemId, rate);

      expect(result.minTotalPayback).toBeCloseTo(min, 5);
      expect(result.maxTotalPayback).toBeCloseTo(max, 5);
      expect(result.subsidies[0]!.minPayback).toBeCloseTo(min, 5);
      expect(result.subsidies[0]!.maxPayback).toBeCloseTo(max, 5);
    });

    it('household item payback is based on the grossed-up amount', () => {
      const hiId = insertHouseholdItem(
        false,
        insertSubsidy({ reductionType: 'percentage', reductionValue: 10 }),
      );

      const result = getHouseholdItemSubsidyPayback(db, hiId, rate);

      expect(result.minTotalPayback).toBeCloseTo(min, 5);
      expect(result.maxTotalPayback).toBeCloseTo(max, 5);
    });

    it('work item payback agrees with getBudgetOverview and getBudgetBreakdown', () => {
      const workItemId = insertWorkItem(
        false,
        insertSubsidy({ reductionType: 'percentage', reductionValue: 10 }),
      );

      const perItem = getWorkItemSubsidyPayback(db, workItemId, rate);
      const overview = getBudgetOverview(db, rate);
      const breakdown = getBudgetBreakdown(db, rate);
      const item = breakdown.workItems.areas[0]!.items[0]!;

      expect(overview.subsidySummary.minTotalPayback).toBeCloseTo(perItem.minTotalPayback, 5);
      expect(overview.subsidySummary.maxTotalPayback).toBeCloseTo(perItem.maxTotalPayback, 5);
      expect(item.minSubsidyPayback).toBeCloseTo(perItem.minTotalPayback, 5);
      expect(item.subsidyPayback).toBeCloseTo(perItem.maxTotalPayback, 5);
    });

    it('household item payback agrees with getBudgetOverview and getBudgetBreakdown', () => {
      const hiId = insertHouseholdItem(
        false,
        insertSubsidy({ reductionType: 'percentage', reductionValue: 10 }),
      );

      const perItem = getHouseholdItemSubsidyPayback(db, hiId, rate);
      const overview = getBudgetOverview(db, rate);
      const breakdown = getBudgetBreakdown(db, rate);
      const item = breakdown.householdItems.areas[0]!.items[0]!;

      expect(overview.subsidySummary.minTotalPayback).toBeCloseTo(perItem.minTotalPayback, 5);
      expect(overview.subsidySummary.maxTotalPayback).toBeCloseTo(perItem.maxTotalPayback, 5);
      expect(item.minSubsidyPayback).toBeCloseTo(perItem.minTotalPayback, 5);
      expect(item.subsidyPayback).toBeCloseTo(perItem.maxTotalPayback, 5);
    });
  });

  it('gross-stored lines (includesVat=true) are unaffected by the rate', () => {
    const workItemId = insertWorkItem(
      true,
      insertSubsidy({ reductionType: 'percentage', reductionValue: 10 }),
    );
    const hiId = insertHouseholdItem(
      true,
      insertSubsidy({ reductionType: 'percentage', reductionValue: 10 }),
    );

    // own_estimate +-20% of 100 -> 80 / 120 -> 8 / 12
    expect(getWorkItemSubsidyPayback(db, workItemId, 0.2).maxTotalPayback).toBeCloseTo(12, 5);
    expect(getWorkItemSubsidyPayback(db, workItemId, 0.2).minTotalPayback).toBeCloseTo(8, 5);
    expect(getHouseholdItemSubsidyPayback(db, hiId, 0.2).maxTotalPayback).toBeCloseTo(12, 5);
  });

  it('fixed subsidies pay back the flat value regardless of the rate', () => {
    const workItemId = insertWorkItem(
      false,
      insertSubsidy({ reductionType: 'fixed', reductionValue: 15 }),
    );

    const at19 = getWorkItemSubsidyPayback(db, workItemId, 0.19);
    const at20 = getWorkItemSubsidyPayback(db, workItemId, 0.2);

    expect(at19.maxTotalPayback).toBeCloseTo(15, 5);
    expect(at20.maxTotalPayback).toBeCloseTo(15, 5);
  });
});
