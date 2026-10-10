/**
 * @jest-environment jsdom
 */
import { describe, it, expect, afterEach } from '@jest/globals';
import { use } from 'react';
import { renderHook } from '@testing-library/react';
import { PreviousPathContext, historyIndex, useTrackPreviousPath } from './previousPath.js';

// BrowserRouter keeps the entry index in history.state.idx; the tests move it by hand.
const originalState: unknown = window.history.state;
const setIdx = (idx: number) => window.history.replaceState({ idx }, '');

interface Props {
  p: string;
  k: string;
}

/** Mounts the hook at `path` / `idx`, with helpers to "navigate" to another entry. */
function mountAt(path: string, idx: number) {
  setIdx(idx);
  const hook = renderHook(({ p, k }: Props) => useTrackPreviousPath(p, k), {
    initialProps: { p: path, k: `k-${path}-${idx}` },
  });
  let n = 0;
  const go = (to: string, toIdx: number) => {
    setIdx(toIdx);
    hook.rerender({ p: to, k: `k${++n}-${to}-${toIdx}` });
  };
  return { ...hook, go };
}

afterEach(() => {
  window.history.replaceState(originalState, '');
});

describe('historyIndex', () => {
  it('reads history.state.idx', () => {
    setIdx(3);
    expect(historyIndex()).toBe(3);
  });

  it.each([
    ['null state', null],
    ['a non-object state', 'x'],
    ['an object without idx', { other: 1 }],
    ['a non-numeric idx', { idx: 'x' }],
  ])('is 0 for %s', (_label, state) => {
    window.history.replaceState(state, '');
    expect(historyIndex()).toBe(0);
  });
});

describe('useTrackPreviousPath', () => {
  it('returns null at the first entry (idx 0)', () => {
    const { result } = mountAt('/a', 0);
    expect(result.current()).toBeNull();
  });

  it('a new entry at idx 1 after idx 0 returns the idx-0 pathname', () => {
    const { result, go } = mountAt('/a', 0);
    go('/b', 1);
    expect(result.current()).toBe('/a');
  });

  it('follows a push chain: each entry names its predecessor', () => {
    const { result, go } = mountAt('/a', 0);
    go('/b', 1);
    go('/c', 2);
    expect(result.current()).toBe('/b');
  });

  it('replace case: A (0) -> B (1) -> replace with C (1) still returns A, not B', () => {
    const { result, go } = mountAt('/a', 0);
    go('/b', 1);
    // A view switch replaces the entry: same idx, new pathname and a new location key
    go('/c', 1);
    expect(result.current()).toBe('/a');
  });

  it('replace on the entry before: A -> B -> C, then B replaced by D at idx 1, back on C', () => {
    const { result, go } = mountAt('/a', 0);
    go('/b', 1);
    go('/c', 2);
    go('/b', 1); // back to B
    go('/d', 1); // replace B with D
    go('/c2', 2); // forward push from D
    expect(result.current()).toBe('/d');
  });

  it('back to a known idx returns that entry predecessor', () => {
    const { result, go } = mountAt('/a', 0);
    go('/b', 1);
    go('/c', 2);
    go('/b', 1);
    expect(result.current()).toBe('/a');
  });

  it('forward to a known idx returns that entry predecessor', () => {
    const { result, go } = mountAt('/a', 0);
    go('/b', 1);
    go('/c', 2);
    go('/a', 0);
    go('/b', 1);
    go('/c', 2);
    expect(result.current()).toBe('/b');
  });

  it('returns null when the entry before is unknown (fresh mount at idx 2, e.g. after a reload)', () => {
    const { result } = mountAt('/c', 2);
    expect(result.current()).toBeNull();
  });

  it('reads the index at call time, not at render time', () => {
    const { result, go } = mountAt('/a', 0);
    go('/b', 1);
    setIdx(0);
    expect(result.current()).toBeNull();
    setIdx(1);
    expect(result.current()).toBe('/a');
  });

  it('returns a stable getter across renders and navigations', () => {
    const { result, go } = mountAt('/a', 0);
    const first = result.current;
    go('/b', 1);
    go('/c', 1);
    expect(result.current).toBe(first);
  });
});

describe('PreviousPathContext', () => {
  it('defaults to a getter that returns null (outside AppShell)', () => {
    const { result } = renderHook(() => use(PreviousPathContext));
    expect(result.current()).toBeNull();
  });
});
