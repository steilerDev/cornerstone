/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { act, renderHook } from '@testing-library/react';
import { useContainerWide } from './useContainerWide.js';

type Cb = (entries: { contentRect: { width: number } }[]) => void;

class MockRO {
  static last: MockRO | null = null;
  cb: Cb;
  observe = jest.fn();
  disconnect = jest.fn();
  constructor(cb: Cb) {
    this.cb = cb;
    MockRO.last = this;
  }
}

const g = globalThis as { ResizeObserver?: unknown };
const original = g.ResizeObserver;
afterEach(() => {
  g.ResizeObserver = original;
  MockRO.last = null;
});

describe('useContainerWide', () => {
  it('is true without ResizeObserver (jsdom)', () => {
    g.ResizeObserver = undefined;
    const { result } = renderHook(() =>
      useContainerWide({ current: document.createElement('div') }),
    );
    expect(result.current).toBe(true);
  });

  it('is true and observes nothing without an element', () => {
    g.ResizeObserver = MockRO;
    const { result } = renderHook(() => useContainerWide({ current: null }));
    expect(result.current).toBe(true);
    expect(MockRO.last).toBeNull();
  });

  it('follows the observed width against the threshold and disconnects on unmount', () => {
    g.ResizeObserver = MockRO;
    const node = document.createElement('div');
    const { result, unmount } = renderHook(() => useContainerWide({ current: node }, 600));
    const ro = MockRO.last!;
    expect(ro.observe).toHaveBeenCalledWith(node);
    act(() => ro.cb([{ contentRect: { width: 599 } }]));
    expect(result.current).toBe(false);
    act(() => ro.cb([{ contentRect: { width: 100 } }, { contentRect: { width: 600 } }]));
    expect(result.current).toBe(true);
    act(() => ro.cb([]));
    expect(result.current).toBe(true);
    unmount();
    expect(ro.disconnect).toHaveBeenCalled();
  });

  it('defaults the threshold to 768', () => {
    g.ResizeObserver = MockRO;
    const { result } = renderHook(() =>
      useContainerWide({ current: document.createElement('div') }),
    );
    act(() => MockRO.last!.cb([{ contentRect: { width: 767 } }]));
    expect(result.current).toBe(false);
  });
});
