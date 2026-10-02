/**
 * The pdfmake document definition shared by every report text renderer (`merge.ts` for the
 * single PDF, `parts.ts` for the multi-PDF split): one definition, two orchestrators (#2161).
 * Page size, margins, header (none on page 1), footer and styles are defined only here.
 */
import type { Content } from 'pdfmake/build/pdfmake';
import type { TDocumentDefinitions } from 'pdfmake/interfaces';
import type { ReportContent } from '../reportContent/index.js';
import { buildPageHeader, buildPageFooter } from './shared.js';
import {
  PAGE_MARGIN_X,
  PAGE_TOP_MARGIN,
  PAGE_MARGIN_BOTTOM,
  PDF_STYLES,
  PDF_DEFAULT_STYLE,
} from './pageGeometry.js';

export function buildReportDocDefinition(
  content: Content[],
  reportContent: ReportContent,
): TDocumentDefinitions {
  return {
    content,
    pageSize: 'A4',
    pageMargins: [PAGE_MARGIN_X, PAGE_TOP_MARGIN, PAGE_MARGIN_X, PAGE_MARGIN_BOTTOM],
    header: (currentPage: number) => {
      if (currentPage === 1) return null; // No header on first page
      return buildPageHeader(
        reportContent.tableTitle,
        reportContent.sourceInfo.sourceName,
        `${reportContent.labels.generatedAt}: ${reportContent.sourceInfo.generatedAtText}`,
      );
    },
    footer: buildPageFooter(reportContent.labels.pageLabel),
    defaultStyle: PDF_DEFAULT_STYLE,
    styles: PDF_STYLES,
  };
}
