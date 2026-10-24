import type { TFunction } from 'i18next';
import type {
  ConfidenceLevel,
  CreateBudgetLineRequest,
  ExtractedLine,
  HouseholdItemBudgetLine,
  WorkItemBudgetLine,
} from '@cornerstone/shared';
import { foldSearchText } from '@cornerstone/shared';
import type { AiRowDataMap } from '../components/autoItemize/types.js';
import type { CostLineTarget } from '../components/CostLineTable/types.js';
import {
  blankGridRow,
  gridRowGross,
  isBlankRow,
  rowPlannedAmount,
} from '../components/CostLineForm/costLineGridModel.js';
import { numberToText, parseLocaleNumber } from '../components/CostLineForm/pasteRows.js';
import type { NumberLocale } from '../components/CostLineForm/pasteRows.js';
import type { CostLineGridRow } from '../components/CostLineForm/types.js';
import { ApiClientError } from './apiClient.js';
import { translateApiError } from './errorTranslation.js';
import { searchCompanies } from './vendorsApi.js';

/** A grid row for an extracted line: unit-priced when it has a quantity and a unit price, else one amount. */
export function rowFromExtractedLine(
  line: ExtractedLine,
  rowId: string,
  locale: NumberLocale,
): CostLineGridRow {
  const unitPriced = line.quantity != null && line.unitPrice != null;
  return {
    ...blankGridRow(rowId),
    description: line.description,
    quantity: unitPriced ? numberToText(line.quantity ?? 0, locale) : '',
    unit: unitPriced ? (line.unit ?? '') : '',
    unitPrice: numberToText(unitPriced ? (line.unitPrice ?? 0) : line.totalAmount, locale),
    includesVat: line.includesVat !== false,
    budgetCategoryId: line.budgetCategoryId ?? null,
    budgetSourceId: line.budgetSourceId ?? null,
    aiCertainty: line.confidence,
  };
}

/** Amount this row contributes to the itemized total (gross); 0 while the row is incomplete. */
export function effectiveRowAmount(
  row: CostLineGridRow,
  vatRate: number,
  locale: NumberLocale,
): number {
  const gross = gridRowGross(row, vatRate, locale);
  return Number.isFinite(gross) ? gross : 0;
}

/**
 * True when the row will create a NEW cost line (it is not linked to an existing one) (#2158).
 * The blank row at the end of the grid is not a line.
 */
export function isNewBudgetLineRow(row: CostLineGridRow): boolean {
  return row.existingLine === null && !isBlankRow(row);
}

/**
 * Apply a default funding source to every row that creates a new cost line (#2158, Option A).
 * Pure and non-mutating: rows linked to an existing line are returned unchanged (same reference).
 */
export function applyBudgetSourceToNewLines(
  rows: readonly CostLineGridRow[],
  sourceId: string,
): CostLineGridRow[] {
  return rows.map((row) =>
    row.existingLine === null ? { ...row, budgetSourceId: sourceId } : row,
  );
}

/** The task or purchase a row belongs to: its own pick, else Assign all to. */
export function rowTarget(
  row: CostLineGridRow,
  assignAll: CostLineTarget | null,
): CostLineTarget | null {
  return row.target ?? assignAll;
}

/** Basis of a line created from the document: the document type wins, else the extraction score. */
export function basisFor(
  documentType: string | null | undefined,
  certainty: number,
): ConfidenceLevel {
  if (documentType === 'Invoice') return 'invoice';
  if (documentType === 'Quotation') return 'quote';
  if (certainty >= 0.85) return 'invoice';
  if (certainty >= 0.6) return 'quote';
  if (certainty >= 0.3) return 'professional_estimate';
  return 'own_estimate';
}

export interface CommitContext {
  readonly assignAll: CostLineTarget | null;
  readonly locale: NumberLocale;
  readonly vatRate: number;
  /** Paperless document type ('Invoice', 'Quotation', …). */
  readonly documentType: string | null | undefined;
  /** The invoice-wide default funding source (#2158). */
  readonly defaultBudgetSourceId: string | null;
  readonly discretionarySourceId: string | null;
}

function certaintyOf(row: CostLineGridRow, data: AiRowDataMap): number {
  return data.get(row.rowId)?.extracted.confidence ?? row.aiCertainty ?? 1;
}

/** Builds the commit payload. Explicit field mapping — the server rejects unknown properties. */
export function buildCommitLines(
  rows: readonly CostLineGridRow[],
  data: AiRowDataMap,
  context: CommitContext,
): ExtractedLine[] {
  return rows.map((row) => {
    const extracted = data.get(row.rowId)?.extracted;
    const unitPriced = row.existingLine === null && row.quantity.trim() !== '';
    const price = parseLocaleNumber(row.unitPrice, context.locale).value ?? 0;
    const base: ExtractedLine = {
      description: row.description,
      quantity: unitPriced
        ? (parseLocaleNumber(row.quantity, context.locale).value ?? undefined)
        : undefined,
      unit: unitPriced && row.unit.trim() !== '' ? row.unit.trim() : undefined,
      unitPrice: unitPriced ? price : undefined,
      totalAmount: rowPlannedAmount(row, context.locale),
      includesVat: row.includesVat,
      vendorName: extracted?.vendorName,
      confidence: certaintyOf(row, data),
      category: extracted?.category,
      budgetCategoryId: row.budgetCategoryId,
      budgetSourceId: row.budgetSourceId || undefined,
    };
    if (row.existingLine) {
      return {
        ...base,
        // Description is not editable on a linked row and is ignored by the server in
        // assign-existing mode, but the schema requires a non-empty string.
        description: row.description.trim() || row.existingLine.description?.trim() || '—',
        // Linked rows keep the original cost line's category and source, so send neither.
        budgetCategoryId: undefined,
        budgetSourceId: undefined,
        quantity: undefined,
        unit: undefined,
        unitPrice: undefined,
        totalAmount: effectiveRowAmount(row, context.vatRate, context.locale),
        includesVat: true,
        assignedBudgetLineId: row.existingLine.id,
        assignedBudgetLineType: row.existingLine.type,
        assignmentMode: 'assign-existing' as const,
      };
    }
    return { ...base, assignmentMode: 'create-new' as const };
  });
}

