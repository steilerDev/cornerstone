/**
 * Unit tests for the opt-in `partTexts` closures of buildReportContent (#2161).
 *
 * Two layers:
 *  1. An echoing `t` (key + JSON options) pins the exact bare keys and interpolation payloads.
 *  2. A real i18next instance loaded with the actual en/de `budget` bundles pins the rendered
 *     report-language text, including the `_one`/`_other` plural split on `count = total - 1`.
 *
 * NOTE: the German assertions depend on the translator's de/budget.json keys under
 * `sourceReports.parts.letter.*`. Until those exist, i18next falls back to English and they fail.
 */
import { describe, it, expect, beforeAll } from '@jest/globals';
import i18next from 'i18next';
import type { TFunction } from 'i18next';
import type { SourceReportResponse, SourceReportInvoice } from '@cornerstone/shared';
import type { Formatters } from '../formatters.js';
import { formatCurrency, formatDate } from '../formatters.js';
import { buildReportContent } from './buildReportContent.js';
import enBudget from '../../i18n/en/budget.json';
import deBudget from '../../i18n/de/budget.json';

const echoT = ((key: string, opts?: Record<string, unknown>) =>
  opts ? `${key}::${JSON.stringify(opts)}` : key) as unknown as TFunction;

const echoFormatters: Formatters = {
  formatCurrency: (n: number) => `€${n.toFixed(2)}`,
  formatDate: (d) => (typeof d === 'string' ? `date(${d})` : '—'),
};

function formattersFor(locale: 'en-US' | 'de-DE'): Formatters {
  return {
    formatCurrency: (n: number) => formatCurrency(n, locale, 'EUR'),
    formatDate: (d, fallback, monthStyle) => formatDate(d, locale, fallback, monthStyle),
  };
}

function makeInvoice(overrides: Partial<SourceReportInvoice> = {}): SourceReportInvoice {
  return {
    invoiceId: 'inv-1',
    vendorId: 'vend-1',
    vendorName: 'ACME Builders',
    invoiceNumber: 'INV-001',
    date: '2026-01-10',
    status: 'pending',
    invoiceAmount: 1000,
    allocatedAmount: 1000,
    lineKind: 'invoice',
    isSplit: false,
    splitKind: null,
    documents: [],
    budgetLinesForSource: [],
    depositsVisibleToSource: [],
    ...overrides,
  };
}

const report: SourceReportResponse = {
  type: 'claim',
  source: {
    id: 'src-1',
    name: 'Home Loan',
    sourceType: 'bank_loan',
    reference: null,
    contactAddress: null,
  },
  invoices: [makeInvoice()],
  totalAmount: 1000,
  unallocatedInvoices: [],
  generatedAt: '2026-01-15T00:00:00.000Z',
};
const included = new Set(['inv-1']);

describe('buildReportContent — partTexts is opt-in', () => {
  it('leaves partTexts absent by default', () => {
    const content = buildReportContent(report, included, 'claim', echoT, echoFormatters);
    expect(content.partTexts).toBeUndefined();
    expect('partTexts' in content).toBe(false);
  });

  it('leaves partTexts absent when includePartTexts is false or options omit it', () => {
    const off = buildReportContent(report, included, 'claim', echoT, echoFormatters, {
      includeCoverLetter: false,
      household: null,
      includePartTexts: false,
    });
    const unset = buildReportContent(report, included, 'claim', echoT, echoFormatters, {
      includeCoverLetter: false,
      household: null,
    });
    expect('partTexts' in off).toBe(false);
    expect('partTexts' in unset).toBe(false);
  });

  it('builds partTexts when includePartTexts is true, with or without a cover letter', () => {
    for (const includeCoverLetter of [true, false]) {
      const content = buildReportContent(report, included, 'claim', echoT, echoFormatters, {
        includeCoverLetter,
        household: null,
        includePartTexts: true,
      });
      expect(content.partTexts).toBeDefined();
    }
  });

  it('does not change any other ReportContent field', () => {
    const base = buildReportContent(report, included, 'claim', echoT, echoFormatters, {
      includeCoverLetter: true,
      household: { householdName: 'The Smiths', householdAddress: '123 Main St' },
    });
    const withTexts = buildReportContent(report, included, 'claim', echoT, echoFormatters, {
      includeCoverLetter: true,
      household: { householdName: 'The Smiths', householdAddress: '123 Main St' },
      includePartTexts: true,
    });
    const { partTexts, ...rest } = withTexts;
    expect(partTexts).toBeDefined();
    expect(rest).toEqual(base);
  });
});

