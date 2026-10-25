/**
 * Money › Overview breakdown (#2237, ADR-039 §5): pure arithmetic, no database.
 *
 * `attributePayments` splits every record's Paid and Still to pay over the lines it is itemized
 * on (and an "unsplit" bucket for the part no line carries) with the largest-remainder split, so
 * the attributed sums equal `computePayments` exactly. Progress payments tagged to a funding
 * source go first to the record's lines of that source (weighted by itemized cents); the untagged
 * rest, which also absorbs reconciliation and rounding, is split over all weights. Every part may
 * be negative, so each split works on the absolute value and re-applies the sign. `computeBreakdown` rolls the engine run
 * and the attributed payments up into the rows of every breakdown view. Integer cents inside,
 * major units only when emitting.
 */

import type {
  BreakdownAreaRow,
  BreakdownCategoryRow,
  BreakdownFigures,
  BreakdownItem,
  BreakdownItemKind,
  BreakdownLine,
  BreakdownSourceOption,
  BreakdownSourceRow,
  BudgetBreakdown,
  InvoiceStatus,
  MoneyItemType,
} from '@cornerstone/shared';
import { toCents } from './money.js';
import { aggregateInvoiceStatusBreakdown, computeOpenAmounts } from './depositAggregateUtils.js';
import type { TaggedDepositRow } from '../moneyService.js';
import {
  computePayments,
  itemKey,
  largestRemainderSplit,
  toMajor,
  toMoneyRange,
  zeroScen,
  type MoneyInvoiceInput,
  type MoneyLineInput,
  type MoneyResult,
  type Scen,
} from './moneyEngine.js';

/** Weight key of the part of a record that no line carries; cannot collide with a line id. */
const UNSPLIT_KEY = '\u0000unsplit';

export interface LinkInput {
  invoiceId: string;
  lineId: string;
  itemizedCents: number;
}

export interface PaymentCents {
  paid: number;
  stillToPay: number;
}

export interface LinePayments {
  byLine: Map<string, PaymentCents>;
  /** Payments on the part of records that no line carries */
  unsplit: PaymentCents;
}

function compareKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Moves the difference between `target` and the per-record sum onto the record with the largest
 * absolute amount (ties by id ascending), so the per-record cents sum to `target` exactly.
 */
function reconcile(perRecord: Map<string, number>, target: number): void {
  let sum = 0;
  for (const cents of perRecord.values()) sum += cents;
  const diff = target - sum;
  if (diff === 0) return;
  let pickId: string | null = null;
  let pickAbs = -1;
  for (const [id, cents] of perRecord) {
    const abs = Math.abs(cents);
    if (abs > pickAbs || (abs === pickAbs && pickId !== null && compareKeys(id, pickId) < 0)) {
      pickId = id;
      pickAbs = abs;
    }
  }
  if (pickId !== null) perRecord.set(pickId, perRecord.get(pickId)! + diff);
}

/** Largest-remainder split of a possibly negative total: split the magnitude, re-apply the sign. */
function splitSigned(
  total: number,
  weights: Array<{ key: string; weight: number }>,
): Map<string, number> {
  const sign = total < 0 ? -1 : 1;
  const parts = largestRemainderSplit(Math.abs(total), weights);
  for (const [key, cents] of parts) parts.set(key, sign * cents);
  return parts;
}

/**
 * Attributes Paid and Still to pay of every record to its lines. `invoices` lists ALL records;
 * `notYetSplitByInvoice` is the unfiltered engine's remainder map (only remainders >= 1.00),
 * the weight of a record's unsplit part. `lineSources` maps a line id to its funding source:
 * a payment tagged to source `s` is split over the record's lines of `s` only (by itemized
 * cents, equally when all are 0); with no such line it stays in the untagged part.
 */
