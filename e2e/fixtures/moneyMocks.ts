/**
 * Synthetic `money` block of `GET /api/budget/overview` (the one money service, ADR-039) and the
 * `GET /api/budget/breakdown` response of the Money overview, for specs that mock those
 * responses. The Money overview reads `money.leftToSpend`, so a mock that serves only
 * `{ overview }` breaks the page. Invented amounts only.
 */

import type { Page } from '@playwright/test';
import type {
  BreakdownFigures,
  BreakdownItem,
  BreakdownLine,
  BudgetBreakdown,
  BudgetOverviewResponse,
  ConfidenceLevel,
  InvoiceStatus,
  LeftToSpend,
  MoneyRange,
  MoneySourceFigures,
  MoneySummary,
} from '@cornerstone/shared';

const ZERO_RANGE = { expected: 0, best: 0, worst: 0 };
const ZERO_COST = {
  expectedCost: ZERO_RANGE,
  expectedGrants: ZERO_RANGE,
  afterGrants: ZERO_RANGE,
};

export function mockMoneySummary(
  leftToSpend?: Partial<LeftToSpend>,
  overrides: Partial<MoneySummary> = {},
): MoneySummary {
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
    ...overrides,
  } as unknown as MoneySummary;
}

// ─────────────────────────────────────────────────────────────────────────────
// Money overview (#2237): overview response and breakdown factory
// ─────────────────────────────────────────────────────────────────────────────

const range = (expected: number, best = expected, worst = expected): MoneyRange => ({
  expected,
  best,
  worst,
});

/** A funding source row of `money.sources` (invented names and amounts). */
export function mockFundingSource(
  id: string,
  name: string,
  amount: number,
  allocated: number,
): MoneySourceFigures {
  return {
    id,
    name,
    sourceType: 'savings',
    status: 'active',
    isDiscretionary: false,
    amount,
    allocated,
    unallocated: Math.max(amount - allocated, 0),
    overAllocated: Math.max(allocated - amount, 0),
    paid: 0,
    submitted: 0,
    readyToSubmit: { count: 0, amount: 0 },
  };
}

export interface MockOverviewOptions {
  leftToSpend?: Partial<LeftToSpend>;
  sources?: MoneySourceFigures[];
  /** Names of counted grants that hit their eligible-costs cap. */
  cappedGrants?: string[];
  money?: Partial<MoneySummary>;
}

/**
 * The `GET /api/budget/overview` response of the rebuilt Money overview:
 * `{ overview: { subsidySummary }, money }` (the legacy cost fields are gone, #2237).
 * Defaults match {@link buildMockBreakdown}'s dataset: funding 25,000.00, Expected cost 18,800.00
 * (range 17,600.00 to 20,000.00), Expected grants 1,000.00, Paid 2,000.00, Still to pay 1,100.00.
 */
export function mockOverviewResponse(options: MockOverviewOptions = {}): BudgetOverviewResponse {
  const grants = (options.cappedGrants ?? []).map((name, index) => ({
    id: `mock-grant-${index}`,
    name,
    status: 'approved',
    reductionType: 'percentage',
    rate: 20,
    eligibleCostCap: 5000,
    eligibleItemCount: 1,
    eligibleCost: range(5000),
    uncappedPayout: range(1000),
    expected: range(1000),
    capped: true,
    counted: true,
  }));
  const money = mockMoneySummary(
    { expected: 7200, best: 8400, worst: 6000, verdict: 'on_budget', ...options.leftToSpend },
    {
      fundingTotal: 25000,
      expectedCost: range(18800, 17600, 20000),
      expectedGrants: range(1000),
      paid: 2000,
      stillToPay: 1100,
      sources: options.sources ?? [
        mockFundingSource('mock-source-loan', 'Loan (mock)', 15000, 14000),
        mockFundingSource('mock-source-savings', 'Savings (mock)', 10000, 4800),
      ],
      grants: grants as unknown as MoneySummary['grants'],
      ...options.money,
    },
  );
  return {
    overview: {
      subsidySummary: {
        totalReductions: 0,
        activeSubsidyCount: 0,
        minTotalPayback: 0,
        maxTotalPayback: 0,
        oversubscribedSubsidies: [],
      },
    },
    money,
  };
}

