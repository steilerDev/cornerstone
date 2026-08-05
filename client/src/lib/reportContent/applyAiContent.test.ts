/**
 * Unit tests for client/src/lib/reportContent/applyAiContent.ts (Story #1901)
 *
 * applyAiContent is a pure function: given a baseline ReportContent and an
 * GenerateReportContentResponse | null, it returns a NEW ReportContent with the AI-generated
 * cover-letter subject/body and per-row usage descriptions overlaid onto the baseline, without
 * mutating the input. `''` in any AI field falls back to the baseline value; aiContent === null
 * returns the content unchanged (same reference).
 */
import { describe, it, expect } from '@jest/globals';
import type { GenerateReportContentResponse } from '@cornerstone/shared';
import type { ReportContent, ReportContentRow } from './types.js';
import { applyAiContent } from './applyAiContent.js';

function makeRow(overrides: Partial<ReportContentRow> = {}): ReportContentRow {
  return {
    invoiceId: 'inv-1',
    vendor: 'ACME',
    invoiceNumber: 'INV-001',
    dateText: '01/10/2026',
    status: null,
    statusText: null,
    invoiceAmountText: '€100.00',
    allocatedAmountValueText: '€100.00',
    isSplit: false,
    isDepositReduced: false,
    isDeposit: false,
    isRefund: false,
    refundNoteText: '',
    usageText: 'Baseline usage',
    attachmentsNote: null,
    areaText: null,
    ...overrides,
  };
}

function makeLabels(): ReportContent['labels'] {
  return {
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
    coverLetterReferenceLabel: 'Cover Letter Reference',
    coverLetterSubjectLabel: 'Cover Letter Subject',
    skipReasonLabels: {
      footnoteFetchFailed: 'Footnote Fetch Failed',
      footnoteInvalidPdf: 'Footnote Invalid PDF',
    },
  };
}

function makeContent(overrides: Partial<ReportContent> = {}): ReportContent {
  return {
    isOverview: false,
    isClaim: false,
    tableTitle: 'Title',
    labels: makeLabels(),
    sourceInfo: {
      sourceName: 'Home Loan',
      sourceTypeText: 'Bank Loan',
      referenceText: null,
      generatedAtText: '01/15/2026',
    },
    coverLetter: {
      sender: 'The Smiths\n123 Main St',
      recipient: '456 Bank Ave',
      dateLine: '01/15/2026',
      reference: 'REF-1',
      subject: 'Baseline Subject',
      body: 'Baseline Body',
      signature: 'The Smiths',
      closing: 'Sincerely,',
    },
    rows: [makeRow()],
    summaryRows: [{ key: 'total', label: 'Total', amountText: '€100.00' }],
    footnotes: [],
    ...overrides,
  };
}

function makeAiContent(
  overrides: Partial<GenerateReportContentResponse> = {},
): GenerateReportContentResponse {
  return {
    letterSubject: 'AI Subject',
    letterBody: 'AI Body',
    descriptions: { 'inv-1': 'AI-generated usage description' },
    ...overrides,
  };
}

describe('applyAiContent — no-op / null cases', () => {
  it('returns the SAME object reference when aiContent is null', () => {
    const content = makeContent();
    const result = applyAiContent(content, null);
    expect(result).toBe(content);
  });

  it('returns a NEW top-level object reference when aiContent is provided (even if every field falls back)', () => {
    const content = makeContent();
    const result = applyAiContent(content, makeAiContent({ letterSubject: '', letterBody: '' }));
    expect(result).not.toBe(content);
  });
});

describe('applyAiContent — cover letter overlay', () => {
  it('overlays letterSubject onto coverLetter.subject', () => {
    const content = makeContent();
    const result = applyAiContent(content, makeAiContent({ letterSubject: 'New AI Subject' }));
    expect(result.coverLetter!.subject).toBe('New AI Subject');
  });

  it('overlays letterBody onto coverLetter.body', () => {
    const content = makeContent();
    const result = applyAiContent(content, makeAiContent({ letterBody: 'New AI Body' }));
    expect(result.coverLetter!.body).toBe('New AI Body');
  });

  it('an empty-string letterSubject falls back to the baseline subject (not blanked)', () => {
    const content = makeContent();
    const result = applyAiContent(content, makeAiContent({ letterSubject: '' }));
    expect(result.coverLetter!.subject).toBe('Baseline Subject');
  });

  it('an empty-string letterBody falls back to the baseline body (not blanked)', () => {
    const content = makeContent();
    const result = applyAiContent(content, makeAiContent({ letterBody: '' }));
    expect(result.coverLetter!.body).toBe('Baseline Body');
  });

  it('is a no-op on coverLetter when content.coverLetter is null (includeCoverLetter was false)', () => {
    const content = makeContent({ coverLetter: null });
    const result = applyAiContent(content, makeAiContent());
    expect(result.coverLetter).toBeNull();
  });

  it('does not touch sender, recipient, reference, dateLine, or signature', () => {
    const content = makeContent();
    const result = applyAiContent(content, makeAiContent());
    expect(result.coverLetter!.sender).toBe(content.coverLetter!.sender);
    expect(result.coverLetter!.recipient).toBe(content.coverLetter!.recipient);
    expect(result.coverLetter!.reference).toBe(content.coverLetter!.reference);
    expect(result.coverLetter!.dateLine).toBe(content.coverLetter!.dateLine);
    expect(result.coverLetter!.signature).toBe(content.coverLetter!.signature);
  });
});

