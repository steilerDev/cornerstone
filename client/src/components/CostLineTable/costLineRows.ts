import type {
  BaseBudgetLine,
  InvoiceBudgetLineDetailResponse,
  InvoiceStatus,
} from '@cornerstone/shared';
import { CONFIDENCE_MARGINS, effectivePlannedAmount } from '@cornerstone/shared';
import { roundMoney } from '../../lib/money.js';
import { deriveCostLineState } from './costLineState.js';
import type { CostLineGroup, CostLineItemType, CostLineRow, CostLineTarget } from './types.js';

/** A linked line whose estimate differs from its face value by at least this much shows both. */
const ESTIMATE_DIFFERS_THRESHOLD = 0.01;

/** Remaining amounts from this value up are "Not yet split" (ADR-039 threshold). */
const NOT_YET_SPLIT_THRESHOLD = 1;

/** Gross amount of a line as entered: net lines get VAT added, rounded to cents. */
export function costLineGross(
  line: { plannedAmount: number; includesVat: boolean | null },
  vatRate: number,
): number {
  return roundMoney(effectivePlannedAmount(line, vatRate));
}

/**
 * Net amount of a line. A line entered net keeps its stored amount while the shown gross still
 * describes it; otherwise (entered gross, or a linked face value that differs) it is derived from
 * the gross.
 */
export function costLineNet(
  gross: number,
  line: { plannedAmount: number; includesVat: boolean | null; estimateDiffers: boolean },
  vatRate: number,
): number {
  if (line.includesVat === false && !line.estimateDiffers) return line.plannedAmount;
  return roundMoney(gross / (1 + vatRate));
}

interface RowAmounts {
  readonly plannedGross: number;
  readonly gross: number;
  readonly net: number;
  readonly estimateDiffers: boolean;
}

function amountsFor(
  line: { plannedAmount: number; includesVat: boolean },
  itemizedAmount: number | null,
  vatRate: number,
): RowAmounts {
  const plannedGross = costLineGross(line, vatRate);
  const gross = itemizedAmount ?? plannedGross;
  const estimateDiffers =
    itemizedAmount !== null &&
    Math.abs(plannedGross - itemizedAmount) >= ESTIMATE_DIFFERS_THRESHOLD;
  return {
    plannedGross,
    gross,
    net: costLineNet(gross, { ...line, estimateDiffers }, vatRate),
    estimateDiffers,
  };
}

/** A row from a task or purchase's own budget line (item hosts). */
export function rowFromBudgetLine(
  line: BaseBudgetLine,
  lineType: CostLineItemType,
  target: CostLineTarget,
  vatRate: number,
): CostLineRow {
  const link = line.invoiceLink;
  const amounts = amountsFor(line, link ? link.itemizedAmount : null, vatRate);
  return {
    id: line.id,
    lineType,
    invoiceBudgetLineId: link?.invoiceBudgetLineId ?? null,
    invoiceId: link?.invoiceId ?? null,
    invoiceStatus: link?.invoiceStatus ?? null,
    invoiceNumber: link?.invoiceNumber ?? null,
    invoiceDate: link?.invoiceDate ?? null,
    invoiceVendorName: link?.vendorName ?? null,
    state: deriveCostLineState(link?.invoiceStatus ?? null),
    basis: line.confidence,
    margin: link ? 0 : CONFIDENCE_MARGINS[line.confidence],
    description: line.description,
    quantity: line.quantity,
    unit: line.unit,
    unitPrice: line.unitPrice,
    includesVat: line.includesVat,
    plannedAmount: line.plannedAmount,
    ...amounts,
    target,
    categoryId: line.budgetCategory?.id ?? null,
    categoryName: line.budgetCategory?.name ?? null,
    categoryTranslationKey: line.budgetCategory?.translationKey ?? null,
    budgetSourceId: line.budgetSource?.id ?? null,
    budgetSourceName: line.budgetSource?.name ?? null,
    vendorId: line.vendor?.id ?? null,
    vendorName: line.vendor?.name ?? null,
  };
}

/** The offer or invoice the lines of a document host belong to. */
export interface CostLineDocument {
  readonly id: string;
  readonly status: InvoiceStatus;
  readonly invoiceNumber: string | null;
  readonly date: string | null;
  readonly vendorName: string | null;
}

