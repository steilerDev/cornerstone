import { describe, it, expect } from '@jest/globals';
import { isEmailAddress } from './emailAddress.js';

describe('isEmailAddress', () => {
  it.each(['a@b.co', 'first.last@example.org', 'x+tag@sub.example.com'])('accepts %s', (v) => {
    expect(isEmailAddress(v)).toBe(true);
  });

  // Each value breaks one part of the pattern: local part, @, domain dot, whitespace.
  it.each(['', 'plain', '@b.co', 'a@b', 'a@.co', 'a b@c.de', 'a@b c.de', 'a@@b.co'])(
    'rejects %p',
    (v) => {
      expect(isEmailAddress(v)).toBe(false);
    },
  );
});
