/**
 * Real, unmocked end-to-end render of the multi-PDF split (#2161, AC 7.4).
 *
 * Nothing in the pipeline is mocked: real i18next with the actual en/de `budget` bundles, real
 * `buildReportContent`, real `acquireAttachments` (fetch stubbed to serve pdf-lib PDFs), real
 * pdfmake text rendering and real pdf-lib merging (pattern: realRender.test.ts, including the
 * jsdom Blob.arrayBuffer polyfill). `pdfMake.createPdf` is wrapped in a pass-through spy that
 * snapshots the content tree at call time, so assertions can inspect what each part rendered.
 *
 * Attachments are valid PDFs whose size is set by a padded content stream (`% xxx` comment lines
 * inside the stream, which survive pdf-lib copyPages).
 *
 * NOTE: the German run needs the translator's de/budget.json `sourceReports.parts.letter.*` keys
 * for German wording; the structural assertions here hold either way.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, jest } from '@jest/globals';
import i18next from 'i18next';
import type { TFunction } from 'i18next';
import { PDFDocument } from 'pdf-lib';
import type { SourceReportResponse, SourceReportInvoice } from '@cornerstone/shared';
import type { Formatters } from '../formatters.js';
import { formatCurrency, formatDate } from '../formatters.js';
import { buildReportContent } from '../reportContent/index.js';
import type { ReportContent } from '../reportContent/index.js';
import enBudget from '../../i18n/en/budget.json';
import deBudget from '../../i18n/de/budget.json';
import { loadPdfLibs } from './loader.js';
import { generateReportPdf } from './merge.js';
import { acquireAttachments, generateReportParts } from './parts.js';
import type { AttachmentCache, GeneratedReportParts } from './types.js';

// ─── i18n + polyfill ──────────────────────────────────────────────────────────

let tEn: TFunction;
let tDe: TFunction;

// jsdom's Blob lacks .arrayBuffer() (real browsers and Node have it); see merge.test.ts.
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

beforeAll(async () => {
  const instance = i18next.createInstance();
  await instance.init({
    resources: { en: { budget: enBudget }, de: { budget: deBudget } },
    lng: 'en',
    fallbackLng: 'en',
    defaultNS: 'budget',
    ns: ['budget'],
    interpolation: { escapeValue: false },
  });
  tEn = instance.getFixedT('en', 'budget');
  tDe = instance.getFixedT('de', 'budget');
});

function formattersFor(locale: 'en-US' | 'de-DE'): Formatters {
  return {
    formatCurrency: (n: number) => formatCurrency(n, locale, 'EUR'),
    formatDate: (d, fallback, monthStyle) => formatDate(d, locale, fallback, monthStyle),
  };
}

// ─── Fixtures ───────────────────────────────────────────────────────────────

const ATTACHMENT_PAGES = [1, 3, 2, 2];
const ATTACHMENT_BYTES = 40_000;

/** Valid PDF of `pages` pages and roughly `targetBytes`, padded inside each page's content stream. */
async function makePaddedPdf(
  pages: number,
  targetBytes: number,
  label: string,
): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  const perPage = Math.floor(targetBytes / pages);
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage([200, 200]);
    page.drawText(`${label} page ${i + 1}`, { x: 10, y: 100 });
    const padding = `% ${'x'.repeat(perPage - 3)}\n`;
    page.node.addContentStream(doc.context.register(doc.context.stream(padding)));
  }
  const bytes = await doc.save({ useObjectStreams: false });
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function makeInvoice(index: number): SourceReportInvoice {
  return {
    invoiceId: `inv-${index}`,
    vendorId: `vend-${index}`,
    vendorName: `Vendor ${index} & Söhne`,
    invoiceNumber: `INV-${index}`,
    date: `2026-02-0${index}`,
    status: 'pending',
    invoiceAmount: 1000 * index,
    allocatedAmount: 1000 * index,
    lineKind: 'invoice',
    isSplit: false,
    splitKind: null,
    documents: [
      { documentId: index, archiveSerialNumber: null, title: `Doc ${index}`, attachmentType: null },
    ],
    budgetLinesForSource: [],
    depositsVisibleToSource: [],
  };
}

