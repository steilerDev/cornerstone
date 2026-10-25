/**
 * Budget overview types. The project-level figures come from the money service (`money`, ADR-039);
 * `overview` carries only the grant summary (#2237).
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
