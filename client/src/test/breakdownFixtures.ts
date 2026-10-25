import type {
  BreakdownFigures,
  BreakdownLine,
  BudgetBreakdown,
  MoneyRange,
  MoneySummary,
} from '@cornerstone/shared';

/**
 * Synthetic fixtures for the Money › Overview breakdown tests (#2237). Every number is invented.
 * The rows add up the way the server's breakdown does: the aggregates below are summed from the
 * lines with `sumFigures`, so the tree, the totals and the views agree.
 */

export const range = (expected: number, best = expected, worst = expected): MoneyRange => ({
  expected,
  best,
  worst,
});

export interface FigureOptions {
  readonly best?: number;
  readonly worst?: number;
  readonly grants?: number;
  readonly grantsBest?: number;
  readonly grantsWorst?: number;
  readonly paid?: number;
  readonly stillToPay?: number;
}

/** Breakdown figures of one row; afterGrants and notYetPaid are derived per scenario. */
export function figures(expected: number, opts: FigureOptions = {}): BreakdownFigures {
  const cost = range(expected, opts.best ?? expected, opts.worst ?? expected);
  const grants = range(opts.grants ?? 0, opts.grantsBest ?? opts.grants ?? 0, opts.grantsWorst);
  const paid = opts.paid ?? 0;
  return {
    expectedCost: cost,
    expectedGrants: grants,
    afterGrants: range(
      cost.expected - grants.expected,
      cost.best - grants.best,
      cost.worst - grants.worst,
    ),
    paid,
    stillToPay: opts.stillToPay ?? 0,
    notYetPaid: range(cost.expected - paid, cost.best - paid, cost.worst - paid),
  };
}

const addRange = (a: MoneyRange, b: MoneyRange): MoneyRange => ({
  expected: a.expected + b.expected,
  best: a.best + b.best,
  worst: a.worst + b.worst,
});

export function sumFigures(...list: readonly BreakdownFigures[]): BreakdownFigures {
  const zero = figures(0);
  return list.reduce<BreakdownFigures>(
    (sum, f) => ({
      expectedCost: addRange(sum.expectedCost, f.expectedCost),
      expectedGrants: addRange(sum.expectedGrants, f.expectedGrants),
      afterGrants: addRange(sum.afterGrants, f.afterGrants),
      paid: sum.paid + f.paid,
      stillToPay: sum.stillToPay + f.stillToPay,
      notYetPaid: addRange(sum.notYetPaid, f.notYetPaid),
    }),
    zero,
  );
}

const line = (
  id: string,
  over: Partial<BreakdownLine> & { figures: BreakdownFigures },
): BreakdownLine => ({
  id,
  kind: 'work_item',
  itemId: 'wi-1',
  description: null,
  confidence: 'own_estimate',
  budgetCategoryId: null,
  budgetSourceId: null,
  linkStatus: null,
  ...over,
});

/** l-1 is an invoice (Invoiced), l-2 an estimate, l-3 a paid purchase, l-4 untitled, l-5 an orphan. */
export const L1 = line('l-1', {
  itemId: 'wi-1',
  description: 'Cabinet supply',
  budgetCategoryId: 'cat-1',
  budgetSourceId: 'bs-a',
  linkStatus: 'pending',
  confidence: 'invoice',
  figures: figures(1000, { paid: 400, stillToPay: 600, grants: 100 }),
});
export const L2 = line('l-2', {
  itemId: 'wi-1',
  description: 'Cabinet fitting',
  budgetCategoryId: 'cat-2',
  budgetSourceId: 'bs-b',
  confidence: 'professional_estimate',
  figures: figures(500, { best: 450, worst: 600, grantsBest: 40, grants: 50, grantsWorst: 60 }),
});
export const L3 = line('l-3', {
  kind: 'household_item',
  itemId: 'hi-1',
  description: 'Oven unit',
  budgetCategoryId: 'cat-1',
  budgetSourceId: null,
  linkStatus: 'paid',
  confidence: 'invoice',
  figures: figures(800, { paid: 800 }),
});
export const L4 = line('l-4', {
  itemId: 'wi-2',
  description: null,
  budgetSourceId: 'bs-a',
  figures: figures(300),
});
export const L5 = line('l-5', {
  itemId: null,
  description: 'Loose permit fee',
  budgetSourceId: 'bs-a',
  linkStatus: 'claimed',
  confidence: 'invoice',
  figures: figures(100, { paid: 100 }),
});

export const NOT_YET_SPLIT = figures(200, { paid: 50, stillToPay: 100 });

