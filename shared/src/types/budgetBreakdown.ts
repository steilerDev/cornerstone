/**
 * Budget breakdown types for detailed cost breakdown by item and budget line.
 * Used by the expandable cost breakdown table on the budget dashboard.
 * EPIC-05 Story 5.13: New endpoint for itemized breakdown view.
 */

import type { ConfidenceLevel } from './workItemBudget.js';
import type { HouseholdItemCategory } from './householdItem.js';

/**
 * Cost display mode for an entity.
 * - 'actual': entity has all invoiced lines (display actualCost only)
 * - 'projected': entity has no invoiced lines (display projectedMin–projectedMax)
 * - 'mixed': entity has both invoiced and non-invoiced lines (display both)
 * - 'quoted': entity has quotation-status lines (display projectedMin–projectedMax separately)
 */
export type CostDisplay = 'actual' | 'projected' | 'mixed' | 'quoted';

/**
 * A single budget line within a breakdown item.
 * Simplified shape: includes only fields needed for the breakdown table.
 */
export interface BreakdownBudgetLine {
  id: string;
  description: string | null;
  plannedAmount: number;
  confidence: ConfidenceLevel;
  actualCost: number;
  hasInvoice: boolean;
  isQuotation: boolean;
}

/**
 * A single work item within a category breakdown.
 */
export interface BreakdownWorkItem {
  workItemId: string;
  title: string;
  projectedMin: number;
  projectedMax: number;
  actualCost: number;
  subsidyPayback: number;
  rawProjectedMin: number;
  rawProjectedMax: number;
  minSubsidyPayback: number;
  costDisplay: CostDisplay;
  budgetLines: BreakdownBudgetLine[];
}

/**
 * A work item category group within the breakdown.
 * Includes metadata about the budget category and aggregated totals.
 */
export interface BreakdownWorkItemCategory {
  categoryId: string | null;
  categoryName: string;
  categoryColor: string | null;
  projectedMin: number;
  projectedMax: number;
  actualCost: number;
  subsidyPayback: number;
  rawProjectedMin: number;
  rawProjectedMax: number;
  minSubsidyPayback: number;
  items: BreakdownWorkItem[];
}

/**
 * A single household item within a category breakdown.
 */
export interface BreakdownHouseholdItem {
  householdItemId: string;
  name: string;
  projectedMin: number;
  projectedMax: number;
  actualCost: number;
  subsidyPayback: number;
  rawProjectedMin: number;
  rawProjectedMax: number;
  minSubsidyPayback: number;
  costDisplay: CostDisplay;
  budgetLines: BreakdownBudgetLine[];
}

/**
 * A household item category group within the breakdown.
 * Uses the HouseholdItemCategory enum and includes aggregated totals.
 */
export interface BreakdownHouseholdItemCategory {
  hiCategory: HouseholdItemCategory;
  projectedMin: number;
  projectedMax: number;
  actualCost: number;
  subsidyPayback: number;
  rawProjectedMin: number;
  rawProjectedMax: number;
  minSubsidyPayback: number;
  items: BreakdownHouseholdItem[];
}

/**
 * Aggregated totals for a section (work items or household items).
 */
export interface BreakdownTotals {
  projectedMin: number;
  projectedMax: number;
  actualCost: number;
  subsidyPayback: number;
  rawProjectedMin: number;
  rawProjectedMax: number;
  minSubsidyPayback: number;
}

/**
 * Complete budget breakdown structure.
 */
export interface BudgetBreakdown {
  workItems: {
    categories: BreakdownWorkItemCategory[];
    totals: BreakdownTotals;
  };
  householdItems: {
    categories: BreakdownHouseholdItemCategory[];
    totals: BreakdownTotals;
  };
}

/**
 * Response wrapper for GET /api/budget/breakdown.
 */
export interface BudgetBreakdownResponse {
  breakdown: BudgetBreakdown;
}
