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
import {
  TABLE_BODY_FONT_SIZE,
  TABLE_HEADER_FONT_SIZE,
  DEFAULT_LINE_HEIGHT,
  usableColumnWidth,
} from './pageGeometry.js';

// Fixed point widths (pt) for the narrow, bounded-content columns shared by both table shapes.
// #1929 round-3 architect review measured these directly against a real render (not the
// 0.495em/char scaling estimate that produced round 2's numbers) and confirmed CLOSED:
// DATE_WIDTH holds "15.02.2026" (40.19pt) / "02/15/2026"; INVOICE_NUMBER_WIDTH holds
// "2026-RE-004711" (58.86pt) / "RG-2026-00123-A" (62.70pt). Do not re-derive these from the
// 0.495em estimate — they are pinned by measurement.
const VENDOR_WIDTH = 45;
const INVOICE_NUMBER_WIDTH = 63;
const DATE_WIDTH = 46;
const STATUS_WIDTH = 40; // budget-overview (7-col) only; no per-line-char AC, wraps freely
const INVOICE_AMOUNT_WIDTH = 48;
const ALLOCATED_AMOUNT_WIDTH = 75; // value+markers (~57pt) + " (Abschlagszahlung)" badge (72.9pt)
// both hold; "Zugeordneter Betrag" header wraps at its internal space ("Zugeordneter"=60.42pt,
// "Betrag"=29.42pt — both < 75pt) so it never needs word-breaking either.

/**
 * Usage column width (both shapes) — an EXPLICIT NUMERIC width computed from
 * usableColumnWidth(), never `'*'`. #1929 round-3 architect review CRITICAL/HIGH1:
 * `columnCalculator.js:52` reads `elasticWidth` to grow a column past its declared width, but
 * nothing in pdfmake ever assigns it — so numeric widths are honoured unconditionally, while a
 * `'*'` column's case-1 branch ("sum of minimum widths >= available width") forces it to its
 * content's widest-unbreakable-word floor, pushing the WHOLE TABLE past printableWidth(). With
 * every column numeric, that branch is structurally unreachable and the table's total rendered
 * width is printableWidth() for ANY input — not just the content this file happens to test with.
 * Computed (not hand-verified against a comment) so a future column-width edit can't silently
 * invalidate the invariant: `tableOffsetsTotal(n) + fixedSum(n) + USAGE_WIDTH_*COL ===
 * printableWidth()` holds by construction, algebraically, for both shapes.
 */
const USAGE_FIXED_SUM_7COL =
  VENDOR_WIDTH +
  INVOICE_NUMBER_WIDTH +
  DATE_WIDTH +
  STATUS_WIDTH +
  INVOICE_AMOUNT_WIDTH +
  ALLOCATED_AMOUNT_WIDTH;
const USAGE_FIXED_SUM_6COL =
  VENDOR_WIDTH + INVOICE_NUMBER_WIDTH + DATE_WIDTH + INVOICE_AMOUNT_WIDTH + ALLOCATED_AMOUNT_WIDTH;
export const USAGE_WIDTH_7COL = usableColumnWidth(7) - USAGE_FIXED_SUM_7COL; // 138.28pt
export const USAGE_WIDTH_6COL = usableColumnWidth(6) - USAGE_FIXED_SUM_6COL; // 186.78pt

/**
 * Worst-case single-character advance, as a fraction of font size (em), measured directly via
 * real pdfmake renders scanning the full Latin+German charset (A-Z, a-z, umlauts/eszett, digits,
 * punctuation) at both the body (8pt regular) and header (10pt bold) table fonts (#1929 round-3
 * architect review HIGH2: the previous 0.495em AVERAGE ratio under-flagged all-caps/M-W-heavy
 * tokens by ~45% — a 32-char all-uppercase Usage token measured 538.57pt against a 515.28pt
 * page). Measured maxima: 'W' = 7.098pt at 8pt regular (0.8872em); 'W' = 8.804pt at 10pt bold
 * (0.8804em). 0.89em is used uniformly for both — safely above every character scanned, in
 * either font. Over-flagging a token as needing `wordBreak: 'break-all'` is harmless (see
 * buildUsageTextRuns); under-flagging causes the exact overflow this exists to prevent, so this
 * value is rounded UP, not to the nearest measured figure.
 */
