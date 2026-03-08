/**
 * Shared budget base types and interfaces.
 * This file consolidates common budget line types used across work items,
 * household items, and subsidy programs to reduce duplication.
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
 * Base budget line interface with all common fields.
 * Extended by WorkItemBudgetLine and HouseholdItemBudgetLine.
 */
export interface BaseBudgetLine {
  id: string;
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
  createdBy: UserSummary | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Request body for creating a new budget line.
 * Used for both work item and household item budgets.
 */
export interface CreateBudgetLineRequest {
  description?: string | null;
  plannedAmount: number;
  confidence?: ConfidenceLevel;
  budgetCategoryId?: string | null;
  budgetSourceId?: string | null;
  vendorId?: string | null;
}

/**
 * Request body for updating a budget line.
 * All fields are optional; at least one must be provided.
 * Used for both work item and household item budgets.
 */
export interface UpdateBudgetLineRequest {
  description?: string | null;
  plannedAmount?: number;
  confidence?: ConfidenceLevel;
  budgetCategoryId?: string | null;
  budgetSourceId?: string | null;
  vendorId?: string | null;
}

/**
 * Per-subsidy payback entry used in both work item and household item subsidy payback responses.
 * min and max reflect the confidence margin range for non-invoiced budget lines.
 * For fixed subsidies and fully-invoiced lines, minPayback === maxPayback.
 */
export interface SubsidyPaybackEntry {
  subsidyProgramId: string;
  name: string;
  reductionType: 'percentage' | 'fixed';
  reductionValue: number;
  /** Minimum expected payback (lower bound based on confidence margins). */
  minPayback: number;
  /** Maximum expected payback (upper bound based on confidence margins). */
  maxPayback: number;
}

/**
 * Aggregated budget metrics for a single entity.
 */
export interface BudgetAggregate {
  totalPlanned: number;
  totalActual: number;
  subsidyReduction: number;
  netCost: number;
}

/**
 * Summary statistics for all budget lines of an entity.
 */
export interface BudgetSummary {
  budgetLineCount: number;
  totalPlannedAmount: number;
  budgetSummary: BudgetAggregate;
}