interface MockLineSpec {
  id: string;
  /** null = a task line without a task (orphan) */
  itemId: string | null;
  kind: 'work_item' | 'household_item';
  description: string;
  confidence: ConfidenceLevel;
  categoryId: string | null;
  sourceId: string | null;
  linkStatus: InvoiceStatus | null;
  expected: number;
  /** Cost in the Low estimate (default: face value) */
  low?: number;
  /** Cost in the High estimate (default: face value) */
  high?: number;
  paid?: number;
  stillToPay?: number;
  grants?: number;
}

interface MockItemSpec {
  id: string;
  kind: 'work_item' | 'household_item';
  name: string;
  areaId: string | null;
}

interface MockAreaSpec {
  id: string;
  parentId: string | null;
  name: string;
}

/** Ids of the invented breakdown dataset (see {@link buildMockBreakdown}). */
export const MOCK_BREAKDOWN = {
  sources: {
    loan: { id: 'mock-source-loan', name: 'Loan (mock)' },
    savings: { id: 'mock-source-savings', name: 'Savings (mock)' },
  },
  categories: {
    materials: { id: 'mock-category-materials', name: 'Materials (mock)' },
    labour: { id: 'mock-category-labour', name: 'Labour (mock)' },
  },
  areas: {
    ground: 'mock-area-ground',
    kitchen: 'mock-area-kitchen',
    garden: 'mock-area-garden',
  },
  items: {
    cabinets: 'mock-task-cabinets',
    hedge: 'mock-task-hedge',
    table: 'mock-purchase-table',
  },
  lines: {
    units: 'mock-line-units',
    fitting: 'mock-line-fitting',
    plants: 'mock-line-plants',
    delivery: 'mock-line-delivery',
    tableLine: 'mock-line-table',
    loose: 'mock-line-loose',
  },
} as const;

const B = MOCK_BREAKDOWN;

const AREAS: MockAreaSpec[] = [
  { id: B.areas.ground, parentId: null, name: 'Ground floor (mock)' },
  { id: B.areas.kitchen, parentId: B.areas.ground, name: 'Kitchen (mock)' },
  { id: B.areas.garden, parentId: null, name: 'Garden (mock)' },
];

const ITEMS: MockItemSpec[] = [
  {
    id: B.items.cabinets,
    kind: 'work_item',
    name: 'Fit kitchen cabinets (mock)',
    areaId: B.areas.kitchen,
  },
  { id: B.items.hedge, kind: 'work_item', name: 'Plant the hedge (mock)', areaId: B.areas.garden },
  { id: B.items.table, kind: 'household_item', name: 'Dining table (mock)', areaId: null },
];

/**
 * Six cost lines: an estimate with a Low/High spread and a grant, an offer at face value, an
 * invoice paid in full, an invoice still to pay, a purchase estimate and a line without a task.
 * Expected cost 18,800.00 (Low 17,600.00, High 20,000.00), Paid 2,000.00, Still to pay 800.00
 * plus 300.00 not yet split.
 */
