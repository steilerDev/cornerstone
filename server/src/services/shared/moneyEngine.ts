/**
 * Money engine (ADR-039, #2228): the pure computation behind the one money service.
 *
 * No database access here. `moneyService.ts` reads the rows and hands them over as a
 * `MoneyInput`; this module computes every figure in INTEGER CENTS (stored REAL amounts are
 * converted once with `toCents`, every margin and rate is rounded to whole cents with
 * `Math.round`, and sums are integer sums), and converts to major units only at the boundary
 * (`toMajor` / `toMoneyRange`).
 *
 * Scenarios. Every range figure is computed in three scenarios, which name a SCENARIO and not
 * an ordering:
 *  - `expected`: every line at its expected cost;
 *  - `best`: every unlinked line at the low end of its confidence margin;
 *  - `worst`: every unlinked line at the high end.
 * Grants are recomputed in each scenario, so a grant figure's `best` can be below its `worst`,
 * and for a per-item share under a cap `best` can be above `worst`.
 */

import { CONFIDENCE_MARGINS, effectivePlannedAmount } from '@cornerstone/shared';
import type {
  BudgetVerdict,
  ConfidenceLevel,
  MoneyOfferTotals,
  MoneyRange,
  MoneyRecordTotals,
  SubsidyApplicationStatus,
  SubsidyReductionType,
} from '@cornerstone/shared';
import { toCents } from './money.js';
import {
  aggregateInvoiceStatusBreakdown,
  computeOpenAmounts,
  type InvoiceDepositRow,
} from './depositAggregateUtils.js';

// ─── Input ───────────────────────────────────────────────────────────────────

export type MoneyItemKind = 'work_item' | 'household_item';

/** Key of a linked item inside the engine: `kind:id`. */
export function itemKey(kind: MoneyItemKind, id: string): string {
  return `${kind}:${id}`;
}

export interface MoneyLineInput {
  id: string;
  kind: MoneyItemKind;
  /** null = work-item line without a work item (orphan, ADR-030) */
  itemId: string | null;
  budgetSourceId: string | null;
  budgetCategoryId: string | null;
  confidence: string;
  /** Stored planned amount in major units (gross or net, see includesVat) */
  plannedAmount: number;
  includesVat: boolean;
  /** Σ itemized amounts (cents) of the invoice rows linking this line; null = not linked */
  itemizedCents: number | null;
}

export interface MoneyItemInput {
  kind: MoneyItemKind;
  id: string;
  areaId: string | null;
}

export interface MoneyInvoiceInput {
  id: string;
  /** Record amount in major units */
  amount: number;
  status: string;
  /** Σ itemized amounts (cents) of its invoice_budget_lines rows */
  itemizedCents: number;
}

export interface MoneyGrantInput {
  id: string;
  name: string;
  status: SubsidyApplicationStatus;
  reductionType: SubsidyReductionType;
  reductionValue: number;
  maximumAmount: number | null;
  includesNoCategoryItems: boolean;
  categoryIds: string[];
  /** `itemKey(kind, id)` of every linked item */
  linkedItemKeys: string[];
}

export interface MoneyAreaInput {
  id: string;
  parentId: string | null;
  sortOrder: number;
  name: string;
}

export interface MoneyInput {
  vatRate: number;
  lines: MoneyLineInput[];
  items: MoneyItemInput[];
  invoices: MoneyInvoiceInput[];
  grants: MoneyGrantInput[];
  areas: MoneyAreaInput[];
  /** Σ total_amount (cents) of the active funding sources */
  fundingTotalCents: number;
  activeSourceCount: number;
}

// ─── Result ──────────────────────────────────────────────────────────────────

/** A figure in the three scenarios, in integer cents. */
export interface Scen {
  expected: number;
  best: number;
  worst: number;
}

export type Scenario = keyof Scen;
export const SCENARIOS: readonly Scenario[] = ['expected', 'best', 'worst'] as const;

export interface GrantResult {
  input: MoneyGrantInput;
  /** linked item keys, ascending */
  itemKeys: string[];
  eligibleItemCount: number;
  eligibleCost: Scen;
  uncapped: Scen;
  payout: Scen;
  capped: boolean;
  counted: boolean;
  /** lineId -> share of this grant */
  lineShares: Map<string, Scen>;
  /** itemKey -> total share of this grant (sum of its line shares) */
  itemTotals: Map<string, Scen>;
}

