/**
 * Unit tests for client/src/lib/reportPdf/coverLetterPdf.ts
 *
 * Covers field presence/omission combinations (sender/recipient/date/reference/signature),
 * per-use-case subject/body content, and the `formatters`/`includedTotal` params per the QA spec.
 *
 * FIXED (frontend fix spec item 6): coverLetterPdf.ts no longer imports a module-level
 * `formatDateForPdf`/`formatCurrencyForPdf` from ./shared.js (those were deleted along with
 * LIGHT_SOURCE_PALETTE — see shared.test.ts). `buildCoverLetterContent` now takes an optional
 * `formatters: Formatters` param (`{ formatCurrency, formatDate }`) and an optional
 * `includedTotal: number` param; both the "today" date line and the body total interpolation
 * fall back to unformatted values (`toISOString().slice(0, 10)` / empty string) when `formatters`
 * is omitted, so callers that care about locale-correct output must pass it explicitly (as
 * ReportWizardPage.tsx does via `useFormatters()`, and merge.ts does by forwarding its own
 * `formatters` param through).
 *
 * NOTE: an earlier pass of this file also documented a `household?.name`/`household?.address`
 * field-name mismatch (real HouseholdSettings only has householdName/householdAddress) as a
 * bug. That was fixed in production during an earlier QA round (coverLetterPdf.ts reads
 * householdName/householdAddress correctly) — the sender-block/signature tests below assert the
 * correct, fixed behavior.
 */
import { describe, it, expect } from '@jest/globals';
import type { TFunction } from 'i18next';
import type { SourceReportResponse, HouseholdSettings } from '@cornerstone/shared';
import type { Formatters } from '../formatters.js';
import { buildCoverLetterContent } from './coverLetterPdf.js';

const t = ((key: string, opts?: Record<string, unknown>) =>
  opts ? `${key}::${JSON.stringify(opts)}` : key) as unknown as TFunction;

const stubFormatters: Formatters = {
  formatCurrency: (n: number) => `€${n.toFixed(2)}`,
  formatDate: (d) => (typeof d === 'string' ? `[${d}]` : '—'),
};

function makeReport(overrides: Partial<SourceReportResponse['source']> = {}): SourceReportResponse {
  return {
    type: 'claim',
    source: {
      id: 'src-1',
      name: 'Home Loan',
      sourceType: 'bank_loan',
      reference: null,
      contactAddress: null,
      ...overrides,
    },
    invoices: [],
    totalAmount: 1500,
    unallocatedInvoices: [],
    generatedAt: '2026-01-15T00:00:00.000Z',
  };
}

const fullHousehold: HouseholdSettings = {
  householdName: 'The Smiths',
  householdAddress: '123 Main St',
};

describe('buildCoverLetterContent — date line', () => {
  it('formats "today" via formatters.formatDate when formatters is provided', () => {
    const content = buildCoverLetterContent(makeReport(), null, 'claim', t, stubFormatters, 0);
    const today = new Date().toISOString().slice(0, 10);
    const dateItem = content.find(
      (c) => typeof c === 'object' && c !== null && 'text' in c && c.text === `[${today}]`,
    );
    expect(dateItem).toBeDefined();
  });

  it('falls back to the raw ISO date string when formatters is omitted', () => {
    const content = buildCoverLetterContent(makeReport(), null, 'claim', t);
    const today = new Date().toISOString().slice(0, 10);
    const dateItem = content.find(
      (c) => typeof c === 'object' && c !== null && 'text' in c && c.text === today,
    );
    expect(dateItem).toBeDefined();
  });
});

