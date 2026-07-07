/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { renderHook, act } from '@testing-library/react';
import { useDebouncedCallback } from './useDebouncedCallback.js';

describe('useDebouncedCallback', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('trigger() schedules callback after delayMs and does not call it immediately', () => {
    const callback = jest.fn<(x: string) => void>();
    const { result } = renderHook(() => useDebouncedCallback(callback, 300));

    act(() => {
      result.current.trigger('hello');
    });

    expect(callback).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('hello');
  });

  it('calling trigger() again before the delay elapses cancels and reschedules — only the last args win', () => {
    const callback = jest.fn<(x: string) => void>();
    const { result } = renderHook(() => useDebouncedCallback(callback, 300));

    act(() => {
      result.current.trigger('first');
    });
    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(callback).not.toHaveBeenCalled();

    act(() => {
      result.current.trigger('second');
    });
    act(() => {
      jest.advanceTimersByTime(200);
    });
    // Only 200ms of the second call's 300ms window has elapsed
    expect(callback).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('second');
  });

  it('cancel() prevents a pending call from firing', () => {
    const callback = jest.fn<() => void>();
    const { result } = renderHook(() => useDebouncedCallback(callback, 300));

    act(() => {
      result.current.trigger();
    });
    act(() => {
      result.current.cancel();
    });
    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(callback).not.toHaveBeenCalled();
  });

  it('cancel() is a no-op when there is no pending call', () => {
    const callback = jest.fn<() => void>();
    const { result } = renderHook(() => useDebouncedCallback(callback, 300));

    expect(() => {
      act(() => {
        result.current.cancel();
      });
    }).not.toThrow();

    expect(callback).not.toHaveBeenCalled();
  });

  it('unmounting while a call is pending does not fire it', () => {
    const callback = jest.fn<() => void>();
    const { result, unmount } = renderHook(() => useDebouncedCallback(callback, 300));

    act(() => {
      result.current.trigger();
    });

    unmount();

    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(callback).not.toHaveBeenCalled();
  });

  it('trigger and cancel are referentially stable across re-renders with the same delayMs', () => {
    const callback = jest.fn<() => void>();
    const { result, rerender } = renderHook(
      ({ delay }: { delay: number }) => useDebouncedCallback(callback, delay),
      { initialProps: { delay: 300 } },
    );

    const firstTrigger = result.current.trigger;
    const firstCancel = result.current.cancel;

    rerender({ delay: 300 });

    expect(result.current.trigger).toBe(firstTrigger);
    expect(result.current.cancel).toBe(firstCancel);
  });

  it('trigger changes reference when delayMs changes (cancel stays stable)', () => {
    const callback = jest.fn<() => void>();
    const { result, rerender } = renderHook(
      ({ delay }: { delay: number }) => useDebouncedCallback(callback, delay),
      { initialProps: { delay: 300 } },
    );

    const firstTrigger = result.current.trigger;
    const firstCancel = result.current.cancel;

    rerender({ delay: 500 });

    expect(result.current.trigger).not.toBe(firstTrigger);
    expect(result.current.cancel).toBe(firstCancel);
  });

  it('always calls the latest callback even if the callback identity changes between trigger and fire', () => {
    const firstCallback = jest.fn<() => void>();
    const secondCallback = jest.fn<() => void>();
    const { result, rerender } = renderHook(
      ({ cb }: { cb: () => void }) => useDebouncedCallback(cb, 300),
      { initialProps: { cb: firstCallback } },
    );

    act(() => {
      result.current.trigger();
    });

    // Swap the callback before the timer fires (e.g. a closure over updated state)
    rerender({ cb: secondCallback });

    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(firstCallback).not.toHaveBeenCalled();
    expect(secondCallback).toHaveBeenCalledTimes(1);
  });

  it('supports multiple arguments passed through to the callback', () => {
    const callback = jest.fn<(a: number, b: string) => void>();
    const { result } = renderHook(() => useDebouncedCallback(callback, 100));

    act(() => {
      result.current.trigger(42, 'answer');
    });
    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(callback).toHaveBeenCalledWith(42, 'answer');
  });
});
