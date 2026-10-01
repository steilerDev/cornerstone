/**
 * Unit tests for shared/src/lib/diaryLock.ts (#2124).
 */

import { describe, it, expect } from '@jest/globals';
import { hasDiarySignatures, isDiaryEntrySignatureLocked } from './diaryLock.js';

describe('hasDiarySignatures', () => {
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a string', 'x'],
    ['a number', 5],
    ['an empty object', {}],
    ['signatures: null', { signatures: null }],
    ['signatures: []', { signatures: [] }],
    ['signatures not an array', { signatures: 'abc' }],
    ['signatures an object', { signatures: { length: 3 } }],
  ])('returns false for %s', (_label, metadata) => {
    expect(hasDiarySignatures(metadata)).toBe(false);
  });

  it('returns true for a non-empty signatures array', () => {
    expect(hasDiarySignatures({ signatures: [{}] })).toBe(true);
  });
});

describe('isDiaryEntrySignatureLocked', () => {
  it('does not lock a signed draft', () => {
    expect(isDiaryEntrySignatureLocked({ isSigned: true, status: 'draft' })).toBe(false);
  });

  it('locks a signed saved entry', () => {
    expect(isDiaryEntrySignatureLocked({ isSigned: true, status: 'saved' })).toBe(true);
  });

  it('does not lock an unsigned saved entry', () => {
    expect(isDiaryEntrySignatureLocked({ isSigned: false, status: 'saved' })).toBe(false);
  });

  it('does not lock an unsigned draft', () => {
    expect(isDiaryEntrySignatureLocked({ isSigned: false, status: 'draft' })).toBe(false);
  });
});
