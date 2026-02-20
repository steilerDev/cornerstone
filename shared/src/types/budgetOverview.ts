/**
 * Budget overview types for EPIC-05 Story #148.
 * Aggregated project-level budget data for the dashboard.
 */

export interface CategoryBudgetSummary {
  categoryId: string;
  categoryName: string;
  categoryColor: string | null;
  plannedBudget: number;
  actualCost: number;
  variance: number; // planned - actual (positive = under budget)
  workItemCount: number;
}

export interface BudgetOverview {
  totalPlannedBudget: number;
  totalActualCost: number;
  totalVariance: number;
  categorySummaries: CategoryBudgetSummary[];
  financingSummary: {
    totalAvailable: number;
    totalUsed: number;
    totalRemaining: number;
    sourceCount: number;
  };
  vendorSummary: {
    totalPaid: number;
    totalOutstanding: number;
    vendorCount: number;
  };
  subsidySummary: {
    totalReductions: number;
    activeSubsidyCount: number;
  };
}

export interface BudgetOverviewResponse {
  overview: BudgetOverview;
}
