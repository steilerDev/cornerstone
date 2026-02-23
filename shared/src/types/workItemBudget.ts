/**
 * Work item budget line types and interfaces.
 * Budget lines are nested under work items: /api/work-items/:workItemId/budgets
 * Each budget line represents a cost estimate or allocation with its own
 * confidence level, optional vendor, budget category, and budget source.
 */

import type { BudgetCategory } from './budgetCategory.js';
import type { UserSummary } from './workItem.js';

/**
 * Confidence level for a budget line estimate.
 * Determines the expected cost margin/buffer applied on top of the planned amount.
 */
export type ConfidenceLevel = 'own_estimate' | 'professional_estimate' | 'quote' | 'invoice';

/**
 * Cost margin factors for each confidence level.
 * Represents the expected overrun as a fraction of the planned amount.
 */
export const CONFIDENCE_MARGINS: Record<ConfidenceLevel, number> = {
  own_estimate: 0.2,
  professional_estimate: 0.1,
  quote: 0.05,
  invoice: 0.0,
};

/**
 * Budget source summary shape used in budget line responses.
 */
export interface BudgetSourceSummary {
  id: string;
  name: string;
  sourceType: string;
}

/**
 * Vendor summary shape used in budget line responses.
 */
export interface VendorSummary {
  id: string;
  name: string;
  specialty: string | null;
}

/**
 * Summary of an invoice linked to a budget line.
 * Returned as part of WorkItemBudgetLine so the WorkItemDetailPage
 * can render an invoice popover without a separate API call.
 */
export interface InvoiceSummary {
  id: string;
  vendorId: string;
  vendorName: string | null;
  invoiceNumber: string | null;
  amount: number;
  date: string;
  status: string;
}

/**
 * A single budget line for a work item, including computed aggregate fields
 * derived from linked invoices.
 */
export interface WorkItemBudgetLine {
  id: string;
  workItemId: string;
  description: string | null;
  plannedAmount: number;
  confidence: ConfidenceLevel;
  /** Computed: margin factor from CONFIDENCE_MARGINS for the confidence level */
  confidenceMargin: number;
  budgetCategory: BudgetCategory | null;
  budgetSource: BudgetSourceSummary | null;
  vendor: VendorSummary | null;
  /** Computed: sum of all linked invoices (any status) */
  actualCost: number;
  /** Computed: sum of linked invoices with status 'paid' or 'claimed' */
  actualCostPaid: number;
  /** Computed: count of linked invoices */
  invoiceCount: number;
  /** Individual invoices linked to this budget line, ordered by date descending. */
  invoices: InvoiceSummary[];
  createdBy: UserSummary | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Request body for creating a new work item budget line.
 */
export interface CreateWorkItemBudgetRequest {
  description?: string | null;
  plannedAmount: number;
  confidence?: ConfidenceLevel;
  budgetCategoryId?: string | null;
  budgetSourceId?: string | null;
  vendorId?: string | null;
}

/**
 * Request body for updating a work item budget line.
 * All fields are optional; at least one must be provided.
 */
export interface UpdateWorkItemBudgetRequest {
  description?: string | null;
  plannedAmount?: number;
  confidence?: ConfidenceLevel;
  budgetCategoryId?: string | null;
  budgetSourceId?: string | null;
  vendorId?: string | null;
}

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