const LINES: MockLineSpec[] = [
  {
    id: B.lines.units,
    itemId: B.items.cabinets,
    kind: 'work_item',
    description: 'Cabinet units (mock)',
    confidence: 'own_estimate',
    categoryId: B.categories.materials.id,
    sourceId: B.sources.savings.id,
    linkStatus: null,
    expected: 10000,
    low: 9000,
    high: 11000,
    grants: 1000,
  },
  {
    id: B.lines.fitting,
    itemId: B.items.cabinets,
    kind: 'work_item',
    description: 'Cabinet fitting offer (mock)',
    confidence: 'quote',
    categoryId: B.categories.labour.id,
    sourceId: B.sources.savings.id,
    linkStatus: 'quotation',
    expected: 4000,
  },
  {
    id: B.lines.plants,
    itemId: B.items.hedge,
    kind: 'work_item',
    description: 'Hedge plants (mock)',
    confidence: 'invoice',
    categoryId: B.categories.materials.id,
    sourceId: B.sources.loan.id,
    linkStatus: 'paid',
    expected: 2000,
    paid: 2000,
  },
  {
    id: B.lines.delivery,
    itemId: B.items.hedge,
    kind: 'work_item',
    description: 'Hedge delivery (mock)',
    confidence: 'invoice',
    categoryId: B.categories.labour.id,
    sourceId: B.sources.loan.id,
    linkStatus: 'pending',
    expected: 800,
    stillToPay: 800,
  },
  {
    id: B.lines.tableLine,
    itemId: B.items.table,
    kind: 'household_item',
    description: 'Table (mock)',
    confidence: 'professional_estimate',
    categoryId: null,
    sourceId: null,
    linkStatus: null,
    expected: 1500,
    low: 1350,
    high: 1650,
  },
  {
    id: B.lines.loose,
    itemId: null,
    kind: 'work_item',
    description: 'Loose line (mock)',
    confidence: 'own_estimate',
    categoryId: null,
    sourceId: null,
    linkStatus: null,
    expected: 500,
    low: 450,
    high: 550,
  },
];

const NOT_YET_SPLIT = { expected: 0, stillToPay: 300 };

function figuresOf(spec: {
  expected: number;
  low?: number;
  high?: number;
  paid?: number;
  stillToPay?: number;
  grants?: number;
}): BreakdownFigures {
  const low = spec.low ?? spec.expected;
  const high = spec.high ?? spec.expected;
  const paid = spec.paid ?? 0;
  const grants = spec.grants ?? 0;
  return {
    expectedCost: range(spec.expected, low, high),
    expectedGrants: range(grants),
    afterGrants: range(spec.expected - grants, low - grants, high - grants),
    paid,
    stillToPay: spec.stillToPay ?? 0,
    notYetPaid: range(spec.expected - paid, low - paid, high - paid),
  };
}

const addRange = (a: MoneyRange, b: MoneyRange): MoneyRange => ({
  expected: a.expected + b.expected,
  best: a.best + b.best,
  worst: a.worst + b.worst,
});

function sumFigures(list: BreakdownFigures[]): BreakdownFigures {
  return list.reduce<BreakdownFigures>(
    (sum, f) => ({
      expectedCost: addRange(sum.expectedCost, f.expectedCost),
      expectedGrants: addRange(sum.expectedGrants, f.expectedGrants),
      afterGrants: addRange(sum.afterGrants, f.afterGrants),
      paid: sum.paid + f.paid,
      stillToPay: sum.stillToPay + f.stillToPay,
      notYetPaid: addRange(sum.notYetPaid, f.notYetPaid),
    }),
    figuresOf({ expected: 0 }),
  );
}

/** URL key of lines without a funding source in `deselectedSources`. */
export const UNASSIGNED = 'unassigned';

/**
 * The `GET /api/budget/breakdown` response for an invented project (see {@link MOCK_BREAKDOWN}),
 * derived entirely from six cost lines so every view adds up to the total. `deselected` mimics
 * the server's `deselectedSources` filter (source ids plus `unassigned`); "Not yet split"
 * (300.00 Still to pay) is never filtered.
 */
