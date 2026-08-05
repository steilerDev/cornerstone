/**
 * Types for the report PDF pipeline.
 */
import type { ReportSkipReason } from '../reportContent/index.js';

export interface ReportPdfOptions {
  attachDocuments: boolean;
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
