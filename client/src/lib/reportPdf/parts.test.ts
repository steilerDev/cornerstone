/**
 * Unit tests for client/src/lib/reportPdf/parts.ts (generateReportParts, #2161).
 *
 * Isolation (pattern: merge.test.ts): mocks ./loader.js, ./shared.js, ./coverLetterPdf.js,
 * ./continuationLetterPdf.js, ./overviewPdf.js and ../paperlessApi.js so only parts.ts's own
 * orchestration is under test: plan -> render -> merge -> verify, notices, warnings, abort.
 *
 * Size model: a mocked text PDF is `sizes.p1` bytes for part-1 content and `sizes.cont` bytes for
 * a continuation letter (detected by the 'CONT' marker node). The mocked pdf-lib "merge" adds
 * page sizes, so a rendered part is exactly `text + sum(attachment bytes)`. Attachments carry a
 * planning `size` and a separate `bytes.byteLength`, which lets a test make the real size exceed
 * the planner's estimate and exercise the AC 5.1 verification loop.
 */
import { describe, it, expect, jest, beforeEach, beforeAll } from '@jest/globals';
import type { Content } from 'pdfmake/build/pdfmake';
import type { SourceReportResponse } from '@cornerstone/shared';
import type {
  ReportColumnKey,
  ReportContent,
  ReportContentCoverLetter,
  ReportContentRow,
} from '../reportContent/index.js';
import type * as PartsModule from './parts.js';
import type * as CoverLetterPdfModule from './coverLetterPdf.js';
import type * as ContinuationLetterPdfModule from './continuationLetterPdf.js';
import type * as OverviewPdfModule from './overviewPdf.js';
import type { AcquireResult, ReportAttachment } from './types.js';
import { PAGE_MARGIN_X, PAGE_TOP_MARGIN, PAGE_MARGIN_BOTTOM, PDF_STYLES } from './pageGeometry.js';

// ─── Mock: ./loader.js ────────────────────────────────────────────────────────

const sizes = { p1: 100, cont: 50 };
let onGetBlob: (() => void) | null = null;

interface CreatePdfDefinition {
  content: Content[];
  pageSize: string;
  pageMargins: number[];
  header: (page: number) => unknown;
  footer: unknown;
  defaultStyle: unknown;
  styles: unknown;
}

const mockGetBlob = jest.fn(async () => new Blob([new Uint8Array(0)]));
const mockCreatePdf = jest.fn((def: CreatePdfDefinition) => ({
  getBlob: async () => {
    mockGetBlob();
    onGetBlob?.();
    const isContinuation = def.content.some((n) => (n as { text?: string }).text === 'CONT');
    return new Blob([new Uint8Array(isContinuation ? sizes.cont : sizes.p1)]);
  },
}));

interface FakePdfDoc {
  size: number;
  getPageIndices: () => number[];
}

const mockPdfDocumentLoad = jest.fn(async (bytes: ArrayBuffer): Promise<FakePdfDoc> => {
  // First byte 255 marks an attachment that fails pdf-lib's parse at merge time.
  if (new Uint8Array(bytes)[0] === 255) throw new Error('not a pdf');
  return { size: bytes.byteLength, getPageIndices: () => [0] };
});
const mockPDFDocumentCreate = jest.fn(async () => {
  const pages: { size: number }[] = [];
  return {
    copyPages: async (src: FakePdfDoc) => [{ size: src.size }],
    addPage: (page: { size: number }) => {
      pages.push(page);
    },
    save: async () => new Uint8Array(pages.reduce((sum, p) => sum + p.size, 0)),
  };
});

jest.unstable_mockModule('./loader.js', () => ({
  loadPdfLibs: jest.fn(async () => ({
    pdfMake: { createPdf: mockCreatePdf },
    PDFDocument: { load: mockPdfDocumentLoad, create: mockPDFDocumentCreate },
  })),
}));

// ─── Mock: ./shared.js ─────────────────────────────────────────────────────────

const mockBuildPageHeader = jest.fn((..._args: string[]) => ({ text: 'HEADER' }));
const mockFooterFn = jest.fn();
const mockBuildPageFooter = jest.fn((..._args: string[]) => mockFooterFn);

