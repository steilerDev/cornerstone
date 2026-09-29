/**
 * @jest-environment jsdom
 */
import { describe, it, expect, afterEach } from '@jest/globals';
import { findScrollParent } from './scrollParent.js';

function el(overflowY: string, parent?: Element): HTMLDivElement {
  const node = document.createElement('div');
  node.style.overflowY = overflowY;
  (parent ?? document.body).appendChild(node);
  return node;
}

afterEach(() => {
  document.body.innerHTML = '';
  document.body.style.overflowY = '';
});

describe('findScrollParent', () => {
  it.each(['auto', 'scroll', 'overlay'])(
    'returns the nearest ancestor with overflow-y: %s',
    (value) => {
      const scroller = el(value);
      const child = el('visible', scroller);
      expect(findScrollParent(child)).toBe(scroller);
    },
  );

  it('returns the NEAREST scrollable ancestor when several exist', () => {
    const outer = el('auto');
    const inner = el('scroll', outer);
    const child = el('visible', inner);
    expect(findScrollParent(child)).toBe(inner);
  });

  it('skips non-scrollable ancestors (visible/hidden) and finds a further one', () => {
    const scroller = el('auto');
    const hidden = el('hidden', scroller);
    const visible = el('visible', hidden);
    const child = el('visible', visible);
    expect(findScrollParent(child)).toBe(scroller);
  });

  it('does not consider the element itself, only ancestors', () => {
    const self = el('auto');
    expect(findScrollParent(self)).toBeNull();
  });

  it('returns null when no ancestor scrolls (viewport scrolls)', () => {
    const wrapper = el('visible');
    const child = el('visible', wrapper);
    expect(findScrollParent(child)).toBeNull();
  });

  it('stops at document.body even if body itself is overflow auto', () => {
    document.body.style.overflowY = 'auto';
    const child = el('visible');
    expect(findScrollParent(child)).toBeNull();
  });

  it('returns null for a detached element with no parent', () => {
    expect(findScrollParent(document.createElement('div'))).toBeNull();
  });
});
