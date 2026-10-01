/**
 * Multi-PDF report generation (#2161): plan the split, render each part, merge its attachments
 * and verify the real sizes against the limit.
 *
 * Imports no value from `merge.ts` (it pulls in `paperlessApi`); the page loads this module
 * lazily so the wizard's static import graph is unchanged.
 */
import type { Content, Style } from 'pdfmake/build/pdfmake';
import type { PDFDocument } from 'pdf-lib';
import type { SourceReportResponse } from '@cornerstone/shared';
import type {
  ReportColumnKey,
  ReportContent,
  ReportContentPartTexts,
  ReportContentRow,
  ReportSkipReason,
} from '../reportContent/index.js';
import { loadPdfLibs } from './loader.js';
import { buildPageHeader, buildPageFooter } from './shared.js';
import { buildCoverLetterContent } from './coverLetterPdf.js';
import { buildContinuationLetterContent } from './continuationLetterPdf.js';
import { buildOverviewContent } from './overviewPdf.js';
import { PAGE_MARGIN_X, PAGE_TOP_MARGIN, PAGE_MARGIN_BOTTOM, PDF_STYLES } from './pageGeometry.js';
import { planReportParts, shiftLastItem } from './partPlan.js';
import type { PartPlan } from './partPlan.js';
import type {
  AcquireResult,
  GeneratedReportPart,
  GeneratedReportParts,
  ReportAttachment,
  ReportPartWarning,
  SkippedDocument,
} from './types.js';

export { acquireAttachments, countUncachedDocuments } from './attachments.js';

/** Mirrors `PDF_DEFAULT_STYLE` in merge.ts (not imported: merge.ts pulls in paperlessApi). */
const PDF_DEFAULT_STYLE: Style = {
  font: 'Roboto',
  fontSize: 11,
  lineHeight: 1.4,
};

/** Worst-case part count used when estimating per-part overhead. */
const ESTIMATE_PART_COUNT = 99;

export interface GenerateReportPartsInput {
  report: SourceReportResponse;
  includedInvoiceIds: ReadonlySet<string>;
  content: ReportContent;
  hiddenColumns?: ReadonlySet<ReportColumnKey>;
  acquired: AcquireResult;
  limitBytes: number;
  signal?: AbortSignal;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
}

function distinct<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

