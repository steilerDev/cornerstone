/**
 * Unit tests for client/src/lib/reportPdf/continuationLetterPdf.ts (#2161).
 *
 * The continuation letter opens every PDF part after the first. It mirrors the cover letter's
 * margins but carries no total, no table and no source block, and never ends in a pageBreak
 * (pdf-lib appends the attachments, a break would leave a blank page).
 */
import { describe, it, expect } from '@jest/globals';
import type { ReportContent, ReportContentCoverLetter } from '../reportContent/index.js';
import { buildContinuationLetterContent } from './continuationLetterPdf.js';

function makeCoverLetter(
  overrides: Partial<ReportContentCoverLetter> = {},
): ReportContentCoverLetter {
  return {
    sender: 'The Smiths\n123 Main St',
    recipient: '456 Bank Ave',
    dateLine: 'DATELINE-2026-01-15',
    reference: 'REF-42',
    subject: 'COVER-SUBJECT-SHOULD-NOT-APPEAR',
    body: 'COVER-BODY-SHOULD-NOT-APPEAR',
    signature: 'The Smiths',
    opening: 'Dear Sir or Madam,',
    closing: 'Sincerely,',
    ...overrides,
  };
}

function makeContent(overrides: Partial<ReportContent> = {}): ReportContent {
  return {
    isOverview: false,
    isClaim: true,
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
      splitNote: 'partial',
      depositReducedNote: 'less deposit',
      source: 'Source',
      sourceType: 'Source Type',
      reference: 'Reference',
      generatedAt: 'Generated At',
      pageLabel: 'Page',
      coverLetterReferenceLabel: 'Ref',
      coverLetterSubjectLabel: 'Subject',
      skipReasonLabels: {
        footnoteFetchFailed: 'FetchFailed-label',
        footnoteInvalidPdf: 'InvalidPdf-label',
      },
    },
    sourceInfo: {
      sourceName: 'Home Loan',
      sourceTypeText: 'Bank Loan',
      referenceText: null,
      generatedAtText: 'GENERATED-AT-TEXT',
    },
    coverLetter: makeCoverLetter(),
    rows: [],
    summaryRows: [],
    footnotes: [],
    ...overrides,
  };
}

const letter = {
  subject: 'Attachment 2 of 3',
  body: 'This file contains attachments.',
  invoicesHeading: 'Invoices in this file:',
  invoiceLines: ['Acme, no. 1, 2026-01-10', 'Bolt, no. 2, 2026-01-11'],
};

describe('buildContinuationLetterContent — with a cover letter', () => {
  it('emits sender, recipient, date, reference, subject, opening, body, heading, lines, closing, signature in order', () => {
    const nodes = buildContinuationLetterContent(makeContent(), letter);
    expect(nodes).toEqual([
      { text: 'The Smiths\n123 Main St', style: 'small', margin: [0, 0, 0, 4] },
      { text: '456 Bank Ave', style: 'normal', margin: [0, 0, 0, 32] },
      { text: 'DATELINE-2026-01-15', style: 'normal', alignment: 'right', margin: [0, 0, 0, 20] },
      { text: 'Ref: REF-42', style: 'small', margin: [0, 0, 0, 4] },
      { text: 'Subject: Attachment 2 of 3', style: 'letterSubject', margin: [0, 0, 0, 16] },
      { text: 'Dear Sir or Madam,', style: 'normal', margin: [0, 0, 0, 16] },
      { text: 'This file contains attachments.', style: 'normal', margin: [0, 0, 0, 32] },
      { text: 'Invoices in this file:', style: 'normal', bold: true, margin: [0, 0, 0, 8] },
      { ul: letter.invoiceLines, style: 'normal', margin: [0, 0, 0, 32] },
      { text: 'Sincerely,', style: 'normal', margin: [0, 0, 0, 54] },
      { text: 'The Smiths', style: 'normal', margin: [0, 0, 0, 0] },
    ]);
  });

  it('uses the continuation subject and body, never the cover letter subject/body', () => {
    const json = JSON.stringify(buildContinuationLetterContent(makeContent(), letter));
    expect(json).not.toContain('COVER-SUBJECT-SHOULD-NOT-APPEAR');
    expect(json).not.toContain('COVER-BODY-SHOULD-NOT-APPEAR');
  });

  it('omits sender, recipient and reference when they are empty/null, keeping the rest', () => {
    const nodes = buildContinuationLetterContent(
      makeContent({
        coverLetter: makeCoverLetter({ sender: '', recipient: null, reference: null }),
      }),
      letter,
    );
    expect(nodes.map((n) => (n as { text?: string }).text ?? 'UL')).toEqual([
      'DATELINE-2026-01-15',
      'Subject: Attachment 2 of 3',
      'Dear Sir or Madam,',
      'This file contains attachments.',
      'Invoices in this file:',
      'UL',
      'Sincerely,',
      'The Smiths',
    ]);
  });

  it('does not end with a pageBreak node', () => {
    const nodes = buildContinuationLetterContent(makeContent(), letter);
    expect(JSON.stringify(nodes)).not.toContain('pageBreak');
    expect((nodes[nodes.length - 1] as { text: string }).text).toBe('The Smiths');
  });
});

