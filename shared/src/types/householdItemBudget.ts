/**
 * Household item budget line types and interfaces.
 * Budget lines are nested under household items: /api/household-items/:householdItemId/budgets
 * Each budget line represents a cost estimate or allocation with its own
 * confidence level, optional vendor, budget category, and budget source.
 *
 * Household items differ from work items in that they have no invoices — all fields
 * like actualCost and invoiceCount are hardcoded to 0.
 */

import type {
  BaseBudgetLine,
  CreateBudgetLineRequest,
  UpdateBudgetLineRequest,
  SubsidyPaybackEntry,
} from './budget.js';

/**
 * A single budget line for a household item, including computed aggregate fields.
 * Unlike work items, household items have no invoices, so actualCost and invoiceCount are always 0.
 */
export interface HouseholdItemBudgetLine extends BaseBudgetLine {
  householdItemId: string;
}

/**
 * Request body for creating a new household item budget line.
 */
export type CreateHouseholdItemBudgetRequest = CreateBudgetLineRequest;

/**
 * Request body for updating a household item budget line.
 * All fields are optional; at least one must be provided.
 */
export type UpdateHouseholdItemBudgetRequest = UpdateBudgetLineRequest;

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
export type HouseholdItemSubsidyPaybackEntry = SubsidyPaybackEntry;

/**
 * Response for GET /api/household-items/:householdItemId/subsidy-payback.
 */
export interface HouseholdItemSubsidyPaybackResponse {
  householdItemId: string;
  minTotalPayback: number;
  maxTotalPayback: number;
  subsidies: HouseholdItemSubsidyPaybackEntry[];
}
