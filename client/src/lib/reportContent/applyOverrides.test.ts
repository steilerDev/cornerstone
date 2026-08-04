/**
 * Unit tests for client/src/lib/reportContent/applyOverrides.ts
 *
 * applyOverrides is a pure function: given a baseline ReportContent and a flat
 * ReportContentOverrides map, it returns a NEW ReportContent with the recognized override keys
 * applied, without mutating the input. Recognized keys: coverLetter.{sender,recipient,reference,
 * subject,body,signature} and row.<invoiceId>.usageText. Unknown keys are silently
 * ignored. Overriding coverLetter.sender recomputes coverLetter.signature.
 */
import { describe, it, expect } from '@jest/globals';
import type { ReportContent, ReportContentRow } from './types.js';
import { applyOverrides } from './applyOverrides.js';

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
      closing: 'Baseline Closing',
    },
    rows: [makeRow()],
    summaryRows: [{ key: 'total', label: 'Total', amountText: '€100.00' }],
    footnotes: [],
    ...overrides,
  };
}

describe('applyOverrides — no-op cases', () => {
  it('returns the SAME object reference when overrides is an empty object', () => {
    const content = makeContent();
    const result = applyOverrides(content, {});
    expect(result).toBe(content);
  });

  it('returns the SAME object reference when overrides has no keys (deep-equal empty map)', () => {
    const content = makeContent();
    const overrides: Record<string, string> = {};
    const result = applyOverrides(content, overrides);
    expect(result).toBe(content);
  });

  it('ignores an unknown/unrecognized key entirely', () => {
    const content = makeContent();
    const result = applyOverrides(content, {
      'coverLetter.notARealField': 'x',
      'row.inv-1.notReal': 'y',
    });
    expect(result.coverLetter).toEqual(content.coverLetter);
    expect(result.rows).toEqual(content.rows);
  });
});

describe('applyOverrides — cover letter overrides', () => {
  it('overrides sender and recomputes signature from the new first line', () => {
    const content = makeContent();
    const result = applyOverrides(content, { 'coverLetter.sender': 'Jane Doe\n99 New St' });
    expect(result.coverLetter!.sender).toBe('Jane Doe\n99 New St');
    expect(result.coverLetter!.signature).toBe('Jane Doe');
  });

  it('overrides sender to a single line and signature matches it exactly', () => {
    const content = makeContent();
    const result = applyOverrides(content, { 'coverLetter.sender': 'Solo Name' });
    expect(result.coverLetter!.signature).toBe('Solo Name');
  });

  it('overrides sender to an empty string and signature becomes empty', () => {
    const content = makeContent();
    const result = applyOverrides(content, { 'coverLetter.sender': '' });
    expect(result.coverLetter!.sender).toBe('');
    expect(result.coverLetter!.signature).toBe('');
  });

  it('trims whitespace when recomputing signature from an overridden sender', () => {
    const content = makeContent();
    const result = applyOverrides(content, { 'coverLetter.sender': '  Spacey Name  \nline2' });
    expect(result.coverLetter!.signature).toBe('Spacey Name');
  });

  it('overrides recipient independently of sender (signature untouched)', () => {
    const content = makeContent();
    const result = applyOverrides(content, { 'coverLetter.recipient': 'New Recipient' });
    expect(result.coverLetter!.recipient).toBe('New Recipient');
    expect(result.coverLetter!.sender).toBe(content.coverLetter!.sender);
    expect(result.coverLetter!.signature).toBe(content.coverLetter!.signature);
  });

  it('overrides reference independently — never touches sourceInfo.referenceText', () => {
    const content = makeContent();
    content.sourceInfo.referenceText = 'ORIGINAL-SEED';
    const result = applyOverrides(content, { 'coverLetter.reference': 'NEW-REF' });
    expect(result.coverLetter!.reference).toBe('NEW-REF');
    expect(result.sourceInfo.referenceText).toBe('ORIGINAL-SEED');
  });

  it('overrides subject independently', () => {
    const content = makeContent();
    const result = applyOverrides(content, { 'coverLetter.subject': 'New Subject' });
    expect(result.coverLetter!.subject).toBe('New Subject');
    expect(result.coverLetter!.body).toBe(content.coverLetter!.body);
  });

  it('overrides body independently', () => {
    const content = makeContent();
    const result = applyOverrides(content, { 'coverLetter.body': 'New Body' });
    expect(result.coverLetter!.body).toBe('New Body');
    expect(result.coverLetter!.subject).toBe(content.coverLetter!.subject);
  });

  it('#1932 AC 1.1: a multi-paragraph body override with interior leading/trailing whitespace and a double-blank-line gap survives the round trip byte-for-byte — no collapsing, trimming, or normalisation', () => {
    const content = makeContent();
    // "Interior" whitespace deliberately includes: leading spaces on a line, trailing spaces on a
    // line, and a THREE-newline gap (a true double-blank-line, not just a single blank line) —
    // exactly the shape a naive `.trim()` or whitespace-collapsing pass on the override store
    // would alter.
    const body =
      '  Leading spaces on this line.\nTrailing spaces on this line.  \n\n\nThird paragraph after a double-blank-line gap.';
    const result = applyOverrides(content, { 'coverLetter.body': body });
    expect(result.coverLetter!.body).toBe(body);
    // Explicit, byte-level proof the whitespace survived (not just object equality above): the
    // leading/trailing spaces and the doubled blank-line gap are all still present verbatim.
    expect(result.coverLetter!.body.startsWith('  Leading spaces')).toBe(true);
    expect(result.coverLetter!.body).toContain('this line.  \n');
    expect(result.coverLetter!.body).toContain('\n\n\nThird paragraph');
  });

  it('applies multiple cover-letter overrides from a single call together', () => {
    const content = makeContent();
    const result = applyOverrides(content, {
      'coverLetter.sender': 'Jane Doe',
      'coverLetter.subject': 'New Subject',
      'coverLetter.body': 'New Body',
    });
    expect(result.coverLetter!.sender).toBe('Jane Doe');
    expect(result.coverLetter!.signature).toBe('Jane Doe');
    expect(result.coverLetter!.subject).toBe('New Subject');
    expect(result.coverLetter!.body).toBe('New Body');
    expect(result.coverLetter!.recipient).toBe(content.coverLetter!.recipient);
  });

  it('cover-letter-scoped overrides are no-ops when content.coverLetter is null (includeCoverLetter was false)', () => {
    const content = makeContent({ coverLetter: null });
    const result = applyOverrides(content, {
      'coverLetter.sender': 'Should not apply',
      'coverLetter.subject': 'Should not apply either',
    });
    expect(result.coverLetter).toBeNull();
  });
});

