import { describe, it, expect } from '@jest/globals';
import { userTextProps } from './userText.js';

// CSS modules are mocked via identity-obj-proxy: the class name is the key itself.
describe('userTextProps', () => {
  it('returns lang and the hyphenation class for a known language', () => {
    expect(userTextProps('de')).toEqual({ lang: 'de', className: 'userText' });
  });

  it('omits lang (but keeps the class) while the language is unknown', () => {
    expect(userTextProps(null)).toEqual({ className: 'userText' });
    expect(userTextProps(undefined)).not.toHaveProperty('lang');
    expect(userTextProps('')).not.toHaveProperty('lang');
  });

  it('merges an extra class after the hyphenation class', () => {
    expect(userTextProps('en', 'title')).toEqual({ lang: 'en', className: 'userText title' });
  });

  it('ignores an empty extra class', () => {
    expect(userTextProps('en', '').className).toBe('userText');
  });
});
