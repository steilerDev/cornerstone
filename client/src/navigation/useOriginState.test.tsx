/**
 * @jest-environment jsdom
 */
import { describe, it, expect } from '@jest/globals';
import { renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useOriginState } from './useOriginState.js';

function wrapperAt(url: string) {
  return ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>
  );
}

describe('useOriginState', () => {
  it('builds the origin from the current location', () => {
    const { result } = renderHook(() => useOriginState(), {
      wrapper: wrapperAt('/schedule/calendar?calendarMode=week#top'),
    });

    expect(result.current).toEqual({ origin: { to: '/schedule/calendar?calendarMode=week#top' } });
  });

  it('adds the trimmed object name', () => {
    const { result } = renderHook(() => useOriginState('  Synthetic milestone '), {
      wrapper: wrapperAt('/project/milestones/7'),
    });

    expect(result.current.origin).toEqual({
      to: '/project/milestones/7',
      name: 'Synthetic milestone',
    });
  });

  it('returns the same object across re-renders with the same location and name', () => {
    const { result, rerender } = renderHook(({ name }) => useOriginState(name), {
      wrapper: wrapperAt('/a?x=1'),
      initialProps: { name: 'N' },
    });
    const first = result.current;

    rerender({ name: 'N' });

    expect(result.current).toBe(first);
  });

  it('returns a new object when the name changes', () => {
    const { result, rerender } = renderHook(({ name }) => useOriginState(name), {
      wrapper: wrapperAt('/a?x=1'),
      initialProps: { name: 'N' },
    });
    const first = result.current;

    rerender({ name: 'M' });

    expect(result.current).not.toBe(first);
    expect(result.current.origin.name).toBe('M');
  });
});
