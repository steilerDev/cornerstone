import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { createElement } from 'react';
import { renderHook, act } from '@testing-library/react';
import { useMediaQuery } from './useMediaQuery.js';

type Listener = () => void;

describe('useMediaQuery', () => {
  const originalMatchMedia = window.matchMedia;
  let matches: boolean;
  let listeners: Set<Listener>;
  let addSpy: jest.Mock;
  let removeSpy: jest.Mock;

  beforeEach(() => {
    matches = false;
    listeners = new Set();
    addSpy = jest.fn((_type: unknown, cb: unknown) => listeners.add(cb as Listener));
    removeSpy = jest.fn((_type: unknown, cb: unknown) => listeners.delete(cb as Listener));
    window.matchMedia = jest.fn((query: string) => ({
      get matches() {
        return matches;
      },
      media: query,
      addEventListener: addSpy,
      removeEventListener: removeSpy,
    })) as unknown as typeof window.matchMedia;
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it('returns the initial match state from matchMedia', () => {
    matches = true;
    const { result } = renderHook(() => useMediaQuery('(max-width: 767px)'));
    expect(result.current).toBe(true);
    expect(window.matchMedia).toHaveBeenCalledWith('(max-width: 767px)');
  });

  it('returns false when the query does not match', () => {
    const { result } = renderHook(() => useMediaQuery('(max-width: 767px)'));
    expect(result.current).toBe(false);
  });

  it('updates when the media query fires a change event', () => {
    const { result } = renderHook(() => useMediaQuery('(max-width: 767px)'));
    expect(result.current).toBe(false);

    act(() => {
      matches = true;
      listeners.forEach((l) => l());
    });

    expect(result.current).toBe(true);
    expect(addSpy).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('removes its change listener on unmount', () => {
    const { unmount } = renderHook(() => useMediaQuery('(max-width: 767px)'));
    expect(listeners.size).toBe(1);

    unmount();

    expect(removeSpy).toHaveBeenCalledWith('change', expect.any(Function));
    expect(listeners.size).toBe(0);
  });

  it('returns false during server rendering regardless of the query', async () => {
    // react-dom/server's browser build needs MessageChannel, which jsdom lacks
    const { MessageChannel } = await import('node:worker_threads');
    (globalThis as { MessageChannel?: unknown }).MessageChannel ??= MessageChannel;
    const { renderToString } = await import('react-dom/server');
    matches = true;
    function Probe() {
      return createElement('span', null, String(useMediaQuery('(max-width: 767px)')));
    }

    expect(renderToString(createElement(Probe))).toContain('false');
  });

  it('returns false and does not throw when matchMedia is unavailable', () => {
    // @ts-expect-error simulating an environment without matchMedia
    window.matchMedia = undefined;

    const { result, unmount } = renderHook(() => useMediaQuery('(max-width: 767px)'));

    expect(result.current).toBe(false);
    expect(() => unmount()).not.toThrow();
  });
});
