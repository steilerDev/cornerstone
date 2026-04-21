/**
 * Invoice budget line types and interfaces.
 * EPIC-15 Story 15.1: Junction table linking invoices to work item/household item budget lines.
 *
 * An invoice can be split across multiple budget allocations.
 * Each invoice_budget_line record represents one itemized amount against a specific budget line.
 */

import type { ConfidenceLevel } from './budget.js';
import type { AreaSummary } from './area.js';

/**
 * Invoice budget line entity as returned by the API.
 */
export interface InvoiceBudgetLine {
  id: string;
  invoiceId: string;
  /** Link to work item budget line (mutually exclusive with householdItemBudgetId). */
  workItemBudgetId: string | null;
  /** Link to household item budget line (mutually exclusive with workItemBudgetId). */
  householdItemBudgetId: string | null;
  /** The amount itemized to this budget line (part of the total invoice amount). */
  itemizedAmount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Request body for creating a new invoice budget line.
 */
export interface CreateInvoiceBudgetLineRequest {
  invoiceId: string;
  workItemBudgetId?: string | null;
  householdItemBudgetId?: string | null;
  itemizedAmount: number;
}

/**
 * Request body for updating an invoice budget line.
 * All fields are optional; at least one must be provided.
 */
export interface UpdateInvoiceBudgetLineRequest {
  workItemBudgetId?: string | null;
  householdItemBudgetId?: string | null;
  itemizedAmount?: number;
}

/**
 * Response wrapper for single invoice budget line endpoints.
 */
export interface InvoiceBudgetLineResponse {
  invoiceBudgetLine: InvoiceBudgetLine;
}

/**
 * Response for list endpoints.
 */
export interface InvoiceBudgetLineListResponse {
  invoiceBudgetLines: InvoiceBudgetLine[];
}

/**
 * Summary of a budget line linked to an invoice (nested in Invoice response).
 * Includes the budget line description, category, and confidence level.
 */
export interface InvoiceBudgetLineSummary {
  id: string;
  /** Budget line ID (work_item_budget_id or household_item_budget_id). */
  budgetLineId: string;
  /** Budget line type: 'work_item' or 'household_item'. */
  budgetLineType: 'work_item' | 'household_item';
  /** Name of the work item or household item. */
  itemName: string;
  /** Budget line description. */
  budgetLineDescription: string | null;
  /** Budget category name. */
  categoryName: string | null;
  /** Budget category color. */
  categoryColor: string | null;
  /** Budget category translation key. */
  categoryTranslationKey: string | null;
  /** Planned amount on the budget line. */
  plannedAmount: number;
  /** Confidence level of the estimate. */
  confidence: ConfidenceLevel;
  /** The amount itemized to this invoice budget line. */
  itemizedAmount: number;
}

/**
 * Detailed invoice budget line response (GET /api/invoices/:invoiceId/budget-lines).
 * Includes full details of the linked budget line and its parent item.
 */
export interface InvoiceBudgetLineDetailResponse {
  id: string;
  invoiceId: string;
  workItemBudgetId: string | null;
  householdItemBudgetId: string | null;
  itemizedAmount: number;
  budgetLineDescription: string | null;
  plannedAmount: number;
  confidence: ConfidenceLevel;
  categoryId: string | null;
  categoryName: string | null;
  categoryColor: string | null;
  categoryTranslationKey: string | null;
  parentItemId: string;
  parentItemTitle: string;
  parentItemType: 'work_item' | 'household_item';
  parentItemArea: AreaSummary | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Response wrapper for creating an invoice budget line.
 * Includes the created line and updated remaining amount.
 */
export interface InvoiceBudgetLineCreateResponse {
  budgetLine: InvoiceBudgetLineDetailResponse;
  remainingAmount: number;
}

/**
 * Response for listing invoice budget lines for a specific invoice.
 * Includes all lines and the remaining unallocated amount.
 */
export interface InvoiceBudgetLineListDetailResponse {
  budgetLines: InvoiceBudgetLineDetailResponse[];
  remainingAmount: number;
}
