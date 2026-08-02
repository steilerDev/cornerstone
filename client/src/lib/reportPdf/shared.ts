/**
 * Shared utilities for PDF report generation.
 */
import type { Content } from 'pdfmake/build/pdfmake';

/**
 * Refund text color for PDF tables (dark red).
 */
export const REFUND_TEXT_COLOR = '#991b1b';

/**
 * Deposit note text color for PDF tables (gray).
 */
export const DEPOSIT_NOTE_TEXT_COLOR = '#6b7280';

/**
 * Deposit note font size for PDF tables (points).
 */
export const DEPOSIT_NOTE_FONT_SIZE = 8;

/**
 * Builds a page header for the PDF (title, source name, generated timestamp).
 */
export function buildPageHeader(
  reportTypeLabel: string,
  sourceName: string,
  generatedAtLabel: string,
): Content {
  return {
    columns: [
      {
        stack: [
          { text: reportTypeLabel, style: 'header' },
          { text: sourceName, style: 'subheader' },
        ],
      },
      {
        text: generatedAtLabel,
        alignment: 'right',
        style: 'small',
      },
    ],
    margin: [0, 0, 0, 20],
  };
}

/**
 * Builds a page footer function for pdfmake (returns current page # of total).
 */
export function buildPageFooter(
  pageLabel: string,
): (currentPage: number, pageCount: number) => Content {
  return (currentPage: number, pageCount: number) => ({
    text: `${pageLabel} ${currentPage} / ${pageCount}`,
    alignment: 'center',
    style: 'small',
    margin: [0, 20, 0, 0],
  });
}

/**
 * pdfmake table layout for invoice tables.
 */
export const TABLE_LAYOUT = {
  hLineWidth: () => 0.5,
  vLineWidth: () => 0.5,
  hLineColor: '#d1d5db',
  vLineColor: '#d1d5db',
  paddingLeft: () => 8,
  paddingRight: () => 8,
  paddingTop: () => 6,
  paddingBottom: () => 6,
  dontBreakRows: true,
} as const;

/**
 * Top page margin (points) for the report PDF — sized to fit buildPageHeader's rendered
 * content in full, with a visible gap before the first body element on pages after the
 * first (see #1929: the previous hardcoded 40pt top margin was smaller than the header's
 * own rendered height, so the running header clipped its generated-at text and overlapped
 * the first table row on multi-page reports).
 *
 * Header footprint at the pdfmake `styles` defined in merge.ts (defaultStyle.lineHeight: 1.4):
 *   header line (14pt * 1.4)             = 19.6pt
 *   subheader style margin-top           =  4.0pt
 *   subheader line (12pt * 1.4)          = 16.8pt
 *   buildPageHeader's own outer margin   = 20.0pt  ([0, 0, 0, 20] bottom)
 *   ---------------------------------------------
 *   total header footprint               = 60.4pt
 *
 * PAGE_TOP_MARGIN leaves ~15pt of visible separation above that footprint. If the header/
 * subheader font sizes, line height, or margins in merge.ts's `styles` object ever change,
 * recompute this value — see shared.test.ts and merge.test.ts for the tests that pin it.
 */
export const PAGE_TOP_MARGIN = 75;