jest.unstable_mockModule('./shared.js', () => ({
  buildPageHeader: mockBuildPageHeader,
  buildPageFooter: mockBuildPageFooter,
  TABLE_LAYOUT: {},
}));

// ─── Mock: content builders ────────────────────────────────────────────────────

const mockBuildCoverLetterContent = jest
  .fn<typeof CoverLetterPdfModule.buildCoverLetterContent>()
  .mockReturnValue([{ text: 'COVER' }]);
const mockBuildContinuationLetterContent = jest
  .fn<typeof ContinuationLetterPdfModule.buildContinuationLetterContent>()
  .mockReturnValue([{ text: 'CONT' }]);
const mockBuildOverviewContent = jest
  .fn<typeof OverviewPdfModule.buildOverviewContent>()
  .mockReturnValue([{ text: 'OVERVIEW' }]);

jest.unstable_mockModule('./coverLetterPdf.js', () => ({
  buildCoverLetterContent: mockBuildCoverLetterContent,
}));
jest.unstable_mockModule('./continuationLetterPdf.js', () => ({
  buildContinuationLetterContent: mockBuildContinuationLetterContent,
}));
jest.unstable_mockModule('./overviewPdf.js', () => ({
  buildOverviewContent: mockBuildOverviewContent,
}));

// ─── Mock: ../paperlessApi.js (pulled in by merge.js, imported for PDF_DEFAULT_STYLE) ──────────

jest.unstable_mockModule('../paperlessApi.js', () => ({
  getDocumentPreviewUrl: (id: number) => `/api/paperless/documents/${id}/preview`,
}));

let generateReportParts: typeof PartsModule.generateReportParts;
let mergePdfDefaultStyle: unknown;

// jsdom's Blob lacks .arrayBuffer() (see merge.test.ts); parts.ts calls it on the text blob.
beforeAll(() => {
  if (typeof Blob.prototype.arrayBuffer !== 'function') {
    Blob.prototype.arrayBuffer = function (this: Blob): Promise<ArrayBuffer> {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(this);
      });
    };
  }
});

beforeEach(async () => {
  ({ generateReportParts } = (await import('./parts.js')) as typeof PartsModule);
  ({ PDF_DEFAULT_STYLE: mergePdfDefaultStyle } = await import('./merge.js'));

  sizes.p1 = 100;
  sizes.cont = 50;
  onGetBlob = null;
  mockGetBlob.mockClear();
  mockCreatePdf.mockClear();
  mockPdfDocumentLoad.mockClear();
  mockPDFDocumentCreate.mockClear();
  mockBuildPageHeader.mockClear();
  mockBuildPageFooter.mockClear();
  mockBuildCoverLetterContent.mockClear();
  mockBuildContinuationLetterContent.mockClear();
  mockBuildOverviewContent.mockClear();
});

// ─── Fixtures ───────────────────────────────────────────────────────────────

function makeCoverLetter(): ReportContentCoverLetter {
  return {
    sender: 'The Smiths',
    recipient: null,
    dateLine: 'date',
    reference: null,
    subject: 'Subject',
    body: 'Body',
    signature: 'The Smiths',
    opening: 'Dear Sir or Madam,',
    closing: 'Sincerely,',
  };
}

function makeRow(invoiceId: string): ReportContentRow {
  return {
    invoiceId,
    vendor: `Vendor ${invoiceId}`,
    invoiceNumber: `N-${invoiceId}`,
    dateText: `date-${invoiceId}`,
    status: null,
    statusText: null,
    invoiceAmountText: '',
    allocatedAmountValueText: '',
    isPartial: false,
    isDepositReduced: false,
    isDeposit: false,
    isRefund: false,
    refundNoteText: '',
    usageText: '',
    attachmentsNote: null,
    areaText: null,
  };
}

