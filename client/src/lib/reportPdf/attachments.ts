/**
 * Attachment acquisition for the multi-PDF split (#2161): fetch each linked invoice PDF once,
 * validate it with pdf-lib and cache the bytes by documentId so sizing and merging share them.
 */
import type { SourceReportResponse } from '@cornerstone/shared';
import { loadPdfLibs } from './loader.js';
import { getDocumentPreviewUrl } from '../paperlessApi.js';
import type {
  AcquireResult,
  AttachmentCache,
  FailedFetch,
  ReportAttachment,
  SkippedDocument,
} from './types.js';

export interface AcquireOptions {
  /** documentIds the user chose to continue without; skipped without fetching. */
  skipFetch?: ReadonlySet<number>;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

/** Number of (invoice, document) pairs across the included invoices. */
export function countIncludedDocuments(
  report: SourceReportResponse,
  includedInvoiceIds: ReadonlySet<string>,
): number {
  let count = 0;
  for (const invoice of report.invoices) {
    if (!includedInvoiceIds.has(invoice.invoiceId)) continue;
    count += (invoice.documents ?? []).length;
  }
  return count;
}

/** Number of (invoice, document) pairs whose document is not yet cached. */
export function countUncachedDocuments(
  report: SourceReportResponse,
  includedInvoiceIds: ReadonlySet<string>,
  cache: AttachmentCache,
): number {
  let count = 0;
  for (const invoice of report.invoices) {
    if (!includedInvoiceIds.has(invoice.invoiceId)) continue;
    for (const doc of invoice.documents ?? []) {
      if (!cache.has(doc.documentId)) count++;
    }
  }
  return count;
}

export async function acquireAttachments(
  report: SourceReportResponse,
  includedInvoiceIds: ReadonlySet<string>,
  cache: AttachmentCache,
  options?: AcquireOptions,
): Promise<AcquireResult> {
  const signal = options?.signal;
  const skipFetch = options?.skipFetch;
  const attachments: ReportAttachment[] = [];
  const skippedDocuments: SkippedDocument[] = [];
  const failedFetches: FailedFetch[] = [];
  const failedThisRun = new Set<number>();

  const total = countIncludedDocuments(report, includedInvoiceIds);

  let done = 0;
  for (const invoice of report.invoices) {
    if (!includedInvoiceIds.has(invoice.invoiceId)) continue;
    for (const doc of invoice.documents ?? []) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

      const skip = (reason: SkippedDocument['reason']): void => {
        skippedDocuments.push({
          invoiceId: invoice.invoiceId,
          documentId: doc.documentId.toString(),
          reason,
          vendorName: invoice.vendorName,
          invoiceNumber: invoice.invoiceNumber,
        });
      };
      const fail = (): void => {
        skip('footnoteFetchFailed');
        failedFetches.push({
          invoiceId: invoice.invoiceId,
          documentId: doc.documentId,
          title: doc.title,
          vendorName: invoice.vendorName,
          invoiceNumber: invoice.invoiceNumber,
        });
      };

      const cached = cache.get(doc.documentId);
      if (cached?.status === 'ok') {
        attachments.push({
          key: `${invoice.invoiceId}:${doc.documentId}`,
          invoiceId: invoice.invoiceId,
          documentId: doc.documentId,
          title: doc.title,
          vendorName: invoice.vendorName,
          invoiceNumber: invoice.invoiceNumber,
          bytes: cached.bytes,
          size: cached.bytes.byteLength,
        });
      } else if (cached?.status === 'invalid') {
        skip('footnoteInvalidPdf');
      } else if (skipFetch?.has(doc.documentId)) {
        skip('footnoteFetchFailed');
      } else if (failedThisRun.has(doc.documentId)) {
        fail();
      } else {
        let bytes: ArrayBuffer | null = null;
        try {
          const response = await fetch(getDocumentPreviewUrl(doc.documentId), {
            credentials: 'include',
            signal,
          });
          if (response.ok) bytes = await response.arrayBuffer();
        } catch (err) {
          if (isAbortError(err)) throw err;
        }

        if (!bytes) {
          failedThisRun.add(doc.documentId);
          fail();
        } else {
          try {
            const { PDFDocument } = await loadPdfLibs();
            await PDFDocument.load(bytes);
            cache.set(doc.documentId, { status: 'ok', bytes });
            attachments.push({
              key: `${invoice.invoiceId}:${doc.documentId}`,
              invoiceId: invoice.invoiceId,
              documentId: doc.documentId,
              title: doc.title,
              vendorName: invoice.vendorName,
              invoiceNumber: invoice.invoiceNumber,
              bytes,
              size: bytes.byteLength,
            });
          } catch {
            cache.set(doc.documentId, { status: 'invalid' });
            skip('footnoteInvalidPdf');
          }
        }
      }

      done++;
      options?.onProgress?.(done, total);
    }
  }

  return { attachments, skippedDocuments, failedFetches };
}