/** A row from an offer or invoice's line list (document hosts). */
export function rowFromInvoiceLine(
  line: InvoiceBudgetLineDetailResponse,
  invoice: CostLineDocument,
  vatRate: number,
  sources: ReadonlyMap<string, string>,
): CostLineRow {
  const amounts = amountsFor(line, line.itemizedAmount, vatRate);
  const target: CostLineTarget | null =
    line.parentItemType === 'unassigned' || line.parentItemId === null
      ? null
      : {
          type: line.parentItemType,
          id: line.parentItemId,
          label: line.parentItemTitle ?? '',
          area: line.parentItemArea,
        };
  return {
    id: line.workItemBudgetId ?? line.householdItemBudgetId ?? line.id,
    lineType: line.householdItemBudgetId !== null ? 'household_item' : 'work_item',
    invoiceBudgetLineId: line.id,
    invoiceId: invoice.id,
    invoiceStatus: invoice.status,
    invoiceNumber: invoice.invoiceNumber,
    invoiceDate: invoice.date,
    invoiceVendorName: invoice.vendorName,
    state: deriveCostLineState(invoice.status),
    basis: line.confidence,
    margin: 0,
    description: line.budgetLineDescription,
    quantity: line.quantity,
    unit: line.unit,
    unitPrice: line.unitPrice,
    includesVat: line.includesVat,
    plannedAmount: line.plannedAmount,
    ...amounts,
    target,
    categoryId: line.categoryId,
    categoryName: line.categoryName,
    categoryTranslationKey: line.categoryTranslationKey,
    budgetSourceId: line.budgetSourceId,
    budgetSourceName: line.budgetSourceId ? (sources.get(line.budgetSourceId) ?? null) : null,
    vendorId: line.vendorId,
    vendorName: null,
  };
}

function sumOf(rows: readonly CostLineRow[], pick: (row: CostLineRow) => number): number {
  return roundMoney(rows.reduce((sum, row) => sum + pick(row), 0));
}

/**
 * Item mode: the Estimates group first (when any line has no offer or invoice), then one group per
 * offer or invoice by date, then number.
 */
export function groupForItem(rows: readonly CostLineRow[]): CostLineGroup[] {
  const groups: CostLineGroup[] = [];
  const estimates = rows.filter((row) => row.invoiceId === null);
  if (estimates.length > 0) {
    groups.push({
      id: 'estimates',
      heading: { kind: 'estimates' },
      rows: estimates,
      total: sumOf(estimates, (row) => row.gross),
      plannedTotal: sumOf(estimates, (row) => row.plannedGross),
    });
  }
  const byDocument = new Map<string, CostLineRow[]>();
  for (const row of rows) {
    if (row.invoiceId === null) continue;
    const list = byDocument.get(row.invoiceId);
    if (list) list.push(row);
    else byDocument.set(row.invoiceId, [row]);
  }
  const documents = [...byDocument.values()].sort((a, b) => {
    const first = a[0]!;
    const second = b[0]!;
    const byDate = (first.invoiceDate ?? '').localeCompare(second.invoiceDate ?? '');
    return byDate !== 0
      ? byDate
      : (first.invoiceNumber ?? '').localeCompare(second.invoiceNumber ?? '');
  });
  for (const documentRows of documents) {
    const first = documentRows[0]!;
    groups.push({
      id: `document-${first.invoiceId}`,
      heading: {
        kind: 'document',
        invoiceId: first.invoiceId!,
        invoiceStatus: first.invoiceStatus!,
        invoiceNumber: first.invoiceNumber,
        invoiceDate: first.invoiceDate,
        vendorName: first.invoiceVendorName,
      },
      rows: documentRows,
      total: sumOf(documentRows, (row) => row.gross),
      plannedTotal: sumOf(documentRows, (row) => row.plannedGross),
    });
  }
  return groups;
}

/**
 * Document mode: one group per task or purchase in order of first appearance; lines that belong
 * to none ("Not assigned") form the last group.
 */
export function groupForDocument(rows: readonly CostLineRow[]): CostLineGroup[] {
  const byTarget = new Map<string, CostLineRow[]>();
  const unassigned: CostLineRow[] = [];
  for (const row of rows) {
    if (row.target === null) {
      unassigned.push(row);
      continue;
    }
    const key = `target-${row.target.type}-${row.target.id}`;
    const list = byTarget.get(key);
    if (list) list.push(row);
    else byTarget.set(key, [row]);
  }
  const groups: CostLineGroup[] = [...byTarget.entries()].map(([id, groupRows]) => ({
    id,
    heading: { kind: 'target', target: groupRows[0]!.target },
    rows: groupRows,
    total: sumOf(groupRows, (row) => row.gross),
    plannedTotal: sumOf(groupRows, (row) => row.plannedGross),
  }));
  if (unassigned.length > 0) {
    groups.push({
      id: 'unassigned',
      heading: { kind: 'target', target: null },
      rows: unassigned,
      total: sumOf(unassigned, (row) => row.gross),
      plannedTotal: sumOf(unassigned, (row) => row.plannedGross),
    });
  }
  return groups;
}

/** What is left of an offer or invoice once its lines are subtracted. */
export function remainingState(remaining: number): 'none' | 'notYetSplit' | 'over' {
  const cents = Math.round(remaining * 100);
  if (cents >= Math.round(NOT_YET_SPLIT_THRESHOLD * 100)) return 'notYetSplit';
  if (cents <= -1) return 'over';
  return 'none';
}
