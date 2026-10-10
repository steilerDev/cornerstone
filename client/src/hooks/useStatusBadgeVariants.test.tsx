/**
 * @jest-environment jsdom
 */
import { describe, it, expect } from '@jest/globals';
import { renderHook } from '@testing-library/react';
import { useStatusBadgeVariants } from './useStatusBadgeVariants.js';

// react-i18next is not initialised here: useTranslation returns a pass-through t(), which is
// enough to prove the shape and the memoisation.

describe('useStatusBadgeVariants', () => {
  it('returns one variant map per status vocabulary', () => {
    const { result } = renderHook(() => useStatusBadgeVariants());
    expect(Object.keys(result.current).sort()).toEqual([
      'invoice',
      'milestone',
      'progressPayment',
      'purchase',
      'refund',
      'task',
    ]);
    expect(Object.keys(result.current.invoice).sort()).toEqual([
      'claimed',
      'paid',
      'pending',
      'quotation',
    ]);
    expect(Object.keys(result.current.progressPayment).sort()).toEqual([
      'claimed',
      'paid',
      'pending',
    ]);
    expect(Object.keys(result.current.task)).toHaveLength(3);
    expect(Object.keys(result.current.purchase)).toHaveLength(4);
    expect(Object.keys(result.current.milestone).sort()).toEqual([
      'early',
      'late',
      'reached',
      'upcoming',
    ]);
    expect(Object.keys(result.current.refund)).toEqual(['refund']);
  });

  it('every variant has a non-empty label and a class', () => {
    const { result } = renderHook(() => useStatusBadgeVariants());
    for (const map of Object.values(result.current)) {
      for (const variant of Object.values(map)) {
        expect(variant.label.length).toBeGreaterThan(0);
        expect(variant.className).toBeTruthy();
      }
    }
  });

  it('is memoised: the same object identity across re-renders', () => {
    const { result, rerender } = renderHook(() => useStatusBadgeVariants());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
