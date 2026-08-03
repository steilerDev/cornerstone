/**
 * Shared utilities for PDF report generation.
 */
import type { Content } from 'pdfmake/build/pdfmake';
import { CELL_PADDING_X, V_LINE_WIDTH } from './pageGeometry.js';

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
 *
 * Note: `dontBreakRows` is NOT set here. pdfmake reads it from the `table` object
 * (`TableProcessor.js:123`: `tableNode.table.dontBreakRows`), never from `layout` — setting it
 * here would be inert (#1929 round-1 CRITICAL 1). It is set on the `table` node directly in
 * overviewPdf.ts.
 */
export const TABLE_LAYOUT = {
  hLineWidth: () => V_LINE_WIDTH,
  vLineWidth: () => V_LINE_WIDTH,
  hLineColor: '#d1d5db',
  vLineColor: '#d1d5db',
  paddingLeft: () => CELL_PADDING_X,
  paddingRight: () => CELL_PADDING_X,
  paddingTop: () => 6,
  paddingBottom: () => 6,
} as const;
