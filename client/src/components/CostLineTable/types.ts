import type { AreaSummary, ConfidenceLevel, InvoiceStatus } from '@cornerstone/shared';
import type { CostLineState } from './costLineState.js';

export type CostLineItemType = 'work_item' | 'household_item';

/** The task or purchase a cost line belongs to. */
export interface CostLineTarget {
  readonly type: CostLineItemType;
  readonly id: string;
  readonly label: string;
  readonly area?: AreaSummary | null;
}

/** The record whose cost lines are shown. */
export type CostLineHost =
  | { readonly kind: 'work_item'; readonly id: string; readonly label: string }
  | { readonly kind: 'household_item'; readonly id: string; readonly label: string }
  | {
      readonly kind: 'invoice';
      readonly id: string;
      /** Header text of the record, e.g. "‹company› · ‹number›" (used in dialog titles). */
      readonly label: string;
      readonly status: InvoiceStatus;
      readonly amount: number;
      readonly vendorId: string;
    };

export type CostLineTableMode = 'item' | 'document';

/** One cost line as displayed. Money in major units. */
export interface CostLineRow {
  /** Budget line id (work_item_budgets / household_item_budgets). */
  readonly id: string;
  readonly lineType: CostLineItemType;
  readonly invoiceBudgetLineId: string | null;
  readonly invoiceId: string | null;
  readonly invoiceStatus: InvoiceStatus | null;
  readonly invoiceNumber: string | null;
  readonly invoiceDate: string | null;
  /** Company of the linked offer/invoice (item-mode group heading). */
  readonly invoiceVendorName: string | null;
  readonly state: CostLineState;
  readonly basis: ConfidenceLevel;
  /** Fraction (0.2 = ±20%); 0 when linked. */
  readonly margin: number;
  readonly description: string | null;
  readonly quantity: number | null;
  readonly unit: string | null;
  readonly unitPrice: number | null;
  readonly includesVat: boolean;
  /** As stored (net when includesVat is false). */
  readonly plannedAmount: number;
  readonly plannedGross: number;
  /** Linked: itemized amount (face value). Unlinked: plannedGross. */
  readonly gross: number;
  readonly net: number;
  /** Linked and plannedGross differs from gross by >= 0.01 (D5). */
  readonly estimateDiffers: boolean;
  /** null = not assigned (orphan line, document mode only). */
  readonly target: CostLineTarget | null;
  readonly categoryId: string | null;
  readonly categoryName: string | null;
  readonly categoryTranslationKey: string | null;
  readonly budgetSourceId: string | null;
  readonly budgetSourceName: string | null;
  readonly vendorId: string | null;
  readonly vendorName: string | null;
}

export type CostLineGroupHeading =
  | { readonly kind: 'estimates' }
  | {
      readonly kind: 'document';
      readonly invoiceId: string;
      readonly invoiceStatus: InvoiceStatus;
      readonly invoiceNumber: string | null;
      readonly invoiceDate: string | null;
      readonly vendorName: string | null;
    };

export interface CostLineGroup {
  readonly id: string;
  /** null = no heading (document mode). */
  readonly heading: CostLineGroupHeading | null;
  readonly rows: readonly CostLineRow[];
  readonly total: number;
  readonly plannedTotal: number;
}
