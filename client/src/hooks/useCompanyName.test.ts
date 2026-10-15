/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { renderHook, waitFor, act } from '@testing-library/react';
import type * as VendorsApiTypes from '../lib/vendorsApi.js';
import type { VendorDetail } from '@cornerstone/shared';
import type { UseCompanyNameOptions } from './useCompanyName.js';

const mockFetchVendor = jest.fn<typeof VendorsApiTypes.fetchVendor>();

jest.unstable_mockModule('../lib/vendorsApi.js', () => ({
  fetchVendor: mockFetchVendor,
}));

const { useCompanyName } = await import('./useCompanyName.js');
const { ApiClientError } = await import('../lib/apiClient.js');

function company(id: string, name: string): VendorDetail {
  return { id, name } as VendorDetail;
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('useCompanyName', () => {
  beforeEach(() => {
    mockFetchVendor.mockReset();
  });

  it('does not fetch for an empty id', () => {
    const { result } = renderHook(() => useCompanyName(''));

    expect(mockFetchVendor).not.toHaveBeenCalled();
    expect(result.current.name).toBeUndefined();
    expect(result.current.isResolving).toBe(false);
  });

  it('uses a matching known company without fetching', () => {
    const { result } = renderHook(() =>
      useCompanyName('v-1', { known: { id: 'v-1', name: 'Acme Roofing' } }),
    );

    expect(mockFetchVendor).not.toHaveBeenCalled();
    expect(result.current.name).toBe('Acme Roofing');
    expect(result.current.isResolving).toBe(false);
  });

  it('fetches when the known company has a different id', async () => {
    mockFetchVendor.mockResolvedValue(company('v-2', 'Birch Tiles'));

    const { result } = renderHook(() =>
      useCompanyName('v-2', { known: { id: 'v-1', name: 'Acme Roofing' } }),
    );

    expect(result.current.isResolving).toBe(true);
    expect(result.current.name).toBeUndefined();
    await waitFor(() => expect(result.current.name).toBe('Birch Tiles'));
    expect(mockFetchVendor).toHaveBeenCalledWith('v-2');
    expect(result.current.isResolving).toBe(false);
  });

  it('caches a fetched name across re-renders', async () => {
    mockFetchVendor.mockResolvedValue(company('v-2', 'Birch Tiles'));

    const { result, rerender } = renderHook(() => useCompanyName('v-2'));
    await waitFor(() => expect(result.current.name).toBe('Birch Tiles'));
    rerender();
    rerender();

    expect(mockFetchVendor).toHaveBeenCalledTimes(1);
    expect(result.current.name).toBe('Birch Tiles');
  });

  it('calls onUnknown exactly once for a 404 and stops resolving', async () => {
    mockFetchVendor.mockRejectedValue(new ApiClientError(404, { code: 'NOT_FOUND', message: 'x' }));
    const onUnknown = jest.fn();

    const { result, rerender } = renderHook(() => useCompanyName('v-gone', { onUnknown }));
    await waitFor(() => expect(onUnknown).toHaveBeenCalledTimes(1));
    rerender();

    expect(result.current.isResolving).toBe(false);
    expect(result.current.name).toBeUndefined();
    expect(mockFetchVendor).toHaveBeenCalledTimes(1);
    expect(onUnknown).toHaveBeenCalledTimes(1);
  });

  it('keeps the id on a server error: no onUnknown, no name, no refetch', async () => {
    mockFetchVendor.mockRejectedValue(
      new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'x' }),
    );
    const onUnknown = jest.fn();

    const { result, rerender } = renderHook(() => useCompanyName('v-1', { onUnknown }));
    await waitFor(() => expect(result.current.isResolving).toBe(false));
    rerender();
    rerender();

    expect(onUnknown).not.toHaveBeenCalled();
    expect(result.current.name).toBeUndefined();
    expect(mockFetchVendor).toHaveBeenCalledTimes(1);
  });

  it('does not treat a plain network error as unknown', async () => {
    mockFetchVendor.mockRejectedValue(new Error('offline'));
    const onUnknown = jest.fn();

    const { result } = renderHook(() => useCompanyName('v-1', { onUnknown }));
    await waitFor(() => expect(result.current.isResolving).toBe(false));

    expect(onUnknown).not.toHaveBeenCalled();
  });

  it('works without any options on a 404', async () => {
    mockFetchVendor.mockRejectedValue(new ApiClientError(404, { code: 'NOT_FOUND', message: 'x' }));

    const { result } = renderHook(() => useCompanyName('v-gone'));

    await waitFor(() => expect(result.current.isResolving).toBe(false));
    expect(result.current.name).toBeUndefined();
  });

  it('calls the latest onUnknown callback', async () => {
    let reject!: (err: unknown) => void;
    mockFetchVendor.mockReturnValue(
      new Promise<VendorDetail>((_res, rej) => {
        reject = rej;
      }),
    );
    const first = jest.fn();
    const second = jest.fn();

    const { rerender } = renderHook(
      ({ cb }: { cb: UseCompanyNameOptions['onUnknown'] }) =>
        useCompanyName('v-gone', { onUnknown: cb }),
      { initialProps: { cb: first } },
    );
    rerender({ cb: second });
    await act(async () => {
      reject(new ApiClientError(404, { code: 'NOT_FOUND', message: 'x' }));
    });

    expect(mockFetchVendor).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('remember() supplies the name without a further fetch', () => {
    mockFetchVendor.mockReturnValue(new Promise<VendorDetail>(() => {}));
    const { result } = renderHook(() => useCompanyName('v-9'));
    expect(mockFetchVendor).toHaveBeenCalledTimes(1);
    mockFetchVendor.mockClear();

    act(() => {
      result.current.remember({ id: 'v-9', label: 'Cedar Plumbing' });
    });

    expect(result.current.name).toBe('Cedar Plumbing');
    expect(mockFetchVendor).not.toHaveBeenCalled();
  });

  it('remember() before the id is set prevents any fetch for that id', () => {
    mockFetchVendor.mockResolvedValue(company('v-9', 'Server Name'));

    const { result, rerender } = renderHook(({ id }) => useCompanyName(id), {
      initialProps: { id: '' },
    });
    act(() => {
      result.current.remember({ id: 'v-9', label: 'Cedar Plumbing' });
    });
    rerender({ id: 'v-9' });

    expect(mockFetchVendor).not.toHaveBeenCalled();
    expect(result.current.name).toBe('Cedar Plumbing');
    expect(result.current.isResolving).toBe(false);
  });

  it('ignores the old response when the id changes mid-flight', async () => {
    const first = deferred<VendorDetail>();
    const second = deferred<VendorDetail>();
    mockFetchVendor.mockImplementation((id: string) =>
      id === 'v-1' ? first.promise : second.promise,
    );
    const onUnknown = jest.fn();

    const { result, rerender } = renderHook(({ id }) => useCompanyName(id, { onUnknown }), {
      initialProps: { id: 'v-1' },
    });
    rerender({ id: 'v-2' });
    await act(async () => {
      second.resolve(company('v-2', 'Second Co'));
    });
    await act(async () => {
      first.resolve(company('v-1', 'First Co'));
    });

    expect(result.current.name).toBe('Second Co');
    rerender({ id: 'v-1' });
    // v-1's late answer was dropped, so it is looked up again when it becomes current
    expect(mockFetchVendor).toHaveBeenCalledTimes(3);
    expect(onUnknown).not.toHaveBeenCalled();
  });

  it('does not report a superseded 404', async () => {
    const first = deferred<VendorDetail>();
    mockFetchVendor.mockImplementation((id: string) =>
      id === 'v-1' ? first.promise : Promise.resolve(company('v-2', 'Second Co')),
    );
    const onUnknown = jest.fn();

    const { result, rerender } = renderHook(({ id }) => useCompanyName(id, { onUnknown }), {
      initialProps: { id: 'v-1' },
    });
    rerender({ id: 'v-2' });
    await waitFor(() => expect(result.current.name).toBe('Second Co'));
    await act(async () => {
      first.resolve(company('v-1', 'late'));
    });

    expect(onUnknown).not.toHaveBeenCalled();
  });
});
