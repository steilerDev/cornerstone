/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { renderHook, act } from '@testing-library/react';
import { useDebounce } from './useDebounce.js';

describe('useDebounce', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns the initial value synchronously', () => {
    const { result } = renderHook(() => useDebounce('initial', 300));

    expect(result.current).toBe('initial');
  });

  it('does not update the returned value before delayMs elapses', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 300), {
      initialProps: { value: 'initial' },
    });

    rerender({ value: 'updated' });

    act(() => {
      jest.advanceTimersByTime(299);
    });

    expect(result.current).toBe('initial');
  });

  it('updates to the new value after delayMs elapses', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 300), {
      initialProps: { value: 'initial' },
    });

    rerender({ value: 'updated' });

    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(result.current).toBe('updated');
  });

  it('resets the timer on rapid successive changes — only the last value wins', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 300), {
      initialProps: { value: 'a' },
    });

    rerender({ value: 'b' });
    act(() => {
      jest.advanceTimersByTime(200);
    });
    // Not yet elapsed for 'b'
    expect(result.current).toBe('a');

    rerender({ value: 'c' });
    act(() => {
      jest.advanceTimersByTime(200);
    });
    // 'b'’s timer was cancelled; 'c'’s timer has only run 200ms of 300ms
    expect(result.current).toBe('a');

    act(() => {
      jest.advanceTimersByTime(100);
    });
    // 'c'’s full 300ms has now elapsed
    expect(result.current).toBe('c');
  });

  it('cleans up the pending timeout on unmount (no post-unmount state update)', () => {
    const { rerender, unmount } = renderHook(({ value }) => useDebounce(value, 300), {
      initialProps: { value: 'a' },
    });

    rerender({ value: 'b' });
    unmount();

    // Advancing timers after unmount must not throw or trigger an act() warning
    // (React would warn if setState were called on an unmounted component).
    expect(() => {
      act(() => {
        jest.advanceTimersByTime(300);
      });
    }).not.toThrow();
  });

  it('supports non-string generic values (numbers)', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 100), {
      initialProps: { value: 1 },
    });

    rerender({ value: 2 });

    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(result.current).toBe(2);
  });

  it('restarts the timer when delayMs changes even if value stays the same', () => {
    const { result, rerender } = renderHook(({ value, delay }) => useDebounce(value, delay), {
      initialProps: { value: 'a', delay: 300 },
    });

    rerender({ value: 'b', delay: 500 });

    act(() => {
      jest.advanceTimersByTime(300);
    });
    // Delay is now 500ms, so 300ms is not enough
    expect(result.current).toBe('a');

    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(result.current).toBe('b');
  });
});
