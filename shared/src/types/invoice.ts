/**
 * Invoice types and interfaces.
 * Invoices track payments to vendors for construction work.
 * Invoices are nested under vendors: /api/vendors/:vendorId/invoices
 */

import type { UserSummary } from './workItem.js';

/**
 * Invoice payment status.
 * EPIC-05 Story 5.9: replaced 'overdue' with 'claimed'.
 */
export type InvoiceStatus = 'pending' | 'paid' | 'claimed';

/**
 * Summary of the work item budget line linked to an invoice.
 * Returned as part of the Invoice response to allow the client to
 * pre-populate the "Link to Work Item" dropdown in the edit modal.
 */
export interface WorkItemBudgetSummary {
  id: string;
  workItemId: string;
  workItemTitle: string;
  description: string | null;
  plannedAmount: number;
  confidence: string;
}

/**
 * Invoice entity as returned by the API.
 */
export interface Invoice {
  id: string;
  vendorId: string;
  /** Optional link to the work item budget line this invoice was issued against. */
  workItemBudgetId: string | null;
  /** Enriched budget line + work item details when workItemBudgetId is set. */
  workItemBudget: WorkItemBudgetSummary | null;
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
