/**
 * Invoice types and interfaces.
 * Invoices track payments to vendors for construction work.
 * Invoices are nested under vendors: /api/vendors/:vendorId/invoices
 */

import type { UserSummary } from './workItem.js';

/**
 * Invoice payment status.
 */
export type InvoiceStatus = 'pending' | 'paid' | 'overdue';

/**
 * Invoice entity as returned by the API.
 */
export interface Invoice {
  id: string;
  vendorId: string;
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