describe('buildCoverLetterContent — structure', () => {
  it('always includes a subject and body, even when every optional field is null', () => {
    const content = buildCoverLetterContent(makeReport(), null, 'claim', t, stubFormatters, 0);

    const subjectItem = content.find(
      (c) =>
        typeof c === 'object' &&
        c !== null &&
        'text' in c &&
        String(c.text).includes('subjectLabel'),
    );
    const bodyItem = content.find(
      (c) =>
        typeof c === 'object' &&
        c !== null &&
        'text' in c &&
        String(c.text).includes('coverLetter.body.claim'),
    );

    expect(subjectItem).toBeDefined();
    expect(bodyItem).toBeDefined();
  });

  it('always ends with a trailing page break before the overview section', () => {
    const content = buildCoverLetterContent(makeReport(), null, 'claim', t, stubFormatters, 0);
    expect(content[content.length - 1]).toEqual({ text: '', pageBreak: 'after' });
  });

  it('renders the sender block with householdName and householdAddress when present', () => {
    const content = buildCoverLetterContent(
      makeReport(),
      fullHousehold,
      'claim',
      t,
      stubFormatters,
      0,
    );

    const senderBlock = content.find((c) => typeof c === 'object' && c !== null && 'stack' in c) as
      { stack: { text: string }[] } | undefined;

    expect(senderBlock).toBeDefined();
    expect(senderBlock?.stack.map((s) => s.text)).toEqual(['The Smiths', '123 Main St']);
  });

  it('omits the sender block entirely when household is null', () => {
    const content = buildCoverLetterContent(makeReport(), null, 'claim', t, stubFormatters, 0);

    const senderBlock = content.find((c) => typeof c === 'object' && c !== null && 'stack' in c);
    expect(senderBlock).toBeUndefined();
  });

  it('sender stack omits the address line when only householdName is present', () => {
    const nameOnly: HouseholdSettings = { householdName: 'The Smiths', householdAddress: null };
    const content = buildCoverLetterContent(makeReport(), nameOnly, 'claim', t, stubFormatters, 0);

    const senderBlock = content.find((c) => typeof c === 'object' && c !== null && 'stack' in c) as
      { stack: { text: string }[] } | undefined;
    expect(senderBlock?.stack.map((s) => s.text)).toEqual(['The Smiths']);
  });

  it('sender stack omits the name line when only householdAddress is present', () => {
    const addressOnly: HouseholdSettings = { householdName: null, householdAddress: '123 Main St' };
    const content = buildCoverLetterContent(
      makeReport(),
      addressOnly,
      'claim',
      t,
      stubFormatters,
      0,
    );

    const senderBlock = content.find((c) => typeof c === 'object' && c !== null && 'stack' in c) as
      { stack: { text: string }[] } | undefined;
    expect(senderBlock?.stack.map((s) => s.text)).toEqual(['123 Main St']);
  });

  it('renders the recipient block from source.contactAddress when present', () => {
    const content = buildCoverLetterContent(
      makeReport({ contactAddress: '456 Bank Ave' }),
      null,
      'claim',
      t,
      stubFormatters,
      0,
    );

    const recipient = content.find(
      (c) => typeof c === 'object' && c !== null && 'text' in c && c.text === '456 Bank Ave',
    );
    expect(recipient).toBeDefined();
  });

  it('omits the recipient block when source.contactAddress is null', () => {
    const content = buildCoverLetterContent(makeReport(), null, 'claim', t, stubFormatters, 0);
    const recipient = content.find(
      (c) => typeof c === 'object' && c !== null && 'text' in c && c.text === '456 Bank Ave',
    );
    expect(recipient).toBeUndefined();
  });

  it('renders the reference line when source.reference is present', () => {
    const content = buildCoverLetterContent(
      makeReport({ reference: 'REF-42' }),
      null,
      'claim',
      t,
      stubFormatters,
      0,
    );
    const refLine = content.find(
      (c) =>
        typeof c === 'object' && c !== null && 'text' in c && String(c.text).includes('REF-42'),
    );
    expect(refLine).toBeDefined();
    expect((refLine as { text: string }).text).toContain('sourceReports.coverLetter.reference');
  });

  it('omits the reference line when source.reference is null', () => {
    const content = buildCoverLetterContent(makeReport(), null, 'claim', t, stubFormatters, 0);
    const refLine = content.find(
      (c) =>
        typeof c === 'object' && c !== null && 'text' in c && String(c.text).includes('REF-42'),
    );
    expect(refLine).toBeUndefined();
  });

  it('renders the signature with the household name when present', () => {
    const content = buildCoverLetterContent(
      makeReport(),
      fullHousehold,
      'claim',
      t,
      stubFormatters,
      0,
    );
    const signature = content.find(
      (c) =>
        typeof c === 'object' &&
        c !== null &&
        'text' in c &&
        c.text === 'The Smiths' &&
        'margin' in c &&
        Array.isArray((c as { margin: number[] }).margin) &&
        (c as { margin: number[] }).margin[1] === 40,
    );
    expect(signature).toBeDefined();
  });

  it('omits the signature when household is null', () => {
    const content = buildCoverLetterContent(makeReport(), null, 'claim', t, stubFormatters, 0);
    const signature = content.find(
      (c) =>
        typeof c === 'object' &&
        c !== null &&
        'margin' in c &&
        Array.isArray((c as { margin: number[] }).margin) &&
        (c as { margin: number[] }).margin[1] === 40,
    );
    expect(signature).toBeUndefined();
  });

  it('omits the signature when householdName is null even if householdAddress is present', () => {
    const addressOnly: HouseholdSettings = { householdName: null, householdAddress: '123 Main St' };
    const content = buildCoverLetterContent(
      makeReport(),
      addressOnly,
      'claim',
      t,
      stubFormatters,
      0,
    );
    const signature = content.find(
      (c) =>
        typeof c === 'object' &&
        c !== null &&
        'margin' in c &&
        Array.isArray((c as { margin: number[] }).margin) &&
        (c as { margin: number[] }).margin[1] === 40,
    );
    expect(signature).toBeUndefined();
  });

  it.each(['budget-overview', 'claim', 'proof-of-funds'] as const)(
    'looks up the subject/body translation keys for use case "%s"',
    (useCase) => {
      const content = buildCoverLetterContent(makeReport(), null, useCase, t, stubFormatters, 0);

      const subjectItem = content.find(
        (c) =>
          typeof c === 'object' &&
          c !== null &&
          'text' in c &&
          String(c.text).includes(`sourceReports.coverLetter.subject.${useCase}`),
      );
      const bodyItem = content.find(
        (c) =>
          typeof c === 'object' &&
          c !== null &&
          'text' in c &&
          String(c.text).includes(`sourceReports.coverLetter.body.${useCase}`),
      );

      expect(subjectItem).toBeDefined();
      expect(bodyItem).toBeDefined();
    },
  );
});

