/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { InvoiceListRow } from '@cornerstone/shared';
import { ApiClientError } from '../../lib/apiClient.js';
import type * as HookModule from './useCompanyPayments.js';

type Page = { invoices: InvoiceListRow[]; pagination: { totalPages: number } };
const mockFetchAll =
  jest.fn<(q: { vendorId: string; pageSize: number; page: number }) => Promise<Page>>();
jest.unstable_mockModule('../../lib/invoicesApi.js', () => ({ fetchAllInvoices: mockFetchAll }));

let useCompanyPayments: (typeof HookModule)['useCompanyPayments'];

const row = (id: string) => ({ id }) as unknown as InvoiceListRow;
const page = (ids: string[], totalPages = 1): Page => ({
  invoices: ids.map(row),
  pagination: { totalPages },
});

beforeEach(async () => {
  mockFetchAll.mockReset();
  ({ useCompanyPayments } = (await import('./useCompanyPayments.js')) as typeof HookModule);
});

describe('useCompanyPayments', () => {
  it('starts with null rows and then holds the company records', async () => {
    mockFetchAll.mockResolvedValue(page(['a', 'b']));
    const { result } = renderHook(() => useCompanyPayments('v1', 0));

    expect(result.current.rows).toBeNull();
    await waitFor(() => expect(result.current.rows?.map((r) => r.id)).toEqual(['a', 'b']));
    expect(result.current.failure).toBeNull();
    expect(mockFetchAll).toHaveBeenCalledWith({ vendorId: 'v1', pageSize: 100, page: 1 });
  });

  // Mutation: stopping after page 1 silently drops records of a big company.
  it('walks every page and concatenates the rows in order', async () => {
    mockFetchAll
      .mockResolvedValueOnce(page(['a', 'b'], 3))
      .mockResolvedValueOnce(page(['c'], 3))
      .mockResolvedValueOnce(page(['d'], 3));
    const { result } = renderHook(() => useCompanyPayments('v1', 0));

    await waitFor(() =>
      expect(result.current.rows?.map((r) => r.id)).toEqual(['a', 'b', 'c', 'd']),
    );
    expect(mockFetchAll.mock.calls.map((c) => c[0].page)).toEqual([1, 2, 3]);
  });

  it('records a failure, and retry loads again and clears it', async () => {
    mockFetchAll
      .mockRejectedValueOnce(new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'x' }))
      .mockResolvedValueOnce(page(['a']));
    const { result } = renderHook(() => useCompanyPayments('v1', 0));
    await waitFor(() =>
      expect(result.current.failure).toEqual({
        kind: 'api',
        code: 'INTERNAL_ERROR',
        notFound: false,
      }),
    );

    act(() => result.current.retry());
    // Retry clears the failure at once (back to the loading state) before it refetches.
    expect(result.current.failure).toBeNull();

    await waitFor(() => expect(result.current.rows?.map((r) => r.id)).toEqual(['a']));
    expect(result.current.failure).toBeNull();
  });

  it('records a non-API failure as other', async () => {
    mockFetchAll.mockRejectedValue(new Error('net'));
    const { result } = renderHook(() => useCompanyPayments('v1', 0));

    await waitFor(() => expect(result.current.failure).toEqual({ kind: 'other' }));
  });

  // Mutation: resetting rows to null on a new revision blanks the list and loses focus.
  it('keeps the previous rows while a new revision loads, then swaps them', async () => {
    let release!: () => void;
    mockFetchAll.mockResolvedValueOnce(page(['old']));
    const { result, rerender } = renderHook(({ rev }) => useCompanyPayments('v1', rev), {
      initialProps: { rev: 0 },
    });
    await waitFor(() => expect(result.current.rows?.map((r) => r.id)).toEqual(['old']));
    mockFetchAll.mockReturnValueOnce(
      new Promise<Page>((resolve) => {
        release = () => resolve(page(['new']));
      }),
    );

    rerender({ rev: 1 });

    expect(result.current.rows?.map((r) => r.id)).toEqual(['old']);
    await act(async () => release());
    await waitFor(() => expect(result.current.rows?.map((r) => r.id)).toEqual(['new']));
    expect(mockFetchAll).toHaveBeenCalledTimes(2);
  });

  it('ignores a response that arrives after unmount', async () => {
    let release!: () => void;
    mockFetchAll.mockReturnValue(
      new Promise<Page>((resolve) => {
        release = () => resolve(page(['late']));
      }),
    );
    const { result, unmount } = renderHook(() => useCompanyPayments('v1', 0));
    unmount();

    await act(async () => release());

    expect(result.current.rows).toBeNull();
  });

  it('ignores a failure that arrives after unmount', async () => {
    let fail!: () => void;
    mockFetchAll.mockReturnValue(
      new Promise<Page>((_resolve, reject) => {
        fail = () => reject(new Error('late'));
      }),
    );
    const { result, unmount } = renderHook(() => useCompanyPayments('v1', 0));
    unmount();

    await act(async () => fail());

    expect(result.current.failure).toBeNull();
  });

  it('a revision reload does not clear an earlier failure until it succeeds', async () => {
    let release!: () => void;
    mockFetchAll.mockRejectedValueOnce(new Error('net'));
    const { result, rerender } = renderHook(({ rev }) => useCompanyPayments('v1', rev), {
      initialProps: { rev: 0 },
    });
    await waitFor(() => expect(result.current.failure).toEqual({ kind: 'other' }));
    mockFetchAll.mockReturnValueOnce(
      new Promise<Page>((resolve) => {
        release = () => resolve(page(['a']));
      }),
    );

    rerender({ rev: 1 });

    expect(result.current.failure).toEqual({ kind: 'other' });
    await act(async () => release());
    await waitFor(() => expect(result.current.failure).toBeNull());
    expect(result.current.rows?.map((r) => r.id)).toEqual(['a']);
  });
});
