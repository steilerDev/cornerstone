/**
 * Budget overview types for EPIC-05 Story 5.11 (rework).
 * Aggregated project-level budget data with confidence margins,
 * subsidy reductions, and four remaining-funds perspectives.
 */

export interface CategoryBudgetSummary {
  categoryId: string | null;
  categoryName: string;
  categoryColor: string | null;
  minPlanned: number;
  maxPlanned: number;
  projectedMin: number; // blended: invoiced lines use actualCost, non-invoiced use minPlanned
  projectedMax: number; // blended: invoiced lines use actualCost, non-invoiced use maxPlanned
  actualCost: number;
  actualCostPaid: number;
  budgetLineCount: number;
}

export interface BudgetOverview {
  availableFunds: number; // SUM(active budget_sources.total_amount)
  sourceCount: number;

  minPlanned: number; // with confidence margins and subsidy reductions
  maxPlanned: number;

  projectedMin: number; // blended: invoiced lines use actualCost, non-invoiced use minPlanned
  projectedMax: number; // blended: invoiced lines use actualCost, non-invoiced use maxPlanned

  actualCost: number; // all invoices linked to budget lines
  actualCostPaid: number; // paid invoices only

  remainingVsMinPlanned: number; // availableFunds - minPlanned
  remainingVsMaxPlanned: number; // availableFunds - maxPlanned
  remainingVsProjectedMin: number; // availableFunds - projectedMin
  remainingVsProjectedMax: number; // availableFunds - projectedMax
  remainingVsActualCost: number; // availableFunds - actualCost
  remainingVsActualPaid: number; // availableFunds - actualCostPaid

  categorySummaries: CategoryBudgetSummary[];

  subsidySummary: {
    totalReductions: number;
    activeSubsidyCount: number;
  };
}

export interface BudgetOverviewResponse {
  overview: BudgetOverview;
}
