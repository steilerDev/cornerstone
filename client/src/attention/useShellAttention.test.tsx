/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { createRef } from 'react';
import { render, renderHook } from '@testing-library/react';
import { AttentionContext } from './attentionContext.js';
import type { ShellAttention } from './attentionContext.js';
import { useShellAttention } from './useShellAttention.js';

function fakeAttention(): ShellAttention {
  return {
    data: null,
    status: 'loading',
    error: null,
    includeSnoozed: false,
    setIncludeSnoozed: jest.fn(),
    refresh: jest.fn(),
    retry: jest.fn(),
    removeRow: jest.fn(),
    refreshStale: jest.fn(),
    homeHeadingRef: createRef<HTMLHeadingElement>(),
  };
}

describe('useShellAttention', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('throws a clear error outside the provider', () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useShellAttention())).toThrow(
      'useShellAttention must be used inside AttentionProvider',
    );
  });

  it('returns the provided shell attention state', () => {
    const value = fakeAttention();
    const { result } = renderHook(() => useShellAttention(), {
      wrapper: ({ children }) => <AttentionContext value={value}>{children}</AttentionContext>,
    });
    expect(result.current).toBe(value);
  });

  it('renders for a consumer inside the context', () => {
    function Probe() {
      return <span>{useShellAttention().status}</span>;
    }
    const { container } = render(
      <AttentionContext value={fakeAttention()}>
        <Probe />
      </AttentionContext>,
    );
    expect(container).toHaveTextContent('loading');
  });
});