describe('buildCoverLetterContent — includedTotal interpolation', () => {
  it('formats includedTotal via formatters.formatCurrency and passes it into the body translation', () => {
    const content = buildCoverLetterContent(makeReport(), null, 'claim', t, stubFormatters, 1234);
    const bodyItem = content.find(
      (c) =>
        typeof c === 'object' &&
        c !== null &&
        'text' in c &&
        String(c.text).includes('coverLetter.body.claim'),
    ) as { text: string } | undefined;

    expect(bodyItem?.text).toContain('"total":"€1234.00"');
  });

  it('defaults includedTotal to 0 when omitted', () => {
    const content = buildCoverLetterContent(makeReport(), null, 'claim', t, stubFormatters);
    const bodyItem = content.find(
      (c) =>
        typeof c === 'object' &&
        c !== null &&
        'text' in c &&
        String(c.text).includes('coverLetter.body.claim'),
    ) as { text: string } | undefined;

    expect(bodyItem?.text).toContain('"total":"€0.00"');
  });

  it('falls back to an empty-string total when formatters is omitted entirely', () => {
    const content = buildCoverLetterContent(makeReport(), null, 'claim', t, undefined, 1234);
    const bodyItem = content.find(
      (c) =>
        typeof c === 'object' &&
        c !== null &&
        'text' in c &&
        String(c.text).includes('coverLetter.body.claim'),
    ) as { text: string } | undefined;

    expect(bodyItem?.text).toContain('"total":""');
  });
});

describe('buildCoverLetterContent — real, unmocked render', () => {
  it('returns content without throwing when called with no optional args at all (defaults)', () => {
    let content: ReturnType<typeof buildCoverLetterContent> | undefined;
    expect(() => {
      content = buildCoverLetterContent(makeReport(), fullHousehold, 'claim', t);
    }).not.toThrow();

    expect(Array.isArray(content)).toBe(true);
    expect(content!.length).toBeGreaterThan(0);
  });
});
