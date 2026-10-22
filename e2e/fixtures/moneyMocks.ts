/**
 * Synthetic `money` block of `GET /api/budget/overview` (the one money service, ADR-039) for
 * specs that mock the overview response. The Money overview reads `money.leftToSpend`, so a mock
 * that serves only `{ overview }` breaks the page. Invented amounts only.
 */

import type { LeftToSpend, MoneySummary } from '@cornerstone/shared';

const ZERO_RANGE = { expected: 0, best: 0, worst: 0 };
const ZERO_COST = {
  expectedCost: ZERO_RANGE,
  expectedGrants: ZERO_RANGE,
  afterGrants: ZERO_RANGE,
};

export function mockMoneySummary(leftToSpend?: Partial<LeftToSpend>): MoneySummary {
  return {
    leftToSpend: {
      expected: 230000,
      best: 240000,
      worst: 200000,
      verdict: 'on_budget',
      ...leftToSpend,
    },
    fundingTotal: 250000,
    activeSourceCount: 2,
    expectedCost: ZERO_RANGE,
    expectedGrants: ZERO_RANGE,
    possibleGrants: ZERO_RANGE,
    afterGrants: ZERO_RANGE,
    paid: 0,
    stillToPay: 0,
    stillToPayCount: 0,
    notYetPaid: ZERO_RANGE,
    notYetSplit: { amount: 0, recordCount: 0 },
    readyToSubmit: { count: 0, amount: 0 },
    records: {
      offers: { count: 0, amount: 0, paid: 0, stillToPay: 0 },
      invoices: { count: 0, amount: 0, paid: 0, stillToPay: 0 },
    },
    sources: [],
    grants: [],
    byType: { work_items: ZERO_COST, household_items: ZERO_COST },
    byArea: [],
  } as unknown as MoneySummary;
}