describe('buildReportContent — partTexts keys and interpolation payloads (echo t)', () => {
  const content = buildReportContent(report, included, 'claim', echoT, echoFormatters, {
    includeCoverLetter: true,
    household: null,
    includePartTexts: true,
  });
  const texts = content.partTexts!;

  it('builds the identifier from the table title, source name and generated-at text', () => {
    expect(texts.identifier).toBe(
      `sourceReports.parts.letter.identifier::${JSON.stringify({
        title: content.tableTitle,
        source: 'Home Loan',
        date: content.sourceInfo.generatedAtText,
      })}`,
    );
  });

  it('continuationSubject and continuationBody pass part, total and the identifier', () => {
    expect(texts.continuationSubject(2, 5)).toBe(
      `sourceReports.parts.letter.continuationSubject::${JSON.stringify({
        part: 2,
        total: 5,
        report: texts.identifier,
      })}`,
    );
    expect(texts.continuationBody(3, 5)).toBe(
      `sourceReports.parts.letter.continuationBody::${JSON.stringify({
        part: 3,
        total: 5,
        report: texts.identifier,
      })}`,
    );
  });

  it('continuationInvoicesHeading is the bare key', () => {
    expect(texts.continuationInvoicesHeading).toBe(
      'sourceReports.parts.letter.continuationInvoicesHeading',
    );
  });

  it('continuationInvoiceLine passes vendor, invoiceNumber and date from the row', () => {
    expect(
      texts.continuationInvoiceLine({
        vendor: 'ACME',
        invoiceNumber: 'INV-9',
        dateText: 'date(2026-01-10)',
      }),
    ).toBe(
      `sourceReports.parts.letter.continuationInvoiceLine::${JSON.stringify({
        vendor: 'ACME',
        invoiceNumber: 'INV-9',
        date: 'date(2026-01-10)',
      })}`,
    );
  });

  it('multiPartNotice and multiPartNoticeNoLetter pass count = total - 1 and total', () => {
    expect(texts.multiPartNotice(4)).toBe(
      `sourceReports.parts.letter.multiPartNotice::${JSON.stringify({ count: 3, total: 4 })}`,
    );
    expect(texts.multiPartNoticeNoLetter(2)).toBe(
      `sourceReports.parts.letter.multiPartNoticeNoLetter::${JSON.stringify({ count: 1, total: 2 })}`,
    );
  });

  it('paperlessTitle passes title, part label and total', () => {
    expect(texts.paperlessTitle('Base title', '2', 3)).toBe(
      `sourceReports.parts.letter.paperlessTitle::${JSON.stringify({
        title: 'Base title',
        part: '2',
        total: 3,
      })}`,
    );
  });
});

