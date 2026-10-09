/**
 * Budget overview types for EPIC-05 Story 5.11 (rework).
 * Aggregated project-level budget data with confidence margins,
 * subsidy reductions, and four remaining-funds perspectives.
 */

/**
 * Budget verdict of "Left to spend" (ADR-039 §4, strict rule): over_budget when the expected
 * figure is below zero, otherwise on_budget; null (no verdict) is not a member. There is no
 * 'tight' verdict.
 * Runtime source of truth for the union — add new members here; the i18n parity guard in `client/src/i18n/unionKeys.test.ts` then requires a locale key (#2029).
 */
export const BUDGET_VERDICTS = ['on_budget', 'over_budget'] as const;

/** The budget verdict of "Left to spend". */
export type BudgetVerdict = (typeof BUDGET_VERDICTS)[number];

export interface BudgetOverview {
  availableFunds: number; // SUM(active budget_sources.total_amount)
  sourceCount: number;

  minPlanned: number; // invoiced lines use actualCost; non-invoiced use confidence margins + subsidy reductions
  maxPlanned: number; // invoiced lines use actualCost; non-invoiced use confidence margins + subsidy reductions

  actualCost: number; // all invoices linked to budget lines
  actualCostPaid: number; // paid + claimed invoices
  actualCostClaimed: number; // claimed invoices only

  remainingVsMinPlanned: number; // availableFunds - minPlanned
  remainingVsMaxPlanned: number; // availableFunds - maxPlanned
  remainingVsActualCost: number; // availableFunds - actualCost
  remainingVsActualPaid: number; // availableFunds - actualCostPaid
  remainingVsActualClaimed: number; // availableFunds - actualCostClaimed

  /** Payback-adjusted remaining vs min planned: availableFunds + minTotalPayback - minPlanned */
  remainingVsMinPlannedWithPayback: number;
  /** Payback-adjusted remaining vs max planned: availableFunds + maxTotalPayback - maxPlanned */
  remainingVsMaxPlannedWithPayback: number;

  subsidySummary: {
    totalReductions: number;
    activeSubsidyCount: number;
    /** Sum of min expected payback across all work items with linked subsidies */
    minTotalPayback: number;
    /** Sum of max expected payback across all work items with linked subsidies */
    maxTotalPayback: number;
    /** Subsidies whose uncapped payback exceeds their maximumAmount cap */
    oversubscribedSubsidies: OversubscribedSubsidy[];
  };
}

export interface OversubscribedSubsidy {
  subsidyProgramId: string;
  name: string;
  maximumAmount: number;
  maxPayout: number;
  uncappedMinPayback: number;
  uncappedMaxPayback: number;
  minExcess: number;
  maxExcess: number;
}

export interface BudgetOverviewResponse {
  overview: BudgetOverview;
}