const WORST_CASE_CHAR_ADVANCE_EM = 0.89;
const BODY_WORST_CASE_CHAR_WIDTH_PT = TABLE_BODY_FONT_SIZE * WORST_CASE_CHAR_ADVANCE_EM; // 7.12pt
const HEADER_WORST_CASE_CHAR_WIDTH_PT = TABLE_HEADER_FONT_SIZE * WORST_CASE_CHAR_ADVANCE_EM; // 8.9pt

/**
 * A single Usage cell whose text exceeds this length is split into multiple table rows (see
 * splitIntoPageSafeChunks) rather than rendered as one unbreakable row. pdfmake's dontBreakRows
 * does not paginate an over-tall row — it silently drops what doesn't fit the current page
 * (#1929 architect review, HIGH 4). Per the product-owner's precedence ruling (I1 "no character
 * is ever lost" outranks I3 "each row on one page"), a row that genuinely cannot fit one page
 * must still render completely, even if that means it spans pages.
 *
 * MEASURED CEILING (AC12, #1929 round-3 architect review HIGH3): the round-2 value of 1200
 * assumed near-perfect line packing at an AVERAGE glyph width and left ~0% real margin —
 * measured at exactly 1200 chars of dense content, the row already overflowed one page. This
 * value was instead measured directly against a real render of the production table shape
 * (7-column, `headerRows: 1` with word-break-protected header cells, one populated content row,
 * then a Usage-only continuation row placed where `dontBreakRows` would defer it — a fresh
 * page), using the theoretical worst case: a single unbroken run of 'W' (the widest character in
 * the font) with NO whitespace at all, so every line packs to exactly the column's worst-case
 * character count with no slack. Measured ceiling: 836 characters. This constant sits ~16%
 * below that measured ceiling (not a re-derived estimate) and comfortably above AC12's
 * 600-character zero-degradation requirement.
 */
