/**
 * Budget source types and interfaces.
 * Budget sources represent financing sources for the construction project
 * (e.g., bank loans, credit lines, savings).
 */

import type { UserSummary } from './workItem.js';
import type { BaseBudgetLine } from './budget.js';
import type { AreaSummary } from './area.js';

/**
 * The type/category of a financing source.
 */
export type BudgetSourceType = 'bank_loan' | 'credit_line' | 'savings' | 'other' | 'discretionary';

/**
 * The current lifecycle status of a budget source.
 */
export type BudgetSourceStatus = 'active' | 'exhausted' | 'closed';

/**
 * Budget source entity as returned by the API.
 * usedAmount and availableAmount are computed from work item references.
 */
export interface BudgetSource {
  id: string;
  name: string;
  sourceType: BudgetSourceType;
  totalAmount: number;
  usedAmount: number; // planned allocation: SUM(planned_amount) of linked budget lines
  availableAmount: number; // totalAmount - usedAmount (planned perspective)
  claimedAmount: number; // actual drawdown: SUM(amount) of claimed invoices on linked budget lines
  unclaimedAmount: number; // paid but not claimed: SUM(amount) of paid invoices on linked budget lines
  paidAmount: number; // paid and claimed: claimedAmount + unclaimedAmount
  actualAvailableAmount: number; // totalAmount - claimedAmount (actual perspective)
  projectedAmount: number; // confidence-margined planned amount for non-invoiced lines + actual cost for invoiced
  projectedMinAmount: number; // lower bound: planned × (1 − margin) for non-invoiced + actual for invoiced
  projectedMaxAmount: number; // upper bound: planned × (1 + margin) for non-invoiced + actual for invoiced
  interestRate: number | null;
  terms: string | null;
  notes: string | null;
  status: BudgetSourceStatus;
  isDiscretionary: boolean;
  createdBy: UserSummary | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Request body for creating a new budget source.
 */
export interface CreateBudgetSourceRequest {
  name: string;
  sourceType: BudgetSourceType;
  totalAmount: number;
  interestRate?: number | null;
  terms?: string | null;
  notes?: string | null;
  status?: BudgetSourceStatus;
}

/**
 * Request body for updating a budget source.
 * All fields are optional; at least one must be provided.
 */
export interface UpdateBudgetSourceRequest {
  name?: string;
  sourceType?: BudgetSourceType;
  totalAmount?: number;
  interestRate?: number | null;
  terms?: string | null;
  notes?: string | null;
  status?: BudgetSourceStatus;
}

/**
 * Response for GET /api/budget-sources - list all sources.
 */
export interface BudgetSourceListResponse {
  budgetSources: BudgetSource[];
}

/**
 * Response for single-source endpoints (POST, GET by ID, PATCH).
 */
export interface BudgetSourceResponse {
  budgetSource: BudgetSource;
}

/**
 * A budget line with parent context, used in budget source detail responses.
 * Extends BaseBudgetLine with parent entity identification and area information.
 */
export interface BudgetSourceBudgetLine extends BaseBudgetLine {
  parentId: string;
  parentName: string;
  area: AreaSummary | null;
  hasClaimedInvoice: boolean;
}

/**
 * Response for GET /api/budget-sources/:sourceId/budget-lines
 * Groups budget lines by their parent entity type (work item vs household item).
 */
export interface BudgetSourceBudgetLinesResponse {
  workItemLines: BudgetSourceBudgetLine[];
  householdItemLines: BudgetSourceBudgetLine[];
}

/**
 * Request body for PATCH /api/budget-sources/:sourceId/budget-lines/move
 * Specifies which budget lines to move from the current source to a target source.
 */
export interface MoveBudgetLinesRequest {
  workItemBudgetIds: string[];
  householdItemBudgetIds: string[];
  targetSourceId: string;
}

/**
 * Response for PATCH /api/budget-sources/:sourceId/budget-lines/move
 * Indicates how many budget lines were successfully moved.
 */
export interface MoveBudgetLinesResponse {
  movedWorkItemLines: number;
  movedHouseholdItemLines: number;
}
