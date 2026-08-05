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
