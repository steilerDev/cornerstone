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
  InvoiceStatus,
  HouseholdSettings,
} from '@cornerstone/shared';
import type { Formatters } from '../formatters.js';
import type {
  ReportContent,
  ReportContentRow,
  ReportContentSummaryRow,
  ReportContentFootnote,
  ReportContentCoverLetter,
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
  budgetLines: Array<{ linkedItem: { areaName: string | null } | null }>;
}): string | null {
  const areaNames = invoice.budgetLines
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
  budgetLines: Array<{ linkedItem: { name: string } | null; description: string | null }>;
}): string {
  const hasLinkedItems = invoice.budgetLines.some((line) => line.linkedItem !== null);

  if (hasLinkedItems) {
    const linkedNames = invoice.budgetLines
      .filter((line) => line.linkedItem !== null)
      .map((line) => line.linkedItem!.name);
    return uniqueInOrder(linkedNames).join(', ');
  }

  const descriptions = invoice.budgetLines
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
    documents: Array<{ attachmentType: string | null }>;
  },
  t: TFunction,
): string | null {
  const { documents } = invoice;
  if (documents.length === 0) {
    return null;
  }

  const attachmentTypes = documents
    .map((doc) => doc.attachmentType)
    .filter((type) => type !== null) as string[];

  if (attachmentTypes.length === 0) {
    // All null types
    const count = documents.length;
    return t(`sourceReports.table.attachmentsNoteNoType_${count === 1 ? 'one' : 'other'}`, {
      count,
    });
  }

  // Deduplicate types and translate
  const deducedTypes = uniqueInOrder(attachmentTypes);
  const typeLabels = deducedTypes.map((type) => t(`sourceReports.table.attachmentType.${type}`));

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
  reportFormatters?: Formatters,
  options?: {
    includeCoverLetter: boolean;
    household: HouseholdSettings | null;
    user?: { displayName: string } | null;
  },
): ReportContent {
  const isOverview = useCase === 'budget-overview';
  const includeCoverLetter = options?.includeCoverLetter ?? false;
  const household = options?.household ?? null;
  const user = options?.user ?? null;

  // Build title
  const tableTitle = reportT(`sourceReports.table.title.${useCase}`);

  // Build source info
  const sourceTypeText = reportT(`sourceReports.sourceType.${report.source.sourceType}`);
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0] ?? '';
  const generatedAtText: string = reportFormatters
    ? reportFormatters.formatDate(todayStr)
    : todayStr;

  const sourceInfo = {
    sourceName: report.source.name,
    sourceTypeText,
    referenceText: report.source.reference ?? null,
    generatedAtText,
  };

  // Track invoices for split/deposit markers (#1911: driven by splitKind, not isSplit +
  // budgetLines/deposits shape — the array-shape gate was unsound: claim reports drop
  // zero-contribution budget lines (§3.1), and a foreign-tagged deposit is filtered out of
  // deposits[] server-side entirely (§3.2, the bug this story exists to fix).
  const splitInvoiceIds = new Set<string>();
  const depositReducedInvoiceIds = new Set<string>();
  const depositConstitutedInvoiceIds = new Set<string>();

  for (const invoice of report.invoices) {
    if (!includedInvoiceIds.has(invoice.invoiceId)) {
      continue;
    }

    // AC 3.1: row.isSplit ⟺ splitKind === 'lines' || splitKind === 'both'
    if (invoice.splitKind === 'lines' || invoice.splitKind === 'both') {
      splitInvoiceIds.add(invoice.invoiceId);
    }

    // AC 3.2: row.isDepositReduced ⟺ splitKind === 'deposits' || splitKind === 'both'
    if (invoice.splitKind === 'deposits' || invoice.splitKind === 'both') {
      depositReducedInvoiceIds.add(invoice.invoiceId);
    }

    // AC 3.3: row.isDeposit (constituted) trigger is UNCHANGED — still invoice.isSplit &&
    // hasOwnTaggedDeposit, still read from the visible deposits[]. Decoupling isDeposit from
    // isSplit is an explicit non-goal (§3).
    const hasOwnTaggedDeposit = invoice.deposits.some((d) => d.budgetSourceId === report.source.id);
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

    const status = invoice.status as InvoiceStatus;

    const invoiceAmountText = reportFormatters
      ? reportFormatters.formatCurrency(invoice.invoiceAmount)
      : '—';

    const allocatedAmountValueText = reportFormatters
      ? reportFormatters.formatCurrency(invoice.allocatedAmount)
      : '—';

    const statusText = isOverview ? reportT(`sources.lines.invoiceStatus.${status}`) : null;

    const isSplit = splitInvoiceIds.has(invoice.invoiceId);
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
      dateText: reportFormatters ? reportFormatters.formatDate(invoice.date) : invoice.date,
      status: isOverview ? status : null,
      statusText,
      invoiceAmountText,
      allocatedAmountValueText,
      isSplit,
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

  const totalAmountText = reportFormatters ? reportFormatters.formatCurrency(includedTotal) : '—';
  summaryRows.push({
    key: 'total',
    label: reportT('sourceReports.table.total'),
    amountText: totalAmountText,
  });

  const footnotes: ReportContentFootnote[] = [];

  // Legend footnotes: one sentence per flag, deduplicated by set membership (AC 1.1–1.5)
  if (splitInvoiceIds.size > 0) {
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
    const dateLine = reportFormatters ? reportFormatters.formatDate(todayStr) : todayStr;

    const senderLines = [];
    if (user?.displayName) senderLines.push(user.displayName);
    if (household?.householdAddress) senderLines.push(household.householdAddress);
    const sender = senderLines.join('\n');

    const subject = reportT(`sourceReports.coverLetter.subject.${useCase}`);
    const bodyKey = `sourceReports.coverLetter.body.${useCase}`;
    const body = reportT(bodyKey, { total: totalAmountText });
    const signature = sender.split('\n')[0]?.trim() ?? '';
    const closing = reportT('sourceReports.coverLetter.closing');

    coverLetter = {
      sender,
      recipient: report.source.contactAddress ?? null,
      dateLine,
      reference: report.source.reference ?? null,
      subject,
      body,
      signature,
      closing,
    };
  }

  const isClaim = useCase === 'claim';

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
      deposit: reportT('sourceReports.table.attachmentType.deposit'),
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
  };
}
