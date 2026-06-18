import type { ExtractedLine } from '@cornerstone/shared';
import type { BudgetLineFormState } from '../../hooks/useBudgetSection.js';

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
  createdFromExtraction?: boolean;
  inlineCreatedBudgetLineDraft?: BudgetLineFormState;
  inlineHideConfidence?: boolean;
  budgetCategoryId?: string | null;
  budgetSourceId?: string | null;
}
