import { describe, it, expect } from '@jest/globals';
import { telHref } from './telHref.js';

describe('telHref', () => {
  it('keeps digits and the plus sign', () => {
    expect(telHref('+49 (30) 555-0142')).toBe('tel:+49305550142');
  });

  it('strips letters, dots, slashes and spaces from a local number', () => {
    expect(telHref('030 / 555.01 42 ext.')).toBe('tel:0305550142');
  });

  it('gives a bare tel: for a number with no digits', () => {
    expect(telHref('n/a')).toBe('tel:');
  });
});
