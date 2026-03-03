/**
 * Household item budget line types and interfaces.
 * Budget lines are nested under household items: /api/household-items/:householdItemId/budgets
 * Each budget line represents a cost estimate or allocation with its own
 * confidence level, optional vendor, budget category, and budget source.
 *
 * Household items differ from work items in that they have no invoices — all fields
 * like actualCost and invoiceCount are hardcoded to 0.
 */

import type { BudgetCategory } from './budgetCategory.js';
import type { UserSummary } from './workItem.js';
import type { ConfidenceLevel, BudgetSourceSummary, VendorSummary } from './workItemBudget.js';

/**
 * A single budget line for a household item, including computed aggregate fields.
 * Unlike work items, household items have no invoices, so actualCost and invoiceCount are always 0.
 */
export interface HouseholdItemBudgetLine {
  id: string;
  householdItemId: string;
  description: string | null;
  plannedAmount: number;
  confidence: ConfidenceLevel;
  /** Computed: margin factor from CONFIDENCE_MARGINS for the confidence level */
  confidenceMargin: number;
  budgetCategory: BudgetCategory | null;
  budgetSource: BudgetSourceSummary | null;
  vendor: VendorSummary | null;
  /** Always 0 for household items (no invoices) */
  actualCost: 0;
  /** Always 0 for household items (no invoices) */
  actualCostPaid: 0;
  /** Always 0 for household items (no invoices) */
  invoiceCount: 0;
  createdBy: UserSummary | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Request body for creating a new household item budget line.
 */
export interface CreateHouseholdItemBudgetRequest {
  description?: string | null;
  plannedAmount: number;
  confidence?: ConfidenceLevel;
  budgetCategoryId?: string | null;
  budgetSourceId?: string | null;
  vendorId?: string | null;
}

/**
 * Request body for updating a household item budget line.
 * All fields are optional; at least one must be provided.
 */
export interface UpdateHouseholdItemBudgetRequest {
  description?: string | null;
  plannedAmount?: number;
  confidence?: ConfidenceLevel;
  budgetCategoryId?: string | null;
  budgetSourceId?: string | null;
  vendorId?: string | null;
}

/**
 * Response for GET /api/household-items/:householdItemId/budgets.
 */
export interface HouseholdItemBudgetListResponse {
  budgets: HouseholdItemBudgetLine[];
}

/**
 * Response wrapper for single budget line endpoints (POST, PATCH).
 */
export interface HouseholdItemBudgetResponse {
  budget: HouseholdItemBudgetLine;
}

/**
 * Entry in a household item subsidy payback response.
 */
export interface HouseholdItemSubsidyPaybackEntry {
  subsidyProgramId: string;
  name: string;
  reductionType: 'percentage' | 'fixed';
  reductionValue: number;
  minPayback: number;
  maxPayback: number;
}

/**
 * Response for GET /api/household-items/:householdItemId/subsidy-payback.
 */
export interface HouseholdItemSubsidyPaybackResponse {
  householdItemId: string;
  minTotalPayback: number;
  maxTotalPayback: number;
  subsidies: HouseholdItemSubsidyPaybackEntry[];
}
