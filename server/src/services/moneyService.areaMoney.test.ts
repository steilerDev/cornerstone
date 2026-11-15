/**
 * DB-level tests of `getAreaMoneyFigures` (#2251): subtree Expected cost and Paid come from the
 * Money > Overview by-area breakdown, own = subtree minus the direct children's subtrees (cents).
 *
 * Mutations these tests catch:
 *  - own not subtracting the children (a floor would show 700, not 100);
 *  - own subtracting grandchildren as well (double subtraction: the building would go negative);
 *  - own computed in floats (0.1 + 0.2 drift on net lines);
 *  - Paid read from the wrong figure or left out;
 *  - an area without lines present in the map (callers default to zeros).
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type Database from 'better-sqlite3';
import { openMoneyDb, type MoneySeed, type MoneyTestDb } from '../test/moneyDb.js';
import { getAreaMoneyFigures, getBudgetBreakdown } from './moneyService.js';

const VAT = 0.19;

describe('getAreaMoneyFigures', () => {
  let sqlite: Database.Database;
  let db: MoneyTestDb;
  let seed: MoneySeed;

  beforeEach(() => {
    ({ sqlite, db, seed } = openMoneyDb());
  });

  afterEach(() => {
    sqlite.close();
  });

  it('is an empty map when no area has a cost line', () => {
    seed.area('ar-1', 'Kitchen');
    seed.workItem('wi-1', 'ar-1');

    expect(getAreaMoneyFigures(db, VAT).size).toBe(0);
  });

  it('gives a leaf its own figure as both own and subtree, with Paid zero when nothing is paid', () => {
    seed.area('ar-1', 'Kitchen');
    seed.workItem('wi-1', 'ar-1');
    seed.wiLine('l1', 'wi-1', { planned: 500 });

    expect(getAreaMoneyFigures(db, VAT).get('ar-1')).toEqual({
      ownExpectedCost: 500,
      expectedCost: 500,
      paid: 0,
    });
  });

  it('rolls up: subtree includes descendants, own is only the items booked on the area itself', () => {
    seed.area('ar-b', 'House');
    seed.area('ar-f', 'Ground floor', 'ar-b');
    seed.area('ar-r', 'Kitchen', 'ar-f');
    seed.workItem('wi-b', 'ar-b');
    seed.workItem('wi-f', 'ar-f');
    seed.householdItem('hi-r', 'ar-r');
    seed.wiLine('lb', 'wi-b', { planned: 1000 });
    seed.wiLine('lf', 'wi-f', { planned: 100 });
    seed.hiLine('lr', 'hi-r', { planned: 20 });

    const figures = getAreaMoneyFigures(db, VAT);

    expect(figures.get('ar-r')).toMatchObject({ ownExpectedCost: 20, expectedCost: 20 });
    expect(figures.get('ar-f')).toMatchObject({ ownExpectedCost: 100, expectedCost: 120 });
    expect(figures.get('ar-b')).toMatchObject({ ownExpectedCost: 1000, expectedCost: 1120 });
  });

  it('subtracts only direct children, never grandchildren a second time', () => {
    seed.area('ar-b', 'House');
    seed.area('ar-f', 'Floor', 'ar-b');
    seed.area('ar-r', 'Room', 'ar-f');
    seed.workItem('wi-r', 'ar-r');
    seed.wiLine('l1', 'wi-r', { planned: 300 });

    const figures = getAreaMoneyFigures(db, VAT);

    expect(figures.get('ar-b')).toMatchObject({ ownExpectedCost: 0, expectedCost: 300 });
    expect(figures.get('ar-f')).toMatchObject({ ownExpectedCost: 0, expectedCost: 300 });
  });

  it('keeps own exact in cents for net lines (gross-up by VAT)', () => {
    seed.area('ar-f', 'Floor');
    seed.area('ar-r', 'Room', 'ar-f');
    seed.workItem('wi-f', 'ar-f');
    seed.workItem('wi-r', 'ar-r');
    seed.wiLine('l1', 'wi-f', { planned: 0.1, includesVat: false });
    seed.wiLine('l2', 'wi-r', { planned: 0.2, includesVat: false });

    const figures = getAreaMoneyFigures(db, VAT);
    const floor = figures.get('ar-f')!;
    const room = figures.get('ar-r')!;

    expect(Math.round(floor.ownExpectedCost * 100)).toBe(
      Math.round(floor.expectedCost * 100) - Math.round(room.expectedCost * 100),
    );
    expect(floor.ownExpectedCost).toBe(0.12);
    expect(room.expectedCost).toBe(0.24);
  });

  it('reports the subtree Paid of the breakdown and matches it per area', () => {
    seed.area('ar-f', 'Floor');
    seed.area('ar-r', 'Room', 'ar-f');
    seed.workItem('wi-r', 'ar-r');
    seed.wiLine('l1', 'wi-r', { planned: 400 });
    seed.invoice('inv-1', 150, 'paid');
    seed.link('inv-1', 'l1', 'work_item', 150);

    const figures = getAreaMoneyFigures(db, VAT);
    const breakdown = getBudgetBreakdown(db, VAT);

    expect(figures.get('ar-r')!.paid).toBe(150);
    expect(figures.get('ar-f')!.paid).toBe(150);
    for (const row of breakdown.byArea) {
      expect(figures.get(row.areaId)).toMatchObject({
        expectedCost: row.figures.expectedCost.expected,
        paid: row.figures.paid,
      });
    }
  });

  it('leaves out areas whose subtree has no line while a sibling has one', () => {
    seed.area('ar-1', 'Kitchen');
    seed.area('ar-2', 'Hall');
    seed.workItem('wi-1', 'ar-1');
    seed.wiLine('l1', 'wi-1', { planned: 10 });

    expect([...getAreaMoneyFigures(db, VAT).keys()]).toEqual(['ar-1']);
  });
});