export function buildMockBreakdown(deselected: readonly string[] = []): BudgetBreakdown {
  const sourceOptions = [B.sources.loan, B.sources.savings].map((s) => ({
    ...s,
    sourceType: 'savings' as const,
  }));
  const included = LINES.filter((l) => !deselected.includes(l.sourceId ?? UNASSIGNED));

  const lines: BreakdownLine[] = included.map((l) => ({
    id: l.id,
    kind: l.kind,
    itemId: l.itemId,
    description: l.description,
    confidence: l.confidence,
    budgetCategoryId: l.categoryId,
    budgetSourceId: l.sourceId,
    linkStatus: l.linkStatus,
    figures: figuresOf(l),
  }));
  const linesOf = (pred: (l: BreakdownLine) => boolean) => lines.filter(pred);
  const figs = (list: BreakdownLine[]) => sumFigures(list.map((l) => l.figures));

  const items: BreakdownItem[] = ITEMS.flatMap((item) => {
    const own = linesOf((l) => l.itemId === item.id);
    return own.length === 0
      ? []
      : [
          {
            kind: item.kind,
            id: item.id,
            name: item.name,
            areaId: item.areaId,
            figures: figs(own),
          },
        ];
  });

  const areaDescendants = (id: string): string[] => [
    id,
    ...AREAS.filter((a) => a.parentId === id).flatMap((a) => areaDescendants(a.id)),
  ];
  const byArea = AREAS.flatMap((area) => {
    const ids = areaDescendants(area.id);
    const rolled = items.filter((i) => i.areaId !== null && ids.includes(i.areaId));
    return rolled.length === 0
      ? []
      : [
          {
            areaId: area.id,
            parentId: area.parentId,
            name: area.name,
            figures: sumFigures(rolled.map((i) => i.figures)),
          },
        ];
  });

  const orphans = linesOf((l) => l.itemId === null);
  const noAreaItems = items.filter((i) => i.areaId === null);
  const noAreaFigures = sumFigures([
    ...noAreaItems.map((i) => i.figures),
    ...orphans.map((l) => l.figures),
  ]);

  const byCategory = [B.categories.materials, B.categories.labour, null].flatMap((cat) => {
    const own = linesOf((l) => l.budgetCategoryId === (cat?.id ?? null));
    return own.length === 0
      ? []
      : [
          {
            budgetCategoryId: cat?.id ?? null,
            name: cat?.name ?? null,
            translationKey: null,
            figures: figs(own),
          },
        ];
  });
  const bySource = [B.sources.loan, B.sources.savings, null].flatMap((src) => {
    const own = linesOf((l) => l.budgetSourceId === (src?.id ?? null));
    return own.length === 0
      ? []
      : [{ budgetSourceId: src?.id ?? null, name: src?.name ?? null, figures: figs(own) }];
  });

  const notYetSplit = figuresOf(NOT_YET_SPLIT);
  const workLines = linesOf((l) => l.kind === 'work_item');
  const purchaseLines = linesOf((l) => l.kind === 'household_item');

  return {
    sourceOptions,
    hasUnassignedLines: true,
    lines,
    items,
    byArea,
    noArea: noAreaItems.length + orphans.length > 0 ? noAreaFigures : null,
    orphanLines: orphans.length > 0 ? figs(orphans) : null,
    byType: { work_items: figs(workLines), household_items: figs(purchaseLines) },
    byCategory,
    bySource,
    notYetSplit,
    total: sumFigures([figs(lines), notYetSplit]),
  };
}

/** Major-unit euro text as the app formats it in English: 18800 gives "€18,800.00". */
export function euro(amount: number): string {
  const sign = amount < 0 ? '-' : '';
  const text = Math.abs(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${sign}€${text}`;
}

export interface MockedMoneyRequests {
  /** `deselectedSources` of every breakdown request, in order (`null` = no param). */
  readonly breakdownRequests: Array<string | null>;
}

/**
 * Install `page.route` mocks for the overview and the breakdown. The breakdown mock honours the
 * `deselectedSources` filter like the server and records each request's value. Call before
 * `goto`.
 */
export async function mockMoneyOverview(
  page: Page,
  options: MockOverviewOptions & { breakdownDelayMs?: number } = {},
): Promise<MockedMoneyRequests> {
  const breakdownRequests: Array<string | null> = [];
  await page.route('**/api/budget/overview', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockOverviewResponse(options)),
    });
  });
  await page.route('**/api/budget/breakdown**', async (route) => {
    const raw = new URL(route.request().url()).searchParams.get('deselectedSources');
    breakdownRequests.push(raw);
    if (options.breakdownDelayMs) {
      await new Promise((resolve) => setTimeout(resolve, options.breakdownDelayMs));
    }
    const deselected = raw ? raw.split(',') : [];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ breakdown: buildMockBreakdown(deselected) }),
    });
  });
  return { breakdownRequests };
}