describe('applyOverrides — AC 2.6: explicit signature override wins over sender-triggered recompute', () => {
  it('an explicitly-overridden signature is NOT clobbered when the same call also overrides sender', () => {
    // This is the core #1932 behaviour change: before AC 2.6, ANY overridden sender
    // unconditionally recomputed signature from its first line, even when signature had already
    // been explicitly set by the user — silently discarding their edit. Simulates the real usage
    // pattern: the app's persisted `overrides` map already has 'coverLetter.signature' present
    // (from an earlier signature edit); the user now also edits sender, adding
    // 'coverLetter.sender' to that SAME map on the next render.
    const content = makeContent();
    const overridesAfterSignatureEdit = { 'coverLetter.signature': 'Custom Signature' };
    const afterSignatureEdit = applyOverrides(content, overridesAfterSignatureEdit);
    expect(afterSignatureEdit.coverLetter!.signature).toBe('Custom Signature');

    const overridesAfterSenderEditToo = {
      ...overridesAfterSignatureEdit,
      'coverLetter.sender': 'Jane Doe\n99 New St',
    };
    const result = applyOverrides(content, overridesAfterSenderEditToo);

    expect(result.coverLetter!.sender).toBe('Jane Doe\n99 New St');
    // The explicit signature override wins — it must NOT have been recomputed to 'Jane Doe'.
    expect(result.coverLetter!.signature).toBe('Custom Signature');
  });

  it('overriding only signature (sender untouched) sets signature to exactly the override value', () => {
    const content = makeContent();
    const result = applyOverrides(content, { 'coverLetter.signature': 'Only Signature Edited' });
    expect(result.coverLetter!.signature).toBe('Only Signature Edited');
    expect(result.coverLetter!.sender).toBe(content.coverLetter!.sender);
  });

  it('removing the signature override key and re-applying restores the sender-derived default', () => {
    const content = makeContent();
    const withBothOverridden = applyOverrides(content, {
      'coverLetter.sender': 'Jane Doe\n99 New St',
      'coverLetter.signature': 'Custom Signature',
    });
    expect(withBothOverridden.coverLetter!.signature).toBe('Custom Signature');

    // User resets the signature field: its key is removed from the overrides map, but sender's
    // override is still present (unrelated field, untouched).
    const withSignatureRemoved = applyOverrides(content, {
      'coverLetter.sender': 'Jane Doe\n99 New St',
    });
    expect(withSignatureRemoved.coverLetter!.signature).toBe('Jane Doe');
    expect(withSignatureRemoved.coverLetter!.sender).toBe('Jane Doe\n99 New St');
  });

  it('when both sender and signature keys are present in the same overrides object, signature wins regardless of key insertion order', () => {
    const content = makeContent();

    const signatureFirst = {
      'coverLetter.signature': 'Wins Either Way',
      'coverLetter.sender': 'A\nB',
    };
    const senderFirst = {
      'coverLetter.sender': 'A\nB',
      'coverLetter.signature': 'Wins Either Way',
    };

    const resultA = applyOverrides(content, signatureFirst);
    const resultB = applyOverrides(content, senderFirst);

    expect(resultA.coverLetter!.signature).toBe('Wins Either Way');
    expect(resultB.coverLetter!.signature).toBe('Wins Either Way');
    expect(resultA.coverLetter!.sender).toBe('A\nB');
    expect(resultB.coverLetter!.sender).toBe('A\nB');
  });
});

