/**
 * getHouseholdItemListMoney (#2246): per-purchase expected cost, counted grants and Paid for the
 * Purchases list, from one engine run. Paid must equal the Money > Overview purchase rows.
 *
 * Mutations these tests catch:
 *  - a purchase without cost lines missing from the map (the list would crash);
 *  - Paid summed per invoice instead of per attributed line, or a task line's Paid leaking in;
 *  - grants taken from the best/worst scenario instead of the expected one.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type Database from 'better-sqlite3';
import { openMoneyDb, type MoneySeed, type MoneyTestDb } from '../test/moneyDb.js';
import { getBudgetBreakdown, getHouseholdItemListMoney } from './moneyService.js';

const VAT = 0.19;

describe('getHouseholdItemListMoney', () => {
  let sqlite: Database.Database;
  let db: MoneyTestDb;
  let seed: MoneySeed;

  beforeEach(() => {
    ({ sqlite, db, seed } = openMoneyDb());
  });

  afterEach(() => {
    sqlite.close();
  });

  it('is empty for an empty database', () => {
    expect(getHouseholdItemListMoney(db, VAT).size).toBe(0);
  });

  it('has zeros for a purchase without cost lines and no entry for a task', () => {
    seed.householdItem('hi-1');
    seed.workItem('wi-1');
    seed.wiLine('l-w', 'wi-1');

    const map = getHouseholdItemListMoney(db, VAT);

    expect([...map.keys()]).toEqual(['hi-1']);
    expect(map.get('hi-1')).toEqual({ expectedCost: 0, grants: 0, paid: 0 });
  });

  it('keeps zeros for a purchase that only has a grant but no cost line', () => {
    seed.householdItem('hi-1');
    seed.grant('g-1', { type: 'fixed', value: 100, householdItems: ['hi-1'] });

    expect(getHouseholdItemListMoney(db, VAT).get('hi-1')).toEqual({
      expectedCost: 0,
      grants: 0,
      paid: 0,
    });
  });

  it('gives each purchase its expected cost, counted grants and attributed Paid', () => {
    seed.householdItem('hi-1');
    seed.householdItem('hi-2');
    seed.hiLine('l-1', 'hi-1', { planned: 300, confidence: 'own_estimate' });
    seed.hiLine('l-2', 'hi-2', { planned: 200, confidence: 'own_estimate' });
    seed.hiLine('l-3', 'hi-2', { planned: 300, confidence: 'own_estimate' });
    seed.invoice('inv-1', 500, 'paid');
    seed.link('inv-1', 'l-2', 'household_item', 200);
    seed.link('inv-1', 'l-3', 'household_item', 300);
    seed.grant('g-1', { type: 'percentage', value: 10, householdItems: ['hi-2'] });

    const map = getHouseholdItemListMoney(db, VAT);

    expect(map.get('hi-1')).toEqual({ expectedCost: 300, grants: 0, paid: 0 });
    expect(map.get('hi-2')).toEqual({ expectedCost: 500, grants: 50, paid: 500 });
  });

  it('sums Paid per purchase and matches the Money > Overview purchase rows', () => {
    seed.householdItem('hi-1');
    seed.householdItem('hi-2');
    seed.workItem('wi-1');
    seed.hiLine('l-1', 'hi-1', { planned: 400, confidence: 'invoice' });
    seed.hiLine('l-2', 'hi-2', { planned: 600, confidence: 'invoice' });
    seed.wiLine('l-w', 'wi-1', { planned: 900, confidence: 'invoice' });
    seed.invoice('inv-1', 1000, 'pending');
    seed.link('inv-1', 'l-1', 'household_item', 400);
    seed.link('inv-1', 'l-2', 'household_item', 600);
    seed.deposit('d-1', 'inv-1', 250, 'paid');
    seed.invoice('inv-2', 900, 'paid');
    seed.link('inv-2', 'l-w', 'work_item', 900);

    const map = getHouseholdItemListMoney(db, VAT);
    const rows = getBudgetBreakdown(db, VAT).items.filter((i) => i.kind === 'household_item');

    expect(rows).toHaveLength(2);
    for (const row of rows) expect(map.get(row.id)!.paid).toBe(row.figures.paid);
    const total = [...map.values()].reduce((sum, m) => sum + m.paid, 0);
    expect(total).toBe(rows.reduce((sum, r) => sum + r.figures.paid, 0));
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThan(1000);
  });
});