describe('applyAiContent — row usageText overlay', () => {
  it("overlays a matching invoiceId's description onto that row's usageText", () => {
    const content = makeContent();
    const result = applyAiContent(
      content,
      makeAiContent({ descriptions: { 'inv-1': 'AI description for inv-1' } }),
    );
    expect(result.rows[0]!.usageText).toBe('AI description for inv-1');
  });

  it("matches rows by invoiceId in isolation — a different row's baseline usageText is untouched", () => {
    const rowA = makeRow({ invoiceId: 'inv-a', usageText: 'A baseline' });
    const rowB = makeRow({ invoiceId: 'inv-b', usageText: 'B baseline' });
    const content = makeContent({ rows: [rowA, rowB] });
    const result = applyAiContent(content, makeAiContent({ descriptions: { 'inv-a': 'A AI' } }));
    expect(result.rows.find((r) => r.invoiceId === 'inv-a')!.usageText).toBe('A AI');
    expect(result.rows.find((r) => r.invoiceId === 'inv-b')!.usageText).toBe('B baseline');
  });

  it('a row with no matching invoiceId in descriptions keeps its baseline usageText', () => {
    const content = makeContent();
    const result = applyAiContent(content, makeAiContent({ descriptions: {} }));
    expect(result.rows[0]!.usageText).toBe('Baseline usage');
  });

  it('an empty-string description for a matched invoiceId falls back to the baseline usageText (not blanked)', () => {
    const content = makeContent();
    const result = applyAiContent(content, makeAiContent({ descriptions: { 'inv-1': '' } }));
    expect(result.rows[0]!.usageText).toBe('Baseline usage');
  });

  it('a descriptions entry for an invoiceId not present in rows is silently ignored (no crash, no phantom row)', () => {
    const content = makeContent();
    const result = applyAiContent(
      content,
      makeAiContent({ descriptions: { 'inv-1': 'A', 'does-not-exist': 'ghost' } }),
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.usageText).toBe('A');
  });

  it('does not touch other row fields (vendor, invoiceNumber, attachmentsNote, etc.)', () => {
    const row = makeRow({ attachmentsNote: 'baseline note' });
    const content = makeContent({ rows: [row] });
    const result = applyAiContent(content, makeAiContent());
    expect(result.rows[0]!.vendor).toBe(row.vendor);
    expect(result.rows[0]!.invoiceNumber).toBe(row.invoiceNumber);
    expect(result.rows[0]!.attachmentsNote).toBe('baseline note');
  });
});

describe('applyAiContent — purity / immutability', () => {
  it('does not mutate the original content object', () => {
    const content = makeContent();
    const snapshot = JSON.parse(JSON.stringify(content));
    applyAiContent(content, makeAiContent());
    expect(content).toEqual(snapshot);
  });

  it('does not mutate the original coverLetter object (new object identity on the result)', () => {
    const content = makeContent();
    const originalCoverLetter = content.coverLetter;
    const result = applyAiContent(content, makeAiContent());
    expect(result.coverLetter).not.toBe(originalCoverLetter);
    expect(content.coverLetter).toBe(originalCoverLetter);
  });

  it('does not mutate the original rows array or row objects (new array + object identity on the result)', () => {
    const content = makeContent();
    const originalRows = content.rows;
    const originalRow = content.rows[0];
    const result = applyAiContent(content, makeAiContent());
    expect(result.rows).not.toBe(originalRows);
    expect(result.rows[0]).not.toBe(originalRow);
    expect(content.rows).toBe(originalRows);
    expect(content.rows[0]).toBe(originalRow);
  });

  it('preserves untouched top-level fields (summaryRows, footnotes, sourceInfo, isOverview, tableTitle, labels) by value', () => {
    const content = makeContent();
    const result = applyAiContent(content, makeAiContent());
    expect(result.summaryRows).toEqual(content.summaryRows);
    expect(result.footnotes).toEqual(content.footnotes);
    expect(result.sourceInfo).toEqual(content.sourceInfo);
    expect(result.isOverview).toBe(content.isOverview);
    expect(result.tableTitle).toBe(content.tableTitle);
    expect(result.labels).toEqual(content.labels);
  });

  it('applies both cover-letter and row overlays together from a single call', () => {
    const content = makeContent();
    const result = applyAiContent(
      content,
      makeAiContent({
        letterSubject: 'Combined Subject',
        letterBody: 'Combined Body',
        descriptions: { 'inv-1': 'Combined usage' },
      }),
    );
    expect(result.coverLetter!.subject).toBe('Combined Subject');
    expect(result.coverLetter!.body).toBe('Combined Body');
    expect(result.rows[0]!.usageText).toBe('Combined usage');
  });
});
