/**
 * Build ReportContent from a SourceReportResponse.
 * Extracts text content needed for rendering (both UI and PDF).
 * No PDF-specific markup; no pdfmake Content objects.
 */
import type { TFunction } from 'i18next';
import { computeIncludedTotal } from '@cornerstone/shared';
import type {
  SourceReportResponse,
  SourceReportType,
  HouseholdSettings,
  AttachmentType,
} from '@cornerstone/shared';
import type { Formatters } from '../formatters.js';
import { I18N_UNION_KEYS } from '../../i18n/unionKeys.js';
import type {
  ReportContent,
  ReportContentRow,
  ReportContentSummaryRow,
  ReportContentFootnote,
  ReportContentCoverLetter,
  ReportContentPartTexts,
} from './types.js';

/**
 * Helper: deduplicate array preserving order via Set.
 */
function uniqueInOrder<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

/**
 * Helper: get area text from invoice budget lines.
 * Returns distinct linked item areaName values, first-seen order, comma-joined, or null when empty.
 */
function getAreaText(invoice: {
  budgetLinesForSource: Array<{ linkedItem: { areaName: string | null } | null }>;
}): string | null {
  const areaNames = invoice.budgetLinesForSource
    .map((line) => line.linkedItem?.areaName)
    .filter((name) => name !== null && name !== undefined) as string[];

  if (areaNames.length === 0) {
    return null;
  }

  return uniqueInOrder(areaNames).join(', ');
}

/**
 * Helper: get usage text from invoice budget lines.
 * Returns distinct linked item names if any line has linkedItem; else distinct descriptions; else '—'.
 */
function getUsageText(invoice: {
  budgetLinesForSource: Array<{ linkedItem: { name: string } | null; description: string | null }>;
}): string {
  const hasLinkedItems = invoice.budgetLinesForSource.some((line) => line.linkedItem !== null);

  if (hasLinkedItems) {
    const linkedNames = invoice.budgetLinesForSource
      .filter((line) => line.linkedItem !== null)
      .map((line) => line.linkedItem!.name);
    return uniqueInOrder(linkedNames).join(', ');
  }

  const descriptions = invoice.budgetLinesForSource
    .filter((line) => line.description !== null)
    .map((line) => line.description!);
  if (descriptions.length > 0) {
    return uniqueInOrder(descriptions).join(', ');
  }

  return '—';
}

/**
 * Helper: get attachment note from invoice documents.
 * Returns null if no documents; else formatted note with deduped types or count-only.
 */
function getAttachmentNote(
  invoice: {
    documents: Array<{ attachmentType: AttachmentType | null }>;
  },
  t: TFunction,
): string | null {
  const { documents } = invoice;
  if (documents.length === 0) {
    return null;
  }

  const attachmentTypes = documents
    .map((doc) => doc.attachmentType)
    .filter((type): type is AttachmentType => type !== null);

  if (attachmentTypes.length === 0) {
    // All null types
    const count = documents.length;
    return t(`sourceReports.table.attachmentsNoteNoType_${count === 1 ? 'one' : 'other'}`, {
      count,
    });
  }

  // Deduplicate types and translate
  const dedupedTypes = uniqueInOrder(attachmentTypes);
  const typeLabels = dedupedTypes.map((type) => t(I18N_UNION_KEYS.reportAttachmentType.key(type)));

  const count = documents.length;
  return t(`sourceReports.table.attachmentsNote_${count === 1 ? 'one' : 'other'}`, {
    count,
    types: typeLabels.join(', '),
  });
}

