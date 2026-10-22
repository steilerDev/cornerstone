/**
 * @jest-environment jsdom
 */
import { describe, it, expect } from '@jest/globals';
import type { ReactNode } from 'react';
import { renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useCreateEntryLink } from '../../navigation/useOpenCreate.js';
import { useLogPrimary } from './useLogPrimary.js';

function wrapperAt(url: string) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>;
  };
}

describe('useLogPrimary', () => {
  it('returns a link primary labelled "Log" that targets a new diary entry', () => {
    const { result } = renderHook(
      () => ({ primary: useLogPrimary(), link: useCreateEntryLink('diaryEntry') }),
      { wrapper: wrapperAt('/project/work-items/w1?tab=cost') },
    );

    expect(result.current.primary).toEqual({
      kind: 'link',
      label: 'Log',
      to: result.current.link.to,
      state: result.current.link.state,
      testId: 'object-header-log',
    });
  });

  it('carries the page it was opened from as origin state', () => {
    const { result } = renderHook(() => useLogPrimary(), {
      wrapper: wrapperAt('/project/work-items/w1?tab=cost'),
    });

    expect(result.current.kind).toBe('link');
    if (result.current.kind !== 'link') return;
    expect(result.current.state).toMatchObject({
      origin: { to: '/project/work-items/w1?tab=cost' },
    });
  });

  it('accepts a custom test id', () => {
    const { result } = renderHook(() => useLogPrimary('my-log'), { wrapper: wrapperAt('/x') });
    expect(result.current).toMatchObject({ testId: 'my-log' });
  });
});