describe('buildReportContent — partTexts rendered with the real bundles', () => {
  let tEn: TFunction;
  let tDe: TFunction;

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

  function build(t: TFunction, locale: 'en-US' | 'de-DE') {
    return buildReportContent(report, included, 'claim', t, formattersFor(locale), {
      includeCoverLetter: true,
      household: null,
      includePartTexts: true,
    }).partTexts!;
  }

  describe('en', () => {
    it('renders the identifier with an en dash and the formatted date', () => {
      const texts = build(tEn, 'en-US');
      const content = buildReportContent(report, included, 'claim', tEn, formattersFor('en-US'));
      expect(texts.identifier).toBe(
        `${content.tableTitle} – Home Loan, ${content.sourceInfo.generatedAtText}`,
      );
    });

    it('renders the continuation subject, body and heading', () => {
      const texts = build(tEn, 'en-US');
      expect(texts.continuationSubject(2, 3)).toBe(
        `Attachment 2 of 3 to report ${texts.identifier}`,
      );
      expect(texts.continuationBody(2, 3)).toBe(
        `This file is part 2 of 3 of the report ${texts.identifier} and contains only the invoice attachments listed below.`,
      );
      expect(texts.continuationInvoicesHeading).toBe('Invoices in this file:');
    });

    it('renders an invoice line, leaving "&" in vendor names unescaped', () => {
      const texts = build(tEn, 'en-US');
      expect(
        texts.continuationInvoiceLine({
          vendor: 'Müller & Söhne',
          invoiceNumber: 'INV-7',
          dateText: '10 Jan 2026',
        }),
      ).toBe('Müller & Söhne, no. INV-7, 10 Jan 2026');
    });

    it('uses the singular plural form at N = 2 (count = 1)', () => {
      const texts = build(tEn, 'en-US');
      expect(texts.multiPartNotice(2)).toBe(
        'This report consists of 2 files. The remaining invoice attachments follow in one further file with its own attachment letter.',
      );
      expect(texts.multiPartNoticeNoLetter(2)).toBe(
        'Part 1 of 2. The invoice attachments continue in one further file.',
      );
    });

    it('uses the plural form with the further-file count at N = 4 (count = 3)', () => {
      const texts = build(tEn, 'en-US');
      expect(texts.multiPartNotice(4)).toBe(
        'This report consists of 4 files. The remaining invoice attachments follow in 3 further files, each with its own attachment letter.',
      );
      expect(texts.multiPartNoticeNoLetter(4)).toBe(
        'Part 1 of 4. The invoice attachments continue in 3 further files.',
      );
    });

    it('renders the Paperless title with the part label', () => {
      const texts = build(tEn, 'en-US');
      expect(texts.paperlessTitle('claim-home-loan-2026-01-15', '2', 3)).toBe(
        'claim-home-loan-2026-01-15 (2 of 3)',
      );
    });
  });

  describe('de', () => {
    it('renders the continuation subject and heading in German (formal wording from the translator spec)', () => {
      const texts = build(tDe, 'de-DE');
      expect(texts.continuationSubject(2, 3)).toBe(
        `Anlage 2 von 3 zum Bericht ${texts.identifier}`,
      );
      expect(texts.continuationInvoicesHeading).toBe('Rechnungen in dieser Datei:');
    });

    it('renders the Paperless title as "(k von N)"', () => {
      const texts = build(tDe, 'de-DE');
      expect(texts.paperlessTitle('Basis', '2', 3)).toBe('Basis (2 von 3)');
    });

    it('keeps the en dash and German date in the identifier', () => {
      const texts = build(tDe, 'de-DE');
      const content = buildReportContent(report, included, 'claim', tDe, formattersFor('de-DE'));
      expect(texts.identifier).toBe(
        `${content.tableTitle} – Home Loan, ${content.sourceInfo.generatedAtText}`,
      );
    });

    it('translates every closure (no English text, no raw key) and carries the interpolated values', () => {
      const texts = build(tDe, 'de-DE');
      const rendered = [
        texts.continuationBody(2, 3),
        texts.continuationInvoiceLine({
          vendor: 'Müller & Söhne',
          invoiceNumber: 'INV-7',
          dateText: '10.01.2026',
        }),
        texts.multiPartNotice(3),
        texts.multiPartNoticeNoLetter(3),
      ];
      for (const text of rendered) {
        expect(text).not.toContain('sourceReports.parts');
        expect(text).not.toMatch(/\b(This file|This report|Part 1 of|invoice attachments|no\.)\b/);
      }
      expect(rendered[0]).toContain('2');
      expect(rendered[0]).toContain(texts.identifier);
      expect(rendered[1]).toContain('Müller & Söhne');
      expect(rendered[1]).toContain('INV-7');
      expect(rendered[1]).toContain('10.01.2026');
      expect(rendered[2]).toContain('3');
      expect(rendered[3]).toContain('3');
    });
  });
});