export const MAX_SAFE_USAGE_CHUNK_CHARS = 700;

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
 * A whitespace-free run at or under this many characters is guaranteed to fit on one line within
 * the given column width, EVEN IN THE WORST CASE (every character as wide as 'W'), and renders
 * with pdfmake's default (whitespace-only) wrapping. A run over this length gets
 * `wordBreak: 'break-all'` applied to itself alone, so it can wrap mid-character instead of
 * forcing a fixed-width column's content past its declared width (#1929 CRITICAL 2 / AC1 / AC2 —
 * AC2 permits breaking a word "only when it is wider than its column on its own"; pdfmake has no
 * intermediate "break long words only" mode, just 'normal' (whitespace-only) and 'break-all'
 * (every character), so it must be scoped per-run via a `text:` run array, never applied to a
 * whole cell — TextBreaker.js:15-40 confirms 'break-all' tokenizes per character;
 * StyleContextStack.js:160-165 confirms `wordBreak` is resolved per text-run item before falling
 * back to the style dictionary, so an ordinary run with no `wordBreak` set is unaffected).
 *
 * Deliberately conservative: uses BODY_WORST_CASE_CHAR_WIDTH_PT (0.89em, not an average — see
 * that constant's comment for the round-3 architect review finding an average ratio under-flags
 * all-caps/M-W-heavy tokens). A token just under this threshold that gets `wordBreak: 'break-all'`
 * anyway is harmless (it simply never needs to break, since break-all only forces a mid-character
 * split when the token doesn't fit on one line); a token just over it that doesn't get flagged
 * causes exactly the overflow this exists to prevent — so the threshold is rounded down.
 */
function safeTokenChars(columnWidthPt: number, charWidthPt: number): number {
  return Math.floor(columnWidthPt / charWidthPt);
}

export const USAGE_SAFE_TOKEN_CHARS_7COL = safeTokenChars(
  USAGE_WIDTH_7COL,
  BODY_WORST_CASE_CHAR_WIDTH_PT,
);
export const USAGE_SAFE_TOKEN_CHARS_6COL = safeTokenChars(
  USAGE_WIDTH_6COL,
  BODY_WORST_CASE_CHAR_WIDTH_PT,
);

/**
 * Vendor column's safe-token-char threshold (body font). #1929 round-3 architect review HIGH1:
 * a real single-word German vendor name ("Elektroinstallationsbetrieb") measured 92.72pt against
 * the 45pt Vendor column — vendor names are free-form business names (unlike the system-
 * generated date/invoice-number/currency columns), so, like Usage, they need the same per-token
 * break-all protection rather than an assumption that they always fit.
 */
export const VENDOR_SAFE_TOKEN_CHARS = safeTokenChars(VENDOR_WIDTH, BODY_WORST_CASE_CHAR_WIDTH_PT);

/**
 * Splits `text` into inline pdfmake text runs. Whitespace-free runs at or under `safeTokenChars`
 * are emitted verbatim (default whitespace-only wrapping); a run over that length gets
 * `wordBreak: 'break-all'` applied to itself alone, so only that oversized token can break
 * mid-character — ordinary prose around it keeps wrapping at word boundaries. Used for the Usage
 * column, the Vendor column, and (via buildHeaderCell) every table header cell — anywhere a
 * fixed-width column's content isn't guaranteed to fit a single unbreakable token (#1929 round-3
 * architect review HIGH1: this is what "a column must at minimum accommodate its own header, or
 * apply the same per-token break-all treatment" resolves to for header cells too). Concatenating
 * every returned run's `text` reproduces `text` exactly — whitespace runs are preserved verbatim
 * and no character is ever added or dropped (#1929 I1).
 */
export function buildUsageTextRuns(text: string, safeTokenCharsForColumn: number): Content[] {
  const tokens = text.split(/(\s+)/); // capturing group keeps whitespace as its own tokens
  const runs: Content[] = [];
  for (const token of tokens) {
    if (token.length === 0) continue;
    const isWhitespace = /^\s+$/.test(token);
    if (!isWhitespace && token.length > safeTokenCharsForColumn) {
      runs.push({ text: token, wordBreak: 'break-all' });
    } else {
      runs.push({ text: token });
    }
  }
  return runs.length > 0 ? runs : [{ text: '' }];
}

/**
 * Builds a table header cell whose text is protected against HIGH1's overflow the same way
 * Usage/Vendor body cells are. #1929 round-3 architect review measured two German header labels
 * as single (space-free) tokens wider than their fixed columns — "Auftragnehmer" (vendor header)
 * at 67.50pt against a 45pt column, "Rechnungsbetrag" (invoiceAmount header) at 78.66pt against a
 * 48pt column — and `elasticWidth` never grows a fixed column to fit them (columnCalculator.js:52
 * is read but assigned nowhere). Widening every column to fit its own header outright was
 * evaluated and rejected: doing so for just these two columns already consumes enough of
 * usableColumnWidth(7) to push Usage under AC3's ~30-char floor, and AllocatedAmount's
 * multi-word header ("Zugeordneter Betrag") already wraps safely at its own space without any
 * column change. Applying `buildUsageTextRuns` uniformly to every header cell (both locales)
 * instead preserves the full Usage budget and is harmless wherever a label already fits.
 */
function buildHeaderCell(text: string, columnWidthPt: number, alignment?: 'right'): Content {
  const runs = buildUsageTextRuns(
    text,
    safeTokenChars(columnWidthPt, HEADER_WORST_CASE_CHAR_WIDTH_PT),
  );
  return alignment
    ? { text: runs, style: 'tableHeader', alignment }
    : { text: runs, style: 'tableHeader' };
}

/**
 * Conservative worst-case height (pt) of the table's own repeating header row (`headerRows: 1`).
 * Exported for #1932 (cover-letter overhaul) to reuse rather than re-deriving its own version of
 * this — per the architect's round-3 review note. Computed, not independently re-measured per
 * render: the narrowest fixed column (Vendor, 45pt) holding its longest bare header word,
 * "Auftragnehmer" (13 characters, no internal whitespace), broken across
 * `ceil(13 / safeTokenChars(VENDOR_WIDTH, header ratio))` lines at the header font's line height,
 * plus the table's own vertical cell padding (paddingTop(6) + paddingBottom(6) from
 * shared.ts's TABLE_LAYOUT — not yet parametrized in pageGeometry.ts). #1929's own
 * MAX_SAFE_USAGE_CHUNK_CHARS does not depend on this being exact — it was pinned directly
 * against a real multi-row render instead (see that constant's comment); treat this export as a
 * documented estimate for reuse, not a load-bearing measurement.
 */
const HEADER_ROW_VERTICAL_PADDING_PT = 12; // shared.ts TABLE_LAYOUT paddingTop(6) + paddingBottom(6)
const VENDOR_HEADER_WORST_CASE_LINES = Math.ceil(
  'Auftragnehmer'.length / safeTokenChars(VENDOR_WIDTH, HEADER_WORST_CASE_CHAR_WIDTH_PT),
);
export const HEADER_ROW_HEIGHT =
  VENDOR_HEADER_WORST_CASE_LINES * (TABLE_HEADER_FONT_SIZE * DEFAULT_LINE_HEIGHT) +
  HEADER_ROW_VERTICAL_PADDING_PT;

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

  // Build table columns — every header cell goes through buildHeaderCell so a single-word label
  // wider than its column (#1929 round-3 architect review HIGH1) breaks mid-character instead of
  // overflowing; harmless for labels that already fit.
  const usageWidth = reportContent.isOverview ? USAGE_WIDTH_7COL : USAGE_WIDTH_6COL;
  const columns: Content[] = [
    buildHeaderCell(reportContent.labels.vendor, VENDOR_WIDTH),
    buildHeaderCell(reportContent.labels.invoiceNumber, INVOICE_NUMBER_WIDTH),
    buildHeaderCell(reportContent.labels.date, DATE_WIDTH),
  ];

  // Add status column only if budget-overview
  if (reportContent.isOverview) {
    columns.push(buildHeaderCell(reportContent.labels.status, STATUS_WIDTH));
  }

  columns.push(
    buildHeaderCell(reportContent.labels.invoiceAmount, INVOICE_AMOUNT_WIDTH, 'right'),
    buildHeaderCell(reportContent.labels.allocatedAmount, ALLOCATED_AMOUNT_WIDTH, 'right'),
    buildHeaderCell(reportContent.labels.usage, usageWidth),
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
      // Vendor names are free-form business names (unlike invoiceNumber/dateText, which are
      // system-generated and bounded) — protected with the same per-token break-all treatment
      // as Usage (#1929 round-3 architect review HIGH1: "Elektroinstallationsbetrieb" measured
      // 92.72pt against the 45pt Vendor column).
      { text: buildUsageTextRuns(contentRow.vendor, VENDOR_SAFE_TOKEN_CHARS), style: 'tableCell' },
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
      // Usage is an explicit NUMBER (usageWidth), never '*' — #1929 round-3 architect review
      // CRITICAL/HIGH1: pdfmake never grows a fixed column past its declared width
      // (elasticWidth is read but assigned nowhere), so declaring every column numeric makes
      // the star column's content-driven overflow branch (columnCalculator.js's case-1) simply
      // unreachable — the table's total rendered width is printableWidth() for any input.
      widths: reportContent.isOverview
        ? [
            VENDOR_WIDTH,
            INVOICE_NUMBER_WIDTH,
            DATE_WIDTH,
            STATUS_WIDTH,
            INVOICE_AMOUNT_WIDTH,
            ALLOCATED_AMOUNT_WIDTH,
            usageWidth,
          ]
        : [
            VENDOR_WIDTH,
            INVOICE_NUMBER_WIDTH,
            DATE_WIDTH,
            INVOICE_AMOUNT_WIDTH,
            ALLOCATED_AMOUNT_WIDTH,
            usageWidth,
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
