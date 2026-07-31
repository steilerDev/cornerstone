/**
 * Build ReportContent from a SourceReportResponse.
 * Extracts text content needed for rendering (both UI and PDF).
 * No PDF-specific markup; no pdfmake Content objects.
 */
import type { TFunction } from 'i18next';
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
  options?: { includeCoverLetter: boolean; household: HouseholdSettings | null },
): ReportContent {
  const isOverview = useCase === 'budget-overview';
  const includeCoverLetter = options?.includeCoverLetter ?? false;
  const household = options?.household ?? null;

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

  // Track footnotes for split/deposit (skip footnotes handled at generation time)
  const splitFootnotesByInvoiceId = new Map<string, number>();
  const depositFootnotesByInvoiceId = new Map<
    string,
    { num: number; wording: 'reduced' | 'constituted' }
  >();
  let splitFootnoteNum = 1;
  let depositFootnoteNum = 1;

  for (const invoice of report.invoices) {
    if (!includedInvoiceIds.has(invoice.invoiceId) || !invoice.isSplit) {
      continue;
    }
    if (invoice.budgetLines.length > 0) {
      splitFootnotesByInvoiceId.set(invoice.invoiceId, splitFootnoteNum++);
    }
    if (invoice.deposits.length > 0) {
      const taggedDeposit = invoice.deposits.some((d) => d.budgetSourceId === report.source.id);
      depositFootnotesByInvoiceId.set(invoice.invoiceId, {
        num: depositFootnoteNum++,
        wording: taggedDeposit ? 'constituted' : 'reduced',
      });
    }
  }

  // Build table rows
  const rows: ReportContentRow[] = [];
  const statusCounts: Record<InvoiceStatus, number> = {
    pending: 0,
    paid: 0,
    claimed: 0,
    quotation: 0,
  };

  for (const invoice of report.invoices) {
    if (!includedInvoiceIds.has(invoice.invoiceId)) {
      continue;
    }

    const status = invoice.status as InvoiceStatus;
    statusCounts[status]++;

    const invoiceAmountText = reportFormatters
      ? reportFormatters.formatCurrency(invoice.invoiceAmount)
      : '—';

    const allocatedAmountValueText = reportFormatters
      ? reportFormatters.formatCurrency(invoice.allocatedAmount)
      : '—';

    const statusText = isOverview ? reportT(`sources.lines.invoiceStatus.${status}`) : null;

    // Compute allocated markers (split + deposit only; skip markers added at generation time)
    const splitMarker = splitFootnotesByInvoiceId.get(invoice.invoiceId);
    const depositMarker = depositFootnotesByInvoiceId.get(invoice.invoiceId);
    let allocatedMarkers = '';
    if (splitMarker) {
      allocatedMarkers += `†${splitMarker}`;
    }
    if (depositMarker) {
      allocatedMarkers += `‡${depositMarker.num}`;
    }

    const refundNoteText = reportT('sourceReports.table.refundNote');
    const usageText = getUsageText(invoice);
    const attachmentsNote = getAttachmentNote(invoice, reportT);

    rows.push({
      invoiceId: invoice.invoiceId,
      vendor: invoice.vendorName,
      invoiceNumber: invoice.invoiceNumber ?? '—',
      dateText: reportFormatters ? reportFormatters.formatDate(invoice.date) : invoice.date,
      status: isOverview ? status : null,
      statusText,
      invoiceAmountText,
      allocatedAmountValueText,
      allocatedMarkers,
      isRefund: invoice.lineKind === 'refund-adjustment',
      refundNoteText,
      usageText,
      attachmentsNote,
    });
  }

  // Build summary rows (subtotal per status + total)
  const summaryRows: ReportContentSummaryRow[] = [];
  const statusLabels: Record<InvoiceStatus, string> = {
    pending: 'sources.lines.invoiceStatus.pending',
    paid: 'sources.lines.invoiceStatus.paid',
    claimed: 'sources.lines.invoiceStatus.claimed',
    quotation: 'sources.lines.invoiceStatus.quotation',
  };

  for (const [status] of Object.entries(statusCounts)) {
    const count = statusCounts[status as InvoiceStatus];
    if (count > 0) {
      const invoicesWithStatus = report.invoices.filter(
        (inv) => inv.status === status && includedInvoiceIds.has(inv.invoiceId),
      );
      const subtotal = invoicesWithStatus.reduce((sum, inv) => sum + inv.allocatedAmount, 0);

      const amountText = reportFormatters ? reportFormatters.formatCurrency(subtotal) : '—';
      const label = `${reportT(statusLabels[status as InvoiceStatus])} ${reportT('sourceReports.table.subtotal')}`;
      const key = `subtotal-${status}`;

      summaryRows.push({ key, label, amountText });
    }
  }

  // Add total row
  const includedTotal = report.invoices
    .filter((inv) => includedInvoiceIds.has(inv.invoiceId))
    .reduce((sum, inv) => sum + inv.allocatedAmount, 0);

  const totalAmountText = reportFormatters ? reportFormatters.formatCurrency(includedTotal) : '—';
  summaryRows.push({
    key: 'total',
    label: reportT('sourceReports.table.total'),
    amountText: totalAmountText,
  });

  // Build footnotes (split + deposit blocks; skip footnotes added at generation time)
  const footnotes: ReportContentFootnote[] = [];

  // Split block
  for (const [invoiceId, splitNum] of splitFootnotesByInvoiceId) {
    const invoice = report.invoices.find((inv) => inv.invoiceId === invoiceId);
    const vendorName = invoice?.vendorName ?? '—';
    const invoiceNumber = invoice?.invoiceNumber ?? '—';

    footnotes.push({
      id: `split-${splitNum}`,
      marker: `†${splitNum}`,
      text: `${vendorName} (${invoiceNumber}) — ${reportT('sourceReports.table.splitFootnote')}`,
    });
  }

  // Deposit block
  for (const [invoiceId, depositMarker] of depositFootnotesByInvoiceId) {
    const invoice = report.invoices.find((inv) => inv.invoiceId === invoiceId);
    const vendorName = invoice?.vendorName ?? '—';
    const invoiceNumber = invoice?.invoiceNumber ?? '—';
    const wordingKey =
      depositMarker.wording === 'constituted'
        ? 'depositConstitutedFootnote'
        : 'depositReducedFootnote';

    footnotes.push({
      id: `deposit-${depositMarker.num}`,
      marker: `‡${depositMarker.num}`,
      text: `${vendorName} (${invoiceNumber}) — ${reportT(`sourceReports.table.${wordingKey}`)}`,
    });
  }

  // Build cover letter (if enabled)
  let coverLetter: ReportContentCoverLetter | null = null;
  if (includeCoverLetter) {
    const dateLine = reportFormatters ? reportFormatters.formatDate(todayStr) : todayStr;

    const senderLines = [];
    if (household?.householdName) senderLines.push(household.householdName);
    if (household?.householdAddress) senderLines.push(household.householdAddress);
    const sender = senderLines.join('\n');

    const subject = reportT(`sourceReports.coverLetter.subject.${useCase}`);
    const bodyKey = `sourceReports.coverLetter.body.${useCase}`;
    const body = reportT(bodyKey, { total: totalAmountText });
    const signature = sender.split('\n')[0]?.trim() ?? '';

    coverLetter = {
      sender,
      recipient: report.source.contactAddress ?? null,
      dateLine,
      reference: report.source.reference ?? null,
      subject,
      body,
      signature,
    };
  }

  return {
    isOverview,
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
      source: reportT('sourceReports.table.source'),
      sourceType: reportT('sourceReports.table.sourceType'),
      reference: reportT('sourceReports.table.reference'),
      generatedAt: reportT('sourceReports.table.generatedAt'),
    },
    sourceInfo,
    coverLetter,
    rows,
    summaryRows,
    footnotes,
  };
}
