/**
 * Budget overview types for EPIC-05 Story 5.11 (rework).
 * Aggregated project-level budget data with confidence margins,
 * subsidy reductions, and four remaining-funds perspectives.
 */

export interface CategoryBudgetSummary {
  categoryId: string | null;
  categoryName: string;
  categoryColor: string | null;
  minPlanned: number; // invoiced lines use actualCost; non-invoiced use confidence margins
  maxPlanned: number; // invoiced lines use actualCost; non-invoiced use confidence margins
  projectedMin: number; // equals minPlanned (kept for API compatibility)
  projectedMax: number; // equals maxPlanned (kept for API compatibility)
  actualCost: number;
  actualCostPaid: number;
  actualCostClaimed: number;
  budgetLineCount: number;
}

export interface BudgetOverview {
  availableFunds: number; // SUM(active budget_sources.total_amount)
  sourceCount: number;

  minPlanned: number; // invoiced lines use actualCost; non-invoiced use confidence margins + subsidy reductions
  maxPlanned: number; // invoiced lines use actualCost; non-invoiced use confidence margins + subsidy reductions

  projectedMin: number; // equals minPlanned (kept for API compatibility)
  projectedMax: number; // equals maxPlanned (kept for API compatibility)

  actualCost: number; // all invoices linked to budget lines
  actualCostPaid: number; // paid + claimed invoices
  actualCostClaimed: number; // claimed invoices only

  remainingVsMinPlanned: number; // availableFunds - minPlanned
  remainingVsMaxPlanned: number; // availableFunds - maxPlanned
  remainingVsProjectedMin: number; // availableFunds - projectedMin
  remainingVsProjectedMax: number; // availableFunds - projectedMax
  remainingVsActualCost: number; // availableFunds - actualCost
  remainingVsActualPaid: number; // availableFunds - actualCostPaid
  remainingVsActualClaimed: number; // availableFunds - actualCostClaimed

  /** Payback-adjusted remaining vs min planned: availableFunds + minTotalPayback - minPlanned */
  remainingVsMinPlannedWithPayback: number;
  /** Payback-adjusted remaining vs max planned: availableFunds + maxTotalPayback - maxPlanned */
  remainingVsMaxPlannedWithPayback: number;

  categorySummaries: CategoryBudgetSummary[];

  subsidySummary: {
    totalReductions: number;
    activeSubsidyCount: number;
    /** Sum of min expected payback across all work items with linked subsidies */
    minTotalPayback: number;
    /** Sum of max expected payback across all work items with linked subsidies */
    maxTotalPayback: number;
  };
}

export interface BudgetOverviewResponse {
  overview: BudgetOverview;
}