export interface CostGrantCents {
  cost: Scen;
  grants: Scen;
}

export interface AreaResult extends CostGrantCents {
  areaId: string | null;
}

export type MoneyVerdict = BudgetVerdict | null;

export interface MoneyResult {
  /** lines that took part (after `includeLine`) */
  lines: MoneyLineInput[];
  lineCost: Map<string, Scen>;
  /** Σ counted grant shares per line */
  lineGrants: Map<string, Scen>;
  /** grants, ordered by name then id */
  grants: GrantResult[];
  /** itemKey -> cost and counted grants of the item (items with a line or a share) */
  items: Map<string, CostGrantCents>;
  /** orphan work-item lines */
  orphan: CostGrantCents;
  /** budgetSourceId (or 'unassigned') -> counted grant shares attributed to it */
  sourceGrants: Map<string, Scen>;
  notYetSplit: { amountCents: number; recordCount: number };
  expectedCost: Scen;
  expectedGrants: Scen;
  possibleGrants: Scen;
  afterGrants: Scen;
  fundingTotalCents: number;
  activeSourceCount: number;
  leftToSpend: Scen;
  verdict: MoneyVerdict;
  byType: { work_items: CostGrantCents; household_items: CostGrantCents };
  byArea: AreaResult[];
}

// ─── Small helpers ───────────────────────────────────────────────────────────

/** Cents to major units at the API boundary; never returns -0. */
export function toMajor(cents: number): number {
  return cents === 0 ? 0 : cents / 100;
}

export function toMoneyRange(c: Scen): MoneyRange {
  return { expected: toMajor(c.expected), best: toMajor(c.best), worst: toMajor(c.worst) };
}

export function zeroScen(): Scen {
  return { expected: 0, best: 0, worst: 0 };
}

function addInto(target: Scen, add: Scen): void {
  target.expected += add.expected;
  target.best += add.best;
  target.worst += add.worst;
}

function mapScen(fn: (s: Scenario) => number): Scen {
  return { expected: fn('expected'), best: fn('best'), worst: fn('worst') };
}

function compareKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Splits `totalCents` over the weighted keys with largest-remainder allocation in cents:
 * each key gets floor(total * weight / Σweights), the leftover cents go one each to the largest
 * fractional remainders, ties broken by key ascending. The result always sums to `totalCents`
 * exactly. When every weight is 0 the split is equal. Weights are integers (cents); `totalCents`
 * is non-negative. Uses BigInt so the products cannot lose precision.
 */
export function largestRemainderSplit(
  totalCents: number,
  weights: Array<{ key: string; weight: number }>,
): Map<string, number> {
  const result = new Map<string, number>();
  if (weights.length === 0) return result;

  let effective = weights;
  let sum = weights.reduce((acc, w) => acc + w.weight, 0);
  if (sum <= 0) {
    effective = weights.map((w) => ({ key: w.key, weight: 1 }));
    sum = effective.length;
  }

  const bigTotal = BigInt(totalCents);
  const bigSum = BigInt(sum);
  const parts = effective.map((w) => {
    const product = bigTotal * BigInt(w.weight);
    return { key: w.key, floor: product / bigSum, remainder: product % bigSum };
  });

  let assigned = 0n;
  for (const p of parts) assigned += p.floor;
  let leftover = Number(bigTotal - assigned);

  const order = [...parts].sort((a, b) =>
    a.remainder === b.remainder ? compareKeys(a.key, b.key) : a.remainder > b.remainder ? -1 : 1,
  );
  const bonus = new Set<string>();
  for (const p of order) {
    if (leftover <= 0) break;
    bonus.add(p.key);
    leftover -= 1;
  }

  for (const p of parts) {
    result.set(p.key, Number(p.floor) + (bonus.has(p.key) ? 1 : 0));
  }
  return result;
}

// ─── Lines ───────────────────────────────────────────────────────────────────

/** Formula 1: the cost of one line in the three scenarios. */
function computeLineCost(line: MoneyLineInput, vatRate: number): Scen {
  if (line.itemizedCents !== null) {
    // Linked to an invoice record (any status, offers included): face value in every scenario.
    return { expected: line.itemizedCents, best: line.itemizedCents, worst: line.itemizedCents };
  }
  const gross = toCents(
    effectivePlannedAmount(
      { plannedAmount: line.plannedAmount, includesVat: line.includesVat },
      vatRate,
    ),
  );
  const margin =
    CONFIDENCE_MARGINS[line.confidence as ConfidenceLevel] ?? CONFIDENCE_MARGINS.own_estimate;
  return {
    expected: gross,
    best: Math.round(gross * (1 - margin)),
    worst: Math.round(gross * (1 + margin)),
  };
}