export function attributePayments(
  invoices: MoneyInvoiceInput[],
  depositRows: TaggedDepositRow[],
  links: LinkInput[],
  notYetSplitByInvoice: Map<string, number>,
  lineSources: ReadonlyMap<string, string | null>,
): LinePayments {
  const rowsByInvoice = new Map<string, TaggedDepositRow[]>();
  for (const row of depositRows) {
    const list = rowsByInvoice.get(row.invoice_id) ?? [];
    list.push(row);
    rowsByInvoice.set(row.invoice_id, list);
  }
  const linksByInvoice = new Map<string, LinkInput[]>();
  for (const link of links) {
    const list = linksByInvoice.get(link.invoiceId) ?? [];
    list.push(link);
    linksByInvoice.set(link.invoiceId, list);
  }

  // Per-record cents, reconciled to the project totals (amount schemas have no multipleOf, so
  // rounding each record can be cents off the project-level figure).
  const paidByInvoice = new Map<string, number>();
  const openByInvoice = new Map<string, number>();
  for (const inv of invoices) {
    const rows = rowsByInvoice.get(inv.id) ?? [];
    const agg = aggregateInvoiceStatusBreakdown(rows);
    paidByInvoice.set(
      inv.id,
      toCents((agg['paid']?.totalAmount ?? 0) + (agg['claimed']?.totalAmount ?? 0)),
    );
    openByInvoice.set(inv.id, toCents(computeOpenAmounts(rows).byInvoice.get(inv.id) ?? 0));
  }
  const totals = computePayments(depositRows);
  reconcile(paidByInvoice, totals.paidCents);
  reconcile(openByInvoice, totals.stillToPayCents);

  const byLine = new Map<string, PaymentCents>();
  const unsplit: PaymentCents = { paid: 0, stillToPay: 0 };
  const add = (key: string, field: keyof PaymentCents, cents: number): void => {
    if (key === UNSPLIT_KEY) {
      unsplit[field] += cents;
      return;
    }
    const entry = byLine.get(key) ?? { paid: 0, stillToPay: 0 };
    entry[field] += cents;
    byLine.set(key, entry);
  };

  for (const inv of invoices) {
    const invLinks = linksByInvoice.get(inv.id) ?? [];
    let paid = paidByInvoice.get(inv.id)!;
    let open = openByInvoice.get(inv.id)!;

    // Tagged progress payments per source, each payment counted once (by id).
    const tagged = new Map<string, PaymentCents>();
    const seen = new Set<string>();
    for (const row of rowsByInvoice.get(inv.id) ?? []) {
      if (
        row.deposit_id === null ||
        row.deposit_amount === null ||
        row.deposit_budget_source_id === null ||
        seen.has(row.deposit_id)
      ) {
        continue;
      }
      seen.add(row.deposit_id);
      const refund = row.deposit_entry_type === 'refund';
      const cents = toCents(row.deposit_amount);
      const entry = tagged.get(row.deposit_budget_source_id) ?? { paid: 0, stillToPay: 0 };
      if (row.deposit_status === 'paid' || row.deposit_status === 'claimed') {
        entry.paid += refund ? -cents : cents;
      } else if (row.deposit_status === 'pending' && !refund) {
        entry.stillToPay += cents;
      }
      tagged.set(row.deposit_budget_source_id, entry);
    }
    for (const sourceId of [...tagged.keys()].sort(compareKeys)) {
      const sourceLinks = invLinks.filter((link) => lineSources.get(link.lineId) === sourceId);
      if (sourceLinks.length === 0) continue; // stays in the untagged part
      const share = tagged.get(sourceId)!;
      const weights = sourceLinks.map((link) => ({
        key: link.lineId,
        weight: Math.max(0, link.itemizedCents),
      }));
      for (const [key, cents] of splitSigned(share.paid, weights)) add(key, 'paid', cents);
      for (const [key, cents] of splitSigned(share.stillToPay, weights)) {
        add(key, 'stillToPay', cents);
      }
      paid -= share.paid;
      open -= share.stillToPay;
    }

    // Untagged part (also carries reconciliation and rounding): all weights.
    const weights: Array<{ key: string; weight: number }> = invLinks.map((link) => ({
      key: link.lineId,
      weight: Math.max(0, link.itemizedCents),
    }));
    const remainder = notYetSplitByInvoice.get(inv.id);
    if (remainder !== undefined) weights.push({ key: UNSPLIT_KEY, weight: remainder });
    if (weights.length === 0) weights.push({ key: UNSPLIT_KEY, weight: 1 });
    for (const [key, cents] of splitSigned(paid, weights)) add(key, 'paid', cents);
    for (const [key, cents] of splitSigned(open, weights)) add(key, 'stillToPay', cents);
  }
  return { byLine, unsplit };
}

