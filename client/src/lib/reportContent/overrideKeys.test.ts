/**
 * Unit tests for client/src/lib/reportContent/overrideKeys.ts
 *
 * `overrideKey` is a pure, side-effect-free builder for override map keys, decoupling
 * applyOverrides.ts and ReportContentEditor.tsx from manually-constructed string literals.
 * `overrideKey.coverLetter` is a fixed set of literal string constants; `overrideKey.row(id)` is a
 * factory that interpolates a given invoiceId into two field-specific keys.
 */
import { describe, it, expect } from '@jest/globals';
import { overrideKey } from './overrideKeys.js';

describe('overrideKey.coverLetter — fixed literal keys', () => {
  it('exposes the exact expected literal for every cover-letter field', () => {
    expect(overrideKey.coverLetter).toEqual({
      sender: 'coverLetter.sender',
      recipient: 'coverLetter.recipient',
      reference: 'coverLetter.reference',
      subject: 'coverLetter.subject',
      body: 'coverLetter.body',
      signature: 'coverLetter.signature',
    });
  });

  it('sender/recipient/reference/subject/body/signature are each independently addressable string constants', () => {
    expect(overrideKey.coverLetter.sender).toBe('coverLetter.sender');
    expect(overrideKey.coverLetter.recipient).toBe('coverLetter.recipient');
    expect(overrideKey.coverLetter.reference).toBe('coverLetter.reference');
    expect(overrideKey.coverLetter.subject).toBe('coverLetter.subject');
    expect(overrideKey.coverLetter.body).toBe('coverLetter.body');
    expect(overrideKey.coverLetter.signature).toBe('coverLetter.signature');
  });

  it('#1932: signature is a first-class editable key, distinct from sender (AC 2.6 depends on this)', () => {
    expect(overrideKey.coverLetter.signature).toBe('coverLetter.signature');
    expect(overrideKey.coverLetter.signature).not.toBe(overrideKey.coverLetter.sender);
  });

  it('returns the same literal value on every access (no per-call randomness/mutation)', () => {
    expect(overrideKey.coverLetter.sender).toBe(overrideKey.coverLetter.sender);
  });
});

describe('overrideKey.row(invoiceId) — interpolated per-row keys', () => {
  it('interpolates a simple invoiceId into both the usageText and attachmentsNote keys', () => {
    expect(overrideKey.row('inv-1')).toEqual({
      usageText: 'row.inv-1.usageText',
      attachmentsNote: 'row.inv-1.attachmentsNote',
    });
  });

  it('produces distinct keys for distinct invoiceIds (no shared/cached state across calls)', () => {
    const a = overrideKey.row('inv-a');
    const b = overrideKey.row('inv-b');
    expect(a.usageText).toBe('row.inv-a.usageText');
    expect(b.usageText).toBe('row.inv-b.usageText');
    expect(a.usageText).not.toBe(b.usageText);
  });

  it('correctly interpolates an invoiceId that itself contains a literal "." with no key ambiguity', () => {
    // A UUID-like or namespaced invoiceId containing dots must not be confused with the key's own
    // "row." / ".usageText" / ".attachmentsNote" structural dot-separators — the whole id is used
    // verbatim as the middle segment, however many dots it contains.
    const keys = overrideKey.row('src.2026.inv-42');
    expect(keys.usageText).toBe('row.src.2026.inv-42.usageText');
    expect(keys.attachmentsNote).toBe('row.src.2026.inv-42.attachmentsNote');

    // Splitting on '.' yields more than 3 segments (proving the id's own dots survived verbatim,
    // rather than being collapsed/stripped), and the first/last segments are still the fixed
    // structural markers.
    const usageSegments = keys.usageText.split('.');
    expect(usageSegments[0]).toBe('row');
    expect(usageSegments.at(-1)).toBe('usageText');
    expect(usageSegments.length).toBeGreaterThan(3);
  });

  it('round-trips: the field-specific key always starts with "row." and ends with the exact field name', () => {
    const keys = overrideKey.row('any-id-123');
    expect(keys.usageText.startsWith('row.')).toBe(true);
    expect(keys.usageText.endsWith('.usageText')).toBe(true);
    expect(keys.attachmentsNote.startsWith('row.')).toBe(true);
    expect(keys.attachmentsNote.endsWith('.attachmentsNote')).toBe(true);
  });

  it('returns a fresh object on each call (not a shared/mutated singleton)', () => {
    const first = overrideKey.row('inv-1');
    const second = overrideKey.row('inv-1');
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
  });
});
