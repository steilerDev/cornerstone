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
  TABLE_SMALL_FONT_SIZE,
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
 * real pdfmake renders. SCANNED: ASCII printable (0x21-0x7E, 94 chars), German umlauts/eszett
 * (ä/ö/ü/Ä/Ö/Ü/ß), and a curated set of common typographic/currency symbols (€/£/¥/§/°/µ/dashes/
 * quote marks/×/÷/±/fractions/№) — 124 characters total, at each of the three table fonts (8pt
 * body, 9pt small, 10pt bold header). #1929 round-3 architect review HIGH2 found the original
 * 0.495em AVERAGE ratio under-flagged all-caps/M-W-heavy tokens by ~45%; round-3's fix (0.89em,
 * from 'W' = 0.8872em) was itself an UNDERCLAIM — round-4 architect review MEDIUM found '@' =
 * 0.8979em (clears round-3's 0.89em by only 0.02pt at the 6-col threshold) and '№' (U+2116,
 * Numero sign) = 1.0283em, the true maximum in this scan, at every font size tested. 1.04em is
 * used uniformly across all three font sizes — safely above every character actually scanned;
 * this is not a claim about the full Unicode range. Over-flagging a token as needing
 * `wordBreak: 'break-all'` is harmless (see buildUsageTextRuns); under-flagging causes the exact
 * overflow this exists to prevent, so this value is rounded UP, not to the nearest measured
 * figure.
 */
const WORST_CASE_CHAR_ADVANCE_EM = 1.04;
const BODY_WORST_CASE_CHAR_WIDTH_PT = TABLE_BODY_FONT_SIZE * WORST_CASE_CHAR_ADVANCE_EM; // 8.32pt
const HEADER_WORST_CASE_CHAR_WIDTH_PT = TABLE_HEADER_FONT_SIZE * WORST_CASE_CHAR_ADVANCE_EM; // 10.4pt
const SMALL_WORST_CASE_CHAR_WIDTH_PT = TABLE_SMALL_FONT_SIZE * WORST_CASE_CHAR_ADVANCE_EM; // 9.36pt

/**
 * A single Usage cell whose `usageText` exceeds this length is split into multiple table rows
 * (see splitIntoPageSafeChunks) rather than rendered as one unbreakable row. pdfmake's
 * dontBreakRows does not paginate an over-tall row — it silently drops what doesn't fit the
 * current page (#1929 architect review, HIGH 4). Per the product-owner's precedence ruling (I1
 * "no character is ever lost" outranks I3 "each row on one page"), a row that genuinely cannot
 * fit one page must still render completely, even if that means it spans pages.
 *
 * This bounds ONLY `usageText`'s own contribution to a row's height — `areaText` and
 * `attachmentsNote` are rendered on their OWN separate, independently-chunked continuation
 * row(s) (see MAX_SAFE_SMALL_CHUNK_CHARS and buildOverviewContent's row-building loop), never
 * stacked into the same cell as a usageText chunk. #1929 round-4 architect review HIGH: the
 * round-3 design stacked areaText/attachmentsNote onto the LAST usageText chunk's row, leaving
 * their COMBINED height unbounded — attachmentsNote has no maxLength anywhere (editor or
 * server) and areaText is aggregate-unbounded (N leaf areas x 200 chars each); measured
 * combinations (700-char usageText + 400-char attachmentsNote = 665.8pt; 700-char usageText +
 * 20-leaf-area areaText = 691.0pt; 2000-char attachmentsNote alone = 1119.4pt) all exceeded the
 * 634.89pt page budget and were silently dropped (rows requiring 3 and 9 pages both rendered as
 * 2). Splitting each field onto its own row means every row's Usage cell now holds AT MOST ONE
 * bounded chunk of ONE field — the quantity actually bounded is "total height of everything in
 * a row's Usage cell", not just usageText's length.
 *
 * MEASURED CEILING (AC12, #1929 round-4 architect review): measured directly against a real
 * render of the production table shape (7-column, `headerRows: 1` with word-break-protected
 * header cells, one populated content row, then a Usage-only continuation row placed where
 * `dontBreakRows` would defer it — a fresh page), using the theoretical worst case: a single
 * unbroken run of '№' (U+2116, the widest character found in the WORST_CASE_CHAR_ADVANCE_EM
 * scan) with NO whitespace at all, so every line packs to exactly the column's worst-case
 * character count with no slack. Measured ceiling: 704 characters (round-3's measurement used
 * 'W', not the true worst character, and got 836 — a near-miss this round's fix corrects). This
 * constant sits ~7.7% below that measured ceiling and ~8.3% above AC12's 600-character
 * zero-degradation requirement.
 */