function makeContent(
  opts: { letter?: boolean; rows?: string[]; partTexts?: boolean } = {},
): ReportContent {
  const {
    letter = true,
    rows = ['inv-1', 'inv-2', 'inv-3', 'inv-4', 'inv-5'],
    partTexts = true,
  } = opts;
  const content: ReportContent = {
    isOverview: false,
    isClaim: true,
    tableTitle: 'TABLE-TITLE',
    labels: {
      vendor: 'Vendor',
      invoiceNumber: 'Invoice No.',
      date: 'Date',
      status: 'Status',
      invoiceAmount: 'Invoice Amount',
      allocatedAmount: 'Allocated Amount',
      usage: 'Usage',
      attachmentsNote: 'Attachments Note',
      deposit: 'Deposit',
      splitNote: 'partial',
      depositReducedNote: 'less deposit',
      source: 'Source',
      sourceType: 'Source Type',
      reference: 'Reference',
      generatedAt: 'Generated At',
      pageLabel: 'PAGE-LABEL',
      coverLetterReferenceLabel: 'Reference',
      coverLetterSubjectLabel: 'Subject',
      skipReasonLabels: {
        footnoteFetchFailed: 'FetchFailed-label',
        footnoteInvalidPdf: 'InvalidPdf-label',
      },
    },
    sourceInfo: {
      sourceName: 'SOURCE-NAME',
      sourceTypeText: 'Bank Loan',
      referenceText: null,
      generatedAtText: 'GENERATED-AT',
    },
    coverLetter: letter ? makeCoverLetter() : null,
    rows: rows.map(makeRow),
    summaryRows: [],
    footnotes: [],
  };
  if (partTexts) {
    content.partTexts = {
      identifier: 'IDENT',
      continuationSubject: (part, total) => `SUBJ ${part}/${total}`,
      continuationBody: (part, total) => `BODY ${part}/${total}`,
      continuationInvoicesHeading: 'HEADING',
      continuationInvoiceLine: (row) => `LINE ${row.vendor}|${row.invoiceNumber}|${row.dateText}`,
      multiPartNotice: (total) => `NOTICE ${total}`,
      multiPartNoticeNoLetter: (total) => `NOLETTER ${total}`,
      paperlessTitle: (base, label, total) => `${base} ${label}/${total}`,
    };
  }
  return content;
}

function bytesOf(n: number, tag = 0): ArrayBuffer {
  const buf = new Uint8Array(n);
  buf[0] = tag;
  return buf.buffer;
}

/** Attachment with planning `size` and an independently sized `bytes` buffer. */
function att(
  invoiceId: string,
  documentId: number,
  size: number,
  actualBytes: number = size,
  tag = 0,
): ReportAttachment {
  return {
    key: `${invoiceId}:${documentId}`,
    invoiceId,
    documentId,
    title: `Doc ${documentId}`,
    vendorName: `Vendor ${invoiceId}`,
    invoiceNumber: `N-${invoiceId}`,
    bytes: bytesOf(actualBytes, tag),
    size,
  };
}

function acquired(
  attachments: ReportAttachment[],
  skippedDocuments: AcquireResult['skippedDocuments'] = [],
): AcquireResult {
  return { attachments, skippedDocuments, failedFetches: [] };
}

const report = { invoices: [] } as unknown as SourceReportResponse;
const L = 1000;

function run(
  content: ReportContent,
  acq: AcquireResult,
  extra: {
    limitBytes?: number;
    signal?: AbortSignal;
    hiddenColumns?: ReadonlySet<ReportColumnKey>;
  } = {},
) {
  return generateReportParts({
    report,
    includedInvoiceIds: new Set(['inv-1', 'inv-2', 'inv-3', 'inv-4', 'inv-5']),
    content,
    acquired: acq,
    limitBytes: extra.limitBytes ?? L,
    signal: extra.signal,
    hiddenColumns: extra.hiddenColumns,
  });
}

