/**
 * VAT-rate regression tests for householdItemService: planned totals, percentage subsidy
 * reduction, filterMeta planned-cost min/max and the plannedCostMin/Max list filters all use the
 * VAT-effective planned amount (net lines, includes_vat = 0, are grossed up by 1 + vatRate).
 * Net 100 -> 120 at vatRate=0.2, 119 at 0.19.
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import * as householdItemService from './householdItemService.js';

describe('householdItemService — configured VAT rate', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;
  let userId: string;
  let counter = 0;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    runMigrations(sqlite);
    db = drizzle(sqlite, { schema });
    counter = 0;
    userId = 'user-hi-vat';
    const now = new Date().toISOString();
    db.insert(schema.users)
      .values({
        id: userId,
        email: 'hi-vat@example.com',
        displayName: 'HI VAT',
        role: 'member',
        authProvider: 'local',
        passwordHash: 'hashed',
        createdAt: now,
        updatedAt: now,
      })
      .run();
  });

  afterEach(() => {
    sqlite.close();
  });

  /** Creates a household item with one budget line of plannedAmount=100. */
  function createItem(name: string, includesVat: boolean): string {
    const item = householdItemService.createHouseholdItem(db, userId, { name }, 0.19);
    const now = new Date().toISOString();
    db.insert(schema.householdItemBudgets)
      .values({
        id: `hib-vat-${++counter}`,
        householdItemId: item.id,
        plannedAmount: 100,
        confidence: 'own_estimate',
        includesVat,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return item.id;
  }

  function linkPercentageSubsidy(itemId: string, percent: number): void {
    const id = `sp-hi-vat-${++counter}`;
    const now = new Date().toISOString();
    db.insert(schema.subsidyPrograms)
      .values({
        id,
        name: `Subsidy ${id}`,
        reductionType: 'percentage',
        reductionValue: percent,
        applicationStatus: 'eligible',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    db.insert(schema.householdItemSubsidies)
      .values({ householdItemId: itemId, subsidyProgramId: id })
      .run();
  }

  describe.each([
    [0.19, 119],
    [0.2, 120],
  ])('vatRate=%s (net 100 -> %s)', (vatRate, gross) => {
    it('list summary totalPlannedAmount and budgetSummary.totalPlanned are VAT-effective', () => {
      createItem('Net sofa', false);

      const { items } = householdItemService.listHouseholdItems(db, {}, vatRate);

      expect(items[0]!.totalPlannedAmount).toBeCloseTo(gross, 5);
      expect(items[0]!.budgetSummary.totalPlanned).toBeCloseTo(gross, 5);
    });

    it('percentage subsidy reduction and netCost are computed on the VAT-effective amount', () => {
      const id = createItem('Net sofa', false);
      linkPercentageSubsidy(id, 10);

      const { items } = householdItemService.listHouseholdItems(db, {}, vatRate);

      expect(items[0]!.budgetSummary.subsidyReduction).toBeCloseTo(gross * 0.1, 5);
      expect(items[0]!.budgetSummary.netCost).toBeCloseTo(gross * 0.9, 5);
    });

    it('getHouseholdItemById detail carries the same VAT-effective planned total', () => {
      const id = createItem('Net sofa', false);

      const detail = householdItemService.getHouseholdItemById(db, id, vatRate);

      expect(detail.totalPlannedAmount).toBeCloseTo(gross, 5);
    });

    it('filterMeta.plannedCost min/max are VAT-effective (net 100 and gross 100)', () => {
      createItem('Net sofa', false);
      createItem('Gross table', true);

      const { filterMeta } = householdItemService.listHouseholdItems(db, {}, vatRate);

      expect(filterMeta.plannedCost.min).toBeCloseTo(100, 5);
      expect(filterMeta.plannedCost.max).toBeCloseTo(gross, 5);
    });

    it('plannedCostMin includes the net item exactly at the boundary and excludes just above it', () => {
      createItem('Net sofa', false);

      const atBoundary = householdItemService.listHouseholdItems(
        db,
        { plannedCostMin: gross },
        vatRate,
      );
      const above = householdItemService.listHouseholdItems(
        db,
        { plannedCostMin: gross + 0.01 },
        vatRate,
      );

      expect(atBoundary.items).toHaveLength(1);
      expect(above.items).toHaveLength(0);
    });

    it('plannedCostMax includes the net item exactly at the boundary and excludes just below it', () => {
      createItem('Net sofa', false);

      const atBoundary = householdItemService.listHouseholdItems(
        db,
        { plannedCostMax: gross },
        vatRate,
      );
      const below = householdItemService.listHouseholdItems(
        db,
        { plannedCostMax: gross - 0.01 },
        vatRate,
      );

      expect(atBoundary.items).toHaveLength(1);
      expect(below.items).toHaveLength(0);
    });
  });

  it('a net item of 100 is matched by plannedCostMin=110 at vatRate=0.2 but not at 0.05', () => {
    createItem('Net sofa', false);

    expect(
      householdItemService.listHouseholdItems(db, { plannedCostMin: 110 }, 0.2).items,
    ).toHaveLength(1);
    expect(
      householdItemService.listHouseholdItems(db, { plannedCostMin: 110 }, 0.05).items,
    ).toHaveLength(0);
  });

  it('a gross-stored item (includesVat=true) is unaffected by the rate in totals and filters', () => {
    createItem('Gross table', true);

    const { items } = householdItemService.listHouseholdItems(
      db,
      { plannedCostMin: 100, plannedCostMax: 100 },
      0.2,
    );

    expect(items).toHaveLength(1);
    expect(items[0]!.totalPlannedAmount).toBe(100);
  });

  it('updateHouseholdItem returns the VAT-effective planned total for the supplied rate', () => {
    const id = createItem('Net sofa', false);

    const updated = householdItemService.updateHouseholdItem(db, id, { name: 'Renamed' }, 0.2);

    expect(updated.totalPlannedAmount).toBeCloseTo(120, 5);
  });

  it('createHouseholdItem returns a zero planned total for a new item with no lines', () => {
    const created = householdItemService.createHouseholdItem(db, userId, { name: 'Empty' }, 0.2);

    expect(created.totalPlannedAmount).toBe(0);
  });
});
