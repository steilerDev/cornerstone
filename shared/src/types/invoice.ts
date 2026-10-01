/**
 * Invoice types and interfaces.
 * Invoices track payments to vendors for construction work.
 * Invoices are nested under vendors: /api/vendors/:vendorId/invoices
 * EPIC-15 Story 15.1: Invoices now support M:N relationships with budget lines via junction table.
 */

import type { PaginationMeta } from './pagination.js';
import type { UserSummary } from './workItem.js';
import type { InvoiceBudgetLineSummary } from './invoiceBudgetLine.js';
import type { FilterMeta } from './filterMeta.js';

/**
 * Runtime source of truth for the union — add new members here; the i18n parity guard in `client/src/i18n/unionKeys.test.ts` then requires a locale key (#2029).
 */
export const INVOICE_STATUSES = ['pending', 'paid', 'claimed', 'quotation'] as const;

/**
 * Invoice payment status.
 * EPIC-05 Story 5.9: replaced 'overdue' with 'claimed'.
 * 'quotation' represents a formal quote (not yet an actual cost).
 */
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

/**
 * Deposit status within an invoice: pending, paid, or claimed.
 */
export type InvoiceDepositStatus = 'pending' | 'paid' | 'claimed';

/**
 * Deposit entry type: either a regular deposit or a refund.
 * Story #1876: Refunds enable negative claim adjustments.
 */
export type InvoiceDepositEntryType = 'deposit' | 'refund';

/**
 * Invoice deposit entity - represents a staged partial payment within an invoice.
 * Story #1891: budgetSourceId links deposit directly to a source (optional).
 */
