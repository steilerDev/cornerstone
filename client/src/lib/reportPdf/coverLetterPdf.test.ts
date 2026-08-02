/**
 * Unit tests for client/src/lib/reportPdf/coverLetterPdf.ts
 *
 * Story #1900 REWRITE. buildCoverLetterContent's signature changed from consuming a raw
 * SourceReportResponse + household + useCase + formatters/includedTotal params to consuming an
 * already-built `ReportContent` (whose `.coverLetter` is non-null — guaranteed by the caller,
 * merge.ts, which only invokes this when `reportContent.coverLetter` exists):
 *
 *   buildCoverLetterContent(reportContent: ReportContent, t: TFunction): Content[]
 *
 * All field derivation (sender/recipient/dateLine/reference/subject/body/signature) now lives in
 * buildReportContent.ts (see buildReportContent.test.ts) — this file only lays out the
 * already-derived ReportContentCoverLetter fields into pdfmake Content[], plus the two sanctioned
 * reportT() label-prefix exceptions (Reference:/Subject:).
 */
import { describe, it, expect } from '@jest/globals';
import type { TFunction } from 'i18next';
import type { ReportContent, ReportContentCoverLetter } from '../reportContent/index.js';
import { buildCoverLetterContent } from './coverLetterPdf.js';

const t = ((key: string) => key) as unknown as TFunction;

function makeCoverLetter(
  overrides: Partial<ReportContentCoverLetter> = {},
): ReportContentCoverLetter {
  return {
    sender: 'The Smiths\n123 Main St',
    recipient: null,
    dateLine: 'date(2026-01-15)',
    reference: null,
    subject: 'Subject text',
    body: 'Body text',
    signature: 'The Smiths',
    ...overrides,
  };
}

function makeContent(overrides: Partial<ReportContent> = {}): ReportContent {
  return {
    isOverview: false,
    isClaim: false,
    tableTitle: 'Title',
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
      source: 'Source',
      sourceType: 'Source Type',
      reference: 'Reference',
      generatedAt: 'Generated At',
    },
    sourceInfo: {
      sourceName: 'Home Loan',
      sourceTypeText: 'Bank Loan',
      referenceText: null,
      generatedAtText: 'date(2026-01-15)',
    },
    coverLetter: makeCoverLetter(),
    rows: [],
    summaryRows: [],
    footnotes: [],
    ...overrides,
  };
}

describe('buildCoverLetterContent — guarded by caller (coverLetter non-null)', () => {
  it('returns an empty array if coverLetter happens to be null (defensive, though the caller guarantees non-null)', () => {
    const content = makeContent({ coverLetter: null });
    expect(buildCoverLetterContent(content, t)).toEqual([]);
  });
});

describe('buildCoverLetterContent — sender block', () => {
  it('renders the sender text verbatim (already-joined by buildReportContent, may contain embedded \\n)', () => {
    const content = makeContent({
      coverLetter: makeCoverLetter({ sender: 'The Smiths\n123 Main St' }),
    });
    const result = buildCoverLetterContent(content, t);
    const senderItem = result.find(
      (c) =>
        typeof c === 'object' && c !== null && 'text' in c && c.text === 'The Smiths\n123 Main St',
    );
    expect(senderItem).toBeDefined();
  });

  it('omits the sender block entirely when sender is an empty string (household absent)', () => {
    const content = makeContent({ coverLetter: makeCoverLetter({ sender: '' }) });
    const result = buildCoverLetterContent(content, t);
    // Only the fixed dateLine/subject/body blocks remain; no empty-text sender item is pushed.
    const senderCandidates = result.filter(
      (c) =>
        typeof c === 'object' && c !== null && 'text' in c && c.text === '' && !('pageBreak' in c),
    );
    expect(senderCandidates).toEqual([]);
  });
});

describe('buildCoverLetterContent — recipient block', () => {
  it('renders the recipient text when present', () => {
    const content = makeContent({ coverLetter: makeCoverLetter({ recipient: '456 Bank Ave' }) });
    const result = buildCoverLetterContent(content, t);
    const recipientItem = result.find(
      (c) => typeof c === 'object' && c !== null && 'text' in c && c.text === '456 Bank Ave',
    );
    expect(recipientItem).toBeDefined();
  });

  it('omits the recipient block when recipient is null', () => {
    const content = makeContent({ coverLetter: makeCoverLetter({ recipient: null }) });
    const result = buildCoverLetterContent(content, t);
    const recipientItem = result.find(
      (c) => typeof c === 'object' && c !== null && 'text' in c && c.text === '456 Bank Ave',
    );
    expect(recipientItem).toBeUndefined();
  });
});

