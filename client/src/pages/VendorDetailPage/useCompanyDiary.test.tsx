/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { DiaryEntrySummary } from '@cornerstone/shared';
import { ApiClientError } from '../../lib/apiClient.js';
import type * as HookModule from './useCompanyDiary.js';

type Resp = { items: DiaryEntrySummary[]; pagination: { totalItems: number } };
const mockList = jest.fn<(q: Record<string, unknown>) => Promise<Resp>>();
jest.unstable_mockModule('../../lib/diaryApi.js', () => ({ listDiaryEntries: mockList }));

let useCompanyDiary: (typeof HookModule)['useCompanyDiary'];

const resp = (ids: string[], total = ids.length): Resp => ({
  items: ids.map((id) => ({ id }) as unknown as DiaryEntrySummary),
  pagination: { totalItems: total },
});

beforeEach(async () => {
  mockList.mockReset();
  ({ useCompanyDiary } = (await import('./useCompanyDiary.js')) as typeof HookModule);
});

describe('useCompanyDiary', () => {
  // Mutation: dropping automatic:false or status:'saved' makes "Show all (n)" disagree with the
  // Site diary page, which runs exactly this query for ?companyId=.
  it('asks for page 1 of 20 saved, manual entries naming the company', async () => {
    mockList.mockResolvedValue(resp(['e1', 'e2'], 45));
    const { result } = renderHook(() => useCompanyDiary('v1', 0));

    expect(result.current.items).toBeNull();
    expect(result.current.totalItems).toBeNull();
    await waitFor(() => expect(result.current.items?.map((e) => e.id)).toEqual(['e1', 'e2']));
    expect(result.current.totalItems).toBe(45);
    expect(result.current.failure).toBeNull();
    expect(mockList).toHaveBeenCalledWith({
      vendorId: 'v1',
      automatic: false,
      status: 'saved',
      page: 1,
      pageSize: 20,
    });
  });

  it('records a failure and reload loads again', async () => {
    mockList
      .mockRejectedValueOnce(new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'x' }))
      .mockResolvedValueOnce(resp(['e1']));
    const { result } = renderHook(() => useCompanyDiary('v1', 0));
    await waitFor(() => expect(result.current.failure?.kind).toBe('api'));

    act(() => result.current.reload());
    // Reload clears the failure at once (back to the loading state) before it refetches.
    expect(result.current.failure).toBeNull();

    await waitFor(() => expect(result.current.items?.length).toBe(1));
    expect(result.current.failure).toBeNull();
  });

  it('records a non-API failure as other', async () => {
    mockList.mockRejectedValue(new Error('net'));
    const { result } = renderHook(() => useCompanyDiary('v1', 0));

    await waitFor(() => expect(result.current.failure).toEqual({ kind: 'other' }));
  });

  it('keeps the previous entries and total while a new revision loads', async () => {
    let release!: () => void;
    mockList.mockResolvedValueOnce(resp(['old'], 1));
    const { result, rerender } = renderHook(({ rev }) => useCompanyDiary('v1', rev), {
      initialProps: { rev: 0 },
    });
    await waitFor(() => expect(result.current.items?.[0]?.id).toBe('old'));
    mockList.mockReturnValueOnce(
      new Promise<Resp>((resolve) => {
        release = () => resolve(resp(['new', 'newer'], 2));
      }),
    );

    rerender({ rev: 1 });

    expect(result.current.items?.[0]?.id).toBe('old');
    expect(result.current.totalItems).toBe(1);
    await act(async () => release());
    await waitFor(() => expect(result.current.totalItems).toBe(2));
  });

  it('ignores a response and a failure that arrive after unmount', async () => {
    let release!: () => void;
    mockList.mockReturnValueOnce(
      new Promise<Resp>((resolve) => {
        release = () => resolve(resp(['late']));
      }),
    );
    const first = renderHook(() => useCompanyDiary('v1', 0));
    first.unmount();
    await act(async () => release());
    expect(first.result.current.items).toBeNull();

    let fail!: () => void;
    mockList.mockReturnValueOnce(
      new Promise<Resp>((_resolve, reject) => {
        fail = () => reject(new Error('late'));
      }),
    );
    const second = renderHook(() => useCompanyDiary('v1', 0));
    second.unmount();
    await act(async () => fail());
    expect(second.result.current.failure).toBeNull();
  });

  it('a revision reload does not clear an earlier failure until it succeeds', async () => {
    let release!: () => void;
    mockList.mockRejectedValueOnce(new Error('net'));
    const { result, rerender } = renderHook(({ rev }) => useCompanyDiary('v1', rev), {
      initialProps: { rev: 0 },
    });
    await waitFor(() => expect(result.current.failure).toEqual({ kind: 'other' }));
    mockList.mockReturnValueOnce(
      new Promise<Resp>((resolve) => {
        release = () => resolve(resp(['e1']));
      }),
    );

    rerender({ rev: 1 });

    expect(result.current.failure).toEqual({ kind: 'other' });
    await act(async () => release());
    await waitFor(() => expect(result.current.failure).toBeNull());
    expect(result.current.items?.map((e) => e.id)).toEqual(['e1']);
  });
});
