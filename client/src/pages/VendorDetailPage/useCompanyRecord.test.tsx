/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { VendorDetail } from '@cornerstone/shared';
import { ApiClientError } from '../../lib/apiClient.js';
import type * as HookModule from './useCompanyRecord.js';

const mockFetchVendor = jest.fn<(id: string) => Promise<VendorDetail>>();
jest.unstable_mockModule('../../lib/vendorsApi.js', () => ({ fetchVendor: mockFetchVendor }));

let useCompanyRecord: (typeof HookModule)['useCompanyRecord'];

const vendor = (name: string): VendorDetail => ({ id: 'v1', name }) as unknown as VendorDetail;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(async () => {
  mockFetchVendor.mockReset();
  ({ useCompanyRecord } = (await import('./useCompanyRecord.js')) as typeof HookModule);
});

describe('useCompanyRecord', () => {
  it('starts loading, then holds the record with no error and revision 0', async () => {
    mockFetchVendor.mockResolvedValue(vendor('Alpha'));
    const { result } = renderHook(() => useCompanyRecord('v1'));

    expect(result.current.isLoading).toBe(true);
    expect(result.current.record).toBeNull();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.record?.name).toBe('Alpha');
    expect(result.current.error).toBeNull();
    expect(result.current.notFound).toBe(false);
    expect(result.current.revision).toBe(0);
    expect(mockFetchVendor).toHaveBeenCalledWith('v1');
  });

  it('reports not found for a 404 with the not-found text', async () => {
    mockFetchVendor.mockRejectedValue(
      new ApiClientError(404, { code: 'NOT_FOUND', message: 'Vendor not found' }),
    );
    const { result } = renderHook(() => useCompanyRecord('v1'));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.notFound).toBe(true);
    expect(result.current.error).toBeTruthy();
    expect(result.current.record).toBeNull();
  });

  it('reports a generic load error for a non-API failure without marking it not found', async () => {
    mockFetchVendor.mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useCompanyRecord('v1'));

    await waitFor(() => expect(result.current.error).not.toBeNull());

    expect(result.current.notFound).toBe(false);
    expect(result.current.isLoading).toBe(false);
  });

  it('translates another API failure code instead of the not-found text', async () => {
    mockFetchVendor.mockRejectedValue(
      new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'boom' }),
    );
    const { result } = renderHook(() => useCompanyRecord('v1'));

    await waitFor(() => expect(result.current.error).not.toBeNull());

    expect(result.current.notFound).toBe(false);
  });

  // Mutation: setting isLoading in refresh would blank the page (and its focus) on every save.
  it('refresh swaps the record silently and bumps the revision', async () => {
    mockFetchVendor.mockResolvedValueOnce(vendor('Alpha')).mockResolvedValueOnce(vendor('Beta'));
    const { result } = renderHook(() => useCompanyRecord('v1'));
    await waitFor(() => expect(result.current.record?.name).toBe('Alpha'));

    let fresh: VendorDetail | null = null;
    await act(async () => {
      fresh = await result.current.refresh();
    });

    expect(fresh).toMatchObject({ name: 'Beta' });
    expect(result.current.record?.name).toBe('Beta');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.revision).toBe(1);
  });

  it('refresh clears an earlier failure', async () => {
    mockFetchVendor.mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce(vendor('Beta'));
    const { result } = renderHook(() => useCompanyRecord('v1'));
    await waitFor(() => expect(result.current.error).not.toBeNull());

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.error).toBeNull();
    expect(result.current.record?.name).toBe('Beta');
  });

  it('a failed refresh falls back to a loading reload and returns null', async () => {
    mockFetchVendor
      .mockResolvedValueOnce(vendor('Alpha'))
      .mockRejectedValueOnce(new Error('x'))
      .mockResolvedValueOnce(vendor('Gamma'));
    const { result } = renderHook(() => useCompanyRecord('v1'));
    await waitFor(() => expect(result.current.record?.name).toBe('Alpha'));

    let value: VendorDetail | null = vendor('sentinel');
    await act(async () => {
      value = await result.current.refresh();
    });

    expect(value).toBeNull();
    await waitFor(() => expect(result.current.record?.name).toBe('Gamma'));
    expect(mockFetchVendor).toHaveBeenCalledTimes(3);
  });

  it('reload shows the loading state again', async () => {
    mockFetchVendor.mockResolvedValue(vendor('Alpha'));
    const { result } = renderHook(() => useCompanyRecord('v1'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const pending = deferred<VendorDetail>();
    mockFetchVendor.mockReturnValueOnce(pending.promise);

    let reloading!: Promise<void>;
    act(() => {
      reloading = result.current.reload();
    });
    expect(result.current.isLoading).toBe(true);
    await act(async () => {
      pending.resolve(vendor('Delta'));
      await reloading;
    });

    expect(result.current.record?.name).toBe('Delta');
  });

  // Mutation: dropping the request counter lets a slow earlier response overwrite a newer one.
  it('only the newest request writes: a slow older response is ignored', async () => {
    const first = deferred<VendorDetail>();
    mockFetchVendor.mockReturnValueOnce(first.promise).mockResolvedValueOnce(vendor('Newest'));
    const { result } = renderHook(() => useCompanyRecord('v1'));

    await act(async () => {
      await result.current.refresh();
    });
    await act(async () => {
      first.resolve(vendor('Stale'));
      await first.promise;
    });

    expect(result.current.record?.name).toBe('Newest');
    expect(result.current.isLoading).toBe(false);
  });

  it('an older failure after a newer success does not set an error', async () => {
    const first = deferred<VendorDetail>();
    mockFetchVendor.mockReturnValueOnce(first.promise).mockResolvedValueOnce(vendor('Newest'));
    const { result } = renderHook(() => useCompanyRecord('v1'));
    await act(async () => {
      await result.current.refresh();
    });

    await act(async () => {
      first.reject(new Error('late'));
      await first.promise.catch(() => undefined);
    });

    expect(result.current.error).toBeNull();
  });

  it('ignores a response that arrives after unmount', async () => {
    const pending = deferred<VendorDetail>();
    mockFetchVendor.mockReturnValue(pending.promise);
    const { result, unmount } = renderHook(() => useCompanyRecord('v1'));
    unmount();

    await act(async () => {
      pending.resolve(vendor('Late'));
      await pending.promise;
    });

    expect(result.current.record).toBeNull();
  });

  it('ignores a failure that arrives after unmount', async () => {
    const pending = deferred<VendorDetail>();
    mockFetchVendor.mockReturnValue(pending.promise);
    const { result, unmount } = renderHook(() => useCompanyRecord('v1'));
    unmount();

    await act(async () => {
      pending.reject(new Error('late'));
      await pending.promise.catch(() => undefined);
    });

    expect(result.current.error).toBeNull();
  });

  it('a refresh that finishes after unmount neither writes nor reloads', async () => {
    mockFetchVendor.mockResolvedValueOnce(vendor('Alpha'));
    const { result, unmount } = renderHook(() => useCompanyRecord('v1'));
    await waitFor(() => expect(result.current.record).not.toBeNull());
    const pending = deferred<VendorDetail>();
    mockFetchVendor.mockReturnValueOnce(pending.promise);
    let refreshing!: Promise<VendorDetail | null>;
    act(() => {
      refreshing = result.current.refresh();
    });
    unmount();

    await act(async () => {
      pending.reject(new Error('late'));
      await refreshing;
    });

    expect(mockFetchVendor).toHaveBeenCalledTimes(2);
  });

  it('loads the new company when the id changes', async () => {
    mockFetchVendor.mockImplementation(async (id) => ({ id, name: `Co ${id}` }) as VendorDetail);
    const { result, rerender } = renderHook(({ id }) => useCompanyRecord(id), {
      initialProps: { id: 'v1' },
    });
    await waitFor(() => expect(result.current.record?.name).toBe('Co v1'));

    rerender({ id: 'v2' });

    await waitFor(() => expect(result.current.record?.name).toBe('Co v2'));
  });

  it('a stale failed refresh neither reloads nor sets an error when a newer request began', async () => {
    mockFetchVendor.mockResolvedValueOnce(vendor('Alpha'));
    const { result } = renderHook(() => useCompanyRecord('v1'));
    await waitFor(() => expect(result.current.record?.name).toBe('Alpha'));
    const slow = deferred<VendorDetail>();
    mockFetchVendor.mockReturnValueOnce(slow.promise).mockResolvedValueOnce(vendor('Newest'));
    let firstRefresh!: Promise<VendorDetail | null>;
    act(() => {
      firstRefresh = result.current.refresh();
    });
    await act(async () => {
      await result.current.refresh();
    });

    await act(async () => {
      slow.reject(new Error('late'));
      await firstRefresh;
    });

    expect(mockFetchVendor).toHaveBeenCalledTimes(3);
    expect(result.current.record?.name).toBe('Newest');
    expect(result.current.error).toBeNull();
  });
});