// ─── Grants ──────────────────────────────────────────────────────────────────

function computeGrant(
  grant: MoneyGrantInput,
  linesByItem: Map<string, MoneyLineInput[]>,
  lineCost: Map<string, Scen>,
): GrantResult {
  const itemKeys = Array.from(new Set(grant.linkedItemKeys)).sort(compareKeys);
  const categories = new Set(grant.categoryIds);

  const passesCategory = (line: MoneyLineInput): boolean => {
    if (categories.size === 0) return true;
    return line.budgetCategoryId === null
      ? grant.includesNoCategoryItems
      : categories.has(line.budgetCategoryId);
  };

  const eligibleLines: MoneyLineInput[] = [];
  const eligibleByItem = new Map<string, MoneyLineInput[]>();
  for (const key of itemKeys) {
    const own = (linesByItem.get(key) ?? []).filter(passesCategory);
    eligibleByItem.set(key, own);
    eligibleLines.push(...own);
  }

  const eligibleCost = mapScen((s) =>
    eligibleLines.reduce((acc, l) => acc + lineCost.get(l.id)![s], 0),
  );

  const fixedLineAmounts: Record<Scenario, Map<string, number>> = {
    expected: new Map(),
    best: new Map(),
    worst: new Map(),
  };
  const capCents = grant.maximumAmount === null ? null : toCents(grant.maximumAmount);
  let uncapped: Scen;
  let payout: Scen;
  if (grant.reductionType === 'percentage') {
    const rate = grant.reductionValue;
    uncapped = mapScen((s) => Math.round((eligibleCost[s] * rate) / 100));
    payout =
      capCents === null
        ? { ...uncapped }
        : mapScen((s) => Math.round((Math.min(eligibleCost[s], capCents) * rate) / 100));
  } else {
    // Legacy fixed grant (shown unchanged, #2242 AC7): reduction_value per linked item, split
    // equally over the item's eligible lines, each line's part capped at that line's cost; the
    // sum is then capped by maximum_amount. Same rule as the retired engine.
    const perItem = toCents(grant.reductionValue);
    for (const s of SCENARIOS) {
      const amounts = new Map<string, number>();
      for (const own of eligibleByItem.values()) {
        const split = largestRemainderSplit(
          perItem,
          own.map((l) => ({ key: l.id, weight: 0 })),
        );
        for (const line of own) {
          amounts.set(line.id, Math.min(split.get(line.id)!, lineCost.get(line.id)![s]));
        }
      }
      fixedLineAmounts[s] = amounts;
    }
    uncapped = mapScen((s) => {
      let sum = 0;
      for (const v of fixedLineAmounts[s].values()) sum += v;
      return sum;
    });
    payout = capCents === null ? { ...uncapped } : mapScen((s) => Math.min(uncapped[s], capCents));
  }

  const lineShares = new Map<string, Scen>();
  const itemTotals = new Map<string, Scen>();
  const addLineShare = (line: MoneyLineInput, s: Scenario, cents: number): void => {
    const entry = lineShares.get(line.id) ?? zeroScen();
    entry[s] += cents;
    lineShares.set(line.id, entry);
    if (line.itemId !== null) {
      const key = itemKey(line.kind, line.itemId);
      const total = itemTotals.get(key) ?? zeroScen();
      total[s] += cents;
      itemTotals.set(key, total);
    }
  };
  for (const s of SCENARIOS) {
    if (grant.reductionType === 'percentage') {
      const split = largestRemainderSplit(
        payout[s],
        eligibleLines.map((l) => ({ key: l.id, weight: lineCost.get(l.id)![s] })),
      );
      for (const line of eligibleLines) addLineShare(line, s, split.get(line.id)!);
    } else {
      // The capped per-line amounts are the weights; when maximum_amount bites, the payout is
      // spread over them (largest remainder), otherwise each line gets its own amount.
      const amounts = fixedLineAmounts[s];
      const split = largestRemainderSplit(
        payout[s],
        Array.from(amounts, ([key, weight]) => ({ key, weight })),
      );
      for (const line of eligibleLines) addLineShare(line, s, split.get(line.id)!);
    }
  }

  return {
    input: grant,
    itemKeys,
    eligibleItemCount: itemKeys.length,
    eligibleCost,
    uncapped,
    payout,
    capped: uncapped.worst > payout.worst,
    counted: grant.status === 'approved' || grant.status === 'received',
    lineShares,
    itemTotals,
  };
}