describe('buildContinuationLetterContent — without a cover letter', () => {
  const nodes = buildContinuationLetterContent(makeContent({ coverLetter: null }), letter);

  it('emits only date, subject, body, heading and invoice lines', () => {
    expect(nodes).toEqual([
      { text: 'GENERATED-AT-TEXT', style: 'normal', alignment: 'right', margin: [0, 0, 0, 20] },
      { text: 'Subject: Attachment 2 of 3', style: 'letterSubject', margin: [0, 0, 0, 16] },
      { text: 'This file contains attachments.', style: 'normal', margin: [0, 0, 0, 32] },
      { text: 'Invoices in this file:', style: 'normal', bold: true, margin: [0, 0, 0, 8] },
      { ul: letter.invoiceLines, style: 'normal', margin: [0, 0, 0, 32] },
    ]);
  });

  it('has no sender, recipient, reference, opening, closing or signature text', () => {
    const json = JSON.stringify(nodes);
    for (const absent of [
      'The Smiths',
      '456 Bank Ave',
      'Ref:',
      'Dear Sir or Madam,',
      'Sincerely,',
      'REF-42',
    ]) {
      expect(json).not.toContain(absent);
    }
  });
});

describe('buildContinuationLetterContent — invoice list', () => {
  const makeLines = (n: number) => Array.from({ length: n }, (_, i) => `Invoice line ${i + 1}`);
  const noLetter = () => makeContent({ coverLetter: null });

  it.each([1, 12, 13, 40])(
    'renders %i lines as one single ul node with a 32pt bottom margin',
    (n) => {
      const lines = makeLines(n);
      const nodes = buildContinuationLetterContent(noLetter(), { ...letter, invoiceLines: lines });

      const uls = nodes.filter((node) => 'ul' in (node as object));
      expect(uls).toHaveLength(1);
      expect(uls[0]).toEqual({ ul: lines, style: 'normal', margin: [0, 0, 0, 32] });
      expect(nodes[nodes.length - 1]).toBe(uls[0]);
    },
  );

  it('keeps the heading and renders an empty ul when there are no lines', () => {
    const nodes = buildContinuationLetterContent(noLetter(), { ...letter, invoiceLines: [] });

    expect(nodes[nodes.length - 2]).toEqual({
      text: 'Invoices in this file:',
      style: 'normal',
      bold: true,
      margin: [0, 0, 0, 8],
    });
    expect(nodes[nodes.length - 1]).toEqual({ ul: [], style: 'normal', margin: [0, 0, 0, 32] });
  });

  it('places the ul before the closing and signature when a cover letter exists', () => {
    const nodes = buildContinuationLetterContent(makeContent(), {
      ...letter,
      invoiceLines: makeLines(13),
    });
    expect(nodes[nodes.length - 3]).toHaveProperty('ul');
    expect((nodes[nodes.length - 2] as { text: string }).text).toBe('Sincerely,');
  });
});

describe('buildContinuationLetterContent — nothing from the report body leaks in', () => {
  it('contains no total, table, source block or footnote content', () => {
    const content = makeContent({
      rows: [
        {
          invoiceId: 'inv-1',
          vendor: 'ROW-VENDOR',
          invoiceNumber: 'ROW-NUMBER',
          dateText: 'ROW-DATE',
          status: null,
          statusText: null,
          invoiceAmountText: 'ROW-AMOUNT',
          allocatedAmountValueText: 'ROW-ALLOCATED',
          isPartial: false,
          isDepositReduced: false,
          isDeposit: false,
          isRefund: false,
          refundNoteText: '',
          usageText: 'ROW-USAGE',
          attachmentsNote: null,
          areaText: null,
        },
      ],
      summaryRows: [{ key: 'total', label: 'SUMMARY-TOTAL-LABEL', amountText: 'SUMMARY-AMOUNT' }],
      footnotes: [{ id: 'f', marker: '†', text: 'FOOTNOTE-TEXT' }],
    });
    const json = JSON.stringify(buildContinuationLetterContent(content, letter));
    for (const absent of [
      'ROW-',
      'SUMMARY-',
      'FOOTNOTE-TEXT',
      '"table"',
      'Source Type',
      'Bank Loan',
      'Home Loan',
    ]) {
      expect(json).not.toContain(absent);
    }
  });
});
