/**
 * Page and table geometry for the pdfmake report layer. Single source of truth for every
 * constant that #1929's round-2 fix requires to be *computed*, not hand-derived in a comment
 * (see #1929 architect review: a hand-derived bound that restates its own derivation cannot
 * catch an error in that derivation — and one shipped in round 1, see PAGE_TOP_MARGIN below).
 *
 * NOTE for #1932 (cover-letter overhaul, deferred here per round-3 architect review): merge.ts's
 * `PDF_STYLES` duplicates several font-size literals this module also needs (header/subheader
 * font sizes above, TABLE_HEADER_FONT_SIZE/TABLE_SMALL_FONT_SIZE below) — the same drift risk
 * PAGE_TOP_MARGIN itself was fixed against. Resolving it means moving `PDF_STYLES`'s definition
 * DOWN into this module (or a shared module this one doesn't depend on) so merge.ts imports it
 * from here, not the other way around — this file must never import from merge.ts, since merge.ts
 * already imports from this file and reversing that edge creates a circular import.
 */

export const PAGE_WIDTH = 595.28; // A4, pt
export const PAGE_HEIGHT = 841.89; // A4, pt
export const PAGE_MARGIN_X = 40; // left/right page margin, pt
export const PAGE_MARGIN_BOTTOM = 60; // pt

/**
 * pdfmake table cell padding (left/right) and vertical border width, pt. Reduced from the
 * previous 8pt padding — see tableOffsetsTotal below; this reclaims budget for the Usage column
 * without touching any content-bearing width (#1929 CRITICAL 2 / AC1 / AC3).
 */
export const CELL_PADDING_X = 4;
export const V_LINE_WIDTH = 0.5;

/**
 * Table body font size, pt. Lowered from 10pt to the AC3-mandated floor to reclaim further
 * budget for the Usage column. Do not go below this — AC3: "The table body font must not be
 * reduced below 8pt."
 */
export const TABLE_BODY_FONT_SIZE = 8;

/**
 * Table header-row font size, pt — extracted from merge.ts's `PDF_STYLES.tableHeader` so
 * overviewPdf.ts's header word-break threshold (#1929 round-3 architect review HIGH1) is
 * computed from the same constant merge.ts renders with, not a duplicated literal (the same
 * drift risk the architect flagged for PAGE_TOP_MARGIN in round 2 — see M5 in shared.ts's git
 * history — relocated here if left unparametrized).
 */
export const TABLE_HEADER_FONT_SIZE = 10;

/**
 * Font size, pt, for the 'small' style used by the Usage column's areaText/attachmentsNote
 * continuation rows (#1929 round-4 architect review HIGH — see overviewPdf.ts's
 * MAX_SAFE_SMALL_CHUNK_CHARS). Extracted from merge.ts's `PDF_STYLES.small` for the same
 * single-source-of-truth reason as TABLE_HEADER_FONT_SIZE above.
 */
export const TABLE_SMALL_FONT_SIZE = 9;

export const DEFAULT_LINE_HEIGHT = 1.4; // matches merge.ts's defaultStyle.lineHeight

// --- Header footprint (AC6/AC7/AC13) ---
const HEADER_FONT_SIZE = 14; // merge.ts styles.header
const SUBHEADER_FONT_SIZE = 12; // merge.ts styles.subheader
const SUBHEADER_MARGIN_TOP = 4; // merge.ts styles.subheader margin
const HEADER_BLOCK_BOTTOM_MARGIN = 20; // buildPageHeader's own margin: [0,0,0,20]
const HEADER_TOP_GAP = 15; // visible separation kept above the computed footprint

export function printableWidth(): number {
  return PAGE_WIDTH - 2 * PAGE_MARGIN_X; // 515.28
}

/**
 * pdfmake reserves (2*CELL_PADDING_X + V_LINE_WIDTH) per column plus one extra V_LINE_WIDTH for
 * the table's trailing border before distributing declared widths (DocMeasure.js:531-546).
 * Declared column widths are CONTENT widths, not the space they occupy on the page — this is
 * what round 1 got wrong by 2.7x (#1929 architect review, HIGH 3). Verified pdfmake@0.3.11.
 */
export function tableOffsetsTotal(columnCount: number): number {
  return columnCount * (2 * CELL_PADDING_X + V_LINE_WIDTH) + V_LINE_WIDTH;
}

export function usableColumnWidth(columnCount: number): number {
  return printableWidth() - tableOffsetsTotal(columnCount);
}

/**
 * Header footprint, budgeted for a TWO-LINE subheader — sourceName is unbounded user data and
 * must not be assumed to fit on one line (#1929 AC13; e.g. "Kreditanstalt fuer Wiederaufbau
 * Foerderprogramm 261 Wohngebaeude Kredit 4711" -> 442.5pt against a 257.64pt column).
 *   header line:            HEADER_FONT_SIZE * DEFAULT_LINE_HEIGHT                          = 19.6pt
 *   subheader (2 lines):    SUBHEADER_MARGIN_TOP + 2*(SUBHEADER_FONT_SIZE*DEFAULT_LINE_HEIGHT) = 37.6pt
 *   buildPageHeader margin: HEADER_BLOCK_BOTTOM_MARGIN                                       = 20.0pt
 *   ---------------------------------------------------------------------------------------
 *   total                                                                                    = 77.2pt
 */
export function headerFootprint(): number {
  const headerLine = HEADER_FONT_SIZE * DEFAULT_LINE_HEIGHT;
  const subheaderTwoLines = SUBHEADER_MARGIN_TOP + 2 * (SUBHEADER_FONT_SIZE * DEFAULT_LINE_HEIGHT);
  return headerLine + subheaderTwoLines + HEADER_BLOCK_BOTTOM_MARGIN;
}

/**
 * Top page margin, pt — computed, not hand-picked, so a future change to the header/subheader
 * styles in merge.ts automatically keeps this margin correct (#1929 architect review Q2: a bound
 * that only restates its own derivation can't catch an error in it).
 */
export const PAGE_TOP_MARGIN = Math.ceil(headerFootprint() + HEADER_TOP_GAP); // 93

export function printableHeight(): number {
  return PAGE_HEIGHT - PAGE_TOP_MARGIN - PAGE_MARGIN_BOTTOM;
}
