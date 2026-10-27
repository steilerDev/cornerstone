/**
 * moneyService financing figures of a grant without any covered item (#2242): the count falls
 * back to 0 on the list row and on the grant detail.
 *
 * Mutations: a missing link count reported as undefined/NaN instead of 0.
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type Database from 'better-sqlite3';
import { openMoneyDb } from '../test/moneyDb.js';
import type { MoneySeed, MoneyTestDb } from '../test/moneyDb.js';
import { getFinancing, getGrantMoney } from './moneyService.js';

describe('financing figures of a grant with no covered item', () => {
  let sqlite: Database.Database;
  let db: MoneyTestDb;
  let seed: MoneySeed;

  beforeEach(() => {
    ({ sqlite, db, seed } = openMoneyDb());
    seed.workItem('wi-1');
    seed.grant('sp-linked', { workItems: ['wi-1'] });
    seed.grant('sp-empty', { value: 25 });
  });

  afterEach(() => {
    sqlite.close();
  });

  it('getFinancing counts 0 covered items for the grant without links and 1 for the linked one', () => {
    const grants = getFinancing(db, 0.19).grants;
    expect(grants.find((g) => g.id === 'sp-empty')?.coveredItemCount).toBe(0);
    expect(grants.find((g) => g.id === 'sp-linked')?.coveredItemCount).toBe(1);
  });

  it('getGrantMoney counts 0 covered items and pays nothing for a grant without links', () => {
    const money = getGrantMoney(db, 0.19, 'sp-empty');
    expect(money.coveredItemCount).toBe(0);
    expect(money.expected.expected).toBe(0);
  });
});