export interface InvoiceDeposit {
  id: string;
  invoiceId: string;
  amount: number;
  dueDate: string;
  paidDate: string | null;
  claimedDate: string | null;
  description: string | null;
  status: InvoiceDepositStatus;
  entryType: InvoiceDepositEntryType;
  budgetSourceId: string | null;
  createdBy: UserSummary | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Request body for creating a new invoice deposit.
 */
export interface CreateDepositRequest {
  amount: number;
  dueDate: string;
  description?: string | null;
  status?: InvoiceDepositStatus;
  entryType?: InvoiceDepositEntryType; // default 'deposit'; immutable after creation
  paidDate?: string | null;
  claimedDate?: string | null;
  budgetSourceId?: string | null;
}

/**
 * Request body for updating an invoice deposit.
 */
export interface UpdateDepositRequest {
  amount?: number;
  dueDate?: string;
  description?: string | null;
  status?: InvoiceDepositStatus;
  paidDate?: string | null;
  claimedDate?: string | null;
  budgetSourceId?: string | null;
}

/**
 * Invoice entity as returned by the API.
 */
export interface Invoice {
  id: string;
  vendorId: string;
  vendorName: string;
  invoiceNumber: string | null;
  amount: number;
  date: string;
  dueDate: string | null;
  status: InvoiceStatus;
  notes: string | null;
  /** Invoice budget lines: itemized allocations of this invoice to work item/household item budgets. */
  budgetLines: InvoiceBudgetLineSummary[];
  /** Remaining amount: invoice total minus sum of itemized amounts across budget lines. */
  remainingAmount: number;
  /**
   * Deposits: staged partial payments for this invoice.
   * On GET /api/invoices (list): populated only when `openOnly=true`, otherwise always `[]`.
   * On all other endpoints (detail, vendor-scoped list): always populated.
   */
  deposits: InvoiceDeposit[];
  /** Final payment amount: invoice total minus sum of all deposit amounts (any status). */
  finalPaymentAmount: number;
  /**
   * Story #2046: per-invoice open (still-payable) amount:
   *   (status === 'pending' ? max(0, amount − Σ deposit-type entries of ANY status) : 0)
   *   + Σ (pending deposit-type entries)
   * Pending refunds are EXCLUDED (reported separately via summary.refundsDue).
   * Additive to — never a replacement for — finalPaymentAmount.
   * Only populated by GET /api/invoices when openOnly=true; undefined everywhere else.
   */
  openAmount?: number;
  createdBy: UserSummary | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Request body for creating a new invoice.
 * Budget line itemization is managed via separate POST /api/invoices/:id/budget-lines endpoint.
 */
export interface CreateInvoiceRequest {
  invoiceNumber?: string | null;
  amount: number;
  date: string;
  dueDate?: string | null;
  status?: InvoiceStatus;
  notes?: string | null;
}

/**
 * Request body for updating an invoice.
 * All fields are optional; at least one must be provided.
 * Budget line itemization is managed via separate PATCH endpoint.
 * vendorId allows reassigning the invoice to a different vendor.
 */
export interface UpdateInvoiceRequest {
  invoiceNumber?: string | null;
  amount?: number;
  date?: string;
  dueDate?: string | null;
  status?: InvoiceStatus;
  notes?: string | null;
  vendorId?: string;
}

/**
 * Response for GET /api/vendors/:vendorId/invoices.
 * Invoices are not paginated (a vendor typically has fewer than ~50 invoices).
 */
export interface InvoiceListResponse {
  invoices: Invoice[];
}

/**
 * Response wrapper for single-invoice endpoints (POST, PATCH).
 */
export interface InvoiceResponse {
  invoice: Invoice;
}

/** Story #2107: target status when converting a quotation into the final invoice. */
export type ConvertQuotationTargetStatus = 'pending' | 'paid';

/** Story #2107: new itemizedAmount for one existing invoice budget line (junction row id). */
export interface ConvertQuotationLineUpdate {
  /** invoice_budget_lines.id (InvoiceBudgetLineSummary.id), must belong to the invoice. */
  id: string;
  /** > 0, major units. */
  itemizedAmount: number;
}

/**
 * Story #2107: POST /api/invoices/:invoiceId/convert-quotation.
 * Converts a status='quotation' invoice in place, atomically.
 */
export interface ConvertQuotationRequest {
  amount: number; // > 0
  date: string; // YYYY-MM-DD
  invoiceNumber?: string | null; // omitted = keep, null = clear; max 100
  dueDate?: string | null; // omitted = keep, null = clear; >= date
  /** Final user notes. Omitted = keep existing notes; null = clear. conversionNote is appended. */
  notes?: string | null;
  status: ConvertQuotationTargetStatus;
  /** Localized history line composed by the client; appended to notes. 1..1000 chars after trim. */
  conversionNote: string;
  /** Lines to re-amount. Omitted/empty = keep existing itemization. Lines not listed are unchanged. */
  budgetLines?: ConvertQuotationLineUpdate[];
  /** Optional Paperless document to link with attachmentType='invoice'. */
  paperlessDocumentId?: number;
}

/**
 * Summary stats for invoices of a given status.
 */
export interface InvoiceStatusSummary {
  count: number;
  totalAmount: number;
}

/**
 * Breakdown of all invoices grouped by status (counts + totals).
 */
export interface InvoiceStatusBreakdown {
  pending: InvoiceStatusSummary;
  paid: InvoiceStatusSummary;
  claimed: InvoiceStatusSummary;
  quotation: InvoiceStatusSummary;
  overdue: InvoiceStatusSummary;
  /** Pending + paid amounts excluding portions funded by discretionary sources */
  claimable: InvoiceStatusSummary;
  /** Sum of paid/claimed deposits on quotation invoices (i.e., already committed) */
  quotationCoveredByDeposits: number;
  /**
   * Story #2046 (AC16): global, filter-independent open payable total.
   * totalAmount = Σ Invoice.openAmount over ALL invoices.
   * count = number of invoices whose openAmount > 0.
   */
  openPayable: InvoiceStatusSummary;
  /**
   * Story #2046 (AC19): pending refund entries, reported separately and NEVER
   * netted into openPayable.
   * totalAmount = Σ amount of pending refund-type entries (POSITIVE number).
   * count = number of distinct invoices carrying at least one pending refund.
   */
  refundsDue: InvoiceStatusSummary;
}

/**
 * Response for GET /api/invoices (paginated, cross-vendor listing).
 */
export interface InvoiceListPaginatedResponse {
  invoices: Invoice[];
  pagination: PaginationMeta;
  summary: InvoiceStatusBreakdown;
  filterMeta?: FilterMeta;
}

/**
 * Response for GET /api/invoices/:id (single invoice detail).
 */
export interface InvoiceDetailResponse {
  invoice: Invoice;
}
