/**
 * Overview table PDF content builder.
 * Consumes ReportContent (text only); no data derivation.
 */
import type { TFunction } from 'i18next';
import type { Content } from 'pdfmake/build/pdfmake';
import type { ReportContent, ReportContentRow } from '../reportContent/index.js';
import {
  TABLE_LAYOUT,
  REFUND_TEXT_COLOR,
  DEPOSIT_NOTE_TEXT_COLOR,
  DEPOSIT_NOTE_FONT_SIZE,
} from './shared.js';
import { TABLE_BODY_FONT_SIZE } from './pageGeometry.js';
// Note: usableColumnWidth() is not called directly in this file — the column-width constants
// below are literals whose sum against usableColumnWidth() is verified by hand (see comments)
// and pinned by pageGeometry.test.ts / overviewPdf.test.ts's real-render assertions. It remains
// exported from pageGeometry.ts for those tests to import.

// Fixed point widths (pt) for the narrow, bounded-content columns shared by both table shapes.
// Verified against the architect's #1929 review measurements (10pt Roboto), linearly scaled to
// TABLE_BODY_FONT_SIZE=8 (~0.5em/char), each with a safety buffer above its scaled content floor.
// THESE NUMBERS MUST BE CONFIRMED BY qa-integration-tester's real-render _calcWidth assertions —
// this is an estimate derived by scaling, and round 1 shipped an estimate wrong by 2.7x for a
// different reason (offsets). If measured Usage _calcWidth comes in under the AC3 floor, trim in
// this order: VENDOR_WIDTH, then STATUS_WIDTH, then INVOICE_NUMBER_WIDTH. Do not trim DATE_WIDTH
// or ALLOCATED_AMOUNT_WIDTH without re-measuring their content floors at 8pt.
const VENDOR_WIDTH = 45;
const INVOICE_NUMBER_WIDTH = 63; // holds "2026-RE-004711" / "RG-2026-00123-A" scaled to 8pt (~59-63pt)
const DATE_WIDTH = 46; // holds "15.02.2026" / "02/15/2026" scaled to 8pt (~40-43pt) + buffer
const STATUS_WIDTH = 40; // budget-overview (7-col) only; no per-line-char AC, wraps freely
const INVOICE_AMOUNT_WIDTH = 48;
const ALLOCATED_AMOUNT_WIDTH = 75; // unchanged from round 1 — architect-validated: value+markers
// (~57pt) and the " (Abschlagszahlung)" badge (72.9pt, already measured AT 8pt since
// DEPOSIT_NOTE_FONT_SIZE was already 8 before this round) both hold at this width.

// Usage column budget (both shapes), computed from usableColumnWidth() — NOT from summing the
// declared array against printableWidth() alone, which omits pdfmake's per-column offsets and
// guards nothing (#1929 architect review, HIGH 3). 7-col fixed sum = 317pt, usable = 455.28pt =>
// Usage gets 138.28pt (~34.6 chars/line @ 0.5em/8pt, >= AC3's 30-char floor with ~15% margin).
// 6-col fixed sum = 277pt, usable = 463.78pt => Usage gets 186.78pt (~46.7 chars/line).
export const USAGE_MIN_WIDTH_7COL = 130; // floor asserted by tests; under the 138.28pt estimate
export const USAGE_MIN_WIDTH_6COL = 175; // floor asserted by tests; under the 186.78pt estimate

/**
 * A single Usage cell whose text exceeds this length is split into multiple table rows (see
 * splitIntoPageSafeChunks) rather than rendered as one unbreakable row. pdfmake's dontBreakRows
 * does not paginate an over-tall row — it silently drops what doesn't fit the current page
 * (#1929 architect review, HIGH 4). Per the product-owner's precedence ruling (I1 "no character
 * is ever lost" outranks I3 "each row on one page"), a row that genuinely cannot fit one page
 * must still render completely, even if that means it spans pages.
 *
 * MEASURED CEILING (AC12): at the current Usage column width (~34.6 chars/line, 8pt, 1.4 line
 * height => 11.2pt/line), a full fresh page's printable height holds roughly 60+ lines of Usage
 * text alone — around 2000+ characters — before a row would risk exceeding one page. This
 * constant sits well below that true ceiling (~40% margin) and well above the AC12-mandated
 * 600-character zero-degradation target (2x margin), so estimation error in the chars-per-line
 * figure cannot cause a real drop. VERIFY via a real render that a row at exactly this length
 * still renders as a single unsplit row, and record the actual measured ceiling here and on the
 * issue per AC12.
 */