// ─── Breakdown ───────────────────────────────────────────────────────────────

export interface BreakdownContext {
  /** The (possibly source-filtered) engine run */
  result: MoneyResult;
  /** Unfiltered attribution */
  payments: LinePayments;
  items: Array<{
    kind: BreakdownItemKind;
    id: string;
    name: string;
    areaId: string | null;
  }>;
  areas: Array<{ id: string; parentId: string | null; sortOrder: number; name: string }>;
  categories: Array<{ id: string; name: string; translationKey: string | null; sortOrder: number }>;
  /** name ASC, id ASC */
  sources: BreakdownSourceOption[];
  lineMeta: Map<string, { description: string | null; linkStatus: InvoiceStatus | null }>;
  hasUnassignedLines: boolean;
}

/** One row's money in cents: cost and grants per scenario, plus attributed payments. */
interface Acc {
  cost: Scen;
  grants: Scen;
  paid: number;
  stillToPay: number;
}

function newAcc(): Acc {
  return { cost: zeroScen(), grants: zeroScen(), paid: 0, stillToPay: 0 };
}

function addScen(target: Scen, add: Scen): void {
  target.expected += add.expected;
  target.best += add.best;
  target.worst += add.worst;
}

function addAcc(target: Acc, add: Acc): void {
  addScen(target.cost, add.cost);
  addScen(target.grants, add.grants);
  target.paid += add.paid;
  target.stillToPay += add.stillToPay;
}

function emit(acc: Acc): BreakdownFigures {
  const afterGrants: Scen = {
    expected: acc.cost.expected - acc.grants.expected,
    best: acc.cost.best - acc.grants.best,
    worst: acc.cost.worst - acc.grants.worst,
  };
  // Never clamped: an overpaid record or a remainder below 1.00 can make this negative.
  const notYetPaid: Scen = {
    expected: acc.cost.expected - acc.paid,
    best: acc.cost.best - acc.paid,
    worst: acc.cost.worst - acc.paid,
  };
  return {
    expectedCost: toMoneyRange(acc.cost),
    expectedGrants: toMoneyRange(acc.grants),
    afterGrants: toMoneyRange(afterGrants),
    paid: toMajor(acc.paid),
    stillToPay: toMajor(acc.stillToPay),
    notYetPaid: toMoneyRange(notYetPaid),
  };
}

function groupAcc<K>(entries: Array<{ key: K; acc: Acc }>): Map<K, Acc> {
  const map = new Map<K, Acc>();
  for (const { key, acc } of entries) {
    const target = map.get(key) ?? newAcc();
    addAcc(target, acc);
    map.set(key, target);
  }
  return map;
}

interface LineAcc {
  line: MoneyLineInput;
  acc: Acc;
}

