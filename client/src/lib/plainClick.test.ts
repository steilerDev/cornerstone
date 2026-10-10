import { describe, it, expect } from '@jest/globals';
import { isPlainLeftClick } from './plainClick.js';

const plain = {
  button: 0,
  metaKey: false,
  altKey: false,
  ctrlKey: false,
  shiftKey: false,
  defaultPrevented: false,
};

describe('isPlainLeftClick', () => {
  it('accepts an unmodified primary-button click', () => {
    expect(isPlainLeftClick(plain)).toBe(true);
  });

  it.each([
    ['middle button', { button: 1 }],
    ['right button', { button: 2 }],
    ['meta key', { metaKey: true }],
    ['alt key', { altKey: true }],
    ['ctrl key', { ctrlKey: true }],
    ['shift key', { shiftKey: true }],
    ['an already-prevented event', { defaultPrevented: true }],
  ])('rejects %s', (_label, override) => {
    expect(isPlainLeftClick({ ...plain, ...override })).toBe(false);
  });
});
