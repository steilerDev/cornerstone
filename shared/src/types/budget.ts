/**
 * Shared budget base types and interfaces.
 * This file consolidates common budget line types used across work items,
 * household items, and subsidy programs to reduce duplication.
 */

import type { BudgetCategory } from './budgetCategory.js';
import type { UserSummary, VendorSummary } from './workItem.js';

/**
 * Confidence level for a budget line estimate.
 * Determines the expected cost margin/buffer applied on top of the planned amount.
 */
export type ConfidenceLevel = 'own_estimate' | 'professional_estimate' | 'quote' | 'invoice';

/**
 * Cost margin factors for each confidence level.
 * Represents the expected overrun as a fraction of the planned amount.
 */
export const CONFIDENCE_MARGINS: Record<ConfidenceLevel, number> = {
  own_estimate: 0.2,
  professional_estimate: 0.1,
  quote: 0.05,
  invoice: 0.0,
};

/**
 * Budget source summary shape used in budget line responses.
 */
export interface BudgetSourceSummary {
  id: string;
  name: string;
  sourceType: string;
}

/**
 * Summary of a single invoice linked to a budget line.
 * Returned as part of BaseBudgetLine.invoiceLink when present.
 *
 * `vendorId` and `vendorName` are denormalized from the linked invoice's vendor
 * so the work-item view can render the vendor without an extra fetch.
 * `vendorName` may be null only if the underlying vendor row has no name.
 */
export interface BudgetLineInvoiceLink {
  invoiceBudgetLineId: string;
  invoiceId: string;
  invoiceNumber: string | null;
  invoiceDate: string;
  invoiceStatus: string;
  itemizedAmount: number;
  vendorId: string | null;
  vendorName: string | null;
}

/**
 * Summary of an invoice linked to a budget line.
 * Returned as part of WorkItemBudgetLine so the WorkItemDetailPage
 * can render an invoice popover without a separate API call.
 */
export interface InvoiceSummary {
  id: string;
  vendorId: string;
  vendorName: string | null;
  invoiceNumber: string | null;
  amount: number;
  date: string;
  status: string;
}

/**
 * Base budget line interface with all common fields.
 * Extended by WorkItemBudgetLine and HouseholdItemBudgetLine.
 */
export interface BaseBudgetLine {
  id: string;
  description: string | null;
  plannedAmount: number;
  confidence: ConfidenceLevel;
  /** Computed: margin factor from CONFIDENCE_MARGINS for the confidence level */
  confidenceMargin: number;
  budgetCategory: BudgetCategory | null;
  budgetSource: BudgetSourceSummary | null;
  vendor: VendorSummary | null;
  /** Origin of the budget line: 'manual' (user-created) or 'auto' (system-generated, e.g., from Paperless OCR) */
  origin?: 'manual' | 'auto';
  /**
   * Computed: sum of itemized amounts from all linked invoices regardless of
   * status — `draft`, `received`, `paid`, `claimed`, AND `quotation` are all
   * included. Represents the "committed/expected spend" against this line.
   *
   * Note: quotation-status invoices contribute their itemized amount as a point
   * estimate. Consumers that want to express the ±5% quotation uncertainty
   * should multiply by `CONFIDENCE_MARGINS.quote` (0.05) when
   * `invoiceLink.invoiceStatus === 'quotation'`.
   *
   * For "money actually out the door" semantics, use `actualCostPaid` instead.
   */
  actualCost: number;
  /** Computed: sum of paid+claimed contributions, including paid+claimed deposits within
   *  partially-paid invoices (proportional split by deposit amount / invoice amount).
   *  Excludes quotations (a quotation is never paid). */
  actualCostPaid: number;
  /** Computed: count of linked invoices */
  invoiceCount: number;
  /** The primary invoice link for this budget line (if linked to exactly one invoice). */
  invoiceLink: BudgetLineInvoiceLink | null;
  quantity: number | null;
  unit: string | null;
  unitPrice: number | null;
  includesVat: boolean;
  createdBy: UserSummary | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Returns the effective planned amount for display and aggregation.
 * When includesVat is explicitly false, the stored amount is net; multiply by (1 + vatRate).
 * null is treated as true (use as-is).
 * The vatRate parameter defaults to 0.19 (19%) to preserve existing callers that don't pass an explicit rate.
 */
export function effectivePlannedAmount(
  line: { plannedAmount: number; includesVat: boolean | null },
  vatRate: number = 0.19,
): number {
  return line.includesVat === false
    ? Math.round(line.plannedAmount * (1 + vatRate) * 100) / 100
    : line.plannedAmount;
}

/**
 * Returns the effective gross amount of an extracted line item for aggregation.
 * When includesVat is explicitly false, the stored amount is net; multiply by (1 + vatRate).
 * undefined/null/true are treated as gross (amount as-is).
 * This mirrors effectivePlannedAmount() but operates on the ExtractedLine shape
 * which uses { amount, includesVat } rather than { plannedAmount, includesVat }.
 * The vatRate parameter defaults to 0.19 (19%) to preserve existing callers that don't pass an explicit rate.
 */
export function effectiveLineAmount(
  line: { amount: number; includesVat?: boolean | null },
  vatRate: number = 0.19,
): number {
  return line.includesVat === false
    ? Math.round(line.amount * (1 + vatRate) * 100) / 100
    : line.amount;
}

/**
 * Request body for creating a new budget line.
 * Used for both work item and household item budgets.
 */
export interface CreateBudgetLineRequest {
  description?: string | null;
  plannedAmount: number;
  confidence?: ConfidenceLevel;
  budgetCategoryId?: string | null;
  budgetSourceId?: string | null;
  vendorId?: string | null;
  quantity?: number | null;
  unit?: string | null;
  unitPrice?: number | null;
  includesVat?: boolean;
}

/**
 * Request body for updating a budget line.
 * All fields are optional; at least one must be provided.
 * Used for both work item and household item budgets.
 * Supports optional cross-table parent move via newWorkItemId or newHouseholdItemId.
 */
export interface UpdateBudgetLineRequest {
  description?: string | null;
  plannedAmount?: number;
  confidence?: ConfidenceLevel;
  budgetCategoryId?: string | null;
  budgetSourceId?: string | null;
  vendorId?: string | null;
  quantity?: number | null;
  unit?: string | null;
  unitPrice?: number | null;
  includesVat?: boolean;
  // Move fields — provide to change parent; mutually exclusive
  newWorkItemId?: string | null;
  newHouseholdItemId?: string | null;
}

/**
 * Per-subsidy payback entry used in both work item and household item subsidy payback responses.
 * min and max reflect the confidence margin range for non-invoiced budget lines.
 * For fixed subsidies and fully-invoiced lines, minPayback === maxPayback.
 */
export interface SubsidyPaybackEntry {
  subsidyProgramId: string;
  name: string;
  reductionType: 'percentage' | 'fixed';
  reductionValue: number;
  /** Minimum expected payback (lower bound based on confidence margins). */
  minPayback: number;
  /** Maximum expected payback (upper bound based on confidence margins). */
  maxPayback: number;
}

/**
 * Aggregated budget metrics for a single entity.
 */
export interface BudgetAggregate {
  totalPlanned: number;
  totalActual: number;
  subsidyReduction: number;
  netCost: number;
}

/**
 * Summary statistics for all budget lines of an entity.
 */
export interface BudgetSummary {
  budgetLineCount: number;
  totalPlannedAmount: number;
  budgetSummary: BudgetAggregate;
}