export async function generateReportParts(
  input: GenerateReportPartsInput,
): Promise<GeneratedReportParts> {
  const { content, acquired, limitBytes, signal } = input;
  const hiddenColumns = input.hiddenColumns ?? new Set<ReportColumnKey>();
  const partTexts: ReportContentPartTexts | undefined = content.partTexts;
  if (!partTexts) {
    throw new Error('generateReportParts requires content.partTexts (includePartTexts: true)');
  }
  const texts: ReportContentPartTexts = partTexts;
  const { pdfMake, PDFDocument: PdfDoc } = await loadPdfLibs();

  const attachments = acquired.attachments;
  const attachmentByKey = new Map<string, ReportAttachment>(attachments.map((a) => [a.key, a]));
  const rowByInvoiceId = new Map<string, ReportContentRow>(
    content.rows.map((r) => [r.invoiceId, r]),
  );

  const skippedByInvoice = new Map<string, ReportSkipReason[]>();
  for (const skip of acquired.skippedDocuments) {
    const list = skippedByInvoice.get(skip.invoiceId) ?? [];
    list.push(skip.reason);
    skippedByInvoice.set(skip.invoiceId, list);
  }
  const mergeSkips = new Map<string, SkippedDocument>();

  async function renderText(nodes: Content[]): Promise<Blob> {
    const pdfDoc = pdfMake.createPdf({
      content: nodes,
      pageSize: 'A4',
      pageMargins: [PAGE_MARGIN_X, PAGE_TOP_MARGIN, PAGE_MARGIN_X, PAGE_MARGIN_BOTTOM],
      header: (currentPage: number) => {
        if (currentPage === 1) return null;
        return buildPageHeader(
          content.tableTitle,
          content.sourceInfo.sourceName,
          `${content.labels.generatedAt}: ${content.sourceInfo.generatedAtText}`,
        );
      },
      footer: buildPageFooter(content.labels.pageLabel),
      defaultStyle: PDF_DEFAULT_STYLE,
      styles: PDF_STYLES,
    });
    return pdfDoc.getBlob();
  }

  async function part1Text(total: number): Promise<Blob> {
    const nodes: Content[] = [];
    if (content.coverLetter) {
      const notice = total > 1 ? texts.multiPartNotice(total) : undefined;
      nodes.push(...buildCoverLetterContent(content, notice ? { partsNotice: notice } : undefined));
    } else if (total > 1) {
      nodes.push({
        text: texts.multiPartNoticeNoLetter(total),
        style: 'small',
        margin: [0, 0, 0, 8],
      });
    }
    nodes.push(...buildOverviewContent(content, skippedByInvoice, hiddenColumns));
    return renderText(nodes);
  }

  function continuationLines(keys: readonly string[]): string[] {
    const invoiceIds = distinct(
      keys.map((k) => attachmentByKey.get(k)?.invoiceId).filter((id): id is string => !!id),
    );
    return invoiceIds.map((id) => {
      const row = rowByInvoiceId.get(id);
      if (row) return texts.continuationInvoiceLine(row);
      const att = attachments.find((a) => a.invoiceId === id);
      return texts.continuationInvoiceLine({
        vendor: att?.vendorName ?? '',
        invoiceNumber: att?.invoiceNumber ?? '—',
        dateText: '',
      });
    });
  }

  async function continuationText(
    part: number,
    total: number,
    keys: readonly string[],
  ): Promise<Blob> {
    return renderText(
      buildContinuationLetterContent(content, {
        subject: texts.continuationSubject(part, total),
        body: texts.continuationBody(part, total),
        invoicesHeading: texts.continuationInvoicesHeading,
        invoiceLines: continuationLines(keys),
      }),
    );
  }

  // Overhead estimates (conservative upper bounds, see spec step 7).
  const part1Overhead = (await part1Text(ESTIMATE_PART_COUNT)).size;
  const continuationOverhead = (
    await continuationText(
      ESTIMATE_PART_COUNT,
      ESTIMATE_PART_COUNT,
      attachments.map((a) => a.key),
    )
  ).size;

  const items = attachments.map((a) => ({ key: a.key, size: a.size }));
  const planWith = (fixedPartCounts?: readonly number[]): PartPlan =>
    planReportParts({
      items,
      limitBytes,
      part1OverheadBytes: part1Overhead,
      continuationOverheadBytes: continuationOverhead,
      fixedPartCounts,
    });

  const sourceDocs = new Map<string, PDFDocument>();
  const renderedCache = new Map<string, GeneratedReportPart>();

  async function loadSource(att: ReportAttachment): Promise<PDFDocument | null> {
    const cached = sourceDocs.get(att.key);
    if (cached) return cached;
    try {
      const doc = await PdfDoc.load(att.bytes);
      sourceDocs.set(att.key, doc);
      return doc;
    } catch {
      mergeSkips.set(att.key, {
        invoiceId: att.invoiceId,
        documentId: att.documentId.toString(),
        reason: 'footnoteInvalidPdf',
        vendorName: att.vendorName,
        invoiceNumber: att.invoiceNumber,
      });
      return null;
    }
  }

  async function renderPart(
    index: number,
    total: number,
    keys: readonly string[],
  ): Promise<GeneratedReportPart> {
    const cacheKey = `${index}|${total}|${keys.join(',')}`;
    const hit = renderedCache.get(cacheKey);
    if (hit) return hit;

    const textBlob =
      index === 0 ? await part1Text(total) : await continuationText(index + 1, total, keys);
    const partAttachments = keys
      .map((k) => attachmentByKey.get(k))
      .filter((a): a is ReportAttachment => !!a);

    let blob = textBlob;
    if (partAttachments.length > 0) {
      const finalDoc = await PdfDoc.create();
      const textDoc = await PdfDoc.load(await textBlob.arrayBuffer());
      const textPages = await finalDoc.copyPages(textDoc, textDoc.getPageIndices());
      textPages.forEach((page) => finalDoc.addPage(page));
      for (const att of partAttachments) {
        const source = await loadSource(att);
        if (!source) continue;
        const pages = await finalDoc.copyPages(source, source.getPageIndices());
        pages.forEach((page) => finalDoc.addPage(page));
      }
      const bytes = await finalDoc.save();
      blob = new Blob([bytes as BufferSource], { type: 'application/pdf' });
    }

    const part: GeneratedReportPart = {
      index,
      blob,
      size: blob.size,
      attachmentKeys: [...keys],
      invoiceIds: distinct(partAttachments.map((a) => a.invoiceId)),
      overLimit: blob.size > limitBytes,
    };
    renderedCache.set(cacheKey, part);
    return part;
  }

  async function renderPlan(plan: PartPlan): Promise<GeneratedReportPart[]> {
    const total = plan.parts.length;
    const rendered: GeneratedReportPart[] = [];
    for (let i = 0; i < total; i++) {
      throwIfAborted(signal);
      rendered.push(await renderPart(i, total, plan.parts[i]?.itemKeys ?? []));
    }
    return rendered;
  }

  // Plan, render, then verify real sizes; move a part's last attachment on when it is over.
  let plan = planWith();
  const maxPasses = plan.parts.length + 1;
  let parts = await renderPlan(plan);
  for (let pass = 0; pass < maxPasses; pass++) {
    const overIndex = parts.findIndex((p, i) => {
      if (p.size <= limitBytes) return false;
      return i === 0 ? p.attachmentKeys.length >= 1 : p.attachmentKeys.length >= 2;
    });
    if (overIndex < 0) break;
    plan = planWith(shiftLastItem(plan, overIndex));
    parts = await renderPlan(plan);
  }

  const warnings: ReportPartWarning[] = [];
  for (const planned of plan.parts) {
    if (!planned.oversizedItemKey) continue;
    const att = attachmentByKey.get(planned.oversizedItemKey);
    if (!att) continue;
    warnings.push({
      kind: 'oversizedAttachment',
      invoiceId: att.invoiceId,
      vendorName: att.vendorName,
      invoiceNumber: att.invoiceNumber,
      documentId: att.documentId,
      documentTitle: att.title,
      size: att.size,
      limitBytes,
    });
  }
  const firstPart = parts[0];
  if (plan.reportExceedsLimit && firstPart) {
    warnings.push({
      kind: 'reportExceedsLimit',
      size: firstPart.size,
      limitBytes,
      hasAttachments: attachments.length > 0,
    });
  }
  parts.forEach((p, i) => {
    if (p.size <= limitBytes) return;
    if (plan.parts[i]?.oversizedItemKey) return;
    if (i === 0 && plan.reportExceedsLimit) return;
    warnings.push({ kind: 'partOverLimit', partIndex: i, size: p.size, limitBytes });
  });

  return {
    parts,
    skippedDocuments: [...acquired.skippedDocuments, ...mergeSkips.values()],
    warnings,
    limitBytes,
  };
}
