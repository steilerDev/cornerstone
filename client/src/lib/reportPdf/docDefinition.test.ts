/**
 * Unit tests for client/src/lib/reportPdf/docDefinition.ts (#2161): the pdfmake document
 * definition shared by merge.ts (single PDF) and parts.ts (split PDFs). `./shared.js` is mocked
 * so the header/footer builders are observable; geometry comes from the real `pageGeometry.js`.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { Content } from 'pdfmake/build/pdfmake';
import type { ReportContent } from '../reportContent/index.js';
import type * as DocDefinitionModule from './docDefinition.js';
import {
  PAGE_MARGIN_X,
  PAGE_TOP_MARGIN,
  PAGE_MARGIN_BOTTOM,
  PDF_STYLES,
  PDF_DEFAULT_STYLE,
} from './pageGeometry.js';

const mockBuildPageHeader = jest.fn((..._args: string[]) => ({ text: 'HEADER' }));
const mockFooterFn = jest.fn();
const mockBuildPageFooter = jest.fn((..._args: string[]) => mockFooterFn);

jest.unstable_mockModule('./shared.js', () => ({
  buildPageHeader: mockBuildPageHeader,
  buildPageFooter: mockBuildPageFooter,
  TABLE_LAYOUT: {},
}));

let buildReportDocDefinition: typeof DocDefinitionModule.buildReportDocDefinition;

beforeEach(async () => {
  ({ buildReportDocDefinition } =
    (await import('./docDefinition.js')) as typeof DocDefinitionModule);
  mockBuildPageHeader.mockClear();
  mockBuildPageFooter.mockClear();
});

function makeContent(): ReportContent {
  return {
    isOverview: false,
    isClaim: true,
    tableTitle: 'TABLE-TITLE',
    labels: {
      pageLabel: 'PAGE-LABEL',
      generatedAt: 'Generated At',
    },
    sourceInfo: {
      sourceName: 'SOURCE-NAME',
      sourceTypeText: 'Bank Loan',
      referenceText: null,
      generatedAtText: 'GENERATED-AT',
    },
    coverLetter: null,
    rows: [],
    summaryRows: [],
    footnotes: [],
  } as unknown as ReportContent;
}

describe('buildReportDocDefinition', () => {
  const nodes: Content[] = [{ text: 'A' }, { text: 'B' }];

  it('passes the given content nodes through unchanged', () => {
    const def = buildReportDocDefinition(nodes, makeContent());

    expect(def.content).toBe(nodes);
  });

  it('uses A4 with the shared page margins', () => {
    const def = buildReportDocDefinition(nodes, makeContent());

    expect(def.pageSize).toBe('A4');
    expect(def.pageMargins).toEqual([
      PAGE_MARGIN_X,
      PAGE_TOP_MARGIN,
      PAGE_MARGIN_X,
      PAGE_MARGIN_BOTTOM,
    ]);
  });

  it('uses the shared default style and style dictionary by identity', () => {
    const def = buildReportDocDefinition(nodes, makeContent());

    expect(def.defaultStyle).toBe(PDF_DEFAULT_STYLE);
    expect(def.styles).toBe(PDF_STYLES);
  });

  it('prints no header on page 1', () => {
    const def = buildReportDocDefinition(nodes, makeContent());
    const header = def.header as (page: number) => unknown;

    expect(header(1)).toBeNull();
    expect(mockBuildPageHeader).not.toHaveBeenCalled();
  });

  it.each([2, 3, 10])('prints the report header on page %i', (page) => {
    const def = buildReportDocDefinition(nodes, makeContent());
    const header = def.header as (page: number) => unknown;

    expect(header(page)).toEqual({ text: 'HEADER' });
    expect(mockBuildPageHeader).toHaveBeenCalledWith(
      'TABLE-TITLE',
      'SOURCE-NAME',
      'Generated At: GENERATED-AT',
    );
  });

  it('builds the footer from the page label', () => {
    const def = buildReportDocDefinition(nodes, makeContent());

    expect(mockBuildPageFooter).toHaveBeenCalledTimes(1);
    expect(mockBuildPageFooter).toHaveBeenCalledWith('PAGE-LABEL');
    expect(def.footer).toBe(mockFooterFn);
  });
});
