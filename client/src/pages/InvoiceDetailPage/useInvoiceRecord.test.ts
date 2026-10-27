/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { InvoiceDetail } from '@cornerstone/shared';
import type * as HookModule from './useInvoiceRecord.js';
import type * as ApiClientModule from '../../lib/apiClient.js';
import { makeInvoiceDetail } from '../../test/invoiceDetailFixtures.js';

const mockFetchInvoiceById = jest.fn<(id: string) => Promise<InvoiceDetail>>();
jest.unstable_mockModule('../../lib/invoicesApi.js', () => ({
  fetchInvoiceById: mockFetchInvoiceById,
}));

let useInvoiceRecord: (typeof HookModule)['useInvoiceRecord'];
let ApiClientError: (typeof ApiClientModule)['ApiClientError'];

function deferred<T>() {
  let resolve: (v: T) => void = () => undefined;
  let reject: (e: unknown) => void = () => undefined;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(async () => {
  mockFetchInvoiceById.mockReset();
  ({ useInvoiceRecord } = (await import('./useInvoiceRecord.js')) as typeof HookModule);
  ({ ApiClientError } = (await import('../../lib/apiClient.js')) as typeof ApiClientModule);
});

describe('useInvoiceRecord', () => {
  it('loads the record with the loading state first', async () => {
    const record = makeInvoiceDetail({ id: 'inv-7' });
    mockFetchInvoiceById.mockResolvedValue(record);
    const { result } = renderHook(() => useInvoiceRecord('inv-7'));
    expect(result.current.isLoading).toBe(true);
    expect(result.current.invoice).toBeNull();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockFetchInvoiceById).toHaveBeenCalledWith('inv-7');
    expect(result.current.invoice).toEqual(record);
    expect(result.current.error).toBeNull();
    expect(result.current.notFound).toBe(false);
    expect(result.current.revision).toBe(0);
  });

  it('a 404 is "not found" with the not-found message', async () => {
    mockFetchInvoiceById.mockRejectedValue(
      new ApiClientError(404, { code: 'NOT_FOUND', message: 'raw prose' }),
    );
    const { result } = renderHook(() => useInvoiceRecord('missing'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.notFound).toBe(true);
    expect(result.current.error).toBe('Invoice not found. It may have been deleted.');
    expect(result.current.invoice).toBeNull();
  });

  it('any other API error is translated and is not "not found"', async () => {
    mockFetchInvoiceById.mockRejectedValue(
      new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'raw prose' }),
    );
    const { result } = renderHook(() => useInvoiceRecord('inv-1'));
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.notFound).toBe(false);
    expect(result.current.error).not.toContain('raw prose');
    expect(result.current.error).not.toBe('Invoice not found. It may have been deleted.');
  });

  it('a non-API failure shows the not-found message too', async () => {
    mockFetchInvoiceById.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useInvoiceRecord('inv-1'));
    await waitFor(() =>
      expect(result.current.error).toBe('Invoice not found. It may have been deleted.'),
    );
    expect(result.current.notFound).toBe(false);
  });

  it('reload shows the loading state again, clears the error and recovers', async () => {
    mockFetchInvoiceById.mockRejectedValueOnce(
      new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'x' }),
    );
    const { result } = renderHook(() => useInvoiceRecord('inv-1'));
    await waitFor(() => expect(result.current.error).not.toBeNull());
    const gate = deferred<InvoiceDetail>();
    mockFetchInvoiceById.mockReturnValue(gate.promise);
    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.reload();
    });
    expect(result.current.isLoading).toBe(true);
    expect(result.current.error).toBeNull();
    await act(async () => {
      gate.resolve(makeInvoiceDetail());
      await pending;
    });
    expect(result.current.invoice?.id).toBe('inv-1');
    expect(result.current.isLoading).toBe(false);
  });

  it('refresh swaps in the new record without the loading state and bumps the revision', async () => {
    mockFetchInvoiceById.mockResolvedValueOnce(makeInvoiceDetail({ paid: 0 }));
    const { result } = renderHook(() => useInvoiceRecord('inv-1'));
    await waitFor(() => expect(result.current.invoice).not.toBeNull());
    mockFetchInvoiceById.mockResolvedValueOnce(makeInvoiceDetail({ paid: 200 }));
    let returned: InvoiceDetail | null = null;
    await act(async () => {
      returned = await result.current.refresh();
    });
    expect(returned).toMatchObject({ paid: 200 });
    expect(result.current.invoice?.paid).toBe(200);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.revision).toBe(1);
  });

  it('a failed refresh falls back to a full reload and resolves null', async () => {
    mockFetchInvoiceById.mockResolvedValueOnce(makeInvoiceDetail());
    const { result } = renderHook(() => useInvoiceRecord('inv-1'));
    await waitFor(() => expect(result.current.invoice).not.toBeNull());
    mockFetchInvoiceById.mockRejectedValueOnce(new Error('offline'));
    mockFetchInvoiceById.mockRejectedValueOnce(
      new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'x' }),
    );
    let returned: InvoiceDetail | null = makeInvoiceDetail();
    await act(async () => {
      returned = await result.current.refresh();
    });
    expect(returned).toBeNull();
    expect(mockFetchInvoiceById).toHaveBeenCalledTimes(3);
    expect(result.current.error).not.toBeNull();
    expect(result.current.revision).toBe(0);
  });

  it('only the newest request writes: a slow older refresh cannot overwrite a newer one', async () => {
    mockFetchInvoiceById.mockResolvedValueOnce(makeInvoiceDetail({ paid: 0 }));
    const { result } = renderHook(() => useInvoiceRecord('inv-1'));
    await waitFor(() => expect(result.current.invoice).not.toBeNull());
    const slow = deferred<InvoiceDetail>();
    const fast = deferred<InvoiceDetail>();
    mockFetchInvoiceById.mockReturnValueOnce(slow.promise).mockReturnValueOnce(fast.promise);
    let first: Promise<InvoiceDetail | null> = Promise.resolve(null);
    let second: Promise<InvoiceDetail | null> = Promise.resolve(null);
    act(() => {
      first = result.current.refresh();
      second = result.current.refresh();
    });
    await act(async () => {
      fast.resolve(makeInvoiceDetail({ paid: 300 }));
      await second;
    });
    await act(async () => {
      slow.resolve(makeInvoiceDetail({ paid: 100 }));
      expect(await first).toBeNull();
    });
    expect(result.current.invoice?.paid).toBe(300);
    expect(result.current.revision).toBe(1);
  });

  it('a stale failed reload cannot write an error over a newer load', async () => {
    const slow = deferred<InvoiceDetail>();
    mockFetchInvoiceById.mockReturnValueOnce(slow.promise);
    const { result } = renderHook(() => useInvoiceRecord('inv-1'));
    mockFetchInvoiceById.mockResolvedValueOnce(makeInvoiceDetail({ paid: 50 }));
    await act(async () => {
      await result.current.reload();
    });
    await act(async () => {
      slow.reject(new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'x' }));
      await Promise.resolve();
    });
    expect(result.current.error).toBeNull();
    expect(result.current.invoice?.paid).toBe(50);
    expect(result.current.isLoading).toBe(false);
  });

  it('ignores a response that arrives after unmount', async () => {
    const gate = deferred<InvoiceDetail>();
    mockFetchInvoiceById.mockReturnValue(gate.promise);
    const { result, unmount } = renderHook(() => useInvoiceRecord('inv-1'));
    unmount();
    await act(async () => {
      gate.resolve(makeInvoiceDetail());
      await Promise.resolve();
    });
    expect(result.current.invoice).toBeNull();
  });

  it('ignores a failure after unmount, for reload and for refresh', async () => {
    mockFetchInvoiceById.mockResolvedValueOnce(makeInvoiceDetail());
    const { result, unmount } = renderHook(() => useInvoiceRecord('inv-1'));
    await waitFor(() => expect(result.current.invoice).not.toBeNull());
    const gate = deferred<InvoiceDetail>();
    mockFetchInvoiceById.mockReturnValueOnce(gate.promise);
    let pending: Promise<InvoiceDetail | null> = Promise.resolve(null);
    act(() => {
      pending = result.current.refresh();
    });
    unmount();
    await act(async () => {
      gate.reject(new Error('late'));
      expect(await pending).toBeNull();
    });
    expect(mockFetchInvoiceById).toHaveBeenCalledTimes(2);
  });

  it('loads again when the id changes', async () => {
    mockFetchInvoiceById.mockImplementation(async (id) => makeInvoiceDetail({ id }));
    const { result, rerender } = renderHook(({ id }) => useInvoiceRecord(id), {
      initialProps: { id: 'a' },
    });
    await waitFor(() => expect(result.current.invoice?.id).toBe('a'));
    rerender({ id: 'b' });
    await waitFor(() => expect(result.current.invoice?.id).toBe('b'));
  });
});
