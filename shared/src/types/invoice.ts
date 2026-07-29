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
 * Invoice payment status.
 * EPIC-05 Story 5.9: replaced 'overdue' with 'claimed'.
 * 'quotation' represents a formal quote (not yet an actual cost).
 */
export type InvoiceStatus = 'pending' | 'paid' | 'claimed' | 'quotation';

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
  /** Deposits: staged partial payments for this invoice. */
  deposits: InvoiceDeposit[];
  /** Final payment amount: invoice total minus sum of all deposit amounts (any status). */
  finalPaymentAmount: number;
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