export function buildReportContent(
  report: SourceReportResponse,
  includedInvoiceIds: Set<string>,
  useCase: SourceReportType,
  reportT: TFunction,
  reportFormatters: Formatters,
  options?: {
    includeCoverLetter: boolean;
    household: HouseholdSettings | null;
    user?: { displayName: string } | null;
    /** Opt-in (#2161): also build the multi-PDF report-language closures (`partTexts`). */
    includePartTexts?: boolean;
  },
): ReportContent {
  const isOverview = useCase === 'budget-overview';
  const includeCoverLetter = options?.includeCoverLetter ?? false;
  const household = options?.household ?? null;
  const user = options?.user ?? null;

  // Build title
  const tableTitle = reportT(I18N_UNION_KEYS.reportTitle.key(useCase));

  // Build source info
  const sourceTypeText = reportT(I18N_UNION_KEYS.reportSourceType.key(report.source.sourceType));
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0] ?? '';
  const generatedAtText: string = reportFormatters.formatDate(todayStr);

  const sourceInfo = {
    sourceName: report.source.name,
    sourceTypeText,
    referenceText: report.source.reference ?? null,
    generatedAtText,
  };

  // Track invoices for split/deposit markers (#1911: driven by splitKind, not isSplit +
  // budgetLinesForSource/depositsVisibleToSource shape — the array-shape gate was unsound: claim reports drop
  // zero-contribution budget lines (§3.1), and a foreign-tagged deposit is filtered out of
  // depositsVisibleToSource[] server-side entirely (§3.2, the bug this story exists to fix).
  const partialInvoiceIds = new Set<string>();
  const depositReducedInvoiceIds = new Set<string>();
  const depositConstitutedInvoiceIds = new Set<string>();

  for (const invoice of report.invoices) {
    if (!includedInvoiceIds.has(invoice.invoiceId)) {
      continue;
    }

    // AC 3.1: row.isPartial ⟺ splitKind === 'lines' || splitKind === 'both'
    if (invoice.splitKind === 'lines' || invoice.splitKind === 'both') {
      partialInvoiceIds.add(invoice.invoiceId);
    }

    // AC 3.2: row.isDepositReduced ⟺ splitKind === 'deposits' || splitKind === 'both'
    if (invoice.splitKind === 'deposits' || invoice.splitKind === 'both') {
      depositReducedInvoiceIds.add(invoice.invoiceId);
    }

    // AC 3.3: row.isDeposit (constituted) trigger is UNCHANGED — still invoice.isSplit &&
    // hasOwnTaggedDeposit, still read from the visible depositsVisibleToSource[]. Decoupling isDeposit from
    // isSplit is an explicit non-goal (§3).
    // Sound by construction (#2018, #2019): this is a SAME-scope predicate ("does THIS source have
    // a tagged deposit?") over depositsVisibleToSource, whose server-side step-i filter keeps exactly
    // untagged + this-source deposits. Narrowing that filter (sourceReportService.ts step i) silently
    // removes the (Deposit) badge — pinned by the "#2018 guard" tests in sourceReportService.test.ts
    // and buildReportContent.test.ts.
    const hasOwnTaggedDeposit = invoice.depositsVisibleToSource.some(
      (d) => d.budgetSourceId === report.source.id,
    );
    if (invoice.isSplit && hasOwnTaggedDeposit) {
      depositConstitutedInvoiceIds.add(invoice.invoiceId);
    }
  }

  // Build table rows
  const rows: ReportContentRow[] = [];

  for (const invoice of report.invoices) {
    if (!includedInvoiceIds.has(invoice.invoiceId)) {
      continue;
    }

    const invoiceAmountText = reportFormatters.formatCurrency(invoice.invoiceAmount);

    const allocatedAmountValueText = reportFormatters.formatCurrency(invoice.allocatedAmount);

    const statusText = isOverview
      ? reportT(I18N_UNION_KEYS.statusVocabularyInvoice.key(invoice.status), {
          ns: I18N_UNION_KEYS.statusVocabularyInvoice.ns,
        })
      : null;

    const isPartial = partialInvoiceIds.has(invoice.invoiceId);
    const isDepositReduced = depositReducedInvoiceIds.has(invoice.invoiceId);
    const isDeposit = depositConstitutedInvoiceIds.has(invoice.invoiceId);
    const refundNoteText = reportT('sourceReports.table.refundNote');
    const usageText = getUsageText(invoice);
    const attachmentsNote = getAttachmentNote(invoice, reportT);
    const areaText = getAreaText(invoice);

    rows.push({
      invoiceId: invoice.invoiceId,
      vendor: invoice.vendorName,
      invoiceNumber: invoice.invoiceNumber ?? '—',
      dateText: reportFormatters.formatDate(invoice.date),
      status: isOverview ? invoice.status : null,
      statusText,
      invoiceAmountText,
      allocatedAmountValueText,
      isPartial,
      isDepositReduced,
      isDeposit,
      isRefund: invoice.lineKind === 'refund-adjustment',
      refundNoteText,
      usageText,
      attachmentsNote,
      areaText,
    });
  }

  // Build summary rows (single total row only)
  const summaryRows: ReportContentSummaryRow[] = [];

  const includedTotal = computeIncludedTotal(report, Array.from(includedInvoiceIds), new Set());

  const totalAmountText = reportFormatters.formatCurrency(includedTotal);
  summaryRows.push({
    key: 'total',
    label: reportT('sourceReports.table.total'),
    amountText: totalAmountText,
  });

  const footnotes: ReportContentFootnote[] = [];

  // Legend footnotes: one sentence per flag, deduplicated by set membership (AC 1.1–1.5)
  if (partialInvoiceIds.size > 0) {
    footnotes.push({
      id: 'split',
      marker: reportT('sourceReports.table.splitInlineLabel'),
      text: reportT('sourceReports.table.splitFootnote'),
    });
  }
  if (depositReducedInvoiceIds.size > 0) {
    footnotes.push({
      id: 'depositReduced',
      marker: reportT('sourceReports.table.depositReducedInlineLabel'),
      text: reportT('sourceReports.table.depositReducedFootnote'),
    });
  }

  // Build cover letter (if enabled)
  let coverLetter: ReportContentCoverLetter | null = null;
  if (includeCoverLetter) {
    const dateLine = reportFormatters.formatDate(todayStr);

    const senderLines = [];
    if (user?.displayName) senderLines.push(user.displayName);
    if (household?.householdAddress) senderLines.push(household.householdAddress);
    const sender = senderLines.join('\n');

    const subject = reportT(I18N_UNION_KEYS.reportCoverLetterSubject.key(useCase));
    const body = reportT(I18N_UNION_KEYS.reportCoverLetterBody.key(useCase), {
      total: totalAmountText,
    });
    const signature = sender.split('\n')[0]?.trim() ?? '';
    const closing = reportT('sourceReports.coverLetter.closing');
    const opening = reportT('sourceReports.coverLetter.opening');

    coverLetter = {
      sender,
      recipient: report.source.contactAddress ?? null,
      dateLine,
      reference: report.source.reference ?? null,
      subject,
      opening,
      body,
      signature,
      closing,
    };
  }

  const isClaim = useCase === 'claim';

  let partTexts: ReportContentPartTexts | undefined;
  if (options?.includePartTexts === true) {
    const identifier = reportT('sourceReports.parts.letter.identifier', {
      title: tableTitle,
      source: sourceInfo.sourceName,
      date: generatedAtText,
    });
    partTexts = {
      identifier,
      continuationSubject: (part, total) =>
        reportT('sourceReports.parts.letter.continuationSubject', {
          part,
          total,
          report: identifier,
        }),
      continuationBody: (part, total) =>
        reportT('sourceReports.parts.letter.continuationBody', {
          part,
          total,
          report: identifier,
        }),
      continuationInvoicesHeading: reportT(
        'sourceReports.parts.letter.continuationInvoicesHeading',
      ),
      continuationInvoiceLine: (row) =>
        reportT('sourceReports.parts.letter.continuationInvoiceLine', {
          vendor: row.vendor,
          invoiceNumber: row.invoiceNumber,
          date: row.dateText,
        }),
      multiPartNotice: (total) =>
        reportT('sourceReports.parts.letter.multiPartNotice', { count: total - 1, total }),
      multiPartNoticeNoLetter: (total) =>
        reportT('sourceReports.parts.letter.multiPartNoticeNoLetter', {
          count: total - 1,
          total,
        }),
      paperlessTitle: (baseTitle, partLabel, total) =>
        reportT('sourceReports.parts.letter.paperlessTitle', {
          title: baseTitle,
          part: partLabel,
          total,
        }),
    };
  }

  return {
    isOverview,
    isClaim,
    tableTitle,
    labels: {
      vendor: reportT('sourceReports.table.vendor'),
      invoiceNumber: reportT('sourceReports.table.invoiceNumber'),
      date: reportT('sourceReports.table.date'),
      status: reportT('sourceReports.table.status'),
      invoiceAmount: reportT('sourceReports.table.invoiceAmount'),
      allocatedAmount: reportT('sourceReports.table.allocatedAmount'),
      usage: reportT('sourceReports.table.usage'),
      attachmentsNote: reportT('sourceReports.editable.attachmentsNoteLabel'),
      deposit: reportT(I18N_UNION_KEYS.reportAttachmentType.key('deposit')),
      splitNote: reportT('sourceReports.table.splitInlineLabel'),
      depositReducedNote: reportT('sourceReports.table.depositReducedInlineLabel'),
      source: reportT('sourceReports.table.source'),
      sourceType: reportT('sourceReports.table.sourceType'),
      reference: reportT('sourceReports.table.reference'),
      generatedAt: reportT('sourceReports.table.generatedAt'),
      pageLabel: reportT('sourceReports.table.pageLabel'),
      coverLetterReferenceLabel: reportT('sourceReports.coverLetter.reference'),
      coverLetterSubjectLabel: reportT('sourceReports.coverLetter.subjectLabel'),
      skipReasonLabels: {
        footnoteFetchFailed: reportT('sourceReports.table.footnoteFetchFailed'),
        footnoteInvalidPdf: reportT('sourceReports.table.footnoteInvalidPdf'),
      },
    },
    sourceInfo,
    coverLetter,
    rows,
    summaryRows,
    footnotes,
    ...(partTexts ? { partTexts } : {}),
  };
}