/** A full breakdown: two areas (Kitchen under Ground floor), a purchase, an untitled line, an orphan. */
export function makeBreakdown(over: Partial<BudgetBreakdown> = {}): BudgetBreakdown {
  const wi1 = sumFigures(L1.figures, L2.figures);
  const kitchen = wi1;
  const ground = sumFigures(kitchen, L3.figures);
  const noArea = sumFigures(L4.figures, L5.figures);
  return {
    sourceOptions: [
      { id: 'bs-a', name: 'Savings', sourceType: 'savings' },
      { id: 'bs-b', name: 'Loan', sourceType: 'bank_loan' },
    ],
    hasUnassignedLines: true,
    lines: [L1, L2, L3, L4, L5],
    items: [
      { kind: 'work_item', id: 'wi-1', name: 'Install cabinets', areaId: 'a-2', figures: wi1 },
      { kind: 'work_item', id: 'wi-2', name: 'Paint walls', areaId: null, figures: L4.figures },
      {
        kind: 'household_item',
        id: 'hi-1',
        name: 'Oven',
        areaId: 'a-1',
        figures: L3.figures,
      },
    ],
    byArea: [
      { areaId: 'a-1', parentId: null, name: 'Ground floor', figures: ground },
      { areaId: 'a-2', parentId: 'a-1', name: 'Kitchen', figures: kitchen },
    ],
    noArea,
    orphanLines: L5.figures,
    byType: {
      work_items: sumFigures(L1.figures, L2.figures, L4.figures, L5.figures),
      household_items: L3.figures,
    },
    byCategory: [
      {
        budgetCategoryId: 'cat-1',
        name: 'Materials',
        translationKey: null,
        figures: sumFigures(L1.figures, L3.figures),
      },
      {
        budgetCategoryId: 'cat-2',
        name: 'Labor',
        translationKey: null,
        figures: L2.figures,
      },
      {
        budgetCategoryId: null,
        name: null,
        translationKey: null,
        figures: sumFigures(L4.figures, L5.figures),
      },
    ],
    bySource: [
      {
        budgetSourceId: 'bs-a',
        name: 'Savings',
        figures: sumFigures(L1.figures, L4.figures, L5.figures),
      },
      { budgetSourceId: 'bs-b', name: 'Loan', figures: L2.figures },
      { budgetSourceId: null, name: null, figures: L3.figures },
    ],
    notYetSplit: NOT_YET_SPLIT,
    total: sumFigures(ground, noArea, NOT_YET_SPLIT),
    ...over,
  };
}

/** A breakdown with nothing in it. */
export function makeEmptyBreakdown(over: Partial<BudgetBreakdown> = {}): BudgetBreakdown {
  return {
    sourceOptions: [],
    hasUnassignedLines: false,
    lines: [],
    items: [],
    byArea: [],
    noArea: null,
    orphanLines: null,
    byType: { work_items: figures(0), household_items: figures(0) },
    byCategory: [],
    bySource: [],
    notYetSplit: null,
    total: figures(0),
    ...over,
  };
}

/** A money summary with a Left to spend figure of 1,200 (range 900 to 1,500). */
export function makeMoney(over: Partial<MoneySummary> = {}): MoneySummary {
  return {
    leftToSpend: { expected: 1200, best: 1500, worst: 900, verdict: 'on_budget' },
    fundingTotal: 10000,
    activeSourceCount: 2,
    expectedCost: range(2900, 2800, 3100),
    expectedGrants: range(150, 100, 200),
    possibleGrants: range(150, 100, 200),
    afterGrants: range(2750, 2700, 2900),
    paid: 1350,
    stillToPay: 700,
    stillToPayCount: 2,
    notYetPaid: range(1550, 1450, 1750),
    notYetSplit: { amount: 200, recordCount: 1 },
    readyToSubmit: { count: 0, amount: 0 },
    records: {
      offers: { count: 0, amount: 0, paid: 0, stillToPay: 0, remainingOnOffer: 0 },
      invoices: { count: 2, amount: 1800, paid: 1350, stillToPay: 700 },
    },
    sources: [
      {
        id: 'bs-a',
        name: 'Savings',
        sourceType: 'savings',
        status: 'active',
        isDiscretionary: false,
        amount: 6000,
        allocated: 1400,
        unallocated: 4600,
        overAllocated: 0,
        paid: 500,
        submitted: 0,
        readyToSubmit: { count: 0, amount: 0 },
      },
      {
        id: 'bs-b',
        name: 'Loan',
        sourceType: 'bank_loan',
        status: 'active',
        isDiscretionary: false,
        amount: 400,
        allocated: 500,
        unallocated: 0,
        overAllocated: 100,
        paid: 0,
        submitted: 0,
        readyToSubmit: { count: 0, amount: 0 },
      },
    ],
    grants: [],
    byType: {
      work_items: {
        expectedCost: range(1900),
        expectedGrants: range(0),
        afterGrants: range(1900),
      },
      household_items: {
        expectedCost: range(800),
        expectedGrants: range(0),
        afterGrants: range(800),
      },
    },
    byArea: [],
    ...over,
  };
}
