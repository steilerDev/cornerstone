import { describe, it, expect } from '@jest/globals';
import { toLikeContainsPattern } from './likePattern.js';

describe('toLikeContainsPattern', () => {
  it('wraps a plain term in percent wildcards', () => {
    expect(toLikeContainsPattern('abc')).toBe('%abc%');
  });

  it('escapes the percent wildcard', () => {
    expect(toLikeContainsPattern('50%')).toBe('%50\\%%');
  });

  it('escapes the underscore wildcard', () => {
    expect(toLikeContainsPattern('a_b')).toBe('%a\\_b%');
  });

  it('escapes the escape character itself', () => {
    expect(toLikeContainsPattern('a\\b')).toBe('%a\\\\b%');
  });

  it('escapes every special character when several occur together', () => {
    expect(toLikeContainsPattern('%_\\')).toBe('%\\%\\_\\\\%');
  });

  it('returns a match-all pattern for an empty term', () => {
    expect(toLikeContainsPattern('')).toBe('%%');
  });
});
