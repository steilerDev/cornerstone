/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { renderHook, waitFor } from '@testing-library/react';
import type * as HookModule from './useCaptureSuggestions.js';
import type * as DiaryApiTypes from '../../../lib/diaryApi.js';
import type * as WorkItemsApiTypes from '../../../lib/workItemsApi.js';

const mockListDiaryEntries = jest.fn<typeof DiaryApiTypes.listDiaryEntries>();
const mockListWorkItems = jest.fn<typeof WorkItemsApiTypes.listWorkItems>();

jest.unstable_mockModule('../../../lib/diaryApi.js', () => ({
  listDiaryEntries: mockListDiaryEntries,
}));
jest.unstable_mockModule('../../../lib/workItemsApi.js', () => ({
  listWorkItems: mockListWorkItems,
}));

let useCaptureSuggestions: typeof HookModule.useCaptureSuggestions;

const ENTRIES = [{ id: 'e1', title: 'Screed' }];

beforeEach(async () => {
  jest.resetAllMocks();
  mockListDiaryEntries.mockResolvedValue({ items: ENTRIES } as never);
  mockListWorkItems.mockResolvedValue({
    items: [
      { assignedVendor: { id: 'v1', name: 'Alpha' } },
      { assignedVendor: { id: 'v2', name: 'Beta' } },
      { assignedVendor: { id: 'v2', name: 'Beta' } },
    ],
  } as never);
  if (!useCaptureSuggestions) {
    ({ useCaptureSuggestions } = await import('./useCaptureSuggestions.js'));
  }
});

describe('useCaptureSuggestions', () => {
  it('loads the latest saved manual entries once on mount', async () => {
    const { result, rerender } = renderHook(({ floor }) => useCaptureSuggestions(floor), {
      initialProps: { floor: null as string | null },
    });

    await waitFor(() => expect(result.current.entries).toEqual(ENTRIES));
    rerender({ floor: null });

    expect(mockListDiaryEntries).toHaveBeenCalledTimes(1);
    expect(mockListDiaryEntries).toHaveBeenCalledWith({
      status: 'saved',
      automatic: false,
      pageSize: 50,
    });
    expect(mockListWorkItems).not.toHaveBeenCalled();
    expect(result.current.floorVendors).toEqual([]);
  });

  it('loads the floor work items and ranks their companies by work', async () => {
    const { result } = renderHook(() => useCaptureSuggestions('ground'));

    await waitFor(() => expect(result.current.floorVendors).toHaveLength(2));

    expect(mockListWorkItems).toHaveBeenCalledWith(
      { areaId: 'ground', pageSize: 100 },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(result.current.floorVendors.map((v) => v.id)).toEqual(['v2', 'v1']);
  });

  it('fetches again for another floor and hides the previous floor meanwhile', async () => {
    const { result, rerender } = renderHook(({ floor }) => useCaptureSuggestions(floor), {
      initialProps: { floor: 'ground' as string | null },
    });
    await waitFor(() => expect(result.current.floorVendors).toHaveLength(2));
    mockListWorkItems.mockReturnValue(new Promise(() => {}));

    rerender({ floor: 'upper' });

    expect(result.current.floorVendors).toEqual([]);
    expect(mockListWorkItems).toHaveBeenCalledTimes(2);
  });

  it('drops the floor companies when the area is cleared', async () => {
    const { result, rerender } = renderHook(({ floor }) => useCaptureSuggestions(floor), {
      initialProps: { floor: 'ground' as string | null },
    });
    await waitFor(() => expect(result.current.floorVendors).toHaveLength(2));

    rerender({ floor: null });

    expect(result.current.floorVendors).toEqual([]);
  });

  it('shows no suggestions and no error when the requests fail', async () => {
    mockListDiaryEntries.mockRejectedValue(new Error('offline'));
    mockListWorkItems.mockRejectedValue(new Error('offline'));

    const { result } = renderHook(() => useCaptureSuggestions('ground'));
    await waitFor(() => expect(mockListWorkItems).toHaveBeenCalled());
    await Promise.resolve();

    expect(result.current.entries).toEqual([]);
    expect(result.current.floorVendors).toEqual([]);
  });

  it('ignores a response that arrives after unmount', async () => {
    let resolveList: (value: never) => void = () => {};
    mockListDiaryEntries.mockReturnValue(
      new Promise((resolve) => (resolveList = resolve as never)),
    );
    const { result, unmount } = renderHook(() => useCaptureSuggestions(null));

    unmount();
    resolveList({ items: ENTRIES } as never);
    await Promise.resolve();

    expect(result.current.entries).toEqual([]);
  });
});
