/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { VendorRelationsResponse } from '@cornerstone/shared';
import { ApiClientError } from '../../lib/apiClient.js';
import type * as HookModule from './useCompanyRelations.js';

const mockFetch = jest.fn<(id: string) => Promise<VendorRelationsResponse>>();
jest.unstable_mockModule('../../lib/vendorRelationsApi.js', () => ({
  fetchVendorRelations: mockFetch,
}));

let useCompanyRelations: (typeof HookModule)['useCompanyRelations'];

const data = (title: string): VendorRelationsResponse => ({
  workItems: [{ id: 'w', title }] as VendorRelationsResponse['workItems'],
  householdItems: [],
  budgetLines: [],
});

beforeEach(async () => {
  mockFetch.mockReset();
  ({ useCompanyRelations } = (await import('./useCompanyRelations.js')) as typeof HookModule);
});

describe('useCompanyRelations', () => {
  it('starts with null data and then holds the relations', async () => {
    mockFetch.mockResolvedValue(data('Screed'));
    const { result } = renderHook(() => useCompanyRelations('v1', 0));

    expect(result.current.data).toBeNull();
    await waitFor(() => expect(result.current.data?.workItems[0]?.title).toBe('Screed'));
    expect(result.current.failure).toBeNull();
    expect(mockFetch).toHaveBeenCalledWith('v1');
  });

  it('records an API failure with its code and retry loads again', async () => {
    mockFetch
      .mockRejectedValueOnce(new ApiClientError(404, { code: 'NOT_FOUND', message: 'x' }))
      .mockResolvedValueOnce(data('Ok'));
    const { result } = renderHook(() => useCompanyRelations('v1', 0));
    await waitFor(() =>
      expect(result.current.failure).toEqual({ kind: 'api', code: 'NOT_FOUND', notFound: true }),
    );

    act(() => result.current.retry());
    // Retry clears the failure at once (back to the loading state) before it refetches.
    expect(result.current.failure).toBeNull();

    await waitFor(() => expect(result.current.data?.workItems[0]?.title).toBe('Ok'));
    expect(result.current.failure).toBeNull();
  });

  it('records a non-API failure as other', async () => {
    mockFetch.mockRejectedValue(new Error('net'));
    const { result } = renderHook(() => useCompanyRelations('v1', 0));

    await waitFor(() => expect(result.current.failure).toEqual({ kind: 'other' }));
  });

  it('keeps the previous data while a new revision loads', async () => {
    let release!: () => void;
    mockFetch.mockResolvedValueOnce(data('Old'));
    const { result, rerender } = renderHook(({ rev }) => useCompanyRelations('v1', rev), {
      initialProps: { rev: 0 },
    });
    await waitFor(() => expect(result.current.data?.workItems[0]?.title).toBe('Old'));
    mockFetch.mockReturnValueOnce(
      new Promise((resolve) => {
        release = () => resolve(data('New'));
      }),
    );

    rerender({ rev: 1 });

    expect(result.current.data?.workItems[0]?.title).toBe('Old');
    await act(async () => release());
    await waitFor(() => expect(result.current.data?.workItems[0]?.title).toBe('New'));
  });

  it('ignores a response and a failure that arrive after unmount', async () => {
    let release!: () => void;
    mockFetch.mockReturnValueOnce(
      new Promise((resolve) => {
        release = () => resolve(data('Late'));
      }),
    );
    const first = renderHook(() => useCompanyRelations('v1', 0));
    first.unmount();
    await act(async () => release());
    expect(first.result.current.data).toBeNull();

    let fail!: () => void;
    mockFetch.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        fail = () => reject(new Error('late'));
      }),
    );
    const second = renderHook(() => useCompanyRelations('v1', 0));
    second.unmount();
    await act(async () => fail());
    expect(second.result.current.failure).toBeNull();
  });

  it('a revision reload does not clear an earlier failure until it succeeds', async () => {
    let release!: () => void;
    mockFetch.mockRejectedValueOnce(new Error('net'));
    const { result, rerender } = renderHook(({ rev }) => useCompanyRelations('v1', rev), {
      initialProps: { rev: 0 },
    });
    await waitFor(() => expect(result.current.failure).toEqual({ kind: 'other' }));
    mockFetch.mockReturnValueOnce(
      new Promise((resolve) => {
        release = () => resolve(data('Fresh'));
      }),
    );

    rerender({ rev: 1 });

    expect(result.current.failure).toEqual({ kind: 'other' });
    await act(async () => release());
    await waitFor(() => expect(result.current.failure).toBeNull());
    expect(result.current.data?.workItems[0]?.title).toBe('Fresh');
  });
});
