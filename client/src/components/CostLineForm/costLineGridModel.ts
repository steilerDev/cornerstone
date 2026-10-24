import type { BatchBudgetLineInput, InvoiceStatus } from '@cornerstone/shared';
import { effectivePlannedAmount } from '@cornerstone/shared';
import type { ApiClientError } from '../../lib/apiClient.js';
import { roundMoney } from '../../lib/money.js';
import type { CostLineTarget } from '../CostLineTable/types.js';
import { DESCRIPTION_MAX_LENGTH } from './costLineValues.js';
import { parseLocaleNumber } from './pasteRows.js';
import type { NumberLocale } from './pasteRows.js';
import type {
  CostLineGridField,
  CostLineGridOptions,
  CostLineGridRow,
  CostLineGridRowErrors,
} from './types.js';

/** Values a new blank row starts with (Entered as for all, Assign all to, kept category). */
export interface BlankRowDefaults {
  readonly includesVat?: boolean;
  readonly target?: CostLineTarget | null;
  readonly budgetCategoryId?: string | null;
  readonly budgetSourceId?: string | null;
}

let rowCounter = 0;

/** A grid row id, unique across every grid in the app. */
export function nextRowId(): string {
  rowCounter += 1;
  return `row-${rowCounter}`;
}

export function blankGridRow(rowId: string, defaults: BlankRowDefaults = {}): CostLineGridRow {
  return {
    rowId,
    description: '',
    quantity: '',
    unit: '',
    unitPrice: '',
    includesVat: defaults.includesVat ?? false,
    target: defaults.target ?? null,
    existingLine: null,
    budgetCategoryId: defaults.budgetCategoryId ?? null,
    budgetSourceId: defaults.budgetSourceId ?? null,
    included: true,
  };
}

/** A row with nothing typed (a picked target or category alone does not count). */
export function isBlankRow(row: CostLineGridRow): boolean {
  return (
    row.description.trim() === '' &&
    row.quantity.trim() === '' &&
    row.unit.trim() === '' &&
    row.unitPrice.trim() === '' &&
    row.existingLine === null &&
    row.notice === undefined &&
    row.aiCertainty === undefined
  );
}

/** Exactly one blank row at the end: appended when missing, extra ones dropped. */
export function withTrailingBlank(
  rows: readonly CostLineGridRow[],
  makeId: () => string,
  defaults: BlankRowDefaults = {},
): CostLineGridRow[] {
  const next = [...rows];
  while (
    next.length > 1 &&
    isBlankRow(next[next.length - 1]!) &&
    isBlankRow(next[next.length - 2]!)
  ) {
    next.pop();
  }
  const last = next[next.length - 1];
  if (last === undefined || !isBlankRow(last)) next.push(blankGridRow(makeId(), defaults));
  return next;
}

/** The rows that become cost lines: not blank and, with Include toggles, included. */
export function rowsToSave(
  rows: readonly CostLineGridRow[],
  options: Pick<CostLineGridOptions, 'include'>,
): CostLineGridRow[] {
  return rows.filter((row) => !isBlankRow(row) && (!options.include || row.included));
}

/** A copy of a row for Duplicate: same fields, no link to an existing line, no AI data. */
export function duplicateRow(row: CostLineGridRow, rowId: string): CostLineGridRow {
  return {
    ...row,
    rowId,
    existingLine: null,
    notice: undefined,
    aiCertainty: undefined,
    included: true,
  };
}

function parsed(text: string, locale: NumberLocale): number {
  const value = parseLocaleNumber(text, locale).value;
  return value ?? Number.NaN;
}

/** Plain amount of a row as entered (quantity × unit price, or the single amount). */
export function rowPlannedAmount(row: CostLineGridRow, locale: NumberLocale): number {
  const price = parsed(row.unitPrice, locale);
  if (row.existingLine !== null || row.quantity.trim() === '') return price;
  return roundMoney(parsed(row.quantity, locale) * price);
}

