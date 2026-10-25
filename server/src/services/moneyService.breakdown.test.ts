/**
 * DB-level tests of the Money > Overview breakdown (#2237, contract 25): `getBudgetBreakdown`,
 * `loadInvoiceLinks` and `loadMoneyInput`'s shared links. Fresh in-memory database per test with
 * the real migrations; the arithmetic itself is in `shared/moneyBreakdown.test.ts` and the
 * cross-consumer consistency in `moneyService.fixture.test.ts`.
 *
 * Mutations these tests catch:
 *  - the source filter applied to Paid / Still to pay (they must stay unfiltered) or to Not yet
 *    split (it is not tied to a source);
 *  - 'unassigned' not matching lines without a source, or an unknown id throwing;
 *  - a missing VAT gross-up on the breakdown cost (net line x 1.19);
 *  - a tagged deposit counted for the wrong source (R2 against the source rails);
 *  - the link status read from the wrong record, or a description/name mix-up between a task and
 *    a purchase with the same id;
 *  - an item or area without a line leaking into the rows.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type Database from 'better-sqlite3';
import type { BudgetBreakdown } from '@cornerstone/shared';
import { openMoneyDb, type MoneySeed, type MoneyTestDb } from '../test/moneyDb.js';
import {
  computeProjectMoney,
  getBudgetBreakdown,
  loadInvoiceLinks,
  loadMoneyInput,
} from './moneyService.js';
import { getSourcePaidAndSubmitted } from './budgetSourceService.js';
import { computeMoney } from './shared/moneyEngine.js';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema.js';

const VAT = 0.19;

function paidOfLines(b: BudgetBreakdown, ids: string[]): number {
  return b.lines.filter((l) => ids.includes(l.id)).reduce((s, l) => s + l.figures.paid, 0);
}

describe('getBudgetBreakdown', () => {
  let sqlite: Database.Database;
  let db: MoneyTestDb;
  let seed: MoneySeed;

  beforeEach(() => {
    ({ sqlite, db, seed } = openMoneyDb());
  });

  afterEach(() => {
    sqlite.close();
  });

  const cents = (n: number): number => Math.round(n * 100);

  describe('empty and minimal databases', () => {
    it('is empty with zero totals, only the seeded own-funds source option and no Not yet split', () => {
      const b = getBudgetBreakdown(db, VAT);
      expect(b.lines).toEqual([]);
      expect(b.items).toEqual([]);
      expect(b.byArea).toEqual([]);
      expect(b.byCategory).toEqual([]);
      expect(b.bySource).toEqual([]);
      expect(b.noArea).toBeNull();
      expect(b.orphanLines).toBeNull();
      expect(b.notYetSplit).toBeNull();
      expect(b.hasUnassignedLines).toBe(false);
      expect(b.sourceOptions.map((s) => s.id)).toEqual(['discretionary-system']);
      expect(b.total.expectedCost).toEqual({ expected: 0, best: 0, worst: 0 });
      expect(b.total.paid).toBe(0);
      expect(b.total.stillToPay).toBe(0);
    });

    it('lists source options by name then id, whatever their status or type', () => {
      seed.source('bs-2', 'savings', 100, 'closed', 'Zeta');
      seed.source('bs-1', 'credit_line', 100, 'active', 'Alpha');
      seed.source('bs-3', 'bank_loan', 100, 'exhausted', 'Alpha');
      const b = getBudgetBreakdown(db, VAT);
      expect(b.sourceOptions).toEqual([
        { id: 'bs-1', name: 'Alpha', sourceType: 'credit_line' },
        { id: 'bs-3', name: 'Alpha', sourceType: 'bank_loan' },
        { id: 'discretionary-system', name: expect.any(String), sourceType: expect.any(String) },
        { id: 'bs-2', name: 'Zeta', sourceType: 'savings' },
      ]);
    });
  });

  describe('lines, items and names', () => {
    it('reads task titles, purchase names and line descriptions; a task and a purchase may share an id', () => {
      seed.workItem('same', null, 'Task Roof');
      seed.householdItem('same', null, 'Purchase Heat Pump');
      seed.wiLine('l-w', 'same', { description: 'Tiles' });
      seed.hiLine('l-h', 'same', { description: null });
      const b = getBudgetBreakdown(db, VAT);
      expect(b.items.map((i) => [i.kind, i.id, i.name])).toEqual([
        ['work_item', 'same', 'Task Roof'],
        ['household_item', 'same', 'Purchase Heat Pump'],
      ]);
      expect(b.lines.map((l) => [l.id, l.kind, l.description])).toEqual([
        ['l-w', 'work_item', 'Tiles'],
        ['l-h', 'household_item', null],
      ]);
    });

    it('leaves out items without a line', () => {
      seed.workItem('wi-1');
      seed.workItem('wi-2');
      seed.householdItem('hi-1');
      seed.wiLine('l1', 'wi-1');
      const b = getBudgetBreakdown(db, VAT);
      expect(b.items.map((i) => i.id)).toEqual(['wi-1']);
    });

    it('shows the status of the linked record on the line, none when unlinked', () => {
      seed.workItem('wi-1');
      seed.householdItem('hi-1');
      seed.wiLine('l-linked', 'wi-1');
      seed.wiLine('l-free', 'wi-1');
      seed.hiLine('l-hi', 'hi-1');
      seed.invoice('inv-1', 1000, 'claimed');
      seed.invoice('inv-2', 500, 'quotation');
      seed.link('inv-1', 'l-linked', 'work_item', 1000);
      seed.link('inv-2', 'l-hi', 'household_item', 500);
      const status = Object.fromEntries(
        getBudgetBreakdown(db, VAT).lines.map((l) => [l.id, l.linkStatus]),
      );
      expect(status).toEqual({ 'l-linked': 'claimed', 'l-free': null, 'l-hi': 'quotation' });
    });

    it('counts a linked offer line at face value in all three scenarios (AC9)', () => {
      seed.workItem('wi-1');
      seed.wiLine('l1', 'wi-1', { planned: 20000, confidence: 'quote' });
      seed.invoice('q1', 25000, 'quotation');
      seed.link('q1', 'l1', 'work_item', 23800);
      const line = getBudgetBreakdown(db, VAT).lines[0]!;
      expect(line.figures.expectedCost).toEqual({ expected: 23800, best: 23800, worst: 23800 });
    });

    it('grosses a net line up with the configured VAT rate', () => {
      seed.workItem('wi-1');
      seed.wiLine('l1', 'wi-1', { planned: 100, includesVat: false });
      expect(getBudgetBreakdown(db, 0.19).total.expectedCost.expected).toBe(119);
      expect(getBudgetBreakdown(db, 0.2).total.expectedCost.expected).toBe(120);
    });

    it('applies the confidence margin: own estimate +-20%', () => {
      seed.workItem('wi-1');
      seed.wiLine('l1', 'wi-1', { planned: 1000, confidence: 'own_estimate' });
      expect(getBudgetBreakdown(db, VAT).total.expectedCost).toEqual({
        expected: 1000,
        best: 800,
        worst: 1200,
      });
    });
  });

  describe('views from the database', () => {
    it('rolls areas up, drops empty ones, and puts items without an area and orphan lines in no area', () => {
      seed.area('ar-a', 'North', null, 0);
      seed.area('ar-a1', 'North Level 1', 'ar-a', 0);
      seed.area('ar-empty', 'Empty', null, 1);
      seed.workItem('wi-1', 'ar-a1');
      seed.workItem('wi-2', null);
      seed.householdItem('hi-1', 'ar-a');
      seed.wiLine('l1', 'wi-1', { planned: 100 });
      seed.wiLine('l2', 'wi-2', { planned: 200 });
      seed.wiLine('l3', null, { planned: 400 });
      seed.hiLine('l4', 'hi-1', { planned: 800 });
      const b = getBudgetBreakdown(db, VAT);
      expect(b.byArea.map((a) => [a.areaId, a.parentId, a.figures.expectedCost.expected])).toEqual([
        ['ar-a', null, 900],
        ['ar-a1', 'ar-a', 100],
      ]);
      expect(b.noArea?.expectedCost.expected).toBe(600);
      expect(b.orphanLines?.expectedCost.expected).toBe(400);
      expect(b.byType.work_items.expectedCost.expected).toBe(700);
      expect(b.byType.household_items.expectedCost.expected).toBe(800);
    });

    it('rolls categories (sort order, null last) and sources (name order, null last)', () => {
      seed.category('bc-2', 'Zinc', 1);
      seed.category('bc-1', 'Alloy', 2);
      seed.source('bs-b', 'bank_loan', 1000, 'active', 'Beta');
      seed.source('bs-a', 'bank_loan', 1000, 'active', 'Alpha');
      seed.workItem('wi-1');
      seed.wiLine('l1', 'wi-1', { planned: 1, category: 'bc-1', source: 'bs-b' });
      seed.wiLine('l2', 'wi-1', { planned: 2, category: 'bc-2', source: 'bs-a' });
      seed.wiLine('l3', 'wi-1', { planned: 4 });
      const b = getBudgetBreakdown(db, VAT);
      expect(
        b.byCategory.map((c) => [c.budgetCategoryId, c.name, c.figures.expectedCost.expected]),
      ).toEqual([
        ['bc-2', 'Zinc', 2],
        ['bc-1', 'Alloy', 1],
        [null, null, 4],
      ]);
      expect(
        b.bySource.map((s) => [s.budgetSourceId, s.name, s.figures.expectedCost.expected]),
      ).toEqual([
        ['bs-a', 'Alpha', 2],
        ['bs-b', 'Beta', 1],
        [null, null, 4],
      ]);
      expect(b.hasUnassignedLines).toBe(true);
    });

    it('rolls counted grants into the rows and Σ lines + Not yet split equals the total', () => {
      seed.workItem('wi-1');
      seed.wiLine('l1', 'wi-1', { planned: 1000 });
      seed.invoice('inv-1', 1500, 'paid');
      seed.link('inv-1', 'l1', 'work_item', 1000);
      seed.grant('sp-1', { workItems: ['wi-1'], value: 10 });
      const b = getBudgetBreakdown(db, VAT);
      expect(b.lines[0]!.figures.expectedGrants.expected).toBe(100);
      expect(b.total.expectedGrants.expected).toBe(100);
      expect(b.notYetSplit?.expectedCost.expected).toBe(500);
      expect(b.total.expectedCost.expected).toBe(
        b.lines[0]!.figures.expectedCost.expected + b.notYetSplit!.expectedCost.expected,
      );
    });
  });

  describe('source filter', () => {
    beforeEach(() => {
      seed.source('bs-a', 'bank_loan', 10000, 'active', 'Alpha');
      seed.source('bs-b', 'credit_line', 10000, 'active', 'Beta');
      seed.workItem('wi-1');
      seed.wiLine('la', 'wi-1', { planned: 100, source: 'bs-a' });
      seed.wiLine('lb', 'wi-1', { planned: 200, source: 'bs-b' });
      seed.wiLine('lu', 'wi-1', { planned: 400, source: null });
      // a record of 1,000 itemized 100 on la: 900 not yet split; paid 1,000
      seed.invoice('inv-1', 1000, 'paid');
      seed.link('inv-1', 'la', 'work_item', 100);
    });

    it('removes the deselected source from every view and keeps Not yet split', () => {
      const all = getBudgetBreakdown(db, VAT);
      const filtered = getBudgetBreakdown(db, VAT, new Set(['bs-b']));
      expect(all.total.expectedCost.expected).toBe(100 + 200 + 400 + 900);
      expect(filtered.total.expectedCost.expected).toBe(100 + 400 + 900);
      expect(filtered.lines.map((l) => l.id).sort()).toEqual(['la', 'lu']);
      expect(filtered.bySource.map((s) => s.budgetSourceId)).toEqual(['bs-a', null]);
      expect(filtered.notYetSplit).toEqual(all.notYetSplit);
      expect(filtered.sourceOptions).toEqual(all.sourceOptions);
      expect(filtered.hasUnassignedLines).toBe(all.hasUnassignedLines);
    });

    it("'unassigned' removes lines without a source", () => {
      const filtered = getBudgetBreakdown(db, VAT, new Set(['unassigned']));
      expect(filtered.lines.map((l) => l.id).sort()).toEqual(['la', 'lb']);
      expect(filtered.bySource.map((s) => s.budgetSourceId)).toEqual(['bs-a', 'bs-b']);
    });

    it('ignores unknown ids; the Paid of a surviving line does not depend on the filter', () => {
      const all = getBudgetBreakdown(db, VAT);
      expect(getBudgetBreakdown(db, VAT, new Set(['nope'])).total).toEqual(all.total);
      const filtered = getBudgetBreakdown(db, VAT, new Set(['bs-b']));
      const paidOf = (b: typeof all, id: string) => b.lines.find((l) => l.id === id)!.figures.paid;
      expect(paidOf(filtered, 'la')).toBe(paidOf(all, 'la'));
      expect(paidOf(filtered, 'lu')).toBe(paidOf(all, 'lu'));
    });

    it('with every source deselected only Not yet split is left, with its Paid, and the total follows the rows', () => {
      const all = getBudgetBreakdown(db, VAT);
      const none = getBudgetBreakdown(db, VAT, new Set(['bs-a', 'bs-b', 'unassigned', 'nope']));
      expect(none.lines).toEqual([]);
      expect(none.total.expectedCost.expected).toBe(900);
      expect(none.total).toEqual(none.notYetSplit);
      // the deselected lines' share of Paid leaves the total with them: 1,000 = 100 (la) + 900
      expect(all.total.paid).toBe(1000);
      expect(none.total.paid).toBe(all.notYetSplit!.paid);
      expect(none.total.paid + paidOfLines(all, ['la', 'lb', 'lu'])).toBe(all.total.paid);
    });
  });

  describe('Paid and Still to pay', () => {
    it('attributes a paid record to its lines by itemized amount and matches the project figures', () => {
      seed.workItem('wi-1');
      seed.wiLine('lA', 'wi-1', { planned: 660 });
      seed.wiLine('lB', 'wi-1', { planned: 340 });
      seed.invoice('inv-1', 1000, 'paid');
      seed.link('inv-1', 'lA', 'work_item', 660);
      seed.link('inv-1', 'lB', 'work_item', 340);
      const b = getBudgetBreakdown(db, VAT);
      const paid = Object.fromEntries(b.lines.map((l) => [l.id, l.figures.paid]));
      expect(paid).toEqual({ lA: 660, lB: 340 });
      expect(b.total.paid).toBe(computeProjectMoney(db, VAT).summary.paid);
      expect(b.total.notYetPaid.expected).toBe(0);
    });

    it('splits a pending record Still to pay and a progress payment Paid', () => {
      seed.workItem('wi-1');
      seed.wiLine('lA', 'wi-1', { planned: 600 });
      seed.wiLine('lB', 'wi-1', { planned: 400 });
      seed.invoice('inv-1', 1000, 'pending');
      seed.link('inv-1', 'lA', 'work_item', 600);
      seed.link('inv-1', 'lB', 'work_item', 400);
      seed.deposit('d1', 'inv-1', 100, 'paid');
      const b = getBudgetBreakdown(db, VAT);
      const by = (id: string) => b.lines.find((l) => l.id === id)!.figures;
      expect([by('lA').paid, by('lB').paid]).toEqual([60, 40]);
      expect([by('lA').stillToPay, by('lB').stillToPay]).toEqual([540, 360]);
      const summary = computeProjectMoney(db, VAT).summary;
      expect(b.total.paid).toBe(summary.paid);
      expect(b.total.stillToPay).toBe(summary.stillToPay);
    });

    it('keeps Not yet paid negative when a record paid more than the line costs (never clamped)', () => {
      seed.workItem('wi-1');
      seed.wiLine('l1', 'wi-1', { planned: 3000 });
      seed.invoice('inv-1', 3000.5, 'paid'); // remainder 0.50 is below 1.00: no Not yet split
      seed.link('inv-1', 'l1', 'work_item', 3000);
      const b = getBudgetBreakdown(db, VAT);
      expect(b.notYetSplit).toBeNull();
      expect(b.lines[0]!.figures.paid).toBe(3000.5);
      expect(b.lines[0]!.figures.notYetPaid).toEqual({ expected: -0.5, best: -0.5, worst: -0.5 });
      expect(b.total.notYetPaid.expected).toBe(-0.5);
    });

    it('puts a record without any link entirely on Not yet split', () => {
      seed.invoice('inv-1', 20, 'paid');
      seed.invoice('inv-2', 30, 'pending');
      const b = getBudgetBreakdown(db, VAT);
      expect(b.lines).toEqual([]);
      expect(b.notYetSplit).toMatchObject({ paid: 20, stillToPay: 30 });
      expect(b.notYetSplit?.expectedCost.expected).toBe(50);
    });

    it('gives a tagged progress payment to the lines of its source (owner decision B) and matches the source rails (R2)', () => {
      seed.source('bs-a', 'bank_loan', 10000, 'active', 'Alpha');
      seed.source('bs-b', 'bank_loan', 10000, 'active', 'Beta');
      seed.workItem('wi-1');
      seed.wiLine('lA', 'wi-1', { planned: 660, source: 'bs-a' });
      seed.wiLine('lB', 'wi-1', { planned: 340, source: 'bs-b' });
      seed.invoice('inv-1', 1000, 'pending');
      seed.link('inv-1', 'lA', 'work_item', 660);
      seed.link('inv-1', 'lB', 'work_item', 340);
      seed.deposit('d1', 'inv-1', 300, 'paid', { sourceId: 'bs-a' });
      const b = getBudgetBreakdown(db, VAT);
      const paid = Object.fromEntries(b.lines.map((l) => [l.id, l.figures.paid]));
      expect(paid).toEqual({ lA: 300, lB: 0 });
      const srcA = b.bySource.find((s) => s.budgetSourceId === 'bs-a')!;
      const rails = getSourcePaidAndSubmitted(db, { id: 'bs-a', isDiscretionary: false });
      expect(cents(srcA.figures.paid)).toBe(cents(rails.paid));
      expect(b.total.paid).toBe(computeProjectMoney(db, VAT).summary.paid);
    });

    it('counts a refund as negative Paid', () => {
      seed.workItem('wi-1');
      seed.wiLine('l1', 'wi-1', { planned: 1000 });
      seed.invoice('inv-1', 1000, 'pending');
      seed.link('inv-1', 'l1', 'work_item', 1000);
      seed.deposit('d1', 'inv-1', 200, 'paid');
      seed.deposit('d2', 'inv-1', 50, 'paid', { entryType: 'refund' });
      const b = getBudgetBreakdown(db, VAT);
      expect(b.lines[0]!.figures.paid).toBe(150);
      expect(b.total.paid).toBe(computeProjectMoney(db, VAT).summary.paid);
    });
  });
});

describe('loadInvoiceLinks and loadMoneyInput', () => {
  let sqlite: Database.Database;
  let db: MoneyTestDb;
  let seed: MoneySeed;

  beforeEach(() => {
    ({ sqlite, db, seed } = openMoneyDb());
    seed.workItem('wi-1');
    seed.householdItem('hi-1');
    seed.wiLine('lw', 'wi-1', { planned: 100 });
    seed.hiLine('lh', 'hi-1', { planned: 200 });
    seed.invoice('inv-1', 300, 'pending');
    seed.link('inv-1', 'lw', 'work_item', 100.5);
    seed.link('inv-1', 'lh', 'household_item', 199.5);
  });

  afterEach(() => {
    sqlite.close();
  });

  it('returns one link per invoice line with itemized cents and the record status', () => {
    const links = loadInvoiceLinks(db);
    expect(links.sort((a, b) => (a.lineId < b.lineId ? -1 : 1))).toEqual([
      { invoiceId: 'inv-1', lineId: 'lh', itemizedCents: 19950, invoiceStatus: 'pending' },
      { invoiceId: 'inv-1', lineId: 'lw', itemizedCents: 10050, invoiceStatus: 'pending' },
    ]);
  });

  it('reflects a status change of the record', () => {
    db.update(schema.invoices).set({ status: 'paid' }).where(eq(schema.invoices.id, 'inv-1')).run();
    expect(loadInvoiceLinks(db).every((l) => l.invoiceStatus === 'paid')).toBe(true);
  });

  it('loads the same input whether the links are passed in or read by itself', () => {
    expect(loadMoneyInput(db, VAT, loadInvoiceLinks(db))).toEqual(loadMoneyInput(db, VAT));
  });

  it('puts the itemized cents on the lines and the record sum on the invoice', () => {
    const input = loadMoneyInput(db, VAT);
    expect(input.lines.map((l) => [l.id, l.itemizedCents]).sort()).toEqual([
      ['lh', 19950],
      ['lw', 10050],
    ]);
    expect(input.invoices).toEqual([
      { id: 'inv-1', amount: 300, status: 'pending', itemizedCents: 30000 },
    ]);
    expect(computeMoney(input).expectedCost.expected).toBe(30000);
  });
});
