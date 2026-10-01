/**
 * Unit tests for shared/src/lib/diarySignatures.ts — constants and the SIGNED_AT_PATTERN grammar.
 */

import { describe, it, expect } from '@jest/globals';
import {
  MAX_SIGNATURES_PER_ENTRY,
  MAX_SIGNER_NAME_LENGTH,
  MAX_SIGNATURE_DATA_URL_LENGTH,
  SIGNATURE_DATA_URL_PATTERN,
  SIGNED_AT_PATTERN,
} from './diarySignatures.js';

describe('diarySignatures constants', () => {
  it('exposes the documented limits', () => {
    expect(MAX_SIGNATURES_PER_ENTRY).toBe(10);
    expect(MAX_SIGNER_NAME_LENGTH).toBe(300);
    expect(MAX_SIGNATURE_DATA_URL_LENGTH).toBe(512 * 1024);
  });
});

describe('SIGNATURE_DATA_URL_PATTERN', () => {
  it.each(['png', 'jpeg', 'webp'])('accepts a base64 %s data URL', (fmt) => {
    expect(SIGNATURE_DATA_URL_PATTERN.test(`data:image/${fmt};base64,AAAA==`)).toBe(true);
  });

  it.each([
    'data:image/svg+xml;base64,AAAA',
    'data:image/png;base64,',
    'https://example.com/a.png',
    'data:image/png;base64,AA AA',
  ])('rejects %j', (v) => {
    expect(SIGNATURE_DATA_URL_PATTERN.test(v)).toBe(false);
  });
});

describe('SIGNED_AT_PATTERN', () => {
  it.each([
    '2026-03-14T10:00:00.000Z',
    '2026-03-14T10:00:00Z',
    '2026-03-14T10:00Z',
    '2026-03-14T10:00:00.5+02:00',
    '2026-03-14T10:00-05:30',
  ])('accepts %s', (v) => {
    expect(SIGNED_AT_PATTERN.test(v)).toBe(true);
  });

  it.each([
    '2026-03-14',
    '2026-03-14T10:00',
    '2026-03-14T10:00:00',
    '2026-03-14T10:00:00.000Zjunk',
    ' 2026-03-14T10:00Z',
    '2026-03-14 10:00Z',
    '2026-03-14T10:00:00.1234Z',
    '26-03-14T10:00Z',
    '2026-03-14T10:00+0200',
    'nope',
    '',
  ])('rejects %j', (v) => {
    expect(SIGNED_AT_PATTERN.test(v)).toBe(false);
  });

  it('extracts all groups from a full offset timestamp', () => {
    const g = '2026-03-14T10:15:30.123-05:45'.match(SIGNED_AT_PATTERN)!.groups!;
    expect(g).toMatchObject({
      year: '2026',
      month: '03',
      day: '14',
      hour: '10',
      minute: '15',
      second: '30',
      offsetSign: '-',
      offsetHour: '05',
      offsetMinute: '45',
    });
  });

  it('leaves second and offset groups undefined for a no-seconds UTC timestamp', () => {
    const g = '2026-03-14T10:15Z'.match(SIGNED_AT_PATTERN)!.groups!;
    expect(g.hour).toBe('10');
    expect(g.minute).toBe('15');
    expect(g.second).toBeUndefined();
    expect(g.offsetSign).toBeUndefined();
    expect(g.offsetHour).toBeUndefined();
    expect(g.offsetMinute).toBeUndefined();
  });
});
