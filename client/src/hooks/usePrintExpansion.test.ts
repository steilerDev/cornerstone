/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { renderHook, act } from '@testing-library/react';
import { usePrintExpansion } from './usePrintExpansion.js';

describe('usePrintExpansion', () => {
  let setExpandedKeys: jest.Mock<(keys: Set<string>) => void>;

  beforeEach(() => {
    setExpandedKeys = jest.fn<(keys: Set<string>) => void>();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('beforeprint: expands all keys (merges existing + allKeys)', () => {
    const expandedKeys = new Set(['a']);
    const allKeys = new Set(['a', 'b', 'c']);

    renderHook(() => usePrintExpansion(expandedKeys, setExpandedKeys, allKeys));

    act(() => {
      window.dispatchEvent(new Event('beforeprint'));
    });

    expect(setExpandedKeys).toHaveBeenCalledTimes(1);
    const calledWith = setExpandedKeys.mock.calls[0][0] as Set<string>;
    expect(calledWith).toBeInstanceOf(Set);
    expect([...calledWith].sort()).toEqual(['a', 'b', 'c']);
  });

  it('afterprint: restores snapshot taken at beforeprint', () => {
    const expandedKeys = new Set(['a']);
    const allKeys = new Set(['a', 'b', 'c']);

    renderHook(() => usePrintExpansion(expandedKeys, setExpandedKeys, allKeys));

    act(() => {
      window.dispatchEvent(new Event('beforeprint'));
    });

    act(() => {
      window.dispatchEvent(new Event('afterprint'));
    });

    expect(setExpandedKeys).toHaveBeenCalledTimes(2);
    const firstCall = setExpandedKeys.mock.calls[0][0] as Set<string>;
    const secondCall = setExpandedKeys.mock.calls[1][0] as Set<string>;

    // First call: expanded to all keys
    expect([...firstCall].sort()).toEqual(['a', 'b', 'c']);

    // Second call: restored to original snapshot (only 'a')
    expect([...secondCall]).toEqual(['a']);
  });

  it('afterprint without beforeprint: is a no-op', () => {
    const expandedKeys = new Set(['a']);
    const allKeys = new Set(['a', 'b', 'c']);

    renderHook(() => usePrintExpansion(expandedKeys, setExpandedKeys, allKeys));

    act(() => {
      window.dispatchEvent(new Event('afterprint'));
    });

    expect(setExpandedKeys).not.toHaveBeenCalled();
  });

  it('cleanup on unmount removes event listeners', () => {
    const expandedKeys = new Set(['a']);
    const allKeys = new Set(['a', 'b', 'c']);

    const { unmount } = renderHook(() =>
      usePrintExpansion(expandedKeys, setExpandedKeys, allKeys),
    );

    unmount();

    act(() => {
      window.dispatchEvent(new Event('beforeprint'));
    });

    expect(setExpandedKeys).not.toHaveBeenCalled();
  });

  it('cleanup on unmount also removes afterprint listener', () => {
    const expandedKeys = new Set(['a']);
    const allKeys = new Set(['a', 'b', 'c']);

    const { unmount } = renderHook(() =>
      usePrintExpansion(expandedKeys, setExpandedKeys, allKeys),
    );

    // Fire beforeprint before unmount to set a snapshot
    act(() => {
      window.dispatchEvent(new Event('beforeprint'));
    });

    expect(setExpandedKeys).toHaveBeenCalledTimes(1);
    setExpandedKeys.mockClear();

    unmount();

    // afterprint after unmount should not call setExpandedKeys
    act(() => {
      window.dispatchEvent(new Event('afterprint'));
    });

    expect(setExpandedKeys).not.toHaveBeenCalled();
  });

  it('allKeys empty: beforeprint sets an empty Set', () => {
    const expandedKeys = new Set(['a']);
    const allKeys = new Set<string>();

    renderHook(() => usePrintExpansion(expandedKeys, setExpandedKeys, allKeys));

    act(() => {
      window.dispatchEvent(new Event('beforeprint'));
    });

    expect(setExpandedKeys).toHaveBeenCalledTimes(1);
    const calledWith = setExpandedKeys.mock.calls[0][0] as Set<string>;
    expect(calledWith).toBeInstanceOf(Set);
    expect(calledWith.size).toBe(0);
  });

  it('allKeys empty: afterprint restores original non-empty snapshot', () => {
    const expandedKeys = new Set(['a']);
    const allKeys = new Set<string>();

    renderHook(() => usePrintExpansion(expandedKeys, setExpandedKeys, allKeys));

    act(() => {
      window.dispatchEvent(new Event('beforeprint'));
    });

    act(() => {
      window.dispatchEvent(new Event('afterprint'));
    });

    expect(setExpandedKeys).toHaveBeenCalledTimes(2);
    const restoredSnapshot = setExpandedKeys.mock.calls[1][0] as Set<string>;
    expect([...restoredSnapshot]).toEqual(['a']);
  });

  it('multiple beforeprint/afterprint cycles work independently', () => {
    const expandedKeys = new Set(['x', 'y']);
    const allKeys = new Set(['x', 'y', 'z']);

    renderHook(() => usePrintExpansion(expandedKeys, setExpandedKeys, allKeys));

    // First print cycle
    act(() => {
      window.dispatchEvent(new Event('beforeprint'));
    });
    act(() => {
      window.dispatchEvent(new Event('afterprint'));
    });

    expect(setExpandedKeys).toHaveBeenCalledTimes(2);
    const cycle1Snapshot = setExpandedKeys.mock.calls[1][0] as Set<string>;
    expect([...cycle1Snapshot].sort()).toEqual(['x', 'y']);

    setExpandedKeys.mockClear();

    // Second print cycle
    act(() => {
      window.dispatchEvent(new Event('beforeprint'));
    });
    act(() => {
      window.dispatchEvent(new Event('afterprint'));
    });

    expect(setExpandedKeys).toHaveBeenCalledTimes(2);
    const cycle2Snapshot = setExpandedKeys.mock.calls[1][0] as Set<string>;
    expect([...cycle2Snapshot].sort()).toEqual(['x', 'y']);
  });
});
