import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import { getHouseholdItemSubsidyPayback } from './householdItemSubsidyPaybackService.js';
import { NotFoundError } from '../errors/AppError.js';

describe('householdItemSubsidyPaybackService', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;
  let idCounter = 0;

  function createTestDb() {
    const sqliteDb = new Database(':memory:');
    sqliteDb.pragma('journal_mode = WAL');
    sqliteDb.pragma('foreign_keys = ON');
    runMigrations(sqliteDb);
    return { sqlite: sqliteDb, db: drizzle(sqliteDb, { schema }) };
  }

  function insertTestUser(userId = 'user-001') {
    const now = new Date().toISOString();
    db.insert(schema.users)
      .values({
        id: userId,
        email: `${userId}@example.com`,
        displayName: 'Test User',
        passwordHash: 'hashed',
        role: 'member',
        authProvider: 'local',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return userId;
  }

  function insertHouseholdItem(name = 'Test Household Item', userId = 'user-001') {
    const id = `hi-${++idCounter}`;
    const now = new Date(Date.now() + idCounter).toISOString();
    // hic-furniture is seeded by migration 0016
    db.insert(schema.householdItems)
      .values({
        id,
        name,
        categoryId: 'hic-furniture',
        status: 'planned',
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  function insertBudgetCategory(name?: string) {
    const id = `cat-${++idCounter}`;
    const now = new Date(Date.now() + idCounter).toISOString();
    db.insert(schema.budgetCategories)
      .values({
        id,
        name: name ?? `Category ${id}`,
        description: null,
        color: null,
        sortOrder: 200 + idCounter,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  function insertBudgetLine(opts: {
    householdItemId: string;
    plannedAmount: number;
    budgetCategoryId?: string | null;
    confidence?: 'own_estimate' | 'professional_estimate' | 'quote' | 'invoice';
  }) {
    const id = `bl-${++idCounter}`;
    const now = new Date(Date.now() + idCounter).toISOString();
    db.insert(schema.householdItemBudgets)
      .values({
        id,
        householdItemId: opts.householdItemId,
        description: null,
        plannedAmount: opts.plannedAmount,
        confidence: opts.confidence ?? 'own_estimate',
        budgetCategoryId: opts.budgetCategoryId ?? null,
        budgetSourceId: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  function insertSubsidyProgram(
    opts: {
      name?: string;
      reductionType?: 'percentage' | 'fixed';
      reductionValue?: number;
      applicationStatus?: 'eligible' | 'applied' | 'approved' | 'received' | 'rejected';
    } = {},
  ) {
    const id = `sp-${++idCounter}`;
    const now = new Date(Date.now() + idCounter).toISOString();
    db.insert(schema.subsidyPrograms)
      .values({
        id,
        name: opts.name ?? `Subsidy ${id}`,
        description: null,
        eligibility: null,
        reductionType: opts.reductionType ?? 'percentage',
        reductionValue: opts.reductionValue ?? 10,
        applicationStatus: opts.applicationStatus ?? 'eligible',
        applicationDeadline: null,
        notes: null,
        createdBy: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  function linkSubsidyToHouseholdItem(householdItemId: string, subsidyProgramId: string) {
    db.insert(schema.householdItemSubsidies).values({ householdItemId, subsidyProgramId }).run();
  }

  function linkCategoryToSubsidy(subsidyProgramId: string, budgetCategoryId: string) {
    db.insert(schema.subsidyProgramCategories).values({ subsidyProgramId, budgetCategoryId }).run();
  }

  beforeEach(() => {
    const testDb = createTestDb();
    sqlite = testDb.sqlite;
    db = testDb.db;
    idCounter = 0;
    insertTestUser();
  });

  afterEach(() => {
    sqlite.close();
  });

  // ─── Error cases ───────────────────────────────────────────────────────────

  describe('error cases', () => {
    it('throws NotFoundError when household item does not exist', () => {
      expect(() => {
        getHouseholdItemSubsidyPayback(db, 'non-existent-hi');
      }).toThrow(NotFoundError);
    });

    it('throws NotFoundError with message "Household item not found"', () => {
      expect(() => {
        getHouseholdItemSubsidyPayback(db, 'non-existent-hi');
      }).toThrow('Household item not found');
    });
  });

  // ─── No linked subsidies ───────────────────────────────────────────────────

  describe('no linked subsidies', () => {
    it('returns householdItemId, minTotalPayback 0, maxTotalPayback 0 and empty subsidies array', () => {
      const hiId = insertHouseholdItem();
      const result = getHouseholdItemSubsidyPayback(db, hiId);

      expect(result.householdItemId).toBe(hiId);
      expect(result.minTotalPayback).toBe(0);
      expect(result.maxTotalPayback).toBe(0);
      expect(result.subsidies).toEqual([]);
    });

    it('returns 0 totals when all linked subsidies are rejected', () => {
      const hiId = insertHouseholdItem();
      const subsidyId = insertSubsidyProgram({
        reductionType: 'percentage',
        reductionValue: 20,
        applicationStatus: 'rejected',
      });
      linkSubsidyToHouseholdItem(hiId, subsidyId);

      const result = getHouseholdItemSubsidyPayback(db, hiId);

      expect(result.minTotalPayback).toBe(0);
      expect(result.maxTotalPayback).toBe(0);
      expect(result.subsidies).toHaveLength(0);
    });
  });

  // ─── Confidence margin ranges (no invoice support) ─────────────────────────

  describe('confidence margin ranges', () => {
    it('applies own_estimate margin (±20%) to produce min/max range', () => {
      const hiId = insertHouseholdItem();
      insertBudgetLine({ householdItemId: hiId, plannedAmount: 1000, confidence: 'own_estimate' });
      const subsidyId = insertSubsidyProgram({ reductionType: 'percentage', reductionValue: 10 });
      linkSubsidyToHouseholdItem(hiId, subsidyId);

      const result = getHouseholdItemSubsidyPayback(db, hiId);

      // min: 1000 * 0.80 * 10% = 80, max: 1000 * 1.20 * 10% = 120
      expect(result.minTotalPayback).toBeCloseTo(80);
      expect(result.maxTotalPayback).toBeCloseTo(120);
      expect(result.subsidies[0].minPayback).toBeCloseTo(80);
      expect(result.subsidies[0].maxPayback).toBeCloseTo(120);
    });

    it('applies professional_estimate margin (±10%) to produce min/max range', () => {
      const hiId = insertHouseholdItem();
      insertBudgetLine({
        householdItemId: hiId,
        plannedAmount: 1000,
        confidence: 'professional_estimate',
      });
      const subsidyId = insertSubsidyProgram({ reductionType: 'percentage', reductionValue: 10 });
      linkSubsidyToHouseholdItem(hiId, subsidyId);

      const result = getHouseholdItemSubsidyPayback(db, hiId);

      // min: 1000 * 0.90 * 10% = 90, max: 1000 * 1.10 * 10% = 110
      expect(result.minTotalPayback).toBeCloseTo(90);
      expect(result.maxTotalPayback).toBeCloseTo(110);
    });

    it('applies quote margin (±5%) to produce min/max range', () => {
      const hiId = insertHouseholdItem();
      insertBudgetLine({ householdItemId: hiId, plannedAmount: 1000, confidence: 'quote' });
      const subsidyId = insertSubsidyProgram({ reductionType: 'percentage', reductionValue: 10 });
      linkSubsidyToHouseholdItem(hiId, subsidyId);

      const result = getHouseholdItemSubsidyPayback(db, hiId);

      // min: 1000 * 0.95 * 10% = 95, max: 1000 * 1.05 * 10% = 105
      expect(result.minTotalPayback).toBeCloseTo(95);
      expect(result.maxTotalPayback).toBeCloseTo(105);
    });

    it('applies invoice confidence (±0%) so min === max === planned amount * rate', () => {
      const hiId = insertHouseholdItem();
      insertBudgetLine({ householdItemId: hiId, plannedAmount: 1000, confidence: 'invoice' });
      const subsidyId = insertSubsidyProgram({ reductionType: 'percentage', reductionValue: 10 });
      linkSubsidyToHouseholdItem(hiId, subsidyId);

      const result = getHouseholdItemSubsidyPayback(db, hiId);

      // margin = 0: min = max = 1000 * 10% = 100
      expect(result.minTotalPayback).toBeCloseTo(100);
      expect(result.maxTotalPayback).toBeCloseTo(100);
    });

    it('sums min/max across multiple budget lines with different confidence levels', () => {
      const hiId = insertHouseholdItem();
      // own_estimate: min=500*0.8*0.1=40, max=500*1.2*0.1=60
      insertBudgetLine({ householdItemId: hiId, plannedAmount: 500, confidence: 'own_estimate' });
      // professional_estimate: min=500*0.9*0.1=45, max=500*1.1*0.1=55
      insertBudgetLine({
        householdItemId: hiId,
        plannedAmount: 500,
        confidence: 'professional_estimate',
      });

      const subsidyId = insertSubsidyProgram({ reductionType: 'percentage', reductionValue: 10 });
      linkSubsidyToHouseholdItem(hiId, subsidyId);

      const result = getHouseholdItemSubsidyPayback(db, hiId);

      // totals: min=85, max=115
      expect(result.minTotalPayback).toBeCloseTo(85);
      expect(result.maxTotalPayback).toBeCloseTo(115);
    });

    it('confidence margins still apply even without invoice support (no actual cost override)', () => {
      // This test documents the supportsInvoices: false behavior explicitly.
      // Even if there were invoices in the DB, household items should use confidence margins.
      const hiId = insertHouseholdItem();
      insertBudgetLine({ householdItemId: hiId, plannedAmount: 1000, confidence: 'own_estimate' });
      const subsidyId = insertSubsidyProgram({ reductionType: 'percentage', reductionValue: 20 });
      linkSubsidyToHouseholdItem(hiId, subsidyId);

      const result = getHouseholdItemSubsidyPayback(db, hiId);

      // own_estimate ±20%: min=1000*0.8*20%=160, max=1000*1.2*20%=240
      // These are NOT collapsed to an actual cost even if invoices existed (supportsInvoices=false)
      expect(result.minTotalPayback).toBeCloseTo(160);
      expect(result.maxTotalPayback).toBeCloseTo(240);
    });
  });

  // ─── Percentage subsidies ──────────────────────────────────────────────────

  describe('percentage subsidies', () => {
    it('calculates payback range for universal percentage subsidy (no category filter)', () => {
      const hiId = insertHouseholdItem();
      insertBudgetLine({ householdItemId: hiId, plannedAmount: 1000, confidence: 'own_estimate' });
      const subsidyId = insertSubsidyProgram({ reductionType: 'percentage', reductionValue: 10 });
      linkSubsidyToHouseholdItem(hiId, subsidyId);

      const result = getHouseholdItemSubsidyPayback(db, hiId);

      // own_estimate ±20%: min=1000*0.8*10%=80, max=1000*1.2*10%=120
      expect(result.minTotalPayback).toBeCloseTo(80);
      expect(result.maxTotalPayback).toBeCloseTo(120);
      expect(result.subsidies).toHaveLength(1);
    });

    it('only applies category-restricted subsidy to matching budget lines', () => {
      const hiId = insertHouseholdItem();
      const cat1 = insertBudgetCategory('Electronics');
      const cat2 = insertBudgetCategory('Furniture');
      // own_estimate ±20%: matched line min=800, max=1200
      insertBudgetLine({
        householdItemId: hiId,
        plannedAmount: 1000,
        budgetCategoryId: cat1,
        confidence: 'own_estimate',
      });
      // does not match — excluded
      insertBudgetLine({
        householdItemId: hiId,
        plannedAmount: 500,
        budgetCategoryId: cat2,
        confidence: 'own_estimate',
      });

      const subsidyId = insertSubsidyProgram({ reductionType: 'percentage', reductionValue: 10 });
      linkCategoryToSubsidy(subsidyId, cat1);
      linkSubsidyToHouseholdItem(hiId, subsidyId);

      const result = getHouseholdItemSubsidyPayback(db, hiId);

      // Only cat1 line: min=1000*0.8*10%=80, max=1000*1.2*10%=120
      expect(result.minTotalPayback).toBeCloseTo(80);
      expect(result.maxTotalPayback).toBeCloseTo(120);
    });

    it('skips budget lines with no category when subsidy is category-restricted', () => {
      const hiId = insertHouseholdItem();
      const cat1 = insertBudgetCategory('Electronics');
      // no category — excluded
      insertBudgetLine({
        householdItemId: hiId,
        plannedAmount: 1000,
        budgetCategoryId: null,
        confidence: 'own_estimate',
      });
      // matches
      insertBudgetLine({
        householdItemId: hiId,
        plannedAmount: 500,
        budgetCategoryId: cat1,
        confidence: 'own_estimate',
      });

      const subsidyId = insertSubsidyProgram({ reductionType: 'percentage', reductionValue: 10 });
      linkCategoryToSubsidy(subsidyId, cat1);
      linkSubsidyToHouseholdItem(hiId, subsidyId);

      const result = getHouseholdItemSubsidyPayback(db, hiId);

      // Only cat1 line: min=500*0.8*10%=40, max=500*1.2*10%=60
      expect(result.minTotalPayback).toBeCloseTo(40);
      expect(result.maxTotalPayback).toBeCloseTo(60);
    });

    it('returns 0 min/max when no budget lines match the category restriction', () => {
      const hiId = insertHouseholdItem();
      const cat1 = insertBudgetCategory('Electronics');
      const cat2 = insertBudgetCategory('Plumbing');
      insertBudgetLine({
        householdItemId: hiId,
        plannedAmount: 1000,
        budgetCategoryId: cat2,
        confidence: 'own_estimate',
      }); // no match

      const subsidyId = insertSubsidyProgram({ reductionType: 'percentage', reductionValue: 10 });
      linkCategoryToSubsidy(subsidyId, cat1);
      linkSubsidyToHouseholdItem(hiId, subsidyId);

      const result = getHouseholdItemSubsidyPayback(db, hiId);

      expect(result.minTotalPayback).toBe(0);
      expect(result.maxTotalPayback).toBe(0);
      expect(result.subsidies[0].minPayback).toBe(0);
      expect(result.subsidies[0].maxPayback).toBe(0);
    });

    it('returns 0 min/max when household item has no budget lines', () => {
      const hiId = insertHouseholdItem();
      const subsidyId = insertSubsidyProgram({ reductionType: 'percentage', reductionValue: 15 });
      linkSubsidyToHouseholdItem(hiId, subsidyId);

      const result = getHouseholdItemSubsidyPayback(db, hiId);

      expect(result.minTotalPayback).toBe(0);
      expect(result.maxTotalPayback).toBe(0);
      expect(result.subsidies[0].minPayback).toBe(0);
      expect(result.subsidies[0].maxPayback).toBe(0);
    });
  });

  // ─── Fixed subsidies ───────────────────────────────────────────────────────

  describe('fixed subsidies', () => {
    it('returns the reductionValue as minPayback and maxPayback (min === max) for a fixed subsidy', () => {
      const hiId = insertHouseholdItem();
      const subsidyId = insertSubsidyProgram({ reductionType: 'fixed', reductionValue: 5000 });
      linkSubsidyToHouseholdItem(hiId, subsidyId);

      const result = getHouseholdItemSubsidyPayback(db, hiId);

      expect(result.minTotalPayback).toBe(5000);
      expect(result.maxTotalPayback).toBe(5000);
      expect(result.subsidies[0].minPayback).toBe(5000);
      expect(result.subsidies[0].maxPayback).toBe(5000);
    });

    it('returns fixed amount even when household item has no budget lines', () => {
      const hiId = insertHouseholdItem();
      const subsidyId = insertSubsidyProgram({ reductionType: 'fixed', reductionValue: 2000 });
      linkSubsidyToHouseholdItem(hiId, subsidyId);

      const result = getHouseholdItemSubsidyPayback(db, hiId);

      expect(result.minTotalPayback).toBe(2000);
      expect(result.maxTotalPayback).toBe(2000);
    });

    it('returns fixed amount regardless of budget line amounts', () => {
      const hiId = insertHouseholdItem();
      insertBudgetLine({
        householdItemId: hiId,
        plannedAmount: 100000,
        confidence: 'own_estimate',
      });
      const subsidyId = insertSubsidyProgram({ reductionType: 'fixed', reductionValue: 3000 });
      linkSubsidyToHouseholdItem(hiId, subsidyId);

      const result = getHouseholdItemSubsidyPayback(db, hiId);

      expect(result.minTotalPayback).toBe(3000);
      expect(result.maxTotalPayback).toBe(3000);
    });
  });

  // ─── Multiple subsidies ────────────────────────────────────────────────────

  describe('multiple subsidies', () => {
    it('sums min/max payback from multiple subsidies', () => {
      const hiId = insertHouseholdItem();
      insertBudgetLine({ householdItemId: hiId, plannedAmount: 1000, confidence: 'own_estimate' });

      // percentage: min=1000*0.8*10%=80, max=1000*1.2*10%=120
      const sp1 = insertSubsidyProgram({ reductionType: 'percentage', reductionValue: 10 });
      // fixed: min=max=500
      const sp2 = insertSubsidyProgram({ reductionType: 'fixed', reductionValue: 500 });
      linkSubsidyToHouseholdItem(hiId, sp1);
      linkSubsidyToHouseholdItem(hiId, sp2);

      const result = getHouseholdItemSubsidyPayback(db, hiId);

      expect(result.minTotalPayback).toBeCloseTo(580); // 80 + 500
      expect(result.maxTotalPayback).toBeCloseTo(620); // 120 + 500
      expect(result.subsidies).toHaveLength(2);
    });

    it('excludes rejected subsidies from calculation', () => {
      const hiId = insertHouseholdItem();
      insertBudgetLine({ householdItemId: hiId, plannedAmount: 1000, confidence: 'own_estimate' });

      // approved: min=80, max=120
      const sp1 = insertSubsidyProgram({
        reductionType: 'percentage',
        reductionValue: 10,
        applicationStatus: 'approved',
      });
      // rejected: excluded
      const sp2 = insertSubsidyProgram({
        reductionType: 'percentage',
        reductionValue: 20,
        applicationStatus: 'rejected',
      });
      linkSubsidyToHouseholdItem(hiId, sp1);
      linkSubsidyToHouseholdItem(hiId, sp2);

      const result = getHouseholdItemSubsidyPayback(db, hiId);

      expect(result.minTotalPayback).toBeCloseTo(80);
      expect(result.maxTotalPayback).toBeCloseTo(120);
      expect(result.subsidies).toHaveLength(1);
    });

    it('includes subsidies with all non-rejected statuses (eligible, applied, approved, received)', () => {
      const hiId = insertHouseholdItem();
      insertBudgetLine({ householdItemId: hiId, plannedAmount: 1000, confidence: 'own_estimate' });

      const statuses = ['eligible', 'applied', 'approved', 'received'] as const;
      for (const status of statuses) {
        const sp = insertSubsidyProgram({
          reductionType: 'fixed',
          reductionValue: 100,
          applicationStatus: status,
        });
        linkSubsidyToHouseholdItem(hiId, sp);
      }

      const result = getHouseholdItemSubsidyPayback(db, hiId);

      expect(result.subsidies).toHaveLength(4);
      expect(result.minTotalPayback).toBe(400);
      expect(result.maxTotalPayback).toBe(400);
    });
  });

  // ─── Response shape ────────────────────────────────────────────────────────

  describe('response shape', () => {
    it('returns the correct householdItemId in the response', () => {
      const hiId = insertHouseholdItem();
      const subsidyId = insertSubsidyProgram();
      linkSubsidyToHouseholdItem(hiId, subsidyId);

      const result = getHouseholdItemSubsidyPayback(db, hiId);

      expect(result.householdItemId).toBe(hiId);
    });

    it('returns subsidy entry with all required fields including minPayback and maxPayback', () => {
      const hiId = insertHouseholdItem();
      insertBudgetLine({ householdItemId: hiId, plannedAmount: 1000, confidence: 'own_estimate' });
      const subsidyId = insertSubsidyProgram({
        name: 'Solar Rebate',
        reductionType: 'percentage',
        reductionValue: 15,
      });
      linkSubsidyToHouseholdItem(hiId, subsidyId);

      const result = getHouseholdItemSubsidyPayback(db, hiId);

      const entry = result.subsidies[0];
      expect(entry.subsidyProgramId).toBe(subsidyId);
      expect(entry.name).toBe('Solar Rebate');
      expect(entry.reductionType).toBe('percentage');
      expect(entry.reductionValue).toBe(15);
      expect(typeof entry.minPayback).toBe('number');
      expect(typeof entry.maxPayback).toBe('number');
      // own_estimate ±20%: min=1000*0.8*15%=120, max=1000*1.2*15%=180
      expect(entry.minPayback).toBeCloseTo(120);
      expect(entry.maxPayback).toBeCloseTo(180);
    });

    it('does not include data from a different household item', () => {
      const hiId1 = insertHouseholdItem('HI 1');
      const hiId2 = insertHouseholdItem('HI 2');
      insertBudgetLine({ householdItemId: hiId1, plannedAmount: 1000, confidence: 'invoice' });
      insertBudgetLine({ householdItemId: hiId2, plannedAmount: 5000, confidence: 'invoice' });

      const subsidyId = insertSubsidyProgram({ reductionType: 'percentage', reductionValue: 10 });
      linkSubsidyToHouseholdItem(hiId1, subsidyId);

      const result = getHouseholdItemSubsidyPayback(db, hiId1);

      // invoice confidence: margin=0, so min=max=1000*10%=100
      expect(result.minTotalPayback).toBeCloseTo(100);
      expect(result.maxTotalPayback).toBeCloseTo(100);
    });
  });
});
