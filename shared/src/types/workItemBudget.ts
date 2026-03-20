/**
 * Work item budget line types and interfaces.
 * Budget lines are nested under work items: /api/work-items/:workItemId/budgets
 * Each budget line represents a cost estimate or allocation with its own
 * confidence level, optional vendor, budget category, and budget source.
 */

export type {
  ConfidenceLevel,
  BudgetSourceSummary,
  InvoiceSummary,
  BaseBudgetLine,
  CreateBudgetLineRequest,
  UpdateBudgetLineRequest,
} from './budget.js';
export { CONFIDENCE_MARGINS } from './budget.js';

import type { BaseBudgetLine, CreateBudgetLineRequest, UpdateBudgetLineRequest } from './budget.js';

/**
 * A single budget line for a work item, including computed aggregate fields
 * derived from linked invoices.
 */
export interface WorkItemBudgetLine extends BaseBudgetLine {
  workItemId: string;
}

/**
 * Request body for creating a new work item budget line.
 */
export type CreateWorkItemBudgetRequest = CreateBudgetLineRequest;

/**
 * Request body for updating a work item budget line.
 * All fields are optional; at least one must be provided.
 */
export type UpdateWorkItemBudgetRequest = UpdateBudgetLineRequest;

/**
 * Response for GET /api/work-items/:workItemId/budgets.
 */
export interface WorkItemBudgetListResponse {
  budgets: WorkItemBudgetLine[];
}

/**
 * Response wrapper for single budget line endpoints (POST, PATCH).
 */
export interface WorkItemBudgetResponse {
  budget: WorkItemBudgetLine;
}
