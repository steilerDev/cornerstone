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
  budgetSourceId: string | null;
}

/**
 * A single work item within an area breakdown.
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
 * A hierarchical area node within the breakdown, containing work items and child areas.
 */
export interface BreakdownArea<TItem> {
  areaId: string | null; // null = synthetic "Unassigned" bucket
  name: string;
  parentId: string | null; // null = root node
  color: string | null;
  projectedMin: number; // rolled-up across subtree
  projectedMax: number;
  actualCost: number;
  subsidyPayback: number;
  rawProjectedMin: number;
  rawProjectedMax: number;
  minSubsidyPayback: number;
  items: TItem[]; // items directly assigned to this area
  children: BreakdownArea<TItem>[]; // pre-pruned child nodes
}

/**
 * A single household item within an area breakdown.
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
 * A subsidy adjustment row for the cost breakdown table.
 * Displayed when a subsidy's uncapped payback exceeds its maximumAmount cap.
 */
export interface SubsidyAdjustment {
  subsidyProgramId: string;
  name: string;
  maximumAmount: number;
  maxPayout: number;
  minExcess: number;
  maxExcess: number;
}

/**
 * Per-source aggregate for the budget breakdown response.
 * projectedMin/Max are perspective-dependent totals for lines assigned to this source.
 * The frontend computes allocatedCost at the active perspective and derives remaining.
 */
export interface BudgetSourceSummaryBreakdown {
  id: string;
  name: string;
  totalAmount: number;
  projectedMin: number;
  projectedMax: number;
}

/**
 * Complete budget breakdown structure.
 */
export interface BudgetBreakdown {
  workItems: {
    areas: BreakdownArea<BreakdownWorkItem>[];
    totals: BreakdownTotals;
  };
  householdItems: {
    areas: BreakdownArea<BreakdownHouseholdItem>[];
    totals: BreakdownTotals;
  };
  subsidyAdjustments: SubsidyAdjustment[];
  budgetSources: BudgetSourceSummaryBreakdown[];
}

/**
 * Response wrapper for GET /api/budget/breakdown.
 */
export interface BudgetBreakdownResponse {
  breakdown: BudgetBreakdown;
}