const report: SourceReportResponse = {
  type: 'claim',
  source: {
    id: 'src-1',
    name: 'Home Loan',
    sourceType: 'bank_loan',
    reference: 'REF-1',
    contactAddress: '456 Bank Ave',
  },
  invoices: [1, 2, 3, 4].map(makeInvoice),
  totalAmount: 10000,
  unallocatedInvoices: [],
  generatedAt: '2026-02-15T00:00:00.000Z',
};
const includedIds = new Set(['inv-1', 'inv-2', 'inv-3', 'inv-4']);
const household = { householdName: 'The Smiths', householdAddress: '123 Main St' };

// ─── Spy-wrapped real createPdf + fetch stub ──────────────────────────────────

interface RenderedCall {
  strings: string[];
  hasTable: boolean;
}

function snapshot(node: unknown, acc: RenderedCall): void {
  if (typeof node === 'string') {
    acc.strings.push(node);
  } else if (Array.isArray(node)) {
    for (const item of node) snapshot(item, acc);
  } else if (node !== null && typeof node === 'object') {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === 'table') acc.hasTable = true;
      snapshot(value, acc);
    }
  }
}

describe('multi-PDF split — real, unmocked render', () => {
  let docBytes: Map<number, ArrayBuffer>;
  let rendered: RenderedCall[];
  let createPdfSpy: { mockRestore: () => void };
  const originalFetch = globalThis.fetch;

  beforeAll(async () => {
    docBytes = new Map();
    for (const [i, pages] of ATTACHMENT_PAGES.entries()) {
      docBytes.set(i + 1, await makePaddedPdf(pages, ATTACHMENT_BYTES, `Attachment ${i + 1}`));
    }
  });

  beforeEach(async () => {
    rendered = [];
    const { pdfMake } = await loadPdfLibs();
    const original = pdfMake.createPdf.bind(pdfMake);
    createPdfSpy = jest.spyOn(pdfMake, 'createPdf').mockImplementation(((
      def: Parameters<typeof original>[0],
      ...rest: unknown[]
    ) => {
      const acc: RenderedCall = { strings: [], hasTable: false };
      snapshot((def as { content: unknown }).content, acc);
      rendered.push(acc);
      return (original as (...args: unknown[]) => unknown)(def, ...rest);
    }) as unknown as typeof pdfMake.createPdf);

    globalThis.fetch = (async (url: RequestInfo | URL) => {
      const id = Number(/documents\/(\d+)\//.exec(String(url))?.[1]);
      const bytes = docBytes.get(id);
      return {
        ok: bytes !== undefined,
        status: bytes ? 200 : 404,
        arrayBuffer: async () => bytes ?? new ArrayBuffer(0),
      } as unknown as Response;
    }) as typeof fetch;
  });

  afterEach(() => {
    createPdfSpy.mockRestore();
    globalThis.fetch = originalFetch;
  });

  async function pageCount(blob: Blob): Promise<number> {
    const doc = await PDFDocument.load(await blob.arrayBuffer());
    return doc.getPageCount();
  }

  function buildContent(t: TFunction, locale: 'en-US' | 'de-DE', includeCoverLetter: boolean) {
    return buildReportContent(report, includedIds, 'claim', t, formattersFor(locale), {
      includeCoverLetter,
      household,
      includePartTexts: true,
    });
  }

  async function acquire() {
    const cache: AttachmentCache = new Map();
    return acquireAttachments(report, includedIds, cache);
  }

  /** Limit that makes the 4 padded attachments split across >= 2 parts. */
  async function splittingLimit(content: ReportContent): Promise<number> {
    const acquired = await acquire();
    const unlimited = await generateReportParts({
      report,
      includedInvoiceIds: includedIds,
      content,
      acquired,
      limitBytes: 1_000_000_000,
    });
    expect(unlimited.parts).toHaveLength(1);
    const attachmentBytes = acquired.attachments.reduce((sum, a) => sum + a.size, 0);
    const textBytes = unlimited.parts[0]!.size - attachmentBytes;
    rendered.length = 0;
    return Math.ceil(textBytes + 2.5 * ATTACHMENT_BYTES + 5000);
  }

  async function generateSplit(
    content: ReportContent,
  ): Promise<{ result: GeneratedReportParts; limit: number }> {
    const limit = await splittingLimit(content);
    const result = await generateReportParts({
      report,
      includedInvoiceIds: includedIds,
      content,
      acquired: await acquire(),
      limitBytes: limit,
    });
    return { result, limit };
  }

  it.each([['en', 'en-US', () => tEn] as const, ['de', 'de-DE', () => tDe] as const])(
    'splits into N > 1 parts for the %s locale without splitting an attachment, and the attachment pages add up to the single-PDF total',
    async (_label, locale, getT) => {
      const content = buildContent(getT(), locale, true);
      const { result, limit } = await generateSplit(content);
      const n = result.parts.length;

      expect(n).toBeGreaterThan(1);
      expect(result.warnings).toEqual([]);
      expect(result.skippedDocuments).toEqual([]);
      expect(result.limitBytes).toBe(limit);
      for (const part of result.parts) {
        expect(part.blob.type).toBe('application/pdf');
        expect(part.size).toBe(part.blob.size);
        expect(part.size).toBeLessThanOrEqual(limit);
        expect(part.overLimit).toBe(false);
      }

      // Every attachment appears exactly once, in report order, whole.
      const allKeys = result.parts.flatMap((p) => p.attachmentKeys);
      expect(allKeys).toEqual(['inv-1:1', 'inv-2:2', 'inv-3:3', 'inv-4:4']);

      // Single-PDF baseline from the existing pipeline.
      const single = await generateReportPdf(
        report,
        includedIds,
        buildReportContent(report, includedIds, 'claim', getT(), formattersFor(locale), {
          includeCoverLetter: true,
          household,
        }),
        { attachDocuments: true },
      );
      const textOnly = await generateReportPdf(
        report,
        includedIds,
        buildReportContent(report, includedIds, 'claim', getT(), formattersFor(locale), {
          includeCoverLetter: true,
          household,
        }),
        { attachDocuments: false },
      );
      const singleAttachmentPages =
        (await pageCount(single.blob)) - (await pageCount(textOnly.blob));
      expect(singleAttachmentPages).toBe(ATTACHMENT_PAGES.reduce((a, b) => a + b, 0));

      // Per part: pages == text pages + whole attachments. Part 1 has the report pages; every
      // continuation has exactly one letter page.
      const pagesOfKey = (key: string) => ATTACHMENT_PAGES[Number(key.split(':')[1]) - 1]!;
      const textPagesPart1 = await pageCount(textOnly.blob);
      let attachmentPagesAcrossParts = 0;
      for (const part of result.parts) {
        const attachmentPages = part.attachmentKeys.reduce((sum, k) => sum + pagesOfKey(k), 0);
        attachmentPagesAcrossParts += attachmentPages;
        const textPages = part.index === 0 ? textPagesPart1 : 1;
        expect(await pageCount(part.blob)).toBe(textPages + attachmentPages);
      }
      expect(attachmentPagesAcrossParts).toBe(singleAttachmentPages);
    },
  );

  it.each([['en', 'en-US', () => tEn] as const, ['de', 'de-DE', () => tDe] as const])(
    'renders the N-parts sentence on part 1 and no total/table/source block in the %s continuation letters',
    async (_label, locale, getT) => {
      const content = buildContent(getT(), locale, true);
      const { result } = await generateSplit(content);
      const n = result.parts.length;
      const texts = content.partTexts!;
      const totalLabel = content.summaryRows[0]!.label;
      expect(totalLabel.length).toBeGreaterThan(0);

      const notice = texts.multiPartNotice(n);
      expect(notice).not.toContain('sourceReports.parts');
      // Final renders only: drop the two N = 99 overhead estimates (first calls of the run).
      const part1Calls = rendered.filter((c) => c.strings.includes(notice));
      expect(part1Calls.length).toBeGreaterThanOrEqual(1);
      expect(part1Calls.every((c) => c.hasTable)).toBe(true);

      for (let k = 2; k <= n; k++) {
        const subject = `${content.labels.coverLetterSubjectLabel}: ${texts.continuationSubject(k, n)}`;
        const body = texts.continuationBody(k, n);
        const calls = rendered.filter((c) => c.strings.includes(subject));
        expect(calls.length).toBeGreaterThanOrEqual(1);
        for (const call of calls) {
          expect(call.strings).toContain(body);
          expect(call.strings).toContain(texts.continuationInvoicesHeading);
          expect(call.hasTable).toBe(false);
          expect(call.strings).not.toContain(totalLabel);
          expect(call.strings).not.toContain(content.labels.source);
          expect(call.strings).not.toContain(content.labels.sourceType);
          expect(call.strings).not.toContain(notice);
        }
      }
    },
  );

  it('lists only the invoices attached in each continuation part', async () => {
    const content = buildContent(tEn, 'en-US', true);
    const { result } = await generateSplit(content);
    const n = result.parts.length;
    const texts = content.partTexts!;

    for (const part of result.parts.slice(1)) {
      const subject = `${content.labels.coverLetterSubjectLabel}: ${texts.continuationSubject(part.index + 1, n)}`;
      const call = rendered.filter((c) => c.strings.includes(subject)).at(-1)!;
      const expectedLines = part.invoiceIds.map((id) => {
        const row = content.rows.find((r) => r.invoiceId === id)!;
        return texts.continuationInvoiceLine(row);
      });
      for (const line of expectedLines) expect(call.strings).toContain(line);
      const otherLines = content.rows
        .filter((r) => !part.invoiceIds.includes(r.invoiceId))
        .map((r) => texts.continuationInvoiceLine(r));
      for (const line of otherLines) expect(call.strings).not.toContain(line);
    }
  });

  it('prepends the no-letter notice to part 1 when the report has no cover letter', async () => {
    const content = buildContent(tEn, 'en-US', false);
    expect(content.coverLetter).toBeNull();
    const { result } = await generateSplit(content);
    const n = result.parts.length;
    const texts = content.partTexts!;

    expect(n).toBeGreaterThan(1);
    const noLetter = texts.multiPartNoticeNoLetter(n);
    expect(noLetter).toBe(
      `Part 1 of ${n}. The invoice attachments continue in ${n === 2 ? 'one further file' : `${n - 1} further files`}.`,
    );
    expect(rendered.some((c) => c.strings.includes(noLetter) && c.hasTable)).toBe(true);
    expect(rendered.every((c) => !c.strings.includes(texts.multiPartNotice(n)))).toBe(true);
  });

  it('produces a single part without any notice when everything fits the limit', async () => {
    const content = buildContent(tEn, 'en-US', true);
    const result = await generateReportParts({
      report,
      includedInvoiceIds: includedIds,
      content,
      acquired: await acquire(),
      limitBytes: 1_000_000_000,
    });

    expect(result.parts).toHaveLength(1);
    expect(result.warnings).toEqual([]);
    expect(rendered.at(-1)!.strings.some((s) => s.startsWith('This report consists of'))).toBe(
      false,
    );
    expect(await pageCount(result.parts[0]!.blob)).toBeGreaterThan(
      ATTACHMENT_PAGES.reduce((a, b) => a + b, 0),
    );
  });

  it('warns about an attachment larger than the limit and gives it its own part', async () => {
    const content = buildContent(tEn, 'en-US', true);
    const acquired = await acquire();
    const limit = Math.floor(ATTACHMENT_BYTES / 2);
    const result = await generateReportParts({
      report,
      includedInvoiceIds: includedIds,
      content,
      acquired,
      limitBytes: limit,
    });

    const oversized = result.warnings.filter((w) => w.kind === 'oversizedAttachment');
    expect(oversized).toHaveLength(4);
    expect(oversized[0]).toMatchObject({
      invoiceId: 'inv-1',
      vendorName: 'Vendor 1 & Söhne',
      invoiceNumber: 'INV-1',
      documentId: 1,
      limitBytes: limit,
    });
    expect(result.parts.flatMap((p) => p.attachmentKeys)).toEqual([
      'inv-1:1',
      'inv-2:2',
      'inv-3:3',
      'inv-4:4',
    ]);
    for (const part of result.parts.filter((p) => p.attachmentKeys.length > 0)) {
      expect(part.attachmentKeys).toHaveLength(1);
    }
  });
});
