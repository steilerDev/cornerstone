/**
 * @jest-environment jsdom
 */
import { describe, it, expect } from '@jest/globals';
import { renderHook } from '@testing-library/react';
import { useRowTriggerRefs } from './useRowTriggerRefs.js';

describe('useRowTriggerRefs', () => {
  it('hands out one ref per row id, starting empty', () => {
    const { result } = renderHook(() => useRowTriggerRefs());
    const a = result.current('row-a');
    expect(a.current).toBeNull();
    expect(result.current('row-b')).not.toBe(a);
  });

  it('returns the same ref for the same id, also after a re-render', () => {
    const { result, rerender } = renderHook(() => useRowTriggerRefs());
    const first = result.current('row-a');
    const button = document.createElement('button');
    first.current = button;
    rerender();
    expect(result.current('row-a')).toBe(first);
    expect(result.current('row-a').current).toBe(button);
  });
});
