import type { AttachmentType } from './document.js';
import type { BudgetSourceType } from './budgetSource.js';
import type { InvoiceStatus } from './invoice.js';

export type SourceReportType = 'budget-overview' | 'claim' | 'proof-of-funds';

/** A single Paperless-ngx document reference resolved for a report line. */
export interface SourceReportDocument {
  documentId: number;
  /** null if Paperless is unreachable/unconfigured — degrade to ID-only, never omit the doc. */
  archiveSerialNumber: number | null;
  title: string | null;
  attachmentType: AttachmentType | null;
}

/** One invoice's contribution to this source within the requested report's status slice. */
export interface SourceReportInvoice {
  invoiceId: string;
  vendorId: string;
  vendorName: string;
  invoiceNumber: string | null;
  date: string;
  status: InvoiceStatus;
  invoiceAmount: number;
  /** Net contribution to this source for the report's status slice, rounded to 2dp. Negative for refund-adjustment lines. */
  allocatedAmount: number;
  lineKind: 'invoice' | 'refund-adjustment';
  /** True iff this invoice's budget lines reference more than one distinct budget source. */
  isSplit: boolean;
  documents: SourceReportDocument[];
}

/** Informational row: matching-status invoice with zero budget lines (not itemized to any source). */
export interface SourceReportUnallocatedInvoice {
  invoiceId: string;
  vendorId: string;
  vendorName: string;
  invoiceNumber: string | null;
  date: string;
  status: InvoiceStatus;
  invoiceAmount: number;
}

export interface SourceReportSourceSummary {
  id: string;
  name: string;
  sourceType: BudgetSourceType;
  reference: string | null;
  contactAddress: string | null;
}

export interface SourceReportResponse {
  type: SourceReportType;
  source: SourceReportSourceSummary;
  invoices: SourceReportInvoice[];
  /** Sum of invoices[].allocatedAmount, computed from the already-rounded per-line values. */
  totalAmount: number;
  unallocatedInvoices: SourceReportUnallocatedInvoice[];
  generatedAt: string;
}

export interface MarkClaimedRequest {
  invoiceIds: string[];
}

export interface MarkClaimedResponse {
  claimedInvoiceIds: string[];
  claimedDepositIds: string[];
}