export const MAX_SAFE_USAGE_CHUNK_CHARS = 1200;

/**
 * Splits `text` into chunks no longer than `maxChars`, breaking only at whitespace boundaries
 * except when a single whitespace-free run itself exceeds maxChars, in which case it is
 * hard-split so the algorithm always makes forward progress. Joining the returned chunks with
 * '' reconstructs `text` exactly — no character, including whitespace, is ever dropped (#1929 I1).
 */
export function splitIntoPageSafeChunks(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];

  const tokens = text.split(/(\s+)/); // capturing group keeps whitespace as its own tokens
  const chunks: string[] = [];
  let current = '';

  for (let token of tokens) {
    while (token.length > maxChars) {
      if (current) {
        chunks.push(current);
        current = '';
      }
      chunks.push(token.slice(0, maxChars));
      token = token.slice(maxChars);
    }
    if (current.length + token.length > maxChars) {
      chunks.push(current);
      current = token;
    } else {
      current += token;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/**
 * Per-character width estimate for the Usage column at TABLE_BODY_FONT_SIZE, derived from the
 * architect's #1929 review measurement of 4.95pt/char at 10pt Roboto (~0.495em), scaled linearly
 * — same ratio used to derive the column-width constants above.
 */
const USAGE_CHAR_WIDTH_ESTIMATE = TABLE_BODY_FONT_SIZE * 0.495; // ~3.96pt/char at 8pt

/**
 * A whitespace-free run at or under this many characters is assumed to fit on one line within
 * the Usage column's guaranteed floor (USAGE_MIN_WIDTH_7COL / _6COL) and renders with pdfmake's
 * default (whitespace-only) wrapping. A run over this length gets `wordBreak: 'break-all'`
 * applied to it alone, so it can wrap mid-character instead of forcing the sole '*' column (and
 * the whole table) past printableWidth() (#1929 CRITICAL 2 / AC1 / AC2 round-2 review finding —
 * AC2 permits breaking a word "only when it is wider than its column on its own"; pdfmake has no
 * intermediate "break long words only" mode, just 'normal' (whitespace-only) and 'break-all'
 * (every character), so it must be scoped per-run via a `text:` run array, never applied to the
 * whole Usage cell — TextBreaker.js:15-40 confirms 'break-all' tokenizes per character;
 * StyleContextStack.js:160-165 confirms `wordBreak` is resolved per text-run item before falling
 * back to the style dictionary, so an ordinary run with no `wordBreak` set is unaffected).
 *
 * Deliberately conservative: floored against the column's guaranteed MINIMUM width (not the
 * roomier estimate), using a per-char width slightly above the measured average. A token just
 * under this threshold that gets `wordBreak: 'break-all'` anyway is harmless (it simply never
 * needs to break); a token just over it that doesn't get flagged causes exactly the overflow
 * this exists to prevent — so the threshold is rounded down, not to the nearest character.
 */
export const USAGE_SAFE_TOKEN_CHARS_7COL = Math.floor(
  USAGE_MIN_WIDTH_7COL / USAGE_CHAR_WIDTH_ESTIMATE,
);
export const USAGE_SAFE_TOKEN_CHARS_6COL = Math.floor(
  USAGE_MIN_WIDTH_6COL / USAGE_CHAR_WIDTH_ESTIMATE,
);

/**
 * Splits `text` into inline pdfmake text runs for the Usage column. Whitespace-free runs at or
 * under `safeTokenChars` are emitted verbatim (default whitespace-only wrapping); a run over
 * that length gets `wordBreak: 'break-all'` applied to itself alone, so only that oversized
 * token can break mid-character — ordinary prose around it keeps wrapping at word boundaries.
 * Concatenating every returned run's `text` reproduces `text` exactly — whitespace runs are
 * preserved verbatim and no character is ever added or dropped (#1929 I1).
 */
export function buildUsageTextRuns(text: string, safeTokenChars: number): Content[] {
  const tokens = text.split(/(\s+)/); // capturing group keeps whitespace as its own tokens
  const runs: Content[] = [];
  for (const token of tokens) {
    if (token.length === 0) continue;
    const isWhitespace = /^\s+$/.test(token);
    if (!isWhitespace && token.length > safeTokenChars) {
      runs.push({ text: token, wordBreak: 'break-all' });
    } else {
      runs.push({ text: token });
    }
  }
  return runs.length > 0 ? runs : [{ text: '' }];
}

export function buildOverviewContent(
  reportContent: ReportContent,
  skippedDocuments: Map<string, string[]>,
  t: TFunction,
): Content[] {
  const content: Content[] = [];

  // Title
  content.push({
    text: reportContent.tableTitle,
    style: 'title',
    margin: [0, 0, 0, 20],
  });

  // Source info (skip for claim reports)
  if (!reportContent.isClaim) {
    const sourceInfoStack: Array<Content | null> = [
      {
        text: `${reportContent.labels.source}: ${reportContent.sourceInfo.sourceName}`,
        style: 'small',
      },
      {
        text: `${reportContent.labels.sourceType}: ${reportContent.sourceInfo.sourceTypeText}`,
        style: 'small',
      },
      reportContent.sourceInfo.referenceText
        ? {
            text: `${reportContent.labels.reference}: ${reportContent.sourceInfo.referenceText}`,
            style: 'small',
          }
        : null,
      {
        text: `${reportContent.labels.generatedAt}: ${reportContent.sourceInfo.generatedAtText}`,
        style: 'small',
      },
    ];

    content.push({
      stack: sourceInfoStack.filter(Boolean) as Content[],
      margin: [0, 0, 0, 20],
    });
  }

  // Build table columns
  const columns: Content[] = [
    { text: reportContent.labels.vendor, style: 'tableHeader' },
    { text: reportContent.labels.invoiceNumber, style: 'tableHeader' },
    { text: reportContent.labels.date, style: 'tableHeader' },
  ];

  // Add status column only if budget-overview
  if (reportContent.isOverview) {
    columns.push({ text: reportContent.labels.status, style: 'tableHeader' });
  }

  columns.push(
    { text: reportContent.labels.invoiceAmount, style: 'tableHeader', alignment: 'right' },
    { text: reportContent.labels.allocatedAmount, style: 'tableHeader', alignment: 'right' },
    { text: reportContent.labels.usage, style: 'tableHeader' },
  );

  /**
   * Helper: build summary row (subtotal/total) with label at last leading index.
   */
  function buildSummaryRow(labelText: string, amountText: string): Content[] {
    const leadingCount = reportContent.isOverview ? 4 : 3;
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

  // Build table rows from reportContent.rows
  const rows: Content[][] = [columns as Content[]];

  // Track skip footnotes by invoice
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

  /**
   * Leading (vendor/invoiceNumber/date/[status]) cells for a content row. Status is pushed
   * unconditionally whenever isOverview — see AC14: a falsy statusText must still produce a
   * cell, or the row's cell count falls short of the 7-entry `widths` array and pdfmake throws
   * "Malformed table row, a cell is undefined."
   */
  function buildLeadingCells(
    contentRow: ReportContentRow,
    isOverview: boolean,
    statusText: string,
  ): Content[] {
    const cells: Content[] = [
      { text: contentRow.vendor, style: 'tableCell' },
      { text: contentRow.invoiceNumber, style: 'tableCell' },
      { text: contentRow.dateText, style: 'tableCell' },
    ];
    if (isOverview) {
      cells.push({ text: statusText, style: 'tableCell' });
    }
    return cells;
  }

  /**
   * Invoice-amount and allocated-amount cells for a content row.
   */
  function buildAmountCells(contentRow: ReportContentRow, allocatedRuns: Content[]): Content[] {
    return [
      {
        text: contentRow.invoiceAmountText,
        style: 'tableCell',
        alignment: 'right',
        color: contentRow.isRefund ? REFUND_TEXT_COLOR : undefined,
      },
      {
        text: allocatedRuns,
        style: 'tableCell',
        alignment: 'right',
        color: contentRow.isRefund ? REFUND_TEXT_COLOR : undefined,
      },
    ];
  }

  /**
   * Empty leading cells for a Usage continuation row — every column blank except Usage.
   */
  function buildEmptyLeadingCells(isOverview: boolean): Content[] {
    const cells: Content[] = [
      { text: '', style: 'tableCell' },
      { text: '', style: 'tableCell' },
      { text: '', style: 'tableCell' },
    ];
    if (isOverview) cells.push({ text: '', style: 'tableCell' });
    return cells;
  }

  /**
   * Empty amount cells for a Usage continuation row.
   */
  function buildEmptyAmountCells(): Content[] {
    return [
      { text: '', style: 'tableCell', alignment: 'right' },
      { text: '', style: 'tableCell', alignment: 'right' },
    ];
  }

  // Usage word-break threshold for this table shape (#1929 round-2 review finding: AC2 permits
  // breaking a word only when it doesn't fit its column alone — see buildUsageTextRuns).
  const usageSafeTokenChars = reportContent.isOverview
    ? USAGE_SAFE_TOKEN_CHARS_7COL
    : USAGE_SAFE_TOKEN_CHARS_6COL;

  for (const contentRow of reportContent.rows) {
    // Allocated amount with footnote markers (skip + allocated)
    const skipMarkers = skipFootnotesByInvoiceId.get(contentRow.invoiceId) ?? [];
    let markerText = '';
    for (const noteNum of skipMarkers) {
      markerText += `*${noteNum}`;
    }
    markerText += contentRow.allocatedMarkers;

    // Build allocated runs: value+markers, then optional deposit badge, then optional refund note
    const allocatedRuns: Content[] = [
      { text: `${contentRow.allocatedAmountValueText}${markerText}` },
    ];
    if (contentRow.isDeposit) {
      allocatedRuns.push({
        text: ` (${reportContent.labels.deposit})`,
        color: DEPOSIT_NOTE_TEXT_COLOR,
        fontSize: DEPOSIT_NOTE_FONT_SIZE,
      });
    }
    if (contentRow.isRefund) {
      allocatedRuns.push({ text: ` ${contentRow.refundNoteText}` });
    }

    // Usage text is split into page-safe chunks (#1929 AC2/AC4/AC12/HIGH 4): a single Usage
    // cell that is too long to safely fit one page's printable height is rendered as multiple
    // table rows instead of one unbreakable (and potentially content-dropping) row.
    const usageChunks = splitIntoPageSafeChunks(contentRow.usageText, MAX_SAFE_USAGE_CHUNK_CHARS);

    const firstUsageRuns = buildUsageTextRuns(usageChunks[0]!, usageSafeTokenChars);
    const firstUsageStack: Content[] = [{ text: firstUsageRuns, style: 'tableCell' }];
    if (usageChunks.length === 1) {
      if (contentRow.areaText) {
        firstUsageStack.push({ text: contentRow.areaText, style: 'small', margin: [0, 2, 0, 0] });
      }
      if (contentRow.attachmentsNote) {
        firstUsageStack.push({
          text: contentRow.attachmentsNote,
          style: 'small',
          margin: [0, 2, 0, 0],
        });
      }
    }
    const firstUsageCell: Content =
      firstUsageStack.length > 1
        ? { stack: firstUsageStack }
        : { text: firstUsageRuns, style: 'tableCell' };

    rows.push([
      ...buildLeadingCells(contentRow, reportContent.isOverview, contentRow.statusText ?? ''),
      ...buildAmountCells(contentRow, allocatedRuns),
      firstUsageCell,
    ]);

    // Continuation rows — only when a single Usage cell exceeds MAX_SAFE_USAGE_CHUNK_CHARS
    // (rare-by-construction: AC12 requires 600 chars with zero degradation, well under this
    // threshold). Every other column renders empty; no marker, per the product-owner's explicit
    // ruling ("No continuation marker required... do not build one").
    for (let i = 1; i < usageChunks.length; i++) {
      const isLast = i === usageChunks.length - 1;
      const chunkRuns = buildUsageTextRuns(usageChunks[i]!, usageSafeTokenChars);
      const stack: Content[] = [{ text: chunkRuns, style: 'tableCell' }];
      if (isLast) {
        if (contentRow.areaText) {
          stack.push({ text: contentRow.areaText, style: 'small', margin: [0, 2, 0, 0] });
        }
        if (contentRow.attachmentsNote) {
          stack.push({ text: contentRow.attachmentsNote, style: 'small', margin: [0, 2, 0, 0] });
        }
      }
      const cell: Content = stack.length > 1 ? { stack } : { text: chunkRuns, style: 'tableCell' };
      rows.push([
        ...buildEmptyLeadingCells(reportContent.isOverview),
        ...buildEmptyAmountCells(),
        cell,
      ]);
    }
  }

  // Add summary rows from reportContent.summaryRows
  for (const summaryRow of reportContent.summaryRows) {
    rows.push(buildSummaryRow(summaryRow.label, summaryRow.amountText));
  }

  // Add table
  content.push({
    table: {
      headerRows: 1,
      // dontBreakRows lives on the TABLE node, not on `layout` — pdfmake reads it from
      // tableNode.table.dontBreakRows (TableProcessor.js:123); placing it on TABLE_LAYOUT
      // (as round 1 did) is inert, since layout is only consumed for border/padding/fill
      // callbacks (#1929 architect review, CRITICAL 1).
      dontBreakRows: true,
      widths: reportContent.isOverview
        ? [
            VENDOR_WIDTH,
            INVOICE_NUMBER_WIDTH,
            DATE_WIDTH,
            STATUS_WIDTH,
            INVOICE_AMOUNT_WIDTH,
            ALLOCATED_AMOUNT_WIDTH,
            '*',
          ]
        : [
            VENDOR_WIDTH,
            INVOICE_NUMBER_WIDTH,
            DATE_WIDTH,
            INVOICE_AMOUNT_WIDTH,
            ALLOCATED_AMOUNT_WIDTH,
            '*',
          ],
      body: rows,
    },
    layout: TABLE_LAYOUT, // no longer carries dontBreakRows — see shared.ts
    margin: [0, 0, 0, 20],
  });

  // Add footnotes (skip block + split/deposit from reportContent.footnotes)
  const footnotes: Content[] = [];

  // Skip block (generation-time data)
  if (skippedDocuments.size > 0) {
    let skipFootnoteNum = 1;
    for (const [invoiceId, reasons] of skippedDocuments) {
      // Find vendor/invoice info from reportContent.rows
      const row = reportContent.rows.find((r) => r.invoiceId === invoiceId);
      const vendorName = row?.vendor ?? '—';
      const invoiceNumber = row?.invoiceNumber ?? '—';

      for (const reason of reasons) {
        footnotes.push({
          text: `*${skipFootnoteNum}: ${vendorName} (${invoiceNumber}) — ${t(`sourceReports.table.${reason}`)}`,
          style: 'small',
        });
        skipFootnoteNum++;
      }
    }
  }

  // Split + deposit footnotes from reportContent
  if (reportContent.footnotes.length > 0) {
    let isFirst = true;
    for (const footnote of reportContent.footnotes) {
      const content: Content = {
        text: `${footnote.marker}: ${footnote.text}`,
        style: 'small',
      };

      if (isFirst) {
        content.margin = [0, 4, 0, 0];
        isFirst = false;
      }

      footnotes.push(content);
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