export function computeBreakdown(ctx: BreakdownContext): BudgetBreakdown {
  const { result, payments } = ctx;
  const noPayments: PaymentCents = { paid: 0, stillToPay: 0 };

  // Item order: tasks (name, id), then purchases (name, id).
  const itemOrder = [...ctx.items].sort(
    (a, b) =>
      (a.kind === b.kind ? 0 : a.kind === 'work_item' ? -1 : 1) ||
      compareKeys(a.name, b.name) ||
      compareKeys(a.id, b.id),
  );
  const itemRank = new Map<string, number>();
  itemOrder.forEach((item, i) => itemRank.set(itemKey(item.kind, item.id), i));
  const itemAreaByKey = new Map(ctx.items.map((i) => [itemKey(i.kind, i.id), i.areaId]));
  const knownAreas = new Set(ctx.areas.map((a) => a.id));
  const knownCategories = new Set(ctx.categories.map((c) => c.id));
  const knownSources = new Set(ctx.sources.map((s) => s.id));
  const areaOrNull = (areaId: string | null): string | null =>
    areaId !== null && knownAreas.has(areaId) ? areaId : null;

  const lineAccs: LineAcc[] = result.lines.map((line) => {
    const acc = newAcc();
    addScen(acc.cost, result.lineCost.get(line.id)!);
    addScen(acc.grants, result.lineGrants.get(line.id) ?? zeroScen());
    const pay = payments.byLine.get(line.id) ?? noPayments;
    acc.paid = pay.paid;
    acc.stillToPay = pay.stillToPay;
    return { line, acc };
  });
  // Lines: item order (orphans last), then description (null last), then id
  const rankOf = (line: MoneyLineInput): number =>
    line.itemId === null
      ? Number.MAX_SAFE_INTEGER
      : (itemRank.get(itemKey(line.kind, line.itemId)) ?? Number.MAX_SAFE_INTEGER - 1);
  const descriptionOf = (line: MoneyLineInput): string | null =>
    ctx.lineMeta.get(line.id)?.description ?? null;
  lineAccs.sort((a, b) => {
    const da = descriptionOf(a.line);
    const db = descriptionOf(b.line);
    return (
      rankOf(a.line) - rankOf(b.line) ||
      (da === db ? 0 : da === null ? 1 : db === null ? -1 : compareKeys(da, db)) ||
      compareKeys(a.line.id, b.line.id)
    );
  });

  const lines: BreakdownLine[] = lineAccs.map(({ line, acc }) => ({
    id: line.id,
    kind: line.kind,
    itemId: line.itemId,
    description: descriptionOf(line),
    confidence: line.confidence as BreakdownLine['confidence'],
    budgetCategoryId: line.budgetCategoryId,
    budgetSourceId: line.budgetSourceId,
    linkStatus: ctx.lineMeta.get(line.id)?.linkStatus ?? null,
    figures: emit(acc),
  }));

  // Items: lines of a task / purchase (orphans excluded)
  const itemAccs = new Map<string, Acc>();
  const orphanAcc = newAcc();
  let hasOrphans = false;
  for (const { line, acc } of lineAccs) {
    if (line.itemId === null) {
      hasOrphans = true;
      addAcc(orphanAcc, acc);
      continue;
    }
    const key = itemKey(line.kind, line.itemId);
    const target = itemAccs.get(key) ?? newAcc();
    addAcc(target, acc);
    itemAccs.set(key, target);
  }
  const items: BreakdownItem[] = [];
  for (const item of itemOrder) {
    const acc = itemAccs.get(itemKey(item.kind, item.id));
    if (!acc) continue;
    items.push({
      kind: item.kind,
      id: item.id,
      name: item.name,
      areaId: areaOrNull(item.areaId),
      figures: emit(acc),
    });
  }

  // By area: own items plus descendants, depth-first by (sort_order, name, id)
  const ownByArea = new Map<string, Acc>();
  const noAreaAcc = newAcc();
  let hasNoArea = hasOrphans;
  if (hasOrphans) addAcc(noAreaAcc, orphanAcc);
  for (const [key, acc] of itemAccs) {
    const areaId = areaOrNull(itemAreaByKey.get(key) as string | null);
    if (areaId === null) {
      hasNoArea = true;
      addAcc(noAreaAcc, acc);
      continue;
    }
    const target = ownByArea.get(areaId) ?? newAcc();
    addAcc(target, acc);
    ownByArea.set(areaId, target);
  }

  const children = new Map<string | null, BreakdownContext['areas']>();
  for (const area of ctx.areas) {
    const parent = areaOrNull(area.parentId);
    const list = children.get(parent) ?? [];
    list.push(area);
    children.set(parent, list);
  }
  for (const list of children.values()) {
    list.sort(
      (a, b) => a.sortOrder - b.sortOrder || compareKeys(a.name, b.name) || compareKeys(a.id, b.id),
    );
  }
  const byArea: BreakdownAreaRow[] = [];
  const visit = (area: BreakdownContext['areas'][number]): Acc | null => {
    const total = newAcc();
    const own = ownByArea.get(area.id);
    let present = own !== undefined;
    if (own) addAcc(total, own);
    const row: BreakdownAreaRow = {
      areaId: area.id,
      parentId: areaOrNull(area.parentId),
      name: area.name,
      figures: emit(total),
    };
    const slot = byArea.length;
    byArea.push(row);
    for (const child of children.get(area.id) ?? []) {
      const sub = visit(child);
      if (sub) {
        present = true;
        addAcc(total, sub);
      }
    }
    if (!present) {
      byArea.splice(slot, 1);
      return null;
    }
    row.figures = emit(total);
    return total;
  };
  for (const root of children.get(null) ?? []) visit(root);

  // By type
  const typeAcc: Record<MoneyItemType, Acc> = { work_items: newAcc(), household_items: newAcc() };
  for (const { line, acc } of lineAccs) {
    addAcc(line.kind === 'work_item' ? typeAcc.work_items : typeAcc.household_items, acc);
  }

  // By category: (sort_order, name, id), the null category last
  const categoryAccs = groupAcc(
    lineAccs.map(({ line, acc }) => ({
      key:
        line.budgetCategoryId !== null && knownCategories.has(line.budgetCategoryId)
          ? line.budgetCategoryId
          : null,
      acc,
    })),
  );
  const byCategory: BreakdownCategoryRow[] = [];
  const orderedCategories = [...ctx.categories].sort(
    (a, b) => a.sortOrder - b.sortOrder || compareKeys(a.name, b.name) || compareKeys(a.id, b.id),
  );
  for (const category of orderedCategories) {
    const acc = categoryAccs.get(category.id);
    if (!acc) continue;
    byCategory.push({
      budgetCategoryId: category.id,
      name: category.name,
      translationKey: category.translationKey,
      figures: emit(acc),
    });
  }
  const noCategory = categoryAccs.get(null);
  if (noCategory) {
    byCategory.push({
      budgetCategoryId: null,
      name: null,
      translationKey: null,
      figures: emit(noCategory),
    });
  }

  // By source: (name, id), the null source last
  const sourceAccs = groupAcc(
    lineAccs.map(({ line, acc }) => ({
      key:
        line.budgetSourceId !== null && knownSources.has(line.budgetSourceId)
          ? line.budgetSourceId
          : null,
      acc,
    })),
  );
  const bySource: BreakdownSourceRow[] = [];
  for (const source of ctx.sources) {
    const acc = sourceAccs.get(source.id);
    if (!acc) continue;
    bySource.push({ budgetSourceId: source.id, name: source.name, figures: emit(acc) });
  }
  const noSource = sourceAccs.get(null);
  if (noSource) bySource.push({ budgetSourceId: null, name: null, figures: emit(noSource) });

  // Not yet split: not tied to a source, never filtered
  const splitCents = result.notYetSplit.amountCents;
  const splitAcc: Acc = {
    cost: { expected: splitCents, best: splitCents, worst: splitCents },
    grants: zeroScen(),
    paid: payments.unsplit.paid,
    stillToPay: payments.unsplit.stillToPay,
  };
  const hasSplit = splitCents !== 0 || splitAcc.paid !== 0 || splitAcc.stillToPay !== 0;

  const totalAcc = newAcc();
  for (const { acc } of lineAccs) addAcc(totalAcc, acc);
  addAcc(totalAcc, splitAcc);

  return {
    sourceOptions: ctx.sources,
    hasUnassignedLines: ctx.hasUnassignedLines,
    lines,
    items,
    byArea,
    noArea: hasNoArea ? emit(noAreaAcc) : null,
    orphanLines: hasOrphans ? emit(orphanAcc) : null,
    byType: {
      work_items: emit(typeAcc.work_items),
      household_items: emit(typeAcc.household_items),
    },
    byCategory,
    bySource,
    notYetSplit: hasSplit ? emit(splitAcc) : null,
    total: emit(totalAcc),
  };
}
