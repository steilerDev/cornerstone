/**
 * Shared utilities for PDF report generation.
 */
import type { Content } from 'pdfmake/build/pdfmake';
import { formatCurrency as fmtCurrency, formatDate as fmtDate } from '../formatters.js';

/**
 * Color palette for budget sources in PDFs (10 distinct hues).
 * Index 0 = unassigned/grey, 1-9 = source colors, matching getSourceColorIndex.
 */
export const LIGHT_SOURCE_PALETTE: string[] = [
  '#6b7280', // 0: gray (unassigned)
  '#3b82f6', // 1: blue
  '#10b981', // 2: green
  '#dc2626', // 3: red
  '#fcd34d', // 4: amber
  '#a855f7', // 5: purple
  '#06b6d4', // 6: cyan
  '#ec4899', // 7: magenta
  '#14b8a6', // 8: teal
  '#f97316', // 9: orange
];

/**
 * Refund text color for PDF tables (dark red).
 */
export const REFUND_TEXT_COLOR = '#991b1b';

/**
 * Wraps formatCurrency for PDF output (locale-aware, 2 decimals).
 */
export function formatCurrencyForPdf(amount: number): string {
  return fmtCurrency(amount);
}

/**
 * Wraps formatDate for PDF output (locale-aware).
 * Converts Date objects to ISO string before delegating to formatDate.
 */
export function formatDateForPdf(date: string | Date): string {
  const dateStr = date instanceof Date ? date.toISOString().slice(0, 10) : date;
  return fmtDate(dateStr);
}

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
