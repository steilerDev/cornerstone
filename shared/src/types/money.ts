/**
 * Money service types (ADR-039, #2228).
 *
 * Every figure in the app that answers "how much" comes from the one money service on the
 * server. Amounts are major currency units at the API boundary; the server computes in integer
 * cents internally.
 */

import type { BudgetVerdict } from './budgetOverview.js';
import type { BudgetSourceStatus, BudgetSourceType } from './budgetSource.js';
import type { SubsidyApplicationStatus, SubsidyReductionType } from './subsidyProgram.js';

/** Item types of a cost line. Runtime source of truth for the union. */
export const MONEY_ITEM_TYPES = ['work_items', 'household_items'] as const;
export type MoneyItemType = (typeof MONEY_ITEM_TYPES)[number];

/** A money figure in the three scenarios (ADR-039 §2). Fields name scenarios, not an order. */
export interface MoneyRange {
  expected: number;
  best: number;
  worst: number;
}

export interface LeftToSpend extends MoneyRange {
  /** Strict rule: over_budget iff expected < 0; null without an active funding source or a cost. */
  verdict: BudgetVerdict | null;
}

export interface NotYetSplit {
  amount: number;
  recordCount: number;
}

export interface ReadyToSubmit {
  count: number;
  amount: number;
}

export interface MoneyRecordTotals {
  count: number;
  amount: number;
  paid: number;
  stillToPay: number;
}

export interface MoneyOfferTotals extends MoneyRecordTotals {
  remainingOnOffer: number;
}

export interface MoneyCostFigures {
  expectedCost: MoneyRange;
  expectedGrants: MoneyRange;
  afterGrants: MoneyRange;
}

export interface MoneyAreaFigures extends MoneyCostFigures {
  /** null = items without an area and orphan lines */
  areaId: string | null;
}

export interface MoneySourceFigures {
  id: string;
  name: string;
  sourceType: BudgetSourceType;
  status: BudgetSourceStatus;
  isDiscretionary: boolean;
  amount: number;
  allocated: number;
  unallocated: number;
  overAllocated: number;
  paid: number;
  submitted: number;
  readyToSubmit: ReadyToSubmit;
}

export interface MoneyGrantFigures {
  id: string;
  name: string;
  /** never 'rejected' */
  status: SubsidyApplicationStatus;
  reductionType: SubsidyReductionType;
  /** reduction_value: percent for 'percentage', amount per linked item for legacy 'fixed' */
  rate: number;
  /** maximum_amount: eligible-costs cap (percentage) / payout cap (fixed) */
  eligibleCostCap: number | null;
  eligibleItemCount: number;
  eligibleCost: MoneyRange;
  uncappedPayout: MoneyRange;
  expected: MoneyRange;
  capped: boolean;
  /** true for approved / received */
  counted: boolean;
}

export interface MoneySummary {
  leftToSpend: LeftToSpend;
  fundingTotal: number;
  activeSourceCount: number;
  expectedCost: MoneyRange;
  expectedGrants: MoneyRange;
  possibleGrants: MoneyRange;
  afterGrants: MoneyRange;
  paid: number;
  stillToPay: number;
  /**
   * Number of records (invoices and offers) with something still to pay. Equals the Invoices page
   * "Open payable" card count (`computeOpenAmounts(...).openPayable.count`).
   */
  stillToPayCount: number;
  notYetPaid: MoneyRange;
  notYetSplit: NotYetSplit;
  readyToSubmit: ReadyToSubmit;
  records: { offers: MoneyOfferTotals; invoices: MoneyRecordTotals };
  sources: MoneySourceFigures[];
  grants: MoneyGrantFigures[];
  byType: Record<MoneyItemType, MoneyCostFigures>;
  byArea: MoneyAreaFigures[];
}

/** Unfiltered per-item money of the breakdown (same run as MoneySummary). */
export interface BreakdownMoney {
  /** keyed by work item id; every work item with at least one line */
  workItems: Record<string, MoneyCostFigures>;
  /** keyed by household item id; every household item with at least one line */
  householdItems: Record<string, MoneyCostFigures>;
  /** work-item lines without a work item (ADR-030) */
  orphanLines: MoneyCostFigures;
  notYetSplit: NotYetSplit;
}

/**
 * One funding source of the Financing page (#2242): the money service's source figures plus the
 * interest rate. Same entry as `MoneySummary.sources`.
 */
export interface FinancingSource extends MoneySourceFigures {
  interestRate: number | null;
}

/** One grant of the Financing page (#2242): every grant, rejected ones included. */
export interface FinancingGrant {
  id: string;
  name: string;
  /** all statuses, rejected included */
  status: SubsidyApplicationStatus;
  reductionType: SubsidyReductionType;
  /** reduction_value: percent for 'percentage', legacy fixed amount for 'fixed' */
  rate: number;
  /** maximum_amount */
  eligibleCostCap: number | null;
  /** application_deadline (YYYY-MM-DD) */
  deadline: string | null;
  /** linked tasks plus linked purchases (link tables) */
  coveredItemCount: number;
  /** engine payout; the zero range for a rejected grant */
  expected: MoneyRange;
  /** true for approved / received */
  counted: boolean;
}

/** Response for GET /api/budget/financing. */
export interface FinancingResponse {
  sources: FinancingSource[];
  grants: FinancingGrant[];
}

/** Money of one grant (detail response of GET /api/subsidy-programs/:id). */
export interface GrantMoney {
  expected: MoneyRange;
  eligibleCost: MoneyRange;
  capped: boolean;
  counted: boolean;
  coveredItemCount: number;
}
