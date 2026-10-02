/**
 * Types for the report PDF pipeline.
 */
import type { ReportColumnKey, ReportSkipReason } from '../reportContent/index.js';

export interface ReportPdfOptions {
  attachDocuments: boolean;
  /** Columns hidden by the user in the report wizard's preview. Omitted/empty = hide nothing. */
  hiddenColumns?: ReadonlySet<ReportColumnKey>;
}

export interface GeneratedReport {
  blob: Blob;
  skippedDocuments: SkippedDocument[];
}

export interface SkippedDocument {
  invoiceId: string;
  documentId: string;
  reason: ReportSkipReason;
  vendorName: string;
  invoiceNumber: string | null;
}

// --- Multi-PDF split (#2161) ---

export interface ReportAttachment {
  key: string; // `${invoiceId}:${documentId}`
  invoiceId: string;
  documentId: number;
  title: string | null;
  vendorName: string;
  invoiceNumber: string | null;
  bytes: ArrayBuffer;
  size: number; // === bytes.byteLength
}

export type CachedDocument = { status: 'ok'; bytes: ArrayBuffer } | { status: 'invalid' };
/** Keyed by documentId. */
export type AttachmentCache = Map<number, CachedDocument>;

export interface FailedFetch {
  invoiceId: string;
  documentId: number;
  title: string | null;
  vendorName: string;
  invoiceNumber: string | null;
}

export interface AcquireResult {
  attachments: ReportAttachment[];
  skippedDocuments: SkippedDocument[];
  failedFetches: FailedFetch[];
}

export interface GeneratedReportPart {
  index: number;
  blob: Blob;
  size: number;
  attachmentKeys: string[];
  invoiceIds: string[];
  overLimit: boolean;
}

export type ReportPartWarning =
  | {
      kind: 'oversizedAttachment';
      invoiceId: string;
      vendorName: string;
      invoiceNumber: string | null;
      documentId: number;
      documentTitle: string | null;
      size: number;
      limitBytes: number;
    }
  | { kind: 'reportExceedsLimit'; size: number; limitBytes: number; hasAttachments: boolean }
  | { kind: 'partOverLimit'; partIndex: number; size: number; limitBytes: number };

export interface GeneratedReportParts {
  parts: GeneratedReportPart[];
  skippedDocuments: SkippedDocument[];
  warnings: ReportPartWarning[];
  limitBytes: number;
}