type CreateFn = (
  itemId: string,
  data: CreateBudgetLineRequest,
) => Promise<WorkItemBudgetLine | HouseholdItemBudgetLine>;

interface MaterializeOk {
  ok: true;
  rows: CostLineGridRow[];
}

interface MaterializeErr {
  ok: false;
  error: string;
  /**
   * Partially-materialized rows up to (but not including) the row that failed. Callers MUST
   * write this back into page state so a retry does not re-create cost lines that were
   * already committed to the server during this attempt.
   */
  rows: CostLineGridRow[];
}

/**
 * Merge materialized (to-save-only) rows back into the full array by rowId, preserving the
 * excluded rows. Used to restore state after partial materialization on error, or after
 * successful materialization.
 */
export function mergeMaterializedRows(
  allRows: readonly CostLineGridRow[],
  materialized: readonly CostLineGridRow[],
): CostLineGridRow[] {
  const byRowId = new Map(materialized.map((row) => [row.rowId, row]));
  return allRows.map((row) => byRowId.get(row.rowId) ?? row);
}

/**
 * Resolve every row that has a task or purchase but no existing cost line into a real cost line
 * on that task or purchase before the final commit call. The financial fields come from the
 * LIVE row, so the created line always matches the row as the user sees it at save time. The row
 * then becomes a link to the line it created; the commit call creates the invoice link itself.
 */
export async function materializeNewRows(
  rows: readonly CostLineGridRow[],
  context: CommitContext,
  data: AiRowDataMap,
  create: { workItem: CreateFn; householdItem: CreateFn },
  i18n: { t: TFunction; tErrors: TFunction },
): Promise<MaterializeOk | MaterializeErr> {
  const { t, tErrors } = i18n;
  const result = [...rows];
  const companyIds = new Map<string, string | null>();

  const companyFor = async (name: string | undefined): Promise<string | null> => {
    if (!name) return null;
    if (companyIds.has(name)) return companyIds.get(name) ?? null;
    // Match the extracted company name on the server (folded equality).
    const wanted = foldSearchText(name);
    let id: string | null;
    try {
      const found = await searchCompanies(name);
      id = found.find((company) => foldSearchText(company.name) === wanted)?.id ?? null;
    } catch {
      id = null;
    }
    companyIds.set(name, id);
    return id;
  };

  for (let index = 0; index < result.length; index += 1) {
    const row = result[index]!;
    const target = rowTarget(row, context.assignAll);
    if (row.existingLine !== null || target === null) continue;

    const planned = rowPlannedAmount(row, context.locale);
    if (!Number.isFinite(planned) || planned < 0) {
      return { ok: false, error: t('autoItemize.inlineDraftInvalid'), rows: result };
    }
    const unitPriced = row.quantity.trim() !== '';
    const extracted = data.get(row.rowId)?.extracted;
    const payload: CreateBudgetLineRequest = {
      description: row.description.trim() || null,
      plannedAmount: planned,
      confidence: basisFor(context.documentType, certaintyOf(row, data)),
      budgetCategoryId: target.type === 'work_item' ? row.budgetCategoryId || null : null,
      budgetSourceId:
        row.budgetSourceId ||
        context.defaultBudgetSourceId ||
        context.discretionarySourceId ||
        null,
      vendorId: await companyFor(extracted?.vendorName),
      quantity: unitPriced ? parseLocaleNumber(row.quantity, context.locale).value : null,
      unit: unitPriced && row.unit.trim() !== '' ? row.unit.trim() : null,
      unitPrice: unitPriced ? parseLocaleNumber(row.unitPrice, context.locale).value : null,
      includesVat: row.includesVat,
    };

    try {
      const created = await (target.type === 'work_item' ? create.workItem : create.householdItem)(
        target.id,
        payload,
      );
      const gross = effectiveRowAmount(row, context.vatRate, context.locale);
      result[index] = {
        ...row,
        existingLine: {
          id: created.id,
          type: target.type,
          description: created.description,
          gross,
        },
        target,
        quantity: '',
        unit: '',
        unitPrice: numberToText(gross, context.locale),
      };
    } catch (err) {
      const error =
        err instanceof ApiClientError
          ? translateApiError(err.error.code, tErrors)
          : t('autoItemize.inlineDraftCreateFailed');
      return { ok: false, error, rows: result };
    }
  }

  return { ok: true, rows: result };
}
