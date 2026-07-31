/**
 * Overview table PDF content builder.
 */
import type { TFunction } from 'i18next';
import type { Content } from 'pdfmake/build/pdfmake';
import type { SourceReportResponse, InvoiceStatus, SourceReportType } from '@cornerstone/shared';
import type { Formatters } from '../formatters.js';
import { TABLE_LAYOUT, REFUND_TEXT_COLOR } from './shared.js';

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

/**
 * Helper: build usage cell with optional attachment note.
 */
function buildUsageCell(
  invoice: {
    budgetLines: Array<{ linkedItem: { name: string } | null; description: string | null }>;
    documents: Array<{ attachmentType: string | null }>;
  },
  t: TFunction,
): Content {
  const usageText = getUsageText(invoice);
  const note = getAttachmentNote(invoice, t);

  if (!note) {
    return { text: usageText, style: 'tableCell' };
  }

  // Stack: usage text + attachment note
  return {
    stack: [
      { text: usageText, style: 'tableCell' },
      { text: note, style: 'small', margin: [0, 2, 0, 0] },
    ],
  };
}

export function buildOverviewContent(
  report: SourceReportResponse,
  includedInvoiceIds: Set<string>,
  appendixByInvoiceId: Map<string, number>,
  skippedDocuments: Map<string, string[]>,
  useCase: SourceReportType,
  t: TFunction,
  formatters?: Formatters,
  includedTotal?: number,
): Content[] {
  const content: Content[] = [];
  const isOverview = useCase === 'budget-overview';

  // Title
  const titleKey = `sourceReports.table.title.${useCase}`;
  content.push({
    text: t(titleKey),
    style: 'title',
    margin: [0, 0, 0, 20],
  });

  // Source info
  content.push({
    stack: [
      { text: `${t('sourceReports.table.source')}: ${report.source.name}`, style: 'small' },
      {
        text: `${t('sourceReports.table.sourceType')}: ${t(`sourceReports.sourceType.${report.source.sourceType}`)}`,
        style: 'small',
      },
      report.source.reference
        ? {
            text: `${t('sourceReports.table.reference')}: ${report.source.reference}`,
            style: 'small',
          }
        : null,
      {
        text: `${t('sourceReports.table.generatedAt')}: ${formatters?.formatDate(new Date().toISOString().split('T')[0]) ?? new Date().toISOString().split('T')[0]}`,
        style: 'small',
      },
    ].filter(Boolean) as Content[],
    margin: [0, 0, 0, 20],
  });

  // Build table columns
  const columns: Content[] = [
    { text: t('sourceReports.table.vendor'), style: 'tableHeader' },
    { text: t('sourceReports.table.invoiceNumber'), style: 'tableHeader' },
    { text: t('sourceReports.table.date'), style: 'tableHeader' },
  ];

  // Add status column only if budget-overview
  if (isOverview) {
    columns.push({ text: t('sourceReports.table.status'), style: 'tableHeader' });
  }

  columns.push(
    { text: t('sourceReports.table.invoiceAmount'), style: 'tableHeader', alignment: 'right' },
    { text: t('sourceReports.table.allocatedAmount'), style: 'tableHeader', alignment: 'right' },
    { text: t('sourceReports.table.usage'), style: 'tableHeader' },
  );

  /**
   * Helper: build summary row (subtotal/total) with label at last leading index.
   */
  function buildSummaryRow(labelText: string, amountText: string): Content[] {
    const leadingCount = isOverview ? 4 : 3;
    const row: Content[] = [];

    // Leading cells: empty except the last one which has the label
    for (let i = 0; i < leadingCount; i++) {
      if (i === leadingCount - 1) {
        row.push({ text: labelText, style: 'tableCell', bold: true });
      } else {
        row.push({ text: '', style: 'tableCell' });
      }
    }

    // Empty invoiceAmount cell
    row.push({ text: '', style: 'tableCell' });

    // Bold right-aligned amount
    row.push({
      text: amountText,
      style: 'tableCell',
      alignment: 'right',
      bold: true,
    });

    // Empty trailing usage cell
    row.push({ text: '', style: 'tableCell' });

    return row;
  }

  // Build table rows
  const rows: Content[][] = [columns as Content[]];
  const statusCounts: Record<InvoiceStatus, number> = {
    pending: 0,
    paid: 0,
    claimed: 0,
    quotation: 0,
  };

  // Track split and deposit footnotes with independent counters
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

  // Track skip footnotes by invoice (for marker rendering)
  const skipFootnotesByInvoiceId = new Map<string, number[]>();
  let skipFootnoteNum = 1;
  for (const [invoiceId, reasons] of skippedDocuments) {
    if (!skipFootnotesByInvoiceId.has(invoiceId)) {
      skipFootnotesByInvoiceId.set(invoiceId, []);
    }
    const noteNums = skipFootnotesByInvoiceId.get(invoiceId)!;
    for (const _reason of reasons) {
      noteNums.push(skipFootnoteNum);
      skipFootnoteNum++;
    }
  }

  for (const invoice of report.invoices) {
    if (!includedInvoiceIds.has(invoice.invoiceId)) {
      continue;
    }

    const status = invoice.status as InvoiceStatus;
    statusCounts[status]++;

    const row: Content[] = [
      { text: invoice.vendorName, style: 'tableCell' },
      { text: invoice.invoiceNumber ?? '—', style: 'tableCell' },
      { text: formatters?.formatDate(invoice.date) ?? invoice.date, style: 'tableCell' },
    ];

    // Add status cell only if budget-overview
    if (isOverview) {
      row.push({ text: t(`sources.lines.invoiceStatus.${status}`), style: 'tableCell' });
    }

    // Invoice amount
    const invoiceAmountText = formatters?.formatCurrency(invoice.invoiceAmount) ?? '—';
    if (invoice.lineKind === 'refund-adjustment') {
      row.push({
        text: invoiceAmountText,
        style: 'tableCell',
        alignment: 'right',
        color: REFUND_TEXT_COLOR,
      });
    } else {
      row.push({
        text: invoiceAmountText,
        style: 'tableCell',
        alignment: 'right',
      });
    }

    // Allocated amount with footnote markers
    const allocatedText = formatters?.formatCurrency(invoice.allocatedAmount) ?? '—';
    const skipMarkers = skipFootnotesByInvoiceId.get(invoice.invoiceId) ?? [];
    const splitMarker = splitFootnotesByInvoiceId.get(invoice.invoiceId);
    const depositMarker = depositFootnotesByInvoiceId.get(invoice.invoiceId);
    let markerText = '';
    for (const noteNum of skipMarkers) {
      markerText += `*${noteNum}`;
    }
    if (splitMarker) {
      markerText += `†${splitMarker}`;
    }
    if (depositMarker) {
      markerText += `‡${depositMarker.num}`;
    }

    if (invoice.lineKind === 'refund-adjustment') {
      row.push({
        text: `${allocatedText}${markerText} ${t('sourceReports.table.refundNote')}`,
        style: 'tableCell',
        alignment: 'right',
        color: REFUND_TEXT_COLOR,
      });
    } else {
      row.push({
        text: `${allocatedText}${markerText}`,
        style: 'tableCell',
        alignment: 'right',
      });
    }

    // No longer rendered (appendix column removed, story #1898) — kept for call-site/signature
    // stability; still used by merge.ts for PDF page embed ordering.

    // Usage cell
    row.push(buildUsageCell(invoice, t));

    rows.push(row);
  }

  // Add subtotal rows per status present
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

      const subtotalText = formatters?.formatCurrency(subtotal) ?? '—';
      const labelText = `${t(statusLabels[status as InvoiceStatus])} ${t('sourceReports.table.subtotal')}`;
      rows.push(buildSummaryRow(labelText, subtotalText));
    }
  }

  // Add total row
  const totalText = formatters?.formatCurrency(includedTotal ?? 0) ?? '—';
  rows.push(buildSummaryRow(t('sourceReports.table.total'), totalText));

  // Add table
  content.push({
    table: {
      headerRows: 1,
      widths: isOverview
        ? ['*', 'auto', 'auto', 'auto', 'auto', 'auto', '*']
        : ['*', 'auto', 'auto', 'auto', 'auto', '*'],
      body: rows,
    },
    layout: TABLE_LAYOUT,
    margin: [0, 0, 0, 20],
  });

  // Add footnotes (skip, split, deposit blocks in order)
  const footnotes: Content[] = [];

  // Skip block (unchanged)
  if (skippedDocuments.size > 0) {
    let skipFootnoteNum = 1;
    for (const [invoiceId, reasons] of skippedDocuments) {
      const invoice = report.invoices.find((inv) => inv.invoiceId === invoiceId);
      const vendorName = invoice?.vendorName ?? '—';
      const invoiceNumber = invoice?.invoiceNumber ?? '—';

      for (const reason of reasons) {
        footnotes.push({
          text: `*${skipFootnoteNum}: ${vendorName} (${invoiceNumber}) — ${t(`sourceReports.table.${reason}`)}`,
          style: 'small',
        });
        skipFootnoteNum++;
      }
    }
  }

  // Split block (first entry gets margin)
  if (splitFootnotesByInvoiceId.size > 0) {
    let isFirst = true;
    for (const [invoiceId, splitNum] of splitFootnotesByInvoiceId) {
      const invoice = report.invoices.find((inv) => inv.invoiceId === invoiceId);
      const vendorName = invoice?.vendorName ?? '—';
      const invoiceNumber = invoice?.invoiceNumber ?? '—';

      const footnote: Content = {
        text: `†${splitNum}: ${vendorName} (${invoiceNumber}) — ${t('sourceReports.table.splitFootnote')}`,
        style: 'small',
      };

      if (isFirst) {
        footnote.margin = [0, 4, 0, 0];
        isFirst = false;
      }

      footnotes.push(footnote);
    }
  }

  // Deposit block (first entry gets margin)
  if (depositFootnotesByInvoiceId.size > 0) {
    let isFirst = true;
    for (const [invoiceId, depositMarker] of depositFootnotesByInvoiceId) {
      const invoice = report.invoices.find((inv) => inv.invoiceId === invoiceId);
      const vendorName = invoice?.vendorName ?? '—';
      const invoiceNumber = invoice?.invoiceNumber ?? '—';
      const wordingKey =
        depositMarker.wording === 'constituted'
          ? 'depositConstitutedFootnote'
          : 'depositReducedFootnote';

      const footnote: Content = {
        text: `‡${depositMarker.num}: ${vendorName} (${invoiceNumber}) — ${t(`sourceReports.table.${wordingKey}`)}`,
        style: 'small',
      };

      if (isFirst) {
        footnote.margin = [0, 4, 0, 0];
        isFirst = false;
      }

      footnotes.push(footnote);
    }
  }

  if (footnotes.length > 0) {
    content.push({
      stack: footnotes,
      margin: [0, 0, 0, 0],
    });
  }

  return content;
}