// ─── Main computation ────────────────────────────────────────────────────────

export interface ComputeMoneyOptions {
  /** Excludes lines from cost and grants (breakdown source filter). Not-yet-split is unaffected. */
  includeLine?: (line: MoneyLineInput) => boolean;
}

/**
 * Formulas 1-7 and 10 of ADR-039: line costs, not-yet-split, expected cost, grants (capped,
 * pro rata, largest remainder), left to spend and the strict verdict, by type and by area.
 */
export function computeMoney(input: MoneyInput, options: ComputeMoneyOptions = {}): MoneyResult {
  const include = options.includeLine ?? (() => true);
  const lines = input.lines.filter(include);

  // 1. Line costs
  const lineCost = new Map<string, Scen>();
  const linesByItem = new Map<string, MoneyLineInput[]>();
  for (const line of lines) {
    lineCost.set(line.id, computeLineCost(line, input.vatRate));
    if (line.itemId !== null) {
      const key = itemKey(line.kind, line.itemId);
      const list = linesByItem.get(key) ?? [];
      list.push(line);
      linesByItem.set(key, list);
    }
  }

  // 2. Not yet split
  let notYetSplitCents = 0;
  let notYetSplitRecords = 0;
  for (const invoice of input.invoices) {
    const remainder = toCents(invoice.amount) - invoice.itemizedCents;
    if (remainder >= 100) {
      notYetSplitCents += remainder;
      notYetSplitRecords += 1;
    }
  }

  // 3. Expected cost
  const linesCost = zeroScen();
  for (const cost of lineCost.values()) addInto(linesCost, cost);
  const expectedCost = mapScen((s) => linesCost[s] + notYetSplitCents);

  // 4./5. Grants
  const grants = input.grants
    .filter((g) => g.status !== 'rejected')
    .sort((a, b) => compareKeys(a.name, b.name) || compareKeys(a.id, b.id))
    .map((g) => computeGrant(g, linesByItem, lineCost));

  const expectedGrants = zeroScen();
  const possibleGrants = zeroScen();
  const lineGrants = new Map<string, Scen>();
  const itemGrants = new Map<string, Scen>();
  const sourceGrants = new Map<string, Scen>();
  const lineById = new Map(lines.map((l) => [l.id, l]));

  for (const grant of grants) {
    if (!grant.counted) {
      addInto(possibleGrants, grant.payout);
      continue;
    }
    addInto(expectedGrants, grant.payout);
    for (const [lineId, share] of grant.lineShares) {
      const own = lineGrants.get(lineId) ?? zeroScen();
      addInto(own, share);
      lineGrants.set(lineId, own);
      const sourceKey = lineById.get(lineId)!.budgetSourceId ?? 'unassigned';
      const bySource = sourceGrants.get(sourceKey) ?? zeroScen();
      addInto(bySource, share);
      sourceGrants.set(sourceKey, bySource);
    }
    for (const [key, total] of grant.itemTotals) {
      const own = itemGrants.get(key) ?? zeroScen();
      addInto(own, total);
      itemGrants.set(key, own);
    }
  }

  const afterGrants = mapScen((s) => expectedCost[s] - expectedGrants[s]);

  // 7. Left to spend and the strict verdict
  const leftToSpend = mapScen((s) => input.fundingTotalCents + expectedGrants[s] - expectedCost[s]);
  const verdict: MoneyVerdict =
    input.activeSourceCount === 0 || expectedCost.expected === 0
      ? null
      : leftToSpend.expected < 0
        ? 'over_budget'
        : 'on_budget';

  // 10. Per item, by type, by area
  const items = new Map<string, CostGrantCents>();
  const orphan: CostGrantCents = { cost: zeroScen(), grants: zeroScen() };
  const ensureItem = (key: string): CostGrantCents => {
    let entry = items.get(key);
    if (!entry) {
      entry = { cost: zeroScen(), grants: zeroScen() };
      items.set(key, entry);
    }
    return entry;
  };
  for (const line of lines) {
    const cost = lineCost.get(line.id)!;
    if (line.itemId === null) {
      addInto(orphan.cost, cost);
    } else {
      addInto(ensureItem(itemKey(line.kind, line.itemId)).cost, cost);
    }
  }
  for (const [key, total] of itemGrants) {
    addInto(ensureItem(key).grants, total);
  }

  const byType = {
    work_items: { cost: zeroScen(), grants: zeroScen() },
    household_items: { cost: zeroScen(), grants: zeroScen() },
  };
  addInto(byType.work_items.cost, orphan.cost);
  for (const [key, figures] of items) {
    const bucket = key.startsWith('work_item:') ? byType.work_items : byType.household_items;
    addInto(bucket.cost, figures.cost);
    addInto(bucket.grants, figures.grants);
  }

  const byArea = computeByArea(
    input,
    items,
    orphan,
    lines.some((l) => l.itemId === null),
  );

  return {
    lines,
    lineCost,
    lineGrants,
    grants,
    items,
    orphan,
    sourceGrants,
    notYetSplit: { amountCents: notYetSplitCents, recordCount: notYetSplitRecords },
    expectedCost,
    expectedGrants,
    possibleGrants,
    afterGrants,
    fundingTotalCents: input.fundingTotalCents,
    activeSourceCount: input.activeSourceCount,
    leftToSpend,
    verdict,
    byType,
    byArea,
  };
}

