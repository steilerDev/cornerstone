import { describe, it, expect } from '@jest/globals';
import { readFocusHeading, withFocusHeading } from './focusHeading.js';

describe('focusHeading', () => {
  it('adds the flag to an empty or missing state', () => {
    expect(readFocusHeading(withFocusHeading(null))).toBe(true);
    expect(readFocusHeading(withFocusHeading(undefined))).toBe(true);
    expect(readFocusHeading(withFocusHeading('text'))).toBe(true);
  });

  it('keeps the origin and other keys of the forwarded state', () => {
    const next = withFocusHeading({ origin: '/diary', other: 1 });

    expect(next).toEqual({ origin: '/diary', other: 1, focusHeading: true });
  });

  it('does not mutate the state it was given', () => {
    const state = { origin: '/diary' };

    withFocusHeading(state);

    expect(state).toEqual({ origin: '/diary' });
  });

  it('reads false for states without the flag', () => {
    expect(readFocusHeading(null)).toBe(false);
    expect(readFocusHeading('focusHeading')).toBe(false);
    expect(readFocusHeading({ origin: '/diary' })).toBe(false);
    expect(readFocusHeading({ focusHeading: 'yes' })).toBe(false);
  });
});
