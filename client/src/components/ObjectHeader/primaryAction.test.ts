import { describe, it, expect } from '@jest/globals';
import type { StatusMenuTransition } from '../StatusMenu/StatusMenu.js';
import { forwardActionTo } from './primaryAction.js';

type S = 'a' | 'b' | 'c';
const t = (to: S, direction: 'forward' | 'backward'): StatusMenuTransition<S> => ({
  to,
  direction,
  label: `to ${to}`,
});

describe('forwardActionTo', () => {
  it('returns the target of the first forward transition', () => {
    expect(forwardActionTo([t('a', 'backward'), t('b', 'forward'), t('c', 'forward')])).toBe('b');
  });

  it('respects the order of the map, not the alphabet', () => {
    expect(forwardActionTo([t('c', 'forward'), t('b', 'forward')])).toBe('c');
  });

  it('returns null when only backward transitions exist (terminal state)', () => {
    expect(forwardActionTo([t('a', 'backward')])).toBeNull();
  });

  it('returns null for no transitions', () => {
    expect(forwardActionTo([])).toBeNull();
  });
});
