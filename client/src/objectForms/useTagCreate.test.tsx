/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { TagCreateContext } from './tagCreateContext.js';
import type { CreatedTag, RequestTagCreate } from './tagCreateContext.js';
import { useTagCreate } from './useTagCreate.js';

function withRequest(request: RequestTagCreate | null) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <TagCreateContext value={request}>{children}</TagCreateContext>;
  };
}

describe('useTagCreate', () => {
  it('has no request function and is not creating outside a TagCreateProvider', () => {
    const { result } = renderHook(() => useTagCreate());

    expect(result.current.request).toBeUndefined();
    expect(result.current.isCreating).toBe(false);
  });

  it('passes the kind and the opener to the provider and resolves the created tag', async () => {
    const tag: CreatedTag = { id: 'a-1', name: 'Shed' };
    const provided = jest.fn<RequestTagCreate>().mockResolvedValue(tag);
    const { result } = renderHook(() => useTagCreate(), { wrapper: withRequest(provided) });
    const opener = document.createElement('button');

    let resolved: CreatedTag | null = null;
    await act(async () => {
      resolved = await result.current.request!('area', opener);
    });

    expect(provided.mock.calls[0]![0]).toBe('area');
    expect(provided.mock.calls[0]![1]).toBe(opener);
    expect(provided.mock.calls[0]![2]).toBeUndefined();
    expect(resolved).toBe(tag);
  });

  it('resolves null when the provider cancels', async () => {
    const provided = jest.fn<RequestTagCreate>().mockResolvedValue(null);
    const { result } = renderHook(() => useTagCreate(), { wrapper: withRequest(provided) });

    let resolved: CreatedTag | null = { id: 'x', name: 'x' };
    await act(async () => {
      resolved = await result.current.request!('orientation');
    });

    expect(provided).toHaveBeenCalledWith('orientation', undefined, undefined);
    expect(resolved).toBeNull();
  });

  it.each(['area', 'orientation', 'trade', 'category'] as const)(
    'passes the %s kind, the opener and the typed name through to the provider',
    async (kind) => {
      const tag: CreatedTag = { id: 'x-1', name: 'Typed' };
      const provided = jest.fn<RequestTagCreate>().mockResolvedValue(tag);
      const { result } = renderHook(() => useTagCreate(), { wrapper: withRequest(provided) });
      const opener = document.createElement('input');

      let resolved: CreatedTag | null = null;
      await act(async () => {
        resolved = await result.current.request!(kind, opener, 'Typed');
      });

      expect(provided.mock.calls[0]).toEqual([kind, opener, 'Typed']);
      expect(resolved).toBe(tag);
    },
  );

  it('passes no name when none was typed', async () => {
    const provided = jest.fn<RequestTagCreate>().mockResolvedValue(null);
    const { result } = renderHook(() => useTagCreate(), { wrapper: withRequest(provided) });

    await act(async () => {
      await result.current.request!('trade', null);
    });

    expect(provided).toHaveBeenCalledWith('trade', null, undefined);
  });

  it('isCreating is true while the dialog is open and false once it closes', async () => {
    let finish!: (tag: CreatedTag | null) => void;
    const provided = jest.fn<RequestTagCreate>(
      () => new Promise<CreatedTag | null>((resolve) => (finish = resolve)),
    );
    const { result } = renderHook(() => useTagCreate(), { wrapper: withRequest(provided) });

    let pending!: Promise<CreatedTag | null>;
    act(() => {
      pending = result.current.request!('area');
    });
    expect(result.current.isCreating).toBe(true);

    await act(async () => {
      finish(null);
      await pending;
    });
    expect(result.current.isCreating).toBe(false);
  });

  it('isCreating returns to false when the provider rejects', async () => {
    const provided = jest.fn<RequestTagCreate>().mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useTagCreate(), { wrapper: withRequest(provided) });

    await act(async () => {
      await result.current.request!('area').catch(() => undefined);
    });

    expect(result.current.isCreating).toBe(false);
  });

  it('keeps a stable request function across renders', () => {
    const provided = jest.fn<RequestTagCreate>();
    const { result, rerender } = renderHook(() => useTagCreate(), {
      wrapper: withRequest(provided),
    });
    const first = result.current.request;

    rerender();

    expect(result.current.request).toBe(first);
  });

  it('resolves null when the provider disappears after the request function was handed out', async () => {
    let current: RequestTagCreate | null = jest.fn<RequestTagCreate>();
    const Wrapper = ({ children }: { children: ReactNode }) => (
      <TagCreateContext value={current}>{children}</TagCreateContext>
    );
    const { result, rerender } = renderHook(() => useTagCreate(), { wrapper: Wrapper });
    const request = result.current.request!;
    current = null;
    rerender();

    await expect(request('area')).resolves.toBeNull();
    expect(result.current.request).toBeUndefined();
  });

  it('never imports ObjectForm (it must stay out of page closures)', () => {
    for (const file of ['./useTagCreate.ts', './tagCreateContext.ts']) {
      const source = readFileSync(new URL(file, import.meta.url), 'utf8');
      expect(source).not.toMatch(/from\s+['"][^'"]*ObjectForm/);
    }
  });
});
