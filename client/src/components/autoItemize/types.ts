import type { BudgetCategory, BudgetSourceSummary, ExtractedLine } from '@cornerstone/shared';
import type { BudgetLineFormState } from '../../hooks/useBudgetSection.js';

/** The linked budget line's ORIGINAL stored values — display only, never sent to the server. */
export interface AssignedBudgetLineSnapshot {
  plannedAmount: number;
  includesVat: boolean;
  budgetCategory: Pick<BudgetCategory, 'id' | 'name' | 'translationKey'> | null;
  budgetSource: Pick<BudgetSourceSummary, 'id' | 'name'> | null;
}

export interface LineWithInclude extends ExtractedLine {
  included: boolean;
  rowId: string;
  workItemBudgetId?: string | null;
  householdItemBudgetId?: string | null;
  assignedItemId?: string;
  assignedItemType?: 'work_item' | 'household_item';
  assignedBudgetLineId?: string;
  assignedBudgetLineType?: 'work_item' | 'household_item';
  assignedBudgetLineDescription?: string | null;
  assignedBudgetLineSnapshot?: AssignedBudgetLineSnapshot;
  /** Gross (VAT-effective) itemized amount for a linked row; committed verbatim as itemizedAmount. */
  linkedItemizedAmount?: number;
  createdFromExtraction?: boolean;
  inlineCreatedBudgetLineDraft?: BudgetLineFormState;
  inlineHideConfidence?: boolean;
  budgetCategoryId?: string | null;
  budgetSourceId?: string | null;
  mergeStatus?: 'pending' | 'error';
  mergeSourceLines?: LineWithInclude[];
}
