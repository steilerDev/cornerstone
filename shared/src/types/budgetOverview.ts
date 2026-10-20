/**
 * Budget overview types for EPIC-05 Story 5.11 (rework).
 * Aggregated project-level budget data with confidence margins,
 * subsidy reductions, and four remaining-funds perspectives.
 */

import type { MoneySummary } from './money.js';

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

  /**
   * Payback-adjusted remaining vs min planned: availableFunds + minTotalPayback - minPlanned.
   * Grant-derived: payback comes from the money service (ADR-039).
   */
  remainingVsMinPlannedWithPayback: number;
  /** Payback-adjusted remaining vs max planned: availableFunds + maxTotalPayback - maxPlanned */
  remainingVsMaxPlannedWithPayback: number;

  subsidySummary: {
    /** Derived from the money service (ADR-039): counted (approved/received) grants, expected scenario. */
    totalReductions: number;
    activeSubsidyCount: number;
    /** Derived from the money service (ADR-039): counted grants in the best scenario. */
    minTotalPayback: number;
    /** Derived from the money service (ADR-039): counted grants in the worst scenario. */
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
  /** The one money service's figures (ADR-039). */
  money: MoneySummary;
}