export const MAX_SAFE_USAGE_CHUNK_CHARS = 650;

/**
 * An `areaText` or `attachmentsNote` value exceeding this length is split into multiple
 * continuation rows the same way an over-long `usageText` is (see MAX_SAFE_USAGE_CHUNK_CHARS).
 * Rendered at 'small' style (9pt, taller line height and wider worst-case glyphs than 'tableCell'
 * at 8pt), so it needs its OWN ceiling, not a reuse of MAX_SAFE_USAGE_CHUNK_CHARS (#1929 round-4
 * architect review HIGH — see that constant's comment for why these two fields must never share
 * a row with usageText, or with each other, in the first place).
 *
 * MEASURED CEILING: same method and production shape as MAX_SAFE_USAGE_CHUNK_CHARS, with the
 * continuation row rendered at 'small' style and the same worst-case '№' fill. Measured ceiling:
 * 546 characters. This constant sits ~17.6% below that — no AC mandates a specific floor for
 * these two fields (unlike usageText's AC12), so a larger margin is used than
 * MAX_SAFE_USAGE_CHUNK_CHARS's tighter [600, ceiling) window allows.
 */
export const MAX_SAFE_SMALL_CHUNK_CHARS = 450;

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
 * Deliberately conservative: uses BODY_WORST_CASE_CHAR_WIDTH_PT (1.04em, not an average — see
 * that constant's comment for the scanned charset and the round-3/round-4 architect review
 * findings that an average ratio, and then an insufficiently-conservative "worst case," both
 * under-flag real tokens). A token just under this threshold that gets `wordBreak: 'break-all'`
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
 * Safe-token-char threshold for the Usage column's areaText/attachmentsNote continuation rows,
 * rendered at 'small' style (9pt) — needs its own threshold rather than reusing
 * USAGE_SAFE_TOKEN_CHARS_*COL, which is derived from the body font's (8pt) worst-case glyph
 * width, narrower than 'small' (#1929 round-4 architect review HIGH).
 */
export const SMALL_SAFE_TOKEN_CHARS_7COL = safeTokenChars(
  USAGE_WIDTH_7COL,
  SMALL_WORST_CASE_CHAR_WIDTH_PT,
);
export const SMALL_SAFE_TOKEN_CHARS_6COL = safeTokenChars(
  USAGE_WIDTH_6COL,
  SMALL_WORST_CASE_CHAR_WIDTH_PT,
);

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
 * this — per the architect's round-3 review note (round-4 review: no production consumer yet,
 * grep-verified; keep as-is since it's only ever subtracted from a height budget elsewhere, so
 * over-estimating can't invert a safety check). Computed, not independently re-measured per
 * render: the narrowest fixed column (Vendor, 45pt) holding its longest bare header word,
 * "Auftragnehmer" (13 characters, no internal whitespace), broken across
 * `ceil(13 / safeTokenChars(VENDOR_WIDTH, header ratio))` lines at the header font's line height,
 * plus the table's own vertical cell padding (paddingTop(6) + paddingBottom(6) from
 * shared.ts's TABLE_LAYOUT — not yet parametrized in pageGeometry.ts). The architect directly
 * measured a real "Auftragnehmer" header row at 45.81pt (round-4 review) — this formula
 * intentionally overestimates that (currently 68pt, after round-4's WORST_CASE_CHAR_ADVANCE_EM
 * correction raised it from round-3's 54pt) rather than matching it exactly. #1929's own
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

  // Word-break thresholds for this table shape (#1929 round-2 review finding: AC2 permits
  // breaking a word only when it doesn't fit its column alone — see buildUsageTextRuns).
  const usageSafeTokenChars = reportContent.isOverview
    ? USAGE_SAFE_TOKEN_CHARS_7COL
    : USAGE_SAFE_TOKEN_CHARS_6COL;
  const smallSafeTokenChars = reportContent.isOverview
    ? SMALL_SAFE_TOKEN_CHARS_7COL
    : SMALL_SAFE_TOKEN_CHARS_6COL;

  /**
   * Pushes one continuation row (empty leading/amount cells) per chunk of `text`, at `style`.
   * Used for usageText overflow, and — separately, never combined with usageText or with each
   * other — for areaText/attachmentsNote (#1929 round-4 architect review HIGH: each field gets
   * its own row(s) so no row's Usage cell ever holds more than one bounded chunk of one field;
   * see MAX_SAFE_USAGE_CHUNK_CHARS's comment for what "bounded" means and how it was measured).
   */
  function pushChunkedRows(
    text: string,
    maxChunkChars: number,
    safeTokenCharsForStyle: number,
    style: 'tableCell' | 'small',
  ): void {
    for (const chunk of splitIntoPageSafeChunks(text, maxChunkChars)) {
      const cell: Content = { text: buildUsageTextRuns(chunk, safeTokenCharsForStyle), style };
      rows.push([
        ...buildEmptyLeadingCells(reportContent.isOverview),
        ...buildEmptyAmountCells(),
        cell,
      ]);
    }
  }

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
    // table rows instead of one unbreakable (and potentially content-dropping) row. The FIRST
    // chunk shares this invoice's leading/amount-cell row; any further chunks (rare-by-
    // construction: AC12 requires 600 chars with zero degradation, well under
    // MAX_SAFE_USAGE_CHUNK_CHARS) get their own continuation row via pushChunkedRows — no
    // "continued" marker, per the product-owner's explicit ruling.
    const usageChunks = splitIntoPageSafeChunks(contentRow.usageText, MAX_SAFE_USAGE_CHUNK_CHARS);
    const firstUsageCell: Content = {
      text: buildUsageTextRuns(usageChunks[0]!, usageSafeTokenChars),
      style: 'tableCell',
    };
    rows.push([
      ...buildLeadingCells(contentRow, reportContent.isOverview, contentRow.statusText ?? ''),
      ...buildAmountCells(contentRow, allocatedRuns),
      firstUsageCell,
    ]);
    for (let i = 1; i < usageChunks.length; i++) {
      const cell: Content = {
        text: buildUsageTextRuns(usageChunks[i]!, usageSafeTokenChars),
        style: 'tableCell',
      };
      rows.push([
        ...buildEmptyLeadingCells(reportContent.isOverview),
        ...buildEmptyAmountCells(),
        cell,
      ]);
    }

    // areaText and attachmentsNote each get their OWN continuation row(s) — never stacked into
    // the usage row's cell (#1929 round-4 architect review HIGH: attachmentsNote has no
    // maxLength anywhere, and areaText is aggregate-unbounded across N leaf areas, so their
    // combined height with usageText in one cell was unbounded and silently dropped rows that
    // needed more than one page).
    if (contentRow.areaText) {
      pushChunkedRows(
        contentRow.areaText,
        MAX_SAFE_SMALL_CHUNK_CHARS,
        smallSafeTokenChars,
        'small',
      );
    }
    if (contentRow.attachmentsNote) {
      pushChunkedRows(
        contentRow.attachmentsNote,
        MAX_SAFE_SMALL_CHUNK_CHARS,
        smallSafeTokenChars,
        'small',
      );
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
