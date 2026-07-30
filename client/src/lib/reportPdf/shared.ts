/**
 * Shared utilities for PDF report generation.
 */
import type { Content } from 'pdfmake/build/pdfmake';

/**
 * Refund text color for PDF tables (dark red).
 */
export const REFUND_TEXT_COLOR = '#991b1b';

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
} as const;
