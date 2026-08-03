import type { TFunction } from 'i18next';
import type {
  WorkItemBudgetLine,
  HouseholdItemBudgetLine,
  CreateBudgetLineRequest,
} from '@cornerstone/shared';
import type { LineWithInclude } from '../components/autoItemize/types.js';
import { ApiClientError } from './apiClient.js';
import { translateApiError } from './errorTranslation.js';

type CreateFn = (
  itemId: string,
  data: CreateBudgetLineRequest,
) => Promise<WorkItemBudgetLine | HouseholdItemBudgetLine>;

interface MaterializeOk {
  ok: true;
  lines: LineWithInclude[];
}

interface MaterializeErr {
  ok: false;
  error: string;
  /**
   * Partially-materialized lines up to (but not including) the line that
   * failed. Callers MUST write this back into page state (`setLines`) so a
   * retry does not re-create budget lines that were already committed to the
   * server during this attempt.
   */
  lines: LineWithInclude[];
}

/**
 * Merge materialized (included-only) lines back into the full array by rowId,
 * preserving the included/excluded state of excluded rows. Used to restore state
 * after partial materialization on error, or after successful materialization.
 */
export function mergeMaterializedLines(
  allLines: LineWithInclude[],
  materializedIncluded: LineWithInclude[],
): LineWithInclude[] {
  const byRowId = new Map(materializedIncluded.map((l) => [l.rowId, l]));
  return allLines.map((l) => byRowId.get(l.rowId) ?? l);
}

/**
 * Resolve all queued inline-draft budget lines into real IDs before the final
 * autoItemize commit call.
 *
 * Financial fields (amount, includesVat, quantity, unit, unitPrice) are taken
 * from the LIVE line state so that the created budget line always matches the
 * invoice line item as the user sees it at save time — not the snapshot taken
 * when "New budget line" was clicked.
 *
 * Metadata (description, confidence, category, source, vendor) comes from the
 * inline draft form the user filled in.
 */
export async function materializeInlineDrafts(
  workingLines: LineWithInclude[],
  create: { workItem: CreateFn; householdItem: CreateFn },
  i18n: { t: TFunction; tErrors: TFunction },
): Promise<MaterializeOk | MaterializeErr> {
  const { t, tErrors } = i18n;
  const result = [...workingLines];

  for (let i = 0; i < result.length; i++) {
    const line = result[i]!;
    if (!line.inlineCreatedBudgetLineDraft || !line.assignedItemId || !line.assignedItemType) {
      continue;
    }

    const draft = line.inlineCreatedBudgetLineDraft;

    // Derive net base from the LIVE line state.
    // Unit pricing: quantity × unitPrice (if both set on the live line).
    // Direct pricing: totalAmount from the live line.
    const hasUnitPricing = line.quantity != null && line.unitPrice != null;
    let netBase: number;
    if (hasUnitPricing) {
      netBase = Math.round(line.quantity! * line.unitPrice! * 100) / 100;
    } else {
      netBase = line.totalAmount ?? 0;
    }

    if (!isFinite(netBase) || netBase < 0) {
      return { ok: false, error: t('autoItemize.inlineDraftInvalid'), lines: result };
    }

    // Financial fields from live line; metadata-only fields from draft form.
    const payload: CreateBudgetLineRequest = {
      description: draft.description.trim() || null,
      plannedAmount: netBase,
      confidence: draft.confidence,
      budgetCategoryId:
        line.assignedItemType === 'work_item' ? draft.budgetCategoryId || null : null,
      budgetSourceId: draft.budgetSourceId || null,
      vendorId: draft.vendorId || null,
      quantity: hasUnitPricing ? (line.quantity ?? null) : null,
      unit: hasUnitPricing ? (line.unit ?? null) : null,
      unitPrice: hasUnitPricing ? (line.unitPrice ?? null) : null,
      includesVat: line.includesVat, // live line state — NOT draft.includesVat
    };

    try {
      const createFn =
        line.assignedItemType === 'work_item' ? create.workItem : create.householdItem;
      const created = await createFn(line.assignedItemId, payload);

      // Convert to assign-existing. The downstream autoItemize/commit call
      // creates the invoice↔budget-line junction; do NOT link here too.
      result[i] = {
        ...line,
        assignedBudgetLineId: created.id,
        assignedBudgetLineType: line.assignedItemType,
        totalAmount: netBase, // live amount
        includesVat: line.includesVat, // live VAT flag
        inlineCreatedBudgetLineDraft: undefined,
        inlineHideConfidence: undefined,
        assignedItemId: undefined,
        assignedItemType: undefined,
      };
    } catch (err) {
      const errorMsg =
        err instanceof ApiClientError
          ? translateApiError(err.error.code, tErrors)
          : t('autoItemize.inlineDraftCreateFailed');
      return { ok: false, error: errorMsg, lines: result };
    }
  }

  return { ok: true, lines: result };
}
