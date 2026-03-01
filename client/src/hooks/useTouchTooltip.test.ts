/**
 * @jest-environment jsdom
 *
 * Unit tests for useTouchTooltip hook (#331).
 *
 * Tests the two-tap interaction pattern:
 *   - isTouchDevice detection via matchMedia('pointer: coarse')
 *   - First tap: sets activeTouchId (for tooltip show)
 *   - Second tap on same item: calls onNavigate and clears activeTouchId
 *   - Tap on different item: switches activeTouchId to new item
 *   - clearActiveTouchId: programmatic reset
 *   - Media query change listener registration and cleanup
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { renderHook, act } from '@testing-library/react';
import { useTouchTooltip } from './useTouchTooltip.js';

// ---------------------------------------------------------------------------
// matchMedia mock helpers
// ---------------------------------------------------------------------------

type MockMqListener = (e: { matches: boolean }) => void;

interface MockMediaQueryList {
  matches: boolean;
  addEventListener: jest.Mock;
  removeEventListener: jest.Mock;
  _trigger: (matches: boolean) => void;
}

function createMockMq(initialMatches: boolean): MockMediaQueryList {
  const listeners: MockMqListener[] = [];
  const mq: MockMediaQueryList = {
    matches: initialMatches,
    addEventListener: jest.fn((_event: unknown, fn: unknown) => {
      listeners.push(fn as MockMqListener);
    }),
    removeEventListener: jest.fn((_event: unknown, fn: unknown) => {
      const idx = listeners.indexOf(fn as MockMqListener);
      if (idx >= 0) listeners.splice(idx, 1);
    }),
    _trigger: (matches: boolean) => {
      mq.matches = matches;
      listeners.forEach((fn) => fn({ matches }));
    },
  };
  return mq;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useTouchTooltip', () => {
  let mockMq: MockMediaQueryList;
  let originalMatchMedia: typeof window.matchMedia;

  beforeEach(() => {
    originalMatchMedia = window.matchMedia;
    mockMq = createMockMq(false); // default: pointer device (not touch)
    // matchMedia is writable (set up in setupTests.ts with writable:true)
    window.matchMedia = jest.fn(() => mockMq as unknown as MediaQueryList);
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  // ── isTouchDevice detection ───────────────────────────────────────────────

  it('returns isTouchDevice=false when matchMedia pointer:coarse is false', () => {
    mockMq = createMockMq(false);
    window.matchMedia = jest.fn(() => mockMq as unknown as MediaQueryList);
    const { result } = renderHook(() => useTouchTooltip());
    expect(result.current.isTouchDevice).toBe(false);
  });

  it('returns isTouchDevice=true when matchMedia pointer:coarse is true', () => {
    mockMq = createMockMq(true);
    window.matchMedia = jest.fn(() => mockMq as unknown as MediaQueryList);
    const { result } = renderHook(() => useTouchTooltip());
    expect(result.current.isTouchDevice).toBe(true);
  });

  // ── activeTouchId initial state ───────────────────────────────────────────

  it('activeTouchId is null initially', () => {
    const { result } = renderHook(() => useTouchTooltip());
    expect(result.current.activeTouchId).toBeNull();
  });

  // ── handleTouchTap — first tap ────────────────────────────────────────────

  it('first tap on an item sets activeTouchId to that item id', () => {
    const { result } = renderHook(() => useTouchTooltip());
    const navigate = jest.fn();

    act(() => {
      result.current.handleTouchTap('item-1', navigate);
    });

    expect(result.current.activeTouchId).toBe('item-1');
    expect(navigate).not.toHaveBeenCalled();
  });

  // ── handleTouchTap — second tap on same item ──────────────────────────────

  it('second tap on the same item calls onNavigate and clears activeTouchId', () => {
    const { result } = renderHook(() => useTouchTooltip());
    const navigate = jest.fn();

    // First tap
    act(() => {
      result.current.handleTouchTap('item-1', navigate);
    });
    expect(result.current.activeTouchId).toBe('item-1');

    // Second tap on same item
    act(() => {
      result.current.handleTouchTap('item-1', navigate);
    });
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(result.current.activeTouchId).toBeNull();
  });

  // ── handleTouchTap — tap on different item ────────────────────────────────

  it('tapping a different item switches activeTouchId and does NOT navigate', () => {
    const { result } = renderHook(() => useTouchTooltip());
    const navigate1 = jest.fn();
    const navigate2 = jest.fn();

    // First tap on item-1
    act(() => {
      result.current.handleTouchTap('item-1', navigate1);
    });
    expect(result.current.activeTouchId).toBe('item-1');

    // Tap on item-2 (different item)
    act(() => {
      result.current.handleTouchTap('item-2', navigate2);
    });
    expect(result.current.activeTouchId).toBe('item-2');
    expect(navigate1).not.toHaveBeenCalled();
    expect(navigate2).not.toHaveBeenCalled();
  });

  // ── clearActiveTouchId ────────────────────────────────────────────────────

  it('clearActiveTouchId resets activeTouchId to null', () => {
    const { result } = renderHook(() => useTouchTooltip());

    act(() => {
      result.current.handleTouchTap('item-1', jest.fn());
    });
    expect(result.current.activeTouchId).toBe('item-1');

    act(() => {
      result.current.clearActiveTouchId();
    });
    expect(result.current.activeTouchId).toBeNull();
  });

  // ── media query change listener ───────────────────────────────────────────

  it('registers a change event listener on mount', () => {
    renderHook(() => useTouchTooltip());
    expect(mockMq.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('removes the change event listener on unmount', () => {
    const { unmount } = renderHook(() => useTouchTooltip());
    unmount();
    expect(mockMq.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('updates isTouchDevice when media query fires a change event', () => {
    const { result } = renderHook(() => useTouchTooltip());
    expect(result.current.isTouchDevice).toBe(false);

    act(() => {
      mockMq._trigger(true);
    });

    expect(result.current.isTouchDevice).toBe(true);
  });

  it('updates isTouchDevice back to false when pointer reconnects', () => {
    mockMq = createMockMq(true);
    window.matchMedia = jest.fn(() => mockMq as unknown as MediaQueryList);
    const { result } = renderHook(() => useTouchTooltip());
    expect(result.current.isTouchDevice).toBe(true);

    act(() => {
      mockMq._trigger(false);
    });

    expect(result.current.isTouchDevice).toBe(false);
  });
});
