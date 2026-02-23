/**
 * Invoice types and interfaces.
 * Invoices track payments to vendors for construction work.
 * Invoices are nested under vendors: /api/vendors/:vendorId/invoices
 */

import type { PaginationMeta } from './pagination.js';
import type { UserSummary } from './workItem.js';

/**
 * Invoice payment status.
 * EPIC-05 Story 5.9: replaced 'overdue' with 'claimed'.
 */
export type InvoiceStatus = 'pending' | 'paid' | 'claimed';

/**
 * Invoice entity as returned by the API.
 */
export interface Invoice {
  id: string;
  vendorId: string;
  vendorName: string;
  /** Optional link to the work item budget line this invoice was issued against. */
  workItemBudgetId: string | null;
  invoiceNumber: string | null;
  amount: number;
  date: string;
  dueDate: string | null;
  status: InvoiceStatus;
  notes: string | null;
  createdBy: UserSummary | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Request body for creating a new invoice.
 */
export interface CreateInvoiceRequest {
  invoiceNumber?: string | null;
  amount: number;
  date: string;
  dueDate?: string | null;
  status?: InvoiceStatus;
  notes?: string | null;
  workItemBudgetId?: string | null;
}

/**
 * Request body for updating an invoice.
 * All fields are optional; at least one must be provided.
 */
export interface UpdateInvoiceRequest {
  invoiceNumber?: string | null;
  amount?: number;
  date?: string;
  dueDate?: string | null;
  status?: InvoiceStatus;
  notes?: string | null;
  workItemBudgetId?: string | null;
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
 * Summary of all invoices grouped by status.
 */
export interface InvoiceSummary {
  pending: InvoiceStatusSummary;
  paid: InvoiceStatusSummary;
  claimed: InvoiceStatusSummary;
}

/**
 * Response for GET /api/invoices (paginated, cross-vendor listing).
 */
export interface InvoiceListPaginatedResponse {
  invoices: Invoice[];
  pagination: PaginationMeta;
  summary: InvoiceSummary;
}

/**
 * Response for GET /api/invoices/:id (single invoice detail).
 */
export interface InvoiceDetailResponse {
  invoice: Invoice;
}