function contCalls(subject: string) {
  return mockBuildContinuationLetterContent.mock.calls.filter((c) => c[1].subject === subject);
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('generateReportParts — preconditions', () => {
  it('throws when content.partTexts is missing', async () => {
    await expect(run(makeContent({ partTexts: false }), acquired([]))).rejects.toThrow(
      'generateReportParts requires content.partTexts',
    );
    expect(mockCreatePdf).not.toHaveBeenCalled();
  });

  it('is re-exported with acquireAttachments and countUncachedDocuments', async () => {
    const mod = (await import('./parts.js')) as typeof PartsModule;
    expect(typeof mod.acquireAttachments).toBe('function');
    expect(typeof mod.countUncachedDocuments).toBe('function');
  });
});

describe('generateReportParts — single part', () => {
  it('returns one part carrying every attachment, with no notice and the merged size', async () => {
    const result = await run(makeContent(), acquired([att('inv-1', 1, 300), att('inv-2', 2, 400)]));

    expect(result.limitBytes).toBe(L);
    expect(result.warnings).toEqual([]);
    expect(result.parts).toHaveLength(1);
    const part = result.parts[0]!;
    expect(part.index).toBe(0);
    expect(part.attachmentKeys).toEqual(['inv-1:1', 'inv-2:2']);
    expect(part.invoiceIds).toEqual(['inv-1', 'inv-2']);
    expect(part.size).toBe(100 + 300 + 400);
    expect(part.blob.size).toBe(800);
    expect(part.overLimit).toBe(false);
    // The final (N = 1) part-1 render has no notice: options argument absent.
    const lastCover = mockBuildCoverLetterContent.mock.calls.at(-1)!;
    expect(lastCover[1]).toBeUndefined();
    expect(mockBuildContinuationLetterContent).toHaveBeenCalledTimes(1); // overhead estimate only
  });

  it('returns the text-only blob as-is when there are no attachments', async () => {
    const result = await run(makeContent(), acquired([]));

    expect(result.parts).toHaveLength(1);
    expect(result.parts[0]).toMatchObject({
      index: 0,
      size: 100,
      attachmentKeys: [],
      invoiceIds: [],
      overLimit: false,
    });
    expect(mockPDFDocumentCreate).not.toHaveBeenCalled();
    expect(result.warnings).toEqual([]);
  });

  it('treats an attachment that makes the part exactly L as fitting (size == L)', async () => {
    const result = await run(makeContent(), acquired([att('inv-1', 1, L - 100)]));

    expect(result.parts).toHaveLength(1);
    expect(result.parts[0]?.size).toBe(L);
    expect(result.parts[0]?.overLimit).toBe(false);
  });

  it('splits when an attachment pushes the estimate to L + 1', async () => {
    const result = await run(makeContent(), acquired([att('inv-1', 1, L - 100 + 1)]));

    expect(result.parts).toHaveLength(2);
    expect(result.parts.map((p) => p.attachmentKeys)).toEqual([[], ['inv-1:1']]);
  });
});

describe('generateReportParts — plan to render mapping', () => {
  const threeBig = () => [att('inv-1', 1, 600), att('inv-2', 2, 600), att('inv-3', 3, 600)];

  it('renders one part per planned part with the right attachments, sizes and invoice ids', async () => {
    const result = await run(makeContent(), acquired(threeBig()));

    expect(result.parts.map((p) => p.attachmentKeys)).toEqual([
      ['inv-1:1'],
      ['inv-2:2'],
      ['inv-3:3'],
    ]);
    expect(result.parts.map((p) => p.invoiceIds)).toEqual([['inv-1'], ['inv-2'], ['inv-3']]);
    expect(result.parts.map((p) => p.index)).toEqual([0, 1, 2]);
    expect(result.parts.map((p) => p.size)).toEqual([100 + 600, 50 + 600, 50 + 600]);
    expect(result.parts.every((p) => !p.overLimit)).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it('puts the multi-part notice on part 1 only when N > 1 (letter variant, N = 3)', async () => {
    await run(makeContent(), acquired(threeBig()));

    const lastCover = mockBuildCoverLetterContent.mock.calls.at(-1)!;
    expect(lastCover[1]).toEqual({ partsNotice: 'NOTICE 3' });
    expect(
      mockBuildCoverLetterContent.mock.calls.every((c) => c[1]?.partsNotice !== 'NOTICE 1'),
    ).toBe(true);
  });

  it('uses the worst-case N = 99 notice for the part-1 overhead estimate', async () => {
    await run(makeContent(), acquired(threeBig()));

    expect(mockBuildCoverLetterContent.mock.calls[0]?.[1]).toEqual({ partsNotice: 'NOTICE 99' });
    expect(contCalls('SUBJ 99/99')).toHaveLength(1);
  });

  it('prepends the no-letter notice as a small paragraph when there is no cover letter (N = 3)', async () => {
    await run(makeContent({ letter: false }), acquired(threeBig()));

    expect(mockBuildCoverLetterContent).not.toHaveBeenCalled();
    const finalPart1 = mockCreatePdf.mock.calls
      .map((c) => c[0].content)
      .filter((nodes) => nodes.some((n) => (n as { text?: string }).text === 'NOLETTER 3'))[0]!;
    expect(finalPart1[0]).toEqual({
      text: 'NOLETTER 3',
      style: 'small',
      margin: [0, 0, 0, 8],
    });
    expect(finalPart1[1]).toEqual({ text: 'OVERVIEW' });
  });

  it('adds no notice at all for N = 1 without a cover letter', async () => {
    await run(makeContent({ letter: false }), acquired([att('inv-1', 1, 300)]));

    const allNodes = mockCreatePdf.mock.calls.slice(-1).flatMap((c) => c[0].content);
    expect(allNodes).toEqual([{ text: 'OVERVIEW' }]);
  });

  it('builds each continuation letter from the report-language closures for that part', async () => {
    await run(makeContent(), acquired(threeBig()));

    expect(contCalls('SUBJ 2/3')).toHaveLength(1);
    expect(contCalls('SUBJ 3/3')).toHaveLength(1);
    expect(contCalls('SUBJ 2/3')[0]?.[1]).toEqual({
      subject: 'SUBJ 2/3',
      body: 'BODY 2/3',
      invoicesHeading: 'HEADING',
      invoiceLines: ['LINE Vendor inv-2|N-inv-2|date-inv-2'],
    });
    expect(contCalls('SUBJ 3/3')[0]?.[1].invoiceLines).toEqual([
      'LINE Vendor inv-3|N-inv-3|date-inv-3',
    ]);
  });

  it('lists each invoice once per continuation part, in order, even with several documents', async () => {
    const result = await run(
      makeContent(),
      acquired([
        att('inv-1', 1, 700),
        att('inv-2', 2, 300),
        att('inv-2', 3, 300),
        att('inv-3', 4, 300),
      ]),
    );

    // part 1: inv-1:1 (800). continuation: inv-2:2 + inv-2:3 + inv-3:4 = 50 + 900 = 950.
    expect(result.parts.map((p) => p.attachmentKeys)).toEqual([
      ['inv-1:1'],
      ['inv-2:2', 'inv-2:3', 'inv-3:4'],
    ]);
    expect(result.parts[1]?.invoiceIds).toEqual(['inv-2', 'inv-3']);
    expect(contCalls('SUBJ 2/2')[0]?.[1].invoiceLines).toEqual([
      'LINE Vendor inv-2|N-inv-2|date-inv-2',
      'LINE Vendor inv-3|N-inv-3|date-inv-3',
    ]);
  });

  it('estimates continuation overhead with a line for every invoice that has an attachment', async () => {
    await run(
      makeContent(),
      acquired([att('inv-1', 1, 600), att('inv-2', 2, 600), att('inv-2', 3, 10)]),
    );

    expect(contCalls('SUBJ 99/99')[0]?.[1].invoiceLines).toEqual([
      'LINE Vendor inv-1|N-inv-1|date-inv-1',
      'LINE Vendor inv-2|N-inv-2|date-inv-2',
    ]);
  });

  it('falls back to the attachment vendor/number with an em dash and empty date when the row is missing', async () => {
    const noNumber = { ...att('inv-9', 9, 600), invoiceNumber: null };
    await run(makeContent({ rows: [] }), acquired([att('inv-8', 8, 600), noNumber]));

    const lines = contCalls('SUBJ 2/2')[0]?.[1].invoiceLines;
    expect(lines).toEqual(['LINE Vendor inv-9|—|']);
  });

  it('passes skipped documents to the overview grouped by invoice and the hidden columns through', async () => {
    const hidden = new Set<ReportColumnKey>(['vendor']);
    const skips = [
      {
        invoiceId: 'inv-1',
        documentId: '1',
        reason: 'footnoteFetchFailed' as const,
        vendorName: 'V',
        invoiceNumber: 'N',
      },
      {
        invoiceId: 'inv-1',
        documentId: '2',
        reason: 'footnoteInvalidPdf' as const,
        vendorName: 'V',
        invoiceNumber: 'N',
      },
      {
        invoiceId: 'inv-2',
        documentId: '3',
        reason: 'footnoteFetchFailed' as const,
        vendorName: 'V',
        invoiceNumber: 'N',
      },
    ];
    await run(makeContent(), acquired([att('inv-3', 4, 100)], skips), { hiddenColumns: hidden });

    const [, skippedByInvoice, hiddenColumns] = mockBuildOverviewContent.mock.calls.at(-1)!;
    expect(skippedByInvoice).toEqual(
      new Map([
        ['inv-1', ['footnoteFetchFailed', 'footnoteInvalidPdf']],
        ['inv-2', ['footnoteFetchFailed']],
      ]),
    );
    expect(hiddenColumns).toBe(hidden);
  });

  it('defaults hidden columns to an empty set', async () => {
    await run(makeContent(), acquired([]));

    const hiddenColumns = mockBuildOverviewContent.mock.calls.at(-1)![2];
    expect(hiddenColumns).toEqual(new Set());
  });

  it('handles 60 attachments, keeping order and every non-oversized part within the limit', async () => {
    const attachments = Array.from({ length: 60 }, (_, i) => att(`inv-${(i % 5) + 1}`, i + 1, 300));
    const result = await run(makeContent(), acquired(attachments));

    expect(result.parts.flatMap((p) => p.attachmentKeys)).toEqual(attachments.map((a) => a.key));
    expect(result.parts.every((p) => p.size <= L)).toBe(true);
    expect(result.parts).toHaveLength(20);
    expect(result.warnings).toEqual([]);
  });
});

describe('generateReportParts — pdf document definition', () => {
  it('uses the A4 geometry, styles and the same default style literal as merge.ts', async () => {
    await run(makeContent(), acquired([]));

    const def = mockCreatePdf.mock.calls.at(-1)![0];
    expect(def.pageSize).toBe('A4');
    expect(def.pageMargins).toEqual([
      PAGE_MARGIN_X,
      PAGE_TOP_MARGIN,
      PAGE_MARGIN_X,
      PAGE_MARGIN_BOTTOM,
    ]);
    expect(def.styles).toBe(PDF_STYLES);
    expect(def.defaultStyle).toEqual(mergePdfDefaultStyle);
  });

  it('prints no header on page 1 and the report header on later pages; footer uses the page label', async () => {
    await run(makeContent(), acquired([]));

    const def = mockCreatePdf.mock.calls.at(-1)![0];
    expect(def.header(1)).toBeNull();
    expect(def.header(2)).toEqual({ text: 'HEADER' });
    expect(mockBuildPageHeader).toHaveBeenCalledWith(
      'TABLE-TITLE',
      'SOURCE-NAME',
      'Generated At: GENERATED-AT',
    );
    expect(mockBuildPageFooter).toHaveBeenCalledWith('PAGE-LABEL');
    expect(def.footer).toBe(mockFooterFn);
  });
});

describe('generateReportParts — verification against real sizes (AC 5.1)', () => {
  it('moves the last attachment onward when a part renders over the limit', async () => {
    // Planned 100 + 400 + 400 = 900 (fits), but the second file is really 600 bytes: 1100 > L.
    const result = await run(
      makeContent(),
      acquired([att('inv-1', 1, 400), att('inv-2', 2, 400, 600)]),
    );

    expect(result.parts.map((p) => p.attachmentKeys)).toEqual([['inv-1:1'], ['inv-2:2']]);
    expect(result.parts.map((p) => p.size)).toEqual([100 + 400, 50 + 600]);
    expect(result.parts.every((p) => !p.overLimit)).toBe(true);
    expect(result.warnings).toEqual([]);
    // The final part 1 carries the N = 2 notice.
    expect(mockBuildCoverLetterContent.mock.calls.at(-1)![1]).toEqual({ partsNotice: 'NOTICE 2' });
  });

  it('can move the only attachment out of part 1 (leaving the report pages alone)', async () => {
    const result = await run(makeContent(), acquired([att('inv-1', 1, 400, 950)]));

    expect(result.parts.map((p) => p.attachmentKeys)).toEqual([[], ['inv-1:1']]);
    expect(result.parts.map((p) => p.size)).toEqual([100, 50 + 950]);
    expect(result.warnings).toEqual([]);
  });

  it('bounds the verification passes at initial N + 1 and then reports the parts still over the limit', async () => {
    // Every file is estimated at 100 bytes but really 1200: no real layout ever fits.
    const result = await run(
      makeContent(),
      acquired([
        att('inv-1', 1, 100, 1200),
        att('inv-2', 2, 100, 1200),
        att('inv-3', 3, 100, 1200),
      ]),
    );

    // Initial plan: [1,2,3] in one part. Pass 1 -> [1,2],[3]; pass 2 -> [1],[2,3]; then stop.
    expect(result.parts.map((p) => p.attachmentKeys)).toEqual([
      ['inv-1:1'],
      ['inv-2:2', 'inv-3:3'],
    ]);
    expect(result.parts.map((p) => p.size)).toEqual([100 + 1200, 50 + 2400]);
    expect(result.parts.every((p) => p.overLimit)).toBe(true);
    expect(result.warnings).toEqual([
      { kind: 'partOverLimit', partIndex: 0, size: 1300, limitBytes: L },
      { kind: 'partOverLimit', partIndex: 1, size: 2450, limitBytes: L },
    ]);
  });

  it('reuses an already rendered part when a verification pass leaves it unchanged', async () => {
    // Plan [a,b],[c,d],[e]; b is really 600 so part 1 is over; the re-plan gives [a],[b,c,d],[e]
    // and part 3 ([e], total 3) is identical, so its continuation letter is not rebuilt.
    const attachments = [
      att('inv-1', 1, 400),
      att('inv-2', 2, 400, 600),
      att('inv-3', 3, 200),
      att('inv-4', 4, 300),
      att('inv-5', 5, 600),
    ];
    const result = await run(makeContent(), acquired(attachments));

    expect(result.parts.map((p) => p.attachmentKeys)).toEqual([
      ['inv-1:1'],
      ['inv-2:2', 'inv-3:3'],
      ['inv-4:4', 'inv-5:5'],
    ]);
    // Part 3 was rendered as [e] first, [d,e] after the second pass: 2 builds, not 3.
    expect(contCalls('SUBJ 3/3')).toHaveLength(2);
    expect(result.warnings).toEqual([]);
  });
});

describe('generateReportParts — warnings', () => {
  it('warns about an oversized attachment with its vendor, invoice number and document, without a duplicate partOverLimit', async () => {
    const big = att('inv-2', 7, 2000);
    const result = await run(makeContent(), acquired([att('inv-1', 1, 300), big]));

    expect(result.parts.map((p) => p.attachmentKeys)).toEqual([['inv-1:1'], ['inv-2:7']]);
    expect(result.parts[1]?.size).toBe(2050);
    expect(result.parts[1]?.overLimit).toBe(true);
    expect(result.warnings).toEqual([
      {
        kind: 'oversizedAttachment',
        invoiceId: 'inv-2',
        vendorName: 'Vendor inv-2',
        invoiceNumber: 'N-inv-2',
        documentId: 7,
        documentTitle: 'Doc 7',
        size: 2000,
        limitBytes: L,
      },
    ]);
  });

  it('emits one oversizedAttachment warning per oversized singleton', async () => {
    const result = await run(
      makeContent(),
      acquired([att('inv-1', 1, 2000), att('inv-2', 2, 3000)]),
    );

    expect(result.parts.map((p) => p.attachmentKeys)).toEqual([[], ['inv-1:1'], ['inv-2:2']]);
    expect(result.warnings.map((w) => w.kind)).toEqual([
      'oversizedAttachment',
      'oversizedAttachment',
    ]);
  });

  it('warns reportExceedsLimit (without attachments) when the report alone is over the limit, with no partOverLimit duplicate', async () => {
    sizes.p1 = 1500;
    const result = await run(makeContent(), acquired([]));

    expect(result.parts).toHaveLength(1);
    expect(result.parts[0]?.overLimit).toBe(true);
    expect(result.warnings).toEqual([
      { kind: 'reportExceedsLimit', size: 1500, limitBytes: L, hasAttachments: false },
    ]);
  });

  it('warns reportExceedsLimit with hasAttachments = true and moves every attachment to its own continuation', async () => {
    sizes.p1 = 1500;
    const result = await run(makeContent(), acquired([att('inv-1', 1, 300), att('inv-2', 2, 300)]));

    expect(result.parts.map((p) => p.attachmentKeys)).toEqual([[], ['inv-1:1', 'inv-2:2']]);
    expect(result.warnings).toEqual([
      { kind: 'reportExceedsLimit', size: 1500, limitBytes: L, hasAttachments: true },
    ]);
  });

  it('does not warn when the report text is exactly the limit', async () => {
    sizes.p1 = L;
    const result = await run(makeContent(), acquired([]));

    expect(result.parts[0]?.overLimit).toBe(false);
    expect(result.warnings).toEqual([]);
  });
});

describe('generateReportParts — skipped documents', () => {
  it('appends merge-time invalid-PDF skips after the acquisition skips and drops the broken attachment', async () => {
    const acquisitionSkip = {
      invoiceId: 'inv-9',
      documentId: '99',
      reason: 'footnoteFetchFailed' as const,
      vendorName: 'V9',
      invoiceNumber: 'N9',
    };
    const result = await run(
      makeContent(),
      acquired([att('inv-1', 1, 300, 300, 255), att('inv-2', 2, 300)], [acquisitionSkip]),
    );

    expect(result.parts).toHaveLength(1);
    // Both keys stay on the part; the broken one contributes no pages.
    expect(result.parts[0]?.attachmentKeys).toEqual(['inv-1:1', 'inv-2:2']);
    expect(result.parts[0]?.size).toBe(100 + 300);
    expect(result.skippedDocuments).toEqual([
      acquisitionSkip,
      {
        invoiceId: 'inv-1',
        documentId: '1',
        reason: 'footnoteInvalidPdf',
        vendorName: 'Vendor inv-1',
        invoiceNumber: 'N-inv-1',
      },
    ]);
  });

  it('reports a broken attachment once even though several renders encounter it', async () => {
    const result = await run(
      makeContent(),
      acquired([att('inv-1', 1, 300, 300, 255), att('inv-2', 2, 600), att('inv-3', 3, 600)]),
    );

    expect(result.skippedDocuments.filter((s) => s.reason === 'footnoteInvalidPdf')).toHaveLength(
      1,
    );
  });

  it('loads each valid source document once per call even when verification re-renders parts', async () => {
    await run(makeContent(), acquired([att('inv-1', 1, 400), att('inv-2', 2, 400, 600)]));

    // Text blobs are loaded too; count only the attachment-sized buffers (400 and 600 bytes).
    const attachmentLoads = mockPdfDocumentLoad.mock.calls.filter(
      (c) => c[0].byteLength === 400 || c[0].byteLength === 600,
    );
    expect(attachmentLoads).toHaveLength(2);
  });
});

describe('generateReportParts — abort', () => {
  it('throws an AbortError when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      run(makeContent(), acquired([att('inv-1', 1, 300)]), { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('checks the signal between parts: aborting during part 1 stops before part 2 is rendered', async () => {
    const controller = new AbortController();
    const attachments = [att('inv-1', 1, 600), att('inv-2', 2, 600)];
    // getBlob calls 1 and 2 are the overhead estimates; call 3 is part 1 of the real render.
    let calls = 0;
    onGetBlob = () => {
      calls++;
      if (calls === 3) controller.abort();
    };

    await expect(
      run(makeContent(), acquired(attachments), { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(mockCreatePdf).toHaveBeenCalledTimes(3);
    expect(contCalls('SUBJ 2/2')).toHaveLength(0);
  });
});
