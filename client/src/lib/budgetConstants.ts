import type { BaseBudgetLine } from '@cornerstone/shared';
import {
  CONFIDENCE_MARGINS,
  effectivePlannedAmount,
  effectiveLineAmount,
} from '@cornerstone/shared';

// Re-export for convenience in client code
export { CONFIDENCE_MARGINS, effectivePlannedAmount, effectiveLineAmount };

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
  allInvoiced: boolean;
}

/**
 * Computes aggregate budget totals from a list of budget lines.
 * Applies confidence margins to lines without an offer or invoice to compute the min/max range.
 * A linked line counts its itemized amount at face value (ADR-039 §2): no spread for offers.
 *
 * @param budgetLines - Array of budget line objects
 * @param vatRate - VAT rate as a fraction (e.g. 0.19), from LocaleContext
 * @returns BudgetTotals object with planned, actual, and range values
 */
export function computeBudgetTotals(budgetLines: BaseBudgetLine[], vatRate: number): BudgetTotals {
  const totalPlanned = budgetLines.reduce((sum, b) => sum + effectivePlannedAmount(b, vatRate), 0);
  const totalActualCost = budgetLines.reduce((sum, b) => sum + b.actualCost, 0);

  const totalMinPlanned = budgetLines.reduce((sum, b) => {
    if (b.invoiceCount > 0) return sum + b.actualCost;
    const margin = CONFIDENCE_MARGINS[b.confidence];
    return sum + effectivePlannedAmount(b, vatRate) * (1 - margin);
  }, 0);

  const totalMaxPlanned = budgetLines.reduce((sum, b) => {
    if (b.invoiceCount > 0) return sum + b.actualCost;
    const margin = CONFIDENCE_MARGINS[b.confidence];
    return sum + effectivePlannedAmount(b, vatRate) * (1 + margin);
  }, 0);

  const hasPlannedRange = Math.abs(totalMaxPlanned - totalMinPlanned) > 0.01;
  const allInvoiced = budgetLines.length > 0 && budgetLines.every((b) => b.invoiceCount > 0);

  return {
    totalPlanned,
    totalActualCost,
    totalMinPlanned,
    totalMaxPlanned,
    hasPlannedRange,
    allInvoiced,
  };
}