describe('buildCoverLetterContent — date line (read-only)', () => {
  it('renders coverLetter.dateLine verbatim (no re-formatting in this layer)', () => {
    const content = makeContent({ coverLetter: makeCoverLetter({ dateLine: 'date(2026-03-01)' }) });
    const result = buildCoverLetterContent(content, t);
    const dateItem = result.find(
      (c) => typeof c === 'object' && c !== null && 'text' in c && c.text === 'date(2026-03-01)',
    );
    expect(dateItem).toBeDefined();
  });
});

describe('buildCoverLetterContent — reference line (sanctioned reportT label prefix)', () => {
  it('renders "Reference: <value>" when reference is present', () => {
    const content = makeContent({ coverLetter: makeCoverLetter({ reference: 'REF-42' }) });
    const result = buildCoverLetterContent(content, t);
    const refItem = result.find(
      (c) =>
        typeof c === 'object' && c !== null && 'text' in c && String(c.text).includes('REF-42'),
    ) as { text: string } | undefined;
    expect(refItem?.text).toBe('sourceReports.coverLetter.reference: REF-42');
  });

  it('omits the reference line when reference is null', () => {
    const content = makeContent({ coverLetter: makeCoverLetter({ reference: null }) });
    const result = buildCoverLetterContent(content, t);
    const refItem = result.find(
      (c) =>
        typeof c === 'object' && c !== null && 'text' in c && String(c.text).includes('REF-42'),
    );
    expect(refItem).toBeUndefined();
  });

  it('coverLetter.reference is rendered independently of sourceInfo.referenceText (never cross-read)', () => {
    const content = makeContent({
      sourceInfo: {
        sourceName: 'Home Loan',
        sourceTypeText: 'Bank Loan',
        referenceText: 'SOURCE-SEED-REF',
        generatedAtText: 'date(2026-01-15)',
      },
      coverLetter: makeCoverLetter({ reference: 'LETTER-REF' }),
    });
    const result = buildCoverLetterContent(content, t);
    const refItem = result.find(
      (c) =>
        typeof c === 'object' && c !== null && 'text' in c && String(c.text).includes('LETTER-REF'),
    ) as { text: string } | undefined;
    expect(refItem?.text).toContain('LETTER-REF');
    expect(refItem?.text).not.toContain('SOURCE-SEED-REF');
  });
});

describe('buildCoverLetterContent — subject and body (always rendered, already-derived text)', () => {
  it('renders "Subject: <text>" verbatim', () => {
    const content = makeContent({ coverLetter: makeCoverLetter({ subject: 'My Subject' }) });
    const result = buildCoverLetterContent(content, t);
    const subjectItem = result.find(
      (c) =>
        typeof c === 'object' && c !== null && 'text' in c && String(c.text).includes('My Subject'),
    ) as { text: string } | undefined;
    expect(subjectItem?.text).toBe('sourceReports.coverLetter.subjectLabel: My Subject');
  });

  it('renders the body text verbatim (already interpolated once at build time)', () => {
    const content = makeContent({
      coverLetter: makeCoverLetter({ body: 'Already interpolated €500.00 body' }),
    });
    const result = buildCoverLetterContent(content, t);
    const bodyItem = result.find(
      (c) =>
        typeof c === 'object' &&
        c !== null &&
        'text' in c &&
        c.text === 'Already interpolated €500.00 body',
    );
    expect(bodyItem).toBeDefined();
  });
});

describe('buildCoverLetterContent — signature', () => {
  it('renders the signature with margin [0, 40, 0, 0] when non-empty', () => {
    const content = makeContent({ coverLetter: makeCoverLetter({ signature: 'The Smiths' }) });
    const result = buildCoverLetterContent(content, t);
    const signature = result.find(
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

  it('omits the signature block entirely when signature is an empty string', () => {
    const content = makeContent({ coverLetter: makeCoverLetter({ signature: '' }) });
    const result = buildCoverLetterContent(content, t);
    const signature = result.find(
      (c) =>
        typeof c === 'object' &&
        c !== null &&
        'margin' in c &&
        Array.isArray((c as { margin: number[] }).margin) &&
        (c as { margin: number[] }).margin[1] === 40,
    );
    expect(signature).toBeUndefined();
  });
});

describe('buildCoverLetterContent — structure', () => {
  it('always ends with a trailing page break before the overview section', () => {
    const content = makeContent();
    const result = buildCoverLetterContent(content, t);
    expect(result[result.length - 1]).toEqual({ text: '', pageBreak: 'after' });
  });

  it('returns content without throwing for a fully-populated cover letter', () => {
    const content = makeContent({
      coverLetter: makeCoverLetter({
        sender: 'A\nB',
        recipient: 'C',
        reference: 'D',
        subject: 'E',
        body: 'F',
        signature: 'A',
      }),
    });
    let result: ReturnType<typeof buildCoverLetterContent> | undefined;
    expect(() => {
      result = buildCoverLetterContent(content, t);
    }).not.toThrow();
    expect(result!.length).toBeGreaterThan(0);
  });
});
