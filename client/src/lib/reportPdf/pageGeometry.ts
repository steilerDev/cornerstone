/**
 * Page and table geometry for the pdfmake report layer. Single source of truth for every
 * constant that #1929's round-2 fix requires to be *computed*, not hand-derived in a comment
 * (see #1929 architect review: a hand-derived bound that restates its own derivation cannot
 * catch an error in that derivation — and one shipped in round 1, see PAGE_TOP_MARGIN below).
 *
 * DIRECTIONAL RULE (#1939, resolving the note #1929 round-3 left here): `PDF_STYLES` is defined
 * in THIS module (below) rather than in merge.ts, precisely so the font-size literals it needs
 * (header/subheader sizes above, TABLE_HEADER_FONT_SIZE/TABLE_BODY_FONT_SIZE/
 * TABLE_SMALL_FONT_SIZE below) are the same constants this module's own geometry math consumes —
 * one definition, not two drifting copies (the same risk PAGE_TOP_MARGIN was fixed against).
 * merge.ts imports `PDF_STYLES` from here and re-exports it for its own consumers. This module
 * must never import from merge.ts — merge.ts already imports geometry from this file, and
 * reversing that edge would create a circular import.
 *
 * PDF_STYLES SPLIT TRIGGER (#1953): `letterSubject` (below) is the first `PDF_STYLES` entry with
 * NO geometry consumer at all — nothing in this module's math reads its font size, unlike every
 * other style here. That's not a problem by itself and does NOT warrant splitting `PDF_STYLES`
 * out of this module yet. The trigger for when it does: the SECOND style entry with no geometry
 * consumer. When that happens, move `PDF_STYLES` into its own `pdfStyles.ts` that imports geometry
 * constants from this module and is re-exported by merge.ts — i.e. `pageGeometry <- pdfStyles <-
 * merge`, preserving the edge direction fixed above. Until then, leave it here.
 */
import type { Style } from 'pdfmake/build/pdfmake';

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
 * Table header-row font size, pt — consumed by `PDF_STYLES.tableHeader` below (#1939 relocated
 * `PDF_STYLES` into this module, see the file header comment) and by overviewPdf.ts's header
 * word-break threshold (#1929 round-3 architect review HIGH1), so both read the same constant
 * instead of a duplicated literal (the same drift risk the architect flagged for PAGE_TOP_MARGIN
 * in round 2 — see M5 in shared.ts's git history).
 */
export const TABLE_HEADER_FONT_SIZE = 10;

/**
 * Font size, pt, for the 'small' style. Consumed by `PDF_STYLES.small` below for the same
 * single-source-of-truth reason as TABLE_HEADER_FONT_SIZE above. Its live consumers are the
 * report's secondary text: source-info/footnote blocks (overviewPdf.ts), the cover letter's
 * date/reference lines (coverLetterPdf.ts), and the running page header/footer (shared.ts).
 *
 * NOT the Usage column: #1929 round 4 briefly rendered areaText/attachmentsNote continuation rows
 * at this size, but #1959 moved that content inline into the Usage cell at TABLE_BODY_FONT_SIZE
 * (8pt), and the fix round bounded it with the usage budget. Nothing in the Usage column is 9pt.
 */
export const TABLE_SMALL_FONT_SIZE = 9;

export const DEFAULT_LINE_HEIGHT = 1.4; // matches merge.ts's defaultStyle.lineHeight

// --- Header footprint (AC6/AC7/AC13) ---
const HEADER_FONT_SIZE = 14; // PDF_STYLES.header, below
const SUBHEADER_FONT_SIZE = 12; // PDF_STYLES.subheader, below
const SUBHEADER_MARGIN_TOP = 4; // PDF_STYLES.subheader margin, below
const HEADER_BLOCK_BOTTOM_MARGIN = 20; // buildPageHeader's own margin: [0,0,0,20]
const HEADER_TOP_GAP = 15; // visible separation kept above the computed footprint

// --- Cover letter typography (#1953) — NOT page-geometry arithmetic; no geometry consumer ---
/**
 * Cover letter subject-line font size, pt — PDF_STYLES.letterSubject below, only. This equals
 * SUBHEADER_FONT_SIZE (12) above by COINCIDENCE, not by design: it is deliberately its own
 * literal, not derived from or aliased to SUBHEADER_FONT_SIZE, and changing one must NOT change
 * the other (#1953). SUBHEADER_FONT_SIZE is load-bearing footprint arithmetic that feeds
 * headerFootprint() and, through it, PAGE_TOP_MARGIN below; LETTER_SUBJECT_FONT_SIZE is plain
 * letter typography with no geometry consumer. Reusing the header's constant here would silently
 * couple a future header-spacing fix (or subject-line legibility tweak) to the other's page
 * layout — see #1953 for the incident this constant exists to prevent.
 */
const LETTER_SUBJECT_FONT_SIZE = 12; // PDF_STYLES.letterSubject, below

/**
 * Shared pdfmake document-definition style dictionary. Relocated here from merge.ts (#1939, AC8/
 * AC9) so its font-size literals (`tableHeader`, `tableCell`, `small`, `header`, `subheader`) are
 * drawn from the SAME constants this module's own header-footprint and table-geometry math
 * consumes, rather than a second copy of the same numbers — see the module header comment above.
 * merge.ts imports and re-exports this for its own consumers (its `createPdf()` call and its
 * tests). Typed explicitly as `Record<string, Style>` / `Style` (from `pdfmake/build/pdfmake`)
 * because an untyped object literal here would widen `alignment: 'left'` to `string` outside
 * `createPdf()`'s contextual typing — preserve this typing if this is edited further.
 */
export const PDF_STYLES: Record<string, Style> = {
  normal: {
    fontSize: 11,
  },
  title: {
    fontSize: 16,
    bold: true,
    color: '#1f2937',
  },
  subheader: {
    fontSize: SUBHEADER_FONT_SIZE,
    color: '#6b7280',
    margin: [0, SUBHEADER_MARGIN_TOP, 0, 0],
  },
  header: {
    fontSize: HEADER_FONT_SIZE,
    bold: true,
    color: '#111827',
  },
  tableHeader: {
    bold: true,
    fontSize: TABLE_HEADER_FONT_SIZE,
    color: '#ffffff',
    fillColor: '#1f2937',
    alignment: 'left',
  },
  tableCell: {
    fontSize: TABLE_BODY_FONT_SIZE,
  },
  small: {
    fontSize: TABLE_SMALL_FONT_SIZE,
    color: '#6b7280',
  },
  letterSubject: {
    fontSize: LETTER_SUBJECT_FONT_SIZE,
    bold: true,
    color: '#111827', // matches PDF_STYLES.header's color — same "this is important" dark tone
  },
};

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
 * font sizes in PDF_STYLES above automatically keeps this margin correct (#1929 architect review
 * Q2: a bound that only restates its own derivation can't catch an error in it).
 */
export const PAGE_TOP_MARGIN = Math.ceil(headerFootprint() + HEADER_TOP_GAP); // 93

export function printableHeight(): number {
  return PAGE_HEIGHT - PAGE_TOP_MARGIN - PAGE_MARGIN_BOTTOM;
}
