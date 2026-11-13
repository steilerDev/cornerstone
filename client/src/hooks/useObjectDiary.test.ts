/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { DiaryEntryListResponse, DiaryEntrySummary } from '@cornerstone/shared';
import { ApiClientError } from '../lib/apiClient.js';
import type * as DiaryApiTypes from '../lib/diaryApi.js';
import type * as HookModule from './useObjectDiary.js';

const mockListDiaryEntries = jest.fn<typeof DiaryApiTypes.listDiaryEntries>();
jest.unstable_mockModule('../lib/diaryApi.js', () => ({
  listDiaryEntries: mockListDiaryEntries,
}));

let Hook: typeof HookModule;

const entry = (id: string) => ({ id, title: id }) as unknown as DiaryEntrySummary;
const page = (ids: string[], totalItems = ids.length): DiaryEntryListResponse =>
  ({
    items: ids.map(entry),
    pagination: { page: 1, pageSize: 20, totalItems, totalPages: 1 },
  }) as DiaryEntryListResponse;

const DATES = { dateFrom: '2026-03-02', dateTo: '2026-03-06' };
const BASE = { automatic: false, status: 'saved' as const, page: 1, pageSize: 20 };

interface Over {
  vendorId?: string | null;
  areaId?: string | null;
  dates?: { dateFrom: string; dateTo: string } | null;
}
const input = (over: Over = {}) => ({
  subjectKey: 'obj-1',
  vendorId: over.vendorId ?? null,
  areaId: over.areaId ?? null,
  dates: over.dates === undefined ? DATES : over.dates,
});
const VENDOR = { vendorId: 'v-1' };
const AREA = { areaId: 'a-1' };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useObjectDiary', () => {
  beforeEach(async () => {
    mockListDiaryEntries.mockReset();
    mockListDiaryEntries.mockResolvedValue(page([]));
    if (!Hook) Hook = await import('./useObjectDiary.js');
  });

  describe('scope "none"', () => {
    it.each([
      ['no company and no area', {}],
      ['an area but no dates', { ...AREA, dates: null }],
    ])('requests nothing and counts 0 with %s', (_name, over) => {
      const { result } = renderHook(() => Hook.useObjectDiary(input(over as never), 0));
      expect(mockListDiaryEntries).not.toHaveBeenCalled();
      expect(result.current.primary).toEqual({ items: [], totalItems: 0, scope: 'none' });
      expect(result.current.count).toBe(0);
      expect(result.current.other).toBeNull();
      expect(result.current.failure).toBeNull();
    });
  });

  describe('company scope', () => {
    it('lists the company entries within the shown dates and reports the total as the count', async () => {
      mockListDiaryEntries.mockResolvedValue(page(['e1', 'e2'], 30));
      const { result } = renderHook(() => Hook.useObjectDiary(input(VENDOR), 0));
      expect(result.current.primary.items).toBeNull();
      expect(result.current.count).toBeNull();
      await waitFor(() => expect(result.current.primary.items).toHaveLength(2));
      expect(mockListDiaryEntries).toHaveBeenCalledTimes(1);
      expect(mockListDiaryEntries).toHaveBeenCalledWith({
        ...BASE,
        vendorId: 'v-1',
        dateFrom: '2026-03-02',
        dateTo: '2026-03-06',
      });
      expect(result.current.primary).toMatchObject({ scope: 'company', totalItems: 30 });
      expect(result.current.count).toBe(30);
      expect(result.current.other).toBeNull();
    });

    it('asks without a date range when the object has no dates', async () => {
      const { result } = renderHook(() =>
        Hook.useObjectDiary(input({ ...VENDOR, dates: null }), 0),
      );
      await waitFor(() => expect(result.current.primary.items).not.toBeNull());
      expect(mockListDiaryEntries).toHaveBeenCalledWith({ ...BASE, vendorId: 'v-1' });
      expect(result.current.other).toBeNull();
    });

    it('adds the area block with the entries the company block does not hold', async () => {
      mockListDiaryEntries
        .mockResolvedValueOnce(page(['e1', 'e2']))
        .mockResolvedValueOnce(page(['e2', 'o1', 'o2']));
      const { result } = renderHook(() => Hook.useObjectDiary(input({ ...VENDOR, ...AREA }), 0));
      expect(result.current.other).toEqual({ items: null });
      await waitFor(() => expect(result.current.other?.items).not.toBeNull());
      expect(mockListDiaryEntries).toHaveBeenCalledTimes(2);
      expect(mockListDiaryEntries).toHaveBeenCalledWith({
        ...BASE,
        areaId: 'a-1',
        dateFrom: '2026-03-02',
        dateTo: '2026-03-06',
      });
      expect(result.current.other?.items?.map((e) => e.id)).toEqual(['o1', 'o2']);
      expect(result.current.primary.items?.map((e) => e.id)).toEqual(['e1', 'e2']);
    });

    it('has no area block without an area, or without dates', async () => {
      const { result } = renderHook(() => Hook.useObjectDiary(input(VENDOR), 0));
      await waitFor(() => expect(result.current.primary.items).not.toBeNull());
      expect(result.current.other).toBeNull();
    });
  });

  describe('area scope', () => {
    it('lists the area entries within the dates, titled for the subject', async () => {
      mockListDiaryEntries.mockResolvedValue(page(['e1']));
      const { result } = renderHook(() => Hook.useObjectDiary(input(AREA), 0));
      await waitFor(() => expect(result.current.primary.items).toHaveLength(1));
      expect(mockListDiaryEntries).toHaveBeenCalledTimes(1);
      expect(mockListDiaryEntries).toHaveBeenCalledWith({
        ...BASE,
        areaId: 'a-1',
        dateFrom: '2026-03-02',
        dateTo: '2026-03-06',
      });
      expect(result.current.primary.scope).toBe('subject');
      expect(result.current.other).toBeNull();
    });
  });

  describe('reload', () => {
    it('keeps the previous entries on screen while a new revision loads', async () => {
      mockListDiaryEntries.mockResolvedValueOnce(page(['e1']));
      const { result, rerender } = renderHook(
        ({ revision }) => Hook.useObjectDiary(input(VENDOR), revision),
        { initialProps: { revision: 0 } },
      );
      await waitFor(() => expect(result.current.primary.items).toHaveLength(1));
      const next = deferred<DiaryEntryListResponse>();
      mockListDiaryEntries.mockReturnValueOnce(next.promise);
      rerender({ revision: 1 });
      expect(result.current.primary.items?.map((e) => e.id)).toEqual(['e1']);
      await act(async () => {
        next.resolve(page(['e1', 'e3']));
        await next.promise;
      });
      expect(result.current.primary.items?.map((e) => e.id)).toEqual(['e1', 'e3']);
    });

    it('reloads when the dates change', async () => {
      const { result, rerender } = renderHook(
        ({ end }) =>
          Hook.useObjectDiary(
            input({ ...VENDOR, dates: { dateFrom: '2026-03-02', dateTo: end } }),
            0,
          ),
        { initialProps: { end: '2026-03-06' } },
      );
      await waitFor(() => expect(result.current.primary.items).not.toBeNull());
      rerender({ end: '2026-03-10' });
      await waitFor(() => expect(mockListDiaryEntries).toHaveBeenCalledTimes(2));
      expect(mockListDiaryEntries).toHaveBeenLastCalledWith(
        expect.objectContaining({ dateTo: '2026-03-10' }),
      );
    });

    it('records a failure as data; reload() clears it and tries again', async () => {
      mockListDiaryEntries.mockRejectedValueOnce(
        new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'x' }),
      );
      const { result } = renderHook(() => Hook.useObjectDiary(input(VENDOR), 0));
      await waitFor(() =>
        expect(result.current.failure).toEqual({
          kind: 'api',
          code: 'INTERNAL_ERROR',
          notFound: false,
        }),
      );
      expect(result.current.primary.items).toBeNull();
      mockListDiaryEntries.mockResolvedValueOnce(page(['e1']));
      act(() => result.current.reload());
      expect(result.current.failure).toBeNull();
      await waitFor(() => expect(result.current.primary.items).toHaveLength(1));
      expect(mockListDiaryEntries).toHaveBeenCalledTimes(2);
    });

    it('records a non-API failure', async () => {
      mockListDiaryEntries.mockRejectedValueOnce(new Error('down'));
      const { result } = renderHook(() => Hook.useObjectDiary(input(VENDOR), 0));
      await waitFor(() => expect(result.current.failure).toEqual({ kind: 'other' }));
    });
  });

  describe('cancellation', () => {
    it('ignores a response that arrives after unmount', async () => {
      const first = deferred<DiaryEntryListResponse>();
      mockListDiaryEntries.mockReturnValueOnce(first.promise);
      const { result, unmount } = renderHook(() => Hook.useObjectDiary(input(VENDOR), 0));
      unmount();
      await act(async () => {
        first.resolve(page(['e1']));
        await first.promise;
      });
      expect(result.current.primary.items).toBeNull();
    });

    it('ignores a failure that arrives after unmount', async () => {
      const first = deferred<DiaryEntryListResponse>();
      mockListDiaryEntries.mockReturnValueOnce(first.promise);
      const { result, unmount } = renderHook(() => Hook.useObjectDiary(input(VENDOR), 0));
      unmount();
      await act(async () => {
        first.reject(new Error('late'));
        await first.promise.catch(() => undefined);
      });
      expect(result.current.failure).toBeNull();
    });
  });
});
