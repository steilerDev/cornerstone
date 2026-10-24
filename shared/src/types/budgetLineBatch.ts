import type { CreateBudgetLineRequest } from './budget.js';

/** A new cost line on a task or purchase. */
export interface BatchBudgetLineCreate extends CreateBudgetLineRequest {
  kind: 'create';
  targetType: 'work_item' | 'household_item';
  targetId: string;
  /** Required: the server applies no discretionary-source fallback. */
  budgetSourceId: string;
}

/** Link an existing, unlinked cost line (requires invoiceId). */
export interface BatchBudgetLineLink {
  kind: 'link';
  budgetLineType: 'work_item' | 'household_item';
  budgetLineId: string;
  /** Gross amount of this line on the offer/invoice; > 0. */
  itemizedAmount: number;
}

export type BatchBudgetLineInput = BatchBudgetLineCreate | BatchBudgetLineLink;

export interface BatchCreateBudgetLinesRequest {
  /** When set, every created line is linked to this offer/invoice (itemized = its gross amount). */
  invoiceId?: string;
  /** 1..200 entries, processed in order. */
  lines: BatchBudgetLineInput[];
}

export interface BatchCreatedBudgetLine {
  index: number;
  budgetLineId: string;
  budgetLineType: 'work_item' | 'household_item';
  invoiceBudgetLineId: string | null;
}

export interface BatchCreateBudgetLinesResponse {
  lines: BatchCreatedBudgetLine[];
  /** Invoice amount minus all itemized amounts after the batch; null without invoiceId. */
  remainingAmount: number | null;
}
