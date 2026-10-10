/**
 * @jest-environment jsdom
 */
import { describe, it, expect, afterEach } from '@jest/globals';
import { act, renderHook } from '@testing-library/react';
import { useOnScreenKeyboard } from './useOnScreenKeyboard.js';

class FakeViewport extends EventTarget {
  height: number;
  scale: number;
  constructor(height: number, scale = 1) {
    super();
    this.height = height;
    this.scale = scale;
  }
}

const original = Object.getOwnPropertyDescriptor(window, 'visualViewport');

function setViewport(vv: FakeViewport | undefined) {
  Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true });
}

describe('useOnScreenKeyboard', () => {
  afterEach(() => {
    if (original) Object.defineProperty(window, 'visualViewport', original);
    else delete (window as unknown as Record<string, unknown>).visualViewport;
  });

  it('is false when there is no visualViewport', () => {
    setViewport(undefined);
    const { result } = renderHook(() => useOnScreenKeyboard());
    expect(result.current).toBe(false);
  });

  it('is true when the visual viewport is 0.7 of the window height', () => {
    setViewport(new FakeViewport(window.innerHeight * 0.7));
    const { result } = renderHook(() => useOnScreenKeyboard());
    expect(result.current).toBe(true);
  });

  it('is false at 0.8 of the window height', () => {
    setViewport(new FakeViewport(window.innerHeight * 0.8));
    const { result } = renderHook(() => useOnScreenKeyboard());
    expect(result.current).toBe(false);
  });

  it('does not count pinch-zoom as a keyboard (height halves while scale doubles)', () => {
    setViewport(new FakeViewport(window.innerHeight / 2, 2));
    const { result } = renderHook(() => useOnScreenKeyboard());
    expect(result.current).toBe(false);
  });

  it('follows visualViewport resize events', () => {
    const vv = new FakeViewport(window.innerHeight);
    setViewport(vv);
    const { result } = renderHook(() => useOnScreenKeyboard());
    expect(result.current).toBe(false);
    act(() => {
      vv.height = window.innerHeight * 0.5;
      vv.dispatchEvent(new Event('resize'));
    });
    expect(result.current).toBe(true);
    act(() => {
      vv.height = window.innerHeight;
      vv.dispatchEvent(new Event('resize'));
    });
    expect(result.current).toBe(false);
  });

  it('follows window resize events and stops listening after unmount', () => {
    const vv = new FakeViewport(window.innerHeight);
    setViewport(vv);
    const { result, unmount } = renderHook(() => useOnScreenKeyboard());
    act(() => {
      vv.height = window.innerHeight * 0.4;
      window.dispatchEvent(new Event('resize'));
    });
    expect(result.current).toBe(true);
    unmount();
    vv.height = window.innerHeight;
    window.dispatchEvent(new Event('resize'));
    expect(result.current).toBe(true);
  });
});