/**
 * By-area roll-up: an area counts its own items and all descendants. One entry per area with at
 * least one line (or grant share) in its subtree, in depth-first tree order by
 * (sort_order, name, id); an `areaId: null` entry (items without an area and orphan lines) last.
 */
function computeByArea(
  input: MoneyInput,
  items: Map<string, CostGrantCents>,
  orphan: CostGrantCents,
  hasOrphanLines: boolean,
): AreaResult[] {
  const itemArea = new Map<string, string | null>();
  for (const item of input.items) itemArea.set(itemKey(item.kind, item.id), item.areaId);
  const knownAreas = new Set(input.areas.map((a) => a.id));

  const own = new Map<string | null, CostGrantCents>();
  const addOwn = (areaId: string | null, figures: CostGrantCents): void => {
    const entry = own.get(areaId) ?? { cost: zeroScen(), grants: zeroScen() };
    addInto(entry.cost, figures.cost);
    addInto(entry.grants, figures.grants);
    own.set(areaId, entry);
  };
  for (const [key, figures] of items) {
    const areaId = itemArea.get(key) ?? null;
    addOwn(areaId !== null && knownAreas.has(areaId) ? areaId : null, figures);
  }
  if (hasOrphanLines) addOwn(null, orphan);

  const children = new Map<string | null, MoneyAreaInput[]>();
  for (const area of input.areas) {
    const parent = area.parentId !== null && knownAreas.has(area.parentId) ? area.parentId : null;
    const list = children.get(parent) ?? [];
    list.push(area);
    children.set(parent, list);
  }
  for (const list of children.values()) {
    list.sort(
      (a, b) => a.sortOrder - b.sortOrder || compareKeys(a.name, b.name) || compareKeys(a.id, b.id),
    );
  }

  const out: AreaResult[] = [];
  const visit = (area: MoneyAreaInput): { total: CostGrantCents; present: boolean } => {
    const total: CostGrantCents = { cost: zeroScen(), grants: zeroScen() };
    const ownFigures = own.get(area.id);
    let present = ownFigures !== undefined;
    if (ownFigures) {
      addInto(total.cost, ownFigures.cost);
      addInto(total.grants, ownFigures.grants);
    }
    const slot = out.length;
    out.push({ areaId: area.id, cost: total.cost, grants: total.grants });
    for (const child of children.get(area.id) ?? []) {
      const sub = visit(child);
      if (sub.present) {
        present = true;
        addInto(total.cost, sub.total.cost);
        addInto(total.grants, sub.total.grants);
      }
    }
    if (!present) out.splice(slot, 1);
    return { total, present };
  };
  for (const root of children.get(null) ?? []) visit(root);

  const nullFigures = own.get(null);
  if (nullFigures) out.push({ areaId: null, cost: nullFigures.cost, grants: nullFigures.grants });
  return out;
}

