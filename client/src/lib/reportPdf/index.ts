/**
 * Report PDF generation library.
 */

export { loadPdfLibs, type PdfLibs } from './loader.js';
export { type ReportPdfOptions, type GeneratedReport, type SkippedDocument } from './types.js';
export {
  LIGHT_SOURCE_PALETTE,
  formatCurrencyForPdf,
  formatDateForPdf,
  buildPageHeader,
  buildPageFooter,
  TABLE_LAYOUT,
} from './shared.js';
export { buildCoverLetterContent } from './coverLetterPdf.js';
export { buildOverviewContent } from './overviewPdf.js';
export { generateReportPdf } from './merge.js';
export { downloadPdf, createPreviewUrl, uploadToPaperless } from './sinks.js';
