/**
 * Unit tests for the optional `partsNotice` option of buildCoverLetterContent (#2161).
 *
 * With a notice, the last body paragraph's bottom margin drops from 32 to 8 and the notice is
 * pushed as its own paragraph (32pt below) before the closing. Without it, output is identical to
 * the one-argument call.
 */
import { describe, it, expect } from '@jest/globals';
import type { ReportContent, ReportContentCoverLetter } from '../reportContent/index.js';
import { buildCoverLetterContent } from './coverLetterPdf.js';

function makeCoverLetter(
  overrides: Partial<ReportContentCoverLetter> = {},
): ReportContentCoverLetter {
  return {
    sender: 'The Smiths',
    recipient: '456 Bank Ave',
    dateLine: 'date(2026-01-15)',
    reference: 'REF-1',
    subject: 'Subject text',
    body: 'Body text',
    signature: 'The Smiths',
    opening: 'Dear Sir or Madam,',
    closing: 'Sincerely,',
    ...overrides,
  };
}

function makeContent(coverLetter: ReportContentCoverLetter | null): ReportContent {
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
      coverLetterReferenceLabel: 'Reference',
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
      generatedAtText: 'date(2026-01-15)',
    },
    coverLetter,
    rows: [],
    summaryRows: [],
    footnotes: [],
  };
}

const NOTICE = 'This report consists of 3 files.';

describe('buildCoverLetterContent — partsNotice', () => {
  it('produces output identical to the 1-arg call when no options are given', () => {
    const content = makeContent(makeCoverLetter());
    expect(buildCoverLetterContent(content, undefined)).toEqual(buildCoverLetterContent(content));
  });

  it('produces output identical to the 1-arg call for an empty options object or an undefined notice', () => {
    const content = makeContent(makeCoverLetter());
    expect(buildCoverLetterContent(content, {})).toEqual(buildCoverLetterContent(content));
    expect(buildCoverLetterContent(content, { partsNotice: undefined })).toEqual(
      buildCoverLetterContent(content),
    );
  });

  it('treats an empty-string notice as no notice', () => {
    const content = makeContent(makeCoverLetter());
    expect(buildCoverLetterContent(content, { partsNotice: '' })).toEqual(
      buildCoverLetterContent(content),
    );
  });

  it('keeps the single body paragraph at a 32pt margin without a notice', () => {
    const nodes = buildCoverLetterContent(makeContent(makeCoverLetter()));
    const body = nodes.find((n) => (n as { text?: string }).text === 'Body text');
    expect(body).toEqual({ text: 'Body text', style: 'normal', margin: [0, 0, 0, 32] });
  });

  it('lowers the single body paragraph margin to 8 and adds the notice at 32 right after it', () => {
    const nodes = buildCoverLetterContent(makeContent(makeCoverLetter()), {
      partsNotice: NOTICE,
    });
    const bodyIdx = nodes.findIndex((n) => (n as { text?: string }).text === 'Body text');
    expect(nodes[bodyIdx]).toEqual({ text: 'Body text', style: 'normal', margin: [0, 0, 0, 8] });
    expect(nodes[bodyIdx + 1]).toEqual({ text: NOTICE, style: 'normal', margin: [0, 0, 0, 32] });
  });

  it('puts the notice between the last of several body paragraphs and the closing', () => {
    const nodes = buildCoverLetterContent(
      makeContent(makeCoverLetter({ body: 'Para one\n\nPara two\n\nPara three' })),
      { partsNotice: NOTICE },
    );
    const margins = (text: string) =>
      (nodes.find((n) => (n as { text?: string }).text === text) as { margin: number[] }).margin;
    expect(margins('Para one')).toEqual([0, 0, 0, 8]);
    expect(margins('Para two')).toEqual([0, 0, 0, 8]);
    expect(margins('Para three')).toEqual([0, 0, 0, 8]);
    expect(margins(NOTICE)).toEqual([0, 0, 0, 32]);
    const idx = (text: string) => nodes.findIndex((n) => (n as { text?: string }).text === text);
    expect(idx(NOTICE)).toBe(idx('Para three') + 1);
    expect(idx('Sincerely,')).toBe(idx(NOTICE) + 1);
  });

  it('keeps multi-paragraph bodies at a 32pt last-paragraph margin without a notice', () => {
    const nodes = buildCoverLetterContent(
      makeContent(makeCoverLetter({ body: 'Para one\n\nPara two' })),
    );
    const margin = (text: string) =>
      (nodes.find((n) => (n as { text?: string }).text === text) as { margin: number[] }).margin;
    expect(margin('Para one')).toEqual([0, 0, 0, 8]);
    expect(margin('Para two')).toEqual([0, 0, 0, 32]);
  });

  it('only inserts the notice node and changes only the last body margin versus the no-notice output', () => {
    const content = makeContent(makeCoverLetter());
    const without = buildCoverLetterContent(content);
    const withNotice = buildCoverLetterContent(content, { partsNotice: NOTICE });
    expect(withNotice).toHaveLength(without.length + 1);
    const stripped = withNotice.filter((n) => (n as { text?: string }).text !== NOTICE);
    const normalised = stripped.map((n) =>
      (n as { text?: string }).text === 'Body text'
        ? { ...(n as object), margin: [0, 0, 0, 32] }
        : n,
    );
    expect(normalised).toEqual(without);
  });

  it('still ends with the closing, signature and the page break', () => {
    const nodes = buildCoverLetterContent(makeContent(makeCoverLetter()), { partsNotice: NOTICE });
    expect(nodes.slice(-3)).toEqual([
      { text: 'Sincerely,', style: 'normal', margin: [0, 0, 0, 54] },
      { text: 'The Smiths', style: 'normal', margin: [0, 0, 0, 0] },
      { text: '', pageBreak: 'after' },
    ]);
  });

  it('returns an empty array when there is no cover letter, notice or not', () => {
    expect(buildCoverLetterContent(makeContent(null), { partsNotice: NOTICE })).toEqual([]);
  });
});