// ─── Payments (formula 8) ────────────────────────────────────────────────────

export interface PaymentsResult {
  paidCents: number;
  stillToPayCents: number;
  offers: {
    count: number;
    amountCents: number;
    paidCents: number;
    stillToPayCents: number;
    remainingOnOfferCents: number;
  };
  invoices: { count: number; amountCents: number; paidCents: number; stillToPayCents: number };
}

function paidAndStillToPay(rows: InvoiceDepositRow[]): { paid: number; stillToPay: number } {
  const summary = aggregateInvoiceStatusBreakdown(rows);
  const paid = toCents(
    (summary['paid']?.totalAmount ?? 0) + (summary['claimed']?.totalAmount ?? 0),
  );
  const stillToPay = toCents(computeOpenAmounts(rows).openPayable.totalAmount);
  return { paid, stillToPay };
}

/**
 * Invoice-level payment figures over (invoices LEFT JOIN invoice_deposits) rows of ALL records:
 * `paid` = paid + claimed from `aggregateInvoiceStatusBreakdown` (incl. progress payments on
 * offers, refunds negative); `stillToPay` = `computeOpenAmounts(...).openPayable`. The records
 * split runs the same two helpers on the offers (status quotation) and on the other records, and
 * the totals are the sums of the two, so the invariants hold exactly.
 */
export function computePayments(rows: InvoiceDepositRow[]): PaymentsResult {
  const offerRows = rows.filter((r) => r.invoice_status === 'quotation');
  const invoiceRows = rows.filter((r) => r.invoice_status !== 'quotation');

  const countAndAmount = (subset: InvoiceDepositRow[]): { count: number; amountCents: number } => {
    const seen = new Map<string, number>();
    for (const row of subset) {
      if (!seen.has(row.invoice_id)) seen.set(row.invoice_id, toCents(row.invoice_amount));
    }
    let amountCents = 0;
    for (const cents of seen.values()) amountCents += cents;
    return { count: seen.size, amountCents };
  };

  // remainingOnOffer = Σ max(0, amount - Σ non-refund progress payments of any status)
  const offerInvoices = new Map<
    string,
    { amountCents: number; depositIds: Set<string>; paid: number }
  >();
  for (const row of offerRows) {
    let entry = offerInvoices.get(row.invoice_id);
    if (!entry) {
      entry = { amountCents: toCents(row.invoice_amount), depositIds: new Set(), paid: 0 };
      offerInvoices.set(row.invoice_id, entry);
    }
    if (
      row.deposit_id !== null &&
      row.deposit_amount !== null &&
      row.deposit_entry_type !== 'refund' &&
      !entry.depositIds.has(row.deposit_id)
    ) {
      entry.depositIds.add(row.deposit_id);
      entry.paid += toCents(row.deposit_amount);
    }
  }
  let remainingOnOfferCents = 0;
  for (const entry of offerInvoices.values()) {
    remainingOnOfferCents += Math.max(0, entry.amountCents - entry.paid);
  }

  const offerPay = paidAndStillToPay(offerRows);
  const invoicePay = paidAndStillToPay(invoiceRows);

  return {
    paidCents: offerPay.paid + invoicePay.paid,
    stillToPayCents: offerPay.stillToPay + invoicePay.stillToPay,
    offers: {
      ...countAndAmount(offerRows),
      paidCents: offerPay.paid,
      stillToPayCents: offerPay.stillToPay,
      remainingOnOfferCents,
    },
    invoices: {
      ...countAndAmount(invoiceRows),
      paidCents: invoicePay.paid,
      stillToPayCents: invoicePay.stillToPay,
    },
  };
}

/** Converts the cents payment records to the API shape. */
export function toRecordTotals(r: PaymentsResult['invoices']): MoneyRecordTotals {
  return {
    count: r.count,
    amount: toMajor(r.amountCents),
    paid: toMajor(r.paidCents),
    stillToPay: toMajor(r.stillToPayCents),
  };
}

export function toOfferTotals(r: PaymentsResult['offers']): MoneyOfferTotals {
  return {
    count: r.count,
    amount: toMajor(r.amountCents),
    paid: toMajor(r.paidCents),
    stillToPay: toMajor(r.stillToPayCents),
    remainingOnOffer: toMajor(r.remainingOnOfferCents),
  };
}
