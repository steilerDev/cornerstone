import type { ConfidenceLevel, BaseBudgetLine } from '@cornerstone/shared';
import { CONFIDENCE_MARGINS } from '@cornerstone/shared';

// Re-export CONFIDENCE_MARGINS for convenience in client code
export { CONFIDENCE_MARGINS };

/**
 * Human-readable labels for confidence levels used in budget forms and displays.
 */
export const CONFIDENCE_LABELS: Record<ConfidenceLevel, string> = {
  own_estimate: 'Own Estimate',
  professional_estimate: 'Professional Estimate',
  quote: 'Quote',
  invoice: 'Invoice',
};

/**
 * Budget totals computed from a list of budget lines.
 * Used to display min/max range and actual cost summaries.
 */
export interface BudgetTotals {
  totalPlanned: number;
  totalActualCost: number;
  totalMinPlanned: number;
  totalMaxPlanned: number;
  hasPlannedRange: boolean;
}

/**
 * Computes aggregate budget totals from a list of budget lines.
 * Applies confidence margins to non-invoiced lines to compute min/max range.
 *
 * @param budgetLines - Array of budget line objects
 * @returns BudgetTotals object with planned, actual, and range values
 */
export function computeBudgetTotals(budgetLines: BaseBudgetLine[]): BudgetTotals {
  const totalPlanned = budgetLines.reduce((sum, b) => sum + b.plannedAmount, 0);
  const totalActualCost = budgetLines.reduce((sum, b) => sum + b.actualCost, 0);

  const totalMinPlanned = budgetLines.reduce((sum, b) => {
    const margin = CONFIDENCE_MARGINS[b.confidence] ?? 0;
    return sum + b.plannedAmount * (1 - margin);
  }, 0);

  const totalMaxPlanned = budgetLines.reduce((sum, b) => {
    const margin = CONFIDENCE_MARGINS[b.confidence] ?? 0;
    return sum + b.plannedAmount * (1 + margin);
  }, 0);

  const hasPlannedRange = Math.abs(totalMaxPlanned - totalMinPlanned) > 0.01;

  return { totalPlanned, totalActualCost, totalMinPlanned, totalMaxPlanned, hasPlannedRange };
}
