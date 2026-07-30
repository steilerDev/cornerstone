/**
 * Unit tests for client/src/lib/reportPdf/coverLetterPdf.ts
 *
 * Covers field presence/omission combinations (sender/recipient/date/reference/signature)
 * and per-use-case subject/body content per the QA spec.
 *
 * FIXED (was a KNOWN BUG, now resolved in production — see shared.test.ts):
 * `buildCoverLetterContent`'s very first statement calls `formatDateForPdf(new Date())` for the
 * letter date. `formatDateForPdf` (shared.ts) previously forwarded a raw Date straight to
 * formatters.ts's real `formatDate` (string-only), throwing a TypeError unconditionally. It now
 * converts the Date to its ISO date portion first, so the real, unmocked function no longer
 * crashes. The "end-to-end reproduction" describe block below uses the real shared.js module and
 * verifies content is returned without throwing. All other scenario tests in this file still mock
 * `./shared.js`'s `formatDateForPdf` to a fixed stub so the field-presence/omission and per-use-
 * case logic can be verified in isolation, independent of "today"'s real date — this is standard
 * unit-test collaborator isolation, not a workaround for a bug.
 *
 * NOTE: an earlier pass of this file also documented a `household?.name`/`household?.address`
 * field-name mismatch (real HouseholdSettings only has householdName/householdAddress) as a
 * second bug. That was fixed in production (coverLetterPdf.ts now reads householdName/
 * householdAddress correctly) during this same QA session — verified by re-reading the file and
 * re-running these tests. The sender-block/signature tests below assert the now-correct,
 * fixed behavior.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { TFunction } from 'i18next';
import type { SourceReportResponse, HouseholdSettings } from '@cornerstone/shared';
import type * as CoverLetterPdfModule from './coverLetterPdf.js';

const t = ((key: string, opts?: Record<string, unknown>) =>
  opts ? `${key}::${JSON.stringify(opts)}` : key) as unknown as TFunction;

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

describe('buildCoverLetterContent — end-to-end reproduction (real shared.js, unmocked)', () => {
  it('returns real content without throwing, now that formatDateForPdf(new Date()) is fixed', async () => {
    const { buildCoverLetterContent } =
      (await import('./coverLetterPdf.js')) as typeof CoverLetterPdfModule;
    const { formatDateForPdf } = await import('./shared.js');

    let content: ReturnType<typeof buildCoverLetterContent> | undefined;
    expect(() => {
      content = buildCoverLetterContent(makeReport(), fullHousehold, 'claim', t);
    }).not.toThrow();

    expect(Array.isArray(content)).toBe(true);
    expect(content!.length).toBeGreaterThan(0);

    // The date line uses the real (unmocked) formatDateForPdf(new Date()) internally.
    // Recompute the expected value the same way rather than asserting a literal string, so this
    // test stays stable regardless of what day it runs on.
    const expectedToday = formatDateForPdf(new Date());
    const dateItem = content!.find(
      (c) => typeof c === 'object' && c !== null && 'text' in c && c.text === expectedToday,
    );
    expect(dateItem).toBeDefined();
  });
});

describe('buildCoverLetterContent — isolated logic (formatDateForPdf mocked)', () => {
  let buildCoverLetterContent: typeof CoverLetterPdfModule.buildCoverLetterContent;

  beforeEach(async () => {
    jest.resetModules();
    jest.unstable_mockModule('./shared.js', () => ({
      formatDateForPdf: jest.fn(() => '15 Jan 2026'),
    }));
    ({ buildCoverLetterContent } =
      (await import('./coverLetterPdf.js')) as typeof CoverLetterPdfModule);
  });

  it('always includes a subject and body, even when every optional field is null', () => {
    const content = buildCoverLetterContent(makeReport(), null, 'claim', t);

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
    const content = buildCoverLetterContent(makeReport(), null, 'claim', t);
    expect(content[content.length - 1]).toEqual({ text: '', pageBreak: 'after' });
  });

  it('renders the sender block with householdName and householdAddress when present', () => {
    const content = buildCoverLetterContent(makeReport(), fullHousehold, 'claim', t);

    const senderBlock = content.find((c) => typeof c === 'object' && c !== null && 'stack' in c) as
      { stack: { text: string }[] } | undefined;

    expect(senderBlock).toBeDefined();
    expect(senderBlock?.stack.map((s) => s.text)).toEqual(['The Smiths', '123 Main St']);
  });

  it('omits the sender block entirely when household is null', () => {
    const content = buildCoverLetterContent(makeReport(), null, 'claim', t);

    const senderBlock = content.find((c) => typeof c === 'object' && c !== null && 'stack' in c);
    expect(senderBlock).toBeUndefined();
  });

  it('sender stack omits the address line when only householdName is present', () => {
    const nameOnly: HouseholdSettings = { householdName: 'The Smiths', householdAddress: null };
    const content = buildCoverLetterContent(makeReport(), nameOnly, 'claim', t);

    const senderBlock = content.find((c) => typeof c === 'object' && c !== null && 'stack' in c) as
      { stack: { text: string }[] } | undefined;
    expect(senderBlock?.stack.map((s) => s.text)).toEqual(['The Smiths']);
  });

  it('sender stack omits the name line when only householdAddress is present', () => {
    const addressOnly: HouseholdSettings = { householdName: null, householdAddress: '123 Main St' };
    const content = buildCoverLetterContent(makeReport(), addressOnly, 'claim', t);

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
    );

    const recipient = content.find(
      (c) => typeof c === 'object' && c !== null && 'text' in c && c.text === '456 Bank Ave',
    );
    expect(recipient).toBeDefined();
  });

  it('omits the recipient block when source.contactAddress is null', () => {
    const content = buildCoverLetterContent(makeReport(), null, 'claim', t);
    const recipient = content.find(
      (c) => typeof c === 'object' && c !== null && 'text' in c && c.text === '456 Bank Ave',
    );
    expect(recipient).toBeUndefined();
  });

  it('renders the reference line when source.reference is present', () => {
    const content = buildCoverLetterContent(makeReport({ reference: 'REF-42' }), null, 'claim', t);
    const refLine = content.find(
      (c) =>
        typeof c === 'object' && c !== null && 'text' in c && String(c.text).includes('REF-42'),
    );
    expect(refLine).toBeDefined();
    expect((refLine as { text: string }).text).toContain('sourceReports.coverLetter.reference');
  });

  it('omits the reference line when source.reference is null', () => {
    const content = buildCoverLetterContent(makeReport(), null, 'claim', t);
    const refLine = content.find(
      (c) =>
        typeof c === 'object' && c !== null && 'text' in c && String(c.text).includes('REF-42'),
    );
    expect(refLine).toBeUndefined();
  });

  it('renders the signature with the household name when present', () => {
    const content = buildCoverLetterContent(makeReport(), fullHousehold, 'claim', t);
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
    const content = buildCoverLetterContent(makeReport(), null, 'claim', t);
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
    const content = buildCoverLetterContent(makeReport(), addressOnly, 'claim', t);
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
      const content = buildCoverLetterContent(makeReport(), null, useCase, t);

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

  it('passes the report total into the body translation interpolation', () => {
    const content = buildCoverLetterContent(makeReport(), null, 'claim', t);
    const bodyItem = content.find(
      (c) =>
        typeof c === 'object' &&
        c !== null &&
        'text' in c &&
        String(c.text).includes('coverLetter.body.claim'),
    ) as { text: string } | undefined;

    expect(bodyItem?.text).toContain('"total":1500');
  });
});
