import type { AttachmentType } from './document.js';
import type { BudgetSourceType } from './budgetSource.js';
import type { InvoiceStatus, InvoiceDepositStatus, InvoiceDepositEntryType } from './invoice.js';

export type SourceReportType = 'budget-overview' | 'claim' | 'proof-of-funds';

/** Linked item (work item or household item) associated with a budget line. */
export interface SourceReportLinkedItem {
  type: 'work_item' | 'household_item';
  id: string;
  name: string;
  areaId: string | null;
  areaName: string | null;
}

/** Budget line subtraction row: allocatedPortion is subtraction-only, never independently summed. */
export interface SourceReportBudgetLine {
  id: string;
  description: string | null;
  allocatedPortion: number;
  linkedItem: SourceReportLinkedItem | null;
}

/** Informational deposit row: never summed, filtered server-side to untagged-or-this-source only. */
export interface SourceReportDeposit {
  id: string;
  amount: number;
  status: InvoiceDepositStatus;
  entryType: InvoiceDepositEntryType;
  dueDate: string;
  paidDate: string | null;
  claimedDate: string | null;
  budgetSourceId: string | null;
}

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
  /** True iff the invoice's funding spans 2+ distinct budget sources across budget lines and tagged deposits. */
  isSplit: boolean;
  documents: SourceReportDocument[];
  /** Budget lines allocated to this invoice for the requested source only. Other sources' lines are absent (not present with zero portion). Used as a subtraction basis for line-exclusion math. */
  budgetLines: SourceReportBudgetLine[];
  /** Deposit rows: all deposits for this invoice, filtered to untagged-or-this-source only. */
  deposits: SourceReportDeposit[];
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
  sourceId: string;
  invoiceIds: string[];
  depositIds: string[];
}

export interface MarkClaimedResponse {
  claimedInvoiceIds: string[];
  claimedDepositIds: string[];
}

/** Request to generate AI-assisted report content. Story #1901. */
export interface GenerateReportContentRequest {
  type: SourceReportType;
  sourceId: string;
  language: 'en' | 'de';
  includedInvoiceIds: string[];
  excludedLineIds?: string[];
}

/** Response with AI-generated report content. Story #1901. */
export interface GenerateReportContentResponse {
  letterSubject: string;
  letterBody: string;
  descriptions: Record<string, string>;
}