/**
 * Gross of a row (NaN while incomplete). A blank quantity means a line without unit pricing, where
 * the Unit price cell is the single amount (D15); a row linked to an existing line shows its gross.
 */
export function gridRowGross(row: CostLineGridRow, vatRate: number, locale: NumberLocale): number {
  const planned = rowPlannedAmount(row, locale);
  const includesVat = row.existingLine !== null ? true : row.includesVat;
  return roundMoney(effectivePlannedAmount({ plannedAmount: planned, includesVat }, vatRate));
}

export interface GridValidationMessages {
  readonly description: string;
  readonly quantity: string;
  readonly unitPrice: string;
  readonly number: string;
  readonly amountPositive: string;
  readonly belongsTo: string;
}

/** Validation of the rows that would be saved; blank and excluded rows are skipped. */
export function validateGridRows(
  rows: readonly CostLineGridRow[],
  options: CostLineGridOptions,
  assignAll: CostLineTarget | null,
  context: { readonly locale: NumberLocale; readonly vatRate: number },
  messages: GridValidationMessages,
): Map<string, CostLineGridRowErrors> {
  const result = new Map<string, CostLineGridRowErrors>();
  for (const row of rowsToSave(rows, options)) {
    if (row.notice !== undefined) continue;
    const errors: Partial<Record<CostLineGridField, string>> = {};
    const linked = row.existingLine !== null;
    if (
      !linked &&
      (row.description.trim() === '' || row.description.length > DESCRIPTION_MAX_LENGTH)
    ) {
      errors.description = messages.description;
    }
    if (!linked && row.quantity.trim() !== '') {
      const quantity = parseLocaleNumber(row.quantity, context.locale).value;
      errors.quantity =
        quantity === null ? messages.number : quantity > 0 ? undefined : messages.quantity;
    }
    const price = parseLocaleNumber(row.unitPrice, context.locale).value;
    if (row.unitPrice.trim() === '') errors.unitPrice = messages.unitPrice;
    else if (price === null) errors.unitPrice = messages.number;
    else if (price < 0) errors.unitPrice = messages.unitPrice;
    else if (options.positiveGross && !(gridRowGross(row, context.vatRate, context.locale) > 0)) {
      errors.unitPrice = messages.amountPositive;
    }
    if (options.requireTarget && !linked && row.target === null && assignAll === null) {
      errors.target = messages.belongsTo;
    }
    const kept = Object.fromEntries(
      Object.entries(errors).filter(([, text]) => text !== undefined),
    );
    if (Object.keys(kept).length > 0) result.set(row.rowId, kept);
  }
  return result;
}

export interface BatchContext {
  readonly assignAll: CostLineTarget | null;
  /** The record the rows belong to when the grid has no Belongs to column (a task or purchase). */
  readonly fallbackTarget: CostLineTarget | null;
  /** Status of the offer or invoice the lines are linked to; none = estimates on a task or purchase. */
  readonly documentStatus: InvoiceStatus | null;
  readonly discretionarySourceId: string | null;
  readonly locale: NumberLocale;
  readonly vatRate: number;
}

export interface BatchBuild {
  readonly lines: BatchBudgetLineInput[];
  /** rowIds[i] is the grid row that became lines[i] (server errors carry the line index). */
  readonly rowIds: string[];
}

