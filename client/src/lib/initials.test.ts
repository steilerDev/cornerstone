import { describe, it, expect } from '@jest/globals';
import { initialsOf } from './initials.js';

describe('initialsOf', () => {
  it('uses the first letter of the first and last word of a multi-word name', () => {
    expect(initialsOf('Sam Jo Example', 'sam@example.test')).toBe('SE');
  });

  it('uses two letters for a two-word name', () => {
    expect(initialsOf('Sam Example', null)).toBe('SE');
  });

  it('uses a single letter for a one-word name', () => {
    expect(initialsOf('Sam', 'other@example.test')).toBe('S');
  });

  it('upper-cases lower-case names', () => {
    expect(initialsOf('sam jo example', null)).toBe('SE');
  });

  it('ignores leading, trailing and repeated whitespace', () => {
    expect(initialsOf('  Sam \t  Example  ', null)).toBe('SE');
  });

  it('falls back to the first letter of the e-mail for an empty name', () => {
    expect(initialsOf('', 'quinn@example.test')).toBe('Q');
  });

  it('falls back to the e-mail for a whitespace-only name and trims the e-mail', () => {
    expect(initialsOf('   ', ' quinn@example.test')).toBe('Q');
  });

  it('falls back to the e-mail for a null or undefined name', () => {
    expect(initialsOf(null, 'quinn@example.test')).toBe('Q');
    expect(initialsOf(undefined, 'quinn@example.test')).toBe('Q');
  });

  it('returns "?" when neither name nor e-mail is available', () => {
    expect(initialsOf('', '')).toBe('?');
    expect(initialsOf(null, null)).toBe('?');
    expect(initialsOf(undefined, undefined)).toBe('?');
    expect(initialsOf('  ', '  ')).toBe('?');
  });

  it('keeps a surrogate pair whole instead of splitting it', () => {
    expect(initialsOf('\u{1F600}smile Example', null)).toBe('\u{1F600}E');
    expect(initialsOf('\u{20BB7}野 家', null)).toBe('\u{20BB7}家');
  });
});