describe('applyOverrides — row overrides', () => {
  it('overrides usageText for a single row', () => {
    const content = makeContent();
    const result = applyOverrides(content, { 'row.inv-1.usageText': 'Edited usage' });
    expect(result.rows[0]!.usageText).toBe('Edited usage');
  });

  it('overrides usageText for one row without affecting a different row (isolation per invoiceId)', () => {
    const rowA = makeRow({ invoiceId: 'inv-a', usageText: 'A baseline' });
    const rowB = makeRow({ invoiceId: 'inv-b', usageText: 'B baseline' });
    const content = makeContent({ rows: [rowA, rowB] });
    const result = applyOverrides(content, { 'row.inv-a.usageText': 'A edited' });
    expect(result.rows.find((r) => r.invoiceId === 'inv-a')!.usageText).toBe('A edited');
    expect(result.rows.find((r) => r.invoiceId === 'inv-b')!.usageText).toBe('B baseline');
  });

  it('overriding usageText with an empty string coerces it to an empty string (never null)', () => {
    const content = makeContent();
    const result = applyOverrides(content, { 'row.inv-1.usageText': '' });
    expect(result.rows[0]!.usageText).toBe('');
  });

  it('a key for an invoiceId not present in rows is silently ignored (no crash, no phantom row)', () => {
    const content = makeContent();
    const result = applyOverrides(content, { 'row.does-not-exist.usageText': 'ghost' });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.usageText).toBe(content.rows[0]!.usageText);
  });

  it('silently ignores the row.attachmentsNote key (dead since #1959)', () => {
    // Arrange: content with an invoice row where attachmentsNote is null (the default)
    const content = makeContent();
    // Act: call applyOverrides with the attachmentsNote key — no `in`-check exists for it in
    // applyOverrides.ts, so it cannot update any row field
    const result = applyOverrides(content, { 'row.inv-1.attachmentsNote': 'some-override' });
    // Assert: attachmentsNote is still null — the key is silently ignored
    expect(result.rows[0]!.attachmentsNote).toBeNull();
  });

  it('still applies usageText override (positive control for remaining field coverage)', () => {
    // Arrange: content with an invoice row
    const content = makeContent();
    // Act: apply the usageText key — it IS in the `in`-check inside applyOverrides.ts
    const result = applyOverrides(content, { 'row.inv-1.usageText': 'positive-control' });
    // Assert: the field was updated — proves the row-loop is still wired up correctly
    expect(result.rows[0]!.usageText).toBe('positive-control');
  });
});

describe('applyOverrides — immutability', () => {
  it('does not mutate the original content object', () => {
    const content = makeContent();
    const snapshot = JSON.parse(JSON.stringify(content));
    applyOverrides(content, {
      'coverLetter.sender': 'Changed',
      'row.inv-1.usageText': 'Changed usage',
    });
    expect(content).toEqual(snapshot);
  });

  it('does not mutate the original coverLetter object (new object identity)', () => {
    const content = makeContent();
    const originalCoverLetter = content.coverLetter;
    const result = applyOverrides(content, { 'coverLetter.sender': 'Changed' });
    expect(result.coverLetter).not.toBe(originalCoverLetter);
    expect(content.coverLetter).toBe(originalCoverLetter);
  });

  it('does not mutate the original rows array or row objects (new array + object identity)', () => {
    const content = makeContent();
    const originalRows = content.rows;
    const originalRow = content.rows[0];
    const result = applyOverrides(content, { 'row.inv-1.usageText': 'Changed' });
    expect(result.rows).not.toBe(originalRows);
    expect(result.rows[0]).not.toBe(originalRow);
    expect(content.rows).toBe(originalRows);
    expect(content.rows[0]).toBe(originalRow);
  });

  it('returns a content object that is a distinct top-level reference when overrides is non-empty', () => {
    const content = makeContent();
    const result = applyOverrides(content, { 'row.inv-1.usageText': 'x' });
    expect(result).not.toBe(content);
  });

  it('preserves untouched top-level fields (summaryRows, footnotes, sourceInfo, isOverview, tableTitle) by value', () => {
    const content = makeContent();
    const result = applyOverrides(content, { 'row.inv-1.usageText': 'x' });
    expect(result.summaryRows).toEqual(content.summaryRows);
    expect(result.footnotes).toEqual(content.footnotes);
    expect(result.sourceInfo).toEqual(content.sourceInfo);
    expect(result.isOverview).toBe(content.isOverview);
    expect(result.tableTitle).toBe(content.tableTitle);
  });

  it('passes labels through unchanged (same reference, no override key targets it) when other overrides are applied', () => {
    const content = makeContent();
    const result = applyOverrides(content, {
      'coverLetter.sender': 'Changed',
      'row.inv-1.usageText': 'Changed usage',
    });
    expect(result.labels).toBe(content.labels);
    expect(result.labels).toEqual(content.labels);
  });
});