/** Rows to batch entries. Validation requires a target first; a row without one throws. */
export function buildBatch(rows: readonly CostLineGridRow[], context: BatchContext): BatchBuild {
  const lines: BatchBudgetLineInput[] = [];
  const rowIds: string[] = [];
  for (const row of rows) {
    const gross = gridRowGross(row, context.vatRate, context.locale);
    if (row.existingLine !== null) {
      lines.push({
        kind: 'link',
        budgetLineType: row.existingLine.type,
        budgetLineId: row.existingLine.id,
        itemizedAmount: gross,
      });
      rowIds.push(row.rowId);
      continue;
    }
    const target = row.target ?? context.assignAll ?? context.fallbackTarget;
    if (target === null)
      throw new Error('buildBatch: a row has no target; validate before building');
    const unitPriced = row.quantity.trim() !== '';
    const price = parsed(row.unitPrice, context.locale);
    const unit = row.unit.trim();
    lines.push({
      kind: 'create',
      targetType: target.type,
      targetId: target.id,
      description: row.description.trim(),
      plannedAmount: rowPlannedAmount(row, context.locale),
      quantity: unitPriced ? parsed(row.quantity, context.locale) : null,
      unit: unitPriced && unit !== '' ? unit : null,
      unitPrice: unitPriced ? price : null,
      includesVat: row.includesVat,
      confidence:
        context.documentStatus === null
          ? 'own_estimate'
          : context.documentStatus === 'quotation'
            ? 'quote'
            : 'invoice',
      budgetCategoryId: row.budgetCategoryId,
      budgetSourceId: row.budgetSourceId || context.discretionarySourceId || '',
    });
    rowIds.push(row.rowId);
  }
  return { lines, rowIds };
}

export interface ServerErrorMessages {
  readonly description: string;
  readonly quantity: string;
  readonly unitPrice: string;
  readonly belongsTo: string;
  readonly overInvoice: string;
  readonly alreadyLinked: string;
}

const FIELD_BY_PATH: Record<string, CostLineGridField> = {
  description: 'description',
  quantity: 'quantity',
  unitPrice: 'unitPrice',
  plannedAmount: 'unitPrice',
  itemizedAmount: 'unitPrice',
  targetId: 'target',
  targetType: 'target',
};

function fieldMessage(field: CostLineGridField, messages: ServerErrorMessages): string {
  if (field === 'description') return messages.description;
  if (field === 'quantity') return messages.quantity;
  if (field === 'target') return messages.belongsTo;
  return messages.unitPrice;
}

/**
 * Cell errors from a failed batch request. Field paths are `/lines/<i>/<field>`; service errors carry
 * `details.index`. Messages are always our own translated text, never the server's.
 * `unmapped` is true when some error could not be placed on a row (the banner then speaks for it).
 */
export function mapServerErrors(
  error: ApiClientError,
  rowIds: readonly string[],
  messages: ServerErrorMessages,
): { errors: Map<string, CostLineGridRowErrors>; unmapped: boolean } {
  const errors = new Map<string, CostLineGridRowErrors>();
  let unmapped = false;
  const add = (index: number, field: CostLineGridField, text: string) => {
    const rowId = rowIds[index];
    if (rowId === undefined) {
      unmapped = true;
      return;
    }
    errors.set(rowId, { ...errors.get(rowId), [field]: text });
  };
  const details = error.error.details;
  const fields = details?.fields;
  if (Array.isArray(fields)) {
    for (const entry of fields) {
      const path =
        typeof entry === 'object' && entry !== null ? (entry as { path?: unknown }).path : null;
      const match = typeof path === 'string' ? /^\/lines\/(\d+)(?:\/(\w+))?$/.exec(path) : null;
      const field = match?.[2] ? FIELD_BY_PATH[match[2]] : undefined;
      if (match && field) add(Number(match[1]), field, fieldMessage(field, messages));
      else unmapped = true;
    }
  } else if (typeof details?.index === 'number') {
    const code = error.error.code;
    if (code === 'ITEMIZED_SUM_EXCEEDS_INVOICE')
      add(details.index, 'unitPrice', messages.overInvoice);
    else if (code === 'BUDGET_LINE_ALREADY_LINKED')
      add(details.index, 'unitPrice', messages.alreadyLinked);
    else if (code === 'NOT_FOUND') add(details.index, 'target', messages.belongsTo);
    else unmapped = true;
  } else {
    unmapped = true;
  }
  return { errors, unmapped };
}
